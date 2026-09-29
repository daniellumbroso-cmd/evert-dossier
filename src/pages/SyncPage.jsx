import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { RefreshCw, Database } from 'lucide-react'

// Synchro Gmail → Boond : les mails envoyés à un contact ou un candidat connu
// deviennent des actions sur sa fiche ; les mails push à un prospect absent de
// Boond créent sa fiche, après relecture.

const BLUE = '#1400FF'
const font = 'Montserrat, sans-serif'
const WRITE_CHUNK = 10

const card = { background: '#fff', borderRadius: 16, padding: '1.5rem', border: '1px solid #ececf4', marginBottom: '1.25rem' }
const h2 = { fontFamily: font, fontSize: 15, fontWeight: 700, margin: '0 0 0.9rem', color: '#111' }
const btn = (disabled) => ({
  padding: '9px 16px', borderRadius: 8, fontFamily: font, fontSize: 12, fontWeight: 600, border: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? '#c8c8e8' : BLUE, color: '#fff'
})
const input = { width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 11, boxSizing: 'border-box' }
const badge = (color, bg) => ({ background: bg, color, borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' })

async function postSync(body) {
  const r = await fetch('/api/mail-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  let json = null
  try { json = await r.json() } catch { /* réponse non JSON (délai Vercel) */ }
  if (!r.ok) throw new Error(json?.error || `Erreur serveur (${r.status})`)
  return json
}

const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function SyncPage() {
  const [days, setDays] = useState(7)
  const [items, setItems] = useState([])
  const [scanned, setScanned] = useState(null)
  const [busy, setBusy] = useState(null)
  const [open, setOpen] = useState(null)

  const todo = items.filter(i => !i.already && !i.result?.ok)
  const selected = todo.filter(i => i.selected)

  const runScan = async () => {
    setItems([]); setScanned(0)
    setBusy({ label: 'Lecture de vos mails envoyés' })
    const all = []
    let pageToken = null, total = 0
    try {
      do {
        const r = await postSync({ action: 'scan', days, pageToken })
        total += r.scanned
        for (const it of r.items) {
          // Coché par défaut : ce qui manque dans Boond, sauf une société seulement devinée
          all.push({ ...it, selected: !it.already && !(it.create?.aConfirmer), confirmed: !!it.create && !it.create.aConfirmer })
        }
        setItems([...all]); setScanned(total)
        setBusy({ label: `Lecture de vos mails envoyés — ${total} mails lus` })
        pageToken = r.nextPageToken
      } while (pageToken)
      toast.success(`${total} mails lus`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const update = (key, patch) => setItems(list => list.map(i => i.key === key ? { ...i, ...patch } : i))
  const updateCreate = (key, field, value) =>
    setItems(list => list.map(i => i.key === key ? { ...i, create: { ...i.create, [field]: value, ...(field === 'entreprise' ? { companyId: null } : {}) } } : i))

  const runWrite = async () => {
    const targets = selected
    setBusy({ label: 'Écriture dans Boond', done: 0, total: targets.length })
    let failed = 0
    try {
      for (let i = 0; i < targets.length; i += WRITE_CHUNK) {
        const chunk = targets.slice(i, i + WRITE_CHUNK).map(({ result, selected, ...it }) => ({ ...it, confirmed: it.person ? true : it.selected }))
        const { results } = await postSync({ action: 'write', items: chunk })
        for (const res of results) {
          update(res.key, { result: res, selected: false })
          if (!res.ok) failed++
        }
        setBusy(b => ({ ...b, done: Math.min(b.total, i + chunk.length) }))
      }
      if (failed) toast.error(`${failed} écriture(s) refusée(s) par Boond : voir la colonne Statut`)
      else toast.success('Boond est à jour')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const status = (it) => {
    if (it.result?.ok) return <a href={it.result.url} target="_blank" rel="noreferrer" style={{ ...badge('#1b7a3d', '#e8f6ee'), textDecoration: 'none' }}>{it.result.skipped ? '✓ Déjà présent' : '✓ Ajouté'}</a>
    if (it.result && !it.result.ok) return <span style={{ color: '#c62828', fontSize: 11 }}>{it.result.error}</span>
    if (it.already) return <span style={badge('#666', '#f0f0f4')}>Déjà dans Boond</span>
    return <span style={badge('#b26a00', '#fff4e0')}>À ajouter</span>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #ececf4', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <Link to="/app" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}>← Générateur</Link>
        <Link to="/campagne" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}>Campagne push</Link>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Synchro Gmail → Boond</span>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        <section style={card}>
          <h2 style={h2}>Vos mails envoyés</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 1rem', lineHeight: 1.6 }}>
            Chaque mail envoyé à un contact ou à un candidat présent dans Boond devient une action sur sa fiche :
            une <strong>Note « push dossier »</strong> pour les mails push, une action <strong>Email</strong> (objet + texte) pour les autres.
            Un prospect poussé qui n'est pas encore dans Boond peut y être créé, société comprise.
            Les mails internes et les destinataires inconnus de Boond sont ignorés. Rien n'est écrit sans votre validation.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12 }}>
              {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>{d === 1 ? 'Dernières 24 h' : `${d} derniers jours`}</option>)}
            </select>
            <button style={btn(!!busy)} disabled={!!busy} onClick={runScan}>
              <RefreshCw size={14} /> Analyser mes mails envoyés
            </button>
            {scanned != null && !busy && (
              <span style={{ fontSize: 12, color: '#666' }}>
                {scanned} mails lus — {items.length} concernent Boond, dont {todo.length} à ajouter
              </span>
            )}
          </div>
        </section>

        {busy && (
          <div style={{ ...card, padding: '1rem 1.5rem' }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{busy.label}{busy.total ? ` — ${busy.done}/${busy.total}` : '…'}</div>
            {busy.total > 0 && (
              <div style={{ height: 6, background: '#eeeef8', borderRadius: 3 }}>
                <div style={{ height: 6, borderRadius: 3, background: BLUE, width: `${(busy.done / busy.total) * 100}%`, transition: 'width .3s' }} />
              </div>
            )}
          </div>
        )}

        {items.length > 0 && (
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.9rem' }}>
              <h2 style={{ ...h2, margin: 0, flex: 1 }}>{selected.length} action(s) à écrire</h2>
              <button style={btn(!!busy || !selected.length)} disabled={!!busy || !selected.length} onClick={runWrite}>
                <Database size={14} /> Écrire dans Boond ({selected.length})
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #ececf4' }}>
                    <th style={{ padding: 8 }}></th>
                    <th style={{ padding: 8 }}>Envoyé le</th>
                    <th style={{ padding: 8 }}>Destinataire</th>
                    <th style={{ padding: 8 }}>Mail</th>
                    <th style={{ padding: 8 }}>Fiche Boond</th>
                    <th style={{ padding: 8 }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const done = it.already || it.result?.ok
                    return (
                      <React.Fragment key={it.key}>
                        <tr style={{ borderBottom: '1px solid #f3f3f8', verticalAlign: 'top', opacity: done ? 0.55 : 1 }}>
                          <td style={{ padding: 8 }}>
                            <input type="checkbox" disabled={done} checked={!!it.selected} onChange={e => update(it.key, { selected: e.target.checked })} />
                          </td>
                          <td style={{ padding: 8, whiteSpace: 'nowrap', color: '#555' }}>{fmtDate(it.date)}</td>
                          <td style={{ padding: 8 }}>{it.email}</td>
                          <td style={{ padding: 8, maxWidth: 320 }}>
                            <span style={it.kind === 'push' ? badge(BLUE, '#eeeeff') : badge('#555', '#f0f0f4')}>{it.kind === 'push' ? 'Push dossier' : 'Mail'}</span>{' '}
                            <button onClick={() => setOpen(open === it.key ? null : it.key)}
                              style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontFamily: font, fontSize: 12, textAlign: 'left', padding: 0 }}>
                              {it.subject || '(sans objet)'} {open === it.key ? '▲' : '▼'}
                            </button>
                          </td>
                          <td style={{ padding: 8, minWidth: 220 }}>
                            {it.person ? (
                              <a href={it.person.url} target="_blank" rel="noreferrer" style={{ color: BLUE }}>
                                {it.person.name || it.email} ({it.person.kind === 'contact' ? 'contact' : 'candidat'})
                              </a>
                            ) : it.create && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#b26a00', marginBottom: 4 }}>
                                  Absent de Boond : contact à créer{it.create.source === 'journal' ? ' (infos de la campagne)' : ' (infos déduites de l\'email)'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                  <input style={input} placeholder="Prénom" value={it.create.prenom} onChange={e => updateCreate(it.key, 'prenom', e.target.value)} />
                                  <input style={input} placeholder="Nom" value={it.create.nom} onChange={e => updateCreate(it.key, 'nom', e.target.value)} />
                                  <input style={input} placeholder="Poste" value={it.create.poste} onChange={e => updateCreate(it.key, 'poste', e.target.value)} />
                                  <input style={input} placeholder={it.create.entrepriseADeviner ? `Société (${it.create.entrepriseADeviner} ?)` : 'Société'}
                                    value={it.create.entreprise} onChange={e => updateCreate(it.key, 'entreprise', e.target.value)} />
                                </div>
                                <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                                  {it.create.companyId ? 'Société trouvée dans Boond' : it.create.entreprise ? 'Société créée dans Boond' : 'Sans société'}
                                  {it.create.aConfirmer ? ' — vérifiez puis cochez la ligne pour confirmer' : ''}
                                </div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 8, maxWidth: 220 }}>{status(it)}</td>
                        </tr>
                        {open === it.key && (
                          <tr>
                            <td></td>
                            <td colSpan={5} style={{ padding: '0 8px 14px' }}>
                              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Texte de l'action Boond :</div>
                              <textarea value={it.text} disabled={done} onChange={e => update(it.key, { text: e.target.value })} rows={Math.min(14, it.text.split('\n').length + 1)}
                                style={{ width: '100%', padding: 10, borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12, lineHeight: 1.5, boxSizing: 'border-box' }} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
