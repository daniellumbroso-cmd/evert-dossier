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

// Google Slides ignore bullet:true — il faut un caractère explicite (● U+25CF).
// indent = écart puce/texte en pt (défaut PptxGenJS : 27pt, trop large ici).
const BULLET = { code: '25CF', indent: 12 }

// Une ligne à puce contenant du **gras** est découpée en plusieurs runs, et
// PptxGenJS piège des deux côtés :
//  - il écrit un <a:pPr> PAR run : si seul le premier porte la puce, le
//    <a:buNone/> des runs suivants l'écrase (puce invisible dans Slides) ;
//  - mais un run porteur de `bullet` ouvre un NOUVEAU paragraphe, donc poser
//    la puce sur tous les runs donne une puce par fragment.
// Parade : la lib teste `align` avant `bullet` pour décider d'un saut de
// paragraphe, et ne coupe que si l'alignement CHANGE. Un `align` identique sur
// tous les runs neutralise donc le découpage, et la puce peut être portée
// partout → un seul paragraphe, un pPr cohérent, une seule puce.
const BULLET_RUN = { bullet: BULLET, align: 'left' }

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

  y += 0.8 // espace x2 avant Principales Expériences
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
  const expRuns = expItems.flatMap(item =>
    item.richText.map(r => ({ ...r, options: { ...r.options, ...BULLET_RUN } }))
  )
  slide.addText(expRuns, { x: 0.5, y, w: W - 0.9, h: 1.1 })
  y += 1.1

  y += 0.4 // espace x2 avant Connaissances Techniques
  slide.addText('Connaissances Techniques', { x: 0.4, y, w: W - 0.8, h: 0.32, fontSize: 13, color: BLUE, fontFace: 'Playfair Display', bold: true, align: 'center' })
  y += 0.55

  const techItems = d.competences_techniques.map((cat, i) => [
    { text: cat.categorie + ' : ', options: { ...BULLET_RUN, bold: true, fontSize: 9.5, color: BLUE, fontFace: 'Montserrat' } },
    { text: cat.items.join(', '), options: { ...BULLET_RUN, bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: i < d.competences_techniques.length - 1, paraSpaceAfter: 10 } }
  ]).flat()
  slide.addText(techItems, { x: 0.5, y, w: W - 0.9, h: 1.5 })
}

// --- Mise en page des slides d'expérience -----------------------------------
// Objectif : UNE expérience = UNE page, sauf si le contenu déborde vraiment.
// On estime donc la hauteur rendue et on choisit la densité la moins serrée
// qui tient dans la page ; on ne coupe que si même la plus dense déborde.

const EXP_BODY_W = W - 0.5        // largeur de la zone de texte
const EXP_BODY_H = H - 1.85       // hauteur disponible sous le titre
const TEXT_INSET = 0.2            // marges internes PptxGenJS (0.1" de chaque côté)
const CHAR_W_EM = 0.58            // largeur moyenne d'un glyphe Montserrat, en em
const LINE_H_EM = 1.22            // interligne
const FIT_MARGIN = 0.96           // garde au cas où l'estimation soit optimiste

// Densités, de la plus lisible à la plus serrée.
const EXP_TIERS = [
  { fSize: 9.5, spaceAfter: 8, spaceBr: 10, sectionFSize: 10.5, sectionSpaceBefore: 8 },
  { fSize: 8.5, spaceAfter: 4, spaceBr: 5, sectionFSize: 9.5, sectionSpaceBefore: 4 },
  { fSize: 8, spaceAfter: 2, spaceBr: 3, sectionFSize: 9, sectionSpaceBefore: 4 },
  { fSize: 7.5, spaceAfter: 1, spaceBr: 2, sectionFSize: 8.5, sectionSpaceBefore: 3 }
]

