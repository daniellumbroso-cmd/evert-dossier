import { google } from 'googleapis'

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try {
    return JSON.parse(Buffer.from(cookie, 'base64').toString())
  } catch {
    return null
  }
}

function buildDocContent(d) {
  const requests = []
  let index = 1

  const insert = (text, bold = false, italic = false, fontSize = 11, color = null) => {
    requests.push({
      insertText: { location: { index }, text }
    })
    const formatting = {
      bold, italic,
      fontSize: { magnitude: fontSize, unit: 'PT' },
      weightedFontFamily: { fontFamily: 'Arial' }
    }
    if (color) formatting.foregroundColor = { color: { rgbColor: color } }
    requests.push({
      updateTextStyle: {
        range: { startIndex: index, endIndex: index + text.length },
        textStyle: formatting,
        fields: 'bold,italic,fontSize,weightedFontFamily' + (color ? ',foregroundColor' : '')
      }
    })
    index += text.length
  }

  const insertLine = (text = '', bold = false, italic = false, fontSize = 11, color = null) => {
    insert(text + '\n', bold, italic, fontSize, color)
  }

  const insertSection = (title) => {
    insertLine('')
    insertLine(title.toUpperCase(), true, false, 10, { red: 0.4, green: 0.4, blue: 0.4 })
    insertLine('')
  }

  // Header
  insertLine(d.nom, true, false, 18)
  insertLine(d.titre, false, true, 12, { red: 0.3, green: 0.3, blue: 0.3 })
  insertLine('')

  // Résumé
  insertSection('Résumé')

  insertLine('À propos', true, false, 11)
  insertLine('')
  const paragraphs = d.a_propos.split('\n\n')
  paragraphs.forEach(p => {
    insertLine(p)
    insertLine('')
  })

  insertLine('Principales Expériences', true, false, 11)
  insertLine('')
  d.principales_experiences?.forEach(e => {
    insert('• ', false, false, 11)
    insert(e.entreprise, true, false, 11)
    insertLine(` — ${e.role}${e.stack ? ' ' + e.stack : ''} (${e.dates})`)
  })

  insertLine('')
  insertLine('Connaissances Techniques', true, false, 11)
  insertLine('')
  d.competences_techniques?.forEach(cat => {
    insert(cat.categorie + ' : ', true, false, 11)
    insertLine(cat.items.join(', '))
  })

  // Expériences
  insertSection('Expériences')

  d.experiences?.forEach(exp => {
    insertLine(`${exp.entreprise} — ${exp.role}${exp.stack ? ' ' + exp.stack : ''}`, true, false, 12)
    insertLine(exp.dates, false, true, 10, { red: 0.5, green: 0.5, blue: 0.5 })
    insertLine('')

    if (exp.projet) {
      insert('Projet : ', true, false, 11)
      insertLine(exp.projet)
      insertLine('')
    }

    exp.activites?.forEach(act => {
      insertLine(act.theme, true, false, 11)
      act.points?.forEach(p => insertLine('    • ' + p))
      insertLine('')
    })

    if (exp.enjeux?.length) {
      insertLine('Enjeux :', true, false, 11)
      exp.enjeux.forEach(e => insertLine('    • ' + e))
      insertLine('')
    }

    if (exp.resultats?.length) {
      insertLine('Résultats :', true, false, 11)
      exp.resultats.forEach(r => insertLine('    • ' + r))
      insertLine('')
    }

    if (exp.env_technique?.length) {
      insert('Environnement technique : ', true, false, 10)
      insertLine(exp.env_technique.join(', '), false, false, 10)
      insertLine('')
    }

    insertLine('─────────────────────────────────────', false, false, 8, { red: 0.8, green: 0.8, blue: 0.8 })
    insertLine('')
  })

  // Formation
  if (d.formations?.length) {
    insertSection('Formation & Certifications')
    d.formations.forEach(f => {
      insert('• ', false, false, 11)
      insert(f.diplome, true, false, 11)
      insertLine(`${f.ecole ? ' — ' + f.ecole : ''}${f.annee ? ' (' + f.annee + ')' : ''}`)
    })
    insertLine('')
  }

  // Langues
  if (d.langues?.length) {
    insertSection('Langues')
    d.langues.forEach(l => {
      insert('• ', false, false, 11)
      insert(l.langue, true, false, 11)
      insertLine(` — ${l.niveau}`)
    })
  }

  return requests
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { dossier } = req.body
  if (!dossier) return res.status(400).json({ error: 'Dossier manquant' })

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    auth.setCredentials({ access_token: session.access_token })

    const docs = google.docs({ version: 'v1', auth })
    const drive = google.drive({ version: 'v3', auth })

    const docTitle = `Dossier Ever"T — ${dossier.nom} — ${new Date().toLocaleDateString('fr-FR')}`

    // Create empty doc
    const doc = await docs.documents.create({ requestBody: { title: docTitle } })
    const docId = doc.data.documentId

    // Apply formatting
    const requests = buildDocContent(dossier)
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests }
      })
    }

    // Move to shared folder
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (folderId) {
      await drive.files.update({
        fileId: docId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents'
      })
    }

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`
    res.json({ success: true, docUrl, docId, title: docTitle })
  } catch (err) {
    console.error('Drive error:', err)
    res.status(500).json({ error: 'Erreur Google Drive : ' + err.message })
  }
}
