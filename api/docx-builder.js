const {
  Document, Paragraph, TextRun, ImageRun,
  AlignmentType, LevelFormat, BorderStyle,
  WidthType, ShadingType, Header
} = require('docx')
const fs = require('fs')
const path = require('path')

const BLUE = '1400FF'
const BLACK = '000000'

const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN = 1134

const pageProps = {
  size: { width: PAGE_W, height: PAGE_H },
  margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
}

const noBorderProps = {
  size: { width: PAGE_W, height: PAGE_H },
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
}

function t(text, opts = {}) {
  return new TextRun({
    text,
    bold: opts.bold || false,
    size: opts.size || 20,
    color: opts.color || BLACK,
    italics: opts.italic || false,
    font: opts.font || 'Calibri',
    allCaps: opts.allCaps || false
  })
}

function p(children, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    numbering: opts.bullet ? { reference: 'bullet1', level: 0 } : undefined,
    children: Array.isArray(children) ? children : [children]
  })
}

function empty(space = 160) {
  return new Paragraph({ spacing: { after: space }, children: [new TextRun('')] })
}

function sectionTitle(text) {
  return p(
    [t(text, { size: 64, color: BLUE, font: 'Georgia', italic: text === 'Expériences' })],
    { center: true, before: 400, after: 320 }
  )
}

function subTitle(text) {
  return p(
    [t(text, { size: 28, bold: true, color: BLUE, font: 'Georgia' })],
    { center: true, before: 200, after: 160 }
  )
}

// Full-page image section: image is in the children as a full-page inline image
// This avoids the header repeat bug
function fullPageImageSection(imgBuffer, imgType) {
  return {
    properties: {
      page: noBorderProps
    },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: imgBuffer,
            transformation: { width: 595, height: 842 },
            type: imgType || 'jpg'
          })
        ]
      })
    ]
  }
}

