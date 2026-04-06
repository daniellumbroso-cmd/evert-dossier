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

let fontsReady = false

function setupFonts(assetsDir) {
  if (fontsReady) return
  try {
    const fontDir = '/tmp/evert_fonts'
    const cacheDir = '/tmp/evert_fontscache'
    fs.mkdirSync(fontDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })

    fs.copyFileSync(
      path.join(assetsDir, 'LiberationSans-Regular.ttf'),
      path.join(fontDir, 'LiberationSans-Regular.ttf')
    )
    fs.copyFileSync(
      path.join(assetsDir, 'LiberationSans-Bold.ttf'),
      path.join(fontDir, 'LiberationSans-Bold.ttf')
    )

    fs.writeFileSync(path.join(fontDir, 'fonts.conf'), `<?xml version='1.0'?>
<!DOCTYPE fontconfig SYSTEM 'fonts.dtd'>
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>`)

    process.env.FONTCONFIG_PATH = fontDir
    fontsReady = true
  } catch (e) {
    console.error('Font setup error:', e.message)
  }
}

async function generateCover(nom, titre) {
  const assetsDir = path.join(__dirname, '..', 'template_assets')
  const coverBuffer = fs.readFileSync(path.join(assetsDir, 'cover.jpg'))

  setupFonts(assetsDir)

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
      font-family='Liberation Sans, sans-serif'
      font-size='24' font-weight='bold' fill='white'>+ ${escapeXml(line)}</text>
  `).join('')

  const svg = `<svg width='1240' height='1754' xmlns='http://www.w3.org/2000/svg'>
    <text x='400' y='350'
      font-family='Liberation Sans, sans-serif'
      font-size='36' fill='white'>${escapeXml(nom)}</text>
    ${expertiseItems}
  </svg>`

  return sharp(coverBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

module.exports = { generateCover }
