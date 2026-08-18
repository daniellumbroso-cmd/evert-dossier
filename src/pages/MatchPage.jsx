import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { ArrowLeft, LogOut, Loader2, Target, ExternalLink, Briefcase, Building2, History, Search, User } from 'lucide-react'

function ScoreBadge({ score }) {
  if (score == null) return null
  const color = score >= 80 ? '#1400FF' : score >= 60 ? '#5b3df5' : '#888'
  const bg = score >= 80 ? 'rgba(20,0,255,0.10)' : score >= 60 ? 'rgba(91,61,245,0.10)' : '#f0f0f5'
  return (
    <div style={{
      minWidth: 44, height: 44, borderRadius: '50%',
      background: bg, border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color,
      flexShrink: 0
    }}>
      {score}
    </div>
  )
}

function StatusPill({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontFamily: 'Montserrat, sans-serif',
      fontWeight: 600, padding: '3px 8px', borderRadius: 10,
      color, background: bg, textTransform: 'uppercase', letterSpacing: '0.03em'
    }}>{label}</span>
  )
}

function opportunityStatus(state) {
  // Codes Boond : 0=abandonné, 1=en cours, 2=won, 3=lost, 4-7 variantes
  const map = {
    '1': { label: 'En cours', color: '#b57a00', bg: 'rgba(255,170,0,0.12)' },
    '2': { label: 'Gagné', color: '#1d8b4f', bg: 'rgba(40,180,99,0.12)' },
    '3': { label: 'Perdu', color: '#b71c1c', bg: 'rgba(220,50,50,0.10)' },
    '0': { label: 'Abandonné', color: '#666', bg: '#f0f0f5' }
  }
  return map[String(state)] || { label: `Statut ${state}`, color: '#555', bg: '#f0f0f5' }
}

