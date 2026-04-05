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
 
  // Load fonts from template_assets
  const fontRegular = fs.readFileSync(path.join(assetsDir, 'LiberationSans-Regular.ttf'))
  const fontBold = fs.readFileSync(path.join(assetsDir, 'LiberationSans-Bold.ttf'))
  const fontRegularB64 = fontRegular.toString('base64')
  const fontBoldB64 = fontBold.toString('base64')
 
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
    <text x='650' y='${400 + i * 44}' class='plus'>+</text>
    <text x='680' y='${400 + i * 44}' class='expertise'>${escapeXml(line)}</text>
  `).join('')
 
  const svg = `<svg width='1240' height='1754' xmlns='http://www.w3.org/2000/svg'>
    <defs>
      <style>
        @font-face {
          font-family: 'LiberationSans';
          src: url('data:font/truetype;base64,${fontRegularB64}') format('truetype');
          font-weight: normal;
        }
        @font-face {
          font-family: 'LiberationSans';
          src: url('data:font/truetype;base64,${fontBoldB64}') format('truetype');
          font-weight: bold;
        }
        .nom { font-family: 'LiberationSans'; font-size: 36px; fill: white; font-weight: normal; }
        .expertise { font-family: 'LiberationSans'; font-size: 24px; fill: white; font-weight: bold; }
        .plus { font-family: 'LiberationSans'; font-size: 24px; fill: white; font-weight: bold; }
      </style>
    </defs>
    <text x='400' y='350' class='nom'>${escapeXml(nom)}</text>
    ${expertiseItems}
  </svg>`
 
  return sharp(coverBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}
 
module.exports = { generateCover }
 
