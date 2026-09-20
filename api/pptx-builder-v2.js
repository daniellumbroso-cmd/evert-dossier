// Builder du NOUVEAU format de dossier (charte EDG / ever"T).
// Le format historique reste dans pptx-builder.js : les deux coexistent.
//
// Principe de lisibilité dans Google Slides : tout le décor (fond, halos,
// trame, bande latérale) vit dans l'ARRIÈRE-PLAN de diapositive. Il n'est donc
// pas sélectionnable et ne gêne jamais l'édition du texte.

import PptxGenJS from 'pptxgenjs'
import fs from 'fs'
import path from 'path'
import { parseRichText } from './pptx-builder.js'

const W = 7.5
const H = 10.61
const RAIL = 0.26
const ML = 0.70                 // marge gauche du contenu (après la bande)
const MR = 0.45
const CW = W - ML - MR          // largeur utile

const BLUE = '1A1AE6'
const PURPLE = 'C84BEA'
const NAVY = '20124D'
const WHITE = 'FFFFFF'
const INK = '111111'
const GREY = '6B6B6B'
const GDARK = 'BFBFBF'
const SOFT = 'D6D6DE'
const LIGHT = 'F0F0F0'
const DARKBG = '08080A'

const MONT = 'Montserrat'
const CHAR_EM = 0.58            // largeur moyenne d'un glyphe, en em
const LINE_EM = 1.25

const asset = (f) => path.join(process.cwd(), 'template_assets', f)

// ---------------------------------------------------------------- utilitaires

// Les capitales sont sensiblement plus larges : sans ça les titres débordent
// de la hauteur réservée et chevauchent le bloc suivant.
const emOf = (s) => (s && s === s.toUpperCase() && /[A-ZÀ-Þ]/.test(s)) ? 0.68 : CHAR_EM
const textWidth = (s, sz, em) => (s || '').length * sz * (em || emOf(s)) / 72
const lineCount = (s, sz, w, em) => Math.max(1, Math.ceil(textWidth(s, sz, em) / Math.max(0.3, w)))
const textHeight = (s, sz, w, em) => lineCount(s, sz, w, em) * sz * LINE_EM / 72

function slideWith(pres, bg) {
  const slide = pres.addSlide()
  const file = asset(bg)
  if (fs.existsSync(file)) {
    slide.background = { data: 'image/jpeg;base64,' + fs.readFileSync(file).toString('base64') }
  } else {
    slide.background = { color: bg.includes('dark') ? DARKBG : LIGHT }
  }
  return slide
}

const darkSlide = (pres) => slideWith(pres, 'v2_bg_dark.jpg')
const liteSlide = (pres) => slideWith(pres, 'v2_bg_light.jpg')

function logo(slide, file, x, y, w) {
  const p = asset(file)
  if (!fs.existsSync(p)) return 0
  const ratios = { v2_logo_edg: 355 / 900, v2_logo_evert: 220 / 900, v2_logo_wold: 171 / 900 }
  const h = w * (ratios[file.replace('.png', '')] || 0.3)
  slide.addImage({ path: p, x, y, w, h })
  return h
}

// Intertitre : petites capitales espacées
function eyebrow(slide, text, x, y, color, size = 7.5) {
  slide.addText((text || '').toUpperCase(), {
    x, y, w: CW, h: 0.17, fontSize: size, fontFace: MONT, bold: true,
    color, charSpacing: 1.6, valign: 'top'
  })
  return 0.22
}

// Grand titre de section (page profil)
function sectionTitle(slide, text, x, y) {
  slide.addText((text || '').toUpperCase(), {
    x, y, w: CW, h: 0.3, fontSize: 14, fontFace: MONT, bold: true, color: BLUE, valign: 'top'
  })
  return 0.36
}

function rule(slide, x, y, w, color, opacity) {
  slide.addShape('rect', { x, y, w, h: 0.008, fill: { color, transparency: opacity ?? 82 }, line: { type: 'none' } })
}