export default function MatchPage() {
  const { user, logout } = useAuth()
  const [params, setParams] = useSearchParams()
  const [candidateName, setCandidateName] = useState(params.get('name') || '')
  const [profileHint, setProfileHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)

  const runMatch = async (nameOverride) => {
    const name = (nameOverride ?? candidateName).trim()
    if (!name) return toast.error('Entrez un nom de candidat')
    setLoading(true)
    setData(null)
    try {
      const r = await fetch('/api/boond-match-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateName: name, profileHint: profileHint.trim() || undefined })
      })
      const j = await r.json()
      if (!r.ok) {
        toast.error(j.error || 'Erreur de recherche')
        return
      }
      setData(j)
      setParams({ name })
    } catch (e) {
      toast.error(e.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{
        background: '#fff', borderBottom: '1.5px solid #e8e8f0',
        position: 'sticky', top: 0, zIndex: 100, padding: '0 2rem',
        boxShadow: '0 1px 8px rgba(20,0,255,0.05)'
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/evert-logo.png" alt='ever"T' style={{ height: 90, width: 'auto' }} />
            <div style={{ width: 1, height: 24, background: '#e0e0f0' }} />
            <span style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14,
              color: '#1400FF', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Target size={14} /> Match Consultant ↔ Opportunités
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link to="/search" style={linkStyle}>
              <ArrowLeft size={13} /> Recherche
            </Link>
            {user && (
              <>
                <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>{user.name || user.email}</span>
                <button onClick={logout} style={{
                  background: 'none', border: '1.5px solid #e0e0f0', borderRadius: 8,
                  padding: '6px 12px', cursor: 'pointer', color: '#888',
                  fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5
                }}>
                  <LogOut size={12} /> Déconnexion
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif', fontSize: 26, fontWeight: 700,
            color: '#111', margin: '0 0 6px 0'
          }}>
            Match consultant ↔ opportunités
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            À partir d'un consultant, trouve les opportunités Boond (tous statuts) et les comptes clients où il pourrait être positionné.
          </p>
        </div>

        {/* Formulaire */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 16,
          border: '1.5px solid #e8e8f0',
          boxShadow: '0 4px 20px rgba(20,0,255,0.06)',
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <User size={18} style={{ color: '#1400FF', marginLeft: 8 }} />
            <input
              type="text"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && runMatch()}
              placeholder='Nom du consultant (ex: "Alexandre Hunault")'
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontSize: 15, padding: '10px 4px'
              }}
            />
            <button
              onClick={() => runMatch()}
              disabled={loading}
              style={{
                background: loading ? '#999' : '#1400FF', color: '#fff',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              {loading ? <><Loader2 size={14} className="mtch-spin" /> Match…</> : 'Lancer le match'}
            </button>
          </div>
          <details style={{ fontSize: 12, color: '#666' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              + Ajouter des infos depuis un dossier PDF (optionnel)
            </summary>
            <textarea
              value={profileHint}
              onChange={e => setProfileHint(e.target.value)}
              placeholder="Colle ici le résumé du candidat (stack, secteurs, projets récents...) pour affiner le match"
              style={{
                width: '100%', marginTop: 8, minHeight: 80,
                border: '1.5px solid #e0e0f0', borderRadius: 8, padding: 8,
                fontFamily: 'DM Sans, sans-serif', fontSize: 12, outline: 'none', resize: 'vertical'
              }}
            />
          </details>
        </div>

        {loading && (
          <div style={{
            background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
            padding: 32, textAlign: 'center', color: '#888', fontSize: 13
          }}>
            <Loader2 size={20} className="mtch-spin" style={{ color: '#1400FF', marginBottom: 8 }} />
            <div>Récupération fiche Boond → extraction profil → scan opportunités & comptes → scoring IA…</div>
            <div style={{ fontSize: 11, marginTop: 6, color: '#aaa' }}>~30-60 secondes selon la volumétrie</div>
          </div>
        )}

        {data && (
          <>
            {/* Bloc profil */}
            <div style={{
              background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
              padding: 18, marginBottom: 20
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                marginBottom: 10
              }}>
                <div>
                  <div style={{
                    fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#111'
                  }}>
                    {data.candidate.firstName} {data.candidate.lastName}
                  </div>
                  {data.candidate.title && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{data.candidate.title}</div>
                  )}
                </div>
                <a href={data.candidate.boondUrl} target="_blank" rel="noopener noreferrer" style={miniLink}>
                  <ExternalLink size={12} /> Fiche Boond
                </a>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(data.profile?.stack_keywords || []).map(k => (
                  <span key={k} style={{
                    fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 500,
                    padding: '3px 9px', borderRadius: 10,
                    background: 'rgba(20,0,255,0.08)', color: '#1400FF'
                  }}>{k}</span>
                ))}
                {(data.profile?.sectors || []).map(s => (
                  <span key={s} style={{
                    fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 500,
                    padding: '3px 9px', borderRadius: 10,
                    background: '#f0f0f5', color: '#555'
                  }}>{s}</span>
                ))}
              </div>
              {data.profile?.summary && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 10, fontStyle: 'italic' }}>
                  {data.profile.summary}
                </div>
              )}
              <div style={{
                fontSize: 11, color: '#aaa', marginTop: 10,
                borderTop: '1px solid #f0f0f5', paddingTop: 8
              }}>
                Scan : {data.counts.opportunitiesScanned} opportunités, {data.counts.companiesScanned} comptes.
                Retenus : {data.counts.opportunitiesRelevant} opportunités, {data.counts.companiesRelevant} comptes.
              </div>
            </div>

            {/* Opportunités */}
            <SectionHeader icon={<Briefcase size={16} />} title={`Opportunités pertinentes (${data.opportunities.length})`} />
            {data.opportunities.length === 0 ? (
              <EmptyBlock text="Aucune opportunité pertinente trouvée (seuil score ≥ 40)." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.opportunities.map(o => {
                  const st = opportunityStatus(o.state)
                  return (
                    <Card key={o.id}>
                      <ScoreBadge score={o.score} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#111' }}>
                            {o.title || o.reference || `Opportunité #${o.id}`}
                          </span>
                          <StatusPill {...st} />
                        </div>
                        {(o.companyName || o.company) && (
                          <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                            🏢 {o.companyName || o.company}
                          </div>
                        )}
                        {o.reason && (
                          <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>{o.reason}</div>
                        )}
                      </div>
                      <a href={o.boondUrl} target="_blank" rel="noopener noreferrer" style={miniLink}>
                        <ExternalLink size={12} /> Voir
                      </a>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Comptes */}
            <SectionHeader icon={<Building2 size={16} />} title={`Comptes clients pertinents (${data.companies.length})`} />
            {data.companies.length === 0 ? (
              <EmptyBlock text="Aucun compte client pertinent trouvé (seuil score ≥ 40)." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.companies.map(c => (
                  <Card key={c.id}>
                    <ScoreBadge score={c.score} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 3 }}>
                        {c.name || `Compte #${c.id}`}
                      </div>
                      {c.mainManager && (
                        <div style={{ fontSize: 11, color: '#888' }}>Referent : {c.mainManager}</div>
                      )}
                      {c.reason && (
                        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 }}>{c.reason}</div>
                      )}
                    </div>
                    <a href={c.boondUrl} target="_blank" rel="noopener noreferrer" style={miniLink}>
                      <ExternalLink size={12} /> Voir
                    </a>
                  </Card>
                ))}
              </div>
            )}

            {/* Missions passées */}
            {data.pastMissions?.length > 0 && (
              <>
                <SectionHeader icon={<History size={16} />} title={`Missions passées du consultant (${data.pastMissions.length})`} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {data.pastMissions.map(m => (
                    <div key={m.id} style={{
                      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 10,
                      padding: '10px 14px', fontSize: 12, color: '#444'
                    }}>
                      <strong>{m.title || m.reference || `Mission #${m.id}`}</strong>
                      {(m.startDate || m.endDate) && (
                        <span style={{ color: '#888', marginLeft: 8 }}>
                          · {m.startDate || '?'} → {m.endDate || 'en cours'}
                        </span>
                      )}
                      {m.company && <div style={{ marginTop: 2, color: '#666' }}>🏢 {m.company}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <style>{`
          .mtch-spin { animation: mtch-spin 1s linear infinite; }
          @keyframes mtch-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </main>
    </div>
  )
}

// Sous-composants
const linkStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 500,
  color: '#555', textDecoration: 'none',
  padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e0e0f0'
}
const miniLink = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: '#fff', border: '1.5px solid #e0e0f0',
  borderRadius: 8, padding: '6px 10px',
  fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 500,
  color: '#555', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap'
}
function Card({ children }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
      padding: 14, display: 'flex', alignItems: 'center', gap: 14
    }}>{children}</div>
  )
}
function SectionHeader({ icon, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
      color: '#1400FF', textTransform: 'uppercase', letterSpacing: '0.03em'
    }}>{icon} {title}</div>
  )
}
function EmptyBlock({ text }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
      padding: 18, textAlign: 'center', color: '#888', fontSize: 13, marginBottom: 24
    }}>{text}</div>
  )
}
