// Chiffres et contact société affichés dans les dossiers (PPTX) et les mails générés.
// Source unique : ne plus écrire ces valeurs en dur ailleurs, les importer d'ici.
//
// À valider avec Daniel : chiffres contradictoires relevés (250 talents vs +160 ingénieurs).
// Les valeurs ci-dessous sont celles qui étaient en dur dans le code, reprises telles quelles :
// le dossier PPTX v2 annonce 250 consultants ever"T, les prompts des mails push +160 ingénieurs.

// ── ever"T ──
export const NB_CONSULTANTS_TEXTE = '250'      // dossier PPTX v2 (« 250 talents », « 250 consultants »)
export const NB_INGENIEURS_MAIL_TEXTE = '+160' // prompts des mails push (« de +160 ingénieurs »)

// ── Groupe (European Digital Group) ──
export const NB_TALENTS_GROUPE_TEXTE = '2 600'
export const NB_CLIENTS_GROUPE_TEXTE = '1800'
export const CA_TEXTE = '320'                  // en M€
export const CA_ANNEE = '2025'

// ── Contact affiché en pied de la page écosystème du PPTX v2 ──
// TODO : renseigner CONTACT_TEL / CONTACT_EMAIL dans les variables d'environnement Vercel
// puis supprimer les valeurs de repli ci-dessous (coordonnées personnelles en dur dans le code).
export const CONTACT_TEL = process.env.CONTACT_TEL || '06 12 54 76 13'
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'daniel.lumbroso@ever-t.fr'
