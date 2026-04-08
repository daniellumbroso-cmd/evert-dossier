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

  // Tester différentes variantes du download-center pour trouver le CV
  const variants = [
    `download-center?typeOf=candidate&id=23358`,
    `download-center?candidateId=23358`,
    `download-center?resourceId=23358&resourceType=candidate`,
    `candidates/23358/files`,
    `candidates/23358/documents`,
    `candidates/23358?include=files`,
    `candidates/23358?include=resumes`,
  ]

  for (const v of variants) {
    try {
      const r = await fetch(`${apiUrl}${v}`, { headers })
      const text = await r.text()
      let data
      try { data = JSON.parse(text) } catch { data = text.substring(0, 200) }
      results[v] = {
        status: r.status,
        has_data: Array.isArray(data?.data) ? data.data.length : 'n/a',
        preview: JSON.stringify(data).substring(0, 200)
      }
    } catch (e) {
      results[v] = { error: e.message }
    }
  }

  res.json(results)
}
