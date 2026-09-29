import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, ShieldCheck, PenLine, Download, ExternalLink } from 'lucide-react'
import { FIELDS, detectColumns, readProspectFile, toProspects, exportCampaign } from '../lib/spreadsheet'
import { buildDossierFilename } from '../../api/filename-utils.js'

// Le dossier du consultant arrive depuis le générateur (bouton « Campagne push »).
import { CAMPAIGN_STORAGE_KEY } from '../lib/campaign'

const BLUE = '#1400FF'
const font = 'Montserrat, sans-serif'
const CHECK_CHUNK = 8
const WRITE_CHUNK = 5

const VERDICTS = {
  client_actif: { label: 'Client actif', color: '#c62828', bg: '#fdecec', keep: false },
  deja_contacte: { label: 'Déjà contacté', color: '#b26a00', bg: '#fff4e0', keep: false },
  ancien_client: { label: 'Ancien client', color: '#b26a00', bg: '#fff4e0', keep: true },
  prospect: { label: 'Prospect connu', color: '#1b7a3d', bg: '#e8f6ee', keep: true },
  nouveau: { label: 'Nouveau', color: BLUE, bg: '#eeeeff', keep: true }
}
const STATUS = { active_client: 'Client actif', past_client: 'Ancien client', prospect: 'Prospect', unknown: '—' }

function loadDossier() {
  try { return JSON.parse(sessionStorage.getItem(CAMPAIGN_STORAGE_KEY) || 'null') } catch { return null }
}

