// Campagne push — étape 1 : vérification Boond et rédaction des mails.
//
// Rien n'est écrit dans Boond ni dans Gmail à ce stade : la route lit Boond et
// rédige. Le front envoie la liste par petits paquets pour afficher une
// progression et rester loin des délais maximum de Vercel.
import Anthropic from '@anthropic-ai/sdk'
import {
  boondFromEnv, boondUrl, findContact, contactCompany, findCompany,
  companyStatus, lastContactAction
} from './boond-lib.js'

export const config = { maxDuration: 300 }

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

// En deçà, un contact est considéré comme déjà travaillé : un collègue l'a
// touché récemment, on ne le relance pas par-dessus.
const RECENT_DAYS = 60
const MAX_ROWS_CHECK = 10
const MAX_ROWS_WRITE = 6

// Petit limiteur de concurrence : Boond n'aime pas les rafales.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

async function checkRow(boond, row) {
  const contact = await findContact(boond, row)
  let company = contact ? await contactCompany(boond, contact.id) : null
  let companyHow = company ? 'contact' : null
  if (!company) {
    company = await findCompany(boond, row)
    companyHow = company?.how || null
  }
  const status = company ? await companyStatus(boond, company.id) : 'unknown'
  const last = contact ? await lastContactAction(boond, contact.id) : null
  const days = last ? (Date.now() - new Date(last.date)) / 86400000 : Infinity

  let verdict
  if (status === 'active_client') verdict = 'client_actif'
  else if (days <= RECENT_DAYS) verdict = 'deja_contacte'
  else if (status === 'past_client') verdict = 'ancien_client'
  else if (!contact && !company) verdict = 'nouveau'
  else verdict = 'prospect'

  return {
    id: row.id,
    verdict,
    contact: contact ? { id: contact.id, how: contact.how, url: boondUrl('contacts', contact.id) } : null,
    company: company ? { id: company.id, name: company.name, how: companyHow, url: boondUrl('companies', company.id) } : null,
    status,
    lastAction: last
  }
}

// ── Rédaction ────────────────────────────────────────────────────────────────

const WRITE_SYSTEM = `Tu rédiges des mails de prospection "push dossier" pour ever"T, ESN tech IA-native (conseil Tech, Data.IA et Product, groupe European Digital Group). Chaque mail propose UN consultant à UN prospect, avec son dossier de compétences en pièce jointe.

Tu reçois la fiche du consultant, l'expéditeur, et une liste de prospects. Tu rédiges un mail par prospect, en reprenant son "id".

FORMAT DU CORPS — à respecter exactement :

Bonjour <Prénom du prospect>,

<Une seule phrase : l'expéditeur se présente (prénom, ever"T) et dit pourquoi il écrit, en s'appuyant sur le poste ou les technologies du prospect.>

Je vous propose <Prénom du consultant>, <son intitulé de poste> :
- <puce>
- <puce>
- <puce>

Son dossier de compétences est en pièce jointe. <Une phrase qui propose un échange court.>

Si le sujet ne vous concerne pas, dites-le-moi simplement et je ne vous relancerai pas.

<Prénom Nom de l'expéditeur>
ever"T

RÈGLES :
- 3 ou 4 puces, 12 mots maximum chacune, chacune commençant par "- ".
- Choisis les puces qui parlent au prospect : ses technologies et les profils qu'il encadre. Mais chaque puce doit reposer sur un fait présent dans la fiche du consultant. N'invente rien : ni compétence, ni chiffre, ni client, ni disponibilité. S'il n'y a pas de recoupement, prends les points forts les plus solides de la fiche.
- Désigne le consultant par son prénom uniquement, jamais son nom de famille.
- N'invente rien sur le prospect ni sur son entreprise ; n'utilise que ce qui est fourni.
- Vouvoiement. Pas de formule creuse ("J'espère que vous allez bien", "N'hésitez pas", "Je me permets"). Pas de gras, pas d'emoji.
- Objet : 4 à 8 mots, concret, sans point d'exclamation. Exemple : "Tech Lead React senior pour vos équipes".`

