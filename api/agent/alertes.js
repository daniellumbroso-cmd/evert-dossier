// GET /api/agent/alertes
//
// Étape 4 : les moments clés à traiter, pour le tableau de bord et pour Make
// (résumé quotidien par mail ou Slack).
// - intercontrats : consultants sans mission en cours ;
// - fins de mission dans les 30 jours, avec le palier J-30 / J-15 ;
// - pour chacun, les offres des 30 derniers jours qui lui correspondent
//   (même filtre métier et même score que le matching, sans appel à Claude) ;
// - matchs_forts : matchs à 80+ créés depuis 24 h et pas encore traités.
import { supabaseFromEnv } from '../_lib/supabase.js'
import { requireAgentCaller } from '../_lib/agent-auth.js'
import { labelFamille } from '../_lib/metiers.js'
import { scorer } from '../_lib/scoring.js'

const HORIZON_JOURS = 30
const SEUIL_FORT = 80
const OFFRES_PAR_CONSULTANT = 3

const jour = (d) => new Date(d).toISOString().slice(0, 10)
const ecartJours = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAgentCaller(req, res)) return
  const db = supabaseFromEnv()
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  try {
    const today = new Date()
    const t = jour(today)
    const limite = jour(Date.now() + HORIZON_JOURS * 86400000)
    const depuis30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const depuis24h = new Date(Date.now() - 86400000).toISOString()

    const [consultants, offres, forts, base] = await Promise.all([
      db.select('consultants', `select=*&famille=not.is.null&or=(intercontrat.eq.true,and(fin_mission.gte.${t},fin_mission.lte.${limite}))`),
      db.select('offres', `select=id,titre,famille,analyse_ia,source,lien,recue_le&recue_le=gte.${depuis30}&statut=neq.archivee&analyse_ia=not.is.null`),
      db.select('matchs', `select=id,score,offre_id,boond_id,offres(titre,source,lien),consultants(nom)&cree_le=gte.${depuis24h}&score=gte.${SEUIL_FORT}&statut=eq.a_valider&order=score.desc`),
      // État de la base : vide tant que le premier remplissage n'a pas eu lieu
      db.select('consultants', 'select=famille,maj_boond_le&order=maj_boond_le.desc')
    ])

    const suggestions = (c) => offres
      .map(o => ({ o, s: scorer(c, { ...o.analyse_ia, famille: o.famille }, today) }))
      .filter(x => x.s)
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, OFFRES_PAR_CONSULTANT)
      .map(({ o, s }) => ({ offre_id: o.id, titre: o.titre, source: o.source, lien: o.lien, score: s.score }))

    const fiche = (c) => ({
      boond_id: c.boond_id, nom: c.nom, titre: c.titre, famille: labelFamille(c.famille),
      boond_url: `https://ui.boondmanager.com/resources/${c.boond_id}/information`,
      offres: suggestions(c)
    })

    const intercontrats = consultants.filter(c => c.intercontrat).map(fiche)
    const finsMission = consultants
      .filter(c => !c.intercontrat && c.fin_mission)
      .map(c => {
        const jours = ecartJours(c.fin_mission, t)
        return { ...fiche(c), fin_mission: c.fin_mission, jours, palier: jours <= 15 ? 'J-15' : 'J-30' }
      })
      .sort((a, b) => a.jours - b.jours)

    return res.status(200).json({
      date: t,
      base: { consultants: base.length, avec_metier: base.filter(c => c.famille).length, derniere_maj: base[0]?.maj_boond_le || null },
      intercontrats,
      fins_mission: finsMission,
      matchs_forts: forts.map(m => ({
        match_id: m.id, score: m.score, offre_id: m.offre_id, offre: m.offres?.titre, source: m.offres?.source,
        lien: m.offres?.lien, consultant: m.consultants?.nom
      })),
      // Phrase prête à poster (Make → Slack ou mail)
      resume: `${intercontrats.length} consultant(s) en intercontrat, ${finsMission.filter(f => f.palier === 'J-15').length} fin(s) de mission sous 15 jours, ` +
        `${finsMission.filter(f => f.palier === 'J-30').length} sous 30 jours, ${forts.length} match(s) à ${SEUIL_FORT}+ depuis hier.`
    })
  } catch (e) {
    console.error('alertes', e)
    return res.status(500).json({ error: e.message })
  }
}
