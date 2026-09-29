import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, ShieldCheck, PenLine, Download, Mail, FileText, RefreshCw, ExternalLink } from 'lucide-react'
import { FIELDS, detectColumns, readProspectFile, toProspects, exportCampaign } from '../lib/spreadsheet'
import { extractPdfText, MIN_USABLE_TEXT } from '../lib/pdfText'

// Le consultant vient d'un PDF de dossier déjà produit, ou du générateur
// (bouton « Campagne push ») qui dépose le dossier structuré ici.
import { CAMPAIGN_STORAGE_KEY } from '../lib/campaign'

const BLUE = '#1400FF'
const font = 'Montserrat, sans-serif'
const CHECK_CHUNK = 8
const WRITE_CHUNK = 5
const DRAFT_CHUNK = 5
const PDF_CHUNK = 2 * 1024 * 1024   // multiple de 256 Ko, exigé par Drive ; loin de la limite Vercel de 4,5 Mo

const VERDICTS = {
  client_actif: { label: 'Client actif', color: '#c62828', bg: '#fdecec', keep: false },
  deja_contacte: { label: 'Déjà contacté', color: '#b26a00', bg: '#fff4e0', keep: false },
  ancien_client: { label: 'Ancien client', color: '#b26a00', bg: '#fff4e0', keep: true },
  prospect: { label: 'Prospect connu', color: '#1b7a3d', bg: '#e8f6ee', keep: true },
  nouveau: { label: 'Nouveau', color: BLUE, bg: '#eeeeff', keep: true }
}
// Adéquation entre le profil poussé et le prospect, estimée à la rédaction.
const FIT = {
  forte: { label: 'Adéquation forte', color: '#1b7a3d', bg: '#e8f6ee' },
  moyenne: { label: 'Adéquation moyenne', color: '#b26a00', bg: '#fff4e0' },
  faible: { label: 'Adéquation faible', color: '#c62828', bg: '#fdecec' }
}
const STATUS = { active_client: 'Client actif', past_client: 'Ancien client', prospect: 'Prospect', unknown: '—' }

function loadDossier() {
  try { return JSON.parse(sessionStorage.getItem(CAMPAIGN_STORAGE_KEY) || 'null') } catch { return null }
}

function profilFromDossier(d) {
  if (!d) return { prenom: '', nom: '', metier: '', expertise: '' }
  const prenom = d.prenom || String(d.nom || '').split(' ')[0]
  // « nom » contient souvent prénom et nom : on retire le prénom, où qu'il soit
  const nom = String(d.nom || '').split(/\s+/).filter(w => w && w.toLowerCase() !== prenom.toLowerCase()).join(' ')
  return { prenom, nom, metier: d.metier || d.titre || '', expertise: d.titre_court || d.metier || '' }
}

