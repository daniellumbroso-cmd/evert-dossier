// POST /api/agent/push-draft
// Corps : { match_id, to_email, to_nom? }
//
// Étape 3 : pour un match validé, Claude rédige le mail de push et l'app le
// dépose en BROUILLON dans le Gmail du bizdev connecté. Rien n'est envoyé :
// le bizdev relit, joint le dossier ciblé (Générateur) et clique sur « Envoyer ».
// La synchro Gmail → Boond tracera l'envoi.
//
// Garde-fous RGPD : refus si le destinataire est dans « ne plus contacter » ;
// chaque mail rappelle qu'on peut demander à ne plus être sollicité.
import { getSession } from '../_session.js'
import { supabaseFromEnv } from '../_lib/supabase.js'
import { claudeJSON } from '../_lib/claude.js'
import { labelFamille } from '../_lib/metiers.js'
import { googleAuth, googleErrorMessage, gmailSignature, buildMime, createDraft } from '../google-lib.js'
import { getSenderInfo } from '../sender.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['objet', 'corps'],
  properties: { objet: { type: 'string' }, corps: { type: 'string' } }
}

const MENTION_RGPD = 'Si vous ne souhaitez plus recevoir nos propositions de profils, il vous suffit de me répondre « STOP ».'

const SYSTEM = `Tu rédiges un mail de « push » pour ever"T, ESN tech : on propose un consultant à un contact client pour une offre précise.
- 90 à 140 mots, vouvoiement, ton direct et chaleureux, sans jargon commercial ni emoji.
- Structure : rappel de l'offre en une phrase → le consultant en 2-3 phrases (rôle, expériences qui collent à l'offre, disponibilité) → proposition d'un échange ou d'un entretien.
- Désigne le consultant par son prénom et l'initiale de son nom uniquement.
- Mets en **gras** 2 ou 3 mots-clés qui répondent à l'offre.
- Pas de « J'espère que vous allez bien », pas de « N'hésitez pas ».
- Termine par le prénom de l'expéditeur, sans signature complète (Gmail l'ajoute).
- N'invente rien : seulement les informations fournies. Ne mentionne pas les écarts au besoin.
- objet : court et précis (poste + disponibilité), sans majuscules inutiles.`

const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // Le brouillon est créé dans le Gmail de la personne connectée : session obligatoire.
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Non authentifié' })
  const db = supabaseFromEnv()
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  const { match_id, to_nom } = req.body || {}
  const to = String(req.body?.to_email || '').trim().toLowerCase()
  if (!match_id) return res.status(400).json({ error: 'match_id requis' })
  if (!isEmail(to)) return res.status(400).json({ error: 'Adresse du destinataire invalide' })

  try {
    const [stop] = await db.select('ne_plus_contacter', `select=email&email=eq.${encodeURIComponent(to)}`)
    if (stop) return res.status(409).json({ error: `${to} a demandé à ne plus être contacté (RGPD)` })

    const [m] = await db.select('matchs', `select=*,offres(*),consultants(*)&id=eq.${encodeURIComponent(match_id)}`)
    if (!m) return res.status(404).json({ error: 'Match introuvable' })
    if (m.statut === 'ecarte') return res.status(409).json({ error: 'Ce consultant a été écarté pour cette offre' })
    const o = m.offres, c = m.consultants
    const [prenom, ...reste] = String(c.nom || '').split(' ')
    const sender = getSenderInfo(session.email)

    const mail = await claudeJSON({
      system: SYSTEM,
      user: [
        `EXPÉDITEUR : ${sender.nom} (${sender.role}), signe « ${sender.signature} »`,
        `DESTINATAIRE : ${to_nom || o.contact_nom || 'contact non nommé (formule neutre « Bonjour, »)'}${o.entreprise ? `, ${o.entreprise}` : ''}`,
        `OFFRE : ${o.titre}\n${String(o.texte || '').slice(0, 4000)}`,
        `CONSULTANT : ${prenom} ${reste.join(' ').charAt(0)}. — ${c.titre || labelFamille(c.famille)}`,
        `Séniorité : ${c.seniorite || '?'}${c.annees_experience ? ` (${c.annees_experience} ans)` : ''}`,
        `Stack : ${(c.stack || []).slice(0, 15).join(', ')}`,
        `Secteurs : ${(c.secteurs || []).join(', ') || '—'}`,
        `Disponibilité : ${c.intercontrat ? 'immédiate' : c.fin_mission ? `à partir du ${c.fin_mission}` : 'à confirmer'}`,
        `Résumé : ${c.resume || ''}`,
        `Pourquoi il colle (analyse interne) : ${m.justification || ''}`
      ].join('\n'),
      schema: SCHEMA,
      effort: 'low'
    })

    const corps = `${mail.corps.trim()}\n\n${MENTION_RGPD}`
    const auth = googleAuth(session)
    let draftId
    try {
      const signatureHtml = await gmailSignature(auth, session.email)
      draftId = await createDraft(auth, buildMime({ to, subject: mail.objet, text: corps, signatureHtml }))
    } catch (err) {
      return res.status(502).json({ error: googleErrorMessage(err, 'Gmail') })
    }

    const now = new Date().toISOString()
    await db.update('matchs', `id=eq.${m.id}`, { statut: 'pousse', draft_id: draftId, pousse_a: to, pousse_le: now, statut_par: session.email, statut_le: now })
    await db.update('offres', `id=eq.${o.id}`, { statut: 'poussee', ...(o.contact_email ? {} : { contact_email: to, contact_nom: to_nom || null }) })

    return res.status(200).json({ ok: true, draft_id: draftId, objet: mail.objet, corps, gmail_url: 'https://mail.google.com/mail/u/0/#drafts' })
  } catch (e) {
    console.error('push-draft', e)
    return res.status(500).json({ error: e.message })
  }
}
