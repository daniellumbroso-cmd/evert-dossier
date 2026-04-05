export default function handler(req, res) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const session = JSON.parse(Buffer.from(cookie, 'base64').toString())
    res.json({ email: session.email, name: session.name, picture: session.picture })
  } catch {
    res.status(401).json({ error: 'Invalid session' })
  }
}
