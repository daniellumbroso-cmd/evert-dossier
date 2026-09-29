// Campagne push : profil du consultant, vérification Boond, plages horaires,
// rédaction des mails, puis brouillons Gmail avec le dossier PDF en PJ.
//
// Rien n'est écrit dans Boond ici : la trace dans Boond est posée par la
// synchro des mails envoyés (mail-sync.js), une fois le mail réellement parti. Le front envoie la liste par petits paquets pour afficher une
// progression et rester loin des délais maximum de Vercel.
import Anthropic from '@anthropic-ai/sdk'
import {
  boondFromEnv, boondUrl, findContact, contactCompany, findCompany,
  companyStatus, lastContactAction
} from './boond-lib.js'
import { fetchBusy, freeRangesByDay, assignSlots } from './calendar-slots.js'
import { getSenderInfo } from './sender.js'
import {
  googleAuth, googleErrorMessage, startPdfUpload, isDriveUploadUrl, sendPdfChunk,
  downloadFile, buildMime, createDraft, appendCampaignLog, gmailSignature
} from './google-lib.js'

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
const MAX_DRAFTS = 5

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

Tu reçois la fiche du consultant et une liste de prospects : poste, entreprise, technologies qu'ils utilisent, profils qu'ils encadrent.

LE PRINCIPE : le prospect doit se reconnaître dans les points forts. Chaque mail met en avant ce que le consultant a en commun avec le prospect :
- des TECHNOS : celles de la fiche qui figurent aussi dans les technologies du prospect, ou qui en sont très proches (même famille, même usage) ;
- un CONTEXTE MÉTIER : une expérience dans le même secteur que l'entreprise du prospect (luxe, banque, assurance, retail, santé, industrie, énergie, médias…), ou sur un sujet proche de son poste et des profils qu'il encadre (un Head of Data lit "plateforme data", un CTO lit "architecture et delivery", un CPO lit "produit").
Le secteur d'une entreprise connue peut se déduire de son nom (Dior → luxe, BNP Paribas → banque) : il sert à choisir les expériences, il n'est jamais écrit dans le mail.

À FOURNIR UNE FOIS :
- "intitule" : l'intitulé du consultant tel qu'il s'insère dans la phrase "le profil de Rayane, <intitule>, dont je viens d'apprendre la disponibilité". Court (2 à 6 mots), repris de la fiche. Exemple : "Product Owner Data & IA".
- "pronom" : "il" ou "elle" si la fiche le montre clairement (résumé à la 3e personne, intitulé féminisé comme "Consultante", "Développeuse", "Cheffe de projet"). Sinon "inconnu". Ne devine jamais d'après le prénom.

POUR CHAQUE PROSPECT (reprends son "id") :
- "points" : 3 points forts, au format "Thème (Client) : éléments concrets".
  Exemple : "Semantic layer & fiabilité des réponses IA (Clarins) : Golden Questions Dataset, critères d'acceptation, tests de non-régression".
  Le client entre parenthèses est une entreprise où le consultant a travaillé d'après la fiche ; si une expérience n'a pas de nom d'entreprise, retire la parenthèse.
  Classe les points du plus parlant au moins parlant pour CE prospect : le premier porte le recoupement le plus fort (technos communes ou contexte métier proche). Nomme explicitement dans les éléments concrets les technos que le prospect utilise aussi.
  Ajoute un 4e point "Anglais courant" (ou "Anglais bilingue") uniquement si la fiche indique ce niveau.
- "adequation" : "forte" (technos communes ET contexte métier ou poste proche), "moyenne" (l'un des deux), "faible" (aucun recoupement réel : les points sont alors les plus solides de la fiche, sans forcer le lien).
- "raison" : une phrase courte pour le bizdev, pas pour le prospect, qui dit sur quoi repose le lien. Exemple : "Technos communes : Snowflake, dbt ; expérience luxe (Clarins) proche de Dior". Si "faible", dis ce qui manque.

RÈGLES :
- N'invente rien : ni compétence, ni client, ni chiffre, ni techno. Chaque élément des points doit se trouver dans la fiche. Ne prête au consultant aucune techno du prospect qui n'est pas dans la fiche.
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
          points: { type: 'array', items: { type: 'string' } },
          adequation: { type: 'string', enum: ['forte', 'moyenne', 'faible'] },
          raison: { type: 'string' }
        },
        required: ['id', 'points', 'adequation', 'raison'],
        additionalProperties: false
      }
    }
  },
  required: ['intitule', 'pronom', 'emails'],
  additionalProperties: false
}

