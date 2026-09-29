// Campagne push — étape 1 : vérification Boond, créneaux et rédaction des mails.
//
// Rien n'est écrit dans Boond, Gmail ou l'agenda à ce stade : la route lit
// Boond, lit les disponibilités du bizdev et rédige. Le front envoie la liste par petits paquets pour afficher une
// progression et rester loin des délais maximum de Vercel.
import Anthropic from '@anthropic-ai/sdk'
import {
  boondFromEnv, boondUrl, findContact, contactCompany, findCompany,
  companyStatus, lastContactAction
} from './boond-lib.js'
import { fetchBusy, freeSlotsByDay, assignSlots } from './calendar-slots.js'
import { getSenderInfo } from './sender.js'

export const config = { maxDuration: 300 }

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

// En deçà, un contact est considéré comme déjà travaillé : un collègue l'a
// touché récemment, on ne le relance pas par-dessus.
const RECENT_DAYS = 60
const MAX_ROWS_CHECK = 10
const MAX_ROWS_WRITE = 6

// Petit limiteur de concurrence : Boond n'aime pas les rafales.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

async function checkRow(boond, row) {
  const contact = await findContact(boond, row)
  let company = contact ? await contactCompany(boond, contact.id) : null
  let companyHow = company ? 'contact' : null
  if (!company) {
    company = await findCompany(boond, row)
    companyHow = company?.how || null
  }
  const status = company ? await companyStatus(boond, company.id) : 'unknown'
  const last = contact ? await lastContactAction(boond, contact.id) : null
  const days = last ? (Date.now() - new Date(last.date)) / 86400000 : Infinity

  let verdict
  if (status === 'active_client') verdict = 'client_actif'
  else if (days <= RECENT_DAYS) verdict = 'deja_contacte'
  else if (status === 'past_client') verdict = 'ancien_client'
  else if (!contact && !company) verdict = 'nouveau'
  else verdict = 'prospect'

  return {
    id: row.id,
    verdict,
    contact: contact ? { id: contact.id, how: contact.how, url: boondUrl('contacts', contact.id) } : null,
    company: company ? { id: company.id, name: company.name, how: companyHow, url: boondUrl('companies', company.id) } : null,
    status,
    lastAction: last
  }
}

// ── Rédaction ────────────────────────────────────────────────────────────────
//
// Le mail suit le modèle des bizdevs (mail de Martin). Tout ce qui est fixe est
// assemblé ici ; Claude ne rédige que les points forts, choisis pour chaque
// prospect à partir des seuls faits du dossier.

const WRITE_SYSTEM = `Tu prépares des mails de prospection "push dossier" pour ever"T (conseil Tech, Data.IA et Product, groupe WOLD). Chaque mail présente UN consultant à UN prospect ; le reste du mail est déjà écrit, tu ne fournis que les éléments demandés.

Tu reçois la fiche du consultant et une liste de prospects (poste, technologies, profils qu'ils encadrent).

À FOURNIR UNE FOIS :
- "intitule" : l'intitulé du consultant tel qu'il s'insère dans la phrase "le profil de Rayane, <intitule>, dont je viens d'apprendre la disponibilité". Court (2 à 6 mots), repris de la fiche. Exemple : "Product Owner Data & IA".
- "pronom" : "il" ou "elle" si la fiche le montre clairement (résumé à la 3e personne, intitulé féminisé comme "Consultante", "Développeuse", "Cheffe de projet"). Sinon "inconnu". Ne devine jamais d'après le prénom.

POUR CHAQUE PROSPECT (reprends son "id") :
- "points" : 3 points forts, au format "Thème (Client) : éléments concrets".
  Exemple : "Semantic layer & fiabilité des réponses IA (Clarins) : Golden Questions Dataset, critères d'acceptation, tests de non-régression".
  Le client entre parenthèses est une entreprise où le consultant a travaillé d'après la fiche ; si une expérience n'a pas de nom d'entreprise, retire la parenthèse.
  Choisis les expériences et éléments qui parlent le plus à ce prospect (ses technologies, les profils qu'il encadre). S'il n'y a pas de recoupement, prends les points les plus solides de la fiche.
  Ajoute un 4e point "Anglais courant" (ou "Anglais bilingue") uniquement si la fiche indique ce niveau.

RÈGLES :
- N'invente rien : ni compétence, ni client, ni chiffre, ni techno. Chaque élément doit se trouver dans la fiche.
- Chaque point tient sur une ligne (25 mots maximum), sans puce, sans gras, sans point final.`

