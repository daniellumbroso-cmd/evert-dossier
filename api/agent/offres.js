// /api/agent/offres
//
// GET  ?periode=24h|7j|30j[&source=collective]  → offres reçues sur la période, avec leur meilleur match
// GET  ?id=<offre>                              → une offre et tout son classement
// POST { action: 'statut', match_id, statut }   → valider / écarter un match (a_valider, valide, ecarte)
// POST { action: 'archiver', offre_id }         → retirer une offre de la liste
// POST { action: 'ne_plus_contacter', email, raison } → liste RGPD (Make : réponse « STOP »)
import { supabaseFromEnv } from '../_lib/supabase.js'
import { requireAgentCaller } from '../_lib/agent-auth.js'
import { labelFamille } from '../_lib/metiers.js'

const PERIODES = { '24h': 1, '7j': 7, '30j': 30 }
const SOURCES = ['manuel', 'boond', 'collective', 'email']
const STATUTS = ['a_valider', 'valide', 'ecarte']

// Ligne matchs + consultant embarqué → format attendu par le front (même que match-offer).
export function matchVersResultat(m) {
  const c = m.consultants || {}
  return {
    match_id: m.id, statut: m.statut, boond_id: m.boond_id, nom: c.nom, titre: c.titre, famille: c.famille,
    lien_famille: m.detail?.lien || null, intercontrat: c.intercontrat, fin_mission: c.fin_mission,
    score: m.score, score_calcule: m.score_calcule, detail: m.detail, justification: m.justification,
    ecarts: m.ecarts || [], draft_id: m.draft_id, pousse_a: m.pousse_a, pousse_le: m.pousse_le,
    boond_url: `https://ui.boondmanager.com/resources/${m.boond_id}/information`
  }
}

const CHAMPS_CONSULTANT = 'consultants(nom,titre,famille,intercontrat,fin_mission)'

export default async function handler(req, res) {
  const caller = requireAgentCaller(req, res)
  if (!caller) return
  const db = supabaseFromEnv()
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  try {
    if (req.method === 'GET') {
      const id = req.query?.id
      if (id) {
        const [offre] = await db.select('offres', `select=*&id=eq.${encodeURIComponent(id)}`)
        if (!offre) return res.status(404).json({ error: 'Offre introuvable' })
        const matchs = await db.select('matchs', `select=*,${CHAMPS_CONSULTANT}&offre_id=eq.${offre.id}&order=score.desc`)
        return res.status(200).json({ offre: { ...offre, famille_label: labelFamille(offre.famille) }, resultats: matchs.map(matchVersResultat) })
      }

      const jours = PERIODES[req.query?.periode] || 7
      const depuis = new Date(Date.now() - jours * 86400000).toISOString()
      const filtres = [`recue_le=gte.${depuis}`, 'statut=neq.archivee']
      if (SOURCES.includes(req.query?.source)) filtres.push(`source=eq.${req.query.source}`)
      const offres = await db.select('offres',
        `select=id,source,titre,famille,entreprise,lieu,lien,recue_le,statut,matchs(id,score,statut,boond_id,${CHAMPS_CONSULTANT})` +
        `&${filtres.join('&')}&order=recue_le.desc&limit=200`)
      return res.status(200).json({
        periode: Object.keys(PERIODES).find(k => PERIODES[k] === jours),
        offres: offres.map(o => {
          const ms = (o.matchs || []).filter(m => m.statut !== 'ecarte').sort((a, b) => b.score - a.score)
          return {
            id: o.id, source: o.source, titre: o.titre, famille: o.famille, famille_label: labelFamille(o.famille),
            entreprise: o.entreprise, lieu: o.lieu, lien: o.lien, recue_le: o.recue_le, statut: o.statut,
            nb_matchs: ms.length,
            meilleur: ms[0] ? { nom: ms[0].consultants?.nom, score: ms[0].score } : null
          }
        })
      })
    }

    if (req.method === 'POST') {
      const b = req.body || {}
      const qui = caller.email || 'make'

      if (b.action === 'statut') {
        if (!b.match_id || !STATUTS.includes(b.statut)) return res.status(400).json({ error: 'match_id et statut (a_valider, valide, ecarte) requis' })
        const [m] = await db.update('matchs', `id=eq.${encodeURIComponent(b.match_id)}`,
          { statut: b.statut, statut_par: qui, statut_le: new Date().toISOString() })
        if (!m) return res.status(404).json({ error: 'Match introuvable' })
        return res.status(200).json({ ok: true, match_id: m.id, statut: m.statut })
      }

      if (b.action === 'archiver') {
        if (!b.offre_id) return res.status(400).json({ error: 'offre_id requis' })
        await db.update('offres', `id=eq.${encodeURIComponent(b.offre_id)}`, { statut: 'archivee' })
        return res.status(200).json({ ok: true })
      }

      if (b.action === 'ne_plus_contacter') {
        const email = String(b.email || '').trim().toLowerCase()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' })
        await db.upsert('ne_plus_contacter', [{ email, raison: String(b.raison || `Ajouté par ${qui}`).slice(0, 300) }], 'email')
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: 'Action inconnue' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('offres', e)
    return res.status(500).json({ error: e.message })
  }
}
