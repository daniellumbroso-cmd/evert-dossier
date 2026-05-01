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

// Demande à Claude de traduire la requête en langage naturel
// en paramètres exploitables par l'API Boond /resources.
async function parseQueryToBoondParams(anthropic, query) {
  const system = `Tu traduis une requête de recrutement en français en paramètres pour l'API Boond.
Réponds UNIQUEMENT par un objet JSON valide, sans markdown, sans commentaire.

Format attendu :
{
  "keywords": "string",         // mots-clés techniques pour la recherche full-text (techno, métier, séniorité)
  "state": 1,                   // 1 = candidat actif (toujours 1 sauf demande explicite)
  "typeOf": null,               // null par défaut, sinon "freelance" ou "cdi" si explicitement demandé
  "place": null                 // ville/région si explicitement mentionnée, sinon null
}

Règles :
- "keywords" doit contenir les technologies (ex: "Azure", "dbt", "Kotlin"), le métier (ex: "Data Engineer", "Tech Lead Android"), la séniorité (ex: "senior")
- N'invente rien : si l'info n'est pas dans la requête, mets null
- Pas de phrase, juste les mots-clés séparés par espaces
- Le JSON doit être strictement parsable`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: query }]
  })
  const text = r.content?.[0]?.text || '{}'
  // Strip éventuels fences markdown au cas où
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    return { keywords: query, state: 1, typeOf: null, place: null }
  }
}

// Score + analyse rapide des candidats par Claude
async function rankCandidates(anthropic, query, candidates) {
  if (!candidates.length) return []

  const compact = candidates.map(c => ({
    id: c.id,
    title: c.title || '',
    available: c.available || '',
    state: c.state || ''
  }))

  const system = `Tu évalues la pertinence de candidats pour une demande de recrutement.
Réponds UNIQUEMENT par un tableau JSON valide, sans markdown.

Format : [{ "id": "...", "score": 85, "analysis": "..." }]

Règles :
- score : entier 0-100 reflétant l'adéquation (techno, séniorité, dispo)
- analysis : 1 phrase courte (max 20 mots) expliquant le match
- Conserve l'id exact du candidat
- Ordre conservé, pas besoin de trier
- Pas d'invention : juge uniquement sur les infos données`

  const userMsg = `Requête : "${query}"

Candidats :
${JSON.stringify(compact, null, 2)}`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: userMsg }]
  })
  const text = r.content?.[0]?.text || '[]'
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth (même pattern que les autres endpoints protégés)
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { query } = req.body || {}
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Requête vide' })
  }

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!clientToken || !clientKey || !userToken || !baseUrl) {
    return res.status(500).json({ error: 'Config Boond manquante' })
  }
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Config Anthropic manquante' })
  }

  const apiUrl = baseUrl.replace(/\/+$/, '')

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // 1. Parsing de la requête NL → params Boond
    const params = await parseQueryToBoondParams(anthropic, query.trim())

    // 2. Construction de l'URL /resources
    const qs = new URLSearchParams()
    if (params.keywords) qs.set('keywords', params.keywords)
    qs.set('state', String(params.state ?? 1))
    qs.set('number', '20')
    qs.set('page', '1')
    if (params.place) qs.set('place', params.place)
    // typeOf : Boond utilise des codes numériques selon la config — on ne pousse que si explicite
    if (params.typeOf) qs.set('typeOf', String(params.typeOf))

    const jwt = buildBoondJWT(userToken, clientToken, clientKey)
    const headers = {
      'X-Jwt-Client-BoondManager': jwt,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    const boondUrl = `${apiUrl}/resources?${qs.toString()}`
    const r = await fetch(boondUrl, { headers })

    if (r.status !== 200) {
      const txt = await r.text().catch(() => '')
      return res.status(502).json({
        error: 'Erreur API Boond',
        status: r.status,
        detail: txt.slice(0, 500)
      })
    }

    const json = await r.json()
    const rows = Array.isArray(json?.data) ? json.data : []

    const candidates = rows.map(item => {
      const a = item.attributes || {}
      return {
        id: String(item.id),
        firstName: a.firstName || '',
        lastName: a.lastName || '',
        title: a.title || '',
        available: a.available || '',
        state: a.state || ''
      }
    })

    // 3. Scoring Claude (skip si pas de candidats)
    const ranking = await rankCandidates(anthropic, query.trim(), candidates)
    const rankMap = new Map(ranking.map(x => [String(x.id), x]))

    const enriched = candidates
      .map(c => {
        const rk = rankMap.get(c.id)
        return {
          ...c,
          score: rk?.score ?? null,
          analysis: rk?.analysis || '',
          boondUrl: `https://ui.boondmanager.com/resources/${c.id}/information`
        }
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

    return res.status(200).json({
      query: query.trim(),
      params,
      total: enriched.length,
      candidates: enriched
    })
  } catch (e) {
    console.error('boond-search error', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
