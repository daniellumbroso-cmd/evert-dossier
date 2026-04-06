import { Packer } from 'docx'
import { buildDocument } from './docx-builder.js'
import { generateCoverWithText } from './cover-utils.js'
import fs from 'fs'
import path from 'path'

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try {
    return JSON.parse(Buffer.from(cookie, 'base64').toString())
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })

  const { dossier } = req.body
  if (!dossier) return res.status(400).json({ error: 'Dossier manquant' })

  try {
    // Génère la cover avec nom + titre gravés sur l'image
    const coverImgBuffer = await generateCoverWithText(dossier.nom, dossier.titre)

    const doc = buildDocument(dossier, coverImgBuffer)
    const buffer = await Packer.toBuffer(doc)

    const filename = `Dossier_EverT_${dossier.nom.replace(/\s+/g, '_')}.docx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    console.error('Docx export error:', err)
    res.status(500).json({ error: 'Erreur génération Word : ' + err.message })
  }
}
