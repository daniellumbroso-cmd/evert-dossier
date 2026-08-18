import React, { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import {
  ArrowLeft, LogOut, Loader2, Upload, FileText, Send,
  ExternalLink, Mail, Linkedin, Copy, X, Phone, User, Search,
  Briefcase, MessageSquare, ChevronDown, Zap, Building2, MapPin
} from 'lucide-react'

// ─── Utils ────
function ScoreBadge({ score }) {
  if (score == null) return null
  const color = score >= 80 ? '#1400FF' : score >= 60 ? '#5b3df5' : score >= 45 ? '#7c6ff0' : '#999'
  const bg = score >= 80 ? 'rgba(20,0,255,0.10)' : score >= 60 ? 'rgba(91,61,245,0.10)' : score >= 45 ? 'rgba(124,111,240,0.08)' : '#f0f0f5'
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

function StatusPill({ status, label, missions }) {
  const conf = {
    active_client: { color: '#1d8b4f', bg: 'rgba(40,180,99,0.12)', icon: '🟢' },
    past_client: { color: '#1e5db3', bg: 'rgba(30,93,179,0.12)', icon: '🔵' },
    prospect: { color: '#b57a00', bg: 'rgba(255,170,0,0.12)', icon: '🟠' },
    unknown: { color: '#888', bg: '#f0f0f5', icon: '⚪' }
  }[status] || { color: '#555', bg: '#f0f0f5', icon: '' }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
      padding: '4px 10px', borderRadius: 12,
      color: conf.color, background: conf.bg,
      textTransform: 'uppercase', letterSpacing: '0.03em'
    }}>
      {conf.icon} {label}
      {missions && (missions.active > 0 || missions.past > 0) && (
        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>
          ({missions.active > 0 && `${missions.active} en cours`}{missions.active > 0 && missions.past > 0 && ' · '}{missions.past > 0 && `${missions.past} passée${missions.past > 1 ? 's' : ''}`})
        </span>
      )}
    </span>
  )
}

function SourcePill({ sourceType, kind }) {
  const map = {
    'opportunity': { icon: <Briefcase size={10} />, color: '#b57a00', bg: 'rgba(255,170,0,0.12)' },
    'contact': { icon: <User size={10} />, color: '#5b3df5', bg: 'rgba(91,61,245,0.10)' },
    'action_note': { icon: <MessageSquare size={10} />, color: '#1d8b4f', bg: 'rgba(40,180,99,0.10)' }
  }
  const conf = map[kind] || { icon: null, color: '#555', bg: '#f0f0f5' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontFamily: 'Montserrat, sans-serif', fontWeight: 600,
      padding: '3px 8px', borderRadius: 10,
      color: conf.color, background: conf.bg, textTransform: 'uppercase', letterSpacing: '0.03em'
    }}>{conf.icon} {sourceType}</span>
  )
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

