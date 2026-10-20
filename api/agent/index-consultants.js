// POST /api/agent/index-consultants?page=1
//
// Lit une page de consultants (ressources) Boond et met à jour leur fiche dans
// Supabase. Make l'appelle chaque nuit, page après page, tant que `page_suivante`
// n'est pas null. Une page tient dans la limite de 300 s de Vercel.
//
// Pour chaque consultant :
// - disponibilité calculée sans IA depuis ses missions Boond (intercontrat, fin de mission) ;
// - fiche métier (famille, stack, séniorité…) extraite par Claude, seulement si
//   les données Boond ont changé depuis la dernière nuit (empreinte source_hash).
import crypto from 'crypto'
import { boondFromEnv } from '../boond-lib.js'
import { supabaseFromEnv, pgList } from '../_lib/supabase.js'
import { claudeJSON } from '../_lib/claude.js'
import { requireAgentCaller } from '../_lib/agent-auth.js'
import { FAMILLES, FAMILLE_IDS, isFamille, familleDepuisTitre } from '../_lib/metiers.js'
import { SENIORITES } from '../_lib/scoring.js'

const PAR_PAGE = Number(process.env.AGENT_INDEX_PAGE_SIZE || 12)
const EN_PARALLELE = 4

const htmlToText = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

// Attributs Boond → texte lisible, sans les champs techniques ni les coordonnées.
const IGNORES = /^(id|.*Id|.*Ids|email\d?|phone\d?|mobile|fax|address|postcode|iban|bic|socialSecurity|birth|nationality|thumbnail|.*Url|.*Token|creationDate|updateDate|rights?)$/i
function attrsToText(attrs) {
  const out = []
  for (const [k, v] of Object.entries(attrs || {})) {
    if (IGNORES.test(k) || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    out.push(`${k}: ${htmlToText(val)}`)
  }
  return out.join('\n')
}

const iso = (d) => (d ? String(d).slice(0, 10) : null)
const today = () => new Date().toISOString().slice(0, 10)

// Missions Boond → intercontrat / fin de la mission en cours.
function disponibilite(deliveries) {
  const t = today()
  const missions = deliveries.map(d => ({ debut: iso(d.attributes?.startDate), fin: iso(d.attributes?.endDate) }))
  const enCours = missions.filter(m => (!m.debut || m.debut <= t) && (!m.fin || m.fin >= t))
  const prochaine = missions.some(m => m.debut && m.debut > t && (new Date(m.debut) - new Date(t)) / 86400000 <= 7)
  if (!enCours.length) return { intercontrat: !prochaine, fin_mission: null }
  // Une mission sans date de fin = pas de fin connue
  if (enCours.some(m => !m.fin)) return { intercontrat: false, fin_mission: null }
  return { intercontrat: false, fin_mission: enCours.map(m => m.fin).sort().at(-1) }
}

// Champ de disponibilité saisi dans Boond : date, ou « immédiate ».
function dispoSaisie(attrs) {
  const v = attrs?.availability ?? attrs?.available ?? attrs?.availabilityDate
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return iso(v)
  return /imm[eé]diat|immediate|^0$/i.test(String(v)) ? today() : null
}

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] })
const FICHE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['famille', 'familles_secondaires', 'stack', 'seniorite', 'annees_experience', 'secteurs', 'langues', 'localisation', 'mobilite', 'tjm', 'resume'],
  properties: {
    famille: nullable({ type: 'string', enum: FAMILLE_IDS }),
    familles_secondaires: { type: 'array', items: { type: 'string', enum: FAMILLE_IDS } },
    stack: { type: 'array', items: { type: 'string' } },
    seniorite: nullable({ type: 'string', enum: SENIORITES }),
    annees_experience: nullable({ type: 'integer' }),
    secteurs: { type: 'array', items: { type: 'string' } },
    langues: { type: 'array', items: { type: 'string' } },
    localisation: nullable({ type: 'string' }),
    mobilite: { type: 'array', items: { type: 'string' } },
    tjm: nullable({ type: 'integer' }),
    resume: { type: 'string' }
  }
}

const SYSTEM = `Tu lis la fiche Boond d'un consultant d'une ESN et tu en tires une fiche structurée pour le matching avec des offres de mission.

Familles de métier possibles (identifiant : libellé) :
${FAMILLE_IDS.map(f => `- ${f} : ${FAMILLES[f].label}`).join('\n')}

Règles :
- famille : le métier principal, celui sur lequel on le positionnerait aujourd'hui. Juge sur les dernières missions, pas sur un poste ancien. null si la personne n'est pas un consultant facturable (commercial, RH, direction…).
- familles_secondaires : seulement une famille où il a une vraie expérience récente (au moins une mission significative). Jamais par simple proximité. Souvent vide.
- stack : technologies, outils et méthodes réellement pratiqués, noms courts et usuels (« React », « AWS », « Kubernetes », « SAFe »). 25 au maximum, les plus récents d'abord.
- seniorite : junior (< 3 ans), confirme (3-6 ans), senior (7-12 ans), expert (> 12 ans ou expertise reconnue).
- tjm : tarif journalier de vente en euros s'il figure dans les données, sinon null.
- resume : 2 phrases factuelles, sans superlatif.
- N'invente rien : une information absente vaut null ou une liste vide.`

