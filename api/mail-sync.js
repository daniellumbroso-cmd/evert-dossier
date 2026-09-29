// Synchro Gmail → Boond : chaque mail envoyé par le bizdev à un contact CRM ou
// à un candidat connu de Boond devient une action sur sa fiche.
//
// - Mail push (objet « ever"T - Groupe Wold | Dossier … | Prénom ») : une Note
//   « push dossier : <Nom Prénom> <expertise> ». Si le prospect n'est pas encore
//   dans Boond, il est créé (société comprise) après validation du bizdev.
// - Tout autre mail : une action Email avec l'objet et le texte du mail.
//
// Deux temps : « scan » lit les mails envoyés et propose, « write » écrit ce
// que le bizdev a validé. Relancer la synchro ne crée pas de doublon : une
// action déjà présente sur la fiche est reconnue et ignorée.
import {
  boondFromEnv, boondUrl, findPersonByEmail, findResourceByEmail, personActions,
  actionTypes, findCompany, companyDomain, createCompany, createContact, createAction
} from './boond-lib.js'
import { googleAuth, googleErrorMessage, gmailClient, readCampaignLog } from './google-lib.js'

export const config = { maxDuration: 300 }

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

const PAGE_SIZE = 15
const MAX_WRITE = 10
const MAX_TEXT = 3000
const PUSH_SUBJECT = /^ever"?T\s*-\s*Groupe Wold\s*\|\s*Dossier\s+(.+?)\s*\|\s*(.+)$/i
// « Dossier Product Owner Data & IA — Rayane Dupont.pdf »
const DOSSIER_FILE = /^Dossier\s+(.+?)\s+[—–-]\s+(.+?)\.pdf$/i
const NO_REPLY = /^(no-?reply|noreply|ne-pas-repondre|notifications?|mailer-daemon)@/i

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

// ── Lecture d'un mail ────────────────────────────────────────────────────────

const header = (msg, name) => msg.payload?.headers?.find(h => h.name.toLowerCase() === name)?.value || ''

function addresses(value) {
  return [...String(value || '').matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m => m[0].toLowerCase())
}

function walkParts(part, out = []) {
  if (!part) return out
  out.push(part)
  for (const p of part.parts || []) walkParts(p, out)
  return out
}

const decode = (data) => Buffer.from(String(data || ''), 'base64url').toString('utf8')

