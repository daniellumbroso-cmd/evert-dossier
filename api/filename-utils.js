// Nom de fichier unifié pour les exports (Drive, PPTX, DOCX)
// Format : "Dossier <titre court> — <Nom Prénom>.<ext>"

// Caractères interdits dans un nom de fichier (Windows/macOS) + caractères de contrôle
const FORBIDDEN = /[\\/:*?"<>|\x00-\x1f]/g

function clean(str) {
  return (str || '').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim()
}

// Titre court : champ dédié si présent, sinon repli sur les 2 premiers segments du titre
export function shortTitle(dossier) {
  const court = clean(dossier?.titre_court)
  if (court) return court
  return clean((dossier?.titre || '').split('/').slice(0, 2).join(' '))
}

export function buildDossierFilename(dossier, ext) {
  const extension = String(ext || '').replace(/^\./, '')
  const nom = clean(dossier?.nom)
  const titre = shortTitle(dossier)
  const base = titre && nom ? `Dossier ${titre} — ${nom}`
    : `Dossier ${titre || nom}`.trim()
  return extension ? `${base}.${extension}` : base
}

// En-tête Content-Disposition avec variante ASCII (compat) + variante UTF-8 (RFC 5987),
// sinon les accents et le tiret cadratin sont massacrés au téléchargement.
export function contentDisposition(filename) {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // accents combinants
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')      // tout ce qui reste de non-ASCII
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Dossier'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
