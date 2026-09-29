// Accès Google du bizdev connecté (Drive, Gmail) pour la campagne push et la
// synchro Gmail → Boond. Les jetons viennent du cookie de session.
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

export function googleAuth(session) {
  const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: session.access_token, refresh_token: session.refresh_token })
  return auth
}

// Erreurs Google les plus probables, traduites en consigne claire.
export function googleErrorMessage(err, service = 'Google') {
  const status = err.code || err.response?.status
  const msg = String(err.message || '')
  if (/has not been used|accessNotConfigured|is disabled/i.test(msg)) {
    return `L'API ${service} n'est pas activée dans le projet Google Cloud de l'application.`
  }
  if (status === 401 || status === 403 || /insufficient|invalid_grant|scope|No access, refresh token/i.test(msg)) {
    return `Accès ${service} non autorisé : déconnectez-vous puis reconnectez-vous pour accepter les nouvelles autorisations.`
  }
  return `${service} : ${msg}`
}

// ── Drive ────────────────────────────────────────────────────────────────────

const FOLDER_NAME = 'ever"T — Campagnes push'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

// Dossier Drive du bizdev qui range les PDF poussés et le journal des campagnes.
// L'autorisation drive.file ne voit que ce que l'application a créé : on le
// retrouve par son nom, sinon on le crée.
export async function campaignFolder(auth) {
  const drive = google.drive({ version: 'v3', auth })
  const found = await drive.files.list({
    q: `name = '${q(FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id)', pageSize: 1
  })
  if (found.data.files?.[0]) return found.data.files[0].id
  const created = await drive.files.create({ requestBody: { name: FOLDER_NAME, mimeType: FOLDER_MIME }, fields: 'id' })
  return created.data.id
}

// Envoi du PDF par morceaux (session d'upload « resumable » de Drive) : Vercel
// refuse les requêtes de plus de 4,5 Mo, un dossier illustré peut dépasser.
export async function startPdfUpload(auth, { name, size }) {
  const parent = await campaignFolder(auth)
  const headers = await auth.getRequestHeaders()
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': String(size)
    },
    body: JSON.stringify({ name, mimeType: 'application/pdf', parents: [parent] })
  })
  const location = r.headers.get('location')
  if (!r.ok || !location) throw Object.assign(new Error(`Drive a refusé l'envoi du PDF (${r.status})`), { code: r.status })
  return location
}

export const isDriveUploadUrl = (url) => /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/.test(String(url || ''))

// Renvoie { done: false } tant que Drive attend la suite, puis { done: true, fileId }.
export async function sendPdfChunk(uploadUrl, { offset, total, data }) {
  const bytes = Buffer.from(data, 'base64')
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Length': String(bytes.length), 'Content-Range': `bytes ${offset}-${offset + bytes.length - 1}/${total}` },
    body: bytes
  })
  if (r.status === 308) return { done: false }
  if (!r.ok) throw new Error(`Envoi du PDF interrompu (${r.status})`)
  const json = await r.json()
  return { done: true, fileId: json.id }
}

export async function downloadFile(auth, fileId) {
  const drive = google.drive({ version: 'v3', auth })
  const [meta, content] = await Promise.all([
    drive.files.get({ fileId, fields: 'name' }),
    drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  ])
  return { name: meta.data.name, bytes: Buffer.from(content.data) }
}

// Journal des campagnes : qui a reçu quel dossier, avec les infos du fichier
// LinkedIn. La synchro s'en sert pour créer proprement dans Boond un prospect
// qui n'y est pas encore.
const LOG_NAME = 'Journal des campagnes push (ne pas supprimer).json'
const LOG_MAX = 3000

async function findLog(drive, folderId) {
  const r = await drive.files.list({
    q: `name = '${q(LOG_NAME)}' and '${folderId}' in parents and trashed = false`, fields: 'files(id)', pageSize: 1
  })
  return r.data.files?.[0]?.id || null
}

