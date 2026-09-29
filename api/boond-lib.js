// Accès Boond partagé par la campagne push.
//
// Les autres routes Boond (boond-search, boond-push-leads…) portent chacune leur
// propre copie de ces fonctions ; ce module est prévu pour les regrouper, mais
// seule la campagne l'utilise pour l'instant.
import crypto from 'crypto'

function buildBoondJWT(userToken, clientToken, clientKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', type: 'JWT' })).toString('base64').replace(/=/g, '')
  const payload = Buffer.from(JSON.stringify({
    userToken, clientToken,
    time: Math.floor(Date.now() / 1000),
    mode: 'normal'
  })).toString('base64').replace(/=/g, '')
  const signature = crypto.createHmac('sha256', clientKey)
    .update(`${header}.${payload}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.${signature}`
}

// Une seule clé Boond pour toute la société (ever"T et WOLD partagent l'instance).
export function boondFromEnv() {
  const { BOOND_CLIENT_TOKEN, BOOND_CLIENT_KEY, BOOND_USER_TOKEN, BOOND_BASE_URL } = process.env
  if (!BOOND_CLIENT_TOKEN || !BOOND_CLIENT_KEY || !BOOND_USER_TOKEN || !BOOND_BASE_URL) return null
  const apiUrl = BOOND_BASE_URL.replace(/\/+$/, '')
  const headers = {
    'X-Jwt-Client-BoondManager': buildBoondJWT(BOOND_USER_TOKEN, BOOND_CLIENT_TOKEN, BOOND_CLIENT_KEY),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
  return {
    async get(path) {
      try {
        const r = await fetch(`${apiUrl}${path}`, { headers })
        if (r.status !== 200) return { status: r.status, body: null }
        return { status: 200, body: await r.json() }
      } catch (e) {
        return { status: 0, body: null, error: e.message }
      }
    }
  }
}

export const boondUrl = (kind, id) => `https://ui.boondmanager.com/${kind}/${id}/information`

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const qs = (o) => new URLSearchParams(o).toString()

// Messageries grand public : leur domaine ne dit rien de l'entreprise du contact.
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.fr', 'yahoo.com', 'hotmail.com', 'hotmail.fr',
  'outlook.com', 'outlook.fr', 'live.fr', 'live.com', 'icloud.com', 'me.com', 'msn.com',
  'orange.fr', 'free.fr', 'laposte.net', 'wanadoo.fr', 'sfr.fr', 'protonmail.com', 'proton.me', 'aol.com'
])

export function companyDomain(email) {
  const d = norm(email).split('@')[1] || ''
  return d && !GENERIC_DOMAINS.has(d) ? d : ''
}

// « qonto.com » → « qonto », « mail.societe-generale.fr » → « societe generale »
function domainRoot(domain) {
  const labels = domain.split('.')
  const root = labels.length >= 2 ? labels[labels.length - 2] : labels[0]
  return root.replace(/-/g, ' ')
}

// Le poste LinkedIn contient parfois l'entreprise : « CTO chez Qonto », « Head of Data @ Alan »
function companyFromPoste(poste) {
  const m = String(poste || '').match(/(?:\bchez\b|@|\bat\b)\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

// Recherche d'un contact : d'abord par email (fiable), puis par nom (à vérifier).
export async function findContact(boond, row) {
  const emailsOf = (a) => [a.email1, a.email2, a.email3, a.email].filter(Boolean).map(norm)
  if (row.email) {
    const r = await boond.get(`/contacts?${qs({ keywords: row.email, maxResults: '10' })}`)
    const hit = (r.body?.data || []).find(c => emailsOf(c.attributes || {}).includes(norm(row.email)))
    if (hit) return { id: hit.id, how: 'email' }
  }
  if (row.prenom && row.nom) {
    const r = await boond.get(`/contacts?${qs({ keywords: `${row.prenom} ${row.nom}`, maxResults: '10' })}`)
    const hit = (r.body?.data || []).find(c =>
      norm(c.attributes?.firstName) === norm(row.prenom) && norm(c.attributes?.lastName) === norm(row.nom))
    if (hit) return { id: hit.id, how: 'nom' }
  }
  return null
}

// Société rattachée à un contact, lue sur sa fiche complète.
export async function contactCompany(boond, contactId) {
  const r = await boond.get(`/contacts/${contactId}/information`)
  const data = r.body?.data
  if (!data) return null
  const included = Array.isArray(r.body.included) ? r.body.included : []
  const inc = included.find(i => i.type === 'company' || i.type === 'companies')
  const a = data.attributes || {}
  if (inc) return { id: inc.id, name: inc.attributes?.name || a.companyName || '' }
  const relId = data.relationships?.company?.data?.id || a.companyId
  return relId ? { id: relId, name: a.companyName || '' } : null
}

// Recherche d'une société à partir du nom fourni, du poste ou du domaine email.
export async function findCompany(boond, { entreprise, poste, email }) {
  const domain = companyDomain(email)
  const keywords = [entreprise, companyFromPoste(poste), domain && domainRoot(domain)]
    .map(k => String(k || '').trim()).filter(Boolean)
  for (const kw of [...new Set(keywords)]) {
    const r = await boond.get(`/companies?${qs({ keywords: kw, maxResults: '10' })}`)
    const rows = r.body?.data || []
    const hit =
      rows.find(c => norm(c.attributes?.name) === norm(kw)) ||
      (domain && rows.find(c => norm(c.attributes?.website).includes(domain))) ||
      (rows.length === 1 ? rows[0] : null)
    if (hit) return { id: hit.id, name: hit.attributes?.name || kw, how: kw === entreprise ? 'nom' : 'domaine' }
  }
  return null
}

// Statut client d'une société d'après ses missions (même règle que Match Dossier) :
// mission en cours → client actif, mission terminée → ancien client, aucune → prospect.
export async function companyStatus(boond, companyId) {
  if (!companyId) return 'unknown'
  const r = await boond.get(`/companies/${companyId}/deliveries?maxResults=20`)
  if (r.status !== 200) return 'unknown'
  const rows = r.body?.data || []
  if (!rows.length) return 'prospect'
  const now = new Date()
  const active = rows.some(d => { const end = d.attributes?.endDate; return !end || new Date(end) >= now })
  return active ? 'active_client' : 'past_client'
}

// Dernière action tracée sur un contact, tous auteurs confondus.
// Les noms de champs des actions Boond ne sont pas documentés dans ce projet :
// on lit défensivement les variantes rencontrées.
export async function lastContactAction(boond, contactId) {
  const r = await boond.get(`/contacts/${contactId}/actions?maxResults=10`)
  const included = Array.isArray(r.body?.included) ? r.body.included : []
  const actions = (r.body?.data || []).map(a => {
    const at = a.attributes || {}
    const managerId = a.relationships?.mainManager?.data?.id
    const manager = included.find(i => (i.type === 'resource' || i.type === 'resources') && i.id === managerId)
    return {
      date: at.startDate || at.date || at.creationDate || '',
      text: String(at.text || at.description || at.title || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      by: manager ? `${manager.attributes?.firstName || ''} ${manager.attributes?.lastName || ''}`.trim() : ''
    }
  }).filter(a => a.date)
  actions.sort((x, y) => new Date(y.date) - new Date(x.date))
  return actions[0] || null
}
