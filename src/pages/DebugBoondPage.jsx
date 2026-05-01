import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ArrowLeft, LogOut, Loader2, Database } from 'lucide-react'

// Affiche une valeur formatée selon son type
function renderValue(v) {
  if (v === null || v === undefined || v === '') {
    return <span style={{ color: '#bbb', fontStyle: 'italic' }}>vide</span>
  }
  if (typeof v === 'boolean') return v ? '✅ true' : '❌ false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    // Si HTML, on strip ; sinon on affiche
    if (/<[a-z][\s\S]*>/i.test(v)) {
      return v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || <span style={{ color: '#bbb' }}>vide (HTML)</span>
    }
    return v
  }
  if (Array.isArray(v)) {
    if (!v.length) return <span style={{ color: '#bbb', fontStyle: 'italic' }}>[ ]</span>
    return (
      <div style={{ paddingLeft: 12 }}>
        {v.map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ color: '#888', fontSize: 11 }}>[{i}]</span>{' '}
            {typeof item === 'object' ? <pre style={preStyle}>{JSON.stringify(item, null, 2)}</pre> : String(item)}
          </div>
        ))}
      </div>
    )
  }
  if (typeof v === 'object') {
    return <pre style={preStyle}>{JSON.stringify(v, null, 2)}</pre>
  }
  return String(v)
}

const preStyle = {
  background: '#f7f7fa',
  padding: 8,
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'monospace',
  margin: 0,
  overflow: 'auto',
  maxHeight: 300,
  border: '1px solid #ececf2'
}

function Field({ label, value }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid #f0f0f5',
      fontSize: 13,
      fontFamily: 'DM Sans, sans-serif'
    }}>
      <div style={{ fontWeight: 600, color: '#666', wordBreak: 'break-word' }}>{label}</div>
      <div style={{ color: '#222', wordBreak: 'break-word' }}>{renderValue(value)}</div>
    </div>
  )
}

function Section({ title, status, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const isError = status && status !== 200
  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid #e8e8f0',
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          background: open ? '#fafaff' : '#fff',
          border: 'none', padding: '14px 18px',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Montserrat, sans-serif', fontSize: 14, fontWeight: 600,
          color: isError ? '#b71c1c' : '#1400FF'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? '▼' : '▶'} {title}
        </span>
        {status && (
          <span style={{
            fontSize: 11, fontWeight: 500,
            padding: '3px 9px', borderRadius: 12,
            background: isError ? '#fee' : '#e6ffe6',
            color: isError ? '#b71c1c' : '#1d8b4f'
          }}>
            HTTP {status}
          </span>
        )}
      </button>
      {open && <div style={{ padding: '8px 18px 18px' }}>{children}</div>}
    </div>
  )
}

