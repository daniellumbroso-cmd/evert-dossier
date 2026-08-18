import crypto from 'crypto'
import formidable from 'formidable'
import fs from 'fs'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  api: { bodyParser: false },
  maxDuration: 300
}

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
  try {
    const r = await fetch(`${apiUrl}${path}`, { headers })
    if (r.status !== 200) return { status: r.status, body: null }
    return { status: 200, body: await r.json() }
  } catch (e) {
    return { status: 0, body: null, error: e.message }
  }
}

// Claude extrait le profil du consultant à partir du texte du dossier PDF
async function extractProfileFromPdf(anthropic, pdfText) {
  const text = (pdfText || '').slice(0, 15000)
  const system = `Extrais le profil d'un consultant à partir de son dossier de compétences.
Réponds UNIQUEMENT par un JSON valide, sans markdown, sans commentaire.

Format :
{
  "firstName": "Alexandre",
  "lastName": "Hunault",
  "role": "Développeur Back-end Senior PHP / Symfony",
  "stack_keywords": ["PHP", "Symfony", "API Platform", "PostgreSQL", "RabbitMQ"],
  "sectors": ["presse/média", "SaaS anti-fraude", "e-commerce"],
  "clients_past": ["Le Monde", "Bayard", "Chaynon"],
  "seniority": "senior",
  "experience_years": 15,
  "summary": "1-2 phrases synthèse du profil"
}

Règles :
- 4 à 8 keywords stack, les plus distinctifs (évite "Git", "REST", "Agile" = trop généraux)
- Secteurs = domaines métier des clients passés
- clients_past : marques déjà servies (pour éviter de re-pusher chez le même)
- Pas d'invention, si absent → null ou tableau vide`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: `Dossier de compétences :\n\n${text}` }]
  })
  const raw = r.content?.[0]?.text || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) }
  catch { return { firstName: '', lastName: '', role: '', stack_keywords: [], sectors: [], clients_past: [], seniority: '', experience_years: 0, summary: '' } }
}

// Récupère le référent (contact principal) d'un compte via /companies/{id}/information
async function fetchCompanyContact(apiUrl, headers, companyId) {
  const r = await boondGet(apiUrl, `/companies/${companyId}/information`, headers)
  if (r.status !== 200) return null
  const included = Array.isArray(r.body?.included) ? r.body.included : []
  // Cherche le premier contact dans les included
  const contact = included.find(i => i.type === 'contact' || i.type === 'contacts')
  if (!contact) return null
  const a = contact.attributes || {}
  return {
    id: contact.id,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    function: a.function || a.functionType || '',
    email: a.email1 || a.email || '',
    phone: a.phoneNumber1 || a.phone || a.mobileNumber || ''
  }
}

