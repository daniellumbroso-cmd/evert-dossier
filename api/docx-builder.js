const {
  Document, Paragraph, TextRun, ImageRun,
  AlignmentType, LevelFormat, PageBreak,
  FrameAnchorType, FrameWrap, createFrameProperties
} = require('docx')
const fs = require('fs')
const path = require('path')

const BLUE = '1400FF'
const BLACK = '000000'
const WHITE = 'FFFFFF'

const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN = 1134

const IMG_W = 794
const IMG_H = 1122

const pageProps = {
  size: { width: PAGE_W, height: PAGE_H },
  margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
}

const noBorderProps = {
  size: { width: PAGE_W, height: PAGE_H },
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
}

const FONT_TITLE = 'Playfair Display'
const FONT_BODY  = 'Montserrat'

function parseInline(text, baseOpts = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.filter(p => p.length > 0).map(part => {
    const bold = part.startsWith('**') && part.endsWith('**')
    const content = bold ? part.slice(2, -2) : part
    return new TextRun({
      text: content,
      bold: bold || baseOpts.bold || false,
      size: baseOpts.size || 20,
      color: baseOpts.color || BLACK,
      italics: baseOpts.italic || false,
      font: baseOpts.font || FONT_BODY,
    })
  })
}

function t(text, opts = {}) {
  return new TextRun({
    text,
    bold: opts.bold || false,
    size: opts.size || 20,
    color: opts.color || BLACK,
    italics: opts.italic || false,
    font: opts.font || FONT_BODY,
    allCaps: opts.allCaps || false
  })
}

function p(children, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    numbering: opts.bullet ? { reference: 'bullet1', level: 0 } : undefined,
    keepLines: opts.keepLines || false,
    keepNext: opts.keepNext || false,
    pageBreakBefore: opts.pageBreakBefore || false,
    children: Array.isArray(children) ? children : [children]
  })
}

function empty(space = 160) {
  return new Paragraph({ spacing: { after: space }, children: [new TextRun('')] })
}

function pageBreak() {
  return new Paragraph({ children: [new TextRun({ break: 1 })] })
}

function sectionTitle(text) {
  return p(
    [t(text, { size: 64, color: BLUE, font: FONT_TITLE })],
    { center: true, before: 400, after: 320 }
  )
}

function subTitle(text) {
  return p(
    [t(text, { size: 28, bold: true, color: BLUE, font: FONT_TITLE })],
    { center: true, before: 200, after: 160 }
  )
}

function fullPageImageSection(imgBuffer, imgType) {
  return {
    properties: { page: noBorderProps },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: imgBuffer,
            transformation: { width: IMG_W, height: IMG_H },
            type: imgType || 'jpg'
          })
        ]
      })
    ]
  }
}

