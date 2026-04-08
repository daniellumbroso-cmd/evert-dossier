export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL

  if (!clientToken || !clientKey || !userToken || !baseUrl) {
    return res.status(500).json({
      error: 'Variables manquantes',
      missing: {
        BOOND_CLIENT_TOKEN: !clientToken,
        BOOND_CLIENT_KEY: !clientKey,
        BOOND_USER_TOKEN: !userToken,
        BOOND_BASE_URL: !baseUrl
      }
    })
  }

  // Nettoyer l'URL de base
  const cleanBase = baseUrl.replace(/\/$/, '')

  // X-Jwt-Client-BoondManager : format "clientToken:clientKey:userToken" encodé en base64
  const authString = `${clientToken}:${clientKey}:${userToken}`
  const authHeader = Buffer.from(authString).toString('base64')

  const results = {}

  // Test 1 : /application/status
  try {
    const r = await fetch(`${cleanBase}/api/application/status`, {
      headers: {
        'X-Jwt-Client-BoondManager': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    const text = await r.text()
    results.status_with_api = {
      http: r.status,
      isJson: text.startsWith('{') || text.startsWith('['),
      preview: text.substring(0, 200)
    }
  } catch(e) { results.status_with_api = { error: e.message } }

  // Test 2 : sans /api/ dans l'URL
  try {
    const r = await fetch(`${cleanBase}/application/status`, {
      headers: {
        'X-Jwt-Client-BoondManager': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    const text = await r.text()
    results.status_without_api = {
      http: r.status,
      isJson: text.startsWith('{') || text.startsWith('['),
      preview: text.substring(0, 200)
    }
  } catch(e) { results.status_without_api = { error: e.message } }

  // Test 3 : Basic auth
  try {
    const basicAuth = Buffer.from(`${userToken}:`).toString('base64')
    const r = await fetch(`${cleanBase}/api/application/status`, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    const text = await r.text()
    results.basic_auth = {
      http: r.status,
      isJson: text.startsWith('{') || text.startsWith('['),
      preview: text.substring(0, 200)
    }
  } catch(e) { results.basic_auth = { error: e.message } }

  res.json({ baseUrl: cleanBase, results })
}
