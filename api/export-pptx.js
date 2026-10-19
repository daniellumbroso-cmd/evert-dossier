import { buildPptx } from './pptx-builder.js'
import { buildPptxV2 } from './pptx-builder-v2.js'
import { buildDossierFilename, contentDisposition } from './filename-utils.js'
import { getSession } from './_session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })
  const { dossier } = req.body
  if (!dossier) return res.status(400).json({ error: 'Dossier manquant' })

  try {
    const build = dossier.format === 'v2' ? buildPptxV2 : buildPptx
    const buffer = await build(dossier)
    const filename = buildDossierFilename(dossier, 'pptx')

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', contentDisposition(filename))
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    console.error('PPTX export error:', err)
    res.status(500).json({ error: 'Erreur génération PPTX : ' + err.message })
  }
}
