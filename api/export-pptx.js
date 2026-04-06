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

  // À propos : chaque paragraphe séparé par une ligne vide
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

  slide.addText('Principales Expériences', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.38

  const expItems = d.principales_experiences.map((e, i) => {
    const yearsOnly = e.dates.replace(/[A-Za-zÀ-ÿ]+ (\d{4})/g, '$1')
    return {
      // Rich text: société en bleu, reste en noir
      text: null, // unused
      richText: [
        { text: e.entreprise.toUpperCase(), options: { bold: true, color: BLUE, fontSize: 9.5, fontFace: 'Montserrat' } },
        { text: ` : ${e.role}${e.stack ? ' ' + e.stack : ''} (${yearsOnly})`, options: { color: BLACK, fontSize: 9.5, fontFace: 'Montserrat', breakLine: i < d.principales_experiences.length - 1, paraSpaceAfter: 8 } }
      ]
    }
  })
  const expRuns = expItems.flatMap((item, i) => {
    const runs = item.richText
    // Ajouter bullet sur premier run
    runs[0].options.bullet = true
    return runs
  })
  slide.addText(expRuns, { x: 0.5, y, w: W - 0.9, h: 1.1 })
  y += 1.1

  slide.addText('Connaissances Techniques', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.38

  const techItems = d.competences_techniques.map((cat, i) => [
    { text: cat.categorie + ' : ', options: { bullet: true, bold: true, fontSize: 9.5, color: BLUE, fontFace: 'Montserrat' } },
    { text: cat.items.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: i < d.competences_techniques.length - 1 } }
  ]).flat()
  slide.addText(techItems, { x: 0.5, y, w: W - 0.9, h: 1.5 })
}

function addExperienceSlide(pres, exp) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  // Ligne bleue décorative en haut
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.05, fill: { color: BLUE }, line: { color: BLUE } })

  // ── Titre + dates : zone séparée car style très différent ──
  slide.addText('↗  ' + exp.entreprise + ' – ' + exp.role + (exp.stack ? ' ' + exp.stack : ''), {
    x: 0.3, y: 0.12, w: W - 0.5, h: 0.5,
    fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, wrap: true
  })
  slide.addText(exp.dates, {
    x: 0.3, y: 0.65, w: W - 0.5, h: 0.25,
    fontSize: 10, color: BLUE, fontFace: 'Montserrat', italic: true
  })

  // ── Tout le contenu en UNE SEULE zone de texte fluide ──
  // Comme ça l'utilisateur peut tout modifier/déplacer d'un bloc
  const runs = []

  const br = () => runs.push({ text: ' ', options: { breakLine: true, fontSize: 4, fontFace: 'Montserrat', color: BLACK, paraSpaceAfter: 6 } })
  const line = (text, opts = {}) => {
    runs.push({ text, options: { fontSize: 9.5, fontFace: 'Montserrat', color: BLACK, breakLine: true, ...opts } })
  }
  const sectionTitle = (text) => {
    runs.push({ text, options: { fontSize: 10.5, fontFace: 'Montserrat', color: BLACK, bold: true, breakLine: true, paraSpaceBefore: 8, paraSpaceAfter: 4 } })
  }
  const bulletRich = (text, isLast) => {
    const parts = parseRichText(text, { fontSize: 9.5, color: BLACK, fontFace: 'Montserrat' })
    parts.forEach((p, i) => {
      const isFirstOfPart = i === 0
      const isLastOfPart = i === parts.length - 1
      runs.push({
        text: p.text,
        options: {
          ...p.options,
          bullet: isFirstOfPart ? true : false,
          breakLine: isLastOfPart ? true : false,
          paraSpaceAfter: isLastOfPart ? 4 : 0,
        }
      })
    })
  }

  // Projet
  if (exp.projet) {
    line(exp.projet, { italic: true, paraSpaceAfter: 4 })
    br()
  }

  // Activités
  exp.activites?.forEach(act => {
    sectionTitle(act.theme)
    act.points?.forEach((pt, i) => bulletRich(pt, i === act.points.length - 1))
    br()
  })

  // Enjeux
  if (exp.enjeux?.length) {
    sectionTitle('Enjeux :')
    exp.enjeux.forEach((e, i) => bulletRich(e, i === exp.enjeux.length - 1))
    br()
  }

  // Résultats
  if (exp.resultats?.length) {
    sectionTitle('Résultats :')
    exp.resultats.forEach((r, i) => bulletRich(r, i === exp.resultats.length - 1))
    br()
  }

  // Env technique
  if (exp.env_technique?.length) {
    runs.push({ text: 'Environnement technique : ', options: { bold: true, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat' } })
    runs.push({ text: exp.env_technique.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: true } })
  }

  // Une seule addText pour tout le contenu
  slide.addText(runs, {
    x: 0.3, y: 1.3,
    w: W - 0.5, h: H - 1.45,
    valign: 'top', wrap: true
  })
}

function addFormationSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  let y = 1.5
  slide.addText('Formation & Certifications', { x: 0.4, y, w: W - 0.8, h: 0.5, fontSize: 22, color: BLUE, fontFace: 'Playfair Display', align: 'center' })
  y += 0.7

  d.formations?.forEach(f => {
    slide.addText(`${f.diplome}${f.ecole ? ' – ' + f.ecole : ''}${f.annee ? ' (' + f.annee + ')' : ''}`, {
      x: 0.4, y, w: W - 0.8, h: 0.38, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', align: 'center'
    })
    y += 0.45
  })

  y += 0.5
  slide.addText('Langues', { x: 0.4, y, w: W - 0.8, h: 0.5, fontSize: 22, color: BLUE, fontFace: 'Playfair Display', align: 'center' })
  y += 0.65

  d.langues?.forEach(l => {
    slide.addText(`${l.langue} – ${l.niveau}`, { x: 0.4, y, w: W - 0.8, h: 0.35, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', align: 'center' })
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
