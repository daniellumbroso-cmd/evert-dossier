// Extraction du texte d'un PDF côté navigateur.
//
// Pourquoi : Vercel plafonne le corps des requêtes serverless à 4,5 Mo. Un CV
// de 5 Mo envoyé tel quel est rejeté par la plateforme AVANT d'atteindre notre
// code, avec une erreur 413 en HTML — d'où le « Erreur serveur (413) » côté
// interface. Le serveur extrayait de toute façon le texte du PDF pour
// l'envoyer à Claude : autant le faire ici, le corps passe de plusieurs Mo à
// quelques Ko.
export async function extractPdfText(fileBlob) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  // Worker via CDN pour éviter les soucis de bundling
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  const arrayBuffer = await fileBlob.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map(item => item.str).join(' ') + '\n\n'
  }
  return fullText.trim()
}

// En dessous de ce seuil, l'extraction a probablement échoué : PDF scanné ou
// composé d'images. Il faut alors envoyer le fichier lui-même, que Claude sait
// lire, au prix d'une requête plus lourde.
export const MIN_USABLE_TEXT = 200

// Marge sous la limite Vercel de 4,5 Mo, pour le reste du formulaire.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