export default function DebugBoondPage() {
  const { user, logout } = useAuth()
  const [name, setName] = useState('Gilbert Tran')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const fetchDebug = async (q) => {
    const finalName = (q ?? name).trim()
    if (!finalName) return
    setLoading(true)
    setData(null)
    setError(null)
    try {
      const r = await fetch(`/api/boond-debug?name=${encodeURIComponent(finalName)}`)
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`)
        setData(j) // afficher quand même
      } else {
        setData(j)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch au chargement
  React.useEffect(() => {
    fetchDebug('Gilbert Tran')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const info = data?.endpoints?.information?.body
  const attributes = info?.data?.attributes || {}
  const included = Array.isArray(info?.included) ? info.included : []
  const meta = info?.meta || {}

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
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
              color: '#1400FF', letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Database size={14} /> Debug Boond
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link to="/search" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 500,
              color: '#555', textDecoration: 'none',
              padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e0e0f0'
            }}>
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
            fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 700,
            color: '#111', margin: '0 0 6px 0'
          }}>
            Visualisation complète Boond
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Toutes les infos brutes que l'API Boond expose pour un candidat. Utile pour savoir ce qu'on peut afficher dans la feature recherche.
          </p>
        </div>

        {/* Barre de recherche */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: 14,
          border: '1.5px solid #e8e8f0', marginBottom: 18,
          display: 'flex', gap: 10, alignItems: 'center'
        }}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && fetchDebug()}
            placeholder="Nom du candidat (ex: Gilbert Tran)"
            style={{
              flex: 1, border: '1.5px solid #e0e0f0', outline: 'none',
              padding: '9px 12px', borderRadius: 8, fontSize: 14
            }}
          />
          <button
            onClick={() => fetchDebug()}
            disabled={loading}
            style={{
              background: loading ? '#999' : '#1400FF', color: '#fff',
              border: 'none', borderRadius: 8, padding: '9px 18px',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            {loading ? <><Loader2 size={14} className="dbg-spin" /> Chargement…</> : 'Charger'}
          </button>
        </div>

        {error && (
          <div style={{
            background: '#fee', border: '1.5px solid #fcc', borderRadius: 10,
            padding: 14, marginBottom: 16, color: '#b71c1c', fontSize: 13
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <Loader2 size={20} className="dbg-spin" />
            <div style={{ marginTop: 8, fontSize: 13 }}>Interrogation Boond sur tous les endpoints…</div>
          </div>
        )}

        {data && (
          <>
            {/* Méta de la recherche */}
            <div style={{
              background: 'rgba(20,0,255,0.04)', border: '1.5px solid rgba(20,0,255,0.15)',
              borderRadius: 10, padding: 12, marginBottom: 16,
              fontSize: 12, fontFamily: 'monospace', color: '#444'
            }}>
              <strong>resourceId</strong> : {data.resourceId || '—'}
              {' · '}
              <strong>endpoints testés</strong> : {Object.keys(data.endpoints || {}).length}
            </div>

            {/* === Section principale : information === */}
            <Section
              title={`📋 /resources/${data.resourceId}/information — Fiche complète`}
              status={data.endpoints?.information?.status}
              defaultOpen={true}
            >
              {Object.keys(attributes).length > 0 ? (
                <>
                  <div style={{
                    fontSize: 11, color: '#888', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 8, fontWeight: 600
                  }}>
                    Attributs ({Object.keys(attributes).length})
                  </div>
                  {Object.entries(attributes).map(([k, v]) => (
                    <Field key={k} label={k} value={v} />
                  ))}

                  {included.length > 0 && (
                    <>
                      <div style={{
                        fontSize: 11, color: '#888', textTransform: 'uppercase',
                        letterSpacing: '0.05em', margin: '20px 0 8px', fontWeight: 600
                      }}>
                        Inclus ({included.length} entités liées)
                      </div>
                      {included.map((inc, i) => (
                        <div key={i} style={{
                          background: '#fafaff', border: '1px solid #ececf2',
                          borderRadius: 8, padding: 10, marginBottom: 8
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#1400FF', marginBottom: 6 }}>
                            {inc.type} #{inc.id}
                          </div>
                          {inc.attributes && Object.entries(inc.attributes).map(([k, v]) => (
                            <Field key={k} label={k} value={v} />
                          ))}
                        </div>
                      ))}
                    </>
                  )}

                  {Object.keys(meta).length > 0 && (
                    <>
                      <div style={{
                        fontSize: 11, color: '#888', textTransform: 'uppercase',
                        letterSpacing: '0.05em', margin: '20px 0 8px', fontWeight: 600
                      }}>
                        Meta
                      </div>
                      <pre style={preStyle}>{JSON.stringify(meta, null, 2)}</pre>
                    </>
                  )}
                </>
              ) : (
                <pre style={preStyle}>{JSON.stringify(data.endpoints?.information?.body, null, 2)}</pre>
              )}
            </Section>

            {/* === Autres endpoints === */}
            {Object.entries(data.endpoints || {})
              .filter(([k]) => k !== 'information')
              .map(([key, val]) => {
                const items = Array.isArray(val.body?.data) ? val.body.data : null
                const count = items?.length ?? null
                return (
                  <Section
                    key={key}
                    title={`📂 ${key}${count !== null ? ` (${count} entrée${count > 1 ? 's' : ''})` : ''}`}
                    status={val.status}
                  >
                    <pre style={preStyle}>{JSON.stringify(val.body, null, 2)}</pre>
                  </Section>
                )
              })}
          </>
        )}

        <style>{`
          .dbg-spin { animation: dbg-spin 1s linear infinite; }
          @keyframes dbg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </main>
    </div>
  )
}
