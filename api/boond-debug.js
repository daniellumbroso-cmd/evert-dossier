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

// Tente plusieurs endpoints liés à un candidat et dump tout en vrac
async function fetchSafe(url, headers) {
  try {
    const r = await fetch(url, { headers })
    const status = r.status
    let body = null
    try { body = await r.json() }
    catch { body = await r.text().catch(() => null) }
    return { url, status, body }
  } catch (e) {
    return { url, status: 'ERR', error: e.message }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  if (!clientToken || !clientKey || !userToken || !baseUrl) {
    return res.status(500).json({ error: 'Config Boond manquante' })
  }

  const apiUrl = baseUrl.replace(/\/+$/, '')
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)
  const headers = {
    'X-Jwt-Client-BoondManager': jwt,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  // Permet ?id=XXX (raccourci) ou ?name=Gilbert%20Tran (recherche)
  const id = req.query.id
  const name = req.query.name || (!id ? 'Gilbert Tran' : null)

  let resourceId = id
  let searchResult = null

  if (!resourceId && name) {
    // Recherche par nom
    const qs = new URLSearchParams({ keywords: name, state: '1', number: '5', page: '1' })
    searchResult = await fetchSafe(`${apiUrl}/resources?${qs}`, headers)
    const rows = Array.isArray(searchResult.body?.data) ? searchResult.body.data : []
    // On prend celui dont le nom matche le mieux le prénom + nom recherché
    const lower = name.toLowerCase()
    const best = rows.find(r => {
      const a = r.attributes || {}
      const fullname = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase()
      return fullname.includes(lower.split(' ')[0]) && fullname.includes(lower.split(' ').slice(-1)[0])
    }) || rows[0]
    resourceId = best?.id
  }

  if (!resourceId) {
    return res.status(404).json({
      error: 'Candidat introuvable',
      searchResult
    })
  }

  // Tous les sous-endpoints liés au candidat
  const endpoints = [
    `/resources/${resourceId}/information`,
    `/resources/${resourceId}/rights`,
    `/resources/${resourceId}/positionings`,
    `/resources/${resourceId}/deliveries`,
    `/resources/${resourceId}/actions`,
    `/resources/${resourceId}/documents`,
    `/resources/${resourceId}/notes`,
    `/resources/${resourceId}/tasks`,
    `/resources/${resourceId}/administrative`,
    `/resources/${resourceId}/cv`
  ]

  const results = await Promise.all(endpoints.map(p => fetchSafe(`${apiUrl}${p}`, headers)))

  return res.status(200).json({
    resourceId,
    searchHit: searchResult?.body?.data?.find(r => String(r.id) === String(resourceId)) || null,
    endpoints: results.reduce((acc, r) => {
      const key = r.url.split('/').slice(-1)[0] || 'root'
      acc[key] = { status: r.status, body: r.body, error: r.error }
      return acc
    }, {})
  })
}
