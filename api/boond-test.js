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
  const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)

  const headers = {
    'X-Jwt-Client-BoondManager': jwt,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  try {
    // 1. Chercher Rudy TIEKOURA par nom
    const searchRes = await fetch(
      `${apiUrl}candidates?keywords=TIEKOURA&page[limit]=5`,
      { headers }
    )
    const searchData = await searchRes.json()
    const candidates = searchData?.data || []

    if (candidates.length === 0) {
      return res.json({ message: 'Aucun candidat trouvé pour TIEKOURA', searchData })
    }

    // Prendre le premier résultat
    const candidate = candidates[0]
    const candidateId = candidate.id
    const attrs = candidate.attributes

    // 2. Récupérer les actions (compte-rendus) du candidat
    const actionsRes = await fetch(
      `${apiUrl}candidates/${candidateId}/actions?page[limit]=10`,
      { headers }
    )
    const actionsData = await actionsRes.json()
    const actions = actionsData?.data || []

    // 3. Récupérer les positionings du candidat
    const posRes = await fetch(
      `${apiUrl}positionings?candidateId=${candidateId}&page[limit]=10`,
      { headers }
    )
    const posData = await posRes.json()
    const positionings = posData?.data || []

    res.json({
      success: true,
      candidate: {
        id: candidateId,
        nom: `${attrs.firstName} ${attrs.lastName}`,
        titre: attrs.title,
        skills: attrs.skills,
        experiences: attrs.references?.map(r => ({
          titre: r.title,
          entreprise: r.company,
          description: r.description?.substring(0, 200),
          periode: `${r.startMonth}/${r.startYear} - ${r.endMonth}/${r.endYear}`
        })),
        langues: attrs.languages,
        diplomes: attrs.diplomas
      },
      actions_count: actions.length,
      actions_preview: actions.slice(0, 3).map(a => ({
        titre: a.attributes?.title,
        description: a.attributes?.description?.substring(0, 300),
        date: a.attributes?.date
      })),
      positionings_count: positionings.length,
      positionings: positionings.map(p => ({
        id: p.id,
        opportunity: p.relationships?.opportunity?.data?.id,
        state: p.attributes?.state
      }))
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