const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    emails: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          objet: { type: 'string' },
          corps: { type: 'string' }
        },
        required: ['id', 'objet', 'corps'],
        additionalProperties: false
      }
    }
  },
  required: ['emails'],
  additionalProperties: false
}

const strip = (s) => String(s || '').replace(/\*\*/g, '')

// Fiche condensée du consultant : ce que le rédacteur a le droit d'affirmer.
function talentBrief(d) {
  const prenom = d.prenom || String(d.nom || '').split(' ')[0]
  const lines = [
    `Prénom : ${prenom}`,
    `Intitulé : ${d.metier || d.titre || ''}`,
    d.a_propos && `Résumé : ${strip(d.a_propos).slice(0, 900)}`,
    d.points_forts?.length && `Points forts : ${d.points_forts.map(p => `${p.valeur} ${p.libelle}`).join(' ; ')}`,
    d.expertises_cles?.length && `Expertises clés : ${d.expertises_cles.join(', ')}`,
    d.competences_techniques?.length && `Compétences :\n${d.competences_techniques.map(c => `- ${c.categorie} : ${(c.items || []).join(', ')}`).join('\n')}`,
    d.experiences?.length && `Expériences :\n${d.experiences.slice(0, 6).map(e => {
      const pts = [
        ...(e.activites || []).flatMap(a => a.points || []),
        ...(e.sub_roles || []).flatMap(s => (s.activites || []).flatMap(a => a.points || [])),
        ...(e.resultats || [])
      ].slice(0, 5).map(p => `  · ${strip(p)}`).join('\n')
      return `- ${e.entreprise} — ${e.role} (${e.dates})\n${pts}`
    }).join('\n')}`,
    d.formations?.length && `Formation : ${d.formations.map(f => `${f.diplome}${f.ecole ? ' — ' + f.ecole : ''}`).join(' ; ')}`
  ]
  return lines.filter(Boolean).join('\n')
}

async function writeEmails(dossier, rows, sender) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prospects = rows.map(r => ({
    id: r.id, prenom: r.prenom, nom: r.nom, poste: r.poste,
    technologies: r.technologies, profils_encadres: r.profils, entreprise: r.entreprise || ''
  }))
  const response = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: EMAIL_SCHEMA } },
    // Si le modèle décline une requête, l'API la rejoue d'elle-même sur un autre modèle
    fallbacks: 'default',
    system: WRITE_SYSTEM,
    messages: [{
      role: 'user',
      content: `EXPÉDITEUR : ${sender.name || sender.email}\n\nFICHE DU CONSULTANT :\n${talentBrief(dossier)}\n\nPROSPECTS :\n${JSON.stringify(prospects, null, 1)}`
    }]
  }, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })

  if (response.stop_reason === 'refusal') throw new Error('Rédaction refusée par le modèle')
  if (response.stop_reason === 'max_tokens') throw new Error('Réponse tronquée')
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text).emails
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { action, rows, dossier } = req.body || {}
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Aucune ligne reçue' })

  try {
    if (action === 'check') {
      if (rows.length > MAX_ROWS_CHECK) return res.status(400).json({ error: `${MAX_ROWS_CHECK} lignes maximum par appel` })
      const boond = boondFromEnv()
      if (!boond) return res.status(500).json({ error: 'Accès Boond non configuré' })
      const results = await mapLimit(rows, 4, row => checkRow(boond, row))
      return res.json({ results })
    }

    if (action === 'write') {
      if (rows.length > MAX_ROWS_WRITE) return res.status(400).json({ error: `${MAX_ROWS_WRITE} lignes maximum par appel` })
      if (!dossier) return res.status(400).json({ error: 'Dossier du consultant manquant' })
      const emails = await writeEmails(dossier, rows, { name: session.name, email: session.email })
      return res.json({ emails })
    }

    return res.status(400).json({ error: 'Action inconnue' })
  } catch (err) {
    console.error('Campaign error:', err)
    if (err instanceof Anthropic.RateLimitError) return res.status(503).json({ error: 'Claude est saturé, réessayez dans une minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Erreur Claude (${err.status}) : ${err.message}` })
    res.status(500).json({ error: err.message })
  }
}
