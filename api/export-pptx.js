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
const BLACK = '0a0a0a'
const LIGHT = 'fafaf8'

// Slide A4 portrait : 7.5" x 10.61"
const W = 7.5
const H = 10.61

function addCoverSlide(pres, d, coverPath) {
  const slide = pres.addSlide()
  // Image cover en fond
  const coverData = 'image/jpeg;base64,' + fs.readFileSync(coverPath).toString('base64')
  slide.addImage({ data: coverData, x: 0, y: 0, w: W, h: H })

  // Positions calées sur la cover (ratio 1240x1754 -> 7.5x10.61)
  // Barre blanche à ~50% largeur = 3.75"
  // "Profil" à ~16% hauteur = ~1.7"
  const bar_x = 3.75
  const y_profil = 1.7
  const line_h = 0.22

  // Prénom à gauche de la barre
  slide.addText(d.nom, {
    x: 0.3, y: y_profil + line_h * 2.5,
    w: bar_x - 0.5, h: 0.45,
    fontSize: 20, color: WHITE, fontFace: 'Calibri',
    align: 'right', bold: false, margin: 0
  })

  // Expertises à droite de la barre
  const parts = d.titre.split(' / ')
  const mid = Math.ceil(parts.length / 2)
  const exp1 = parts.slice(0, mid).join(' / ')
  const exp2 = parts.slice(mid).join(' / ')

  slide.addText('+ ' + exp1, {
    x: bar_x + 0.2, y: y_profil + 0.35 + line_h,
    w: W - bar_x - 0.3, h: 0.35,
    fontSize: 14, color: WHITE, fontFace: 'Calibri', bold: true, margin: 0
  })
  if (exp2) {
    slide.addText('+ ' + exp2, {
      x: bar_x + 0.2, y: y_profil + 0.35 + line_h * 3.5,
      w: W - bar_x - 0.3, h: 0.35,
      fontSize: 14, color: WHITE, fontFace: 'Calibri', bold: true, margin: 0
    })
  }
}

function addResumeSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  // Titre RÉSUMÉ
  slide.addText('RÉSUMÉ', { x: 0.4, y: 0.3, w: W - 0.8, h: 0.6, fontSize: 32, color: BLUE, fontFace: 'Georgia', bold: false, align: 'center' })

  // À propos
  slide.addText('À propos', { x: 0.4, y: 1.1, w: W - 0.8, h: 0.35, fontSize: 16, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  slide.addText(d.a_propos.replace(/\n\n/g, ' '), { x: 0.4, y: 1.5, w: W - 0.8, h: 2.2, fontSize: 10, color: BLACK, fontFace: 'Calibri', align: 'left', valign: 'top', wrap: true })

  // Principales expériences
  slide.addText('Principales Expériences', { x: 0.4, y: 3.8, w: W - 0.8, h: 0.35, fontSize: 14, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  const expItems = d.principales_experiences.map(e => ({
    text: `${e.entreprise} : ${e.role}${e.stack ? ' ' + e.stack : ''} (${e.dates})`,
    options: { bullet: true, breakLine: true, fontSize: 10, color: BLACK, fontFace: 'Calibri' }
  }))
  slide.addText(expItems, { x: 0.5, y: 4.2, w: W - 0.9, h: 1.8 })

  // Compétences techniques
  slide.addText('Connaissances Techniques', { x: 0.4, y: 6.1, w: W - 0.8, h: 0.35, fontSize: 14, color: BLUE, fontFace: 'Georgia', bold: true, align: 'center' })
  const techItems = d.competences_techniques.map(c => ({
    text: `${c.categorie} : ${c.items.join(', ')}`,
    options: { bullet: true, breakLine: true, fontSize: 10, color: BLACK, fontFace: 'Calibri' }
  }))
  slide.addText(techItems, { x: 0.5, y: 6.5, w: W - 0.9, h: 1.8 })
}

function addExperienceSlide(pres, exp) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  // Bande bleue en haut
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 1.1, fill: { color: LIGHT }, line: { color: LIGHT } })
  slide.addText('↗  ' + exp.entreprise + ' – ' + exp.role + (exp.stack ? ' ' + exp.stack : ''), {
    x: 0.3, y: 0.1, w: W - 0.5, h: 0.5,
    fontSize: 14, color: BLUE, fontFace: 'Georgia', bold: true
  })
  slide.addText(exp.dates, { x: 0.3, y: 0.6, w: W - 0.5, h: 0.35, fontSize: 11, color: BLUE, fontFace: 'Calibri' })

  let yPos = 1.1

  if (exp.projet) {
    slide.addText(exp.projet, { x: 0.3, y: yPos, w: W - 0.5, h: 0.4, fontSize: 10, color: BLACK, fontFace: 'Calibri', italic: true })
    yPos += 0.45
  }

  // Activités
  exp.activites?.forEach(act => {
    if (yPos > H - 0.5) return
    slide.addText(act.theme, { x: 0.3, y: yPos, w: W - 0.5, h: 0.3, fontSize: 11, color: BLACK, fontFace: 'Calibri', bold: true })
    yPos += 0.32
    const pts = (act.points || []).map(pt => ({ text: pt, options: { bullet: true, breakLine: true, fontSize: 10, color: BLACK, fontFace: 'Calibri' } }))
    if (pts.length) {
      const h = Math.min(pts.length * 0.28, 1.2)
      slide.addText(pts, { x: 0.5, y: yPos, w: W - 0.7, h })
      yPos += h + 0.05
    }
  })

  // Enjeux
  if (exp.enjeux?.length && yPos < H - 1) {
    slide.addText('Enjeux :', { x: 0.3, y: yPos, w: W - 0.5, h: 0.28, fontSize: 11, color: BLACK, fontFace: 'Calibri', bold: true })
    yPos += 0.3
    const items = exp.enjeux.map(e => ({ text: e, options: { bullet: true, breakLine: true, fontSize: 10, color: BLACK, fontFace: 'Calibri' } }))
    const h = Math.min(items.length * 0.28, 1.0)
    slide.addText(items, { x: 0.5, y: yPos, w: W - 0.7, h })
    yPos += h + 0.05
  }

  // Résultats
  if (exp.resultats?.length && yPos < H - 1) {
    slide.addText('Résultats :', { x: 0.3, y: yPos, w: W - 0.5, h: 0.28, fontSize: 11, color: BLACK, fontFace: 'Calibri', bold: true })
    yPos += 0.3
    const items = exp.resultats.map(r => ({ text: r, options: { bullet: true, breakLine: true, fontSize: 10, color: BLACK, fontFace: 'Calibri' } }))
    const h = Math.min(items.length * 0.28, 1.0)
    slide.addText(items, { x: 0.5, y: yPos, w: W - 0.7, h })
    yPos += h + 0.05
  }

  // Env technique
  if (exp.env_technique?.length && yPos < H - 0.4) {
    slide.addText('Environnement technique : ' + exp.env_technique.join(', '), {
      x: 0.3, y: yPos, w: W - 0.5, h: 0.35, fontSize: 10, color: BLACK, fontFace: 'Calibri', bold: true
    })
  }
}

function addFormationSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }
  slide.addText('Formation & Certifications', { x: 0.4, y: 0.4, w: W - 0.8, h: 0.5, fontSize: 24, color: BLUE, fontFace: 'Georgia', align: 'center' })
  let y = 1.2
  d.formations?.forEach(f => {
    slide.addText(`${f.diplome}${f.ecole ? ' – ' + f.ecole : ''}${f.annee ? ' ('+f.annee+')' : ''}`, {
      x: 0.4, y, w: W - 0.8, h: 0.4, fontSize: 14, color: BLUE, fontFace: 'Georgia'
    })
    y += 0.5
  })
  y += 0.3
  slide.addText('Langues', { x: 0.4, y, w: W - 0.8, h: 0.4, fontSize: 24, color: BLUE, fontFace: 'Georgia', align: 'center' })
  y += 0.6
  d.langues?.forEach(l => {
    slide.addText(`${l.langue} – ${l.niveau}`, { x: 0.4, y, w: W - 0.8, h: 0.35, fontSize: 14, color: BLUE, fontFace: 'Georgia' })
    y += 0.45
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
    pres.layout = 'LAYOUT_4x3'
    pres.defineLayout({ name: 'A4_PORTRAIT', width: W, height: H })
    pres.layout = 'A4_PORTRAIT'

    // Slides
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
