// Qui peut appeler les routes /api/agent/* :
// - un utilisateur connecté à l'app (cookie de session ever-T) ;
// - Make, avec l'en-tête « X-Agent-Key » égal au secret AGENT_API_KEY.
import crypto from 'crypto'
import { getSession } from '../_session.js'

function agentKeyOk(req) {
  const expected = process.env.AGENT_API_KEY || ''
  const given = String(req.headers?.['x-agent-key'] || '')
  if (expected.length < 32 || !given) return false
  const a = crypto.createHash('sha256').update(given).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

// Renvoie { via: 'session', email } ou { via: 'make' }, ou null (réponse 401 déjà envoyée).
export function requireAgentCaller(req, res) {
  if (agentKeyOk(req)) return { via: 'make' }
  const session = getSession(req)
  if (session) return { via: 'session', email: session.email }
  res.status(401).json({ error: 'Non authentifié' })
  return null
}