// Étiquettes arrondies. Peu nombreuses et cantonnées à la couverture et aux
// en-têtes : ailleurs on préfère une simple ligne de texte, plus facile à éditer.
function chipRow(slide, items, opts) {
  const { x, y, maxW, dark = true, filled = false, size = 6.5, gap = 0.07 } = opts
  let cx = x, cy = y
  const h = 0.235
  items.forEach(label => {
    const t = (label || '').toUpperCase()
    const w = Math.max(0.5, textWidth(t, size) + 0.30)
    if (cx + w > x + maxW) { cx = x; cy += h + gap }
    slide.addShape('roundRect', {
      x: cx, y: cy, w, h, rectRadius: 0.11,
      fill: filled ? { color: BLUE } : { color: dark ? 'FFFFFF' : '000000', transparency: dark ? 94 : 96 },
      line: { color: dark ? 'FFFFFF' : '000000', width: 0.5, transparency: dark ? 78 : 86 }
    })
    slide.addText(t, {
      x: cx, y: cy, w, h, align: 'center', valign: 'middle', margin: 0,
      fontSize: size, fontFace: MONT, bold: filled, charSpacing: 0.7,
      color: filled ? WHITE : (dark ? WHITE : '222222')
    })
    cx += w + gap
  })
  return cy + h - y
}

// ------------------------------------------------------------------ couverture

function addCover(pres, d) {
  const slide = darkSlide(pres)

  logo(slide, 'v2_logo_edg.png', ML, 0.52, 1.08)
  logo(slide, 'v2_logo_evert.png', ML, 1.22, 1.72)

  // Bloc d'appartenance groupe, en bas
  const gH = 1.36
  const gY = H - 0.46 - gH
  slide.addShape('roundRect', {
    x: ML, y: gY, w: CW, h: gH, rectRadius: 0.14,
    fill: { color: BLUE, transparency: 90 }, line: { color: 'FFFFFF', width: 0.75, transparency: 80 }
  })
  logo(slide, 'v2_logo_evert.png', ML + 0.26, gY + 0.26, 0.98)
  slide.addText('PART OF', {
    x: ML + 1.46, y: gY + 0.31, w: 0.6, h: 0.2, fontSize: 6.5, fontFace: MONT, bold: true,
    color: GDARK, charSpacing: 1.2, valign: 'middle'
  })
  logo(slide, 'v2_logo_wold.png', ML + 2.12, gY + 0.32, 0.62)
  logo(slide, 'v2_logo_edg.png', ML + 2.94, gY + 0.29, 0.46)
  slide.addText(
    parseRichText(d.groupe_baseline || GROUPE_BASELINE, { fontSize: 8, fontFace: MONT, color: SOFT }),
    { x: ML + 0.26, y: gY + 0.74, w: CW - 0.52, h: 0.5, valign: 'top', lineSpacingMultiple: 1.25 }
  )

  // Bloc identité
  let y = 5.35
  y += eyebrow(slide, 'Dossier de compétences', ML, y, PURPLE, 8)
  const prenom = (d.prenom || (d.nom || '').split(' ')[0] || '').toUpperCase()
  slide.addText(prenom, {
    x: ML, y: y + 0.04, w: CW, h: 0.95, fontSize: 48, fontFace: MONT, bold: true,
    color: WHITE, valign: 'top', charSpacing: -0.6
  })
  y += 1.06
  rule(slide, ML, y, CW * 0.78, PURPLE, 40)
  y += 0.24

  const metier = (d.metier || d.titre || '').split(' / ')
  slide.addText((metier[0] || '').toUpperCase(), {
    x: ML, y, w: CW, h: 0.3, fontSize: 15, fontFace: MONT, bold: true, color: WHITE, valign: 'top'
  })
  y += 0.3
  if (metier[1]) {
    slide.addText(metier.slice(1).join(' / ').toUpperCase(), {
      x: ML, y, w: CW, h: 0.3, fontSize: 15, fontFace: MONT, bold: true, color: PURPLE, valign: 'top'
    })
    y += 0.3
  }
  y += 0.22

  const kw = (d.expertises_cles || []).slice(0, 4)
  if (kw.length) y += chipRow(slide, kw, { x: ML, y, maxW: CW, filled: true, size: 7 }) + 0.12
  const stack = (d.mots_cles_stack || []).slice(0, 7)
  if (stack.length) chipRow(slide, stack, { x: ML, y, maxW: CW, size: 6.5 })
}

const GROUPE_BASELINE =
  '**European Digital Group** — groupe européen de services tech, data et IA : ' +
  '**2 600 talents**, **320 M€** de revenus. ever"T en porte l\'expertise ' +
  '**Conseil Tech, Data.IA & Product**, avec 250 consultants.'

// ----------------------------------------------------------------- page profil