async function postCampaign(body) {
  const r = await fetch('/api/campaign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  let json = null
  try { json = await r.json() } catch { /* réponse non JSON (délai Vercel) */ }
  if (!r.ok) throw new Error(json?.error || `Erreur serveur (${r.status})`)
  return json
}

const card = { background: '#fff', borderRadius: 16, padding: '1.5rem', border: '1px solid #ececf4', marginBottom: '1.25rem' }
const h2 = { fontFamily: font, fontSize: 15, fontWeight: 700, margin: '0 0 0.9rem', color: '#111' }
const btn = (primary, disabled) => ({
  padding: '9px 16px', borderRadius: 8, fontFamily: font, fontSize: 12, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  border: primary ? 'none' : `1.5px solid ${BLUE}`,
  background: disabled ? '#c8c8e8' : primary ? BLUE : 'transparent',
  color: primary || disabled ? '#fff' : BLUE
})

export default function CampaignPage() {
  const [dossier] = useState(loadDossier)
  const [file, setFile] = useState(null)
  const [sheet, setSheet] = useState(null)        // { headers, data }
  const [mapping, setMapping] = useState({})
  const [rows, setRows] = useState([])            // prospects enrichis
  const [busy, setBusy] = useState(null)          // { label, done, total }
  const [openMail, setOpenMail] = useState(null)

  const selected = rows.filter(r => r.selected)
  const checked = rows.length > 0 && rows.every(r => r.check)

  const onFile = async (f) => {
    if (!f) return
    try {
      const s = await readProspectFile(f)
      if (!s.data.length) return toast.error('Le fichier ne contient aucune ligne')
      setFile(f); setSheet(s); setMapping(detectColumns(s.headers)); setRows([])
    } catch (e) {
      toast.error('Fichier illisible : ' + e.message)
    }
  }

  const prospects = useMemo(() => sheet ? toProspects(sheet.data, mapping) : [], [sheet, mapping])

  const runCheck = async () => {
    const base = prospects.map(p => ({ ...p, selected: false, check: null, mail: null }))
    setRows(base)
    setBusy({ label: 'Vérification dans Boond', done: 0, total: base.length })
    const byId = new Map(base.map(r => [r.id, r]))
    try {
      for (let i = 0; i < base.length; i += CHECK_CHUNK) {
        const chunk = base.slice(i, i + CHECK_CHUNK)
        const { results } = await postCampaign({ action: 'check', rows: chunk })
        for (const res of results) {
          const r = byId.get(res.id)
          if (!r) continue
          const v = VERDICTS[res.verdict] || VERDICTS.nouveau
          Object.assign(r, { check: res, selected: v.keep, verdictLabel: v.label, statusLabel: STATUS[res.status] || '—' })
        }
        setRows([...byId.values()])
        setBusy(b => ({ ...b, done: Math.min(b.total, i + chunk.length) }))
      }
      toast.success('Vérification terminée')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const runWrite = async () => {
    const targets = rows.filter(r => r.selected)
    setBusy({ label: 'Lecture de votre agenda', done: 0, total: targets.length })
    const byId = new Map(rows.map(r => [r.id, { ...r }]))
    let failed = 0
    try {
      // Trois créneaux libres par mail, qui tournent d'un prospect à l'autre.
      // Sans agenda lisible, les mails partent sans créneaux et demandent les disponibilités.
      let slots = null
      try {
        const res = await postCampaign({ action: 'slots', count: targets.length })
        slots = res.assignments
        if (!slots) toast(res.message || 'Agenda indisponible : mails rédigés sans créneaux', { icon: '📅', duration: 8000 })
      } catch (e) {
        toast(`Agenda indisponible (${e.message}) : mails rédigés sans créneaux`, { icon: '📅', duration: 8000 })
      }

      setBusy({ label: 'Rédaction des mails', done: 0, total: targets.length })
      for (let i = 0; i < targets.length; i += WRITE_CHUNK) {
        const chunk = targets.slice(i, i + WRITE_CHUNK).map((r, k) => ({
          id: r.id, prenom: r.prenom, nom: r.nom, poste: r.poste, technologies: r.technologies,
          profils: r.profils, entreprise: r.check?.company?.name || r.entreprise,
          creneaux: slots?.[i + k] || []
        }))
        const { emails } = await postCampaign({ action: 'write', rows: chunk, dossier })
        for (const m of emails) {
          const r = byId.get(m.id)
          if (!r) continue
          if (m.corps) r.mail = { objet: m.objet, corps: m.corps }
          else failed++
        }
        setRows([...byId.values()])
        setBusy(b => ({ ...b, done: Math.min(b.total, i + chunk.length) }))
      }
      if (failed) toast.error(`${failed} mail(s) non rédigé(s) : relancez la rédaction`)
      else toast.success('Mails rédigés')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const editMail = (id, field, value) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, mail: { ...r.mail, [field]: value } } : r))

  const onExport = async () => {
    const who = dossier ? buildDossierFilename(dossier).replace(/^Dossier /, '') : 'campagne'
    try { await exportCampaign(rows, `Campagne push — ${who}.xlsx`) }
    catch (e) { toast.error('Export impossible : ' + e.message) }
  }

  const missing = FIELDS.filter(f => ['prenom', 'nom', 'email'].includes(f.key) && mapping[f.key] == null)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #ececf4', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <Link to="/app" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}>← Générateur</Link>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Campagne push</span>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {/* 1. Le consultant */}
        <section style={card}>
          <h2 style={h2}>1. Le consultant poussé</h2>
          {dossier ? (
            <div style={{ fontSize: 13, color: '#333' }}>
              <strong>{dossier.prenom || String(dossier.nom || '').split(' ')[0]}</strong>
              {' — '}{dossier.metier || dossier.titre}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#b26a00' }}>
              Aucun dossier sélectionné. Génère d'abord le dossier du consultant, puis clique sur
              « Campagne push ». <Link to="/app" style={{ color: BLUE }}>Aller au générateur</Link>
            </div>
          )}
        </section>

        {/* 2. La liste LinkedIn */}
        <section style={card}>
          <h2 style={h2}>2. La liste de prospects</h2>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '1.4rem',
            border: `2px dashed ${BLUE}`, borderRadius: 12, cursor: 'pointer', color: BLUE, fontSize: 13, fontWeight: 600,
            background: '#f7f7ff'
          }}>
            <Upload size={16} />
            {file ? `${file.name} — ${prospects.length} prospects` : 'Déposer l\'Excel issu de LinkedIn (.xlsx ou .csv)'}
            <input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
          </label>

          {sheet && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Colonnes reconnues
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {FIELDS.map(f => (
                  <label key={f.key} style={{ fontSize: 12, color: '#555' }}>
                    {f.label}
                    <select
                      value={mapping[f.key] ?? ''}
                      onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      style={{ width: '100%', marginTop: 3, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12 }}
                    >
                      <option value="">— absente —</option>
                      {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {mapping.entreprise == null && (
                <p style={{ fontSize: 12, color: '#b26a00', margin: '10px 0 0' }}>
                  Pas de colonne « Entreprise » : l'entreprise sera déduite du domaine de l'email. Pense à la demander
                  à Claude lors du sourcing LinkedIn, la vérification Boond sera plus fiable.
                </p>
              )}
              {missing.length > 0 && (
                <p style={{ fontSize: 12, color: '#c62828', margin: '6px 0 0' }}>
                  Colonne(s) introuvable(s) : {missing.map(f => f.label).join(', ')}.
                </p>
              )}
              <div style={{ marginTop: '1rem' }}>
                <button style={btn(true, !!busy || !prospects.length)} disabled={!!busy || !prospects.length} onClick={runCheck}>
                  <ShieldCheck size={14} /> Vérifier dans Boond
                </button>
              </div>
            </div>
          )}
        </section>

        {busy && (
          <div style={{ ...card, padding: '1rem 1.5rem' }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{busy.label} — {busy.done}/{busy.total}</div>
            <div style={{ height: 6, background: '#eeeef8', borderRadius: 3 }}>
              <div style={{ height: 6, borderRadius: 3, background: BLUE, width: `${(busy.done / Math.max(1, busy.total)) * 100}%`, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {/* 3. Résultat */}
        {rows.length > 0 && (
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.9rem', flexWrap: 'wrap' }}>
              <h2 style={{ ...h2, margin: 0, flex: 1 }}>3. Prospects — {selected.length} retenus sur {rows.length}</h2>
              <button style={btn(true, !!busy || !checked || !selected.length || !dossier)}
                disabled={!!busy || !checked || !selected.length || !dossier} onClick={runWrite}>
                <PenLine size={14} /> Rédiger les mails ({selected.length})
              </button>
              <button style={btn(false, !!busy)} disabled={!!busy} onClick={onExport}>
                <Download size={14} /> Exporter en Excel
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: 8 }}></th>
                    <th style={{ padding: 8 }}>Prospect</th>
                    <th style={{ padding: 8 }}>Entreprise</th>
                    <th style={{ padding: 8 }}>Boond</th>
                    <th style={{ padding: 8 }}>Dernier contact</th>
                    <th style={{ padding: 8 }}>Mail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const v = r.check ? VERDICTS[r.check.verdict] : null
                    const la = r.check?.lastAction
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ borderTop: '1px solid #f0f0f5', opacity: r.selected ? 1 : 0.55, verticalAlign: 'top' }}>
                          <td style={{ padding: 8 }}>
                            <input type="checkbox" checked={r.selected} disabled={!r.check} onChange={() => toggle(r.id)} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <div style={{ fontWeight: 600 }}>{r.prenom} {r.nom}</div>
                            <div style={{ color: '#777' }}>{r.poste}</div>
                            <div style={{ color: '#999' }}>{r.email}</div>
                          </td>
                          <td style={{ padding: 8 }}>
                            {r.check?.company ? (
                              <a href={r.check.company.url} target="_blank" rel="noreferrer" style={{ color: '#333' }}>
                                {r.check.company.name} <ExternalLink size={10} />
                              </a>
                            ) : (r.entreprise || <span style={{ color: '#aaa' }}>—</span>)}
                            {r.check?.company?.how === 'domaine' && (
                              <div style={{ color: '#b26a00', fontSize: 11 }}>déduite de l'email, à vérifier</div>
                            )}
                          </td>
                          <td style={{ padding: 8 }}>
                            {v ? (
                              <span style={{ background: v.bg, color: v.color, borderRadius: 10, padding: '3px 9px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                                {v.label}
                              </span>
                            ) : <span style={{ color: '#aaa' }}>…</span>}
                            {r.check?.contact && (
                              <div style={{ marginTop: 4 }}>
                                <a href={r.check.contact.url} target="_blank" rel="noreferrer" style={{ color: BLUE, fontSize: 11 }}>
                                  fiche contact{r.check.contact.how === 'nom' ? ' (trouvée par le nom)' : ''}
                                </a>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 8, maxWidth: 260, color: '#555' }}>
                            {la ? (<>
                              <div style={{ fontWeight: 600 }}>{la.date.slice(0, 10)}{la.by ? ` — ${la.by}` : ''}</div>
                              <div style={{ color: '#888' }}>{la.text.slice(0, 110)}{la.text.length > 110 ? '…' : ''}</div>
                            </>) : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                          <td style={{ padding: 8, maxWidth: 280 }}>
                            {r.mail ? (
                              <button onClick={() => setOpenMail(openMail === r.id ? null : r.id)}
                                style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontFamily: font, fontSize: 12, textAlign: 'left', padding: 0 }}>
                                {r.mail.objet} {openMail === r.id ? '▲' : '▼'}
                              </button>
                            ) : <span style={{ color: '#aaa' }}>—</span>}
                          </td>
                        </tr>
                        {openMail === r.id && r.mail && (
                          <tr>
                            <td></td>
                            <td colSpan={5} style={{ padding: '0 8px 14px' }}>
                              <input value={r.mail.objet} onChange={e => editMail(r.id, 'objet', e.target.value)}
                                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12, fontWeight: 600, marginBottom: 6 }} />
                              <textarea value={r.mail.corps} onChange={e => editMail(r.id, 'corps', e.target.value)} rows={14}
                                style={{ width: '100%', padding: 10, borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12, lineHeight: 1.5 }} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: '#999', margin: '12px 0 0' }}>
              Sont décochés par défaut : les clients actifs, et les contacts touchés dans Boond ces 60 derniers jours. Les créneaux proposés dans les mails sont pris dans vos disponibilités Google Agenda (6 prochains jours ouvrés) et varient d'un mail à l'autre.
              Tu peux recocher une ligne si tu sais pourquoi.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
