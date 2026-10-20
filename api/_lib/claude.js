// Appels Claude qui renvoient un objet JSON conforme à un schéma (sorties structurées).
//
// AGENT_MODEL permet de changer de modèle sans toucher au code (par défaut Claude
// Opus 5.5). Pour l'extraction de masse des fiches consultants, l'effort est bas :
// c'est de la lecture, pas du raisonnement.
import Anthropic from '@anthropic-ai/sdk'

export const AGENT_MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5'

let client = null
const anthropic = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }))

export async function claudeJSON({ system, user, schema, effort = 'medium', maxTokens = 16000 }) {
  const r = await anthropic().messages.create({
    model: AGENT_MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }]
  })
  if (r.stop_reason === 'refusal') throw new Error('Claude a refusé la demande')
  if (r.stop_reason === 'max_tokens') throw new Error('Réponse de Claude tronquée (max_tokens)')
  const text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text)
}
