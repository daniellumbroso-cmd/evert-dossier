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

async function boondGet(apiUrl, path, headers) {
  const r = await fetch(`${apiUrl}${path}`, { headers })
  if (r.status !== 200) return { status: r.status, error: await r.text().catch(() => '') }
  return { status: 200, body: await r.json() }
}

// Cherche un candidat par nom et renvoie l'id du meilleur match
async function findCandidateId(apiUrl, headers, name) {
  const qs = new URLSearchParams({ keywords: name, state: '1', number: '10', page: '1' })
  const r = await boondGet(apiUrl, `/resources?${qs}`, headers)
  if (r.status !== 200) return null
  const rows = Array.isArray(r.body?.data) ? r.body.data : []
  const lower = name.toLowerCase()
  const parts = lower.split(' ').filter(Boolean)
  const best = rows.find(row => {
    const a = row.attributes || {}
    const full = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase()
    return parts.every(p => full.includes(p))
  }) || rows[0]
  return best ? { id: best.id, attributes: best.attributes } : null
}

// Extrait les mots-clés stack d'un profil candidat (via Claude)
async function extractCandidateProfile(anthropic, candidateInfo, profileHint) {
  const raw = JSON.stringify(candidateInfo).slice(0, 8000)
  const system = `Extrais le profil d'un consultant pour rechercher des opportunités clients pertinentes.
Réponds UNIQUEMENT par un JSON valide, sans markdown.

Format :
{
  "role": "Développeur Back-end Senior PHP/Symfony",
  "stack_keywords": ["PHP", "Symfony", "API Platform"],
  "sectors": ["presse/média", "SaaS", "e-commerce"],
  "seniority": "senior",
  "summary": "1 phrase de synthèse"
}

Règles :
- 3 à 6 keywords stack maximum, les plus distinctifs (pas de généralités comme "REST" ou "Git")
- 1 à 4 secteurs si identifiables dans l'historique
- Pas d'invention`

  const userMsg = profileHint
    ? `Profil connu (source PDF fourni par l'utilisateur) :\n${profileHint}\n\nData Boond additionnelle :\n${raw}`
    : `Données Boond du candidat :\n${raw}`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: userMsg }]
  })
  const text = r.content?.[0]?.text || '{}'
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) }
  catch { return { role: '', stack_keywords: [], sectors: [], seniority: '', summary: '' } }
}

