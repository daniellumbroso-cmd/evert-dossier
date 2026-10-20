import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Loader2, ExternalLink, Database } from 'lucide-react'
import AgentHeader from '../components/AgentHeader'
import { BLUE, card, badge, fmtDate } from '../components/MatchCard'

// Étape 4 : les moments clés — consultants en intercontrat, fins de mission
// à J-15 / J-30, et les offres récentes qui leur correspondent.

const font = 'DM Sans, sans-serif'
const h2 = { fontFamily: 'Montserrat, sans-serif', fontSize: 16, fontWeight: 700, margin: '26px 0 12px' }

function Consultant({ c }) {
  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{c.nom}</span>
        <span style={{ color: '#666', fontSize: 13 }}>{c.titre || c.famille}</span>
        {c.palier && <span style={badge(c.palier === 'J-15' ? '#c62828' : '#b57a00', c.palier === 'J-15' ? 'rgba(198,40,40,0.08)' : 'rgba(255,170,0,0.12)')}>
          {c.palier} · fin le {fmtDate(c.fin_mission)}
        </span>}
        <a href={c.boond_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>Boond <ExternalLink size={11} /></a>
      </div>
      {c.offres.length
        ? <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {c.offres.map(o => (
              <li key={o.offre_id}>
                <Link to={`/offre?id=${o.offre_id}`} style={{ color: '#111' }}>{o.titre}</Link>
                <span style={{ color: '#888' }}> · {o.source} · score {o.score}</span>
              </li>
            ))}
          </ul>
        : <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Aucune offre récente de son métier : à pousser en approche proactive (Match Dossier, Campagne push).</div>}
    </section>
  )
}

// Remplissage de la base depuis Boond, page par page, depuis le navigateur.
// Le même traitement tourne chaque nuit via Make ; ce bouton sert au premier
// remplissage et à forcer une mise à jour. Une page interrompue se reprend.
function RemplissageBase({ base, onFini }) {
  const [etat, setEtat] = useState(null) // { page, lus, ecrits, erreurs, fini, erreur }

  const lancer = async (depart = 1) => {
    let page = depart
    let cumul = depart === 1 ? { lus: 0, ecrits: 0, erreurs: 0 } : etat
    while (page) {
      setEtat({ ...cumul, page, enCours: true })
      try {
        const r = await fetch(`/api/agent/index-consultants?page=${page}`, { method: 'POST' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`)
        cumul = { lus: cumul.lus + j.lus, ecrits: cumul.ecrits + j.mis_a_jour + j.inchange, erreurs: cumul.erreurs + j.erreurs.length }
        page = j.page_suivante
      } catch (e) {
        setEtat({ ...cumul, page, erreur: e.message })
        return
      }
    }
    setEtat({ ...cumul, fini: true })
    toast.success('Base des consultants à jour')
    onFini()
  }

  const vide = !base?.consultants
  return (
    <section style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', ...(vide ? { borderColor: BLUE } : {}) }}>
      <Database size={20} color={BLUE} />
      <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: '#444' }}>
        {vide
          ? <><b>La base des consultants est vide.</b> Lancez le premier remplissage depuis Boond (quelques minutes : Claude lit chaque fiche).</>
          : <><b>{base.consultants} consultants</b> dans la base ({base.avec_metier} avec un métier reconnu), mise à jour le {fmtDate(base.derniere_maj)}.</>}
        {etat && (
          <div style={{ marginTop: 6, color: etat.erreur ? '#c62828' : '#666' }}>
            {etat.enCours && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Loader2 size={12} className="animate-spin" /> Page {etat.page} en cours… </span>}
            {etat.lus} fiches lues, {etat.ecrits} enregistrées{etat.erreurs ? `, ${etat.erreurs} en erreur` : ''}.
            {etat.erreur && <> Arrêt page {etat.page} : {etat.erreur}</>}
            {etat.fini && ' Terminé ✓'}
          </div>
        )}
      </div>
      {etat?.erreur
        ? <button onClick={() => lancer(etat.page)} style={{ ...btnBleu }}>Reprendre page {etat.page}</button>
        : <button onClick={() => lancer(1)} disabled={etat?.enCours} style={{ ...btnBleu, opacity: etat?.enCours ? 0.6 : 1 }}>
            {etat?.enCours ? 'Remplissage…' : vide ? 'Remplir la base' : 'Mettre à jour maintenant'}
          </button>}
    </section>
  )
}

const btnBleu = { border: 'none', background: BLUE, color: '#fff', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)

  const charger = () => {
    fetch('/api/agent/alertes')
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error || `Erreur ${r.status}`)))))
      .then(j => { setData(j); setErreur(null) })
      .catch(e => setErreur(e.message))
  }
  useEffect(charger, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <AgentHeader titre="Tableau de bord" />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {!data && !erreur && <p style={{ color: '#888' }}><Loader2 size={14} className="animate-spin" /> Chargement…</p>}
        {erreur && (
          <section style={{ ...card, borderColor: '#f3c0c0', fontSize: 14 }}>
            <b>L'agent n'est pas encore branché.</b> {erreur}
            {/Supabase/.test(erreur) && <div style={{ marginTop: 6, color: '#666', fontSize: 13 }}>Il manque les variables Supabase sur Vercel : voir docs/AGENT.md, « Mise en route ».</div>}
          </section>
        )}
        {data && (
          <>
            <RemplissageBase base={data.base} onFini={charger} />
            <section style={{ ...card, background: 'rgba(20,0,255,0.04)', borderColor: 'rgba(20,0,255,0.15)', fontSize: 14 }}>{data.resume}</section>

            {data.matchs_forts.length > 0 && (
              <>
                <h2 style={h2}>Matchs à 80+ depuis hier</h2>
                {data.matchs_forts.map(m => (
                  <section key={m.match_id} style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <b style={{ color: BLUE, minWidth: 40 }}>{m.score}</b>
                    <span style={{ flex: 1 }}>{m.consultant} → <Link to={`/offre?id=${m.offre_id}`} style={{ color: '#111' }}>{m.offre}</Link></span>
                    <span style={badge('#555', '#f0f0f5')}>{m.source}</span>
                  </section>
                ))}
              </>
            )}

            <h2 style={h2}>Fins de mission sous 30 jours ({data.fins_mission.length})</h2>
            {data.fins_mission.length ? data.fins_mission.map(c => <Consultant key={c.boond_id} c={c} />)
              : <p style={{ color: '#999', fontSize: 13 }}>Aucune fin de mission prévue dans les 30 jours.</p>}

            <h2 style={h2}>En intercontrat ({data.intercontrats.length})</h2>
            {data.intercontrats.length ? data.intercontrats.map(c => <Consultant key={c.boond_id} c={c} />)
              : <p style={{ color: '#999', fontSize: 13 }}>Personne en intercontrat.</p>}
          </>
        )}
      </main>
    </div>
  )
}