function buildDocument(d) {
  const assetsDir = path.join(__dirname, '..', 'template_assets')
  const coverImg = fs.readFileSync(path.join(assetsDir, 'cover.jpg'))
  const evertPageImg = fs.readFileSync(path.join(assetsDir, 'evert_page.jpg'))
  const backCoverImg = fs.readFileSync(path.join(assetsDir, 'back_cover.jpg'))

  // ── Page 2 : Identité (nom + titre sur fond blanc) ──
  const identityChildren = [
    empty(2400),
    p([t('DOSSIER DE COMPÉTENCES', { size: 18, color: BLUE })], { center: true, after: 120 }),
    empty(80),
    p([t(d.nom, { size: 44, color: BLUE, font: 'Georgia' })], { center: true, after: 80 }),
    p([t(d.titre, { size: 24, bold: true, color: BLUE })], { center: true, after: 80 }),
  ]

  // ── Résumé ──
  const resumeChildren = [
    p([t('RÉSUMÉ', { size: 72, color: BLUE, font: 'Georgia' })], { center: true, before: 400, after: 80 }),
    empty(160),
    subTitle('À propos'),
    ...d.a_propos.split('\n\n').map(para =>
      p([t(para, { size: 20 })], { after: 120 })
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
        t(cat.items.join(', '), { size: 20 })
      ], { bullet: true, after: 60 })
    ),
  ]

  // ── Expériences ──
  const expChildren = [sectionTitle('Expériences')]

  d.experiences.forEach((exp, idx) => {
    expChildren.push(p([
      t('↗  ', { bold: true, size: 22, color: BLUE }),
      t(exp.entreprise + ' ', { bold: true, size: 22, color: BLUE, allCaps: true }),
      t('– ', { size: 22, color: BLUE }),
      t(exp.role + (exp.stack ? ' ' + exp.stack : ''), { size: 22, color: BLUE, italic: true }),
    ], { before: 240, after: 60 }))

    expChildren.push(p([t(exp.dates, { size: 20, color: BLUE, italic: true })], { after: 120 }))

    if (exp.projet) {
      expChildren.push(p([t(exp.projet, { size: 20 })], { after: 100 }))
    }

    exp.activites?.forEach(act => {
      expChildren.push(p([t(act.theme, { size: 20, bold: false })], { after: 60 }))
      act.points?.forEach(pt => expChildren.push(p([t(pt, { size: 20 })], { bullet: true, after: 40 })))
    })

    if (exp.enjeux?.length) {
      expChildren.push(p([t('Enjeux :', { size: 20 })], { after: 60 }))
      exp.enjeux.forEach(e => expChildren.push(p([t(e, { size: 20 })], { bullet: true, after: 40 })))
    }

    if (exp.resultats?.length) {
      expChildren.push(p([t('Résultats :', { size: 20 })], { after: 60 }))
      exp.resultats.forEach(r => expChildren.push(p([t(r, { size: 20 })], { bullet: true, after: 40 })))
    }

    if (exp.env_technique?.length) {
      expChildren.push(p([
        t('Environnement technique : ', { size: 20, bold: true }),
        t(exp.env_technique.join(', '), { size: 20 })
      ], { before: 100, after: idx < d.experiences.length - 1 ? 200 : 80 }))
    }
  })

  // ── Formation & Langues ──
  const formationChildren = []
  if (d.formations?.length) {
    formationChildren.push(sectionTitle('Formation & Certifications'))
    d.formations.forEach(f => {
      formationChildren.push(p([
        t(f.diplome, { size: 22, bold: true, color: BLUE }),
        t((f.ecole ? ' – ' + f.ecole : '') + (f.annee ? ' (' + f.annee + ')' : ''), { size: 22, color: BLUE })
      ], { after: 120 }))
    })
  }
  if (d.langues?.length) {
    formationChildren.push(empty(200))
    formationChildren.push(sectionTitle('Langues'))
    d.langues.forEach(l => {
      formationChildren.push(p([t(l.langue + ' – ' + l.niveau, { size: 22, color: BLUE })], { after: 80 }))
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
            run: { font: 'Calibri', size: 20 }
          }
        }]
      }]
    },
    sections: [
      // Page 1 : couverture (image pleine page, pas de header)
      fullPageImageSection(coverImg, 'jpg'),

      // Page 2 : identité (nom + titre)
      { properties: { page: pageProps }, children: identityChildren },

      // Page 3 : résumé
      { properties: { page: pageProps }, children: resumeChildren },

      // Page(s) : expériences
      { properties: { page: pageProps }, children: expChildren },

      // Page : formation & langues
      {
        properties: { page: pageProps },
        children: formationChildren.length ? formationChildren : [empty()]
      },

      // Page Ever"T (image pleine page)
      fullPageImageSection(evertPageImg, 'jpg'),

      // Page de fin (image pleine page)
      fullPageImageSection(backCoverImg, 'jpg'),
    ]
  })
}

module.exports = { buildDocument }  })
}

function p(children, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    numbering: opts.bullet ? { reference: 'bullet1', level: 0 } : undefined,
    children: Array.isArray(children) ? children : [children]
  })
}

function empty(space = 160) {
  return new Paragraph({ spacing: { after: space }, children: [new TextRun('')] })
}

function sectionTitle(text) {
  return p([t(text, { size: 64, color: BLUE, font: 'Georgia', italic: text === 'Expériences' })],
    { center: true, before: 400, after: 320 })
}

function subTitle(text) {
  return p([t(text, { size: 28, bold: true, color: BLUE, font: 'Georgia' })],
    { center: true, before: 200, after: 160 })
}

function imageSection(imgBuffer, props) {
  return {
    properties: { page: props },
    headers: {
      default: new Header({
        children: [p([new ImageRun({
          data: imgBuffer,
          transformation: { width: 595, height: 842 },
          type: 'jpg'
        })], { before: 0, after: 0 })]
      })
    },
    children: [p([t('')])]
  }
}

