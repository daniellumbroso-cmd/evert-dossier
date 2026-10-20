import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Loader2, Target, RefreshCw, ExternalLink } from 'lucide-react'
import { FAMILLES, FAMILLE_IDS } from '../../api/_lib/metiers.js'
import AgentHeader from '../components/AgentHeader'
import MatchCard, { BLUE, card, fmtDate } from '../components/MatchCard'

// Offre → consultants : filtre strict par famille de métier et disponibilité,
// score pondéré, puis relecture des 10 meilleurs par Claude (/api/agent/match-offer).
// Avec ?id=<offre>, affiche une offre déjà en base (reçue de Collective…) et son classement.

const font = 'DM Sans, sans-serif'
const h2 = { fontFamily: 'Montserrat, sans-serif', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }

export default function MatchOfferPage() {
  const [params] = useSearchParams()
  const offreId = params.get('id')
  const [mode, setMode] = useState('texte')
  const [texte, setTexte] = useState('')
  const [oppId, setOppId] = useState('')
  const [famille, setFamille] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)

  // Offre enregistrée : on lit son classement en base, sans relancer Claude.
  useEffect(() => {
    setData(null)
    if (!offreId) return
    setLoading(true)
    fetch(`/api/agent/offres?id=${encodeURIComponent(offreId)}`)
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then(j => setData({
        offre_id: j.offre.id,
        offre: { ...(j.offre.analyse_ia || {}), titre: j.offre.titre, famille_label: j.offre.famille_label },
        source: j.offre, resultats: j.resultats
      }))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [offreId])

  const run = async (body) => {
    setLoading(true)
    try {
      const r = await fetch('/api/agent/match-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Erreur de matching')
      setData(d => ({ ...json, source: d?.source }))
      if (!json.resultats.length) toast('Aucun consultant éligible pour ce métier et cette date', { icon: '🔍' })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const lancer = () => {
    const body = mode === 'texte' ? { texte: texte.trim() } : { opportunity_id: oppId.trim() }
    if (mode === 'texte' && body.texte.length < 30) return toast.error("Collez le texte complet de l'offre")
    if (mode === 'boond' && !body.opportunity_id) return toast.error('Indiquez l’ID du besoin Boond')
    if (famille) body.famille = famille
    setData(null)
    run(body)
  }

  const o = data?.offre
  const src = data?.source
  const input = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e0e0f0', borderRadius: 10, padding: 12, fontFamily: font, fontSize: 14 }
  const tab = (on) => ({ border: 'none', background: on ? BLUE : '#f0f0f5', color: on ? '#fff' : '#555', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 })

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <AgentHeader titre="Matching offre → consultants" />

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {!offreId && (
          <section style={card}>
            <h2 style={h2}>L'offre</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={tab(mode === 'texte')} onClick={() => setMode('texte')}>Texte de l'offre</button>
              <button style={tab(mode === 'boond')} onClick={() => setMode('boond')}>Besoin Boond</button>
            </div>
            {mode === 'texte'
              ? <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={9} style={input}
                  placeholder="Collez l'appel d'offres, l'offre Collective ou le mail du client…" />
              : <input value={oppId} onChange={e => setOppId(e.target.value)} style={input} placeholder="ID du besoin dans Boond (ex. 12345)" />}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <select value={famille} onChange={e => setFamille(e.target.value)} style={{ ...input, width: 'auto', padding: '9px 10px' }}>
                <option value="">Métier : détecté automatiquement</option>
                {FAMILLE_IDS.map(f => <option key={f} value={f}>{FAMILLES[f].label}</option>)}
              </select>
              <button onClick={lancer} disabled={loading} style={{ ...tab(true), padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />}
                {loading ? 'Analyse en cours (≈ 1 min)…' : 'Trouver les consultants'}
              </button>
            </div>
          </section>
        )}

        {offreId && loading && !data && <p style={{ color: '#888' }}><Loader2 size={14} className="animate-spin" /> Chargement de l'offre…</p>}

        {o && (
          <section style={card}>
            <h2 style={h2}>{o.titre}</h2>
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>
              {src && (
                <div style={{ color: '#888' }}>
                  {src.source} · reçue le {fmtDate(src.recue_le)}{src.entreprise ? ` · ${src.entreprise}` : ''}
                  {src.lien && <> · <a href={src.lien} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>voir l'offre <ExternalLink size={11} /></a></>}
                </div>
              )}
              {o.famille_label && <div><b>Métier :</b> {o.famille_label}{o.familles_acceptees && <span style={{ color: '#888' }}> · consultants acceptés : {o.familles_acceptees.join(', ')} (+ expérience réelle dans ce métier)</span>}</div>}
              {o.competences_requises?.length > 0 && <div><b>Requis :</b> {o.competences_requises.join(', ')}</div>}
              {o.competences_bonus?.length > 0 && <div><b>Apprécié :</b> {o.competences_bonus.join(', ')}</div>}
              <div>
                {o.seniorite && <><b>Séniorité :</b> {o.seniorite} · </>}
                {o.date_demarrage && <><b>Démarrage :</b> {fmtDate(o.date_demarrage)} · </>}
                {(o.localisation || o.full_remote) && <><b>Lieu :</b> {o.full_remote ? 'full remote' : o.localisation} · </>}
                {o.tjm_max && <><b>TJM max :</b> {o.tjm_max} €</>}
              </div>
              {data.preselectionnes != null && (
                <div style={{ color: '#888', marginTop: 6 }}>
                  {data.preselectionnes} consultant(s) du bon métier, {data.eligibles} disponible(s) à temps, {data.resultats.length} relu(s) par Claude.
                </div>
              )}
              {offreId && (
                <button onClick={() => run({ offre_id: offreId })} disabled={loading} style={{ ...tab(false), marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {data.resultats.length ? 'Relancer le matching' : 'Lancer le matching'}
                </button>
              )}
            </div>
          </section>
        )}

        {data?.resultats.map((r, i) => (
          <MatchCard key={r.match_id || r.boond_id} r={r} rang={i + 1}
            contactEmail={src?.contact_email || ''} contactNom={src?.contact_nom || ''} />
        ))}
      </main>
    </div>
  )
}
