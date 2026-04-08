export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL

  // Vérifier que les variables sont présentes
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

  try {
    // Construire le header d'auth X-Jwt-Client-BoondManager
    const authHeader = Buffer.from(
      JSON.stringify({
        clientToken,
        clientKey,
        userToken
      })
    ).toString('base64')

    const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

    // Appel simple : récupérer le statut de l'API
    const response = await fetch(`${apiUrl}application/status`, {
      method: 'GET',
      headers: {
        'X-Jwt-Client-BoondManager': authHeader,
        'Content-Type': 'application/json'
      }
    })

    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    res.json({
      status: response.status,
      ok: response.ok,
      boond_response: data
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
