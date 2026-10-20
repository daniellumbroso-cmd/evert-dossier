// POST /api/agent/ingest-offers  (appelé par Make)
// Corps : { message_id, from, subject, received_at, text, html, source? }
//
// Make surveille Gmail (alertes Collective.work, ou mails clients) et transmet
// chaque mail. Claude en extrait les offres (une alerte en contient souvent
// plusieurs) ; chacune est enregistrée une seule fois (source + référence).
// Make appelle ensuite /api/agent/match-offer avec { offre_id } pour chacune.
//
// Pas de scraping : on ne lit que les mails que la plateforme nous envoie.
import crypto from 'crypto'
import { supabaseFromEnv, pgList } from '../_lib/supabase.js'
import { claudeJSON } from '../_lib/claude.js'
import { requireAgentCaller } from '../_lib/agent-auth.js'
import { FAMILLES, FAMILLE_IDS, isFamille, familleDepuisTitre } from '../_lib/metiers.js'

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] })
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['offres'],
  properties: {
    offres: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'texte', 'lien', 'entreprise', 'lieu', 'famille', 'contact_email', 'contact_nom'],
        properties: {
          titre: { type: 'string' },
          texte: { type: 'string' },
          lien: nullable({ type: 'string' }),
          entreprise: nullable({ type: 'string' }),
          lieu: nullable({ type: 'string' }),
          famille: nullable({ type: 'string', enum: FAMILLE_IDS }),
          contact_email: nullable({ type: 'string' }),
          contact_nom: nullable({ type: 'string' })
        }
      }
    }
  }
}

const SYSTEM = `Tu lis un mail reçu par une ESN : une alerte d'offres (Collective.work ou autre plateforme) ou un mail client qui exprime un besoin.
Extrais chaque offre de mission qu'il contient. Ignore la publicité, les offres d'emploi en CDI sans rapport avec une mission, et le pied de mail.

Pour chaque offre :
- titre : l'intitulé du poste ;
- texte : tout ce que le mail dit de cette offre (missions, compétences, durée, TJM, lieu, démarrage), recopié fidèlement ;
- lien : l'URL de l'offre si elle figure dans le mail, sinon null ;
- famille : l'une de ${FAMILLE_IDS.join(', ')} (${FAMILLE_IDS.map(f => FAMILLES[f].label).join(', ')}), ou null si aucune ne convient ;
- contact_email / contact_nom : seulement pour un mail client qui donne explicitement l'interlocuteur, sinon null.
Si le mail ne contient aucune offre, renvoie une liste vide. N'invente rien.`

const htmlToText = (h) => String(h || '')
  .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '$2 ($1)')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAgentCaller(req, res)) return
  const db = supabaseFromEnv()
  if (!db) return res.status(500).json({ error: 'Config Supabase manquante (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' })

  const b = req.body || {}
  const contenu = (String(b.text || '').trim().length > 200 ? String(b.text) : htmlToText(b.html || b.text)).slice(0, 60000)
  if (contenu.length < 50) return res.status(400).json({ error: 'Mail vide' })
  const from = String(b.from || '')
  const source = ['collective', 'email'].includes(b.source) ? b.source : /collective/i.test(from) ? 'collective' : 'email'
  const messageId = String(b.message_id || crypto.createHash('sha256').update(contenu).digest('hex').slice(0, 24))
  const recue = b.received_at && !isNaN(new Date(b.received_at)) ? new Date(b.received_at).toISOString() : new Date().toISOString()

  try {
    const { offres } = await claudeJSON({
      system: SYSTEM,
      user: `De : ${from}\nObjet : ${b.subject || ''}\n\n${contenu}`,
      schema: SCHEMA,
      effort: 'low'
    })

    const lignes = (offres || []).filter(o => o.texte?.trim()).map((o, i) => ({
      source,
      // Une même offre revue dans deux alertes garde la même référence grâce à son lien
      source_ref: o.lien ? `lien:${o.lien.split('?')[0]}` : `${messageId}#${i}`,
      titre: o.titre,
      texte: o.texte,
      famille: isFamille(o.famille) ? o.famille : familleDepuisTitre(o.titre),
      lien: o.lien, entreprise: o.entreprise, lieu: o.lieu,
      contact_email: o.contact_email?.toLowerCase() || null, contact_nom: o.contact_nom,
      recue_le: recue,
      cree_par: 'make'
    }))
    if (!lignes.length) return res.status(200).json({ offres: [], nouvelles: 0 })

    // On ne réécrit pas une offre déjà connue : on renvoie seulement les nouvelles à matcher.
    const refs = lignes.map(l => l.source_ref)
    const deja = new Set((await db.select('offres',
      `select=source_ref&source=eq.${source}&source_ref=in.(${pgList(refs)})`)).map(o => o.source_ref))
    const nouvelles = lignes.filter(l => !deja.has(l.source_ref))
    const saved = nouvelles.length ? await db.insert('offres', nouvelles) : []

    return res.status(200).json({
      offres: saved.map(o => ({ offre_id: o.id, titre: o.titre, famille: o.famille })),
      nouvelles: saved.length,
      deja_connues: lignes.length - saved.length
    })
  } catch (e) {
    console.error('ingest-offers', e)
    return res.status(500).json({ error: e.message })
  }
}
