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

RÈGLE DE FUSION DES EXPÉRIENCES :
Quand un candidat a occupé plusieurs postes consécutifs chez le même employeur ET que les missions sont liées (même domaine technique, même contexte business, progression logique de carrière), tu DOIS les fusionner en une seule expérience avec des sous-rôles.
- Critères de fusion : même entreprise + périodes consécutives (sans gap) + missions thématiquement proches
- Critères de NON-fusion : même entreprise mais missions sans lien technique ou business (ex: dev Android puis chef de projet RH)
- Une expérience fusionnée a un champ "sub_roles" avec 2 ou 3 sous-rôles maximum
- La durée globale est la somme des deux postes (ex: fév. 2019 – mars 2024)
- Le titre affiché combine les deux rôles : "Consultant / Senior Consultant Data Analyst"
- Chaque sous-rôle a ses propres bullets d'activités
- Les enjeux, résultats et env_technique sont globaux (couvrent toute la période fusionnée)

RÈGLES DE RÉDACTION :
- À propos toujours à la 3e personne ("Lucas est...", "Mehdi maîtrise...")
- Phrases actives, percutantes, orientées impact
- Stack technique mise en avant dès le titre
- Résultats chiffrés si disponibles dans le CV source
- Ton professionnel mais vivant, jamais robotique
- RÈGLE ABSOLUE ANTI-INVENTION : Ne jamais inventer, déduire ou extrapoler d'informations non explicitement présentes dans le CV source. Si une information est absente, ne pas la mentionner. Si tu n'es pas certain d'une donnée, ne pas l'inclure.

MISE EN GRAS des mots-clés importants :
- Dans les textes (a_propos, projet, points d'activités, enjeux, résultats), entoure les mots-clés techniques importants avec **double astérisques** : ex "mise en place d'un pipeline **dbt** sur **BigQuery**"
- Si un besoin client est fourni, les mots-clés du besoin présents dans le CV doivent être mis en gras en priorité

ORDRE DES COMPÉTENCES TECHNIQUES :
- Si un besoin client est fourni, mettre en PREMIER dans chaque catégorie les items qui correspondent au besoin
- Les compétences non pertinentes pour le besoin client passent en dernier

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
        {"theme": "Ingénierie de données (dbt & BigQuery)", "points": ["Point 1 avec **mot-clé** en gras", "Point 2"]}
      ],
      "enjeux": ["Enjeu 1", "Enjeu 2"],
      "resultats": ["Résultat 1 chiffré", "Résultat 2"],
      "env_technique": ["dbt", "BigQuery", "Python"]
    },
    {
      "entreprise": "",
      "role": "Consultant / Senior Consultant Data Analyst",
      "stack": "",
      "dates": "fév. 2019 – mars 2024",
      "projet": "",
      "sub_roles": [
        {
          "titre": "Senior Consultant Data Analyst",
          "dates": "sept. 2021 – mars 2024",
          "activites": [
            {"theme": "Thème senior", "points": ["Point 1", "Point 2"]}
          ]
        },
        {
          "titre": "Consultant Data Analyst",
          "dates": "fév. 2019 – sept. 2021",
          "activites": [
            {"theme": "Thème consultant", "points": ["Point 1", "Point 2"]}
          ]
        }
      ],
      "enjeux": ["Enjeu global 1", "Enjeu global 2"],
      "resultats": ["Résultat global 1", "Résultat global 2"],
      "env_technique": ["Python", "SQL", "Power BI"]
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
    const besoinClient = fields.besoinClient?.[0] || ''
    const pdfFile = files.pdf?.[0]

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const besoinSection = besoinClient
      ? `\n\nBESOIN CLIENT (mets en gras les mots-clés correspondants trouvés dans le CV, réordonne les compétences techniques en priorité) :\n${besoinClient}`
      : ''

    let messages

    if (pdfFile) {
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
            text: `Génère le dossier de compétences Ever"T à partir de ce CV PDF.\nCommunauté cible : ${community}${instructions ? '\nInstructions complémentaires : ' + instructions : ''}${besoinSection}`
          }
        ]
      }]
    } else if (cvText) {
      messages = [{
        role: 'user',
        content: `Génère le dossier de compétences Ever"T à partir de ce CV.\nCommunauté cible : ${community}${instructions ? '\nInstructions complémentaires : ' + instructions : ''}${besoinSection}\n\nCV :\n${cvText}`
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
