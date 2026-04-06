import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { createCanvas, registerFont } from 'canvas'

// Génère la cover avec nom + expertises gravés via Sharp/SVG
export async function generateCoverWithText(nom, titre) {
  const assetsDir = path.join(process.cwd(), 'template_assets')
  
  // Split titre en expertises (séparées par " / ")
  const parts = titre.split(' / ')
  const exp1 = parts.slice(0, Math.ceil(parts.length / 2)).join(' / ')
  const exp2 = parts.slice(Math.ceil(parts.length / 2)).join(' / ')

  const bar_x = 620
  const y_profil = 280
  const line_height = 35

  const prenom_x = bar_x - 20
  const prenom_y = y_profil + Math.round(line_height * 2.5)
  const exp_x = bar_x + 30
  const exp1_y = y_profil + 55 + line_height
  const exp2_y = y_profil + 105 + line_height

  // Escape XML special chars
  const escXml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const svgText = `<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <text x="${prenom_x}" y="${prenom_y}" 
      font-family="Montserrat, Arial, sans-serif" font-size="30" fill="white" 
      text-anchor="end">${escXml(nom)}</text>
    <text x="${exp_x}" y="${exp1_y}" 
      font-family="Montserrat, Arial, sans-serif" font-size="26" font-weight="bold" fill="white">+ ${escXml(exp1)}</text>
    ${exp2 ? `<text x="${exp_x}" y="${exp2_y}" 
      font-family="Montserrat, Arial, sans-serif" font-size="26" font-weight="bold" fill="white">+ ${escXml(exp2)}</text>` : ''}
  </svg>`

  const coverPath = path.join(assetsDir, 'cover.jpg')
  const coverBuffer = await sharp(coverPath)
    .composite([{ input: Buffer.from(svgText), blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer()

  return coverBuffer
}