const strip = (s) => String(s || '').replace(/\*\*/g, '')

const consultantFirstName = (d) => d.prenom || String(d.nom || '').split(' ')[0]

// Le consultant vient soit du générateur (dossier structuré), soit d'un PDF de
// dossier déjà produit : on en a alors le texte et un petit profil (prénom,
// nom, métier) relu par le bizdev.
function consultantOf({ dossier, dossierText, profil }) {
  if (dossier) return dossier
  return { ...(profil || {}), texte: String(dossierText || '').slice(0, 15000) }
}

// « LUCA » ou « luca » (exports LinkedIn) → « Luca » ; « jean-marc » → « Jean-Marc »
function capitalize(name) {
  const s = String(name || '').trim()
  if (!s || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
}

// Fiche condensée du consultant : ce que le rédacteur a le droit d'affirmer.
function talentBrief(d) {
  if (d.texte) {
    return `Prénom : ${consultantFirstName(d)}\nIntitulé : ${d.metier || ''}\n\nTEXTE DU DOSSIER DE COMPÉTENCES (extrait du PDF) :\n${d.texte}`
  }
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

// Point fort « Thème (Client) : éléments » → thème en gras.
function boldTheme(point) {
  const p = String(point).replace(/^[\s*•·-]+/, '').replace(/\*\*/g, '').trim()
  const i = p.indexOf(' : ')
  return i > 0 ? `**${p.slice(0, i)}** : ${p.slice(i + 3)}` : p
}

// Assemble le mail sur le modèle des bizdevs.
// Mise en forme légère, lisible dans l'éditeur de la page et convertie en
// HTML dans le brouillon Gmail : **texte** = gras, ligne « * … » = puce.
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
    `Je suis ${sender.signature}, ${maison}${relation}. J'ai le plaisir de vous partager le profil de **${consultant}, ${intitule}**, dont je viens d'apprendre la disponibilité et qui a émis le souhait de rejoindre vos équipes (Dossier en PJ).`,
    '',
    'Ses points forts :',
    ...points.map(p => `* ${boldTheme(p)}`),
    '',
    slots.length
      ? `${sujet} correspondre à un de vos besoins, à date ou à venir ? Je suis disponible pour organiser un échange. **Quel créneau vous conviendrait ?**`
      : `${sujet} correspondre à un de vos besoins, à date ou à venir ? Je suis disponible pour organiser un échange : **quelles seraient vos disponibilités ?**`,
    ...slots.map(s => `* **${s}**`),
    '',
    'Belle journée,',
    sender.signature
  ].join('\n')
}

async function writeEmails(dossier, rows, sender) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prospects = rows.map(r => ({
    id: r.id, poste: r.poste, entreprise: r.entreprise || '', technologies: r.technologies, profils_encadres: r.profils
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
    const m = out.emails.find(e => e.id === r.id)
    const points = m?.points
    if (!points?.length) return { id: r.id, objet, corps: '', error: 'Mail non rédigé' }
    return {
      id: r.id,
      objet,
      adequation: m.adequation,
      raison: m.raison,
      corps: composeMail({ prospect: r, sender, consultant, intitule, pronom: out.pronom, points, creneaux: r.creneaux })
    }
  })
}

// ── Profil du consultant à partir d'un PDF de dossier ───────────────────────

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    prenom: { type: 'string' },
    nom: { type: 'string' },
    metier: { type: 'string' },
    expertise: { type: 'string' }
  },
  required: ['prenom', 'nom', 'metier', 'expertise'],
  additionalProperties: false
}

async function readProfile(dossierText, fileName) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PROFILE_SCHEMA } },
    fallbacks: 'default',
    system: `Tu lis un dossier de compétences ever"T (PDF converti en texte) et tu en tires l'identité du consultant.
- "prenom" et "nom" : prénom et nom de famille. Le nom de fichier suit souvent le format "Dossier <titre> — <Nom Prénom>.pdf" ; la couverture n'affiche parfois que le prénom. Chaîne vide si introuvable.
- "metier" : l'intitulé de poste affiché en couverture, tel quel (ex. "Product Owner Data & IA").
- "expertise" : l'expertise du profil en 3 à 6 mots, pour une note CRM (ex. "Product Owner Data & IA").
N'invente rien.`,
    messages: [{ role: 'user', content: `NOM DU FICHIER : ${fileName || '(inconnu)'}\n\nTEXTE :\n${String(dossierText).slice(0, 12000)}` }]
  }, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  if (response.stop_reason === 'refusal') throw new Error('Lecture du dossier refusée par le modèle')
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text)
}

