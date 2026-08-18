import React, { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import {
  ArrowLeft, LogOut, Loader2, Upload, FileText, Send,
  Briefcase, Building2, ExternalLink, Mail, Linkedin, Copy, X, Phone, User
} from 'lucide-react'

// ─── Composants utilitaires ────────────────────────────────
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
    }}>{score}</div>
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
function stateLabel(state) {
  const map = {
    '1': { label: 'En cours', color: '#b57a00', bg: 'rgba(255,170,0,0.12)' },
    '2': { label: 'Gagné', color: '#1d8b4f', bg: 'rgba(40,180,99,0.12)' },
    '3': { label: 'Perdu', color: '#b71c1c', bg: 'rgba(220,50,50,0.10)' },
    '0': { label: 'Abandonné', color: '#666', bg: '#f0f0f5' }
  }
  return map[String(state)] || { label: `Statut ${state}`, color: '#555', bg: '#f0f0f5' }
}
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
  color: '#555', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer'
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: '#1400FF', border: '1.5px solid #1400FF',
  borderRadius: 8, padding: '6px 10px',
  fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600,
  color: '#fff', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap'
}

// ─── Modal message push ────────────────────────────────
function PushModal({ open, onClose, profile, target, kind, opportunity }) {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    setMsg(null)
    fetch('/api/push-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, target, kind, opportunity })
    })
      .then(r => r.json())
      .then(j => {
        if (j.error) toast.error(j.error)
        else setMsg(j)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [open, target?.id])

  if (!open) return null

  const copy = (txt) => {
    navigator.clipboard.writeText(txt)
    toast.success('Copié')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 16
        }}>
          <div>
            <div style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#111'
            }}>
              Push vers {target?.name || target?.company || '?'}
            </div>
            {target?.contact && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                À : {target.contact.firstName} {target.contact.lastName}
                {target.contact.function && ` — ${target.contact.function}`}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4
          }}>
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <Loader2 size={20} className="mtch-spin" style={{ color: '#1400FF', marginBottom: 8 }} />
            <div>Rédaction en cours…</div>
          </div>
        )}

        {msg && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* EMAIL */}
            <div style={{
              border: '1.5px solid #e8e8f0', borderRadius: 12, padding: 14
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                color: '#1400FF', textTransform: 'uppercase'
              }}>
                <Mail size={13} /> Email
              </div>
              <div style={{
                fontSize: 12, color: '#666', marginBottom: 4,
                fontFamily: 'Montserrat, sans-serif', fontWeight: 600
              }}>
                Objet
              </div>
              <div style={{
                background: '#fafafa', padding: '8px 10px', borderRadius: 6,
                fontSize: 13, color: '#111', marginBottom: 10
              }}>
                {msg.email?.subject}
              </div>
              <textarea
                value={msg.email?.body || ''}
                onChange={e => setMsg({ ...msg, email: { ...msg.email, body: e.target.value } })}
                style={{
                  width: '100%', minHeight: 260,
                  border: '1px solid #e0e0f0', borderRadius: 6, padding: 10,
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                  resize: 'vertical', outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => copy(`Objet: ${msg.email?.subject}\n\n${msg.email?.body}`)} style={miniLink}>
                  <Copy size={12} /> Copier
                </button>
                {target?.contact?.email && (
                  <a
                    href={`mailto:${target.contact.email}?subject=${encodeURIComponent(msg.email?.subject || '')}&body=${encodeURIComponent(msg.email?.body || '')}`}
                    style={btnPrimary}
                  >
                    <Send size={11} /> Ouvrir mail
                  </a>
                )}
              </div>
            </div>

            {/* LINKEDIN */}
            <div style={{
              border: '1.5px solid #e8e8f0', borderRadius: 12, padding: 14
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                color: '#0077b5', textTransform: 'uppercase'
              }}>
                <Linkedin size={13} /> LinkedIn
              </div>
              <textarea
                value={msg.linkedin || ''}
                onChange={e => setMsg({ ...msg, linkedin: e.target.value })}
                style={{
                  width: '100%', minHeight: 300,
                  border: '1px solid #e0e0f0', borderRadius: 6, padding: 10,
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                  resize: 'vertical', outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => copy(msg.linkedin)} style={miniLink}>
                  <Copy size={12} /> Copier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Carte piste ────────────────────────────────
function LeadCard({ item, kind, onPush }) {
  const st = kind === 'opportunity' ? stateLabel(item.state) : null
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
      padding: 14, display: 'flex', alignItems: 'flex-start', gap: 14
    }}>
      <ScoreBadge score={item.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#111'
          }}>
            {kind === 'opportunity'
              ? (item.title || item.reference || `Opportunité #${item.id}`)
              : (item.name || `Compte #${item.id}`)
            }
          </span>
          {st && <StatusPill {...st} />}
        </div>
        {kind === 'opportunity' && item.company && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>🏢 {item.company}</div>
        )}
        {kind === 'company' && (item.activityArea || item.town) && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
            {item.activityArea}{item.activityArea && item.town && ' · '}{item.town}
          </div>
        )}
        {item.reason && (
          <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 6 }}>
            {item.reason}
          </div>
        )}
        {item.contact && (
          <div style={{
            background: 'rgba(20,0,255,0.04)', padding: '8px 10px', borderRadius: 8,
            fontSize: 12, color: '#333', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={11} /> <strong>{item.contact.firstName} {item.contact.lastName}</strong>
              {item.contact.function && <span style={{ color: '#666' }}> — {item.contact.function}</span>}
            </span>
            {item.contact.email && (
              <a href={`mailto:${item.contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1400FF', textDecoration: 'none' }}>
                <Mail size={11} /> {item.contact.email}
              </a>
            )}
            {item.contact.phone && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666' }}>
                <Phone size={11} /> {item.contact.phone}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <a href={item.boondUrl} target="_blank" rel="noopener noreferrer" style={miniLink}>
          <ExternalLink size={11} /> Boond
        </a>
        <button onClick={() => onPush(item)} style={btnPrimary}>
          <Send size={11} /> Push
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ────────────────────────────────
export default function PushPage() {
  const { user, logout } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [modal, setModal] = useState({ open: false, target: null, kind: null, opportunity: null })

  const onDrop = useCallback((accepted) => {
    if (!accepted?.length) return
    setFile(accepted[0])
    setData(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 15 * 1024 * 1024,
    multiple: false
  })

  const analyze = async () => {
    if (!file) return toast.error('Uploade un PDF d\'abord')
    setLoading(true)
    setData(null)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const r = await fetch('/api/boond-push-leads', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) {
        toast.error(j.error || 'Erreur')
        return
      }
      setData(j)
      if (j.warning) toast(j.warning, { icon: '⚠️' })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const openPush = (item, kind) => {
    setModal({
      open: true,
      target: kind === 'opportunity'
        ? { ...item, name: item.company, contact: null }
        : item,
      kind,
      opportunity: kind === 'opportunity' ? item : null
    })
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
              <Send size={14} /> Push Dossier
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link to="/app" style={linkStyle}>
              <ArrowLeft size={13} /> Dossier Generator
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
            Push dossier → pistes clients
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Uploade le dossier de compétences d'un consultant. On scanne Boond (opportunités + comptes) et on te propose où pusher.
          </p>
        </div>

        {/* Dropzone */}
        <div {...getRootProps()} style={{
          background: '#fff', border: `2px dashed ${isDragActive ? '#1400FF' : '#d0d0e0'}`,
          borderRadius: 14, padding: 40, marginBottom: 16, textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.15s'
        }}>
          <input {...getInputProps()} />
          <Upload size={32} style={{ color: '#1400FF', marginBottom: 10 }} />
          <div style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 15, color: '#111'
          }}>
            {file ? file.name : (isDragActive ? 'Lâche ici' : 'Glisse le dossier PDF ou clique pour choisir')}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            PDF uniquement, max 15 MB
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <button
            onClick={analyze}
            disabled={!file || loading}
            style={{
              background: (!file || loading) ? '#999' : '#1400FF', color: '#fff',
              border: 'none', borderRadius: 10, padding: '12px 28px',
              fontFamily: 'Montserrat, sans-serif', fontSize: 14, fontWeight: 600,
              cursor: (!file || loading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {loading ? <><Loader2 size={14} className="mtch-spin" /> Analyse Boond…</> : <><FileText size={14} /> Trouver les pistes</>}
          </button>
        </div>

        {loading && (
          <div style={{
            background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
            padding: 32, textAlign: 'center', color: '#888', fontSize: 13
          }}>
            <div>Lecture PDF → extraction profil → scan opportunités & comptes → scoring IA → contacts référents…</div>
            <div style={{ fontSize: 11, marginTop: 6, color: '#aaa' }}>~1-2 min selon la volumétrie</div>
          </div>
        )}

        {data && (
          <>
            {/* Profil extrait */}
            <div style={{
              background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
              padding: 18, marginBottom: 20
            }}>
              <div style={{
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#111'
              }}>
                {data.profile?.firstName} {data.profile?.lastName}
              </div>
              {data.profile?.role && (
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{data.profile.role}</div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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
                Keywords scannés : <code>{(data.counts?.keywordsUsed || []).join(', ')}</code> · {data.counts?.opportunitiesScanned} opps + {data.counts?.companiesScanned} comptes scannés
              </div>
            </div>

            {/* Opportunités ouvertes */}
            <SectionHeader icon={<Briefcase size={16} />} title={`🎯 Opportunités OUVERTES à pusher (${data.opportunitiesOpen?.length || 0})`} />
            {data.opportunitiesOpen?.length === 0 ? (
              <EmptyBlock text="Aucune opportunité en cours ne matche." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.opportunitiesOpen.map(o => (
                  <LeadCard key={o.id} item={o} kind="opportunity" onPush={i => openPush(i, 'opportunity')} />
                ))}
              </div>
            )}

            {/* Opportunités fermées à re-pitcher */}
            <SectionHeader icon={<Briefcase size={16} />} title={`🔄 Opportunités PASSÉES à re-pitcher (${data.opportunitiesClosed?.length || 0})`} />
            {data.opportunitiesClosed?.length === 0 ? (
              <EmptyBlock text="Aucune opportunité passée pertinente." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.opportunitiesClosed.map(o => (
                  <LeadCard key={o.id} item={o} kind="opportunity" onPush={i => openPush(i, 'opportunity')} />
                ))}
              </div>
            )}

            {/* Comptes proactifs */}
            <SectionHeader icon={<Building2 size={16} />} title={`🏢 Comptes clients à approcher en proactif (${data.companies?.length || 0})`} />
            {data.companies?.length === 0 ? (
              <EmptyBlock text="Aucun compte pertinent." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {data.companies.map(c => (
                  <LeadCard key={c.id} item={c} kind="company" onPush={i => openPush(i, 'company')} />
                ))}
              </div>
            )}
          </>
        )}

        <PushModal
          open={modal.open}
          onClose={() => setModal({ open: false, target: null, kind: null, opportunity: null })}
          profile={data?.profile}
          target={modal.target}
          kind={modal.kind}
          opportunity={modal.opportunity}
        />

        <style>{`
          .mtch-spin { animation: mtch-spin 1s linear infinite; }
          @keyframes mtch-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </main>
    </div>
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
