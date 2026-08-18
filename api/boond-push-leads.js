import crypto from 'crypto'
import formidable from 'formidable'
import fs from 'fs'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  api: { bodyParser: false },
  maxDuration: 300
}

// ── Cache mémoire pour la pagination ──
const SESSION_CACHE = new Map()
const CACHE_TTL_MS = 20 * 60 * 1000

function cleanCache() {
  const now = Date.now()
  for (const [k, v] of SESSION_CACHE.entries()) {
    if (now - v.scannedAt > CACHE_TTL_MS) SESSION_CACHE.delete(k)
  }
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

async function extractProfileFromPdf(anthropic, pdfText) {
  const text = (pdfText || '').slice(0, 15000)
  const system = `Extrais le profil d'un consultant à partir de son dossier de compétences.
Réponds UNIQUEMENT par un JSON valide, sans markdown.

Format :
{
  "firstName": "Alexandre",
  "lastName": "Hunault",
  "role": "Développeur Back-end Senior PHP / Symfony",
  "stack_keywords_simple": ["PHP", "Symfony", "API Platform", "PostgreSQL"],
  "stack_keywords_composed": ["PHP Symfony", "API Platform Symfony", "Symfony backend senior"],
  "sectors": ["presse/média", "SaaS anti-fraude"],
  "clients_past": ["Le Monde", "Bayard"],
  "seniority": "senior",
  "experience_years": 15,
  "summary": "1-2 phrases synthèse"
}

Règles :
- stack_keywords_simple : 3-5 mots UNIQUES très distinctifs (pas "Git", "REST", "Agile")
- stack_keywords_composed : 3-5 combinaisons de 2-3 mots (plus précises pour matcher les titres de besoin)
- Ordre du plus distinctif au moins distinctif
- Pas d'invention`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: `Dossier de compétences :\n\n${text}` }]
  })
  const raw = r.content?.[0]?.text || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) }
  catch { return { firstName: '', lastName: '', role: '', stack_keywords_simple: [], stack_keywords_composed: [], sectors: [], clients_past: [], seniority: '', experience_years: 0, summary: '' } }
}

async function scanBoond(apiUrl, headers, profile, deep = false) {
  const simple = (profile.stack_keywords_simple || []).slice(0, 4)
  const composed = (profile.stack_keywords_composed || []).slice(0, 4)

  const oppMap = new Map()
  const contactMap = new Map()

  // Passe A : composés sur /opportunities
  for (const kw of composed) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  // Passe B : simples sur /opportunities
  for (const kw of simple) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '15', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      if (!ex.matchedOn.includes(kw)) ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  // Passe C : simples sur /contacts (matche titres/fonctions type "Dev Symfony")
  for (const kw of simple) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/contacts?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = contactMap.get(row.id) || { row, matchedOn: [] }
      ex.matchedOn.push(kw)
      contactMap.set(row.id, ex)
    }
  }

  // Mode profond : lire les actions de chaque contact
  const contactActions = new Map()
  if (deep) {
    const contactIds = Array.from(contactMap.keys()).slice(0, 30)
    await Promise.all(contactIds.map(async id => {
      const r = await boondGet(apiUrl, `/contacts/${id}/actions?maxResults=10`, headers)
      const actions = (r.body?.data || []).map(a => ({ id: a.id, ...a.attributes }))
      if (actions.length) contactActions.set(id, actions)
    }))
  }

  return {
    opportunities: Array.from(oppMap.values()),
    contacts: Array.from(contactMap.values()),
    contactActions
  }
}

function extractContactCompany(contactRow) {
  const a = contactRow.attributes || {}
  return {
    id: contactRow.id,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    function: a.function || a.functionType || a.title || '',
    email: a.email1 || a.email || '',
    phone: a.phoneNumber1 || a.phone || a.mobileNumber || '',
    companyId: a.companyId || null,
    companyName: a.companyName || a.company || ''
  }
}

async function scoreAllLeads(anthropic, profile, leadsForScoring) {
  if (!leadsForScoring.length) return []

  const BATCH_SIZE = 25
  const batches = []
  for (let i = 0; i < leadsForScoring.length; i += BATCH_SIZE) {
    batches.push(leadsForScoring.slice(i, i + BATCH_SIZE))
  }

  const clientsPast = (profile.clients_past || []).join(', ') || 'aucun'
  const system = `Tu évalues la pertinence de pistes business pour PUSHER un consultant chez un client.

Réponds UNIQUEMENT par un tableau JSON, sans markdown.

Format : [{ "id": "...", "score": 85, "reason": "..." }]

Règles :
- score : entier 0-100
  * 80+ = stack très clairement alignée + contexte pertinent
  * 60-79 = match stack clair, contexte à creuser
  * 40-59 = match partiel intéressant
  * 30-39 = signal faible mais gardé pour tri manuel
  * < 30 = à écarter
- reason : 2-3 phrases FR max 50 mots. Explique CONCRÈTEMENT : quelle techno, quel signal (titre du besoin / fonction du contact / note), pourquoi c'est une piste
- Pénalise ${clientsPast} (déjà servis)
- Utilise 'matchedOn' pour comprendre le match
- Sois généreux 30-60 pour laisser du volume, critique sur 60+`

  const userBase = `Profil consultant à pusher :
- Rôle : ${profile.role}
- Stack : ${(profile.stack_keywords_simple || []).join(', ')}
- Secteurs : ${(profile.sectors || []).join(', ')}
- Séniorité : ${profile.seniority} (${profile.experience_years || '?'} ans)
- Clients passés : ${clientsPast}
- Résumé : ${profile.summary}`

  const allScores = []
  for (const batch of batches) {
    const userMsg = `${userBase}

Pistes à évaluer :
${JSON.stringify(batch, null, 2)}`

    try {
      const r = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
      const raw = r.content?.[0]?.text || '[]'
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const parsed = JSON.parse(clean)
      allScores.push(...parsed)
    } catch (e) {
      console.error('score batch failed', e.message)
    }
  }
  return allScores
}