function addProfile(pres, d) {
  const slide = liteSlide(pres)
  let y = 0.52

  y += eyebrow(slide, 'Le profil', ML, y, BLUE)
  const accroche = (d.accroche || d.titre || '').toUpperCase()
  const accH = textHeight(accroche, 22, CW) + 0.08
  slide.addText(accroche, {
    x: ML, y, w: CW, h: accH, fontSize: 22, fontFace: MONT, bold: true, color: INK,
    valign: 'top', lineSpacingMultiple: 0.95
  })
  y += accH + 0.16

  const resume = (d.a_propos || '').split('\n\n').filter(Boolean).join(' ')
  const resH = textHeight(resume, 10, CW) + 0.1
  slide.addText(parseRichText(resume, { fontSize: 10, fontFace: MONT, color: '2B2B2B' }),
    { x: ML, y, w: CW, h: resH, valign: 'top', lineSpacingMultiple: 1.35 })
  y += resH + 0.22

  // Points forts : uniquement ceux qui valorisent réellement le profil
  const pf = (d.points_forts || []).slice(0, 3)
  if (pf.length) {
    const cardW = (CW - 0.24 * 3) / 4
    pf.forEach((p, i) => {
      const x = ML + i * (cardW + 0.24)
      slide.addShape('roundRect', { x, y, w: cardW, h: 1.05, rectRadius: 0.1,
        fill: { color: 'FFFFFF' }, line: { color: '000000', width: 0.5, transparency: 90 } })
      slide.addText(String(p.valeur || '').toUpperCase(), {
        x: x + 0.14, y: y + 0.13, w: cardW - 0.28, h: 0.45, fontSize: 24, fontFace: MONT,
        bold: true, color: INK, valign: 'top', charSpacing: -0.5 })
      slide.addText(String(p.libelle || '').toUpperCase(), {
        x: x + 0.14, y: y + 0.62, w: cardW - 0.28, h: 0.35, fontSize: 6.5, fontFace: MONT,
        bold: true, color: GREY, charSpacing: 1.1, valign: 'top' })
    })
    const x4 = ML + 3 * (cardW + 0.24)
    slide.addShape('roundRect', { x: x4, y, w: cardW, h: 1.05, rectRadius: 0.1,
      fill: { color: 'FFFFFF' }, line: { color: '000000', width: 0.5, transparency: 90 } })
    slide.addText('EXPERTISES CLÉS', { x: x4 + 0.14, y: y + 0.13, w: cardW - 0.28, h: 0.2,
      fontSize: 6.5, fontFace: MONT, bold: true, color: BLUE, charSpacing: 1.1, valign: 'top' })
    slide.addText((d.expertises_cles || []).slice(0, 4).join('\n'), {
      x: x4 + 0.14, y: y + 0.36, w: cardW - 0.28, h: 0.62, fontSize: 7.5, fontFace: MONT,
      bold: true, color: BLUE, valign: 'top', lineSpacingMultiple: 1.3 })
    y += 1.05 + 0.3
  }

  // Compétences : une ligne par famille — un seul bloc de texte, facile à éditer
  y += sectionTitle(slide, 'Compétences techniques', ML, y)
  const runs = []
  ;(d.competences_techniques || []).forEach((cat, i, arr) => {
    runs.push({ text: (cat.categorie || '').toUpperCase() + '   ',
      options: { fontSize: 8, fontFace: MONT, bold: true, color: BLUE, charSpacing: 0.5 } })
    runs.push({ text: (cat.items || []).join(', '),
      options: { fontSize: 9, fontFace: MONT, color: '222222', breakLine: true,
                 paraSpaceAfter: i < arr.length - 1 ? 9 : 0 } })
  })
  const compH = (d.competences_techniques || []).reduce((acc, c) =>
    acc + textHeight((c.categorie || '') + '   ' + (c.items || []).join(', '), 9, CW, 0.54) + 0.125, 0)
  if (runs.length) slide.addText(runs, { x: ML, y, w: CW, h: compH, valign: 'top' })
  y += compH + 0.2

  // Principales expériences
  y += sectionTitle(slide, 'Principales expériences', ML, y)
  y += listRows(slide, (d.principales_experiences || []).slice(0, 3).map(e => ({
    left: e.entreprise, mid: e.role + (e.stack ? ' ' + e.stack : ''),
    right: (e.dates || '').replace(/[A-Za-zÀ-ÿ]+\.? /g, '')
  })), y)
  y += 0.2

  // Formation & certifications
  const form = (d.formations || []).map(f => ({
    left: f.ecole || f.diplome, mid: f.ecole ? f.diplome : '', right: f.annee || ''
  }))
  if (form.length) {
    y += sectionTitle(slide, 'Formation & certifications', ML, y)
    y += listRows(slide, form.slice(0, 3), y)
    y += 0.2
  }

  // Langues
  const langues = (d.langues || []).map(l => `${l.langue} — ${l.niveau}`)
  if (langues.length && y < H - 0.85) {
    y += sectionTitle(slide, 'Langues', ML, y)
    chipRow(slide, langues, { x: ML, y, maxW: CW, dark: false, size: 6.5 })
  }
}

