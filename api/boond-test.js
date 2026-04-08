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

  try {
    // Tester les différents endpoints pour récupérer le CV PDF de Rudy
    const results = {}

    // Option 1 : /candidates/{id}/resumes
    const r1 = await fetch(`${apiUrl}candidates/23358/resumes`, { headers })
    results.resumes_status = r1.status
    if (r1.ok) {
      const d = await r1.json()
      results.resumes_data = JSON.stringify(d).substring(0, 500)
    }

    // Option 2 : /download-center avec le candidat
    const r2 = await fetch(`${apiUrl}download-center?resourceTypeOf=candidate&resourceId=23358`, { headers })
    results.download_center_status = r2.status
    if (r2.ok) {
      const d = await r2.json()
      results.download_center_data = JSON.stringify(d).substring(0, 500)
    }

    // Option 3 : /candidates/{id} — chercher les relationships
    const r3 = await fetch(`${apiUrl}candidates/23358`, { headers })
    const d3 = await r3.json()
    results.relationships = JSON.stringify(d3?.data?.relationships || {}).substring(0, 500)

    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
