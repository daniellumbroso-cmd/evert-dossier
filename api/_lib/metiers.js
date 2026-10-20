// Familles de métiers ever"T et compatibilités entre elles.
//
// C'est le filtre strict du matching : un consultant n'est proposé sur une offre
// que si la famille de l'offre est la sienne, l'une de ses familles secondaires
// (expérience réelle lue dans le CV), ou une famille compatible avec la sienne.
// Un DevOps ne sort donc jamais sur une offre de PM ; un PO peut sortir sur une
// offre de PM.
//
// Pour ajuster : modifier FAMILLES (libellés, mots-clés de titre) ou COMPATIBLES.
// Les tests (tests/metiers.test.js) vérifient les cas qui ne doivent jamais bouger.

export const FAMILLES = {
  dev_front:            { label: 'Développeur Front-end',        titres: [/\bfront[- ]?end\b/, /\bfront\b/, /\breact\b/, /\bangular\b/, /\bvue(\.?js)?\b/, /\bintegrat/] },
  dev_back:             { label: 'Développeur Back-end',         titres: [/\bback[- ]?end\b/, /\bbackend\b/, /\bjava\b/, /\b\.?net\b/, /\bc#/, /\bpython\b/, /\bnode(\.?js)?\b/, /\bphp\b/, /\bgolang\b/, /\bspring\b/] },
  dev_fullstack:        { label: 'Développeur Full-stack',       titres: [/\bfull[- ]?stack\b/] },
  dev_mobile:           { label: 'Développeur Mobile',           titres: [/\bmobile\b/, /\bios\b/, /\bandroid\b/, /\bflutter\b/, /\breact native\b/, /\bkotlin multiplatform\b/, /\bswift\b/] },
  architecte_tech_lead: { label: 'Architecte logiciel / Tech Lead', titres: [/\btech[- ]?lead\b/, /\blead dev/, /\barchitecte? (logiciel|solution|applicati|technique|software)/, /\bsoftware architect/, /\bsolution architect/] },
  devops_cloud:         { label: 'DevOps / Cloud / SRE',         titres: [/\bdevops\b/, /\bdev ops\b/, /\bsre\b/, /\bsite reliability\b/, /\bcloud\b/, /\bplatform engineer/, /\bkubernetes\b/, /\binfra(structure)?\b/] },
  data_engineer:        { label: 'Data Engineer',                titres: [/\bdata engineer/, /\bing[eé]nieur data\b/, /\banalytics engineer/, /\bbig data\b/] },
  data_analyst_bi:      { label: 'Data Analyst / BI',            titres: [/\bdata analyst/, /\bbusiness intelligence\b/, /(^|\s)bi(\s|$)/, /\bpower ?bi\b/, /\btableau\b/, /\breporting\b/] },
  data_scientist:       { label: 'Data Scientist',               titres: [/\bdata scien/] },
  ia_ml:                { label: 'IA / Machine Learning',        titres: [/\bmachine learning\b/, /\bml engineer\b/, /\bmlops\b/, /\bia\b/, /\bai engineer\b/, /\bllm\b/, /\bgen ?ai\b/, /\bdeep learning\b/, /\bintelligence artificielle\b/] },
  data_architect:       { label: 'Data Architect',               titres: [/\bdata architect/, /\barchitecte data\b/, /\barchitecte de donn/] },
  qa_test:              { label: 'QA / Test',                    titres: [/\bqa\b/, /\btest(eur|er|ing)?\b/, /\bquality assurance\b/, /\bautomaticien de test/, /\brecette\b/] },
  cyber:                { label: 'Cybersécurité',                titres: [/\bcyber/, /\bs[eé]curit[eé]\b/, /\bsecurity\b/, /\bsoc\b/, /\bpentest/, /\brssi\b/, /\bgrc\b/, /\biam\b/] },
  product_owner:        { label: 'Product Owner',                titres: [/\bproduct owner\b/, /(^|\s)po(\s|$)/, /\bppo\b/] },
  product_manager:      { label: 'Product Manager',              titres: [/\bproduct manager\b/, /(^|\s)pm(\s|$)/, /\bhead of product\b/, /\bproduct lead\b/] },
  chef_de_projet:       { label: 'Chef de projet',               titres: [/\bchef de projet\b/, /\bproject manager\b/, /\bdirecteur de projet\b/, /\bcdp\b/] },
  pmo:                  { label: 'PMO',                          titres: [/\bpmo\b/, /\bproject management office\b/] },
  scrum_master_coach:   { label: 'Scrum Master / Coach agile',   titres: [/\bscrum master\b/, /\bcoach agile\b/, /\bagile coach\b/, /\brelease train engineer\b/, /\brte\b/] },
  business_analyst:     { label: 'Business Analyst / AMOA',      titres: [/\bbusiness analyst\b/, /\bamoa\b/, /\bmoa\b/, /\bconsultant fonctionnel\b/, /\bfunctional analyst\b/] },
  ux_ui_design:         { label: 'UX / UI Design',               titres: [/\bux\b/, /\bui\b/, /\bdesigner\b/, /\bproduct design/, /\bux\/ui\b/] }
}

export const FAMILLE_IDS = Object.keys(FAMILLES)

// Compatibilités, lues dans les deux sens. Un consultant de la famille A peut être
// proposé sur une offre de la famille B si la paire est listée ici.
const PAIRES = [
  ['dev_fullstack', 'dev_front'],
  ['dev_fullstack', 'dev_back'],
  ['architecte_tech_lead', 'dev_back'],
  ['architecte_tech_lead', 'dev_fullstack'],
  ['data_engineer', 'data_architect'],
  ['data_scientist', 'ia_ml'],
  ['data_scientist', 'data_analyst_bi'],
  ['product_owner', 'product_manager'],
  ['product_owner', 'business_analyst'],
  ['chef_de_projet', 'pmo'],
  ['chef_de_projet', 'scrum_master_coach'],
  ['chef_de_projet', 'business_analyst']
]

const COMPATIBLES = new Map(FAMILLE_IDS.map(f => [f, new Set()]))
for (const [a, b] of PAIRES) { COMPATIBLES.get(a).add(b); COMPATIBLES.get(b).add(a) }

export const isFamille = (f) => FAMILLES[f] !== undefined
export const labelFamille = (f) => FAMILLES[f]?.label || f

// Lien entre un consultant et la famille d'une offre :
// 'exacte' (sa famille principale), 'secondaire' (expérience réelle dans cette
// famille), 'compatible' (famille voisine), ou null (exclu).
export function lienFamille(consultant, familleOffre) {
  const principale = consultant.famille
  const secondaires = consultant.familles_secondaires || []
  if (!familleOffre || !principale) return null
  if (principale === familleOffre) return 'exacte'
  if (secondaires.includes(familleOffre)) return 'secondaire'
  if (COMPATIBLES.get(principale)?.has(familleOffre)) return 'compatible'
  return null
}

// Toutes les familles principales à interroger en base pour une offre donnée :
// la famille elle-même et ses voisines. Les familles secondaires sont filtrées à part.
export function famillesCandidates(familleOffre) {
  if (!isFamille(familleOffre)) return []
  return [familleOffre, ...COMPATIBLES.get(familleOffre)]
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Classement déterministe d'un intitulé de poste, utilisé quand Claude n'est pas
// disponible et pour contrôler sa réponse. Les familles les plus spécifiques
// passent d'abord (« Data Architect » avant « Architecte », « Full-stack » avant
// « Back-end »). Renvoie null si rien ne correspond.
const ORDRE = [
  'data_architect', 'data_scientist', 'data_engineer', 'ia_ml', 'data_analyst_bi',
  'scrum_master_coach', 'pmo', 'product_owner', 'product_manager', 'business_analyst', 'chef_de_projet',
  'devops_cloud', 'cyber', 'qa_test', 'ux_ui_design',
  'architecte_tech_lead', 'dev_fullstack', 'dev_mobile', 'dev_front', 'dev_back'
]

export function familleDepuisTitre(titre) {
  const t = norm(titre)
  if (!t) return null
  for (const f of ORDRE) if (FAMILLES[f].titres.some(re => re.test(t))) return f
  return null
}
