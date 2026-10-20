// Score d'adéquation consultant ↔ offre, sur 100, calculé sans IA.
//
// Il ne s'applique qu'aux consultants qui ont passé le filtre strict de famille
// (lienFamille ≠ null). Claude relit ensuite les meilleurs (match-offer.js).
//
// Poids :
//   compétences  40  part des compétences requises présentes (les « bonus » comptent moitié)
//   disponibilité 25  intercontrat ou libre avant le démarrage = plein ; jusqu'à 30 j de retard = dégressif
//   famille      15  exacte 15, secondaire 11, compatible 8
//   séniorité    10  même niveau 10, un cran d'écart 5
//   localisation  5  même ville / région ou offre en full remote
//   TJM           5  sous le plafond, ou plafond inconnu
import { lienFamille } from './metiers.js'

export const SENIORITES = ['junior', 'confirme', 'senior', 'expert']
const POIDS_FAMILLE = { exacte: 15, secondaire: 11, compatible: 8 }
const RETARD_MAX_JOURS = 30

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()

// « Node.js » = « nodejs » = « node » ; « PostgreSQL » = « postgres »
const ALIAS = { nodejs: 'node', 'node.js': 'node', postgresql: 'postgres', k8s: 'kubernetes', 'react.js': 'react', reactjs: 'react', 'vue.js': 'vue', vuejs: 'vue', gcp: 'google cloud', 'c sharp': 'c#', golang: 'go', js: 'javascript', ts: 'typescript' }
export const normSkill = (s) => { const n = norm(s); return ALIAS[n] || n }

function competencesScore(stackConsultant, requises, bonus) {
  const have = new Set((stackConsultant || []).map(normSkill))
  const hit = (s) => have.has(normSkill(s))
  const req = (requises || []).filter(Boolean)
  const nice = (bonus || []).filter(Boolean)
  const total = req.length + nice.length / 2
  if (!total) return { points: 20, manquantes: [] } // offre sans compétences listées : neutre
  const got = req.filter(hit).length + nice.filter(hit).length / 2
  return { points: Math.round(40 * got / total), manquantes: req.filter(s => !hit(s)) }
}

const jours = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000)

// Date à partir de laquelle le consultant est libre : intercontrat = aujourd'hui.
export function dateDispo(c, today = new Date()) {
  if (c.intercontrat) return today.toISOString().slice(0, 10)
  return c.disponible_le || c.fin_mission || null
}

function dispoScore(c, demarrage, today) {
  const libre = dateDispo(c, today)
  if (!libre) return { points: 8, retard: null } // inconnue : ni bonus ni exclusion
  const debut = demarrage || today.toISOString().slice(0, 10)
  const retard = jours(libre, debut)
  if (retard <= 0) return { points: 25, retard: 0 }
  if (retard > RETARD_MAX_JOURS) return { points: 0, retard }
  return { points: Math.round(25 * (1 - retard / RETARD_MAX_JOURS)), retard }
}

function senioriteScore(c, offre) {
  const a = SENIORITES.indexOf(c.seniorite), b = SENIORITES.indexOf(offre.seniorite)
  if (a < 0 || b < 0) return 5
  const ecart = Math.abs(a - b)
  return ecart === 0 ? 10 : ecart === 1 ? 5 : 0
}

function lieuScore(c, offre) {
  if (offre.full_remote) return 5
  const lieu = norm(offre.localisation)
  if (!lieu) return 3
  const chez = [c.localisation, ...(c.mobilite || [])].map(norm).filter(Boolean)
  return chez.some(x => x.includes(lieu) || lieu.includes(x)) ? 5 : 0
}

function tjmScore(c, offre) {
  if (!offre.tjm_max || !c.tjm) return 3
  return c.tjm <= offre.tjm_max ? 5 : c.tjm <= offre.tjm_max * 1.1 ? 2 : 0
}

// Renvoie null si le consultant est exclu (famille incompatible ou disponible trop tard).
export function scorer(consultant, offre, today = new Date()) {
  const lien = lienFamille(consultant, offre.famille)
  if (!lien) return null
  const dispo = dispoScore(consultant, offre.date_demarrage, today)
  if (dispo.retard !== null && dispo.retard > RETARD_MAX_JOURS) return null
  const comp = competencesScore(consultant.stack, offre.competences_requises, offre.competences_bonus)
  const detail = {
    competences: comp.points,
    disponibilite: dispo.points,
    famille: POIDS_FAMILLE[lien],
    seniorite: senioriteScore(consultant, offre),
    localisation: lieuScore(consultant, offre),
    tjm: tjmScore(consultant, offre)
  }
  const score = Object.values(detail).reduce((a, b) => a + b, 0)
  return { score, lien, detail, competences_manquantes: comp.manquantes, retard_jours: dispo.retard }
}

export function classer(consultants, offre, today = new Date()) {
  return consultants
    .map(c => ({ consultant: c, ...scorer(c, offre, today) }))
    .filter(r => r.score !== undefined)
    .sort((a, b) => b.score - a.score)
}
