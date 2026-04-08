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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)
  const headers = { 'X-Jwt-Client-BoondManager': jwt, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  const results = {}
  const opportunityId = req.query.id || '1269'

  // Tester les endpoints opportunity
  const variants = [
    `opportunities/${opportunityId}`,
    `opportunities/${opportunityId}/actions`,
    `opportunities/${opportunityId}/information`,
    `opportunities/${opportunityId}/positionings`,
  ]

  for (const v of variants) {
    try {
      const r = await fetch(`${apiUrl}${v}`, { headers })
      const text = await r.text()
      let data
      try { data = JSON.parse(text) } catch { data = text.substring(0, 500) }
      results[v] = {
        status: r.status,
        data: data
      }
    } catch (e) {
      results[v] = { error: e.message }
    }
  }

  res.json({ opportunityId, results })
}
