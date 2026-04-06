import Anthropic from '@anthropic-ai/sdk'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

// Infos expéditeur selon l'email connecté
function getSenderInfo(email) {
  if (email === 'daniel.lumbroso@ever-t.fr') {
    return { prenom: 'Daniel', nom: 'Daniel Lumbroso', role: 'Fondateur', signature: 'Daniel' }
  }
  if (email === 'quentin.branchet@ever-t.fr') {
    return { prenom: 'Quentin', nom: 'Quentin Branchet', role: 'Co-fondateur', signature: 'Quentin' }
  }
  // BizDev : extraire le prénom depuis l'email
  const prenom = email.split('.')[0]
  const prenomCapitalized = prenom.charAt(0).toUpperCase() + prenom.slice(1)
  return { prenom: prenomCapitalized, nom: prenomCapitalized, role: 'Business Developer', signature: prenomCapitalized }
}

const SYSTEM_PROMPT = `Tu es un expert en rédaction de mails de prospection commerciale pour ever"T, une ESN tech IA-native (Humilité. Progrès. Engagement), filiale Product & data.iA de WOLD | EDG, avec +160 ingénieurs.

Tu génères des mails de "push dossier" : des emails courts, percutants et personnalisés envoyés à des prospects LinkedIn pour leur présenter un ou plusieurs profils de consultants ever"T qui correspondraient à leurs besoins.

STRUCTURE EXACTE DU MAIL (à respecter impérativement) :

OBJET : ever"T [référencé NOM_CLIENT_SI_CONNU] | Dossier [Métier principal] | [Prénom(s) candidat(s)]
→ Si pas de référencement connu : ever"T - Groupe Wold | Dossier [Métier] | [Prénom(s)]

CORPS :
Cher/Chère [Prénom prospect],
J'espère que vous allez bien.

Je suis [NOM_EXPEDITEUR], [ROLE_EXPEDITEUR] d'ever"T | Groupe Wold : société d'innovation spécialisée en [domaine pertinent pour le prospect] de +160 ingénieurs.

[Prénom(s) candidat(s)], [un de nos / deux de nos] [profil court] spécialisé[s] en [stack principale], [nous a exprimé son souhait / nous ont exprimé leur souhait] de rejoindre [Entreprise prospect].

[Si 1 candidat] Ses points forts :
• Point fort 1 (le plus impactant pour CE prospect)
• Point fort 2
• Point fort 3
• Point fort 4
• Point fort 5 max

[Si 2+ candidats] Voici quelques lignes sur leurs profils :
**[Prénom 1] :**
• Point fort 1
• Point fort 2
• ...

**[Prénom 2] :**
• Point fort 1
• ...

Je suis disponible pour organiser un échange [début de semaine prochaine / dès cette semaine]. Qu'en pensez-vous ?

Je vous souhaite une très belle journée,
[SIGNATURE]

RÈGLES DE RÉDACTION :
- Mail court, dense, sans blabla — chaque bullet = valeur concrète pour LE prospect
- Les points forts doivent matcher avec ce que le prospect cherche (déduit de son profil LinkedIn)
- Jamais de mensonge ou d'extrapolation — uniquement ce qui est dans le dossier candidat
- Ton professionnel et direct, légèrement chaleureux (pas corporate)
- Le prénom du candidat est en gras dans la phrase d'accroche
- "nous a exprimé son souhait de rejoindre X" = formule clé à conserver

RÉPONDS UNIQUEMENT EN JSON valide, sans backticks :
{
  "objet": "Objet du mail complet",
  "corps": "Corps du mail complet avec sauts de ligne \\n"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Erreur parsing formulaire' })

    const dossierJson = fields.dossier?.[0]
    const prospectInfo = fields.prospectInfo?.[0] || ''
    const prospectPdfFile = files.prospectPdf?.[0]

    if (!dossierJson) return res.status(400).json({ error: 'Dossier manquant' })

    let dossier
    try { dossier = JSON.parse(dossierJson) }
    catch { return res.status(400).json({ error: 'Dossier JSON invalide' }) }

    const sender = getSenderInfo(session.email)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Résumé du dossier candidat pour le prompt
    const candidatSummary = `
NOM : ${dossier.nom}
TITRE : ${dossier.titre}
COMPÉTENCES CLÉS : ${dossier.competences_techniques?.map(c => c.categorie + ': ' + c.items.slice(0, 5).join(', ')).join(' | ')}
EXPÉRIENCES RÉCENTES : ${dossier.principales_experiences?.map(e => e.entreprise + ' — ' + e.role + ' (' + e.dates + ')').join(' | ')}
RÉSUMÉ : ${dossier.a_propos?.substring(0, 400)}
`

    const senderInfo = `
EXPÉDITEUR : ${sender.nom} (${sender.role})
EMAIL : ${session.email}
SIGNATURE : ${sender.signature}
`

    let messages

    if (prospectPdfFile) {
      // Prospect via PDF LinkedIn
      const pdfBuffer = fs.readFileSync(prospectPdfFile.filepath)
      const base64 = pdfBuffer.toString('base64')

      messages = [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          {
            type: 'text',
            text: `Génère un mail push dossier ever"T.

INFOS EXPÉDITEUR :
${senderInfo}

DOSSIER CANDIDAT :
${candidatSummary}

PROFIL PROSPECT : voir le PDF LinkedIn ci-joint.
${prospectInfo ? 'INFO COMPLÉMENTAIRE PROSPECT : ' + prospectInfo : ''}`
          }
        ]
      }]
    } else {
      // Prospect via texte libre
      messages = [{
        role: 'user',
        content: `Génère un mail push dossier ever"T.

INFOS EXPÉDITEUR :
${senderInfo}

DOSSIER CANDIDAT :
${candidatSummary}

PROFIL PROSPECT :
${prospectInfo || 'Non renseigné'}`
      }]
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages
      })

      const raw = response.content.map(b => b.text || '').join('')
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const result = JSON.parse(cleaned)

      res.json({ success: true, objet: result.objet, corps: result.corps })
    } catch (apiErr) {
      console.error('Claude push error:', apiErr)
      res.status(500).json({ error: 'Erreur génération : ' + apiErr.message })
    } finally {
      if (prospectPdfFile) {
        try { fs.unlinkSync(prospectPdfFile.filepath) } catch {}
      }
    }
  })
}