// Construit les runs du corps de slide pour une densité donnée.
// Sert au rendu ET à la mesure : les deux ne peuvent donc pas diverger.
function buildExpRuns(exp, tier) {
  const { fSize, spaceAfter, spaceBr, sectionFSize, sectionSpaceBefore } = tier
  const runs = []
  const br = () => runs.push({ text: ' ', options: { breakLine: true, fontSize: 4, fontFace: 'Montserrat', color: BLACK, paraSpaceAfter: spaceBr } })
  const line = (text, opts = {}) => {
    const base = { fontSize: fSize, fontFace: 'Montserrat', color: BLACK, ...opts }
    const parts = parseRichText(text, base)
    if (parts.length === 0) {
      runs.push({ text, options: { ...base, breakLine: true } })
      return
    }
    parts.forEach((p, i) => {
      runs.push({ text: p.text, options: { ...p.options, breakLine: i === parts.length - 1 } })
    })
  }
  const bulletLine = (text, opts = {}) => {
    const parts = parseRichText(text, { fontSize: fSize, color: BLACK, fontFace: 'Montserrat', ...opts })
    parts.forEach((p, i) => {
      runs.push({
        text: p.text,
        options: { ...p.options, ...BULLET_RUN, breakLine: i === parts.length - 1, paraSpaceAfter: i === parts.length - 1 ? spaceAfter : 0 }
      })
    })
  }
  const sectionTitle = (text) => {
    runs.push({ text, options: { fontSize: sectionFSize, fontFace: 'Montserrat', color: BLACK, bold: true, breakLine: true, paraSpaceBefore: sectionSpaceBefore, paraSpaceAfter: spaceAfter } })
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
          ...BULLET_RUN,
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
          act.points.forEach(pt => bulletRich(pt))
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
        act.points.forEach(pt => bulletRich(pt))
      } else if (act.texte) {
        bulletLine(act.texte)
      }
      br()
    })
  }

  if (exp.enjeux?.length) {
    sectionTitle('Enjeux :')
    exp.enjeux.forEach(e => bulletRich(e))
    br()
  }

  if (exp.resultats?.length) {
    sectionTitle('Résultats :')
    exp.resultats.forEach(r => bulletRich(r))
    br()
  }

  if (exp.env_technique?.length) {
    runs.push({ text: 'Environnement technique : ', options: { bold: true, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat' } })
    runs.push({ text: exp.env_technique.join(', '), options: { bold: false, fontSize: 9.5, color: BLACK, fontFace: 'Montserrat', breakLine: true } })
  }

  return runs
}

// Hauteur rendue estimée, en pouces. Les runs sont regroupés en paragraphes
// (un paragraphe se termine sur un run `breakLine`), puis on estime le nombre
// de lignes de chaque paragraphe d'après sa longueur et sa police.
function estimateRunsHeight(runs) {
  let total = 0
  let para = []

  const flush = () => {
    if (para.length === 0) return
    const text = para.map(r => r.text || '').join('')
    const fontSize = Math.max(...para.map(r => r.options?.fontSize || 8))
    const hasBullet = para.some(r => typeof r.options?.bullet === 'object')
    const usable = EXP_BODY_W - TEXT_INSET - (hasBullet ? BULLET.indent / 72 : 0)
    const charsPerLine = Math.max(8, Math.floor(usable / (fontSize * CHAR_W_EM / 72)))
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
    const spaceBefore = Math.max(...para.map(r => r.options?.paraSpaceBefore || 0))
    const spaceAfter = Math.max(...para.map(r => r.options?.paraSpaceAfter || 0))
    total += (lines * fontSize * LINE_H_EM + spaceBefore + spaceAfter) / 72
    para = []
  }

  runs.forEach(r => {
    para.push(r)
    if (r.options?.breakLine) flush()
  })
  flush()
  return total
}

// Densité la moins serrée qui tient sur une page, ou null si aucune ne tient.
function fitExpTier(exp) {
  return EXP_TIERS.find(tier => estimateRunsHeight(buildExpRuns(exp, tier)) <= EXP_BODY_H * FIT_MARGIN) || null
}

function addExperienceSlide(pres, exp) {
  // On ne coupe qu'en dernier recours : une expérience tient sur une page tant
  // qu'une des densités permet de la faire entrer.
  const needsSplit = fitExpTier(exp) === null

  if (needsSplit && exp.sub_roles && exp.sub_roles.length > 1) {
    // Split sur les sub_roles : 1er sub_role(s) sur slide 1, reste sur slide 2
    const mid = Math.ceil(exp.sub_roles.length / 2)
    const exp1 = { ...exp, sub_roles: exp.sub_roles.slice(0, mid), enjeux: [], resultats: [], env_technique: [] }
    const exp2 = { ...exp, sub_roles: exp.sub_roles.slice(mid), projet: null }
    _renderExpSlide(pres, exp1, true)
    _renderExpSlide(pres, exp2, false)
  } else if (needsSplit && exp.activites && exp.activites.length >= 2) {
    // Split sur les activites : couper en 2 groupes de thèmes
    const mid = Math.ceil(exp.activites.length / 2)
    const exp1 = { ...exp, activites: exp.activites.slice(0, mid), enjeux: [], resultats: [], env_technique: [] }
    const exp2 = { ...exp, activites: exp.activites.slice(mid), projet: null }
    _renderExpSlide(pres, exp1, true)
    _renderExpSlide(pres, exp2, false)
  } else if (needsSplit && exp.sub_roles && exp.sub_roles.length === 1) {
    // 1 seul sub_role très long : split ses activites
    const sub = exp.sub_roles[0]
    const mid = Math.ceil((sub.activites?.length || 0) / 2)
    const sub1 = { ...sub, activites: sub.activites?.slice(0, mid) }
    const sub2 = { ...sub, activites: sub.activites?.slice(mid) }
    const exp1 = { ...exp, sub_roles: [sub1], enjeux: [], resultats: [], env_technique: [] }
    const exp2 = { ...exp, sub_roles: [sub2], projet: null }
    _renderExpSlide(pres, exp1, true)
    _renderExpSlide(pres, exp2, false)
  } else {
    _renderExpSlide(pres, exp, false)
  }
}

function _renderExpSlide(pres, exp, isContinued) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

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

  // Après un split, chaque moitié est remesurée et retrouve une densité lisible.
  const tier = fitExpTier(exp) || EXP_TIERS[EXP_TIERS.length - 1]

  slide.addText(buildExpRuns(exp, tier), {
    x: 0.3, y: 1.7,
    w: EXP_BODY_W, h: EXP_BODY_H,
    valign: 'top', wrap: true,
    // Filet de sécurité : l'estimation de hauteur reste une estimation. Si elle
    // se trompe, le lecteur réduit le texte au lieu de le laisser déborder.
    fit: 'shrink'
  })
}

function addFormationSlide(pres, d) {
  const slide = pres.addSlide()
  slide.background = { color: LIGHT }

  // Tout en un seul bloc texte, aligné à gauche
  const runs = []
  const br = () => runs.push({ text: ' ', options: { breakLine: true, fontSize: 5, fontFace: 'Montserrat', color: BLUE } })

  // Titre Formation
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

  // Titre Langues
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


export async function buildPptx(dossier) {
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

  return await pres.write({ outputType: 'nodebuffer' })
}
