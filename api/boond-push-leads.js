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
- stack_keywords_composed : 3-5 combinaisons de 2-3 mots
- Ordre du plus au moins distinctif
- Pas d'invention`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: `Dossier :\n\n${text}` }]
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

  for (const kw of composed) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  for (const kw of simple) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '15', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      if (!ex.matchedOn.includes(kw)) ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  for (const kw of simple) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/contacts?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = contactMap.get(row.id) || { row, matchedOn: [] }
      ex.matchedOn.push(kw)
      contactMap.set(row.id, ex)
    }
  }

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

// Extrait le contact principal + secteur d'une réponse /opportunities/{id}/information
function parseOpportunityFull(json) {
  if (!json?.data) return null
  const a = json.data.attributes || {}
  const included = Array.isArray(json.included) ? json.included : []
  const company = included.find(i => (i.type === 'company' || i.type === 'companies'))
  const contact = included.find(i => (i.type === 'contact' || i.type === 'contacts'))
  return {
    title: a.title || '',
    reference: a.reference || '',
    state: a.state,
    description: a.description || '',
    startDate: a.startDate || '',
    company: company ? {
      id: company.id,
      name: company.attributes?.name || '',
      activityArea: company.attributes?.activityArea || '',
      town: company.attributes?.town || company.attributes?.city || ''
    } : null,
    contact: contact ? {
      id: contact.id,
      firstName: contact.attributes?.firstName || '',
      lastName: contact.attributes?.lastName || '',
      function: contact.attributes?.function || contact.attributes?.functionType || '',
      email: contact.attributes?.email1 || contact.attributes?.email || '',
      phone: contact.attributes?.phoneNumber1 || contact.attributes?.phone || contact.attributes?.mobileNumber || ''
    } : null
  }
}

function parseContactFull(json) {
  if (!json?.data) return null
  const a = json.data.attributes || {}
  const included = Array.isArray(json.included) ? json.included : []
  const company = included.find(i => (i.type === 'company' || i.type === 'companies'))
  return {
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    function: a.function || a.functionType || a.title || '',
    email: a.email1 || a.email || '',
    phone: a.phoneNumber1 || a.phone || a.mobileNumber || '',
    company: company ? {
      id: company.id,
      name: company.attributes?.name || a.companyName || '',
      activityArea: company.attributes?.activityArea || '',
      town: company.attributes?.town || company.attributes?.city || ''
    } : (a.companyName ? { id: a.companyId, name: a.companyName, activityArea: '', town: '' } : null)
  }
}

// Détermine statut du compte via /companies/{id}/deliveries (missions)
// active = mission en cours (endDate future ou vide), past = mission passée close, none = prospect
async function fetchCompanyStatus(apiUrl, headers, companyId) {
  if (!companyId) return { status: 'unknown', activeCount: 0, pastCount: 0 }
  const r = await boondGet(apiUrl, `/companies/${companyId}/deliveries?maxResults=20`, headers)
  const rows = r.body?.data || []
  if (!rows.length) return { status: 'prospect', activeCount: 0, pastCount: 0 }
  const now = new Date()
  let active = 0, past = 0
  for (const d of rows) {
    const end = d.attributes?.endDate
    if (!end || new Date(end) >= now) active++
    else past++
  }
  if (active > 0) return { status: 'active_client', activeCount: active, pastCount: past }
  if (past > 0) return { status: 'past_client', activeCount: 0, pastCount: past }
  return { status: 'prospect', activeCount: 0, pastCount: 0 }
}

async function scoreAllLeads(anthropic, profile, leads) {
  if (!leads.length) return []
  const BATCH_SIZE = 25
  const batches = []
  for (let i = 0; i < leads.length; i += BATCH_SIZE) batches.push(leads.slice(i, i + BATCH_SIZE))

  const clientsPast = (profile.clients_past || []).join(', ') || 'aucun'
  const system = `Tu évalues la pertinence de pistes business pour PUSHER un consultant.
Réponds UNIQUEMENT par un tableau JSON, sans markdown.

Format : [{ "id": "...", "score": 85, "reason": "..." }]

Règles :
- score entier 0-100
  * 80+ = stack très alignée + contexte pertinent
  * 60-79 = match stack clair
  * 40-59 = match partiel intéressant
  * 30-39 = signal faible mais gardé pour tri manuel
  * <30 = à écarter
- reason : 2-3 phrases FR max 50 mots, concret (quelle techno, quel signal, pourquoi)
- Pénalise ${clientsPast} (déjà servis)
- Utilise matchedOn pour comprendre le match
- Généreux 30-60, critique 60+`

  const userBase = `Consultant :
- Rôle : ${profile.role}
- Stack : ${(profile.stack_keywords_simple || []).join(', ')}
- Secteurs : ${(profile.sectors || []).join(', ')}
- Séniorité : ${profile.seniority} (${profile.experience_years || '?'} ans)
- Clients passés : ${clientsPast}
- Résumé : ${profile.summary}`

  const all = []
  for (const batch of batches) {
    const userMsg = `${userBase}\n\nPistes :\n${JSON.stringify(batch, null, 2)}`
    try {
      const r = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4000, system,
        messages: [{ role: 'user', content: userMsg }]
      })
      const raw = r.content?.[0]?.text || '[]'
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      all.push(...JSON.parse(clean))
    } catch (e) { console.error('score batch failed', e.message) }
  }
  return all
}

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