// Texte du mail sans l'historique cité (« Le … a écrit : », lignes « > »).
function bodyText(msg) {
  const parts = walkParts(msg.payload)
  const plain = parts.find(p => p.mimeType === 'text/plain' && p.body?.data)
  const html = parts.find(p => p.mimeType === 'text/html' && p.body?.data)
  let text = plain ? decode(plain.body.data)
    : html ? decode(html.body.data).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      : msg.snippet || ''
  const cut = text.search(/^\s*(Le .{3,200} a écrit\s*:|On .{3,200} wrote:|-{2,}\s*(Original Message|Message d'origine)|De\s*:.*\n.*(Envoyé|Date)\s*:)/im)
  if (cut > 0) text = text.slice(0, cut)
  return text.split('\n').filter(l => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const attachmentNames = (msg) => walkParts(msg.payload).map(p => p.filename).filter(Boolean)

// Mail push : consultant et expertise, lus dans le nom du PDF joint, sinon dans l'objet.
function pushInfo(subject, files) {
  const m = subject.match(PUSH_SUBJECT)
  if (!m) return null
  for (const f of files) {
    const d = f.match(DOSSIER_FILE)
    if (d) return { consultant: d[2].trim(), expertise: d[1].trim() }
  }
  return { consultant: m[2].trim(), expertise: m[1].trim() }
}

const dayDiff = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000

// Déjà dans Boond ? Même texte d'en-tête, à quelques jours près.
function alreadyLogged(actions, firstLine, date, days) {
  const key = norm(firstLine)
  return actions.some(a => norm(a.text).includes(key) && (!a.date || dayDiff(a.date, date) <= days))
}

const capitalize = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())

// ── Scan ─────────────────────────────────────────────────────────────────────

async function scan(session, boond, { days, pageToken }) {
  const auth = googleAuth(session)
  const gmail = gmailClient(auth)
  const after = Math.floor((Date.now() - days * 86400000) / 1000)
  const list = await gmail.users.messages.list({ userId: 'me', q: `in:sent after:${after}`, maxResults: PAGE_SIZE, pageToken })
  const ids = (list.data.messages || []).map(m => m.id)

  const ownDomain = String(session.email || '').split('@')[1]?.toLowerCase()
  const internal = new Set([ownDomain, ...String(process.env.INTERNAL_EMAIL_DOMAINS || 'ever-t.fr,ever-t.com').split(',').map(s => s.trim().toLowerCase())].filter(Boolean))
  const people = new Map()       // email → personne Boond (ou null), une seule recherche par adresse
  const actionsOf = new Map()    // fiche → actions déjà présentes
  let log = null                 // journal des campagnes, lu seulement si besoin

  const person = async (email) => {
    if (!people.has(email)) people.set(email, findPersonByEmail(boond, email))
    return people.get(email)
  }
  const actions = async (p) => {
    const k = `${p.kind}:${p.id}`
    if (!actionsOf.has(k)) actionsOf.set(k, personActions(boond, p.kind, p.id))
    return actionsOf.get(k)
  }

  const perMessage = await mapLimit(ids, 3, async (id) => {
    const msg = (await gmail.users.messages.get({ userId: 'me', id, format: 'full' })).data
    const subject = header(msg, 'subject')
    const date = new Date(Number(msg.internalDate) || header(msg, 'date')).toISOString()
    const recipients = [...new Set([...addresses(header(msg, 'to')), ...addresses(header(msg, 'cc'))])]
      .filter(e => !internal.has(e.split('@')[1]) && !NO_REPLY.test(e))
    if (!recipients.length) return []

    const push = pushInfo(subject, attachmentNames(msg))
    const items = []
    for (const email of recipients) {
      const p = await person(email)
      if (!p && !push) continue   // inconnu de Boond et pas un push : on ne crée rien

      const text = push
        ? `push dossier : ${push.consultant} ${push.expertise}`
        : `Mail envoyé — ${subject || '(sans objet)'}\n\n${bodyText(msg)}`.slice(0, MAX_TEXT)
      const firstLine = text.split('\n')[0]
      const item = {
        key: `${id}:${email}`, messageId: id, date, subject, email,
        kind: push ? 'push' : 'mail',
        person: p ? { kind: p.kind, id: p.id, name: p.name, url: p.url, companyId: p.companyId } : null,
        text,
        already: p ? alreadyLogged(await actions(p), firstLine, date, push ? 3 : 1) : false
      }

      // Prospect absent de Boond : préparer sa fiche avec le journal des campagnes,
      // sinon avec ce que dit l'adresse email. Le bizdev relit avant création.
      if (!p) {
        if (!log) log = await readCampaignLog(auth).catch(() => [])
        const entry = [...log].reverse().find(e => e.email === email)
        const company = entry?.boondCompanyId
          ? { id: entry.boondCompanyId, name: entry.entreprise, how: 'journal' }
          : await findCompany(boond, { entreprise: entry?.entreprise, email })
        const local = email.split('@')[0].split(/[._-]/)
        item.create = {
          prenom: entry?.prenom || (local.length > 1 ? capitalize(local[0]) : ''),
          nom: entry?.nom || (local.length > 1 ? capitalize(local.slice(1).join(' ')) : ''),
          poste: entry?.poste || '',
          companyId: company?.id || null,
          entreprise: company?.name || entry?.entreprise || '',
          // Société à confirmer si elle n'a été que déduite du domaine de l'email
          entrepriseADeviner: !company?.id && !entry?.entreprise ? companyDomain(email) : '',
          aConfirmer: !entry || !!entry.entrepriseDeduite || company?.how === 'domaine' || !company,
          source: entry ? 'journal' : 'email'
        }
      }
      items.push(item)
    }
    return items
  })

  return { items: perMessage.flat(), scanned: ids.length, nextPageToken: list.data.nextPageToken || null }
}

// ── Écriture ─────────────────────────────────────────────────────────────────

async function write(session, boond, items) {
  const [managerId, types] = await Promise.all([findResourceByEmail(boond, session.email), actionTypes(boond)])
  const results = []
  for (const it of items) {
    try {
      let p = it.person
      let companyId = p?.companyId || null

      if (!p) {
        const c = it.create
        if (!c?.nom || !c?.prenom) throw new Error('Prénom et nom requis pour créer le contact')
        if (!it.confirmed) throw new Error('Société non confirmée')
        companyId = c.companyId || (c.entreprise ? await createCompany(boond, { name: c.entreprise, website: companyDomain(it.email) || undefined, managerId }) : null)
        const contactId = await createContact(boond, {
          firstName: c.prenom, lastName: c.nom, email: it.email, title: c.poste, companyId, managerId
        })
        p = { kind: 'contact', id: contactId }
      } else {
        // Contrôle anti-doublon au moment d'écrire (la page a pu rester ouverte)
        const existing = await personActions(boond, p.kind, p.id)
        if (alreadyLogged(existing, it.text.split('\n')[0], it.date, it.kind === 'push' ? 3 : 1)) {
          results.push({ key: it.key, ok: true, skipped: true, url: boondUrl(p.kind === 'contact' ? 'contacts' : 'candidates', p.id) })
          continue
        }
      }

      const t = types[p.kind] || {}
      const typeOf = it.kind === 'push' ? t.note : t.email
      if (typeOf == null) throw new Error(`Type d'action introuvable dans Boond (types disponibles : ${(t.labels || []).join(', ') || 'aucun'})`)
      const actionId = await createAction(boond, {
        kind: p.kind, personId: p.id, companyId, typeOf, text: it.text, date: it.date, managerId
      })
      results.push({ key: it.key, ok: true, actionId, url: boondUrl(p.kind === 'contact' ? 'contacts' : 'candidates', p.id) })
    } catch (err) {
      results.push({ key: it.key, ok: false, error: err.message })
    }
  }
  return results
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })
  const boond = boondFromEnv()
  if (!boond) return res.status(500).json({ error: 'Accès Boond non configuré' })

  const { action } = req.body || {}
  try {
    if (action === 'scan') {
      const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 60)
      try { return res.json(await scan(session, boond, { days, pageToken: req.body.pageToken || undefined })) }
      catch (err) {
        if (!(err.code || err.response)) throw err
        console.error('Gmail error:', err.message)
        return res.status(502).json({ error: googleErrorMessage(err, 'Gmail') })
      }
    }
    if (action === 'write') {
      const items = req.body.items
      if (!Array.isArray(items) || !items.length || items.length > MAX_WRITE) return res.status(400).json({ error: `1 à ${MAX_WRITE} mails par appel` })
      return res.json({ results: await write(session, boond, items) })
    }
    return res.status(400).json({ error: 'Action inconnue' })
  } catch (err) {
    console.error('Mail sync error:', err)
    res.status(500).json({ error: err.message })
  }
}