// Score les résultats via Claude
async function scoreMatches(anthropic, profile, items, kind) {
  if (!items.length) return []
  const compact = items.map(x => ({ id: x.id, ...x.attributes })).slice(0, 30)
  const system = `Tu évalues la pertinence d'${kind === 'opportunity' ? 'une opportunité client' : 'un compte client'} pour un consultant donné.
Réponds UNIQUEMENT par un tableau JSON, sans markdown.

Format : [{ "id": "...", "score": 85, "reason": "..." }]

Règles :
- score : entier 0-100 (100 = match parfait, 0 = aucun rapport)
- reason : 1 phrase max 25 mots, en français, expliquant pourquoi (stack, secteur, séniorité)
- Conserve l'id exact
- Pas d'invention : juge sur les infos données
- Sois strict : un score 80+ doit refléter un match stack très clair`

  const userMsg = `Profil consultant :
- Rôle : ${profile.role}
- Stack : ${profile.stack_keywords.join(', ')}
- Secteurs pertinents : ${profile.sectors.join(', ')}
- Séniorité : ${profile.seniority}

${kind === 'opportunity' ? 'Opportunités' : 'Comptes clients'} à évaluer :
${JSON.stringify(compact, null, 2)}`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: userMsg }]
  })
  const text = r.content?.[0]?.text || '[]'
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) }
  catch { return [] }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { candidateName, candidateId, profileHint } = req.body || {}
  if (!candidateId && !candidateName) {
    return res.status(400).json({ error: 'candidateId ou candidateName requis' })
  }

  const clientToken = process.env.BOOND_CLIENT_TOKEN
  const clientKey = process.env.BOOND_CLIENT_KEY
  const userToken = process.env.BOOND_USER_TOKEN
  const baseUrl = process.env.BOOND_BASE_URL
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!clientToken || !clientKey || !userToken || !baseUrl || !anthropicKey) {
    return res.status(500).json({ error: 'Config manquante' })
  }

  const apiUrl = baseUrl.replace(/\/+$/, '')
  const jwt = buildBoondJWT(userToken, clientToken, clientKey)
  const headers = {
    'X-Jwt-Client-BoondManager': jwt,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  try {
    // 1. Résoudre l'id du candidat si besoin
    let resolvedId = candidateId
    let candidateHead = null
    if (!resolvedId) {
      const hit = await findCandidateId(apiUrl, headers, candidateName)
      if (!hit) return res.status(404).json({ error: `Candidat "${candidateName}" introuvable` })
      resolvedId = hit.id
      candidateHead = hit.attributes
    }

    // 2. Récupérer la fiche complète
    const info = await boondGet(apiUrl, `/resources/${resolvedId}/information`, headers)
    const candidateInfo = {
      head: candidateHead,
      attributes: info.body?.data?.attributes || {},
      included: (info.body?.included || []).slice(0, 20)
    }

    // 3. Construire le profil (Claude)
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const profile = await extractCandidateProfile(anthropic, candidateInfo, profileHint)

    // 4. Chercher opportunités par keywords (on prend le top 3 keywords, une requête chacun)
    const oppMap = new Map()
    const topKeywords = (profile.stack_keywords || []).slice(0, 3)
    for (const kw of topKeywords) {
      // Tous statuts confondus - on récupère tout et Claude filtrera
      const qs = new URLSearchParams({ keywords: kw, maxResults: '10', page: '1' })
      const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
      const rows = Array.isArray(r.body?.data) ? r.body.data : []
      for (const row of rows) {
        if (!oppMap.has(row.id)) oppMap.set(row.id, row)
      }
    }
    const opportunities = Array.from(oppMap.values())

    // 5. Chercher comptes clients par keywords
    const compMap = new Map()
    for (const kw of topKeywords) {
      const qs = new URLSearchParams({ keywords: kw, maxResults: '10', page: '1' })
      const r = await boondGet(apiUrl, `/companies?${qs}`, headers)
      const rows = Array.isArray(r.body?.data) ? r.body.data : []
      for (const row of rows) {
        if (!compMap.has(row.id)) compMap.set(row.id, row)
      }
    }
    const companies = Array.from(compMap.values())

    // 6. Scoring
    const [oppScores, compScores] = await Promise.all([
      scoreMatches(anthropic, profile, opportunities, 'opportunity'),
      scoreMatches(anthropic, profile, companies, 'company')
    ])

    const scoreOppMap = new Map(oppScores.map(x => [String(x.id), x]))
    const scoreCompMap = new Map(compScores.map(x => [String(x.id), x]))

    const rankedOpps = opportunities
      .map(o => {
        const sc = scoreOppMap.get(String(o.id))
        return {
          id: o.id,
          ...o.attributes,
          score: sc?.score ?? null,
          reason: sc?.reason || '',
          boondUrl: `https://ui.boondmanager.com/opportunities/${o.id}/information`
        }
      })
      .filter(o => (o.score ?? 0) >= 40)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

    const rankedComps = companies
      .map(c => {
        const sc = scoreCompMap.get(String(c.id))
        return {
          id: c.id,
          ...c.attributes,
          score: sc?.score ?? null,
          reason: sc?.reason || '',
          boondUrl: `https://ui.boondmanager.com/companies/${c.id}/information`
        }
      })
      .filter(c => (c.score ?? 0) >= 40)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

    // 7. Missions passées du candidat (deliveries)
    const deliv = await boondGet(apiUrl, `/resources/${resolvedId}/deliveries?maxResults=10`, headers)
    const pastMissions = (deliv.body?.data || []).slice(0, 10).map(d => ({
      id: d.id,
      ...d.attributes
    }))

    return res.status(200).json({
      candidate: {
        id: resolvedId,
        firstName: candidateInfo.attributes?.firstName || candidateHead?.firstName || '',
        lastName: candidateInfo.attributes?.lastName || candidateHead?.lastName || '',
        title: candidateInfo.attributes?.title || candidateHead?.title || '',
        boondUrl: `https://ui.boondmanager.com/resources/${resolvedId}/information`
      },
      profile,
      opportunities: rankedOpps,
      companies: rankedComps,
      pastMissions,
      counts: {
        opportunitiesScanned: opportunities.length,
        companiesScanned: companies.length,
        opportunitiesRelevant: rankedOpps.length,
        companiesRelevant: rankedComps.length
      }
    })
  } catch (e) {
    console.error('boond-match-profile error', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
