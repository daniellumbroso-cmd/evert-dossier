import crypto from 'crypto'

function buildBoondJWT(userToken, clientToken, clientKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', type: 'JWT' })).toString('base64').replace(/=/g, '')
  const payload = Buffer.from(JSON.stringify({
    userToken, clientToken,
    time: Math.floor(Date.now() / 1000),
    mode: 'normal'
  })).toString('base64').replace(/=/g, '')
  const signature = crypto.createHmac('sha256', clientKey)
    .update(`${header}.${payload}`).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.${signature}`
}

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // ── Sécurité : vérification session utilisateur ever"T ──
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  const apiUrl = baseUrl.replace(/\/+$/, '') // supprimer le slash final
  const opportunityId = req.query.id || '1269'

  const jwt = buildBoondJWT(userToken, clientToken, clientKey)
  const headers = { 'X-Jwt-Client-BoondManager': jwt, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  try {
    const r = await fetch(`${apiUrl}/opportunities/${opportunityId}/information`, { headers })
    const json = await r.json()
    const attrs = json?.data?.attributes
    const included = json?.included || []
    const company = included.find(i => i.type === 'company')
    const contact = included.find(i => i.type === 'contact')

    if (r.status !== 200 || !attrs) {
      return res.status(404).json({ error: 'Besoin introuvable', status: r.status })
    }

    res.status(200).json({
      opportunityId,
      title: attrs.title || '',
      company: company?.attributes?.name || '',
      contact: contact ? `${contact.attributes.firstName} ${contact.attributes.lastName}`.trim() : '',
      tjm: attrs.estimatesExcludingTax ? `${attrs.estimatesExcludingTax}€` : '',
      description: attrs.description || ''
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
