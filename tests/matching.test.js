// node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lienFamille, famillesCandidates, familleDepuisTitre, FAMILLE_IDS } from '../api/_lib/metiers.js'
import { scorer, classer, normSkill } from '../api/_lib/scoring.js'

const TODAY = new Date('2026-10-20T09:00:00Z')

test('un DevOps ne sort jamais sur une offre de PM', () => {
  assert.equal(lienFamille({ famille: 'devops_cloud' }, 'product_manager'), null)
  assert.equal(scorer({ famille: 'devops_cloud', intercontrat: true }, { famille: 'product_manager' }, TODAY), null)
})

test('un PO peut sortir sur une offre de PM, et inversement', () => {
  assert.equal(lienFamille({ famille: 'product_owner' }, 'product_manager'), 'compatible')
  assert.equal(lienFamille({ famille: 'product_manager' }, 'product_owner'), 'compatible')
})

test('une famille secondaire réelle ouvre la porte', () => {
  assert.equal(lienFamille({ famille: 'dev_back', familles_secondaires: ['devops_cloud'] }, 'devops_cloud'), 'secondaire')
})

test('familles étanches : data, design, cyber', () => {
  assert.equal(lienFamille({ famille: 'ux_ui_design' }, 'dev_front'), null)
  assert.equal(lienFamille({ famille: 'cyber' }, 'devops_cloud'), null)
  assert.equal(lienFamille({ famille: 'data_analyst_bi' }, 'data_engineer'), null)
})

test('les compatibilités pointent vers des familles existantes', () => {
  for (const f of FAMILLE_IDS) for (const g of famillesCandidates(f)) assert.ok(FAMILLE_IDS.includes(g), `${f} → ${g}`)
})

test('classement des intitulés', () => {
  assert.equal(familleDepuisTitre('Développeur mobile Kotlin'), 'dev_mobile') // l'ancien bug « bi » dans « mobile »
  assert.equal(familleDepuisTitre('Data Architect Azure'), 'data_architect')
  assert.equal(familleDepuisTitre('Ingénieur DevOps AWS'), 'devops_cloud')
  assert.equal(familleDepuisTitre('Consultant BI Power BI'), 'data_analyst_bi')
  assert.equal(familleDepuisTitre('Product Owner Data'), 'product_owner')
  assert.equal(familleDepuisTitre('Développeur Full-stack Java/React'), 'dev_fullstack')
  assert.equal(familleDepuisTitre('Responsable sécurité SI'), 'cyber')
  assert.equal(familleDepuisTitre('Assistante de direction'), null)
})

test('alias de compétences', () => {
  assert.equal(normSkill('Node.js'), normSkill('NodeJS'))
  assert.equal(normSkill('PostgreSQL'), 'postgres')
  assert.equal(normSkill('K8s'), 'kubernetes')
})

const offre = {
  famille: 'devops_cloud', competences_requises: ['AWS', 'Kubernetes', 'Terraform'], competences_bonus: ['Python'],
  seniorite: 'senior', date_demarrage: '2026-11-02', localisation: 'Paris', full_remote: false, tjm_max: 650
}

test('disponibilité : intercontrat devant, fin de mission trop tardive exclue', () => {
  const base = { famille: 'devops_cloud', stack: ['AWS', 'Kubernetes', 'Terraform', 'Python'], seniorite: 'senior', localisation: 'Paris', tjm: 600 }
  const libre = scorer({ ...base, intercontrat: true }, offre, TODAY)
  const finProche = scorer({ ...base, intercontrat: false, fin_mission: '2026-11-15' }, offre, TODAY)
  const tropTard = scorer({ ...base, intercontrat: false, fin_mission: '2027-03-01' }, offre, TODAY)
  assert.equal(libre.score, 100)
  assert.ok(finProche.score < libre.score && finProche.score > 70)
  assert.equal(tropTard, null)
})

test('classer : la famille exacte et les compétences priment', () => {
  const pool = [
    { boond_id: '1', famille: 'devops_cloud', stack: ['Azure'], seniorite: 'junior', intercontrat: true },
    { boond_id: '2', famille: 'devops_cloud', stack: ['AWS', 'Kubernetes', 'Terraform'], seniorite: 'senior', intercontrat: true, localisation: 'Paris' },
    { boond_id: '3', famille: 'product_manager', stack: ['AWS'], intercontrat: true },
    { boond_id: '4', famille: 'dev_back', familles_secondaires: ['devops_cloud'], stack: ['AWS', 'Kubernetes'], seniorite: 'senior', intercontrat: true }
  ]
  const ids = classer(pool, offre, TODAY).map(r => r.consultant.boond_id)
  assert.deepEqual(ids, ['2', '4', '1'])
})
