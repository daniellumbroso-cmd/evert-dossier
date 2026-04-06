import PptxGenJS from 'pptxgenjs'
import fs from 'fs'
import path from 'path'

function getSession(req) {
  const cookie = req.cookies?.evert_session
  if (!cookie) return null
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()) }
  catch { return null }
}

const BLUE = '1400FF'
const WHITE = 'FFFFFF'
const BLACK = '111111'
const LIGHT = 'fafaf8'

const W = 7.5
const H = 10.61

// Parse **gras** en rich text PptxGenJS
function parseRichText(text, baseOpts = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.filter(p => p.length > 0).map(part => {
    const isBold = part.startsWith('**') && part.endsWith('**')
    const content = isBold ? part.slice(2, -2) : part
    return { text: content, options: { ...baseOpts, bold: isBold || baseOpts.bold || false } }
  })
}

function addCoverSlide(pres, d, coverPath) {
  const slide = pres.addSlide()
  const coverData = 'image/jpeg;base64,' + fs.readFileSync(coverPath).toString('base64')
  slide.addImage({ data: coverData, x: 0, y: 0, w: W, h: H })

  const bar_x = 3.75
  const y_profil = 1.62
  const line_h = 0.22

  slide.addText(d.nom, {
    x: 0.3, y: y_profil + line_h * 2.5,
    w: bar_x - 0.5, h: 0.45,
    fontSize: 20, color: WHITE, fontFace: 'Calibri',
    align: 'right', bold: false, margin: 0
  })

  const parts = d.titre.split(' / ')
  const mid = Math.ceil(parts.length / 2)
  const exp1 = parts.slice(0, mid).join(' / ')
  const exp2 = parts.slice(mid).join(' / ')

  slide.addText('+ ' + exp1, {
    x: bar_x + 0.2, y: y_profil + 0.32 + line_h,
    w: W - bar_x - 0.3, h: 0.35,
    fontSize: 14, color: WHITE, fontFace: 'Calibri', bold: true, margin: 0
  })
  if (exp2) {
    slide.addText('+ ' + exp2, {
      x: bar_x + 0.2, y: y_profil + 0.32 + line_h * 3.2,
      w: W - bar_x - 0.3, h: 0.35,
      fontSize: 14, color: WHITE, fontFace: 'Calibri', bold: true, margin: 0
    })
  }
}

function addResumeSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  let y = 0.35

  slide.addText('RÉSUMÉ', { x: 0.4, y, w: W - 0.8, h: 0.55, fontSize: 30, color: BLUE, fontFace: 'Georgia', align: 'center' })
  y += 0.65

  slide.addText('À propos', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 15, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  y += 0.38

  const aproposText = d.a_propos.replace(/\n\n/g, ' ')
  slide.addText(aproposText, { x: 0.4, y, w: W - 0.8, h: 1.9, fontSize: 9.5, color: BLACK, fontFace: 'Calibri', align: 'left', valign: 'top', wrap: true })
  y += 2.0

  slide.addText('Principales Expériences', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  y += 0.38

  const expItems = d.principales_experiences.map((e, i) => ({
    text: `${e.entreprise} : ${e.role}${e.stack ? ' ' + e.stack : ''} (${e.dates})`,
    options: { bullet: true, breakLine: i < d.principales_experiences.length - 1, fontSize: 9.5, color: BLACK, fontFace: 'Calibri' }
  }))
  slide.addText(expItems, { x: 0.5, y, w: W - 0.9, h: 1.0 })
  y += 1.1

  slide.addText('Connaissances Techniques', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  y += 0.38

  const techItems = d.competences_techniques.map((c, i) => ({
    text: `${c.categorie} : ${c.items.join(', ')}`,
    options: { bullet: true, breakLine: i < d.competences_techniques.length - 1, fontSize: 9.5, color: BLACK, fontFace: 'Calibri' }
  }))
  slide.addText(techItems, { x: 0.5, y, w: W - 0.9, h: 1.5 })
}

function addExperienceSlide(pres, exp) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  // Header bleu
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.05, fill: { color: BLUE }, line: { color: BLUE } })

  let y = 0.2

  // Titre expérience
  slide.addText('↗  ' + exp.entreprise + ' – ' + exp.role + (exp.stack ? ' ' + exp.stack : ''), {
    x: 0.3, y, w: W - 0.5, h: 0.45,
    fontSize: 13, color: BLUE, fontFace: 'Georgia', bold: true, wrap: true
  })
  y += 0.5

  slide.addText(exp.dates, { x: 0.3, y, w: W - 0.5, h: 0.28, fontSize: 10, color: BLUE, fontFace: 'Calibri', italic: true })
  y += 0.32

  if (exp.projet) {
    const projRich = parseRichText(exp.projet, { fontSize: 9.5, color: BLACK, fontFace: 'Calibri', italic: true })
    slide.addText(projRich, { x: 0.3, y, w: W - 0.5, h: 0.38, wrap: true })
    y += 0.42
  }

  // Activités
  exp.activites?.forEach(act => {
    if (y > H - 1.2) return
    slide.addText(act.theme, { x: 0.3, y, w: W - 0.5, h: 0.28, fontSize: 10.5, color: BLACK, fontFace: 'Calibri', bold: true })
    y += 0.3
    if (act.points?.length) {
      const pts = act.points.map((pt, i) => {
        const rich = parseRichText(pt, { fontSize: 9.5, color: BLACK, fontFace: 'Calibri' })
        // Add bullet + breakLine to first run of each point
        rich[0].options = { ...rich[0].options, bullet: true, breakLine: i < act.points.length - 1 || rich.length > 1 }
        return rich
      }).flat()
      const h = Math.min(act.points.length * 0.3, 1.4)
      slide.addText(pts, { x: 0.5, y, w: W - 0.7, h })
      y += h + 0.05
    }
  })

  // Enjeux
  if (exp.enjeux?.length && y < H - 1.0) {
    slide.addText('Enjeux :', { x: 0.3, y, w: W - 0.5, h: 0.28, fontSize: 10.5, color: BLACK, fontFace: 'Calibri', bold: true })
    y += 0.3
    const items = exp.enjeux.map((e, i) => {
      const rich = parseRichText(e, { fontSize: 9.5, color: BLACK, fontFace: 'Calibri' })
      rich[0].options = { ...rich[0].options, bullet: true, breakLine: i < exp.enjeux.length - 1 || rich.length > 1 }
      return rich
    }).flat()
    const h = Math.min(exp.enjeux.length * 0.3, 1.0)
    slide.addText(items, { x: 0.5, y, w: W - 0.7, h })
    y += h + 0.08
  }

  // Résultats
  if (exp.resultats?.length && y < H - 1.0) {
    slide.addText('Résultats :', { x: 0.3, y, w: W - 0.5, h: 0.28, fontSize: 10.5, color: BLACK, fontFace: 'Calibri', bold: true })
    y += 0.3
    const items = exp.resultats.map((r, i) => {
      const rich = parseRichText(r, { fontSize: 9.5, color: BLACK, fontFace: 'Calibri' })
      rich[0].options = { ...rich[0].options, bullet: true, breakLine: i < exp.resultats.length - 1 || rich.length > 1 }
      return rich
    }).flat()
    const h = Math.min(exp.resultats.length * 0.3, 1.0)
    slide.addText(items, { x: 0.5, y, w: W - 0.7, h })
    y += h + 0.08
  }

  // Env technique
  if (exp.env_technique?.length && y < H - 0.4) {
    slide.addShape('rect', { x: 0.3, y: y + 0.05, w: W - 0.6, h: 0.01, fill: { color: 'dddddd' }, line: { color: 'dddddd' } })
    y += 0.15
    slide.addText([
      { text: 'Environnement technique : ', options: { bold: true, fontSize: 9.5, color: BLACK, fontFace: 'Calibri' } },
      { text: exp.env_technique.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Calibri' } }
    ], { x: 0.3, y, w: W - 0.5, h: 0.32 })
  }
}

function addFormationSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  let y = 1.5
  slide.addText('Formation & Certifications', { x: 0.4, y, w: W - 0.8, h: 0.5, fontSize: 22, color: BLUE, fontFace: 'Georgia', align: 'center' })
  y += 0.7

  d.formations?.forEach(f => {
    slide.addText(`${f.diplome}${f.ecole ? ' – ' + f.ecole : ''}${f.annee ? ' (' + f.annee + ')' : ''}`, {
      x: 0.4, y, w: W - 0.8, h: 0.38, fontSize: 13, color: BLUE, fontFace: 'Georgia', align: 'center'
    })
    y += 0.45
  })

  y += 0.5
  slide.addText('Langues', { x: 0.4, y, w: W - 0.8, h: 0.5, fontSize: 22, color: BLUE, fontFace: 'Georgia', align: 'center' })
  y += 0.65

  d.langues?.forEach(l => {
    slide.addText(`${l.langue} – ${l.niveau}`, { x: 0.4, y, w: W - 0.8, h: 0.35, fontSize: 13, color: BLUE, fontFace: 'Georgia', align: 'center' })
    y += 0.42
  })
}

function addFullImageSlide(pres, imgPath) {
  const slide = pres.addSlide()
  const data = 'image/jpeg;base64,' + fs.readFileSync(imgPath).toString('base64')
  slide.addImage({ data, x: 0, y: 0, w: W, h: H })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })
  const { dossier } = req.body
  if (!dossier) return res.status(400).json({ error: 'Dossier manquant' })

  try {
    const assetsDir = path.join(process.cwd(), 'template_assets')
    const pres = new PptxGenJS()
    pres.defineLayout({ name: 'A4_PORTRAIT', width: W, height: H })
    pres.layout = 'A4_PORTRAIT'

    addCoverSlide(pres, dossier, path.join(assetsDir, 'cover.jpg'))
    addResumeSlide(pres, dossier)
    dossier.experiences.forEach(exp => addExperienceSlide(pres, exp))
    addFormationSlide(pres, dossier)
    addFullImageSlide(pres, path.join(assetsDir, 'evert_page.jpg'))
    addFullImageSlide(pres, path.join(assetsDir, 'back_cover.jpg'))

    const buffer = await pres.write({ outputType: 'nodebuffer' })
    const filename = `Dossier_EverT_${dossier.nom.replace(/\s+/g, '_')}.pptx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    console.error('PPTX export error:', err)
    res.status(500).json({ error: 'Erreur génération PPTX : ' + err.message })
  }
}
