import { google } from 'googleapis'
import PptxGenJS from 'pptxgenjs'
import fs from 'fs'
import path from 'path'

// ── Ancienne feature Google Docs conservée mais non utilisée ──
// La fonction buildDocContent() est archivée dans save-to-drive-doc.js.backup

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { dossier } = req.body
  if (!dossier) return res.status(400).json({ error: 'Dossier manquant' })

  try {
    // 1. Générer le PPTX en mémoire (réutilise la même logique que export-pptx)
    const { buildPptx } = await import('./pptx-builder.js')
    const pptxBuffer = await buildPptx(dossier)

    // 2. Upload vers Google Drive
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    auth.setCredentials({ access_token: session.access_token })
    const drive = google.drive({ version: 'v3', auth })

    const fileName = `Dossier Ever"T — ${dossier.nom} — ${new Date().toLocaleDateString('fr-FR')}.pptx`
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    const fileMetadata = {
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ...(folderId ? { parents: [folderId] } : {})
    }

    const { Readable } = await import('stream')
    const stream = Readable.from(pptxBuffer)

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        body: stream
      },
      fields: 'id, name, webViewLink'
    })

    const fileUrl = file.data.webViewLink
    res.json({ success: true, docUrl: fileUrl, fileId: file.data.id, title: fileName })

  } catch (err) {
    console.error('Drive PPTX error:', err)
    res.status(500).json({ error: 'Erreur Google Drive : ' + err.message })
  }
}