async function fiche(boond, id) {
  const [info, tech, deliveries] = await Promise.all([
    boond.get(`/resources/${id}/information`),
    boond.get(`/resources/${id}/technical-data`),
    boond.get(`/resources/${id}/deliveries?maxResults=50`)
  ])
  const ai = info.body?.data?.attributes || {}
  const at = tech.body?.data?.attributes || {}
  const source = `INFORMATIONS\n${attrsToText(ai)}\n\nDONNÉES TECHNIQUES\n${attrsToText(at)}`
  return { ai, at, source, ...disponibilite(deliveries.body?.data || []), disponible_le: dispoSaisie(ai) }
}

async function indexer(boond, db, resource, existants) {
  const id = String(resource.id)
  const a = resource.attributes || {}
  const f = await fiche(boond, id)
  const hash = crypto.createHash('sha256').update(f.source).digest('hex')
  const avant = existants.get(id)

  const base = {
    boond_id: id,
    nom: `${a.firstName || f.ai.firstName || ''} ${a.lastName || f.ai.lastName || ''}`.trim() || `Ressource ${id}`,
    titre: a.title || f.at.title || f.ai.title || null,
    etat_boond: a.state != null ? String(a.state) : null,
    intercontrat: f.intercontrat,
    fin_mission: f.fin_mission,
    disponible_le: f.disponible_le,
    maj_boond_le: new Date().toISOString()
  }
  if (avant && avant.source_hash === hash) {
    await db.upsert('consultants', [base], 'boond_id')
    return 'inchange'
  }

  const x = await claudeJSON({ system: SYSTEM, user: f.source.slice(0, 60000), schema: FICHE_SCHEMA, effort: 'low' })
  const famille = isFamille(x.famille) ? x.famille : familleDepuisTitre(base.titre)
  await db.upsert('consultants', [{
    ...base,
    famille,
    familles_secondaires: (x.familles_secondaires || []).filter(s => isFamille(s) && s !== famille),
    stack: x.stack || [], seniorite: x.seniorite, annees_experience: x.annees_experience,
    secteurs: x.secteurs || [], langues: x.langues || [], localisation: x.localisation,
    mobilite: x.mobilite || [], tjm: x.tjm, resume: x.resume,
    source_hash: hash, indexe_le: new Date().toISOString()
  }], 'boond_id')
  return 'mis_a_jour'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAgentCaller(req, res)) return

  const boond = boondFromEnv()
  const db = supabaseFromEnv()
  if (!boond) return res.status(500).json({ error: 'Config Boond manquante' })
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  const page = Math.max(1, parseInt(req.query?.page || req.body?.page || '1', 10) || 1)
  const etats = String(process.env.BOOND_RESOURCE_STATES || '').split(',').map(s => s.trim()).filter(Boolean)

  try {
    const list = await boond.get(`/resources?${new URLSearchParams({ page: String(page), maxResults: String(PAR_PAGE) })}`)
    if (list.status !== 200) return res.status(502).json({ error: `Boond : ${list.error || list.status}` })
    const total = Number(list.body?.meta?.totals?.rows ?? NaN)
    let rows = list.body?.data || []
    const lus = rows.length
    if (etats.length) rows = rows.filter(r => etats.includes(String(r.attributes?.state)))

    const ids = rows.map(r => String(r.id))
    const existants = new Map(ids.length
      ? (await db.select('consultants', `select=boond_id,source_hash&boond_id=in.(${pgList(ids)})`)).map(c => [c.boond_id, c])
      : [])

    const compte = { mis_a_jour: 0, inchange: 0 }
    const erreurs = []
    for (let i = 0; i < rows.length; i += EN_PARALLELE) {
      const lot = rows.slice(i, i + EN_PARALLELE)
      const res = await Promise.allSettled(lot.map(r => indexer(boond, db, r, existants)))
      res.forEach((r, j) => r.status === 'fulfilled'
        ? compte[r.value]++
        : erreurs.push({ boond_id: String(lot[j].id), erreur: r.reason?.message || String(r.reason) }))
    }

    const fini = lus < PAR_PAGE || (Number.isFinite(total) && page * PAR_PAGE >= total)
    return res.status(200).json({ page, lus, ...compte, erreurs, page_suivante: fini ? null : page + 1 })
  } catch (e) {
    console.error('index-consultants', e)
    return res.status(500).json({ error: e.message })
  }
}
