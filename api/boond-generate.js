import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

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

function cleanHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// Réutiliser le SYSTEM_PROMPT de generate.js
const SYSTEM_PROMPT = `Tu es un expert en rédaction de dossiers de compétences pour Ever"T, une ESN tech IA-native (Humilité. Progrès. Engagement).

FORMAT EXACT du dossier Ever"T :
1. NOM + TITRE MÉTIER avec stack principale
2. RÉSUMÉ : À propos (2-3 paragraphes, 3e personne), Principales Expériences, Connaissances Techniques
3. Expériences détaillées : Projet, Activités groupées par thème, Enjeux, Résultats, Environnement technique
4. Formation & Certifications
5. Langues

RÈGLES :
- À propos toujours à la 3e personne
- Phrases actives, orientées impact
- RÈGLE ABSOLUE ANTI-INVENTION : uniquement ce qui est dans les données fournies
- RÈGLE DE COMPLÉTUDE : Ne jamais tronquer le contenu des expériences
- Mise en gras avec **double astérisques** sur les mots-clés techniques
- Si besoin client fourni : mots-clés matchés mis en gras en priorité

RÉPONDS UNIQUEMENT EN JSON valide, sans backticks :
{
  "nom": "PRÉNOM NOM",
  "titre": "Rôle / Spécialité Stack1 / Stack2",
  "a_propos": "Paragraphe 1\\n\\nParagraphe 2\\n\\nParagraphe 3",
  "principales_experiences": [{"entreprise":"","role":"","stack":"","dates":""}],
  "competences_techniques": [{"categorie":"","items":[]}],
  "experiences": [{
    "entreprise":"","role":"","stack":"","dates":"","projet":"",
    "activites":[{"theme":"","points":[]}],
    "enjeux":[],"resultats":[],"env_technique":[]
  }],
  "formations": [{"diplome":"","ecole":"","annee":""}],
  "langues": [{"langue":"","niveau":""}]
}`

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
    // 1. Fiche candidat complète
    const candidateRes = await fetch(`${apiUrl}candidates/${candidateId}`, { headers })
    const candidateData = await candidateRes.json()
    const attrs = candidateData?.data?.attributes || {}

    // 2. Actions candidat (notes d'entretien)
    const actionsRes = await fetch(`${apiUrl}candidates/${candidateId}/actions?page[limit]=10`, { headers })
    const actionsData = await actionsRes.json()
    const candidateActions = (actionsData?.data || [])
      .map(a => cleanHtml(a.attributes?.text || a.attributes?.description || ''))
      .filter(Boolean)
      .join('\n\n---\n\n')

    // 3. Besoin client (opportunity) — titre + actions du besoin
    let opportunityContext = ''
    if (opportunityId) {
      const oppRes = await fetch(`${apiUrl}opportunities/${opportunityId}`, { headers })
      const oppData = await oppRes.json()
      const opp = oppData?.data?.attributes || {}

      // Actions du besoin = description réelle
      const oppActionsRes = await fetch(`${apiUrl}opportunities/${opportunityId}/actions?page[limit]=5`, { headers })
      const oppActionsData = await oppActionsRes.json()
      const oppDescription = (oppActionsData?.data || [])
        .map(a => cleanHtml(a.attributes?.text || ''))
        .filter(Boolean)
        .join('\n\n')

      opportunityContext = `
BESOIN CLIENT :
Titre : ${opp.title || ''}
Référence : ${opp.reference || ''}
Description : ${oppDescription || 'Non renseignée'}
Compétences requises : ${opp.skills || 'Non renseignées'}
`.trim()
    }

    // 4. Construire le texte CV structuré
    const experiences = (attrs.references || []).map(r =>
      `${r.title} chez ${r.company} (${r.startMonth}/${r.startYear} - ${r.endMonth || 'en cours'}/${r.endYear || ''})\n${r.description || ''}`
    ).join('\n\n')

    const cvText = `
NOM : ${attrs.firstName} ${attrs.lastName}
TITRE : ${attrs.title || ''}
LOCALISATION : ${attrs.town || ''} ${attrs.country || ''}
ANNÉES D'EXPÉRIENCE : ${attrs.experience || ''}

COMPÉTENCES : ${attrs.skills || ''}

EXPÉRIENCES :
${experiences}

FORMATIONS :
${(attrs.diplomas || []).join('\n')}

LANGUES :
${(attrs.languages || []).map(l => `${l.language}${l.level ? ' - ' + l.level : ''}`).join('\n')}

NOTES ENTRETIEN (compte-rendus Boond) :
${candidateActions || 'Aucune note'}
`.trim()

    // 5. Générer le dossier avec Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userMessage = `Génère le dossier de compétences Ever"T.
Communauté : ${community || 'Product'}

${opportunityContext ? opportunityContext + '\n\n' : ''}DONNÉES CANDIDAT (source Boondmanager) :
${cvText}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })

    const raw = response.content.map(b => b.text || '').join('')
    const firstBrace = raw.indexOf('{')
    const lastBrace = raw.lastIndexOf('}')
    const dossier = JSON.parse(raw.substring(firstBrace, lastBrace + 1))

    res.json({ success: true, dossier, source: 'boond', candidateId, opportunityId })

  } catch (err) {
    console.error('Boond generate error:', err)
    res.status(500).json({ error: 'Erreur : ' + err.message })
  }
}
