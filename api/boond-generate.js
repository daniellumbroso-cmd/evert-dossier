import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { candidateId, opportunityId, community } = req.body
  if (!candidateId) return res.status(400).json({ error: 'candidateId requis' })

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  const apiUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)
  const headers = { 'X-Jwt-Client-BoondManager': jwt, 'Content-Type': 'application/json', 'Accept': 'application/json' }

  try {
    // 1. Récupérer la fiche candidat
    const candidateRes = await fetch(`${apiUrl}candidates/${candidateId}`, { headers })
    const candidateData = await candidateRes.json()
    const attrs = candidateData?.data?.attributes || {}

    // 2. Récupérer les actions (compte-rendus)
    const actionsRes = await fetch(`${apiUrl}candidates/${candidateId}/actions?page[limit]=10`, { headers })
    const actionsData = await actionsRes.json()
    const actions = (actionsData?.data || [])
      .map(a => a.attributes?.text || a.attributes?.description || '')
      .filter(Boolean)
      .join('\n\n')
      .replace(/<[^>]*>/g, '') // Nettoyer le HTML
      .substring(0, 2000)

    // 3. Récupérer le besoin client si fourni
    let opportunityText = ''
    if (opportunityId) {
      const oppRes = await fetch(`${apiUrl}opportunities/${opportunityId}`, { headers })
      const oppData = await oppRes.json()
      const opp = oppData?.data?.attributes || {}
      opportunityText = `BESOIN CLIENT : ${opp.title || ''}\nRéférence : ${opp.reference || ''}\nCompétences requises : ${opp.skills || ''}`
    }

    // 4. Construire le texte CV depuis la fiche Boond
    const experiences = (attrs.references || []).map(r =>
      `${r.title} - ${r.company} (${r.startMonth}/${r.startYear} - ${r.endMonth || 'présent'}/${r.endYear || ''})\n${r.description || ''}`
    ).join('\n\n')

    const cvText = `
NOM : ${attrs.firstName} ${attrs.lastName}
TITRE : ${attrs.title || ''}
LOCALISATION : ${attrs.town || ''}, ${attrs.country || ''}
EXPÉRIENCE : ${attrs.experience || ''} ans

COMPÉTENCES : ${attrs.skills || ''}

EXPÉRIENCES :
${experiences}

FORMATIONS :
${(attrs.diplomas || []).join('\n')}

LANGUES :
${(attrs.languages || []).map(l => `${l.language} - ${l.level}`).join('\n')}

NOTES ENTRETIEN :
${actions || 'Aucune note disponible'}
`.trim()

    // 5. Appel Claude pour générer le dossier
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Récupérer le SYSTEM_PROMPT depuis generate.js (on l'importe pas, on le redéfinit simplement)
    const systemPrompt = `Tu es un expert en rédaction de dossiers de compétences pour Ever"T, une ESN tech IA-native (Humilité. Progrès. Engagement).
Génère un dossier de compétences Ever"T complet en JSON valide depuis les données d'un candidat Boondmanager.
Respecte exactement le même format JSON que d'habitude.
RÈGLE ABSOLUE ANTI-INVENTION : uniquement ce qui est dans les données fournies.
RÉPONDS UNIQUEMENT EN JSON valide, sans backticks.`

    const userMessage = `Génère le dossier de compétences Ever"T.
Communauté : ${community || 'Product'}
${opportunityText ? opportunityText + '\n' : ''}
DONNÉES CANDIDAT BOOND :
${cvText}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })

    const raw = response.content.map(b => b.text || '').join('')
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    const dossier = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))

    res.json({ success: true, dossier, source: 'boond', candidateId, opportunityId })

  } catch (err) {
    console.error('Boond generate error:', err)
    res.status(500).json({ error: err.message })
  }
}