export async function readCampaignLog(auth) {
  const drive = google.drive({ version: 'v3', auth })
  const id = await findLog(drive, await campaignFolder(auth))
  if (!id) return []
  const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'text' })
  try { const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; return Array.isArray(data) ? data : [] }
  catch { return [] }
}

export async function appendCampaignLog(auth, entries) {
  if (!entries.length) return
  const drive = google.drive({ version: 'v3', auth })
  const folderId = await campaignFolder(auth)
  const id = await findLog(drive, folderId)
  const current = id ? await readCampaignLog(auth) : []
  const body = JSON.stringify([...current, ...entries].slice(-LOG_MAX), null, 1)
  const media = { mimeType: 'application/json', body }
  if (id) await drive.files.update({ fileId: id, media })
  else await drive.files.create({ requestBody: { name: LOG_NAME, parents: [folderId], mimeType: 'application/json' }, media, fields: 'id' })
}

// ── Gmail ────────────────────────────────────────────────────────────────────

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
const encodedWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n')

// Texte du mail (« **gras** », lignes « * puce ») → HTML au format de l'éditeur
// Gmail : une <div> par ligne, de vraies listes à puces.
export function mailHtml(text, signatureHtml = '') {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  const out = []
  let list = null
  for (const line of String(text).split(/\r?\n/)) {
    const bullet = line.match(/^\s*[*•-]\s+(.*)$/)
    if (bullet) { (list ||= []).push(`<li>${inline(bullet[1])}</li>`); continue }
    if (list) {
      out.push(`<ul>${list.join('')}</ul>`); list = null
      if (!line.trim()) continue   // la liste a déjà sa marge : pas de ligne vide en plus
    }
    out.push(line.trim() ? `<div>${inline(line)}</div>` : '<div><br></div>')
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`)
  const signature = signatureHtml
    ? `<div><br></div><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${signatureHtml}</div>`
    : ''
  return `<div dir="ltr">${out.join('')}${signature}</div>`
}

// Version texte brut (clients mail sans HTML) : sans les marques de gras.
const mailPlain = (text, signatureHtml) => {
  const sig = String(signatureHtml || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|tr|td)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()
  return String(text).replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*\*\s+/gm, '• ') + (sig ? `\n\n${sig}` : '')
}

// Message MIME : texte brut + HTML (avec la signature Gmail) + PDF en pièce jointe.
export function buildMime({ to, subject, text, signatureHtml, attachment }) {
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const mixed = `evert_m_${id}`, alt = `evert_a_${id}`
  const fileName = attachment.name
  const asciiName = fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[—–]/g, '-').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '')
  const part = (type, body) => [
    `Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body.replace(/\r?\n/g, '\r\n')))
  ].join('\r\n')
  return [
    `To: ${to}`,
    `Subject: ${encodedWord(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    part('text/plain', mailPlain(text, signatureHtml)),
    `--${alt}`,
    part('text/html', mailHtml(text, signatureHtml)),
    `--${alt}--`,
    `--${mixed}`,
    `Content-Type: application/pdf; name="${asciiName}"`,
    `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(attachment.bytes.toString('base64')),
    `--${mixed}--`,
    ''
  ].join('\r\n')
}

// Signature Gmail du bizdev (celle de son adresse principale). Un brouillon créé
// par l'API ne la reçoit pas automatiquement : on l'ajoute nous-mêmes.
export async function gmailSignature(auth, email) {
  try {
    const gmail = google.gmail({ version: 'v1', auth })
    const r = await gmail.users.settings.sendAs.list({ userId: 'me' })
    const list = r.data.sendAs || []
    const mine = list.find(a => a.sendAsEmail?.toLowerCase() === String(email || '').toLowerCase()) ||
      list.find(a => a.isDefault) || list.find(a => a.isPrimary)
    return mine?.signature || ''
  } catch (err) {
    console.error('Signature Gmail illisible :', err.message)
    return ''
  }
}

export async function createDraft(auth, mime) {
  const gmail = google.gmail({ version: 'v1', auth })
  const raw = Buffer.from(mime).toString('base64url')
  const r = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })
  return r.data.id
}

export const gmailClient = (auth) => google.gmail({ version: 'v1', auth })
