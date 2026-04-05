const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function generateCover(nom, titre) {
  const assetsDir = path.join(__dirname, '..', 'template_assets')
  const coverBuffer = fs.readFileSync(path.join(assetsDir, 'cover.jpg'))

  // Split titre into lines of max ~30 chars
  const words = titre.split(' / ')
  const lines = []
  let current = ''
  words.forEach(w => {
    const next = current ? current + ' / ' + w : w
    if (next.length > 30) {
      if (current) lines.push(current)
      current = w
    } else {
      current = next
    }
  })
  if (current) lines.push(current)

  const expertiseItems = lines.map((line, i) => `
    <text x='650' y='${400 + i * 44}'
      font-family='Liberation Sans, Arial, sans-serif'
      font-size='24' font-weight='bold' fill='white'>+ ${escapeXml(line)}</text>
  `).join('')

  const svg = `<svg width='1240' height='1754' xmlns='http://www.w3.org/2000/svg'>
    <text x='400' y='350'
      font-family='Liberation Sans, Arial, sans-serif'
      font-size='36' font-weight='normal' fill='white'>${escapeXml(nom)}</text>
    ${expertiseItems}
  </svg>`

  return sharp(coverBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

module.exports = { generateCover }
