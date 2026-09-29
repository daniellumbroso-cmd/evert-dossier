// Lecture de la liste de prospects (Excel ou CSV) et export de la campagne.
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'

// Champs attendus, et comment les reconnaître dans les en-têtes du fichier.
// L'ordre compte : « Lien du profil LinkedIn » contient « profil » et doit être
// capté par linkedin avant d'être confondu avec les profils encadrés.
export const FIELDS = [
  { key: 'linkedin', label: 'LinkedIn', test: h => /linkedin|url/.test(h) },
  { key: 'email', label: 'Email', test: h => /mail/.test(h) },
  { key: 'prenom', label: 'Prénom', test: h => /prenom|first ?name/.test(h) },
  { key: 'nom', label: 'Nom', test: h => /^nom\b|last ?name|nom de famille/.test(h) },
  { key: 'poste', label: 'Poste', test: h => /poste|fonction|titre|job|title|intitule/.test(h) },
  { key: 'technologies', label: 'Technologies', test: h => /techno|stack|skill/.test(h) },
  { key: 'profils', label: 'Profils encadrés', test: h => /profil|encadr|manag|equipe|team/.test(h) },
  { key: 'entreprise', label: 'Entreprise', test: h => /entreprise|societe|company|organisation|employeur/.test(h) }
]

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function detectColumns(headers) {
  const mapping = {}
  const taken = new Set()
  for (const f of FIELDS) {
    const idx = headers.findIndex((h, i) => !taken.has(i) && f.test(norm(h)))
    if (idx >= 0) { mapping[f.key] = idx; taken.add(idx) }
  }
  return mapping
}

// CSV : séparateur « ; » (Excel français) ou « , », guillemets gérés.
function parseCsv(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// Renvoie { headers, data } : la première ligne non vide sert d'en-tête.
export async function readProspectFile(file) {
  const raw = /\.csv$/i.test(file.name)
    ? parseCsv((await file.text()).replace(/^﻿/, ''))
    : await readSheet(file)
  const rows = raw
    .map(r => r.map(c => (c == null ? '' : String(c).trim())))
    .filter(r => r.some(Boolean))
  if (!rows.length) return { headers: [], data: [] }
  return { headers: rows[0], data: rows.slice(1) }
}

export function toProspects(data, mapping) {
  return data.map((r, i) => {
    const p = { id: String(i + 1) }
    for (const f of FIELDS) p[f.key] = mapping[f.key] != null ? (r[mapping[f.key]] || '') : ''
    return p
  }).filter(p => p.email || p.nom || p.prenom)
}

export async function exportCampaign(rows, fileName) {
  const bold = (value) => ({ value, fontWeight: 'bold' })
  const header = [
    'Prénom', 'Nom', 'Poste', 'Technologies', 'Profils encadrés', 'Email', 'LinkedIn',
    'Entreprise (Boond)', 'Verdict', 'Statut client', 'Dernier contact Boond', 'Retenu',
    'Objet du mail', 'Corps du mail', 'Fiche Boond'
  ].map(bold)
  const body = rows.map(r => [
    r.prenom, r.nom, r.poste, r.technologies, r.profils, r.email, r.linkedin,
    r.check?.company?.name || r.entreprise || '',
    r.verdictLabel || '',
    r.statusLabel || '',
    r.check?.lastAction ? `${r.check.lastAction.date.slice(0, 10)} ${r.check.lastAction.by || ''} — ${r.check.lastAction.text.slice(0, 140)}` : '',
    r.selected ? 'oui' : 'non',
    r.mail?.objet || '',
    r.mail?.corps || '',
    r.check?.contact?.url || r.check?.company?.url || ''
  ].map(v => ({ value: String(v ?? ''), wrap: true })))
  await writeXlsxFile([header, ...body], {
    columns: [14, 16, 26, 26, 22, 28, 30, 22, 18, 16, 40, 8, 34, 70, 44].map(width => ({ width }))
  }).toFile(fileName)
}