function buildDocument(d, coverImgBuffer) {
  const assetsDir = path.join(__dirname, '..', 'template_assets')
  const evertPageImg = fs.readFileSync(path.join(assetsDir, 'evert_page.jpg'))
  const backCoverImg = fs.readFileSync(path.join(assetsDir, 'back_cover.jpg'))

  // ── Résumé ──
  const resumeChildren = [
    p([t('RÉSUMÉ', { size: 72, color: BLUE, font: FONT_TITLE })], { center: true, before: 400, after: 80 }),
    empty(160),
    subTitle('À propos'),
    ...d.a_propos.split('\n\n').map(para =>
      p(parseInline(para), { after: 120 })
    ),
    empty(200),
    subTitle('Principales Expériences'),
    ...d.principales_experiences.map(e =>
      p([
        t(e.entreprise + ' : ', { bold: true, size: 20, color: BLUE }),
        t(e.role + (e.stack ? ' ' + e.stack : '') + ' (' + e.dates + ')', { size: 20 })
      ], { bullet: true, after: 60 })
    ),
    empty(200),
    subTitle('Connaissances Techniques'),
    ...d.competences_techniques.map(cat =>
      p([
        t(cat.categorie + ' : ', { bold: true, size: 20, color: BLUE }),
        ...parseInline(cat.items.join(', '), { size: 20 })
      ], { bullet: true, after: 60 })
    ),
  ]

  // ── Expériences — 1 par page ──
  const expChildren = [sectionTitle('Expériences')]

  d.experiences.forEach((exp, idx) => {
    // keepL = keep all lines of exp together, page break before each exp except first
    const kl = { keepLines: true }

    expChildren.push(p([
      t('↗  ', { bold: true, size: 22, color: BLUE }),
      t(exp.entreprise + ' ', { bold: true, size: 22, color: BLUE, allCaps: true }),
      t('– ', { size: 22, color: BLUE, bold: true }),
      t(exp.role + (exp.stack ? ' ' + exp.stack : ''), { size: 22, color: BLUE, bold: true }),
    ], { before: 240, after: 60, keepLines: true, keepNext: true, pageBreakBefore: idx > 0 }))

    expChildren.push(p([t(exp.dates, { size: 20, color: BLUE })], { after: 120, ...kl, keepNext: true }))

    if (exp.projet) {
      expChildren.push(p(parseInline(exp.projet, { size: 20 }), { after: 100, ...kl, keepNext: true }))
    }

    exp.activites?.forEach(act => {
      expChildren.push(p([t(act.theme, { size: 20, bold: true, color: BLACK })], { before: 120, after: 60, ...kl, keepNext: true }))
      act.points?.forEach(pt =>
        expChildren.push(p(parseInline(pt, { size: 20 }), { bullet: true, after: 40, ...kl, keepNext: true }))
      )
    })

    if (exp.enjeux?.length) {
      expChildren.push(p([t('Enjeux :', { size: 20, bold: true, color: BLACK })], { before: 120, after: 60, ...kl, keepNext: true }))
      exp.enjeux.forEach(e =>
        expChildren.push(p(parseInline(e, { size: 20 }), { bullet: true, after: 40, ...kl, keepNext: true }))
      )
    }

    if (exp.resultats?.length) {
      expChildren.push(p([t('Résultats :', { size: 20, bold: true, color: BLACK })], { before: 120, after: 60, ...kl, keepNext: true }))
      exp.resultats.forEach(r =>
        expChildren.push(p(parseInline(r, { size: 20 }), { bullet: true, after: 40, ...kl, keepNext: true }))
      )
    }

    if (exp.env_technique?.length) {
      expChildren.push(p([
        t('Environnement technique : ', { size: 20, bold: true }),
        t(exp.env_technique.join(', '), { size: 20 })
      ], { before: 120, after: 80, ...kl }))
    }
  })

  // ── Formation & Langues ──
  const formationChildren = []
  if (d.formations?.length) {
    formationChildren.push(sectionTitle('Formation & Certifications'))
    d.formations.forEach(f => {
      formationChildren.push(p([
        t(f.diplome, { size: 22, bold: true, color: BLUE, font: FONT_TITLE }),
        t((f.ecole ? ' – ' + f.ecole : '') + (f.annee ? ' (' + f.annee + ')' : ''), { size: 22, color: BLUE })
      ], { after: 120 }))
    })
  }
  if (d.langues?.length) {
    formationChildren.push(empty(200))
    formationChildren.push(sectionTitle('Langues'))
    d.langues.forEach(l => {
      formationChildren.push(
        p([t(l.langue + ' – ' + l.niveau, { size: 22, color: BLUE })], { after: 80 })
      )
    })
  }

  return new Document({
    numbering: {
      config: [{
        reference: 'bullet1',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 } },
            run: { font: FONT_BODY, size: 20 }
          }
        }]
      }]
    },
    sections: [
      // Page 1 : cover image Sharp (visuel)
      fullPageImageSection(coverImgBuffer, 'jpg'),

      // Résumé
      { properties: { page: pageProps }, children: resumeChildren },
      // Expériences
      { properties: { page: pageProps }, children: expChildren },
      // Formation & Langues
      {
        properties: { page: pageProps },
        children: formationChildren.length ? formationChildren : [empty()]
      },
      fullPageImageSection(evertPageImg, 'jpg'),
      fullPageImageSection(backCoverImg, 'jpg'),
    ]
  })
}

module.exports = { buildDocument }
