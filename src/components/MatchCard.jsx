import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink, Check, X, Mail, Loader2 } from 'lucide-react'

// Un consultant classé pour une offre : score, métier, dispo, justification,
// écarts, et les actions Valider / Écarter / Préparer le push (brouillon Gmail).
// Partagé par /offre, /offres et le tableau de bord.

export const BLUE = '#1400FF'
export const card = { background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 14, padding: 20, marginBottom: 18 }
export const badge = (color, bg) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 12, color, background: bg, marginRight: 6 })
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const LIEN = { exacte: ['Métier exact', '#1d8b4f', 'rgba(40,180,99,0.10)'], secondaire: ['Expérience dans ce métier', '#5b3df5', 'rgba(91,61,245,0.10)'], compatible: ['Métier voisin', '#b57a00', 'rgba(255,170,0,0.12)'] }
const STATUT = { valide: ['Validé', '#1d8b4f', 'rgba(40,180,99,0.10)'], ecarte: ['Écarté', '#999', '#f0f0f5'], pousse: ['Push préparé', BLUE, 'rgba(20,0,255,0.08)'] }

const btn = (color, filled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  padding: '6px 11px', borderRadius: 8, border: `1.5px solid ${color}`,
  background: filled ? color : '#fff', color: filled ? '#fff' : color
})

export function Dispo({ r }) {
  if (r.intercontrat) return <span style={badge('#1d8b4f', 'rgba(40,180,99,0.10)')}>Intercontrat</span>
  if (r.fin_mission) return <span style={badge('#b57a00', 'rgba(255,170,0,0.12)')}>Fin de mission {fmtDate(r.fin_mission)}</span>
  return <span style={badge('#888', '#f0f0f5')}>Dispo inconnue</span>
}

function Score({ score }) {
  const color = score >= 80 ? BLUE : score >= 60 ? '#5b3df5' : '#999'
  return (
    <div style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${color}`, color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat, sans-serif', fontWeight: 700 }}>
      {score}
    </div>
  )
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error || `Erreur ${r.status}`)
  return json
}

export default function MatchCard({ r: initial, rang, contactEmail = '', contactNom = '' }) {
  const [r, setR] = useState(initial)
  const [busy, setBusy] = useState(null)
  const [pushOpen, setPushOpen] = useState(false)
  const [to, setTo] = useState(contactEmail || '')
  const [toNom, setToNom] = useState(contactNom || '')
  const [draft, setDraft] = useState(null)

  const statut = async (s) => {
    if (!r.match_id) return
    setBusy(s)
    try {
      await post('/api/agent/offres', { action: 'statut', match_id: r.match_id, statut: s })
      setR({ ...r, statut: s })
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  const push = async () => {
    setBusy('push')
    try {
      const d = await post('/api/agent/push-draft', { match_id: r.match_id, to_email: to.trim(), to_nom: toNom.trim() || undefined })
      setDraft(d)
      setR({ ...r, statut: 'pousse', pousse_a: to.trim() })
      setPushOpen(false)
      toast.success('Brouillon créé dans Gmail')
    } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  const [label, color, bg] = LIEN[r.lien_famille] || ['', '#888', '#f0f0f5']
  const st = STATUT[r.statut]
  const input = { border: '1.5px solid #e0e0f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }

  return (
    <section style={{ ...card, display: 'flex', gap: 16, opacity: r.statut === 'ecarte' ? 0.55 : 1 }}>
      <Score score={r.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{rang ? `${rang}. ` : ''}{r.nom}</span>
          <span style={{ color: '#666', fontSize: 13 }}>{r.titre}</span>
          <a href={r.boond_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Boond <ExternalLink size={11} />
          </a>
        </div>
        <div style={{ margin: '6px 0' }}>
          {label && <span style={badge(color, bg)}>{label}</span>}
          <Dispo r={r} />
          {st && <span style={badge(st[1], st[2])}>{st[0]}{r.statut === 'pousse' && r.pousse_a ? ` à ${r.pousse_a}` : ''}</span>}
          {r.score_calcule != null && <span style={{ fontSize: 11, color: '#999' }}>score automatique {r.score_calcule}</span>}
        </div>
        {r.justification && <p style={{ margin: '6px 0', fontSize: 13, color: '#333' }}>{r.justification}</p>}
        {r.ecarts?.length > 0 && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: '#b0471f' }}>
            {r.ecarts.map((e, k) => <li key={k}>{e}</li>)}
          </ul>
        )}

        {r.match_id && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {r.statut !== 'valide' && r.statut !== 'pousse' && (
              <button style={btn('#1d8b4f')} disabled={!!busy} onClick={() => statut('valide')}>
                {busy === 'valide' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Valider
              </button>
            )}
            {r.statut !== 'ecarte' && r.statut !== 'pousse' && (
              <button style={btn('#999')} disabled={!!busy} onClick={() => statut('ecarte')}>
                {busy === 'ecarte' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Écarter
              </button>
            )}
            {r.statut === 'ecarte' && <button style={btn('#999')} disabled={!!busy} onClick={() => statut('a_valider')}>Rétablir</button>}
            {r.statut !== 'ecarte' && (
              <button style={btn(BLUE, true)} disabled={!!busy} onClick={() => setPushOpen(!pushOpen)}>
                <Mail size={13} /> {r.statut === 'pousse' ? 'Nouveau push' : 'Préparer le push'}
              </button>
            )}
          </div>
        )}

        {pushOpen && (
          <div style={{ marginTop: 12, padding: 12, background: '#f7f7fb', borderRadius: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...input, flex: '1 1 220px' }} type="email" placeholder="Email du contact client" value={to} onChange={e => setTo(e.target.value)} />
            <input style={{ ...input, flex: '1 1 160px' }} placeholder="Nom du contact (facultatif)" value={toNom} onChange={e => setToNom(e.target.value)} />
            <button style={btn(BLUE, true)} disabled={busy === 'push' || !to.trim()} onClick={push}>
              {busy === 'push' ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Créer le brouillon Gmail
            </button>
            <div style={{ fontSize: 11, color: '#888', width: '100%' }}>
              Le mail est rédigé par Claude et déposé dans vos brouillons Gmail : rien n'est envoyé. Joignez le dossier ciblé (Générateur) avant d'envoyer.
            </div>
          </div>
        )}

        {draft && (
          <div style={{ marginTop: 12, padding: 12, border: '1.5px dashed #c8c8ee', borderRadius: 10, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{draft.objet}</div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{draft.corps.replace(/\*\*(.+?)\*\*/g, '$1')}</div>
            <a href={draft.gmail_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 600, display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
              Ouvrir mes brouillons Gmail <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
