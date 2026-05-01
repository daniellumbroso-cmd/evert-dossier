import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { Search, ExternalLink, FileText, LogOut, ArrowLeft, Loader2 } from 'lucide-react'

const SUGGESTIONS = [
  'Data Engineer Azure senior Paris',
  'Tech Lead Android Kotlin KMP',
  'Product Manager data-driven senior',
  'Analytics Engineer dbt BigQuery',
  'Développeur React TypeScript freelance'
]

function ScoreCircle({ score }) {
  if (score == null) {
    return (
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#f0f0f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: '#aaa'
      }}>—</div>
    )
  }
  const color = score >= 80 ? '#1400FF' : score >= 60 ? '#5b3df5' : score >= 40 ? '#888' : '#bbb'
  const bg = score >= 80 ? 'rgba(20,0,255,0.10)' : score >= 60 ? 'rgba(91,61,245,0.10)' : '#f0f0f5'
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color,
      border: `2px solid ${color}`,
      flexShrink: 0
    }}>
      {score}
    </div>
  )
}

function AvailabilityBadge({ available }) {
  if (!available) return null
  const av = String(available).toLowerCase()
  const isAvailable = av.includes('disponible') || av.includes('available') || av === 'oui' || av === 'yes'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 600,
      padding: '3px 9px', borderRadius: 12,
      background: isAvailable ? 'rgba(40,180,99,0.10)' : 'rgba(255,170,0,0.10)',
      color: isAvailable ? '#1d8b4f' : '#b57a00'
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isAvailable ? '#28b463' : '#f5a623'
      }} />
      {available}
    </span>
  )
}

export default function SearchPage() {
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [searchedQuery, setSearchedQuery] = useState('')

  const runSearch = async (q) => {
    const finalQuery = (q ?? query).trim()
    if (!finalQuery) return toast.error('Entrez une requête')
    setLoading(true)
    setResults(null)
    setSearchedQuery(finalQuery)
    try {
      const r = await fetch('/api/boond-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: finalQuery })
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error(data.error || 'Erreur de recherche')
        setResults({ candidates: [], total: 0, params: null })
        return
      }
      setResults(data)
      if (!data.candidates?.length) toast('Aucun candidat trouvé', { icon: '🔍' })
    } catch (e) {
      toast.error(e.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !loading) runSearch()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1.5px solid #e8e8f0',
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem', boxShadow: '0 1px 8px rgba(20,0,255,0.05)'
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
              color: '#1400FF', letterSpacing: '0.02em'
            }}>
              Recherche Profils
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link to="/app" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 500,
              color: '#555', textDecoration: 'none',
              padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e0e0f0',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1400FF'; e.currentTarget.style.color = '#1400FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0f0'; e.currentTarget.style.color = '#555' }}
            >
              <ArrowLeft size={13} /> Dossier Generator
            </Link>

            {user && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {user.picture && (
                    <img src={user.picture} alt="" style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid #e8e8f0' }} />
                  )}
                  <span style={{ fontSize: 13, color: '#555', fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>
                    {user.name || user.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  style={{
                    background: 'none', border: '1.5px solid #e0e0f0', borderRadius: 8,
                    padding: '6px 12px', cursor: 'pointer', color: '#888',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 5
                  }}
                >
                  <LogOut size={12} /> Déconnexion
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif', fontSize: 28, fontWeight: 700,
            color: '#111', margin: '0 0 8px 0', letterSpacing: '-0.01em'
          }}>
            Recherche dans Boond en langage naturel
          </h1>
          <p style={{
            fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#666',
            margin: 0
          }}>
            Décris le profil que tu cherches — ever"T traduit, interroge Boond et classe par pertinence.
          </p>
        </div>

        {/* Barre de recherche */}
        <div style={{
          background: '#fff', borderRadius: 14, padding: 16,
          border: '1.5px solid #e8e8f0',
          boxShadow: '0 4px 20px rgba(20,0,255,0.06)',
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Search size={18} style={{ color: '#1400FF', marginLeft: 8 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder='ex: "Tech lead Android Kotlin senior dispo Paris"'
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontFamily: 'DM Sans, sans-serif', fontSize: 15,
                padding: '10px 4px', background: 'transparent'
              }}
            />
            <button
              onClick={() => runSearch()}
              disabled={loading}
              style={{
                background: loading ? '#999' : '#1400FF', color: '#fff',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.15s'
              }}
            >
              {loading ? <><Loader2 size={14} className="anim-spin" /> Recherche…</> : 'Rechercher'}
            </button>
          </div>
        </div>

        {/* Suggestions */}
        {!results && !loading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600,
              color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 10
            }}>
              Suggestions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); runSearch(s) }}
                  style={{
                    background: '#fff', border: '1.5px solid #e0e0f0',
                    borderRadius: 20, padding: '7px 14px',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#444',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1400FF'; e.currentTarget.style.color = '#1400FF' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0f0'; e.currentTarget.style.color = '#444' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{
            background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
            padding: 32, textAlign: 'center',
            fontFamily: 'DM Sans, sans-serif', color: '#888', fontSize: 14
          }}>
            <Loader2 size={20} className="anim-spin" style={{ marginBottom: 8, color: '#1400FF' }} />
            <div>Interrogation Boond + classement IA…</div>
          </div>
        )}

        {/* Résultats */}
        {!loading && results && (
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 14
            }}>
              <div style={{
                fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
                color: '#444'
              }}>
                {results.candidates?.length || 0} profil{(results.candidates?.length || 0) > 1 ? 's' : ''} pour <span style={{ color: '#1400FF' }}>"{searchedQuery}"</span>
              </div>
              {results.params?.keywords && (
                <div style={{ fontSize: 11, color: '#999', fontFamily: 'DM Sans, sans-serif' }}>
                  Mots-clés Boond : <code style={{ background: '#f0f0f5', padding: '2px 6px', borderRadius: 4 }}>{results.params.keywords}</code>
                </div>
              )}
            </div>

            {(!results.candidates || results.candidates.length === 0) && (
              <div style={{
                background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
                padding: 32, textAlign: 'center',
                fontFamily: 'DM Sans, sans-serif', color: '#888', fontSize: 14
              }}>
                Aucun candidat trouvé. Essaie de simplifier ta requête.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.candidates?.map(c => (
                <div key={c.id} style={{
                  background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
                  padding: 16,
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#c5b9ff'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,0,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8f0'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <ScoreCircle score={c.score} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 15,
                        color: '#111'
                      }}>
                        {c.firstName} {c.lastName}
                      </span>
                      <AvailabilityBadge available={c.available} />
                    </div>
                    {c.title && (
                      <div style={{
                        fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#555',
                        marginBottom: 4
                      }}>
                        {c.title}
                      </div>
                    )}
                    {c.analysis && (
                      <div style={{
                        fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#888',
                        fontStyle: 'italic'
                      }}>
                        {c.analysis}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a
                      href={c.boondUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#fff', border: '1.5px solid #e0e0f0',
                        borderRadius: 8, padding: '7px 12px',
                        fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 500,
                        color: '#555', textDecoration: 'none', transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#1400FF'; e.currentTarget.style.color = '#1400FF' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0f0'; e.currentTarget.style.color = '#555' }}
                    >
                      <ExternalLink size={12} /> Boond
                    </a>
                    <Link
                      to="/app"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#1400FF', border: '1.5px solid #1400FF',
                        borderRadius: 8, padding: '7px 12px',
                        fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                        color: '#fff', textDecoration: 'none'
                      }}
                    >
                      <FileText size={12} /> Dossier
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .anim-spin { animation: anim-spin 1s linear infinite; }
        @keyframes anim-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
