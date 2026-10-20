// Accès à la base Supabase par son API REST (PostgREST), côté serveur uniquement.
//
// La clé « service_role » contourne les règles d'accès : elle ne doit vivre que
// dans les variables Vercel, jamais dans le front. Les tables ont la sécurité par
// ligne activée sans aucune règle, donc la clé publique « anon » ne lit rien.

export function supabaseFromEnv() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  async function call(method, path, { body, prefer } = {}) {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await r.text()
    const json = text ? JSON.parse(text) : null
    if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} : ${json?.message || r.status}`)
    return json
  }

  return {
    select: (table, query = '') => call('GET', `${table}${query ? `?${query}` : ''}`),
    // Insère ou met à jour selon la colonne unique `onConflict`.
    upsert: (table, rows, onConflict) => call('POST', `${table}?on_conflict=${onConflict}`, {
      body: rows, prefer: 'resolution=merge-duplicates,return=representation'
    }),
    insert: (table, rows) => call('POST', table, { body: rows, prefer: 'return=representation' }),
    update: (table, query, patch) => call('PATCH', `${table}?${query}`, { body: patch, prefer: 'return=representation' }),
    remove: (table, query) => call('DELETE', `${table}?${query}`)
  }
}

// Liste PostgREST pour les filtres `in.(…)` et `ov.{…}` : valeurs entre guillemets.
export const pgList = (values) => values.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',')
