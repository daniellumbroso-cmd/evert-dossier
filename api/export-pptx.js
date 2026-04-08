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
    fontSize: 20, color: WHITE, fontFace: 'Montserrat',
    align: 'right', bold: false, margin: 0
  })

  const parts = d.titre.split(' / ')
  const mid = Math.ceil(parts.length / 2)
  const exp1 = parts.slice(0, mid).join(' / ')
  const exp2 = parts.slice(mid).join(' / ')

  slide.addText('+ ' + exp1, {
    x: bar_x + 0.2, y: y_profil + 0.32 + line_h,
    w: W - bar_x - 0.3, h: 0.35,
    fontSize: 14, color: WHITE, fontFace: 'Montserrat', bold: true, margin: 0
  })
  if (exp2) {
    slide.addText('+ ' + exp2, {
      x: bar_x + 0.2, y: y_profil + 0.32 + line_h * 3.2,
      w: W - bar_x - 0.3, h: 0.35,
      fontSize: 14, color: WHITE, fontFace: 'Montserrat', bold: true, margin: 0
    })
  }
}

function addResumeSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  let y = 0.35

  slide.addText('RÉSUMÉ', { x: 0.4, y, w: W - 0.8, h: 0.55, fontSize: 30, color: BLUE, fontFace: 'Playfair Display', align: 'center' })
  y += 0.65

  slide.addText('À propos', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 15, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.38

  const aproposParas = d.a_propos.split('\n\n').filter(p => p.trim())
  const aproposRuns = []
  aproposParas.forEach((para, i) => {
    const rich = parseRichText(para.trim(), { fontSize: 9.5, color: BLACK, fontFace: 'Montserrat' })
    rich.forEach((r, j) => {
      const isLast = j === rich.length - 1
      aproposRuns.push({
        text: r.text,
        options: { ...r.options, breakLine: isLast, paraSpaceAfter: isLast && i < aproposParas.length - 1 ? 10 : 2 }
      })
    })
  })
  slide.addText(aproposRuns, { x: 0.4, y, w: W - 0.8, h: 1.9, align: 'left', valign: 'top', wrap: true })
  y += 2.0

  y += 0.8
  slide.addText('Principales Expériences', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.38

  const expItems = d.principales_experiences.map((e, i) => {
    const yearsOnly = e.dates.replace(/[A-Za-zÀ-ÿ]+ (\d{4})/g, '$1')
    return {
      text: null,
      richText: [
        { text: e.entreprise.toUpperCase(), options: { bold: true, color: BLUE, fontSize: 9.5, fontFace: 'Montserrat' } },
        { text: ` : ${e.role}${e.stack ? ' ' + e.stack : ''} (${yearsOnly})`, options: { color: BLACK, fontSize: 9.5, fontFace: 'Montserrat', breakLine: i < d.principales_experiences.length - 1, paraSpaceAfter: 8 } }
      ]
    }
  })
  const expRuns = expItems.flatMap((item, i) => {
    const runs = item.richText
    runs[0].options.bullet = true
    return runs
  })
  slide.addText(expRuns, { x: 0.5, y, w: W - 0.9, h: 1.1 })
  y += 1.1

  y += 0.4
  slide.addText('Connaissances Techniques', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.55

  const techItems = d.competences_techniques.map((cat, i) => [
    { text: cat.categorie + ' : ', options: { bullet: true, bold: true, fontSize: 9.5, color: BLUE, fontFace: 'Montserrat' } },
    { text: cat.items.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: i < d.competences_techniques.length - 1, paraSpaceAfter: 10 } }
  ]).flat()
  slide.addText(techItems, { x: 0.5, y, w: W - 0.9, h: 1.5 })
}

function countExpPoints(exp) {
  let count = 0
  if (exp.sub_roles) {
    exp.sub_roles.forEach(sub => sub.activites?.forEach(act => { count += act.points?.length || 0 }))
  } else {
    exp.activites?.forEach(act => { count += act.points?.length || 0 })
  }
  count += (exp.enjeux?.length || 0) + (exp.resultats?.length || 0)
  return count
}

function addExperienceSlide(pres, exp) {
  // Seuil de split : si trop de points, on divise en 2 slides
  const pointCount = countExpPoints(exp)
  const needsSplit = pointCount > 18

  if (needsSplit && exp.activites && exp.activites.length > 2) {
    // Split : première moitié sur slide 1, deuxième moitié sur slide 2
    const mid = Math.ceil(exp.activites.length / 2)
    const exp1 = { ...exp, activites: exp.activites.slice(0, mid), enjeux: [], resultats: [], env_technique: [] }
    const exp2 = { ...exp, activites: exp.activites.slice(mid), projet: null }
    _renderExperienceSlide(pres, exp1, true)
    _renderExperienceSlide(pres, exp2, false)
  } else {
    _renderExperienceSlide(pres, exp, false)
  }
}

function _renderExperienceSlide(pres, exp, isContinued) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  const pointCount = countExpPoints(exp)
  const isCompact = pointCount > 10
  const isDense = pointCount > 16
  const fSize = isDense ? 8 : isCompact ? 8.5 : 9.5
  const spaceAfter = isDense ? 1 : isCompact ? 2 : 4
  const spaceBr = isDense ? 2 : isCompact ? 3 : 6
  const sectionFSize = isDense ? 9 : isCompact ? 9.5 : 10.5

  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.05, fill: { color: BLUE }, line: { color: BLUE } })

  const iconPath = path.join(process.cwd(), 'template_assets', 'favicon_icon.png')
  if (fs.existsSync(iconPath)) {
    slide.addImage({ path: iconPath, x: 0.5, y: 0.6, w: 0.25, h: 0.25 })
  }

  const titleSuffix = isContinued ? ' (suite)' : ''
  slide.addText(exp.entreprise + ' | ' + exp.role + (exp.stack ? ' ' + exp.stack : '') + titleSuffix, {
    x: 0.85, y: 0.52, w: W - 1.0, h: 0.5,
    fontSize: 13, color: BLUE, fontFace: 'Montserrat', bold: true, wrap: true
  })
  slide.addText(exp.dates, {
    x: 0.3, y: 1.05, w: W - 0.5, h: 0.25,
    fontSize: 10, color: BLUE, fontFace: 'Montserrat', italic: true
  })

  const runs = []

  const br = () => runs.push({ text: ' ', options: { breakLine: true, fontSize: 4, fontFace: 'Montserrat', color: BLACK, paraSpaceAfter: spaceBr } })
  const line = (text, opts = {}) => {
    runs.push({ text, options: { fontSize: fSize, fontFace: 'Montserrat', color: BLACK, breakLine: true, ...opts } })
  }
  const bulletLine = (text, opts = {}) => {
    const parts = parseRichText(text, { fontSize: fSize, color: BLACK, fontFace: 'Montserrat', ...opts })
    parts.forEach((p, i) => {
      runs.push({
        text: p.text,
        options: { ...p.options, bullet: i === 0, breakLine: i === parts.length - 1, paraSpaceAfter: i === parts.length - 1 ? spaceAfter : 0 }
      })
    })
  }
  const sectionTitle = (text) => {
    runs.push({ text, options: { fontSize: sectionFSize, fontFace: 'Montserrat', color: BLACK, bold: true, breakLine: true, paraSpaceBefore: isCompact ? 4 : 8, paraSpaceAfter: spaceAfter } })
  }
  const subRoleTitle = (text) => {
    runs.push({ text, options: { fontSize: 10, fontFace: 'Montserrat', color: BLUE, bold: true, breakLine: true, paraSpaceBefore: 10, paraSpaceAfter: 4 } })
  }
  const subRoleDates = (text) => {
    runs.push({ text, options: { fontSize: 9, fontFace: 'Montserrat', color: BLACK, italic: true, breakLine: true, paraSpaceAfter: 4 } })
  }
  const bulletRich = (text) => {
    const parts = parseRichText(text, { fontSize: fSize, color: BLACK, fontFace: 'Montserrat' })
    parts.forEach((p, i) => {
      runs.push({
        text: p.text,
        options: {
          ...p.options,
          bullet: i === 0,
          breakLine: i === parts.length - 1,
          paraSpaceAfter: i === parts.length - 1 ? spaceAfter : 0,
        }
      })
    })
  }

  if (exp.projet) {
    line(exp.projet, { italic: true, paraSpaceAfter: 4 })
    br()
  }

  if (exp.sub_roles && exp.sub_roles.length > 0) {
    exp.sub_roles.forEach((sub, subIdx) => {
      subRoleTitle('↳ ' + sub.titre)
      if (sub.dates) subRoleDates(sub.dates)
      sub.activites?.forEach(act => {
        sectionTitle(act.theme)
        if (act.points && act.points.length > 0) {
          act.points.forEach((pt, i) => bulletRich(pt))
        } else if (act.texte) {
          bulletLine(act.texte)
        }
      })
      if (subIdx < exp.sub_roles.length - 1) br()
    })
    br()
  } else {
    exp.activites?.forEach(act => {
      sectionTitle(act.theme)
      if (act.points && act.points.length > 0) {
        act.points.forEach((pt, i) => bulletRich(pt))
      } else if (act.texte) {
        bulletLine(act.texte)
      }
      br()
    })
  }

  if (exp.enjeux?.length) {
    sectionTitle('Enjeux :')
    exp.enjeux.forEach((e, i) => bulletRich(e))
    br()
  }

  if (exp.resultats?.length) {
    sectionTitle('Résultats :')
    exp.resultats.forEach((r, i) => bulletRich(r))
    br()
  }

  if (exp.env_technique?.length) {
    runs.push({ text: 'Environnement technique : ', options: { bold: true, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat' } })
    runs.push({ text: exp.env_technique.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: true } })
  }

  slide.addText(runs, {
    x: 0.3, y: 1.7,
    w: W - 0.5, h: H - 1.85,
    valign: 'top', wrap: true
  })
}

function addFormationSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  const runs = []
  const br = () => runs.push({ text: ' ', options: { breakLine: true, fontSize: 5, fontFace: 'Montserrat', color: BLUE } })

  runs.push({ text: 'Formation & Certifications', options: { bold: true, fontSize: 18, color: BLUE, fontFace: 'Playfair Display', breakLine: true, paraSpaceAfter: 14 } })
  br()

  d.formations?.forEach(f => {
    runs.push({ text: f.diplome, options: { bold: true, fontSize: 11, color: BLUE, fontFace: 'Montserrat' } })
    const rest = (f.ecole ? ' – ' + f.ecole : '') + (f.annee ? ' (' + f.annee + ')' : '')
    if (rest) runs.push({ text: rest, options: { bold: false, fontSize: 11, color: BLUE, fontFace: 'Montserrat', breakLine: true, paraSpaceAfter: 14 } })
    else runs.push({ text: '', options: { breakLine: true, fontSize: 11, fontFace: 'Montserrat', paraSpaceAfter: 14 } })
  })

  br()
  br()

  runs.push({ text: 'Langues', options: { bold: true, fontSize: 18, color: BLUE, fontFace: 'Playfair Display', breakLine: true, paraSpaceAfter: 14 } })
  br()

  d.langues?.forEach((l, i) => {
    runs.push({ text: l.langue + ' – ' + l.niveau, options: { fontSize: 11, color: BLUE, fontFace: 'Montserrat', breakLine: true, paraSpaceAfter: 6 } })
  })

  slide.addText(runs, { x: 0.5, y: 0.8, w: W - 0.8, h: H - 1.2, valign: 'top', wrap: true })
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