// Priorité statut : active_client (0) > past_client (1) > prospect (2) > unknown (3)
const STATUS_ORDER = { active_client: 0, past_client: 1, prospect: 2, unknown: 3 }
function statusLabel(s) {
  return {
    active_client: 'Client actif',
    past_client: 'Ancien client',
    prospect: 'Prospect',
    unknown: 'Statut inconnu'
  }[s] || 'Inconnu'
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

  const contentType = req.headers['content-type'] || ''

  // ═══ CAS 2 : scan profond (recharge avec profil déjà connu envoyé par le client) ═══
  if (contentType.includes('application/json')) {
    let body = ''
    await new Promise(r => { req.on('data', c => body += c); req.on('end', r) })
    let parsed = {}
    try { parsed = JSON.parse(body) } catch {}

    const { profile, action } = parsed
    if (action !== 'deep_scan' || !profile) {
      return res.status(400).json({ error: 'profile + action=deep_scan requis' })
    }

    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const scan = await scanBoond(apiUrl, boondHeaders, profile, true)

      // Construction pistes actions/notes uniquement
      const additionalLeadsRaw = []
      for (const [contactId, actions] of scan.contactActions.entries()) {
        const notesText = actions
          .map(a => `[${a.type || 'note'} ${a.date || ''}] ${(a.description || a.title || '').slice(0, 300)}`)
          .join('\n')
        if (!notesText.trim()) continue
        const contactRow = scan.contacts.find(c => c.row.id === contactId)
        if (!contactRow) continue

        // Enrichissement du contact
        const fullR = await boondGet(apiUrl, `/contacts/${contactId}/information`, boondHeaders)
        const full = parseContactFull(fullR.body)
        if (!full) continue

        let statusInfo = { status: 'unknown', activeCount: 0, pastCount: 0 }
        if (full.company?.id) {
          statusInfo = await fetchCompanyStatus(apiUrl, boondHeaders, full.company.id)
        }

        additionalLeadsRaw.push({
          id: `deep_action_${contactId}`,
          kind: 'action_note',
          sourceType: 'Note d\'action contact',
          title: `Notes/actions sur ${full.firstName} ${full.lastName}`,
          company: full.company?.name || '',
          companyId: full.company?.id || null,
          companyActivity: full.company?.activityArea || '',
          companyTown: full.company?.town || '',
          companyStatus: statusInfo.status,
          companyStatusLabel: statusLabel(statusInfo.status),
          companyMissions: { active: statusInfo.activeCount, past: statusInfo.pastCount },
          contact: full,
          matchedOn: contactRow.matchedOn,
          scoringPayload: {
            id: `deep_action_${contactId}`,
            kind: 'action_note',
            contact: `${full.firstName} ${full.lastName} — ${full.function}`,
            company: full.company?.name || '',
            companyActivity: full.company?.activityArea || '',
            companyStatus: statusInfo.status,
            notes: notesText.slice(0, 1500),
            matchedOn: contactRow.matchedOn
          },
          boondUrl: `https://ui.boondmanager.com/contacts/${contactId}/information`
        })
      }

      const scores = await scoreAllLeads(anthropic, profile, additionalLeadsRaw.map(l => l.scoringPayload))
      const scoreMap = new Map(scores.map(s => [String(s.id), s]))
      const additionalLeads = additionalLeadsRaw
        .map(l => {
          const sc = scoreMap.get(String(l.id))
          return { ...l, score: sc?.score ?? null, reason: sc?.reason || '' }
        })
        .filter(l => (l.score ?? 0) >= 30)

      return res.status(200).json({
        additionalLeads,
        count: additionalLeads.length
      })
    } catch (e) {
      console.error('deep_scan error', e)
      return res.status(500).json({ error: 'Scan profond échoué : ' + e.message })
    }
  }

  // ═══ CAS 1 : upload PDF → scan rapide ═══
  const form = formidable({ maxFileSize: 15 * 1024 * 1024 })
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Erreur upload : ' + err.message })

    try {
      const pdfFile = files.pdf?.[0]
      let pdfText = fields.pdfText?.[0] || ''

      if (pdfFile) {
        const buf = fs.readFileSync(pdfFile.filepath)
        const parsed = await pdfParse(buf)
        pdfText = parsed.text || ''
      }
      if (!pdfText.trim()) return res.status(400).json({ error: 'Aucun contenu PDF exploitable' })

      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const profile = await extractProfileFromPdf(anthropic, pdfText)

      if (!(profile.stack_keywords_simple?.length || profile.stack_keywords_composed?.length)) {
        return res.status(200).json({
          profile, leads: [],
          warning: 'Aucun keyword stack extrait du PDF.'
        })
      }

      const scan = await scanBoond(apiUrl, boondHeaders, profile, false)

      // ─── Enrichissement OPPORTUNITÉS ───
      // /opportunities/{id}/information pour chaque, en parallèle
      const enrichedOpps = await Promise.all(scan.opportunities.map(async opp => {
        const r = await boondGet(apiUrl, `/opportunities/${opp.row.id}/information`, boondHeaders)
        const full = parseOpportunityFull(r.body)
        return { opp, full }
      }))

      // Récupération unique du statut pour chaque société apparaissant
      const uniqueCompanyIds = new Set()
      for (const { full } of enrichedOpps) if (full?.company?.id) uniqueCompanyIds.add(full.company.id)
      const companyStatuses = new Map()
      await Promise.all(Array.from(uniqueCompanyIds).map(async id => {
        companyStatuses.set(id, await fetchCompanyStatus(apiUrl, boondHeaders, id))
      }))

      const allLeadsRaw = []

      for (const { opp, full } of enrichedOpps) {
        const a = opp.row.attributes || {}
        const state = full?.state ?? a.state
        const stateLabel = { '1': 'En cours', '2': 'Gagné', '3': 'Perdu', '0': 'Abandonné' }[String(state)] || `Statut ${state}`
        const companyName = full?.company?.name || a.company || a.companyName || ''
        const companyId = full?.company?.id || a.companyId || null
        const statusInfo = companyId ? (companyStatuses.get(companyId) || { status: 'unknown', activeCount: 0, pastCount: 0 }) : { status: 'unknown', activeCount: 0, pastCount: 0 }

        allLeadsRaw.push({
          id: `opp_${opp.row.id}`,
          kind: 'opportunity',
          sourceType: `Besoin Boond — ${stateLabel}`,
          state, stateLabel,
          title: full?.title || a.title || a.reference || `Opportunité #${opp.row.id}`,
          reference: full?.reference || a.reference || '',
          startDate: full?.startDate || a.startDate || '',
          company: companyName,
          companyId,
          companyActivity: full?.company?.activityArea || '',
          companyTown: full?.company?.town || '',
          companyStatus: statusInfo.status,
          companyStatusLabel: statusLabel(statusInfo.status),
          companyMissions: { active: statusInfo.activeCount, past: statusInfo.pastCount },
          contact: full?.contact || null,
          matchedOn: opp.matchedOn,
          scoringPayload: {
            id: `opp_${opp.row.id}`,
            kind: 'opportunity',
            title: full?.title || a.title || '',
            reference: full?.reference || a.reference || '',
            state: stateLabel,
            company: companyName,
            companyActivity: full?.company?.activityArea || '',
            companyStatus: statusInfo.status,
            description: (full?.description || a.description || '').slice(0, 400),
            matchedOn: opp.matchedOn
          },
          boondUrl: `https://ui.boondmanager.com/opportunities/${opp.row.id}/information`
        })
      }

      // ─── Enrichissement CONTACTS ───
      // On regroupe par entreprise (via /contacts/{id}/information pour avoir le companyId fiable)
      // On enrichit tous les contacts en parallèle
      const enrichedContacts = await Promise.all(scan.contacts.map(async c => {
        const r = await boondGet(apiUrl, `/contacts/${c.row.id}/information`, boondHeaders)
        const full = parseContactFull(r.body)
        return { c, full }
      }))

      const contactsByCompany = new Map()
      for (const { c, full } of enrichedContacts) {
        if (!full) continue
        const key = full.company?.id || full.company?.name || `contact_${c.row.id}`
        const ex = contactsByCompany.get(key) || { contacts: [], matchedOn: new Set(), company: full.company }
        ex.contacts.push({ full, matchedOn: c.matchedOn })
        c.matchedOn.forEach(m => ex.matchedOn.add(m))
        contactsByCompany.set(key, ex)
      }

      // Récupère statut pour les entreprises des contacts (celles pas déjà connues)
      const newCompanyIds = new Set()
      for (const [, g] of contactsByCompany.entries()) {
        if (g.company?.id && !companyStatuses.has(g.company.id)) newCompanyIds.add(g.company.id)
      }
      await Promise.all(Array.from(newCompanyIds).map(async id => {
        companyStatuses.set(id, await fetchCompanyStatus(apiUrl, boondHeaders, id))
      }))

      const stackWords = [
        ...(profile.stack_keywords_simple || []),
        ...(profile.stack_keywords_composed || []).flatMap(k => k.split(' '))
      ]

      for (const [, group] of contactsByCompany.entries()) {
        const list = group.contacts.map(x => x.full)
        const best = pickBestContact(list, stackWords)
        if (!best) continue
        const cId = group.company?.id
        const statusInfo = cId ? (companyStatuses.get(cId) || { status: 'unknown', activeCount: 0, pastCount: 0 }) : { status: 'unknown', activeCount: 0, pastCount: 0 }
        allLeadsRaw.push({
          id: `contact_${cId || best.firstName + best.lastName}`,
          kind: 'contact',
          sourceType: 'Contact opérationnel (fonction stack)',
          title: `${best.firstName} ${best.lastName}${best.function ? ' — ' + best.function : ''}`,
          company: group.company?.name || '',
          companyId: cId,
          companyActivity: group.company?.activityArea || '',
          companyTown: group.company?.town || '',
          companyStatus: statusInfo.status,
          companyStatusLabel: statusLabel(statusInfo.status),
          companyMissions: { active: statusInfo.activeCount, past: statusInfo.pastCount },
          contact: best,
          otherContactsCount: list.length - 1,
          matchedOn: Array.from(group.matchedOn),
          scoringPayload: {
            id: `contact_${cId || best.firstName + best.lastName}`,
            kind: 'contact',
            fullName: `${best.firstName} ${best.lastName}`,
            function: best.function,
            company: group.company?.name || '',
            companyActivity: group.company?.activityArea || '',
            companyStatus: statusInfo.status,
            matchedOn: Array.from(group.matchedOn)
          },
          boondUrl: `https://ui.boondmanager.com/contacts/${list[0].id || ''}/information`
        })
      }

      // ─── Scoring Claude ───
      const scores = await scoreAllLeads(anthropic, profile, allLeadsRaw.map(l => l.scoringPayload))
      const scoreMap = new Map(scores.map(s => [String(s.id), s]))

      // ─── Tri : d'abord par statut (client actif > ancien > prospect > inconnu), puis par score ───
      const allLeads = allLeadsRaw
        .map(l => {
          const sc = scoreMap.get(String(l.id))
          return { ...l, score: sc?.score ?? null, reason: sc?.reason || '' }
        })
        .filter(l => (l.score ?? 0) >= 30)
        .sort((a, b) => {
          const sa = STATUS_ORDER[a.companyStatus] ?? 3
          const sb = STATUS_ORDER[b.companyStatus] ?? 3
          if (sa !== sb) return sa - sb
          return (b.score ?? -1) - (a.score ?? -1)
        })

      return res.status(200).json({
        profile,
        leads: allLeads,
        counts: {
          keywordsSimple: profile.stack_keywords_simple || [],
          keywordsComposed: profile.stack_keywords_composed || [],
          opportunitiesScanned: scan.opportunities.length,
          contactsScanned: scan.contacts.length,
          leadsRetained: allLeads.length,
          byStatus: {
            active_client: allLeads.filter(l => l.companyStatus === 'active_client').length,
            past_client: allLeads.filter(l => l.companyStatus === 'past_client').length,
            prospect: allLeads.filter(l => l.companyStatus === 'prospect').length,
            unknown: allLeads.filter(l => l.companyStatus === 'unknown').length
          }
        }
      })
    } catch (e) {
      console.error('boond-push-leads error', e)
      return res.status(500).json({ error: e.message || 'Erreur serveur' })
    }
  })
}
