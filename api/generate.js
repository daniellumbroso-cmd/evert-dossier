import Anthropic from '@anthropic-ai/sdk'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try {
    return JSON.parse(Buffer.from(cookie, 'base64').toString())
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `Tu es un expert en rédaction de dossiers de compétences pour Ever"T, une ESN tech IA-native (Humilité. Progrès. Engagement).

FORMAT EXACT du dossier Ever"T :
1. NOM + TITRE MÉTIER avec stack principale (ex: "Data Analyst / Analytics Engineer GCP / dbt / Looker")
2. RÉSUMÉ :
   - À propos : 2-3 paragraphes narratifs à la 3e personne, humanisant, passionné, valorisant le profil
   - Principales Expériences : 3 dernières missions (Entreprise — Rôle + stack courte + dates)
   - Connaissances Techniques : groupées par catégories métier
3. Expériences (détail par mission) :
   - Titre : Entreprise — Rôle + stack (dates)
   - Projet : contexte en 1-2 phrases
   - Activités groupées par thème technique (ex: "Ingénierie de données (dbt & BigQuery)")
   - Enjeux : 2-3 défis business ou techniques
   - Résultats : métriques concrètes si disponibles, sinon impact qualitatif
   - Environnement technique : liste des technos utilisées
4. Formation & Certifications
5. Langues

RÈGLES DE RÉDACTION :
- À propos toujours à la 3e personne ("Lucas est...", "Mehdi maîtrise...")
- Phrases actives, percutantes, orientées impact
- Stack technique mise en avant dès le titre
- Résultats chiffrés si disponibles dans le CV source
- Ton professionnel mais vivant, jamais robotique
- Ne pas inventer d'informations non présentes dans le CV

RÉPONDS UNIQUEMENT EN JSON valide, sans backticks, sans texte avant ou après :
{
  "nom": "PRÉNOM NOM",
  "titre": "Rôle principal / Spécialité Stack1 / Stack2 / Stack3",
  "a_propos": "Paragraphe 1\\n\\nParagraphe 2\\n\\nParagraphe 3",
  "principales_experiences": [
    {"entreprise": "", "role": "", "stack": "", "dates": ""}
  ],
  "competences_techniques": [
    {"categorie": "Langages & traitement de données", "items": ["Python", "SQL"]}
  ],
  "experiences": [
    {
      "entreprise": "",
      "role": "",
      "stack": "",
      "dates": "",
      "projet": "",
      "activites": [
        {"theme": "Ingénierie de données (dbt & BigQuery)", "points": ["Point 1", "Point 2"]}
      ],
      "enjeux": ["Enjeu 1", "Enjeu 2"],
      "resultats": ["Résultat 1 chiffré", "Résultat 2"],
      "env_technique": ["dbt", "BigQuery", "Python"]
    }
  ],
  "formations": [
    {"diplome": "", "ecole": "", "annee": ""}
  ],
  "langues": [
    {"langue": "", "niveau": ""}
  ]
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Erreur parsing formulaire' })

    const community = fields.community?.[0] || 'DATA'
    const instructions = fields.instructions?.[0] || ''
    const cvText = fields.cvText?.[0] || ''
    const pdfFile = files.pdf?.[0]

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    let messages

    if (pdfFile) {
      // PDF mode
      const pdfBuffer = fs.readFileSync(pdfFile.filepath)
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
            text: `Génère le dossier de compétences Ever"T à partir de ce CV PDF.\nCommunauté cible : ${community}${instructions ? '\nInstructions : ' + instructions : ''}`
          }
        ]
      }]
    } else if (cvText) {
      // Text mode
      messages = [{
        role: 'user',
        content: `Génère le dossier de compétences Ever"T à partir de ce CV.\nCommunauté cible : ${community}${instructions ? '\nInstructions : ' + instructions : ''}\n\nCV :\n${cvText}`
      }]
    } else {
      return res.status(400).json({ error: 'Aucun CV fourni' })
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages
      })

      const raw = response.content.map(b => b.text || '').join('')
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const dossier = JSON.parse(cleaned)

      res.json({ success: true, dossier })
    } catch (apiErr) {
      console.error('Claude error:', apiErr)
      res.status(500).json({ error: 'Erreur génération Claude : ' + apiErr.message })
    } finally {
      if (pdfFile) {
        try { fs.unlinkSync(pdfFile.filepath) } catch {}
      }
    }
  })
}
