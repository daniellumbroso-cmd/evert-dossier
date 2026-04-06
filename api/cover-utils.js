import sharp from 'sharp'
import path from 'path'

export async function generateCoverWithText(nom, titre) {
  const assetsDir = path.join(process.cwd(), 'template_assets')
  const coverPath = path.join(assetsDir, 'cover.jpg')

  // Split titre en 1-2 expertises
  const parts = titre.split(' / ')
  const mid = Math.ceil(parts.length / 2)
  const exp1 = parts.slice(0, mid).join(' / ')
  const exp2 = parts.slice(mid).join(' / ')

  // Positions sur la cover 1240x1754px
  // Barre blanche x≈620, "Profil" y≈280
  const bar_x = 620
  const y_profil = 280
  const line_h = 35

  // Prénom : à gauche de la barre, aligné à droite → calcul manuel de x
  // On place le texte à x=100 avec largeur fixe à gauche de la barre
  const prenom_x = 100
  const prenom_y = y_profil + Math.round(line_h * 2.5)
  const exp_x = bar_x + 30
  const exp1_y = y_profil + 55 + line_h
  const exp2_y = y_profil + 105 + line_h

  // Encode pour SVG XML (pas d'attributs spéciaux, juste escape)
  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const nomSafe = esc(nom)
  const exp1Safe = esc(exp1)
  const exp2Safe = exp2 ? esc(exp2) : ''

  const svg = Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
    <text x="${prenom_x}" y="${prenom_y}"
      font-family="sans-serif" font-size="32" fill="white">${nomSafe}</text>
    <text x="${exp_x}" y="${exp1_y}"
      font-family="sans-serif" font-size="26" font-weight="bold" fill="white">+ ${exp1Safe}</text>
    ${exp2Safe ? `<text x="${exp_x}" y="${exp2_y}"
      font-family="sans-serif" font-size="26" font-weight="bold" fill="white">+ ${exp2Safe}</text>` : ''}
  </svg>`)

  const coverBuffer = await sharp(coverPath)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer()

  return coverBuffer
}
