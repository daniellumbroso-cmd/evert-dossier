import Anthropic from '@anthropic-ai/sdk'
import formidable from 'formidable'
import fs from 'fs'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

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
- RÈGLE BULLETS OBLIGATOIRE : Dans chaque activité, chaque item doit être dans le tableau "points" — jamais de texte libre hors bullets. Si un thème a plusieurs actions, chaque action est un point séparé dans "points". Ne jamais mettre plusieurs actions dans un seul point. Chaque ligne du CV source = 1 point séparé dans "points[]". Les enjeux et résultats suivent la même règle : 1 item = 1 élément dans le tableau. Exemple correct : {"theme": "Pilotage technique", "points": ["Pilotage du développement Java/Angular", "Co-conception des flux de données et interfaces API", "Modélisation des données SQL"]}. Exemple INCORRECT : {"theme": "Pilotage technique", "points": ["Pilotage du développement Java/Angular Co-conception des flux..."]}
- RÈGLE DE COMPLÉTUDE : Ne jamais tronquer, résumer ou limiter le contenu des expériences. Chaque activité, point, enjeu et résultat présent dans le CV doit être retranscrit intégralement. Plus une expérience est riche, plus le dossier doit être détaillé. Ne pas se limiter à 1, 2 ou 3 points par thème — retranscrire tout ce qui est pertinent.
- RÈGLE DE LISIBILITÉ : Si une expérience a peu de contenu (moins de 8 points au total), regrouper les activités sous 2-3 thèmes maximum plutôt que de créer 5-6 thèmes avec 1 point chacun. Un thème avec 1 seul point doit être fusionné avec un thème proche.

MISE EN GRAS des mots-clés importants :
- Dans les textes (a_propos, projet, points d'activités, enjeux, résultats), entoure les mots-clés techniques importants avec **double astérisques** : ex "mise en place d'un pipeline **dbt** sur **BigQuery**"
- Si un besoin client est fourni, les mots-clés du besoin présents dans le CV doivent être mis en gras en priorité

ORDRE DES COMPÉTENCES TECHNIQUES :
- Si un besoin client est fourni, mettre en PREMIER dans chaque catégorie les items qui correspondent au besoin
- Les compétences non pertinentes pour le besoin client passent en dernier

ADAPTATION AU BESOIN CLIENT (si besoin fourni) :
- TITRE : adapter le titre du candidat pour qu'il corresponde exactement au besoin client (ex: si besoin "PO secteur public / Alexi / DIHAL", titre = "Product Owner / Secteur Public / Jira / Confluence / SQL" plutôt que générique)
- WORDING : dans le résumé et les expériences, adapter les formulations pour mettre en avant ce qui correspond au besoin (sans invention) — ex: si besoin "PM en binôme", mettre en avant la capacité à travailler en collaboration
- AJUSTEMENTS : lister de manière concise (3-6 points max) les adaptations faites pour coller au besoin

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
  ],
  "ajustements": ["Adaptation 1 : ...", "Adaptation 2 : ..."]
}`


// ── INFOS EXPÉDITEUR pour le mode push ──
function getSenderInfo(email) {
  if (email === 'daniel.lumbroso@ever-t.fr') {
    return { nom: 'Daniel Lumbroso', role: 'Fondateur', signature: 'Daniel' }
  }
  if (email === 'quentin.branchet@ever-t.fr') {
    return { nom: 'Quentin Branchet', role: 'Co-fondateur', signature: 'Quentin' }
  }
  const prenom = email.split('.')[0]
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1)
  return { nom: p, role: 'Business Developer', signature: p }
}

const PUSH_PROMPT = `Tu es un expert en rédaction de mails de prospection commerciale pour ever"T, une ESN tech IA-native, filiale Product & data.iA de WOLD | EDG, avec +160 ingénieurs.

Tu génères des mails "push dossier" : emails courts et percutants envoyés à des prospects LinkedIn pour présenter un consultant ever"T.

STRUCTURE EXACTE :

OBJET : ever"T [référencé NOM_CLIENT_SI_CONNU] | Dossier [Métier principal] | [Prénom(s) candidat(s)]
→ Si pas de référencement connu : ever"T - Groupe Wold | Dossier [Métier] | [Prénom(s)]

CORPS :
Cher/Chère [Prénom prospect],
J'espère que vous allez bien.

Je suis [NOM_EXPEDITEUR], [ROLE] d'ever"T | Groupe Wold : société d'innovation spécialisée en [domaine pertinent] de +160 ingénieurs.

[Prénom candidat], un de nos [profil] spécialisé[s] en [stack principale], nous a exprimé son souhait de rejoindre [Entreprise prospect].

Ses points forts :
- [point fort 1]
- [point fort 2]
- [point fort 3]
- [point fort 4]
- [point fort 5 max]

Je suis disponible pour organiser un échange [timing]. Qu'en pensez-vous ?

Je vous souhaite une très belle journée,
[SIGNATURE]