// Priorise contact dont la fonction matche la stack
function pickBestContact(contacts, stackWords) {
  if (!contacts.length) return null
  const lowerStack = stackWords.map(s => s.toLowerCase()).filter(Boolean)
  const withScore = contacts.map(c => {
    const fn = (c.function || '').toLowerCase()
    let s = 0
    for (const w of lowerStack) if (w && fn.includes(w)) s += 10
    if (/cto|vp|head|lead|principal|director technique|responsable tech/i.test(fn)) s += 5
    if (/manager|senior/i.test(fn)) s += 2
    return { c, s }
  })
  withScore.sort((a, b) => b.s - a.s)
  return withScore[0].c
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  cleanCache()

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

  const contentType = req.headers['content-type'] || ''

  // ═══ CAS 1 : Pagination / deep scan sur cache existant ═══
  if (contentType.includes('application/json')) {
    let body = ''
    await new Promise(r => { req.on('data', c => body += c); req.on('end', r) })
    let parsed = {}
    try { parsed = JSON.parse(body) } catch {}

    const { cacheKey, page = 1, action = 'next' } = parsed
    if (!cacheKey || !SESSION_CACHE.has(cacheKey)) {
      return res.status(404).json({ error: 'Cache expiré, relance l\'analyse' })
    }
    const cached = SESSION_CACHE.get(cacheKey)

    if (action === 'deep_scan' && !cached.deepScanDone) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        const deepScan = await scanBoond(apiUrl, boondHeaders, cached.profile, true)
        const additionalLeads = []
        for (const [contactId, actions] of deepScan.contactActions.entries()) {
          const notesText = actions
            .map(a => `[${a.type || 'note'} ${a.date || ''}] ${(a.description || a.title || '').slice(0, 300)}`)
            .join('\n')
          if (!notesText.trim()) continue
          const contactRow = deepScan.contacts.find(c => c.row.id === contactId)
          const c = contactRow ? extractContactCompany(contactRow.row) : { id: contactId, firstName: '?', lastName: '?', function: '', companyName: '', email: '', phone: '' }
          additionalLeads.push({
            id: `deep_action_${contactId}`,
            kind: 'action_note',
            sourceType: 'Note d\'action contact',
            title: `Notes sur ${c.firstName} ${c.lastName}`,
            company: c.companyName || '',
            contact: c,
            matchedOn: contactRow?.matchedOn || [],
            scoringPayload: {
              id: `deep_action_${contactId}`,
              kind: 'action_note',
              contact: `${c.firstName} ${c.lastName} — ${c.function}`,
              company: c.companyName,
              notes: notesText.slice(0, 1500),
              matchedOn: contactRow?.matchedOn || []
            },
            boondUrl: `https://ui.boondmanager.com/contacts/${contactId}/information`
          })
        }
        const newScores = await scoreAllLeads(anthropic, cached.profile, additionalLeads.map(l => l.scoringPayload))
        const scoreMap = new Map(newScores.map(s => [String(s.id), s]))
        for (const lead of additionalLeads) {
          const sc = scoreMap.get(String(lead.id))
          lead.score = sc?.score ?? null
          lead.reason = sc?.reason || ''
        }
        // Fusionne, dédoublonne par id
        const existingIds = new Set(cached.allLeads.map(l => l.id))
        const merged = [...cached.allLeads, ...additionalLeads.filter(l => (l.score ?? 0) >= 30 && !existingIds.has(l.id))]
        cached.allLeads = merged.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        cached.deepScanDone = true
        cached.counts.deepAdditionalLeads = additionalLeads.filter(l => (l.score ?? 0) >= 30).length
      } catch (e) {
        console.error('deep_scan error', e)
        return res.status(500).json({ error: 'Scan profond échoué : ' + e.message })
      }
    }

    const PAGE_SIZE = 15
    const start = (page - 1) * PAGE_SIZE
    const slice = cached.allLeads.slice(start, start + PAGE_SIZE)

    return res.status(200).json({
      cacheKey,
      profile: cached.profile,
      page,
      pageSize: PAGE_SIZE,
      totalLeads: cached.allLeads.length,
      hasMore: start + PAGE_SIZE < cached.allLeads.length,
      leads: slice,
      deepScanDone: cached.deepScanDone,
      counts: cached.counts
    })
  }

  // ═══ CAS 2 : Nouvel upload PDF ═══
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
      const profile = await extractProfileFromPdf(anthropic, pdfText)

      if (!(profile.stack_keywords_simple?.length || profile.stack_keywords_composed?.length)) {
        return res.status(200).json({
          profile, leads: [], totalLeads: 0,
          warning: 'Aucun keyword stack extrait du PDF.'
        })
      }

      const scan = await scanBoond(apiUrl, boondHeaders, profile, false)

      const allLeadsRaw = []

      // Opportunités
      for (const opp of scan.opportunities) {
        const a = opp.row.attributes || {}
        const state = a.state
        const stateLabel = { '1': 'En cours', '2': 'Gagné', '3': 'Perdu', '0': 'Abandonné' }[String(state)] || `Statut ${state}`
        allLeadsRaw.push({
          id: `opp_${opp.row.id}`,
          kind: 'opportunity',
          sourceType: `Besoin Boond — ${stateLabel}`,
          state, stateLabel,
          title: a.title || a.reference || `Opportunité #${opp.row.id}`,
          company: a.company || a.companyName || '',
          companyId: a.companyId || null,
          reference: a.reference || '',
          startDate: a.startDate || '',
          contact: null,
          matchedOn: opp.matchedOn,
          scoringPayload: {
            id: `opp_${opp.row.id}`,
            kind: 'opportunity',
            title: a.title || '',
            reference: a.reference || '',
            state: stateLabel,
            company: a.company || '',
            description: (a.description || '').slice(0, 400),
            matchedOn: opp.matchedOn
          },
          boondUrl: `https://ui.boondmanager.com/opportunities/${opp.row.id}/information`
        })
      }

      // Contacts (regroupés par entreprise)
      const contactsByCompany = new Map()
      for (const c of scan.contacts) {
        const info = extractContactCompany(c.row)
        const key = info.companyId || info.companyName || `contact_${info.id}`
        const existing = contactsByCompany.get(key) || { contacts: [], matchedOn: new Set() }
        existing.contacts.push({ info, matchedOn: c.matchedOn })
        c.matchedOn.forEach(m => existing.matchedOn.add(m))
        contactsByCompany.set(key, existing)
      }

      const stackWords = [
        ...(profile.stack_keywords_simple || []),
        ...(profile.stack_keywords_composed || []).flatMap(k => k.split(' '))
      ]

      for (const [key, group] of contactsByCompany.entries()) {
        const list = group.contacts.map(x => x.info)
        const best = pickBestContact(list, stackWords)
        if (!best) continue
        allLeadsRaw.push({
          id: `contact_${best.id}`,
          kind: 'contact',
          sourceType: 'Contact opérationnel (fonction stack)',
          title: `${best.firstName} ${best.lastName}${best.function ? ' — ' + best.function : ''}`,
          company: best.companyName,
          companyId: best.companyId,
          contact: best,
          otherContactsCount: list.length - 1,
          matchedOn: Array.from(group.matchedOn),
          scoringPayload: {
            id: `contact_${best.id}`,
            kind: 'contact',
            fullName: `${best.firstName} ${best.lastName}`,
            function: best.function,
            company: best.companyName,
            matchedOn: Array.from(group.matchedOn)
          },
          boondUrl: `https://ui.boondmanager.com/contacts/${best.id}/information`
        })
      }

      const scores = await scoreAllLeads(anthropic, profile, allLeadsRaw.map(l => l.scoringPayload))
      const scoreMap = new Map(scores.map(s => [String(s.id), s]))

      const allLeads = allLeadsRaw
        .map(l => {
          const sc = scoreMap.get(String(l.id))
          return { ...l, score: sc?.score ?? null, reason: sc?.reason || '' }
        })
        .filter(l => (l.score ?? 0) >= 30)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

      const cacheKey = crypto.randomBytes(12).toString('hex')
      SESSION_CACHE.set(cacheKey, {
        profile, allLeads,
        scannedAt: Date.now(),
        deepScanDone: false,
        counts: {
          keywordsSimple: profile.stack_keywords_simple || [],
          keywordsComposed: profile.stack_keywords_composed || [],
          opportunitiesScanned: scan.opportunities.length,
          contactsScanned: scan.contacts.length,
          leadsRetained: allLeads.length
        }
      })

      const PAGE_SIZE = 15
      return res.status(200).json({
        cacheKey, profile,
        page: 1, pageSize: PAGE_SIZE,
        totalLeads: allLeads.length,
        hasMore: allLeads.length > PAGE_SIZE,
        leads: allLeads.slice(0, PAGE_SIZE),
        deepScanDone: false,
        counts: SESSION_CACHE.get(cacheKey).counts
      })
    } catch (e) {
      console.error('boond-push-leads error', e)
      return res.status(500).json({ error: e.message || 'Erreur serveur' })
    }
  })
}