// Trois colonnes : intitulé fort à gauche, détail au centre, date à droite
function listRows(slide, rows, y0) {
  const colL = 1.55, colR = 0.95
  let y = y0
  rows.forEach(r => {
    const h = 0.255
    slide.addText((r.left || '').toUpperCase(), {
      x: ML, y, w: colL, h, fontSize: 8, fontFace: MONT, bold: true, color: INK, valign: 'middle' })
    slide.addText(r.mid || '', {
      x: ML + colL, y, w: CW - colL - colR, h, fontSize: 9, fontFace: MONT, color: '333333', valign: 'middle' })
    slide.addText(r.right || '', {
      x: ML + CW - colR, y, w: colR, h, fontSize: 9, fontFace: MONT, color: GREY,
      align: 'right', valign: 'middle' })
    rule(slide, ML, y + h, CW, '000000', 86)
    y += h + 0.035
  })
  return y - y0
}

// ------------------------------------------------------- pages « expériences »

// De la plus aérée à la plus serrée. On retient la première qui tient : une
// expérience courte occupe donc la page en grand plutôt que de la laisser vide.
const EXP_TIERS = [
  { f: 11, sa: 12, st: 12 },
  { f: 10, sa: 9, st: 11 },
  { f: 9, sa: 7, st: 10 },
  { f: 8.5, sa: 5, st: 9.5 },
  { f: 8, sa: 3, st: 9 },
  { f: 7.5, sa: 2, st: 8.5 }
]

// Construit le corps d'une expérience et mesure sa hauteur : sert au rendu ET
// au calcul de remplissage, les deux ne peuvent donc pas diverger.
function expBody(exp, tier, compact) {
  const blocks = []
  const w = CW
  const push = (type, text, opts = {}) => blocks.push({ type, text, ...opts })

  if (exp.projet && !compact) push('projet', exp.projet)
  const acts = exp.sub_roles
    ? exp.sub_roles.flatMap(s => (s.activites || []).map(a => ({ ...a, theme: `${s.titre} — ${a.theme}` })))
    : (exp.activites || [])
  acts.forEach(a => {
    push('section', a.theme)
    ;(a.points || []).forEach(p => push('point', p))
    if (!a.points?.length && a.texte) push('point', a.texte)
  })
  if (exp.enjeux?.length) push('box', exp.enjeux.join(' · '), { label: 'Enjeux', color: BLUE })
  if (exp.resultats?.length) push('box', exp.resultats.join(' · '), { label: 'Résultats', color: PURPLE })
  if (exp.env_technique?.length) push('env', exp.env_technique.join(' · '))

  let h = 0
  blocks.forEach(b => {
    if (b.type === 'projet') h += textHeight(b.text, tier.f, w) + 0.14
    else if (b.type === 'section') h += 0.21 + 0.07 + (blocks.indexOf(b) > 0 ? 0.13 : 0)
    else if (b.type === 'point') h += textHeight(b.text, tier.f, w - 0.22) + tier.sa / 72
    else if (b.type === 'box') h += textHeight(b.text, tier.f - 0.5, w / 2 - 0.4) + 0.42
    else if (b.type === 'env') h += textHeight(b.text, tier.f - 0.5, w) + 0.3
  })
  // les deux encadrés sont côte à côte
  const boxes = blocks.filter(b => b.type === 'box')
  if (boxes.length === 2) {
    h -= Math.min(...boxes.map(b => textHeight(b.text, tier.f - 0.5, w / 2 - 0.4) + 0.42))
  }
  return { blocks, height: h }
}

