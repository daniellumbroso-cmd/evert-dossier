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
    // 1. Fiche complète de Rudy — inspecter la structure brute
    const candidateRes = await fetch(`${apiUrl}candidates/23358`, { headers })
    const candidateRaw = await candidateRes.json()

    // 2. Actions de Rudy — inspecter la structure brute
    const actionsRes = await fetch(`${apiUrl}candidates/23358/actions?page[limit]=3`, { headers })
    const actionsRaw = await actionsRes.json()

    // 3. Opportunity ALEXI
    const oppRes = await fetch(`${apiUrl}opportunities/1269`, { headers })
    const oppRaw = await oppRes.json()

    // Retourner les structures brutes pour diagnostic
    res.json({
      candidate_keys: Object.keys(candidateRaw),
      candidate_data_keys: candidateRaw.data ? Object.keys(candidateRaw.data) : 'no data key',
      candidate_attributes_sample: candidateRaw.data?.attributes
        ? Object.keys(candidateRaw.data.attributes).slice(0, 15)
        : candidateRaw.data ? JSON.stringify(candidateRaw.data).substring(0, 300) : 'no data',
      candidate_firstName: candidateRaw.data?.attributes?.firstName
        || candidateRaw.attributes?.firstName
        || candidateRaw.data?.firstName
        || '?',

      actions_keys: Object.keys(actionsRaw),
      actions_data_sample: actionsRaw.data?.[0]
        ? JSON.stringify(actionsRaw.data[0]).substring(0, 400)
        : 'no actions data',

      opp_keys: Object.keys(oppRaw),
      opp_title: oppRaw.data?.attributes?.title || oppRaw.attributes?.title || '?',
      opp_description_preview: (oppRaw.data?.attributes?.description || oppRaw.attributes?.description || 'vide')?.substring(0, 300),
      opp_sample: JSON.stringify(oppRaw.data?.attributes || {}).substring(0, 500)
    })

  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 300) })
  }
}