const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    intitule: { type: 'string' },
    pronom: { type: 'string', enum: ['il', 'elle', 'inconnu'] },
    emails: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'points'],
        additionalProperties: false
      }
    }
  },
  required: ['intitule', 'pronom', 'emails'],
  additionalProperties: false
}

const strip = (s) => String(s || '').replace(/\*\*/g, '')

const consultantFirstName = (d) => d.prenom || String(d.nom || '').split(' ')[0]

// « LUCA » ou « luca » (exports LinkedIn) → « Luca » ; « jean-marc » → « Jean-Marc »
function capitalize(name) {
  const s = String(name || '').trim()
  if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
}

// Fiche condensée du consultant : ce que le rédacteur a le droit d'affirmer.
function talentBrief(d) {
  const lines = [
    `Prénom : ${consultantFirstName(d)}`,
    `Intitulé : ${d.metier || d.titre || ''}`,
    d.a_propos && `Résumé : ${strip(d.a_propos).slice(0, 900)}`,
    d.points_forts?.length && `Points forts : ${d.points_forts.map(p => `${p.valeur} ${p.libelle}`).join(' ; ')}`,
    d.expertises_cles?.length && `Expertises clés : ${d.expertises_cles.join(', ')}`,
    d.competences_techniques?.length && `Compétences :\n${d.competences_techniques.map(c => `- ${c.categorie} : ${(c.items || []).join(', ')}`).join('\n')}`,
    d.experiences?.length && `Expériences :\n${d.experiences.slice(0, 6).map(e => {
      const activites = [...(e.activites || []), ...(e.sub_roles || []).flatMap(s => s.activites || [])]
      const themes = activites.map(a => a.theme).filter(Boolean)
      const pts = [
        ...activites.flatMap(a => a.points || []),
        ...(e.resultats || [])
      ].slice(0, 6).map(p => `  · ${strip(p)}`).join('\n')
      const env = (e.env_technique || []).join(', ')
      return `- ${e.entreprise || '(entreprise non précisée)'} — ${e.role} (${e.dates})` +
        (themes.length ? `\n  Thèmes : ${themes.join(' ; ')}` : '') +
        (pts ? `\n${pts}` : '') +
        (env ? `\n  Environnement : ${env}` : '')
    }).join('\n')}`,
    d.formations?.length && `Formation : ${d.formations.map(f => `${f.diplome}${f.ecole ? ' — ' + f.ecole : ''}`).join(' ; ')}`,
    d.langues?.length && `Langues : ${d.langues.map(l => `${l.langue} ${l.niveau ? '(' + l.niveau + ')' : ''}`.trim()).join(', ')}`
  ]
  return lines.filter(Boolean).join('\n')
}

// Objet fixe, comme pour le mail push unitaire.
export function mailSubject(d) {
  return `ever"T - Groupe Wold | Dossier ${String(d.metier || d.titre || '').trim()} | ${consultantFirstName(d)}`
}

// Assemble le mail sur le modèle des bizdevs.
// « Enchanté » et « chargé de » sont écartés : ils s'accordent selon la personne
// qui écrit, que l'application ne connaît pas.
export function composeMail({ prospect, sender, consultant, intitule, pronom, points, creneaux }) {
  const role = sender.role || 'Business Developer'
  const maison = /fondat/i.test(role) ? `${role.toLowerCase()} d'ever"T | groupe WOLD` : `${role} chez ever"T | groupe WOLD`
  const relation = prospect.entreprise ? `, en charge des relations avec ${prospect.entreprise}` : ''
  const sujet = pronom === 'il' ? 'Pourrait-il' : pronom === 'elle' ? 'Pourrait-elle' : 'Ce profil pourrait-il'
  const prenom = capitalize(prospect.prenom)
  const slots = (creneaux || []).filter(Boolean)

  return [
    `Bonjour${prenom ? ' ' + prenom : ''},`,
    '',
    `Je suis ${sender.signature}, ${maison}${relation}. J'ai le plaisir de vous partager le profil de ${consultant}, ${intitule}, dont je viens d'apprendre la disponibilité et qui a émis le souhait de rejoindre vos équipes (Dossier en PJ).`,
    '',
    'Ses points forts :',
    ...points.map(p => `* ${String(p).replace(/^[\s*•·-]+/, '').trim()}`),
    '',
    slots.length
      ? `${sujet} correspondre à un de vos besoins, à date ou à venir ? Je suis disponible pour organiser un échange. Quel créneau vous conviendrait ?`
      : `${sujet} correspondre à un de vos besoins, à date ou à venir ? Je suis disponible pour organiser un échange : quelles seraient vos disponibilités ?`,
    ...slots.map(s => `* ${s}`),
    '',
    'Belle journée,',
    sender.signature
  ].join('\n')
}