RÈGLES BULLETS :
- Utiliser le tiret "-" comme marqueur de bullet (pas "•") — compatible copier-coller Gmail
- Chaque bullet = MAX 10 mots, ultra-condensé, percutant
- Format : "[Compétence clé] – [résultat ou contexte court]"
- Exemples corrects : "dbt + Databricks – stacks modernes maîtrisées" / "Decathlon – refonte BI 25 data"
- Jamais de phrase complète dans un bullet

RÈGLES MISE EN GRAS :
- Dans le corps du mail (pas les bullets), mettre en gras avec **double astérisques** les infos clés en lien avec le prospect
- Ex : si prospect manage une équipe data chez Generali → mettre en gras "**Data Manager**", "**Generali**", les technos qui matchent
- Mettre en gras : prénom du candidat, stack principale, nom de l'entreprise prospect, 1-2 mots clés qui matchent le contexte prospect

AUTRES RÈGLES :
- Points forts matchés avec le contexte du prospect
- RÈGLE ABSOLUE ANTI-INVENTION : Ne mentionner QUE des technos, méthodes, concepts ou expériences qui apparaissent mot pour mot dans le dossier candidat. Aucune inférence, aucune extrapolation, aucun synonyme "proche". Si "Kimball" est dans le dossier, ne pas écrire "Data Mesh". Si "Databricks" est dans le dossier, ne pas écrire "Spark" sauf si Spark est explicitement mentionné. En cas de doute sur une information : ne pas l'inclure.
- Ton professionnel, direct, légèrement chaleureux
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

    const community = fields.community?.[0] || 'DATA'
    const instructions = fields.instructions?.[0] || ''
    const cvText = fields.cvText?.[0] || ''
    const besoinClient = fields.besoinClient?.[0] || ''
    const pdfFile = files.pdf?.[0]

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // ── MODE PUSH : traiter en priorité avant le check CV ──
    if (fields.mode?.[0] === 'push') {
      const dossierJson = fields.dossier?.[0]
      const prospectInfo = fields.prospectInfo?.[0] || ''
      const prospectPdfFile = files.prospectPdf?.[0]
      if (!dossierJson) return res.status(400).json({ error: 'Dossier manquant' })
      let dossierData
      try { dossierData = JSON.parse(dossierJson) } catch { return res.status(400).json({ error: 'JSON invalide' }) }

      const sender = getSenderInfo(session.email)
      const candidatSummary = `NOM : ${dossierData.nom}\nTITRE : ${dossierData.titre}\nCOMPÉTENCES : ${dossierData.competences_techniques?.map(c => c.categorie + ': ' + c.items.slice(0, 5).join(', ')).join(' | ')}\nEXPÉRIENCES : ${dossierData.principales_experiences?.map(e => e.entreprise + ' — ' + e.role + ' (' + e.dates + ')').join(' | ')}\nRÉSUMÉ : ${dossierData.a_propos?.substring(0, 400)}`
      const senderInfo = `EXPÉDITEUR : ${sender.nom} (${sender.role})\nSIGNATURE : ${sender.signature}`

      let pushMessages
      if (prospectPdfFile) {
        const pdfBuffer = fs.readFileSync(prospectPdfFile.filepath)
        const base64 = pdfBuffer.toString('base64')
        pushMessages = [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: `Génère un mail push dossier ever"T.\n\nINFOS EXPÉDITEUR :\n${senderInfo}\n\nDOSSIER CANDIDAT :\n${candidatSummary}\n\nPROFIL PROSPECT : voir PDF ci-joint.${prospectInfo ? '\nINFO COMPLÉMENTAIRE : ' + prospectInfo : ''}` }] }]
      } else {
        pushMessages = [{ role: 'user', content: `Génère un mail push dossier everT.\n\nINFOS EXPÉDITEUR :\n${senderInfo}\n\nDOSSIER CANDIDAT :\n${candidatSummary}\n\n${prospectInfo ? 'PROFIL PROSPECT (cibler ce contexte précis) :\n' + prospectInfo : 'PAS DE PROSPECT SPÉCIFIQUE : génère un mail push générique percutant, sans destinataire nommé, avec une formule ouverte type "Cher(e) [Prénom]," — le mail sera personnalisé manuellement ensuite.'}` }]
      }

      let rawPush = ''
      try {
        const pushResponse = await anthropic.messages.create({ model: 'claude-opus-4-5', max_tokens: 1500, system: PUSH_PROMPT, messages: pushMessages })
        rawPush = pushResponse.content.map(b => b.text || '').join('')
        const firstBrace = rawPush.indexOf('{')
        const lastBrace = rawPush.lastIndexOf('}')
        if (firstBrace === -1 || lastBrace === -1) throw new Error('Pas de JSON trouvé dans la réponse')
        let cleanedPush = rawPush.substring(firstBrace, lastBrace + 1)
        // Fix : le guillemet dans ever"T casse le JSON — on l'échappe avant parsing
        cleanedPush = cleanedPush.replace(/ever"T/g, 'everT')
        let result
        try {
          result = JSON.parse(cleanedPush)
        } catch (parseErr) {
          // Fallback : extraire objet et corps ligne par ligne
          const lines = cleanedPush.split('\n')
          let objet = '', corps = ''
          for (const line of lines) {
            const om = line.match(/^\s*"objet"\s*:\s*"(.+?)"\s*,?\s*$/)
            if (om) objet = om[1]
          }
          // Pour corps, prendre tout entre 'corps': ' et la derniere '
          const corpsStart = cleanedPush.indexOf('"corps"')
          if (corpsStart > -1) {
            const afterCorps = cleanedPush.substring(corpsStart + 8)
            const firstQuote = afterCorps.indexOf('"')
            const lastQuote = afterCorps.lastIndexOf('"')
            if (firstQuote > -1 && lastQuote > firstQuote) {
              corps = afterCorps.substring(firstQuote + 1, lastQuote)
                .replace(/\\n/g, '\n')
            }
          }
          if (objet && corps) {
            result = { objet, corps }
          } else {
            throw parseErr
          }
        }
        return res.json({ success: true, objet: result.objet, corps: result.corps })
      } catch (e) {
        console.log('PUSH ERROR:', e.message, '| RAW:', JSON.stringify(rawPush.substring(0, 300)))
        return res.status(500).json({ error: 'Erreur génération push : ' + e.message })
      } finally {
        if (prospectPdfFile) { try { fs.unlinkSync(prospectPdfFile.filepath) } catch {} }
      }
    }

    const besoinSection = besoinClient
      ? `\n\nBESOIN CLIENT (mets en gras les mots-clés correspondants trouvés dans le CV, réordonne les compétences techniques en priorité) :\n${besoinClient}`
      : ''

    let messages

    if (pdfFile) {
      const pdfBuffer = fs.readFileSync(pdfFile.filepath)

      // Extraire le texte du PDF localement (plus rapide et moins de tokens que base64)
      let cvText = ''
      try {
        const parsed = await pdfParse(pdfBuffer)
        cvText = parsed.text
      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr.message)
        // Fallback : envoyer en base64 si extraction échoue
        const base64 = pdfBuffer.toString('base64')
        messages = [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: `Génère le dossier de compétences Ever"T à partir de ce CV PDF.\nCommunauté cible : ${community}${instructions ? '\nInstructions complémentaires : ' + instructions : ''}${besoinSection}` }
          ]
        }]
      }

      if (cvText) {
        messages = [{
          role: 'user',
          content: `Génère le dossier de compétences Ever"T à partir de ce CV.\nCommunauté cible : ${community}${instructions ? '\nInstructions complémentaires : ' + instructions : ''}${besoinSection}\n\nCV :\n${cvText}`
        }]
      }
    } else if (cvText) {
      messages = [{
        role: 'user',
        content: `Génère le dossier de compétences Ever"T à partir de ce CV.\nCommunauté cible : ${community}${instructions ? '\nInstructions complémentaires : ' + instructions : ''}${besoinSection}\n\nCV :\n${cvText}`
      }]
    } else {
      return res.status(400).json({ error: 'Aucun CV fourni' })
    }

    // ── MODE NORMAL : générer le dossier ──
    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages
      })

      const raw = response.content.map(b => b.text || '').join('')
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Vérifier si la réponse est tronquée (stop_reason = max_tokens)
      const stopReason = response.stop_reason
      if (stopReason === 'max_tokens') {
        console.error('Response truncated at max_tokens, length:', cleaned.length)
        return res.status(500).json({ error: 'Le dossier est trop long pour être généré en une fois. Essayez avec un CV plus court ou sans besoin client détaillé.' })
      }

      let dossier
      try {
        dossier = JSON.parse(cleaned)
      } catch (parseErr) {
        // Tentative de réparation : trouver le dernier } valide
        console.error('JSON parse error, attempting repair. Length:', cleaned.length)
        return res.status(500).json({ error: 'Erreur de génération : réponse tronquée. Réessayez.' })
      }

      res.json({ success: true, dossier })
    } catch (apiErr) {
      console.error('Claude error:', apiErr.message || apiErr)
      const msg = apiErr.message || ''
      if (msg.includes('overloaded') || msg.includes('529')) {
        return res.status(503).json({ error: 'Claude est surchargé, réessayez dans quelques secondes.' })
      }
      if (msg.includes('too large') || msg.includes('file size') || msg.includes('413')) {
        return res.status(413).json({ error: 'Le PDF est trop lourd. Copiez-collez le texte du CV à la place.' })
      }
      res.status(500).json({ error: 'Erreur génération Claude : ' + msg })
    } finally {
      if (pdfFile) {
        try { fs.unlinkSync(pdfFile.filepath) } catch {}
      }
    }
  })
}