// ─── Modal Push ────
function PushModal({ open, onClose, profile, lead }) {
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  React.useEffect(() => {
    if (!open || !lead) return
    setLoading(true); setMsg(null)
    const target = {
      id: lead.id, name: lead.company, company: lead.company,
      activityArea: lead.companyActivity || '', reason: lead.reason, contact: lead.contact
    }
    const opportunity = lead.kind === 'opportunity'
      ? { title: lead.title, reference: lead.reference, stateLabel: lead.stateLabel, state: lead.state }
      : null
    fetch('/api/push-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, target, kind: lead.kind, opportunity })
    })
      .then(r => r.json())
      .then(j => { if (j.error) toast.error(j.error); else setMsg(j) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [open, lead?.id])

  if (!open) return null
  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success('Copié') }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
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
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#111' }}>
              Push vers {lead?.company || '?'}
            </div>
            {lead?.contact && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                À : {lead.contact.firstName} {lead.contact.lastName}
                {lead.contact.function && ` — ${lead.contact.function}`}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <Loader2 size={20} className="pp-spin" style={{ color: '#1400FF', marginBottom: 8 }} />
            <div>Rédaction en cours…</div>
          </div>
        )}

        {msg && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ border: '1.5px solid #e8e8f0', borderRadius: 12, padding: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                color: '#1400FF', textTransform: 'uppercase'
              }}><Mail size={13} /> Email</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>Objet</div>
              <div style={{ background: '#fafafa', padding: '8px 10px', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
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
                {lead?.contact?.email && (
                  <a href={`mailto:${lead.contact.email}?subject=${encodeURIComponent(msg.email?.subject || '')}&body=${encodeURIComponent(msg.email?.body || '')}`} style={btnPrimary}>
                    <Send size={11} /> Ouvrir mail
                  </a>
                )}
              </div>
            </div>

            <div style={{ border: '1.5px solid #e8e8f0', borderRadius: 12, padding: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                color: '#0077b5', textTransform: 'uppercase'
              }}><Linkedin size={13} /> LinkedIn</div>
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

// ─── Carte piste ────
function LeadRow({ lead, onPush }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
      padding: 16, display: 'flex', alignItems: 'flex-start', gap: 14
    }}>
      <ScoreBadge score={lead.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Ligne 1 : Nom société GROS + statut compte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#111'
          }}>
            <Building2 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
            {lead.company || <span style={{ color: '#c00' }}>Société inconnue</span>}
          </span>
          <StatusPill status={lead.companyStatus} label={lead.companyStatusLabel} missions={lead.companyMissions} />
          <SourcePill sourceType={lead.sourceType} kind={lead.kind} />
        </div>

        {/* Ligne 2 : Secteur + ville */}
        {(lead.companyActivity || lead.companyTown) && (
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', gap: 12 }}>
            {lead.companyActivity && <span>{lead.companyActivity}</span>}
            {lead.companyTown && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={10} /> {lead.companyTown}
            </span>}
          </div>
        )}

        {/* Ligne 3 : Titre du besoin / poste */}
        <div style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#333',
          fontWeight: 500, marginBottom: 6
        }}>
          {lead.title}
          {lead.reference && <span style={{ color: '#888', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>· réf. {lead.reference}</span>}
          {lead.startDate && <span style={{ color: '#888', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>· démarrage {lead.startDate}</span>}
        </div>

        {/* Ligne 4 : Raison Claude */}
        {lead.reason && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>
            {lead.reason}
          </div>
        )}

        {/* Ligne 5 : Contact opérationnel */}
        {lead.contact && (lead.contact.firstName || lead.contact.email) && (
          <div style={{
            background: 'rgba(20,0,255,0.04)', padding: '8px 10px', borderRadius: 8,
            fontSize: 12, color: '#333', marginBottom: 6,
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={11} />
              <strong>{lead.contact.firstName} {lead.contact.lastName}</strong>
              {lead.contact.function && <span style={{ color: '#666' }}> — {lead.contact.function}</span>}
            </span>
            {lead.contact.email && (
              <a href={`mailto:${lead.contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1400FF', textDecoration: 'none' }}>
                <Mail size={11} /> {lead.contact.email}
              </a>
            )}
            {lead.contact.phone && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666' }}>
                <Phone size={11} /> {lead.contact.phone}
              </span>
            )}
            {lead.otherContactsCount > 0 && (
              <span style={{ color: '#888', fontStyle: 'italic', fontSize: 11 }}>
                (+{lead.otherContactsCount} autre{lead.otherContactsCount > 1 ? 's' : ''} dans ce compte)
              </span>
            )}
          </div>
        )}

        {/* Ligne 6 : Keywords matchés */}
        {lead.matchedOn?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 10, color: '#888', alignItems: 'center' }}>
            <Search size={10} />
            Matché sur : {lead.matchedOn.map(m => (
              <code key={m} style={{ background: '#f0f0f5', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10 }}>{m}</code>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <a href={lead.boondUrl} target="_blank" rel="noopener noreferrer" style={miniLink}>
          <ExternalLink size={11} /> Boond
        </a>
        <button onClick={() => onPush(lead)} style={btnPrimary}>
          <Send size={11} /> Push
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ────
export default function PushPage() {
  const { user, logout } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [deepLoading, setDeepLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [allLeads, setAllLeads] = useState([])   // stocké côté client
  const [counts, setCounts] = useState(null)
  const [displayCount, setDisplayCount] = useState(15)
  const [deepScanDone, setDeepScanDone] = useState(false)
  const [modal, setModal] = useState({ open: false, lead: null })

  const onDrop = useCallback((accepted) => {
    if (!accepted?.length) return
    setFile(accepted[0])
    setProfile(null); setAllLeads([]); setCounts(null); setDisplayCount(15); setDeepScanDone(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxSize: 15 * 1024 * 1024, multiple: false
  })

  const analyze = async () => {
    if (!file) return toast.error('Uploade un PDF d\'abord')
    setLoading(true)
    setProfile(null); setAllLeads([]); setCounts(null); setDisplayCount(15); setDeepScanDone(false)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const r = await fetch('/api/boond-push-leads', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'Erreur'); return }
      setProfile(j.profile)
      setAllLeads(j.leads || [])
      setCounts(j.counts)
      if (j.warning) toast(j.warning, { icon: '⚠️' })
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const runDeepScan = async () => {
    if (!profile) return
    setDeepLoading(true)
    try {
      const r = await fetch('/api/boond-push-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, action: 'deep_scan' })
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error || 'Erreur'); return }
      // Fusionne : dédoublonne par id, retrie par (status, score)
      const existingIds = new Set(allLeads.map(l => l.id))
      const merged = [...allLeads, ...(j.additionalLeads || []).filter(l => !existingIds.has(l.id))]
      const STATUS_ORDER = { active_client: 0, past_client: 1, prospect: 2, unknown: 3 }
      merged.sort((a, b) => {
        const sa = STATUS_ORDER[a.companyStatus] ?? 3
        const sb = STATUS_ORDER[b.companyStatus] ?? 3
        if (sa !== sb) return sa - sb
        return (b.score ?? -1) - (a.score ?? -1)
      })
      setAllLeads(merged)
      setDeepScanDone(true)
      toast.success(`Scan profond : +${j.count || 0} pistes ajoutées`)
    } catch (e) { toast.error(e.message) }
    finally { setDeepLoading(false) }
  }

  const displayedLeads = useMemo(() => allLeads.slice(0, displayCount), [allLeads, displayCount])
  const hasMore = displayCount < allLeads.length

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
            <Link to="/app" style={linkStyle}><ArrowLeft size={13} /> Dossier Generator</Link>
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
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 26, fontWeight: 700, color: '#111', margin: '0 0 6px 0' }}>
            Push dossier → pistes clients
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Uploade le dossier PDF. On scanne besoins Boond + contacts, on identifie le compte (client actif / ancien / prospect) et on sort les pistes ordonnées.
          </p>
        </div>

        <div {...getRootProps()} style={{
          background: '#fff', border: `2px dashed ${isDragActive ? '#1400FF' : '#d0d0e0'}`,
          borderRadius: 14, padding: 40, marginBottom: 16, textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.15s'
        }}>
          <input {...getInputProps()} />
          <Upload size={32} style={{ color: '#1400FF', marginBottom: 10 }} />
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 15, color: '#111' }}>
            {file ? file.name : (isDragActive ? 'Lâche ici' : 'Glisse le dossier PDF ou clique pour choisir')}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>PDF uniquement, max 15 MB</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <button onClick={analyze} disabled={!file || loading} style={{
            background: (!file || loading) ? '#999' : '#1400FF', color: '#fff',
            border: 'none', borderRadius: 10, padding: '12px 28px',
            fontFamily: 'Montserrat, sans-serif', fontSize: 14, fontWeight: 600,
            cursor: (!file || loading) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            {loading ? <><Loader2 size={14} className="pp-spin" /> Analyse Boond… (~1-2 min)</> : <><FileText size={14} /> Trouver les pistes</>}
          </button>
        </div>

        {loading && (
          <div style={{
            background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
            padding: 32, textAlign: 'center', color: '#888', fontSize: 13
          }}>
            <div>Extraction profil → recherche besoins/contacts → enrichissement société + statut → scoring IA…</div>
            <div style={{ fontSize: 11, marginTop: 6, color: '#aaa' }}>~1-2 min (beaucoup d'appels Boond en parallèle)</div>
          </div>
        )}

        {profile && (
          <>
            {/* Profil */}
            <div style={{
              background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
              padding: 18, marginBottom: 20
            }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#111' }}>
                {profile.firstName} {profile.lastName}
              </div>
              {profile.role && (
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{profile.role}</div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {(profile.stack_primary || []).map(k => (
                  <span key={k} style={{
                    fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                    padding: '3px 10px', borderRadius: 10,
                    background: '#1400FF', color: '#fff'
                  }}>{k}</span>
                ))}
                {(profile.stack_secondary || []).map(k => (
                  <span key={k} style={{
                    fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 500,
                    padding: '3px 9px', borderRadius: 10,
                    background: 'rgba(20,0,255,0.08)', color: '#1400FF'
                  }}>{k}</span>
                ))}
                {(profile.sectors || []).map(s => (
                  <span key={s} style={{
                    fontSize: 11, fontFamily: 'Montserrat, sans-serif', fontWeight: 500,
                    padding: '3px 9px', borderRadius: 10,
                    background: '#f0f0f5', color: '#555'
                  }}>{s}</span>
                ))}
              </div>
              {profile.summary && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 10, fontStyle: 'italic' }}>
                  {profile.summary}
                </div>
              )}
              <div style={{
                fontSize: 11, color: '#888', marginTop: 12,
                borderTop: '1px solid #f0f0f5', paddingTop: 10,
                display: 'flex', flexWrap: 'wrap', gap: 12
              }}>
                <span>🎯 <strong>{allLeads.length}</strong> pistes retenues</span>
                {counts?.byStatus && (
                  <>
                    <span>🟢 {counts.byStatus.active_client} clients actifs</span>
                    <span>🔵 {counts.byStatus.past_client} anciens clients</span>
                    <span>🟠 {counts.byStatus.prospect} prospects</span>
                    <span>⚪ {counts.byStatus.unknown} inconnus</span>
                  </>
                )}
              </div>
            </div>

            {/* Bouton scan profond */}
            {!deepScanDone && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <button onClick={runDeepScan} disabled={deepLoading} style={{
                  background: '#fff', color: '#1400FF',
                  border: '1.5px solid #1400FF', borderRadius: 10,
                  padding: '10px 20px', cursor: deepLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8
                }}>
                  {deepLoading
                    ? <><Loader2 size={14} className="pp-spin" /> Lecture des notes/actions des contacts… (~2 min)</>
                    : <><Zap size={14} /> Scanner en profondeur (notes/actions des contacts)</>
                  }
                </button>
              </div>
            )}

            {/* Liste */}
            {allLeads.length === 0 ? (
              <div style={{
                background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
                padding: 32, textAlign: 'center', color: '#888', fontSize: 13
              }}>Aucune piste avec score ≥ 30.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {displayedLeads.map(l => <LeadRow key={l.id} lead={l} onPush={lead => setModal({ open: true, lead })} />)}
              </div>
            )}

            {/* Bouton +15 */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <button onClick={() => setDisplayCount(displayCount + 15)} style={{
                  background: '#fff', color: '#1400FF',
                  border: '1.5px solid #1400FF', borderRadius: 10,
                  padding: '10px 24px', cursor: 'pointer',
                  fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8
                }}>
                  <ChevronDown size={14} /> 15 pistes suivantes ({displayedLeads.length}/{allLeads.length})
                </button>
              </div>
            )}
            {!hasMore && allLeads.length > 0 && (
              <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginBottom: 20 }}>
                Fin de la liste — {allLeads.length} pistes au total
              </div>
            )}
          </>
        )}

        <PushModal
          open={modal.open}
          onClose={() => setModal({ open: false, lead: null })}
          profile={profile}
          lead={modal.lead}
        />

        <style>{`
          .pp-spin { animation: pp-spin 1s linear infinite; }
          @keyframes pp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </main>
    </div>
  )
}