async function writeEmails(dossier, rows, sender) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prospects = rows.map(r => ({
    id: r.id, poste: r.poste, technologies: r.technologies, profils_encadres: r.profils
  }))
  const response = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: EMAIL_SCHEMA } },
    // Si le modèle décline une requête, l'API la rejoue d'elle-même sur un autre modèle
    fallbacks: 'default',
    system: WRITE_SYSTEM,
    messages: [{
      role: 'user',
      content: `FICHE DU CONSULTANT :\n${talentBrief(dossier)}\n\nPROSPECTS :\n${JSON.stringify(prospects, null, 1)}`
    }]
  }, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })

  if (response.stop_reason === 'refusal') throw new Error('Rédaction refusée par le modèle')
  if (response.stop_reason === 'max_tokens') throw new Error('Réponse tronquée')
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const out = JSON.parse(text)

  const consultant = consultantFirstName(dossier)
  const intitule = out.intitule || dossier.metier || ''
  const objet = mailSubject(dossier)
  return rows.map(r => {
    const points = out.emails.find(e => e.id === r.id)?.points
    if (!points?.length) return { id: r.id, objet, corps: '', error: 'Mail non rédigé' }
    return {
      id: r.id,
      objet,
      corps: composeMail({ prospect: r, sender, consultant, intitule, pronom: out.pronom, points, creneaux: r.creneaux })
    }
  })
}

// ── Créneaux Google Agenda ───────────────────────────────────────────────────

// Les erreurs Google les plus probables, traduites en consigne claire.
function calendarWarning(err) {
  const status = err.code || err.response?.status
  const msg = String(err.message || '')
  if (/has not been used|accessNotConfigured|is disabled/i.test(msg)) {
    return { warning: 'calendar_api_disabled', message: "L'API Google Calendar n'est pas activée dans le projet Google Cloud de l'application." }
  }
  if (status === 403 || status === 401 || /insufficient|invalid_grant|scope|No access, refresh token/i.test(msg)) {
    return { warning: 'calendar_scope', message: "Déconnectez-vous puis reconnectez-vous pour autoriser la lecture de vos disponibilités Google Agenda." }
  }
  return { warning: 'calendar_error', message: `Agenda indisponible : ${msg}` }
}

async function proposeSlots(session, count) {
  try {
    const { busy, days } = await fetchBusy(session)
    const groups = freeSlotsByDay(busy, days)
    if (!groups.length) return { assignments: null, warning: 'calendar_full', message: 'Aucun créneau libre dans votre agenda sur les 6 prochains jours ouvrés.' }
    return { assignments: assignSlots(groups, count) }
  } catch (err) {
    console.error('Calendar error:', err.message)
    return { assignments: null, ...calendarWarning(err) }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { action, rows, dossier, count } = req.body || {}

  try {
    if (action === 'slots') {
      const n = Math.min(Math.max(Number(count) || 0, 1), 500)
      return res.json(await proposeSlots(session, n))
    }

    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Aucune ligne reçue' })

    if (action === 'check') {
      if (rows.length > MAX_ROWS_CHECK) return res.status(400).json({ error: `${MAX_ROWS_CHECK} lignes maximum par appel` })
      const boond = boondFromEnv()
      if (!boond) return res.status(500).json({ error: 'Accès Boond non configuré' })
      const results = await mapLimit(rows, 4, row => checkRow(boond, row))
      return res.json({ results })
    }

    if (action === 'write') {
      if (rows.length > MAX_ROWS_WRITE) return res.status(400).json({ error: `${MAX_ROWS_WRITE} lignes maximum par appel` })
      if (!dossier) return res.status(400).json({ error: 'Dossier du consultant manquant' })
      const emails = await writeEmails(dossier, rows, getSenderInfo(session.email || ''))
      return res.json({ emails })
    }

    return res.status(400).json({ error: 'Action inconnue' })
  } catch (err) {
    console.error('Campaign error:', err)
    if (err instanceof Anthropic.RateLimitError) return res.status(503).json({ error: 'Claude est saturé, réessayez dans une minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Erreur Claude (${err.status}) : ${err.message}` })
    res.status(500).json({ error: err.message })
  }
}
