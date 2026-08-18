import Anthropic from '@anthropic-ai/sdk'

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

const SYSTEM = `Tu rédiges 2 messages de "push dossier" pour ever"T (ESN IA-native, Paris) :
un EMAIL et un MESSAGE LinkedIn court, à un contact client, pour lui proposer proactivement un consultant.

Réponds UNIQUEMENT par un JSON valide, sans markdown :
{
  "email": {
    "subject": "...",
    "body": "..."
  },
  "linkedin": "..."
}

Règles de rédaction :

EMAIL :
- 90 à 140 mots maximum
- Ton : direct, professionnel, chaleureux, sans jargon commercial
- Structure : accroche personnalisée (1 phrase liée au contact ou à l'entreprise) → présentation du consultant en 2 phrases (rôle + 2-3 réalisations clés) → proposition d'échange courte
- Signature : "L'équipe ever\"T"
- Pas de "J'espère que ce message vous trouve en pleine forme"
- Pas de "N'hésitez pas à me contacter"
- Pas d'emojis
- Français tutoiement UNIQUEMENT si contexte évident, sinon vouvoiement

LINKEDIN :
- 40 à 70 mots MAXIMUM
- Beaucoup plus informel que l'email
- Structure : accroche → 1 phrase sur le consultant → proposition rapide d'échange
- Tutoiement OK sur LinkedIn
- Pas d'objet
- Pas de signature

Ne jamais inventer d'infos sur le contact ou l'entreprise. Utiliser uniquement ce qui est fourni.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { profile, target, kind, opportunity } = req.body || {}
  if (!profile || !target) {
    return res.status(400).json({ error: 'profile et target requis' })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return res.status(500).json({ error: 'Config manquante' })

  const anthropic = new Anthropic({ apiKey: anthropicKey })

  const contactBlock = target.contact
    ? `Contact identifié : ${target.contact.firstName} ${target.contact.lastName}${target.contact.function ? ' - ' + target.contact.function : ''}`
    : 'Contact non identifié (adresse le message génériquement)'

  const contextBlock = kind === 'opportunity' && opportunity
    ? `Contexte : opportunité existante "${opportunity.title || opportunity.reference}" (statut : ${opportunity.stateLabel || opportunity.state}) — l'objectif est de repositionner ce consultant dessus.`
    : `Contexte : approche proactive du compte, aucun besoin actif identifié.`

  const userMsg = `Consultant à pusher :
- Nom : ${profile.firstName || ''} ${profile.lastName || ''}
- Rôle : ${profile.role}
- Stack clé : ${(profile.stack_keywords || []).join(', ')}
- Séniorité : ${profile.seniority} (${profile.experience_years || '?'} ans XP)
- Clients passés notables : ${(profile.clients_past || []).join(', ') || '—'}
- Synthèse : ${profile.summary}

Cible :
- Entreprise : ${target.name || target.company || '—'}
- Secteur : ${target.activityArea || '—'}
${contactBlock}
${contextBlock}

Raison du match (générée par notre outil) : ${target.reason || '—'}`

  try {
    const r = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }]
    })
    const raw = r.content?.[0]?.text || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    let parsed
    try { parsed = JSON.parse(clean) }
    catch { return res.status(500).json({ error: 'JSON invalide de Claude', raw: clean.slice(0, 500) }) }

    return res.status(200).json(parsed)
  } catch (e) {
    console.error('push-message error', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
