import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

// bodyParser reste sur false : on lit le body JSON à la main via req.on('data')
// pour rester compatible avec le pattern serverless Vercel actuel (le handler
// deep_scan utilise déjà ce pattern).
export const config = {
  api: { bodyParser: false, sizeLimit: '2mb' },
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
  "stack_primary": ["PHP", "Symfony"],
  "stack_secondary": ["API Platform", "PostgreSQL", "RabbitMQ", "Redis"],
  "stack_keywords_composed": ["PHP Symfony", "API Platform Symfony", "Symfony backend senior"],
  "sectors": ["presse/média", "SaaS anti-fraude"],
  "clients_past": ["Le Monde", "Bayard"],
  "seniority": "senior",
  "experience_years": 15,
  "summary": "1-2 phrases synthèse"
}

Règles critiques :
- stack_primary : 2 à 3 technologies EXCLUSIVEMENT — le CŒUR du profil, celles sans lesquelles le consultant N'EST PAS pertinent pour un besoin.
  Exemple : un dev PHP/Symfony → stack_primary = ["PHP", "Symfony"]. Pas "RabbitMQ" même s'il l'utilise, car un besoin RabbitMQ Node.js n'est PAS pour lui.
  Exemple : un data engineer dbt/BigQuery → stack_primary = ["dbt", "BigQuery"].
- stack_secondary : les technos qu'il maîtrise mais qui sont accessoires (bibliothèques, outils, adjacent skills). NE SUFFISENT PAS SEULES pour justifier un match.
- stack_keywords_composed : 3-5 combinaisons de mots de la stack primaire principalement, pour rechercher précisément dans Boond.
- Pas de "Git", "REST", "Agile", "CI/CD" (trop généraux, jamais dans les stacks)
- Pas d'invention`

  const r = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: `Dossier :\n\n${text}` }]
  })
  const raw = r.content?.[0]?.text || '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const p = JSON.parse(clean)
    // Rétro-compat : si l'ancien format était renvoyé, on migre
    if (!p.stack_primary && p.stack_keywords_simple) {
      p.stack_primary = p.stack_keywords_simple.slice(0, 2)
      p.stack_secondary = p.stack_keywords_simple.slice(2)
    }
    return p
  }
  catch { return { firstName: '', lastName: '', role: '', stack_primary: [], stack_secondary: [], stack_keywords_composed: [], sectors: [], clients_past: [], seniority: '', experience_years: 0, summary: '' } }
}

