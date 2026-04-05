const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

async function generateCover(nom, titre) {
  const coverPath = path.join(__dirname, '..', 'template_assets', 'cover.jpg')
  const coverBuffer = fs.readFileSync(coverPath)

  // Split titre into lines of max ~35 chars for readability
  const words = titre.split(' / ')
  const lines = []
  let current = ''
  words.forEach(w => {
    if ((current + (current ? ' / ' : '') + w).length > 35) {
      if (current) lines.push(current)
      current = w
    } else {
      current = current ? current + ' / ' + w : w
    }
  })
  if (current) lines.push(current)

  const expertiseItems = lines.map((line, i) => `
    <text x='650' y='${400 + i * 44}' class='plus'>+</text>
    <text x='680' y='${400 + i * 44}' class='expertise'>${escapeXml(line)}</text>
  `).join('')

  const svg = `<svg width='1240' height='1754' xmlns='http://www.w3.org/2000/svg'>
    <style>
      .nom { font-family: 'Arial'; font-size: 36px; fill: white; font-weight: 300; }
      .expertise { font-family: 'Arial'; font-size: 24px; fill: white; font-weight: 700; }
      .plus { font-family: 'Arial'; font-size: 24px; fill: white; font-weight: 700; }
    </style>
    <text x='400' y='350' class='nom'>${escapeXml(nom)}</text>
    ${expertiseItems}
  </svg>`

  return sharp(coverBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

module.exports = { generateCover }
