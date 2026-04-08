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
    // 1. Opportunity ALEXI — tous les champs disponibles
    const oppRes = await fetch(`${apiUrl}opportunities/1269`, { headers })
    const oppRaw = await oppRes.json()
    const oppAttrs = oppRaw?.data?.attributes || {}
    const oppIncluded = oppRaw?.included || []

    // 2. Actions du besoin
    const oppActionsRes = await fetch(`${apiUrl}opportunities/1269/actions?page[limit]=5`, { headers })
    const oppActionsRaw = await oppActionsRes.json()

    // 3. Candidat Rudy — tous les attributs
    const candidateRes = await fetch(`${apiUrl}candidates/23358`, { headers })
    const candidateRaw = await candidateRes.json()
    const candAttrs = candidateRaw?.data?.attributes || {}

    // 4. Actions candidat
    const actionsRes = await fetch(`${apiUrl}candidates/23358/actions?page[limit]=5`, { headers })
    const actionsRaw = await actionsRes.json()

    res.json({
      opportunity: {
        all_attribute_keys: Object.keys(oppAttrs),
        title: oppAttrs.title,
        reference: oppAttrs.reference,
        description: oppAttrs.description || oppAttrs.comment || oppAttrs.text || oppAttrs.notes || 'VIDE',
        included_types: oppIncluded.map(i => i.type),
        full_attrs: JSON.stringify(oppAttrs).substring(0, 1000)
      },
      opp_actions: (oppActionsRaw?.data || []).map(a => ({
        text: (a.attributes?.text || a.attributes?.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
        date: a.attributes?.startDate
      })),
      candidate: {
        firstName: candAttrs.firstName,
        lastName: candAttrs.lastName,
        title: candAttrs.title,
        all_attribute_keys: Object.keys(candAttrs),
        numberOfResumes: candAttrs.numberOfResumes
      },
      candidate_actions: (actionsRaw?.data || []).map(a => ({
        text: (a.attributes?.text || a.attributes?.description || '').replace(/<[^>]*>/g, '').substring(0, 300),
        date: a.attributes?.startDate
      }))
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
