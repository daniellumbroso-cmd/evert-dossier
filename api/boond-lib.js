// Accès Boond partagé par la campagne push.
//
// Les autres routes Boond (boond-search, boond-push-leads…) portent chacune leur
// propre copie de ces fonctions ; ce module est prévu pour les regrouper, mais
// seule la campagne l'utilise pour l'instant.
//
// Écriture (étape 2, pas encore branchée) — format relevé dans le serveur MCP
// open source fauguste/boondmanager-mcp-server, qui couvre toute l'API :
// - POST /companies { data: { type: 'company', attributes: { name, website } } }
// - POST /contacts  { data: { type: 'contact', attributes: { firstName, lastName, email1, title },
//                     relationships: { company: { data: { id, type: 'company' } } } } }
// - POST /actions   { data: { type: 'action', attributes: { typeOf, text, startDate },
//                     relationships: { dependsOn: { data: { id, type: 'contact' } },
//                                      company: { data: { id, type: 'company' } } } } }
//   typeOf est un ID numérique propre à l'instance : GET /application/dictionary,
//   sous setting.action.contact. Une action se rattache toujours à un contact.
// - Responsable : relation mainManager { id, type: 'resource' }.
// - Recherches : keywords "CSOC<id>" = contacts d'une société, "CCON<id>" = actions d'un contact.
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
  const send = async (method, path, body) => {
    try {
      const r = await fetch(`${apiUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
      let json = null
      try { json = await r.json() } catch { /* corps vide */ }
      return r.ok ? { status: r.status, body: json } : { status: r.status, body: null, error: boondError(json, r.status) }
    } catch (e) {
      return { status: 0, body: null, error: e.message }
    }
  }
  return {
    async get(path) {
      const r = await send('GET', path)
      return r.status === 200 ? r : { status: r.status, body: null, error: r.error }
    },
    post: (path, body) => send('POST', path, body)
  }
}

// Erreurs JSON:API de Boond → une phrase lisible (« 1002 - Wrong or missing attribute (/data/attributes/lastName) »).
function boondError(json, status) {
  const errs = Array.isArray(json?.errors) ? json.errors : []
  if (!errs.length) return `Boond a répondu ${status}`
  return errs.map(e => [e.code, e.detail || e.title].filter(Boolean).join(' - ') + (e.source?.pointer ? ` (${e.source.pointer})` : '')).join(' ; ')
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
    const r = await boond.get(`/contacts?${qs({ keywords: row.email, keywordsType: 'emails', maxResults: '10' })}`)
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
  // « ever t », « ever"T », « Ever-T » : même nom une fois lettres et chiffres seuls gardés
  const compact = (x) => norm(x).replace(/[^a-z0-9]/g, '')
  for (const kw of [...new Set(keywords)]) {
    const r = await boond.get(`/companies?${qs({ keywords: kw, maxResults: '10' })}`)
    const rows = r.body?.data || []
    const hit =
      rows.find(c => compact(c.attributes?.name) === compact(kw)) ||
      (domain && rows.find(c => norm(c.attributes?.website).includes(domain))) ||
      // Résultat unique accepté seulement pour un nom d'entreprise donné dans le
      // fichier : deviné depuis l'email, il ramène parfois une société sans rapport.
      (kw === entreprise && rows.length === 1 ? rows[0] : null)
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

// ── Écriture et recherches complémentaires (synchro Gmail → Boond) ───────────

const emailsOf = (a) => [a.email1, a.email2, a.email3, a.email].filter(Boolean).map(norm)
const fullName = (a) => `${a?.firstName || ''} ${a?.lastName || ''}`.trim()

// Contact CRM ou candidat dont l'une des adresses est exactement `email`.
export async function findPersonByEmail(boond, email) {
  for (const [kind, path] of [['contact', '/contacts'], ['candidate', '/candidates']]) {
    const r = await boond.get(`${path}?${qs({ keywords: email, keywordsType: 'emails', maxResults: '5' })}`)
    const hit = (r.body?.data || []).find(p => emailsOf(p.attributes || {}).includes(norm(email)))
    if (hit) {
      return {
        kind, id: hit.id, name: fullName(hit.attributes),
        companyId: hit.relationships?.company?.data?.id || null,
        url: boondUrl(kind === 'contact' ? 'contacts' : 'candidates', hit.id)
      }
    }
  }
  return null
}

// Le bizdev dans Boond (une « ressource »), pour en faire le responsable.
export async function findResourceByEmail(boond, email) {
  if (!email) return null
  const r = await boond.get(`/resources?${qs({ keywords: email, keywordsType: 'emails', maxResults: '5' })}`)
  const hit = (r.body?.data || []).find(p => emailsOf(p.attributes || {}).includes(norm(email)))
  return hit ? hit.id : null
}

// Actions d'un contact ou d'un candidat : [{ date, text }] (texte sans HTML).
export async function personActions(boond, kind, id) {
  const r = await boond.get(`/${kind === 'contact' ? 'contacts' : 'candidates'}/${id}/actions?maxResults=50`)
  return (r.body?.data || []).map(a => {
    const at = a.attributes || {}
    return {
      date: at.startDate || at.date || at.creationDate || '',
      text: htmlToText(typeof at.text === 'object' ? at.text?.html : at.text)
    }
  })
}

const htmlToText = (h) => String(h || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').trim()

// Texte brut → HTML des notes Boond (le champ `text` d'une action est du HTML).
export const textToHtml = (t) => '<div>' + String(t || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\n/g, '<br>') + '</div>'

// Types d'action de l'instance (setting.action.contact / .candidate), repérés par
// leur libellé : les IDs varient d'une instance Boond à l'autre.
export async function actionTypes(boond) {
  const r = await boond.get('/application/dictionary')
  const action = r.body?.data?.setting?.action || {}
  const list = (x) => Array.isArray(x) ? x : Object.entries(x || {}).map(([id, v]) => ({ id, value: typeof v === 'string' ? v : v?.value }))
  const pick = (items, re) => items.find(i => re.test(norm(i.value)))?.id
  const out = {}
  for (const kind of ['contact', 'candidate']) {
    const items = list(action[kind])
    out[kind] = {
      note: pick(items, /^note/) ?? pick(items, /note/),
      email: pick(items, /^e-?mail/) ?? pick(items, /mail/) ?? pick(items, /^note/) ?? pick(items, /note/),
      labels: items.map(i => i.value)
    }
  }
  return out
}

// Date au format attendu par Boond, en heure de Paris : 2026-09-29T16:05:00+0200
export function boondDate(date = new Date()) {
  const d = new Date(date)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(d).map(p => [p.type, p.value]))
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const off = Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60000)
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0')
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}${mm}`
}

const rel = (id, type) => ({ data: { id: String(id), type } })
const createdId = (r) => (Array.isArray(r.body?.data) ? r.body.data[0] : r.body?.data)?.id

async function create(boond, path, data) {
  const r = await boond.post(path, { data })
  const id = createdId(r)
  if (!id) throw new Error(`Création Boond refusée (${path}) : ${r.error || 'réponse vide'}`)
  return id
}

export const createCompany = (boond, { name, website, managerId }) => create(boond, '/companies', {
  type: 'company',
  attributes: { name, ...(website ? { website } : {}) },
  ...(managerId ? { relationships: { mainManager: rel(managerId, 'resource') } } : {})
})

export const createContact = (boond, { firstName, lastName, email, title, companyId, managerId }) => create(boond, '/contacts', {
  type: 'contact',
  attributes: { firstName, lastName, ...(email ? { email1: email } : {}), ...(title ? { title } : {}) },
  relationships: {
    ...(companyId ? { company: rel(companyId, 'company') } : {}),
    ...(managerId ? { mainManager: rel(managerId, 'resource') } : {})
  }
})

// Une action se rattache toujours à une personne (dependsOn), jamais à une société seule.
export const createAction = (boond, { kind, personId, companyId, typeOf, text, date, managerId }) => create(boond, '/actions', {
  type: 'action',
  attributes: { typeOf: Number(typeOf), text: textToHtml(text), startDate: boondDate(date) },
  relationships: {
    dependsOn: rel(personId, kind),
    ...(companyId && kind === 'contact' ? { company: rel(companyId, 'company') } : {}),
    ...(managerId ? { mainManager: rel(managerId, 'resource') } : {})
  }
})
