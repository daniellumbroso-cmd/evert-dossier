import { OAuth2Client } from 'google-auth-library'
import { sessionCookie, isAllowedEmail, readCookie, OAUTH_STATE_COOKIE } from '../_session.js'

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

const clearState = `${OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0`

export default async function handler(req, res) {
  const { code, state } = req.query

  if (!code) {
    return res.status(400).json({ error: 'Missing code' })
  }
  // Le retour Google doit porter la valeur posée par /api/auth/login
  const expected = readCookie(req, OAUTH_STATE_COOKIE)
  if (!state || !expected || state !== expected) {
    res.setHeader('Set-Cookie', clearState)
    return res.redirect('/?error=auth_failed')
  }

  try {
    const { tokens } = await client.getToken(code)

    // Get user info to verify domain
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    const payload = ticket.getPayload()

    if (!payload.email_verified || !isAllowedEmail(payload.email)) {
      res.setHeader('Set-Cookie', clearState)
      return res.redirect('/?error=unauthorized_domain')
    }

    // Cookie chiffré et signé : les jetons Google n'y sont plus lisibles
    res.setHeader('Set-Cookie', [clearState, sessionCookie({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    })])
    res.redirect('/app')
  } catch (err) {
    console.error('Auth error:', err.message)
    res.setHeader('Set-Cookie', clearState)
    res.redirect('/?error=auth_failed')
  }
}
