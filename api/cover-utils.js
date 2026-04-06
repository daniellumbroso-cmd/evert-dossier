import sharp from 'sharp'
import path from 'path'

// Génère la cover avec nom + expertises gravés via Sharp SVG overlay
export async function generateCoverWithText(nom, titre) {
  const assetsDir = path.join(process.cwd(), 'template_assets')
  const coverPath = path.join(assetsDir, 'cover.jpg')

  // Split titre en 1-2 lignes d'expertises
  const parts = titre.split(' / ')
  const mid = Math.ceil(parts.length / 2)
  const exp1 = parts.slice(0, mid).join(' / ')
  const exp2 = parts.slice(mid).join(' / ')

  // Positions calées sur la cover (1240x1754px)
  // Barre verticale blanche à x≈620
  // "Profil" dans l'image à y≈280
  const bar_x = 620
  const y_profil = 280
  const line_h = 35

  const prenom_x = bar_x - 20
  const prenom_y = y_profil + Math.round(line_h * 2.5)
  const exp_x = bar_x + 30
  const exp1_y = y_profil + 55 + line_h
  const exp2_y = y_profil + 105 + line_h

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const svg = `<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <text x="${prenom_x}" y="${prenom_y}"
      font-family="Arial, sans-serif" font-size="30" fill="white"
      text-anchor="end">${esc(nom)}</text>
    <text x="${exp_x}" y="${exp1_y}"
      font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="white">+ ${esc(exp1)}</text>
    ${exp2 ? `<text x="${exp_x}" y="${exp2_y}"
      font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="white">+ ${esc(exp2)}</text>` : ''}
  </svg>`

  const coverBuffer = await sharp(coverPath)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer()

  return coverBuffer
}
