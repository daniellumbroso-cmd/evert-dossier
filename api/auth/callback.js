import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export default async function handler(req, res) {
  const { code } = req.query

  if (!code) {
    return res.status(400).json({ error: 'Missing code' })
  }

  try {
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)

    // Get user info to verify domain
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()
    const email = payload.email
    const allowedDomain = process.env.ALLOWED_DOMAIN || 'ever-t.com'

    if (!email.endsWith('@' + allowedDomain)) {
      return res.redirect('/?error=unauthorized_domain')
    }

    // Store tokens in a secure cookie (httpOnly)
    const cookieValue = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    })

    const encoded = Buffer.from(cookieValue).toString('base64')
    res.setHeader('Set-Cookie', `evert_session=${encoded}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`)
    res.redirect('/app')
  } catch (err) {
    console.error('Auth error:', err)
    res.redirect('/?error=auth_failed')
  }
}
