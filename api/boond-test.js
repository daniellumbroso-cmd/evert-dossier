import crypto from 'crypto'

function buildBoondJWT(userToken, clientToken, clientKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', type: 'JWT' })).toString('base64').replace(/=/g, '')
  const payload = Buffer.from(JSON.stringify({
    userToken,
    clientToken,
    time: Math.floor(Date.now() / 1000),
    mode: 'normal'
  })).toString('base64').replace(/=/g, '')

  const signature = crypto
    .createHmac('sha256', clientKey)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${payload}.${signature}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL

  if (!clientToken || !clientKey || !userToken || !baseUrl) {
    return res.status(500).json({
      error: 'Variables manquantes',
      missing: { BOOND_CLIENT_TOKEN: !clientToken, BOOND_CLIENT_KEY: !clientKey, BOOND_USER_TOKEN: !userToken, BOOND_BASE_URL: !baseUrl }
    })
  }

  const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)

  try {
    // Test 1 : appel /candidates avec limit 3
    const response = await fetch(`${apiUrl}candidates?page[limit]=3`, {
      method: 'GET',
      headers: {
        'X-Jwt-Client-BoondManager': jwt,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = text.substring(0, 500) }

    res.json({
      status: response.status,
      ok: response.ok,
      candidates_count: data?.data?.length || 0,
      first_candidate: data?.data?.[0]?.attributes || null,
      raw_preview: response.ok ? undefined : data
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