function renderExpBody(slide, blocks, tier, y0) {
  let y = y0
  const pending = []
  for (const b of blocks) {
    if (b.type === 'projet') {
      const h = textHeight(b.text, tier.f, CW) + 0.06
      slide.addText(parseRichText(b.text, { fontSize: tier.f, fontFace: MONT, color: '3A3A3A', italic: true }),
        { x: ML, y, w: CW, h, valign: 'top', lineSpacingMultiple: 1.3 })
      y += h + 0.1
    } else if (b.type === 'section') {
      if (y > y0 + 0.05) y += 0.13
      slide.addText((b.text || '').toUpperCase(), {
        x: ML, y, w: CW, h: 0.21, fontSize: tier.st, fontFace: MONT, bold: true, color: BLUE,
        charSpacing: 0.6, valign: 'top' })
      rule(slide, ML, y + 0.21, CW, BLUE, 72)
      y += 0.28
    } else if (b.type === 'point') {
      const h = textHeight(b.text, tier.f, CW - 0.22)
      slide.addText('→', { x: ML, y, w: 0.2, h, fontSize: tier.f, fontFace: MONT, color: BLUE, valign: 'top' })
      slide.addText(parseRichText(b.text, { fontSize: tier.f, fontFace: MONT, color: '222222' }),
        { x: ML + 0.24, y, w: CW - 0.24, h, valign: 'top', lineSpacingMultiple: 1.28 })
      y += h + tier.sa / 72
    } else if (b.type === 'box') {
      pending.push(b)
    } else if (b.type === 'env') {
      y += 0.08
      slide.addText('ENVIRONNEMENT TECHNIQUE', { x: ML, y, w: CW, h: 0.18, fontSize: 6.5,
        fontFace: MONT, bold: true, color: GREY, charSpacing: 1.2, valign: 'top' })
      const h = textHeight(b.text, tier.f - 0.5, CW) + 0.06
      slide.addText(b.text, { x: ML, y: y + 0.22, w: CW, h, fontSize: tier.f - 0.5,
        fontFace: MONT, color: '444444', valign: 'top', lineSpacingMultiple: 1.3 })
      y += 0.22 + h + 0.06
    }
    if (pending.length === 2 || (pending.length && b === blocks[blocks.length - 1] && b.type !== 'env')) {
      y += drawBoxes(slide, pending, tier, y); pending.length = 0
    }
  }
  if (pending.length) y += drawBoxes(slide, pending, tier, y)
  return y - y0
}

function drawBoxes(slide, boxes, tier, y) {
  const bw = boxes.length === 2 ? (CW - 0.18) / 2 : CW
  const bh = Math.max(...boxes.map(b => textHeight(b.text, tier.f - 0.5, bw - 0.4) + 0.44))
  boxes.forEach((b, i) => {
    const x = ML + i * (bw + 0.18)
    slide.addShape('rect', { x, y, w: bw, h: bh, fill: { color: b.color, transparency: 94 }, line: { type: 'none' } })
    slide.addShape('rect', { x, y, w: 0.025, h: bh, fill: { color: b.color }, line: { type: 'none' } })
    slide.addText(b.label.toUpperCase(), { x: x + 0.16, y: y + 0.09, w: bw - 0.3, h: 0.18,
      fontSize: 6.5, fontFace: MONT, bold: true, color: b.color, charSpacing: 1.2, valign: 'top' })
    slide.addText(parseRichText(b.text, { fontSize: tier.f - 0.5, fontFace: MONT, color: '222222' }),
      { x: x + 0.16, y: y + 0.3, w: bw - 0.32, h: bh - 0.38, valign: 'top', lineSpacingMultiple: 1.28 })
  })
  return bh + 0.14
}

