import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Loader2, ExternalLink, Archive } from 'lucide-react'
import AgentHeader from '../components/AgentHeader'
import { BLUE, card, badge, fmtDate } from '../components/MatchCard'

// Étape 2 : offres reçues (alertes Collective lues dans Gmail par Make, besoins
// Boond, offres collées à la main) sur 24 h, 7 jours ou 30 jours.

const font = 'DM Sans, sans-serif'
const PERIODES = [['24h', '24 heures'], ['7j', '7 jours'], ['30j', '30 jours']]
const SOURCES = [['', 'Toutes'], ['collective', 'Collective'], ['boond', 'Boond'], ['email', 'Mails clients'], ['manuel', 'Saisies']]
const SOURCE_LABEL = { collective: 'Collective', boond: 'Boond', email: 'Mail client', manuel: 'Saisie' }

export default function OffresPage() {
  const [periode, setPeriode] = useState(() => { try { return localStorage.getItem('offres.periode') || '7j' } catch { return '7j' } })
  const [source, setSource] = useState('')
  const [offres, setOffres] = useState(null)

  useEffect(() => {
    try { localStorage.setItem('offres.periode', periode) } catch { /* stockage indisponible */ }
    setOffres(null)
    const qs = new URLSearchParams({ periode, ...(source ? { source } : {}) })
    fetch(`/api/agent/offres?${qs}`)
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then(j => setOffres(j.offres))
      .catch(e => { toast.error(e.message); setOffres([]) })
  }, [periode, source])

  const archiver = async (id) => {
    const r = await fetch('/api/agent/offres', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archiver', offre_id: id }) })
    if (r.ok) setOffres(os => os.filter(o => o.id !== id))
    else toast.error("Impossible d'archiver l'offre")
  }

  const pill = (on) => ({ border: 'none', cursor: 'pointer', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600, background: on ? BLUE : '#fff', color: on ? '#fff' : '#555', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px #e0e0f0' })

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <AgentHeader titre="Offres reçues" />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          {PERIODES.map(([k, l]) => <button key={k} style={pill(periode === k)} onClick={() => setPeriode(k)}>{l}</button>)}
          <span style={{ width: 1, height: 22, background: '#e0e0f0', margin: '0 6px' }} />
          {SOURCES.map(([k, l]) => <button key={k || 'all'} style={pill(source === k)} onClick={() => setSource(k)}>{l}</button>)}
        </div>

        {offres === null && <p style={{ color: '#888' }}><Loader2 size={14} className="animate-spin" /> Chargement…</p>}
        {offres?.length === 0 && (
          <section style={{ ...card, color: '#666', fontSize: 14 }}>
            Aucune offre sur cette période. Les alertes Collective arrivent ici automatiquement une fois le scénario Make branché ;
            vous pouvez aussi <Link to="/offre" style={{ color: BLUE }}>coller une offre à la main</Link>.
          </section>
        )}

        {offres?.map(o => (
          <section key={o.id} style={{ ...card, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Link to={`/offre?id=${o.id}`} style={{ fontWeight: 700, fontSize: 15, color: '#111', textDecoration: 'none' }}>{o.titre || 'Offre sans titre'}</Link>
                {o.lien && <a href={o.lien} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>source <ExternalLink size={11} /></a>}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                <span style={badge('#555', '#f0f0f5')}>{SOURCE_LABEL[o.source] || o.source}</span>
                {o.famille && <span style={badge('#5b3df5', 'rgba(91,61,245,0.10)')}>{o.famille_label}</span>}
                {o.statut === 'poussee' && <span style={badge(BLUE, 'rgba(20,0,255,0.08)')}>Push préparé</span>}
                {fmtDate(o.recue_le)}{o.entreprise ? ` · ${o.entreprise}` : ''}{o.lieu ? ` · ${o.lieu}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 170 }}>
              {o.meilleur
                ? <><div style={{ fontWeight: 700, color: o.meilleur.score >= 80 ? BLUE : '#555' }}>{o.meilleur.score}/100</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{o.meilleur.nom}{o.nb_matchs > 1 ? ` + ${o.nb_matchs - 1}` : ''}</div></>
                : <div style={{ fontSize: 12, color: '#999' }}>Pas encore matchée</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <Link to={`/offre?id=${o.id}`} style={{ color: BLUE, fontSize: 12, fontWeight: 600 }}>Voir le classement</Link>
                <button onClick={() => archiver(o.id)} title="Archiver" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#aaa', padding: 0 }}><Archive size={14} /></button>
              </div>
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
