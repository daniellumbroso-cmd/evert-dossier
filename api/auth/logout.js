import { clearSessionCookie } from '../_session.js'

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie)
  res.redirect('/')
}
