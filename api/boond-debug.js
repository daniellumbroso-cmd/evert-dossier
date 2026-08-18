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

  // Strip récursif des champs lourds (binaire base64, HTML géant, etc.)
  // pour éviter les réponses > 4.5 MB qui font crasher Vercel en 413
  const MAX_STR = 2000
  const MAX_ARR = 5
  function trim(node, depth = 0) {
    if (depth > 6) return '[deep tree truncated]'
    if (node === null || node === undefined) return node
    if (typeof node === 'string') {
      if (node.length > MAX_STR) {
        return node.slice(0, MAX_STR) + `… [truncated, ${node.length} chars total]`
      }
      return node
    }
    if (typeof node !== 'object') return node
    if (Array.isArray(node)) {
      const head = node.slice(0, MAX_ARR).map(x => trim(x, depth + 1))
      if (node.length > MAX_ARR) head.push(`… +${node.length - MAX_ARR} entrées non affichées`)
      return head
    }
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      if (/^(content|file|base64|binary|raw)$/i.test(k) && typeof v === 'string' && v.length > 500) {
        out[k] = `[binaire ${v.length} chars — stripped]`
        continue
      }
      out[k] = trim(v, depth + 1)
    }
    return out
  }

  // Tous les sous-endpoints liés au candidat
  const endpoints = [
    `/resources/${resourceId}/information`,
    `/resources/${resourceId}/rights`,
    `/resources/${resourceId}/positionings?maxResults=5`,
    `/resources/${resourceId}/deliveries?maxResults=5`,
    `/resources/${resourceId}/actions?maxResults=5`,
    `/resources/${resourceId}/documents?maxResults=5`,
    `/resources/${resourceId}/notes?maxResults=5`,
    `/resources/${resourceId}/tasks?maxResults=5`,
    `/resources/${resourceId}/administrative`,
    `/resources/${resourceId}/cv`
  ]

  const results = await Promise.all(endpoints.map(p => fetchSafe(`${apiUrl}${p}`, headers)))

  return res.status(200).json({
    resourceId,
    searchHit: trim(searchResult?.body?.data?.find(r => String(r.id) === String(resourceId)) || null),
    endpoints: results.reduce((acc, r) => {
      const lastSeg = r.url.split('?')[0].split('/').slice(-1)[0] || 'root'
      acc[lastSeg] = {
        status: r.status,
        body: trim(r.body),
        error: r.error
      }
      return acc
    }, {})
  })
}