// ── Brouillons Gmail ─────────────────────────────────────────────────────────

async function createDrafts(session, { pdfFileId, rows, consultant }) {
  const auth = googleAuth(session)
  const [pdf, signatureHtml] = await Promise.all([downloadFile(auth, pdfFileId), gmailSignature(auth, session.email)])
  const results = []
  for (const r of rows) {
    try {
      if (!r.email) throw new Error('Pas d\'email pour ce prospect')
      const draftId = await createDraft(auth, buildMime({ to: r.email, subject: r.objet, text: r.corps, signatureHtml, attachment: pdf }))
      results.push({ id: r.id, draftId })
    } catch (err) {
      results.push({ id: r.id, error: err.code || err.response ? googleErrorMessage(err, 'Gmail') : err.message })
    }
  }
  // Journal Drive : servira à créer le prospect dans Boond s'il y est absent
  // quand la synchro verra le mail parti. Un échec ici ne bloque pas les brouillons.
  const ok = new Set(results.filter(x => x.draftId).map(x => x.id))
  const date = new Date().toISOString()
  try {
    await appendCampaignLog(auth, rows.filter(r => ok.has(r.id)).map(r => ({
      date, email: String(r.email).toLowerCase(), prenom: r.prenom || '', nom: r.nom || '', poste: r.poste || '',
      entreprise: r.entreprise || '', entrepriseDeduite: !!r.entrepriseDeduite,
      boondCompanyId: r.boondCompanyId || null, boondContactId: r.boondContactId || null,
      consultant: consultant?.nomComplet || '', expertise: consultant?.expertise || '', pdf: pdf.name
    })))
  } catch (err) {
    console.error('Campaign log error:', err.message)
  }
  return results
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
    const groups = freeRangesByDay(busy, days)
    if (!groups.length) return { assignments: null, warning: 'calendar_full', message: 'Aucune plage libre dans votre agenda sur les 6 prochains jours ouvrés.' }
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

  const { action, rows, dossier, dossierText, profil, count } = req.body || {}

  try {
    if (action === 'profile') {
      if (!dossierText) return res.status(400).json({ error: 'Texte du dossier manquant' })
      return res.json({ profil: await readProfile(dossierText, req.body.fileName) })
    }

    if (action === 'pdf-start') {
      const { name, size } = req.body
      if (!name || !(size > 0)) return res.status(400).json({ error: 'PDF manquant' })
      try { return res.json({ uploadUrl: await startPdfUpload(googleAuth(session), { name, size }) }) }
      catch (err) { return res.status(502).json({ error: googleErrorMessage(err, 'Google Drive') }) }
    }

    if (action === 'pdf-chunk') {
      const { uploadUrl, offset, total, data } = req.body
      if (!isDriveUploadUrl(uploadUrl) || typeof data !== 'string') return res.status(400).json({ error: 'Envoi du PDF invalide' })
      return res.json(await sendPdfChunk(uploadUrl, { offset, total, data }))
    }

    if (action === 'drafts') {
      const { pdfFileId, consultant } = req.body
      if (!pdfFileId) return res.status(400).json({ error: 'Dossier PDF manquant' })
      if (!Array.isArray(rows) || !rows.length || rows.length > MAX_DRAFTS) return res.status(400).json({ error: `1 à ${MAX_DRAFTS} brouillons par appel` })
      try { return res.json({ results: await createDrafts(session, { pdfFileId, rows, consultant }) }) }
      catch (err) { return res.status(502).json({ error: googleErrorMessage(err, 'Google Drive') }) }
    }

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
      if (!dossier && !dossierText) return res.status(400).json({ error: 'Dossier du consultant manquant' })
      const emails = await writeEmails(consultantOf({ dossier, dossierText, profil }), rows, getSenderInfo(session.email || ''))
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
