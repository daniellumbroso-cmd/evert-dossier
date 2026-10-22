// Session partagée par toutes les routes.
//
// Le cookie evert_session est chiffré et authentifié (AES-256-GCM, clé tirée de
// SESSION_SECRET) : impossible à lire (les jetons Google y sont) et impossible à
// fabriquer ou modifier sans le secret. Le préfixe « _ » empêche Vercel d'en
// faire une route publique.
import crypto from 'crypto'

const COOKIE = 'evert_session'
const MAX_AGE = 86400 // 24 h

function key() {
  const secret = process.env.SESSION_SECRET || ''
  // Sans secret solide, aucune session n'est acceptée : on refuse plutôt que d'ouvrir.
  if (secret.length < 32) throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum)')
  return crypto.createHash('sha256').update(secret).digest()
}

// Domaines autorisés : ALLOWED_DOMAIN accepte une liste séparée par des virgules.
export function allowedDomains() {
  return String(process.env.ALLOWED_DOMAIN || 'ever-t.fr')
    .split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
}

export function isAllowedEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1]
  return !!domain && allowedDomains().includes(domain)
}

function seal(data) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map(b => b.toString('base64url')).join('.')
}

function unseal(value) {
  const [iv, tag, body] = String(value).split('.').map(p => Buffer.from(p || '', 'base64url'))
  if (!iv?.length || !tag?.length || !body?.length) return null
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'))
}

function readCookie(req, name) {
  if (req.cookies) return req.cookies[name]
  const m = String(req.headers?.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : undefined
}

// Session valide (non expirée, domaine autorisé) ou null.
export function getSession(req) {
  const value = readCookie(req, COOKIE)
  if (!value) return null
  try {
    const s = unseal(value)
    if (!s || !(s.exp > Date.now()) || !isAllowedEmail(s.email)) return null
    return s
  } catch {
    // Cookie altéré, ancien format en clair ou secret changé
    return null
  }
}

export function sessionCookie(data) {
  const value = seal({ ...data, exp: Date.now() + MAX_AGE * 1000 })
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`
}

export const clearSessionCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`

// Anti-CSRF du login Google : valeur aléatoire posée en cookie et renvoyée par Google.
export const OAUTH_STATE_COOKIE = 'evert_oauth_state'
export { readCookie }