async function scanBoond(apiUrl, headers, profile, deep = false) {
  const primary = (profile.stack_primary || []).slice(0, 3)
  const secondary = (profile.stack_secondary || []).slice(0, 3)
  const composed = (profile.stack_keywords_composed || []).slice(0, 4)

  const oppMap = new Map()
  const contactMap = new Map()
  const companyMap = new Map()  // Sociétés remontées via /companies (pas via contact ni opp)

  // A) composés sur /opportunities
  for (const kw of composed) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  // B) primaires sur /opportunities
  for (const kw of primary) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '20', page: '1' })
    const r = await boondGet(apiUrl, `/opportunities?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = oppMap.get(row.id) || { row, matchedOn: [] }
      if (!ex.matchedOn.includes(kw)) ex.matchedOn.push(kw)
      oppMap.set(row.id, ex)
    }
  }
  // C) PAGINATION sur /contacts : primaires + secondaires, 5 pages max de 30 chacune = 150/keyword
  const contactKeywords = [...primary, ...secondary]
  const CONTACT_PAGES = 5
  const CONTACT_PAGE_SIZE = 30
  for (const kw of contactKeywords) {
    for (let page = 1; page <= CONTACT_PAGES; page++) {
      const qs = new URLSearchParams({ keywords: kw, maxResults: String(CONTACT_PAGE_SIZE), page: String(page) })
      const r = await boondGet(apiUrl, `/contacts?${qs}`, headers)
      const rows = r.body?.data || []
      for (const row of rows) {
        const ex = contactMap.get(row.id) || { row, matchedOn: [] }
        if (!ex.matchedOn.includes(kw)) ex.matchedOn.push(kw)
        contactMap.set(row.id, ex)
      }
      // Arrêt si moins d'une page pleine ou aucun résultat → plus rien à récupérer
      if (rows.length < CONTACT_PAGE_SIZE) break
    }
  }
  // D) /companies sur primaires + composés : capture les sociétés dont nom/desc matche
  for (const kw of [...primary, ...composed]) {
    const qs = new URLSearchParams({ keywords: kw, maxResults: '15', page: '1' })
    const r = await boondGet(apiUrl, `/companies?${qs}`, headers)
    for (const row of (r.body?.data || [])) {
      const ex = companyMap.get(row.id) || { row, matchedOn: [] }
      if (!ex.matchedOn.includes(kw)) ex.matchedOn.push(kw)
      companyMap.set(row.id, ex)
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
    companiesDirect: Array.from(companyMap.values()),
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
    id: json.data.id,
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
  const primary = (profile.stack_primary || []).join(', ')
  const secondary = (profile.stack_secondary || []).join(', ')
  const role = profile.role || ''

  // Détection du "métier" du candidat pour savoir quels titres de contact sont pertinents
  const isProduct = /product|po\b|pm\b|product owner|product manager|product lead/i.test(role)
  const isData = /data|analytics|bi|business intelligence/i.test(role)
  const isDev = /developp|dev\b|backend|frontend|full[- ]?stack|tech lead|lead dev|architect|engineer|ing[eé]nieur/i.test(role)
  const isDesign = /design|ux|ui\b/i.test(role)

  const metierGuidance = []
  if (isDev) metierGuidance.push('- DEV BACKEND/FULLSTACK : accepter uniquement CTO, VP Engineering, Head of Engineering / Backend / Platform, Tech Lead, Lead Dev, Architecte, Développeur/Ingénieur (avec mention stack ppal proche)')
  if (isData) metierGuidance.push('- DATA : accepter Head of Data, Chief Data Officer, Data Engineer Lead, Analytics Lead')
  if (isProduct) metierGuidance.push('- PRODUCT : accepter CPO, Head of Product, Product Lead, Senior PM/PO')
  if (isDesign) metierGuidance.push('- DESIGN : accepter Head of Design, Design Lead, UX Lead')
  if (!metierGuidance.length) metierGuidance.push('- Aligner strictement la fonction du contact au métier du candidat')

  const system = `Tu évalues la pertinence de pistes business pour PUSHER un consultant chez un client.
Réponds UNIQUEMENT par un tableau JSON, sans markdown.

Format : [{ "id": "...", "score": 85, "reason": "..." }]

Consultant :
- Rôle : ${role}
- Stack PRINCIPALE : ${primary}
- Stack SECONDAIRE (accessoires seuls insuffisants) : ${secondary}

═══ SEUIL : les pistes en dessous de 55 seront écartées. Sois strict. ═══

▶ Pour kind = "opportunity" (BESOIN Boond) :
  RÈGLE STRICTE : score >= 55 UNIQUEMENT si stack PRINCIPALE présente dans le besoin.
  - 85-100 : stack ppal explicite + contexte pertinent (séniorité, secteur)
  - 70-84  : stack ppal bien alignée
  - 55-69  : stack ppal présente mais contexte moins clair
  - <55    : stack ppal absente OU juste évoquée en passant → écarter
  Exemple à ÉCARTER : besoin "Développeur Node.js RabbitMQ" pour un consultant PHP/Symfony
  (juste RabbitMQ en commun, ce n'est pas suffisant).

▶ Pour kind = "contact" (contact avec fonction/titre) :
  Score >= 55 SEULEMENT SI l'un de ces critères est rempli :
  (A) La fonction contient EXPLICITEMENT la stack ppal
      → "Head of PHP", "Lead Symfony", "Développeur Symfony" → score 80-95
  (B) La fonction est un DÉCIDEUR ou OPÉRATIONNEL TECH aligné au métier du candidat,
      ET on a une preuve tangible que la société utilise la stack (dans le nom de la société,
      son secteur explicite, sa description, ou dans les notes fournies)
      → score 65-80
  (C) La fonction est PRÉCISÉMENT alignée au métier du candidat
      (voir guidance métier ci-dessous) chez une société explicitement tech
      → score 55-65
  Fonctions guidance selon métier du candidat :
${metierGuidance.join('\n')}

  À ÉCARTER (score < 40) — même si société tech :
  - Product Lead, Product Manager, Product Owner, Chief Product Officer, Directeur Produit,
    Head of Product, Directeur Digital → sauf si candidat est LUI-MÊME product/PO/PM
  - Marketing, RH, Sales, Finance, Achats, Direction non-tech
  - CTO / Head of Engineering d'une société SANS aucun signal d'usage de la stack
    (ex: cabinet de conseil généraliste, entreprise industrielle traditionnelle sans mention tech)

▶ Pour kind = "company_direct" (société remontée seule) :
  - 65-80 : nom / secteur / description évoquent CLAIREMENT l'usage de la stack ppal
            (agence PHP, éditeur SaaS Symfony, e-commerce PHP)
  - 55-64 : société d'un secteur où la stack est très courante ET on a un signal explicite
  - <55   : simple présomption "secteur non exclu" → écarter

▶ Pour kind = "action_note" :
  - 70+ : note explicite mentionnant besoin/projet stack ppal
  - 55-69 : note tech backend/produit selon métier avec signal fort
  - <55 : notes vagues → écarter

═══ reason ═══
2-3 phrases FR max 50 mots. Explique CONCRÈTEMENT :
- Quelle preuve concrète justifie le match (JAMAIS "compte à creuser" seul)
- Si signal faible ou tiré par les cheveux, mets score bas et dis-le franchement

═══ Pénalités ═══
- Consultant a déjà bossé chez ${clientsPast} → -20
- Fonction hors scope métier → score max 30
- "Signal société vague, non explicite" → score max 50 (donc écarté)`

  const userBase = `Consultant :
- Rôle : ${role}
- Stack PRINCIPALE : ${primary}
- Stack SECONDAIRE : ${secondary}
- Secteurs déjà connus : ${(profile.sectors || []).join(', ')}
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

function pickBestContact(contacts, profile) {
  if (!contacts.length) return null
  const primary = (profile.stack_primary || []).map(s => s.toLowerCase()).filter(Boolean)
  const secondary = (profile.stack_secondary || []).map(s => s.toLowerCase()).filter(Boolean)
  const withScore = contacts.map(c => {
    const fn = (c.function || '').toLowerCase()
    let s = 0
    // Bonus x3 pour matcher un mot de la stack principale dans la fonction
    for (const w of primary) if (w && fn.includes(w)) s += 30
    // Bonus modéré pour un mot secondaire
    for (const w of secondary) if (w && fn.includes(w)) s += 8
    if (/cto|vp|head|lead|principal|director technique|responsable tech/i.test(fn)) s += 10
    if (/manager|senior/i.test(fn)) s += 4
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

  // ═══ CAS JSON : deep_scan OU pdfText déjà extrait côté navigateur ═══
  // Depuis le fix Vercel 413, le front extrait le texte du PDF localement
  // (pdfjs-dist) et l'envoie ici en JSON — bien plus léger que le PDF brut.
  if (contentType.includes('application/json')) {
    let body = ''
    await new Promise(r => { req.on('data', c => body += c); req.on('end', r) })
    let parsed = {}
    try { parsed = JSON.parse(body) } catch {}

    const { profile, action, pdfText: pdfTextJson } = parsed

    // ─── Sous-cas A : scan profond (recharge avec profil déjà connu) ───
    if (action === 'deep_scan' && profile) {
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
          .filter(l => (l.score ?? 0) >= 55)

        return res.status(200).json({
          additionalLeads,
          count: additionalLeads.length
        })
      } catch (e) {
        console.error('deep_scan error', e)
        return res.status(500).json({ error: 'Scan profond échoué : ' + e.message })
      }
    }

    // ─── Sous-cas B : analyse initiale depuis pdfText (extrait côté nav) ───
    if (pdfTextJson) {
      return runInitialAnalysis(res, apiUrl, boondHeaders, anthropicKey, pdfTextJson)
    }

    return res.status(400).json({ error: 'Body JSON invalide : attendu { pdfText } ou { profile, action:"deep_scan" }' })
  }

  // Aucun content-type reconnu
  return res.status(400).json({ error: 'Content-Type attendu : application/json' })
}

// Analyse initiale : à partir du texte du PDF déjà extrait côté navigateur,
// scanne Boond et renvoie les pistes scorées.
async function runInitialAnalysis(res, apiUrl, boondHeaders, anthropicKey, pdfText) {
  try {
    if (!pdfText || !pdfText.trim()) {
      return res.status(400).json({ error: 'Aucun contenu PDF exploitable' })
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const profile = await extractProfileFromPdf(anthropic, pdfText)

      if (!(profile.stack_primary?.length || profile.stack_keywords_composed?.length)) {
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
        // Garantit qu'on a toujours l'id : priorité à parseContactFull, sinon fallback sur l'id du scan
        if (full) full.id = full.id || c.row.id
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

      for (const [, group] of contactsByCompany.entries()) {
        const list = group.contacts.map(x => x.full)
        const best = pickBestContact(list, profile)
        if (!best) continue
        const cId = group.company?.id
        const statusInfo = cId ? (companyStatuses.get(cId) || { status: 'unknown', activeCount: 0, pastCount: 0 }) : { status: 'unknown', activeCount: 0, pastCount: 0 }
        // Autres contacts (hors best), pour affichage dépliable côté client
        const otherContacts = list.filter(c => c.id !== best.id).map(c => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          function: c.function,
          email: c.email,
          phone: c.phone,
          boondUrl: `https://ui.boondmanager.com/contacts/${c.id}/information`
        }))
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
          otherContacts,
          otherContactsCount: otherContacts.length,
          matchedOn: Array.from(group.matchedOn),
          scoringPayload: {
            id: `contact_${cId || best.firstName + best.lastName}`,
            kind: 'contact',
            fullName: `${best.firstName} ${best.lastName}`,
            function: best.function,
            allContactsInCompany: list.map(c => ({ name: `${c.firstName} ${c.lastName}`, function: c.function })).slice(0, 8),
            company: group.company?.name || '',
            companyActivity: group.company?.activityArea || '',
            companyStatus: statusInfo.status,
            matchedOn: Array.from(group.matchedOn)
          },
          boondUrl: `https://ui.boondmanager.com/contacts/${best.id || ''}/information`
        })
      }

      // ─── Leads company_direct : sociétés remontées via /companies (pas déjà couvertes par opp/contact) ───
      const alreadyCoveredCompanyIds = new Set()
      for (const l of allLeadsRaw) if (l.companyId) alreadyCoveredCompanyIds.add(String(l.companyId))

      // Fetch statut pour les nouvelles sociétés
      const directCompanyIds = scan.companiesDirect
        .filter(c => !alreadyCoveredCompanyIds.has(String(c.row.id)))
        .map(c => c.row.id)
      await Promise.all(directCompanyIds.map(async id => {
        if (!companyStatuses.has(id)) {
          companyStatuses.set(id, await fetchCompanyStatus(apiUrl, boondHeaders, id))
        }
      }))

      for (const cDirect of scan.companiesDirect) {
        if (alreadyCoveredCompanyIds.has(String(cDirect.row.id))) continue
        const a = cDirect.row.attributes || {}
        const statusInfo = companyStatuses.get(cDirect.row.id) || { status: 'unknown', activeCount: 0, pastCount: 0 }
        allLeadsRaw.push({
          id: `company_${cDirect.row.id}`,
          kind: 'company_direct',
          sourceType: 'Société (approche proactive)',
          title: a.name || `Société #${cDirect.row.id}`,
          company: a.name || '',
          companyId: cDirect.row.id,
          companyActivity: a.activityArea || '',
          companyTown: a.town || a.city || '',
          companyStatus: statusInfo.status,
          companyStatusLabel: statusLabel(statusInfo.status),
          companyMissions: { active: statusInfo.activeCount, past: statusInfo.pastCount },
          contact: null,
          otherContacts: [],
          otherContactsCount: 0,
          matchedOn: cDirect.matchedOn,
          scoringPayload: {
            id: `company_${cDirect.row.id}`,
            kind: 'company_direct',
            company: a.name || '',
            companyActivity: a.activityArea || '',
            companyDescription: (a.description || '').slice(0, 300),
            companyStatus: statusInfo.status,
            matchedOn: cDirect.matchedOn
          },
          boondUrl: `https://ui.boondmanager.com/companies/${cDirect.row.id}/information`
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
        .filter(l => (l.score ?? 0) >= 55)
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
          keywordsPrimary: profile.stack_primary || [],
          keywordsSecondary: profile.stack_secondary || [],
          keywordsComposed: profile.stack_keywords_composed || [],
          opportunitiesScanned: scan.opportunities.length,
          contactsScanned: scan.contacts.length,
          companiesDirectScanned: scan.companiesDirect.length,
          leadsRetained: allLeads.length,
          byStatus: {
            active_client: allLeads.filter(l => l.companyStatus === 'active_client').length,
            past_client: allLeads.filter(l => l.companyStatus === 'past_client').length,
            prospect: allLeads.filter(l => l.companyStatus === 'prospect').length,
            unknown: allLeads.filter(l => l.companyStatus === 'unknown').length
          },
          byKind: {
            opportunity: allLeads.filter(l => l.kind === 'opportunity').length,
            contact: allLeads.filter(l => l.kind === 'contact').length,
            company_direct: allLeads.filter(l => l.kind === 'company_direct').length,
            action_note: allLeads.filter(l => l.kind === 'action_note').length
          }
        }
      })
    } catch (e) {
      console.error('boond-push-leads error', e)
      return res.status(500).json({ error: e.message || 'Erreur serveur' })
    }
}
