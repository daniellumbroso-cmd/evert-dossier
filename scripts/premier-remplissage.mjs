// Premier remplissage de la base Supabase depuis Boond, lancé depuis un PC.
//
//   node scripts/premier-remplissage.mjs            (toutes les pages)
//   node scripts/premier-remplissage.mjs --page 3   (reprendre à la page 3)
//
// Les clés sont lues dans .env.local à la racine du dépôt (ignoré par Git) :
// BOOND_*, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Récupérables avec `vercel env pull .env.local` si vous avez accès au projet Vercel.
// Le script exécute le même code que la tâche de nuit (api/agent/index-consultants.js),
// directement depuis ce PC : pas besoin que la version soit en ligne.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(racine, '.env.local')
if (!fs.existsSync(envFile)) {
  console.error('Fichier .env.local introuvable à la racine du dépôt. Voir docs/AGENT.md, « Premier remplissage ».')
  process.exit(1)
}
for (const ligne of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const manquantes = ['BOOND_CLIENT_TOKEN', 'BOOND_CLIENT_KEY', 'BOOND_USER_TOKEN', 'BOOND_BASE_URL', 'ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  .filter(k => !process.env[k])
if (manquantes.length) {
  console.error(`Variables manquantes dans .env.local : ${manquantes.join(', ')}`)
  process.exit(1)
}
// Clé locale à usage unique : le handler exige un appelant authentifié.
process.env.AGENT_API_KEY = crypto.randomBytes(32).toString('base64url')

const { default: handler } = await import(pathToFileURL(path.join(racine, 'api/agent/index-consultants.js')))
const appeler = (page) => new Promise(resolve => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(o) { resolve({ code: this.statusCode, body: o }) } }
  handler({ method: 'POST', headers: { 'x-agent-key': process.env.AGENT_API_KEY }, query: { page: String(page) }, body: {} }, res)
})

const iDebut = process.argv.indexOf('--page')
let page = iDebut > 0 ? Number(process.argv[iDebut + 1]) || 1 : 1
const total = { lus: 0, mis_a_jour: 0, inchange: 0, erreurs: 0 }
const debut = Date.now()

while (page) {
  const { code, body } = await appeler(page)
  if (code !== 200) {
    console.error(`Page ${page} : erreur ${code} — ${body.error}`)
    console.error(`Relancez avec --page ${page} une fois le problème corrigé.`)
    process.exit(1)
  }
  total.lus += body.lus; total.mis_a_jour += body.mis_a_jour; total.inchange += body.inchange; total.erreurs += body.erreurs.length
  console.log(`Page ${page} : ${body.lus} lus, ${body.mis_a_jour} fiches créées ou mises à jour, ${body.inchange} inchangées, ${body.erreurs.length} erreur(s)`)
  for (const e of body.erreurs) console.log(`   ⚠ ressource ${e.boond_id} : ${e.erreur}`)
  page = body.page_suivante
}

console.log(`\nTerminé en ${Math.round((Date.now() - debut) / 1000)} s : ${total.lus} ressources lues, ${total.mis_a_jour} fiches écrites, ${total.inchange} inchangées, ${total.erreurs} erreur(s).`)