// Scoring d'une liste (opportunités OU comptes) via Claude
async function scoreItems(anthropic, profile, items, kind) {
  if (!items.length) return []
  const compact = items.slice(0, 40).map(x => {
    const a = x.attributes || {}
    return kind === 'opportunity'
      ? {
          id: x.id,
          title: a.title || '',
          reference: a.reference || '',
          state: a.state,
          company: a.company || a.companyName || '',
          description: (a.description || '').slice(0, 400)
        }
      : {
          id: x.id,
          name: a.name || '',
          activityArea: a.activityArea || '',
          town: a.town || a.city || '',
          description: (a.description || '').slice(0, 300)
        }
  })

  const kindLabel = kind === 'opportunity' ? 'opportunité client' : 'compte client'
  const clientsPastStr = (profile.clients_past || []).join(', ') || 'aucun connu'
  const system = `Tu évalues la pertinence d'une ${kindLabel} pour PUSHER PROACTIVEMENT le profil d'un consultant.

Réponds UNIQUEMENT par un tableau JSON, sans markdown.

Format : [{ "id": "...", "score": 85, "reason": "..." }]

Règles :
- score : entier 0-100
  * 80+ = match stack + secteur très clair, opportunité pertinente immédiatement
  * 60-79 = match stack correct, potentiel à creuser
  * 40-59 = match partiel, à considérer sans urgence
  * < 40 = à écarter, ne pas inclure dans la réponse
- reason : 1 phrase FR max 25 mots, cite explicitement pourquoi (techno commune, secteur, contexte)
- Sois strict : ne mets pas 80+ juste parce qu'un mot-clé matche
- Évite les scores élevés pour les clients où le consultant a DÉJÀ travaillé (clients passés : ${clientsPastStr})
- Conserve l'id exact`

  const userMsg = `Profil consultant à pusher :
- Rôle : ${profile.role}
- Stack : ${(profile.stack_keywords || []).join(', ')}
- Secteurs de prédilection : ${(profile.sectors || []).join(', ')}
- Séniorité : ${profile.seniority} (${profile.experience_years || '?'} ans XP)
- Synthèse : ${profile.summary}

${kindLabel === 'opportunité client' ? 'Opportunités' : 'Comptes'} à évaluer :
${JSON.stringify(compact, null, 2)}`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: userMsg }]
  })
  const raw = r.content?.[0]?.text || '[]'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) }
  catch { return [] }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

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
  const boondHeaders = {
    'X-Jwt-Client-BoondManager': jwt,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  const form = formidable({ maxFileSize: 15 * 1024 * 1024 })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Erreur upload : ' + err.message })

    try {
      const pdfFile = files.pdf?.[0]
      const pastedText = fields.pdfText?.[0] || ''
      let pdfText = pastedText

      if (pdfFile) {
        const buf = fs.readFileSync(pdfFile.filepath)
        const parsed = await pdfParse(buf)
        pdfText = parsed.text || ''
      }

      if (!pdfText.trim()) {
        return res.status(400).json({ error: 'Aucun contenu PDF exploitable' })
      }

      const anthropic = new Anthropic({ apiKey: anthropicKey })

      // 1. Extraction profil depuis le PDF
      const profile = await extractProfileFromPdf(anthropic, pdfText)

      // 2. Scan Boond : opportunités + comptes sur les top keywords
      const topKeywords = (profile.stack_keywords || []).slice(0, 4)
      if (!topKeywords.length) {
        return res.status(200).json({
          profile, opportunities: [], companies: [],
          counts: { opportunitiesScanned: 0, companiesScanned: 0 },
          warning: 'Aucun keyword stack extrait du PDF — impossible de scanner Boond.'
        })
      }

      const oppMap = new Map()
      const compMap = new Map()

      for (const kw of topKeywords) {
        const qs = new URLSearchParams({ keywords: kw, maxResults: '15', page: '1' })
        // Opportunités
        const oppR = await boondGet(apiUrl, `/opportunities?${qs}`, boondHeaders)
        for (const row of (oppR.body?.data || [])) {
          if (!oppMap.has(row.id)) oppMap.set(row.id, row)
        }
        // Comptes
        const compR = await boondGet(apiUrl, `/companies?${qs}`, boondHeaders)
        for (const row of (compR.body?.data || [])) {
          if (!compMap.has(row.id)) compMap.set(row.id, row)
        }
      }

      const opportunities = Array.from(oppMap.values())
      const companies = Array.from(compMap.values())

      // 3. Scoring par Claude
      const [oppScores, compScores] = await Promise.all([
        scoreItems(anthropic, profile, opportunities, 'opportunity'),
        scoreItems(anthropic, profile, companies, 'company')
      ])
      const oppMapScore = new Map(oppScores.map(x => [String(x.id), x]))
      const compMapScore = new Map(compScores.map(x => [String(x.id), x]))

      // 4. Enrichissement : split opportunités par statut, fetch contacts pour comptes ≥ 60
      const rawOpps = opportunities
        .map(o => {
          const sc = oppMapScore.get(String(o.id))
          const a = o.attributes || {}
          return {
            id: o.id,
            title: a.title || '',
            reference: a.reference || '',
            state: a.state,
            company: a.company || a.companyName || '',
            companyId: a.companyId || null,
            startDate: a.startDate || '',
            score: sc?.score ?? null,
            reason: sc?.reason || '',
            boondUrl: `https://ui.boondmanager.com/opportunities/${o.id}/information`
          }
        })
        .filter(o => (o.score ?? 0) >= 40)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

      // Séparation par statut : 1=en cours, 2=won, 3=lost, 0=abandonné, autres
      const oppsOpen = rawOpps.filter(o => String(o.state) === '1')
      const oppsClosed = rawOpps.filter(o => ['2', '3', '0'].includes(String(o.state)))
      const oppsOther = rawOpps.filter(o => !['0', '1', '2', '3'].includes(String(o.state)))

      // Comptes ≥ 40 avec fetch contact pour les top ≥ 60
      const rankedComps = companies
        .map(c => {
          const sc = compMapScore.get(String(c.id))
          const a = c.attributes || {}
          return {
            id: c.id,
            name: a.name || '',
            activityArea: a.activityArea || '',
            town: a.town || a.city || '',
            score: sc?.score ?? null,
            reason: sc?.reason || '',
            boondUrl: `https://ui.boondmanager.com/companies/${c.id}/information`,
            contact: null
          }
        })
        .filter(c => (c.score ?? 0) >= 40)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

      // Fetch contact référent pour les 10 premiers comptes ≥ 60
      const topComps = rankedComps.filter(c => c.score >= 60).slice(0, 10)
      await Promise.all(topComps.map(async c => {
        c.contact = await fetchCompanyContact(apiUrl, boondHeaders, c.id)
      }))

      return res.status(200).json({
        profile,
        opportunitiesOpen: oppsOpen,
        opportunitiesClosed: oppsClosed,
        opportunitiesOther: oppsOther,
        companies: rankedComps,
        counts: {
          keywordsUsed: topKeywords,
          opportunitiesScanned: opportunities.length,
          companiesScanned: companies.length,
          opportunitiesRelevant: rawOpps.length,
          companiesRelevant: rankedComps.length
        }
      })
    } catch (e) {
      console.error('boond-push-leads error', e)
      return res.status(500).json({ error: e.message || 'Erreur serveur' })
    }
  })
}