function expHeader(slide, exp, y, compact) {
  const hBand = compact ? 0.78 : 1.42
  if (!compact) {
    slide.addShape('rect', { x: RAIL, y: 0, w: W - RAIL, h: hBand, fill: { color: DARKBG }, line: { type: 'none' } })
    slide.addText(exp.entreprise || '', { x: ML, y: 0.24, w: CW - 1.7, h: 0.42,
      fontSize: 20, fontFace: MONT, bold: true, color: WHITE, valign: 'top' })
    slide.addText((exp.dates || '').toUpperCase(), { x: ML + CW - 1.7, y: 0.3, w: 1.7, h: 0.25,
      fontSize: 7.5, fontFace: MONT, bold: true, color: GDARK, align: 'right', charSpacing: 1.1 })
    slide.addText(exp.role || '', {
      x: ML, y: 0.68, w: CW, h: 0.26, fontSize: 9.5, fontFace: MONT, color: 'E6E6EE', valign: 'top' })
    chipRow(slide, [...(exp.mots_cles || []).slice(0, 2), ...(exp.env_technique || []).slice(0, 3)],
      { x: ML, y: 1.0, maxW: CW, size: 6 })
    return hBand + 0.26
  }
  // Expérience enchaînée sur la même page : en-tête clair et compact
  slide.addShape('rect', { x: ML, y, w: 0.55, h: 0.022, fill: { color: BLUE }, line: { type: 'none' } })
  slide.addText(exp.entreprise || '', { x: ML, y: y + 0.12, w: CW - 1.7, h: 0.32,
    fontSize: 15, fontFace: MONT, bold: true, color: INK, valign: 'top' })
  slide.addText((exp.dates || '').toUpperCase(), { x: ML + CW - 1.7, y: y + 0.16, w: 1.7, h: 0.22,
    fontSize: 7, fontFace: MONT, bold: true, color: GREY, align: 'right', charSpacing: 1 })
  slide.addText(exp.role || '', {
    x: ML, y: y + 0.44, w: CW, h: 0.22, fontSize: 9, fontFace: MONT, color: '444444', valign: 'top' })
  return 0.74
}

// Une expérience par page tant qu'elle la remplit ; sinon la suivante enchaîne.
function addExperiencePages(pres, d) {
  const queue = [...(d.experiences || [])]
  while (queue.length) {
    const slide = liteSlide(pres)
    const exp = queue.shift()
    const bottom = H - 0.42

    let tier = EXP_TIERS.find(t => expBody(exp, t, false).height <= bottom - 1.68) || EXP_TIERS[EXP_TIERS.length - 1]
    let y = expHeader(slide, exp, 0, false)
    const body = expBody(exp, tier, false)
    y += renderExpBody(slide, body.blocks, tier, y)

    // Reste-t-il de quoi loger l'expérience suivante ?
    while (queue.length) {
      const next = queue[0]
      const t2 = EXP_TIERS.find(t => expBody(next, t, true).height + 0.74 <= bottom - y - 0.3)
      if (!t2) break
      queue.shift()
      y += 0.26
      y += expHeader(slide, next, y, true)
      y += renderExpBody(slide, expBody(next, t2, true).blocks, t2, y)
    }
  }
}

// ------------------------------------------------------------ page écosystème

