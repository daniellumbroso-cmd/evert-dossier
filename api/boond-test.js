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
    // 1. Récupérer la fiche complète de Rudy
    const candidateRes = await fetch(`${apiUrl}candidates/23358`, { headers })
    const candidateData = await candidateRes.json()
    const attrs = candidateData?.data?.attributes || {}

    // 2. Récupérer les actions de Rudy
    const actionsRes = await fetch(`${apiUrl}candidates/23358/actions?page[limit]=5`, { headers })
    const actionsData = await actionsRes.json()
    const actions = actionsData?.data || []

    // 3. Récupérer le besoin ALEXI (opportunity 1269)
    const oppRes = await fetch(`${apiUrl}opportunities/1269`, { headers })
    const oppData = await oppRes.json()
    const opp = oppData?.data?.attributes || {}

    res.json({
      success: true,
      candidate: {
        id: '23358',
        nom: `${attrs.firstName} ${attrs.lastName}`,
        titre: attrs.title,
        skills: attrs.skills?.substring(0, 500),
        experiences: attrs.references?.map(r => ({
          titre: r.title,
          entreprise: r.company,
          description: r.description?.substring(0, 300),
          periode: `${r.startMonth}/${r.startYear} - ${r.endMonth}/${r.endYear}`
        }))
      },
      actions: actions.map(a => ({
        titre: a.attributes?.title,
        description: a.attributes?.description?.substring(0, 400),
        date: a.attributes?.date
      })),
      opportunity_ALEXI: {
        id: '1269',
        titre: opp.title,
        description: opp.description?.substring(0, 800),
        skills: opp.skills,
        state: opp.state,
        startDate: opp.startDate
      }
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
