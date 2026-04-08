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

  const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

  // Format correct du JWT Boond : clientToken:clientKey:userToken en base64
  const credentials = `${clientToken}:${clientKey}:${userToken}`
  const authHeader = Buffer.from(credentials).toString('base64')

  try {
    const response = await fetch(`${apiUrl}application/status`, {
      method: 'GET',
      headers: {
        'X-Jwt-Client-BoondManager': authHeader,
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
      auth_format: 'clientToken:clientKey:userToken → base64',
      boond_response: data
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
