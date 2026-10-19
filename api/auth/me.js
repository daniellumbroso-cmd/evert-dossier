import { getSession } from '../_session.js'

export default function handler(req, res) {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })
  res.json({ email: session.email, name: session.name, picture: session.picture })
}
