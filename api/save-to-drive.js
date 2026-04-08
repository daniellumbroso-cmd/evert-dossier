import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

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
    const { buildPptx } = await import('./pptx-builder.js')
    const pptxBuffer = await buildPptx(dossier)

    const auth = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    auth.setCredentials({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    })
    auth.on('tokens', (tokens) => { if (tokens.access_token) console.log('Token refreshed') })

    const drive = google.drive({ version: 'v3', auth })

    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')
    const safeName = dossier.nom.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim()
    const fileName = `Dossier EverT — ${safeName} — ${date}.pptx`
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    const { Readable } = await import('stream')
    const stream = Readable.from(pptxBuffer)

    // Upload PPTX natif SANS conversion Google Slides
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ...(folderId ? { parents: [folderId] } : {})
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        body: stream
      },
      fields: 'id, name, webViewLink'
    })

    // webViewLink = ouvrir dans Drive (viewer PPTX, pas conversion Slides)
    // webContentLink = lien de téléchargement direct
    const fileId = file.data.id
    // Lien viewer Drive natif (pas conversion Slides)
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`
    // Lien téléchargement direct Drive (pas usercontent)
    const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`

    res.json({
      success: true,
      docUrl: viewUrl,
      downloadUrl: downloadUrl,
      fileId: fileId,
      title: fileName
    })

  } catch (err) {
    console.error('Drive PPTX error:', err)
    if (err.message?.includes('invalid_grant') || err.message?.includes('Invalid Credentials') || err.status === 401) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' })
    }
    res.status(500).json({ error: 'Erreur Google Drive : ' + err.message })
  }
}