const cleanName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
// Nom de la pièce jointe, au format que la synchro Gmail → Boond sait relire.
const pdfName = (p) => `Dossier ${cleanName(p.expertise || p.metier)} — ${cleanName(`${p.prenom} ${p.nom}`)}.pdf`

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Zone de fichier : clic pour parcourir, ou glisser-déposer.
function DropZone({ accept, onFile, icon, children }) {
  const [over, setOver] = useState(false)
  return (
    <label
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]) }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '1.3rem',
        border: `2px dashed ${BLUE}`, borderRadius: 12, cursor: 'pointer', color: BLUE, fontSize: 13, fontWeight: 600,
        background: over ? '#e4e2ff' : '#f7f7ff', transition: 'background .15s'
      }}>
      {icon}
      {children}
      <input type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
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
  const [profil, setProfil] = useState(() => profilFromDossier(loadDossier()))
  const [pdf, setPdf] = useState(null)            // { file, text, fileId }
  const [readingPdf, setReadingPdf] = useState(false)
  const [file, setFile] = useState(null)
  const [sheet, setSheet] = useState(null)        // { headers, data }
  const [mapping, setMapping] = useState({})
  const [rows, setRows] = useState([])            // prospects enrichis
  const [busy, setBusy] = useState(null)          // { label, done, total }
  const [openMail, setOpenMail] = useState(null)

  const selected = rows.filter(r => r.selected)
  const checked = rows.length > 0 && rows.every(r => r.check)
  const consultantReady = !!(dossier || pdf?.text) && !!profil.prenom && !!profil.metier
  const draftable = selected.filter(r => r.mail && r.email && !r.draft?.id)

  const onPdf = async (f) => {
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) return toast.error('Le dossier doit être un PDF')
    setReadingPdf(true)
    try {
      const text = await extractPdfText(f)
      if (!dossier && text.length < MIN_USABLE_TEXT) throw new Error('PDF sans texte lisible (image scannée ?)')
      setPdf({ file: f, text, fileId: null })
      if (!dossier) {
        const { profil: p } = await postCampaign({ action: 'profile', dossierText: text, fileName: f.name })
        setProfil(p)
      }
    } catch (e) {
      toast.error('Dossier illisible : ' + e.message)
    } finally {
      setReadingPdf(false)
    }
  }

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
        const source = dossier
          ? { dossier: { ...dossier, prenom: profil.prenom || dossier.prenom, metier: profil.metier || dossier.metier } }
          : { dossierText: pdf.text, profil }
        const { emails } = await postCampaign({ action: 'write', rows: chunk, ...source })
        for (const m of emails) {
          const r = byId.get(m.id)
          if (!r) continue
          if (m.corps) r.mail = { objet: m.objet, corps: m.corps, adequation: m.adequation, raison: m.raison }
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

  // Le PDF part une fois sur le Drive du bizdev (par morceaux), puis chaque
  // brouillon Gmail le reprend en pièce jointe.
  const uploadPdf = async () => {
    if (pdf.fileId) return pdf.fileId
    const file = pdf.file
    const { uploadUrl } = await postCampaign({ action: 'pdf-start', name: pdfName(profil), size: file.size })
    let fileId = null
    for (let offset = 0; offset < file.size; offset += PDF_CHUNK) {
      const data = await blobToBase64(file.slice(offset, offset + PDF_CHUNK))
      const r = await postCampaign({ action: 'pdf-chunk', uploadUrl, offset, total: file.size, data })
      if (r.done) fileId = r.fileId
    }
    if (!fileId) throw new Error('Envoi du PDF inachevé')
    setPdf(p => ({ ...p, fileId }))
    return fileId
  }

  const runDrafts = async () => {
    const targets = draftable
    setBusy({ label: 'Envoi du dossier PDF sur votre Drive', done: 0, total: targets.length })
    const byId = new Map(rows.map(r => [r.id, { ...r }]))
    let failed = 0
    try {
      const pdfFileId = await uploadPdf()
      setBusy({ label: 'Création des brouillons Gmail', done: 0, total: targets.length })
      const consultant = { nomComplet: `${profil.prenom} ${profil.nom}`.trim(), expertise: profil.expertise || profil.metier }
      for (let i = 0; i < targets.length; i += DRAFT_CHUNK) {
        const chunk = targets.slice(i, i + DRAFT_CHUNK).map(r => ({
          id: r.id, email: r.email, objet: r.mail.objet, corps: r.mail.corps,
          prenom: r.prenom, nom: r.nom, poste: r.poste,
          entreprise: r.check?.company?.name || r.entreprise,
          entrepriseDeduite: !r.entreprise && r.check?.company?.how !== 'contact',
          boondCompanyId: r.check?.company?.id || null, boondContactId: r.check?.contact?.id || null
        }))
        const { results } = await postCampaign({ action: 'drafts', pdfFileId, rows: chunk, consultant })
        for (const res of results) {
          const r = byId.get(res.id)
          if (!r) continue
          r.draft = res.draftId ? { id: res.draftId } : { error: res.error }
          if (!res.draftId) failed++
        }
        setRows([...byId.values()])
        setBusy(b => ({ ...b, done: Math.min(b.total, i + chunk.length) }))
      }
      if (failed) toast.error(`${failed} brouillon(s) non créé(s) : voir la colonne Mail`)
      else toast.success('Brouillons créés dans Gmail')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id) => setRows(rs => rs.map(r => r.id === id ? { ...r, selected: !r.selected } : r))
  const editMail = (id, field, value) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, mail: { ...r.mail, [field]: value } } : r))

  const onExport = async () => {
    const who = profil.prenom ? pdfName(profil).replace(/^Dossier /, '').replace(/\.pdf$/, '') : 'campagne'
    try { await exportCampaign(rows, `Campagne push — ${who}.xlsx`) }
    catch (e) { toast.error('Export impossible : ' + e.message) }
  }

  const missing = FIELDS.filter(f => ['prenom', 'nom', 'email'].includes(f.key) && mapping[f.key] == null)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: font }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #ececf4', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <Link to="/app" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}>← Générateur</Link>
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Campagne push</span>
        <Link to="/synchro" style={{ color: BLUE, textDecoration: 'none', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Synchroniser mes envois avec Boond
        </Link>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {/* 1. Le consultant */}
        <section style={card}>
          <h2 style={h2}>1. Le consultant poussé</h2>
          <DropZone accept=".pdf" onFile={onPdf} icon={<FileText size={16} />}>
            {readingPdf ? 'Lecture du dossier…'
              : pdf ? `${pdf.file.name} — joint aux mails`
                : 'Glisser ici le PDF du dossier de compétences, ou cliquer pour le choisir (il sera joint aux mails)'}
          </DropZone>
          {dossier && (
            <p style={{ fontSize: 12, color: '#555', margin: '8px 0 0' }}>
              Dossier repris du générateur : les mails s'appuient dessus. Déposez aussi son PDF pour la pièce jointe.
            </p>
          )}
          {(dossier || pdf) && !readingPdf && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: '0.9rem' }}>
              {[['prenom', 'Prénom'], ['nom', 'Nom'], ['metier', 'Intitulé (objet du mail)'], ['expertise', 'Expertise (note Boond)']].map(([k, label]) => (
                <label key={k} style={{ fontSize: 12, color: '#555' }}>
                  {label}
                  <input value={profil[k] || ''} onChange={e => setProfil(p => ({ ...p, [k]: e.target.value }))}
                    style={{ width: '100%', marginTop: 3, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #e0e0e0', fontFamily: font, fontSize: 12, boxSizing: 'border-box' }} />
                </label>
              ))}
            </div>
          )}
        </section>

        {/* 2. La liste LinkedIn */}
        <section style={card}>
          <h2 style={h2}>2. La liste de prospects</h2>
          <DropZone accept=".xlsx,.csv" onFile={onFile} icon={<Upload size={16} />}>
            {file ? `${file.name} — ${prospects.length} prospects` : 'Glisser ici l\'Excel issu de LinkedIn (.xlsx ou .csv), ou cliquer pour le choisir'}
          </DropZone>

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
              <button style={btn(true, !!busy || !checked || !selected.length || !consultantReady)}
                disabled={!!busy || !checked || !selected.length || !consultantReady} onClick={runWrite}>
                <PenLine size={14} /> Rédiger les mails ({selected.length})
              </button>
              <button style={btn(true, !!busy || !draftable.length || !pdf)}
                disabled={!!busy || !draftable.length || !pdf} onClick={runDrafts}
                title={!pdf ? 'Déposez le PDF du dossier (étape 1)' : ''}>
                <Mail size={14} /> Créer les brouillons Gmail ({draftable.length})
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
                            {r.draft && (
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: r.draft.id ? '#1b7a3d' : '#c62828' }}>
                                {r.draft.id ? '✓ Brouillon dans Gmail' : `Brouillon non créé : ${r.draft.error}`}
                              </div>
                            )}
                            {r.mail?.adequation && (() => {
                              const a = FIT[r.mail.adequation]
                              return (
                                <div style={{ marginTop: 4, fontSize: 11, color: '#666' }} title={r.mail.raison}>
                                  <span style={{ background: a.bg, color: a.color, borderRadius: 10, padding: '2px 8px', fontWeight: 600, marginRight: 6 }}>{a.label}</span>
                                  {r.mail.raison}
                                </div>
                              )
                            })()}
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
                              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                                Dans le brouillon Gmail : le texte entre ** ** passe en gras, les lignes qui commencent par « * » deviennent des puces, et votre signature Gmail est ajoutée à la fin.
                              </div>
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
              Sont décochés par défaut : les clients actifs, et les contacts touchés dans Boond ces 60 derniers jours. Les plages horaires proposées dans les mails (« en matinée », « à partir de 16h »…) sont prises dans vos disponibilités Google Agenda (6 prochains jours ouvrés) et varient d'un mail à l'autre. L'adéquation dit si le profil parle vraiment au prospect : sur une adéquation faible, mieux vaut ne pas envoyer.
              Rien n'est écrit dans Boond ici : une fois les mails envoyés depuis Gmail, lancez « Synchroniser mes envois avec Boond ».
              Tu peux recocher une ligne si tu sais pourquoi.
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
