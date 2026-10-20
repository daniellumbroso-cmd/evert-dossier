// POST /api/agent/match-offer
// Corps : { texte } (offre collée), { opportunity_id } (besoin Boond) ou
//         { offre_id } (offre déjà en base, ex. reçue de Collective),
//         + optionnels { famille } pour forcer la famille, { source, source_ref } (Make).
//
// Classement en trois temps :
// 1. Claude lit l'offre et la structure (famille, compétences, démarrage…) ;
// 2. filtre strict par famille de métier et disponibilité, puis score pondéré (scoring.js) ;
// 3. Claude relit les 10 meilleurs avec leur fiche et donne un score final,
//    une justification et les écarts au besoin.
// Le résultat est enregistré (offres, matchs) en statut « à valider ».
import { boondFromEnv } from '../boond-lib.js'
import { supabaseFromEnv, pgList } from '../_lib/supabase.js'
import { claudeJSON } from '../_lib/claude.js'
import { requireAgentCaller } from '../_lib/agent-auth.js'
import { FAMILLES, FAMILLE_IDS, isFamille, labelFamille, famillesCandidates, familleDepuisTitre } from '../_lib/metiers.js'
import { classer, SENIORITES } from '../_lib/scoring.js'

const A_RELIRE = 10

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] })
const OFFRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titre', 'famille', 'competences_requises', 'competences_bonus', 'seniorite', 'date_demarrage', 'localisation', 'full_remote', 'tjm_max', 'secteur', 'client'],
  properties: {
    titre: { type: 'string' },
    famille: nullable({ type: 'string', enum: FAMILLE_IDS }),
    competences_requises: { type: 'array', items: { type: 'string' } },
    competences_bonus: { type: 'array', items: { type: 'string' } },
    seniorite: nullable({ type: 'string', enum: SENIORITES }),
    date_demarrage: nullable({ type: 'string', format: 'date' }),
    localisation: nullable({ type: 'string' }),
    full_remote: { type: 'boolean' },
    tjm_max: nullable({ type: 'integer' }),
    secteur: nullable({ type: 'string' }),
    client: nullable({ type: 'string' })
  }
}

const RELECTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['classement'],
  properties: {
    classement: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['boond_id', 'score', 'justification', 'ecarts'],
        properties: {
          boond_id: { type: 'string' },
          score: { type: 'integer' },
          justification: { type: 'string' },
          ecarts: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
}

const htmlToText = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function texteBesoinBoond(boond, id) {
  const [opp, actions] = await Promise.all([
    boond.get(`/opportunities/${encodeURIComponent(id)}/information`),
    boond.get(`/opportunities/${encodeURIComponent(id)}/actions?maxResults=5`)
  ])
  const a = opp.body?.data?.attributes
  if (!a) throw new Error(`Besoin Boond ${id} introuvable`)
  const notes = (actions.body?.data || []).map(x => htmlToText(x.attributes?.text?.html ?? x.attributes?.text)).filter(Boolean)
  return [
    `Titre : ${a.title || ''}`,
    a.reference && `Référence : ${a.reference}`,
    a.startDate && `Démarrage : ${a.startDate}`,
    a.place && `Lieu : ${a.place}`,
    a.description && `Description : ${htmlToText(a.description)}`,
    a.criteria && `Critères : ${htmlToText(a.criteria)}`,
    a.skills && `Compétences : ${htmlToText(a.skills)}`,
    notes.length && `Notes :\n${notes.join('\n---\n')}`
  ].filter(Boolean).join('\n')
}

const SYSTEM_OFFRE = `Tu structures une offre de mission (appel d'offres, besoin client) pour une ESN.
Familles de métier (identifiant : libellé) :
${FAMILLE_IDS.map(f => `- ${f} : ${FAMILLES[f].label}`).join('\n')}

- famille : le métier recherché, d'après les missions décrites et pas seulement l'intitulé.
- competences_requises : les compétences indispensables explicitement demandées, noms courts. competences_bonus : les « appréciées », « un plus ».
- date_demarrage au format AAAA-MM-JJ ; « ASAP » = la date du jour indiquée.
- tjm_max en euros si un budget est indiqué.
- N'invente rien : une information absente vaut null ou une liste vide.`

const SYSTEM_RELECTURE = `Tu es chargé d'affaires dans une ESN. On te donne une offre et des consultants présélectionnés par un premier score automatique (même famille de métier, disponibles à temps).
Relis chaque profil face à l'offre et donne :
- score : 0 à 100, ton adéquation réelle (missions comparables, technologies, séniorité, secteur, disponibilité). Sois exigeant : 80+ = on le pousse sans hésiter.
- justification : 1 à 2 phrases concrètes, pourquoi il colle.
- ecarts : ce qui manque ou pose question par rapport à l'offre (liste vide si rien).
Ne juge que sur les informations fournies. Renvoie tous les consultants reçus, avec leur boond_id exact.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const caller = requireAgentCaller(req, res)
  if (!caller) return

  const db = supabaseFromEnv()
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  const body = req.body || {}
  try {
    // 1. Texte de l'offre
    let texte = String(body.texte || '').trim()
    let source = ['manuel', 'boond', 'collective', 'email'].includes(body.source) ? body.source : 'manuel'
    let sourceRef = body.source_ref ? String(body.source_ref) : null
    let existante = null
    if (body.offre_id) {
      [existante] = await db.select('offres', `select=id,texte,source,source_ref&id=eq.${encodeURIComponent(body.offre_id)}`)
      if (!existante) return res.status(404).json({ error: 'Offre introuvable' })
      texte = existante.texte
    } else if (body.opportunity_id) {
      const boond = boondFromEnv()
      if (!boond) return res.status(500).json({ error: 'Config Boond manquante' })
      texte = await texteBesoinBoond(boond, String(body.opportunity_id))
      source = 'boond'
      sourceRef = String(body.opportunity_id)
    }
    if (texte.length < 30) return res.status(400).json({ error: "Texte de l'offre trop court" })

    // 2. Offre structurée
    const jour = new Date().toISOString().slice(0, 10)
    const offre = await claudeJSON({ system: SYSTEM_OFFRE, user: `Date du jour : ${jour}\n\n${texte.slice(0, 30000)}`, schema: OFFRE_SCHEMA, effort: 'low' })
    if (isFamille(body.famille)) offre.famille = body.famille
    if (!isFamille(offre.famille)) offre.famille = familleDepuisTitre(offre.titre)
    if (!offre.famille) return res.status(422).json({ error: "Impossible de déterminer le métier de l'offre : choisissez la famille à la main", offre })

    // 3. Présélection en base : familles compatibles, ou famille secondaire exacte
    const familles = famillesCandidates(offre.famille)
    const pool = await db.select('consultants',
      `select=*&or=(famille.in.(${pgList(familles)}),familles_secondaires.cs.{${offre.famille}})`)
    const classes = classer(pool, offre)
    const top = classes.slice(0, A_RELIRE)

    // 4. Relecture par Claude
    let relu = new Map()
    if (top.length) {
      const profils = top.map(r => ({
        boond_id: r.consultant.boond_id, titre: r.consultant.titre, famille: labelFamille(r.consultant.famille),
        lien_famille: r.lien, seniorite: r.consultant.seniorite, annees: r.consultant.annees_experience,
        stack: r.consultant.stack, secteurs: r.consultant.secteurs, langues: r.consultant.langues,
        localisation: r.consultant.localisation, tjm: r.consultant.tjm,
        disponibilite: r.consultant.intercontrat ? 'intercontrat (disponible)' : r.consultant.fin_mission ? `fin de mission le ${r.consultant.fin_mission}` : 'inconnue',
        resume: r.consultant.resume, score_automatique: r.score
      }))
      const out = await claudeJSON({
        system: SYSTEM_RELECTURE,
        user: `OFFRE\n${JSON.stringify(offre, null, 1)}\n\nTEXTE D'ORIGINE\n${texte.slice(0, 8000)}\n\nCONSULTANTS\n${JSON.stringify(profils, null, 1)}`,
        schema: RELECTURE_SCHEMA,
        effort: 'medium'
      })
      relu = new Map((out.classement || []).map(x => [String(x.boond_id), x]))
    }

    const resultats = top.map(r => {
      const x = relu.get(r.consultant.boond_id)
      return {
        boond_id: r.consultant.boond_id,
        nom: r.consultant.nom,
        titre: r.consultant.titre,
        famille: r.consultant.famille,
        lien_famille: r.lien,
        intercontrat: r.consultant.intercontrat,
        fin_mission: r.consultant.fin_mission,
        score: x ? Math.max(0, Math.min(100, x.score)) : r.score,
        score_calcule: r.score,
        detail: r.detail,
        justification: x?.justification || '',
        ecarts: x?.ecarts?.length ? x.ecarts : r.competences_manquantes.map(s => `Pas de ${s} dans sa fiche`),
        boond_url: `https://ui.boondmanager.com/resources/${r.consultant.boond_id}/information`
      }
    }).sort((a, b) => b.score - a.score)

    // 5. Enregistrement (offre + matchs à valider)
    const ligneOffre = { titre: offre.titre, famille: offre.famille, analyse: offre, statut: 'matchee' }
    const [saved] = existante
      ? await db.update('offres', `id=eq.${existante.id}`, ligneOffre)
      : sourceRef
        ? await db.upsert('offres', [{ ...ligneOffre, source, source_ref: sourceRef, texte, cree_par: caller.email || 'make' }], 'source,source_ref')
        : await db.insert('offres', [{ ...ligneOffre, source, texte, cree_par: caller.email || 'make' }])
    // Une offre relancée remplace son ancien classement, sauf les matchs déjà traités
    await db.remove('matchs', `offre_id=eq.${saved.id}&statut=eq.a_valider`)
    if (resultats.length) {
      const lignes = await db.upsert('matchs', resultats.map((r, i) => ({
        offre_id: saved.id, boond_id: r.boond_id, rang: i + 1, score: r.score, score_calcule: r.score_calcule,
        detail: { ...r.detail, lien: r.lien_famille }, justification: r.justification, ecarts: r.ecarts
      })), 'offre_id,boond_id')
      const parId = new Map((lignes || []).map(m => [m.boond_id, m]))
      for (const r of resultats) {
        const m = parId.get(r.boond_id)
        r.match_id = m?.id || null
        r.statut = m?.statut || 'a_valider'
      }
    }

    return res.status(200).json({
      offre_id: saved.id,
      offre: { ...offre, famille_label: labelFamille(offre.famille), familles_acceptees: familles.map(labelFamille) },
      preselectionnes: pool.length,
      eligibles: classes.length,
      resultats
    })
  } catch (e) {
    console.error('match-offer', e)
    return res.status(500).json({ error: e.message })
  }
}