function buildDocument(d) {
  const assetsDir = path.join(__dirname, '..', 'template_assets')
  const coverImg = fs.readFileSync(path.join(assetsDir, 'cover.jpg'))
  const evertPageImg = fs.readFileSync(path.join(assetsDir, 'evert_page.jpg'))
  const backCoverImg = fs.readFileSync(path.join(assetsDir, 'back_cover.jpg'))

  // ── Identity page (page 2) ──
  const identityChildren = [
    empty(2400),
    p([t('DOSSIER DE COMPÉTENCES', { size: 18, color: BLUE })], { center: true, after: 120 }),
    empty(80),
    p([t(d.nom, { size: 44, color: BLUE, font: 'Georgia' })], { center: true, after: 80 }),
    p([t(d.titre, { size: 24, bold: true, color: BLUE })], { center: true, after: 80 }),
  ]

  // ── Résumé ──
  const resumeChildren = [
    p([t('RÉSUMÉ', { size: 72, color: BLUE, font: 'Georgia' })], { center: true, before: 400, after: 80 }),
    empty(160),
    subTitle('À propos'),
    ...d.a_propos.split('\n\n').map(para =>
      p([t(para, { size: 20 })], { after: 120 })
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
        t(cat.items.join(', '), { size: 20 })
      ], { bullet: true, after: 60 })
    ),
  ]

  // ── Expériences ──
  const expChildren = [sectionTitle('Expériences')]

  d.experiences.forEach((exp, idx) => {
    expChildren.push(p([
      t('↗  ', { bold: true, size: 22, color: BLUE }),
      t(exp.entreprise + ' ', { bold: true, size: 22, color: BLUE, allCaps: true }),
      t('– ', { size: 22, color: BLUE }),
      t(exp.role + (exp.stack ? ' ' + exp.stack : ''), { size: 22, color: BLUE, italic: true }),
    ], { before: 240, after: 60 }))

    expChildren.push(p([t(exp.dates, { size: 20, color: BLUE, italic: true })], { after: 120 }))

    if (exp.projet) {
      expChildren.push(p([t(exp.projet, { size: 20 })], { after: 100 }))
    }

    exp.activites?.forEach(act => {
      expChildren.push(p([t(act.theme, { size: 20, bold: false })], { after: 60 }))
      act.points?.forEach(pt => expChildren.push(p([t(pt, { size: 20 })], { bullet: true, after: 40 })))
    })

    if (exp.enjeux?.length) {
      expChildren.push(p([t('Enjeux :', { size: 20 })], { after: 60 }))
      exp.enjeux.forEach(e => expChildren.push(p([t(e, { size: 20 })], { bullet: true, after: 40 })))
    }

    if (exp.resultats?.length) {
      expChildren.push(p([t('Résultats :', { size: 20 })], { after: 60 }))
      exp.resultats.forEach(r => expChildren.push(p([t(r, { size: 20 })], { bullet: true, after: 40 })))
    }

    if (exp.env_technique?.length) {
      expChildren.push(p([
        t('Environnement technique : ', { size: 20, bold: true }),
        t(exp.env_technique.join(', '), { size: 20 })
      ], { before: 100, after: idx < d.experiences.length - 1 ? 200 : 80 }))
    }
  })

  // ── Formation & Langues ──
  const formationChildren = []
  if (d.formations?.length) {
    formationChildren.push(sectionTitle('Formation & Certifications'))
    d.formations.forEach(f => {
      formationChildren.push(p([
        t(f.diplome, { size: 22, bold: true, color: BLUE }),
        t((f.ecole ? ' – ' + f.ecole : '') + (f.annee ? ' (' + f.annee + ')' : ''), { size: 22, color: BLUE })
      ], { after: 120 }))
    })
  }
  if (d.langues?.length) {
    formationChildren.push(empty(200))
    formationChildren.push(sectionTitle('Langues'))
    d.langues.forEach(l => {
      formationChildren.push(p([t(l.langue + ' – ' + l.niveau, { size: 22, color: BLUE })], { after: 80 }))
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
            run: { font: 'Calibri', size: 20 }
          }
        }]
      }]
    },
    sections: [
      imageSection(coverImg, noBorderProps),
      { properties: { page: pageProps }, children: identityChildren },
      { properties: { page: pageProps }, children: resumeChildren },
      { properties: { page: pageProps }, children: expChildren },
      { properties: { page: pageProps }, children: formationChildren.length ? formationChildren : [empty()] },
      imageSection(evertPageImg, noBorderProps),
      imageSection(backCoverImg, noBorderProps),
    ]
  })
}

module.exports = { buildDocument }