function addEcosystem(pres, d) {
  const slide = darkSlide(pres)
  let y = 0.52

  y += eyebrow(slide, 'ever"T · WOLD · European Digital Group', ML, y, PURPLE, 8)
  slide.addText('250 TALENTS,\nUN GROUPE EUROPÉEN', {
    x: ML, y: y + 0.04, w: CW, h: 0.92, fontSize: 25, fontFace: MONT, bold: true,
    color: WHITE, valign: 'top', lineSpacingMultiple: 0.98 })
  y += 1.18

  // Bandeau de marques
  const bh = 0.95
  slide.addShape('roundRect', { x: ML, y, w: CW, h: bh, rectRadius: 0.14,
    fill: { color: BLUE, transparency: 90 }, line: { color: 'FFFFFF', width: 0.75, transparency: 84 } })
  logo(slide, 'v2_logo_evert.png', ML + 0.55, y + 0.31, 1.32)
  slide.addShape('rect', { x: ML + 2.35, y: y + 0.3, w: 0.008, h: 0.36, fill: { color: 'FFFFFF', transparency: 78 }, line: { type: 'none' } })
  logo(slide, 'v2_logo_wold.png', ML + 2.78, y + 0.38, 0.92)
  slide.addShape('rect', { x: ML + 4.15, y: y + 0.3, w: 0.008, h: 0.36, fill: { color: 'FFFFFF', transparency: 78 }, line: { type: 'none' } })
  logo(slide, 'v2_logo_edg.png', ML + 4.62, y + 0.33, 0.72)
  y += bh + 0.5

  const lead = '**250 talents** en conseil Tech, Data.IA et Product. Une communauté tech IA-native, bâtie sur l\'apprentissage continu.'
  let h = textHeight(lead, 11.5, CW) + 0.1
  slide.addText(parseRichText(lead, { fontSize: 11.5, fontFace: MONT, color: 'E2E2EA' }),
    { x: ML, y, w: CW, h, valign: 'top', lineSpacingMultiple: 1.3 })
  y += h + 0.2

  const detail = 'Des **experts Produit, Tech et Data.IA** animent les communautés métiers et accompagnent ' +
    'les consultants en mission. Chaque mois : un **hackathon IA** et un **dîner client entre pairs**. ' +
    'Le reste de l\'année, **Le Tech Show** d\'EDG, notre **podcast** et les événements **lesBigBoss**.'
  h = textHeight(detail, 9, CW) + 0.1
  slide.addText(parseRichText(detail, { fontSize: 9, fontFace: MONT, color: GDARK }),
    { x: ML, y, w: CW, h, valign: 'top', lineSpacingMultiple: 1.42 })
  y += h + 0.42

  rule(slide, ML, y, CW, 'FFFFFF', 80)
  y += 0.42

  const stats = [['2600', 'talents'], ['1800', 'clients'], ['320', 'm€ de revenus 2025']]
  stats.forEach(([v, l], i) => {
    const x = ML + i * 1.75
    slide.addText(v, { x, y, w: 1.6, h: 0.5, fontSize: 30, fontFace: MONT, bold: true,
      color: WHITE, valign: 'top', charSpacing: -0.6 })
    slide.addText(l.toUpperCase(), { x, y: y + 0.52, w: 1.7, h: 0.2, fontSize: 6.5, fontFace: MONT,
      bold: true, color: GDARK, charSpacing: 1.1, valign: 'top' })
  })
  y += 0.86

  const edg = 'À l\'échelle d\'**European Digital Group**. Le groupe porte un **Centre d\'Excellence IA** : ' +
    'il identifie les cas d\'usage à fort impact, fédère les expertises des filiales et diffuse les méthodes. ' +
    'Nos consultants en bénéficient directement.'
  h = textHeight(edg, 9, CW) + 0.1
  slide.addText(parseRichText(edg, { fontSize: 9, fontFace: MONT, color: SOFT }),
    { x: ML, y, w: CW, h, valign: 'top', lineSpacingMultiple: 1.42 })
  y += h + 0.42

  y += eyebrow(slide, 'Comment nous travaillons', ML, y, GDARK)
  const modal = 'Expert dédié ou équipe projet · sur site ou hybride · régie ou forfait · ' +
    'sélection sur votre stack · **suivi projet régulier** · partout en France.'
  h = textHeight(modal, 9, CW) + 0.1
  slide.addText(parseRichText(modal, { fontSize: 9, fontFace: MONT, color: SOFT }),
    { x: ML, y, w: CW, h, valign: 'top', lineSpacingMultiple: 1.42 })

  // Pied de page : contact
  const fy = H - 1.24
  rule(slide, ML, fy, CW, 'FFFFFF', 80)
  const c = d.contact || {}
  slide.addText(c.nom || 'Daniel LUMBROSO', { x: ML, y: fy + 0.22, w: 3.2, h: 0.24,
    fontSize: 10.5, fontFace: MONT, bold: true, color: WHITE, valign: 'top' })
  slide.addText([c.role || 'Fondateur ever"T', c.tel || '06 12 54 76 13',
                 c.email || 'daniel.lumbroso@ever-t.fr', 'ever-t.fr'].join(' · '), {
    x: ML, y: fy + 0.47, w: 4.3, h: 0.4, fontSize: 8, fontFace: MONT, color: GDARK,
    valign: 'top', lineSpacingMultiple: 1.3 })
  logo(slide, 'v2_logo_evert.png', ML + CW - 1.86, fy + 0.5, 0.84)
  logo(slide, 'v2_logo_wold.png', ML + CW - 0.92, fy + 0.56, 0.52)
  logo(slide, 'v2_logo_edg.png', ML + CW - 0.34, fy + 0.54, 0.34)
}

// ------------------------------------------------------------------ entrée

export async function buildPptxV2(dossier) {
  const pres = new PptxGenJS()
  pres.defineLayout({ name: 'A4_PORTRAIT', width: W, height: H })
  pres.layout = 'A4_PORTRAIT'

  addCover(pres, dossier)
  addProfile(pres, dossier)
  addExperiencePages(pres, dossier)
  addEcosystem(pres, dossier)

  return await pres.write({ outputType: 'nodebuffer' })
}
