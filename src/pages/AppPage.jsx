import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import DossierPreview from '../components/DossierPreview'
import { Upload, FileText, Sparkles, LogOut, ChevronDown } from 'lucide-react'

const COMMUNITIES = ['DATA', 'Product', 'Mobile / Dev', 'Web', 'DevOps / Cloud', 'IA / ML']

const STEPS = [
  'Analyse du CV',
  'Extraction des compétences',
  'Rédaction du résumé',
  'Structuration des expériences',
  'Finalisation'
]

export default function AppPage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('pdf') // 'pdf' | 'text'
  const [pdfFile, setPdfFile] = useState(null)
  const [cvText, setCvText] = useState('')
  const [community, setCommunity] = useState('DATA')
  const [instructions, setInstructions] = useState('')
  const [besoinClient, setBesoinClient] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [dossier, setDossier] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState(null)

  const onDrop = useCallback(acceptedFiles => {
    const file = acceptedFiles[0]
    if (file) setPdfFile(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024
  })

  const simulateSteps = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      setCurrentStep(i)
      await new Promise(r => setTimeout(r, 700))
    }
  }

  const generate = async () => {
    if (tab === 'pdf' && !pdfFile) return toast.error('Sélectionnez un PDF')
    if (tab === 'text' && !cvText.trim()) return toast.error('Collez le contenu du CV')

    setLoading(true)
    setDossier(null)
    setSavedUrl(null)
    setCurrentStep(0)

    const stepsPromise = simulateSteps()

    try {
      const formData = new FormData()
      formData.append('community', community)
      if (instructions) formData.append('instructions', instructions)
      if (besoinClient) formData.append('besoinClient', besoinClient)
      if (tab === 'pdf' && pdfFile) formData.append('pdf', pdfFile)
      if (tab === 'text') formData.append('cvText', cvText)

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData
      })

      await stepsPromise

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Erreur serveur')
      }

      const data = await response.json()
      setDossier(data.dossier)
      setCurrentStep(STEPS.length)
      toast.success('Dossier généré !')
    } catch (err) {
      toast.error(err.message)
      setCurrentStep(-1)
    } finally {
      setLoading(false)
    }
  }

  const exportDocx = async () => {
    if (!dossier) return
    const btn = document.getElementById?.('exportBtn')
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier })
      })
      if (!response.ok) throw new Error('Erreur export')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossier_EverT_${dossier.nom.replace(/\s+/g, '_')}.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Fichier Word téléchargé !')
    } catch (err) {
      toast.error('Erreur export : ' + err.message)
    }
  }

  const exportPptx = async () => {
    if (!dossier) return
    try {
      const response = await fetch('/api/export-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier })
      })
      if (!response.ok) throw new Error('Erreur export')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossier_EverT_${dossier.nom.replace(/\s+/g, '_')}.pptx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Fichier Google Slides téléchargé !')
    } catch (err) {
      toast.error('Erreur export : ' + err.message)
    }
  }

  const saveToDrive = async () => {
    if (!dossier) return
    setSaving(true)
    try {
      const response = await fetch('/api/save-to-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier })
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Erreur Drive')
      }
      const data = await response.json()
      setSavedUrl(data.docUrl)
      toast.success('Sauvegardé dans Google Drive !')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setPdfFile(null)
    setCvText('')
    setBesoinClient('')
    setDossier(null)
    setSavedUrl(null)
    setCurrentStep(-1)
  }

  const BLUE = '#1400FF'
  const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: '1.5px solid #e0e0e0', borderRadius: 8,
    fontFamily: 'Montserrat, sans-serif', fontSize: 13, lineHeight: 1.6,
    color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#1400FF',
    marginBottom: 6, fontFamily: 'Montserrat, sans-serif',
    textTransform: 'uppercase', letterSpacing: '0.08em'
  }
  const cardStyle = {
    background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 16,
    padding: '1.75rem', boxShadow: '0 2px 12px rgba(20,0,255,0.04)'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6ff', fontFamily: 'Montserrat, sans-serif' }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1.5px solid #e8e8f0',
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem',
        boxShadow: '0 1px 8px rgba(20,0,255,0.05)'
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/evert-logo.png" alt="ever&quot;T" style={{ height: 90, width: 'auto' }} />
            <div style={{ width: 1, height: 24, background: '#e0e0f0' }} />
            <span style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14,
              color: '#1400FF', letterSpacing: '0.02em'
            }}>
              Dossier Generator
            </span>
          </div>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                  display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1400FF'; e.currentTarget.style.color = '#1400FF' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0f0'; e.currentTarget.style.color = '#888' }}
              >
                <LogOut size={12} /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 2rem' }}>
        {!dossier ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

            {/* Left — Input */}
            <div style={{ ...cardStyle, animation: 'fadeUp 0.4s ease forwards' }}>
              <h2 style={{
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16,
                margin: '0 0 1.25rem', color: '#111', letterSpacing: '0.01em'
              }}>
                CV du candidat
              </h2>

              {/* Tabs */}
              <div style={{
                display: 'flex', background: '#f0f0ff', borderRadius: 10, padding: 4,
                marginBottom: '1.25rem'
              }}>
                {[
                  { id: 'pdf', label: 'Upload PDF', icon: Upload },
                  { id: 'text', label: 'Coller le texte', icon: FileText }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 7, border: 'none',
                      background: tab === t.id ? '#1400FF' : 'transparent',
                      boxShadow: tab === t.id ? '0 2px 8px rgba(20,0,255,0.2)' : 'none',
                      cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontSize: 12,
                      fontWeight: 600,
                      color: tab === t.id ? '#fff' : '#888',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s'
                    }}
                  >
                    <t.icon size={13} />
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'pdf' ? (
                <div
                  {...getRootProps()}
                  style={{
                    border: `2px dashed ${isDragActive ? '#1400FF' : pdfFile ? '#1400FF' : '#c8c8e8'}`,
                    borderRadius: 12, padding: '2.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                    background: isDragActive ? '#f0f0ff' : pdfFile ? '#f0f0ff' : '#f8f8ff',
                    transition: 'all 0.2s'
                  }}
                >
                  <input {...getInputProps()} />
                  {pdfFile ? (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                      <p style={{ fontFamily: 'Montserrat', fontWeight: 600, margin: '0 0 4px', color: '#1400FF', fontSize: 13 }}>
                        {pdfFile.name}
                      </p>
                      <p style={{ fontSize: 12, color: '#888', margin: 0, fontFamily: 'Montserrat' }}>
                        {(pdfFile.size / 1024).toFixed(0)} KB — cliquez pour changer
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload size={28} style={{ color: '#1400FF', marginBottom: 10, opacity: 0.5 }} />
                      <p style={{ fontFamily: 'Montserrat', fontWeight: 600, margin: '0 0 4px', color: '#111', fontSize: 13 }}>
                        Déposez le CV PDF ici
                      </p>
                      <p style={{ fontSize: 12, color: '#999', margin: 0, fontFamily: 'Montserrat' }}>
                        ou cliquez pour sélectionner — max 10 MB
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={cvText}
                  onChange={e => setCvText(e.target.value)}
                  placeholder="Collez ici le texte du CV ou le profil LinkedIn copié depuis le navigateur..."
                  style={{
                    ...inputStyle, minHeight: 200, resize: 'vertical'
                  }}
                  onFocus={e => e.target.style.borderColor = '#1400FF'}
                  onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                />
              )}
            </div>

            {/* Right — Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ ...cardStyle, animation: 'fadeUp 0.4s ease 0.1s forwards', opacity: 0 }}>
                <h2 style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16,
                  margin: '0 0 1.25rem', color: '#111'
                }}>
                  Options
                </h2>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#1400FF', marginBottom: 6, fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Communauté
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={community}
                      onChange={e => setCommunity(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 32px 10px 12px',
                        border: '1.5px solid #e0e0e0', borderRadius: 8,
                        fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#111',
                        background: '#fff', appearance: 'none', cursor: 'pointer', outline: 'none'
                      }}
                    >
                      {COMMUNITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9a9a90', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#1400FF', marginBottom: 6, fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Besoin client (optionnel)
                  </label>
                  <textarea
                    value={besoinClient}
                    onChange={e => setBesoinClient(e.target.value)}
                    placeholder="Ex: Mission React Senior sur un projet e-commerce, besoin d'expertise CI/CD et AWS..."
                    style={{
                      width: '100%', minHeight: 80, padding: '10px 12px',
                      border: '1.5px solid #e0e0e0', borderRadius: 8, resize: 'vertical',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 13, lineHeight: 1.5,
                    color: '#111', background: '#fff', outline: 'none'
                    }}
                    onFocus={e => e.target.style.borderColor = '#1400FF'}
                    onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#1400FF', marginBottom: 6, fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Instructions (optionnel)
                  </label>
                  <textarea
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="Ex: Mettre en avant l'expérience start-up, reformuler le titre..."
                    style={{
                      width: '100%', minHeight: 80, padding: '10px 12px',
                      border: '1.5px solid #e0e0e0', borderRadius: 8, resize: 'vertical',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 13, lineHeight: 1.5,
                    color: '#111', background: '#fff', outline: 'none'
                    }}
                    onFocus={e => e.target.style.borderColor = '#1400FF'}
                    onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                  />
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generate}
                disabled={loading}
                style={{
                  width: '100%', padding: '16px',
                  background: loading ? '#c8c8e8' : '#1400FF',
                  color: '#fff',
                  border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s', animation: 'fadeUp 0.4s ease 0.2s forwards', opacity: 0,
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(20,0,255,0.25)'
                }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(20,0,255,0.35)' }}}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,0,255,0.25)' }}
              >
                <Sparkles size={18} />
                {loading ? 'Génération en cours...' : 'Générer le dossier'}
              </button>

              {/* Progress steps */}
              {loading && currentStep >= 0 && (
                <div style={{
                  background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 12,
                  padding: '1.25rem', animation: 'fadeIn 0.3s ease forwards'
                }}>
                  {STEPS.map((step, i) => (
                    <div key={step} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 0',
                      opacity: i > currentStep ? 0.3 : 1,
                      transition: 'opacity 0.3s'
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: i < currentStep ? '#1400FF' : i === currentStep ? '#1400FF' : '#f0f0ff',
                        border: `2px solid ${i < currentStep ? '#1400FF' : i === currentStep ? '#1400FF' : '#d0d0f0'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: i === currentStep ? 'pulse-dot 1s ease infinite' : 'none'
                      }}>
                        {i < currentStep && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                        fontWeight: i === currentStep ? 500 : 400,
                        color: i === currentStep ? '#1400FF' : '#aaa'
                      }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
            {/* Preview actions bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12
            }}>
              <div>
                <h2 style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 22, margin: 0, color: '#1400FF'
                }}>
                  {dossier.nom}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 14, color: '#5c5c55', fontFamily: 'DM Sans' }}>
                  {dossier.titre}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={reset}
                  style={{
                    padding: '9px 16px', border: '1.5px solid #e0e0f0', borderRadius: 8,
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 500, color: '#888'
                  }}
                >
                  ← Nouveau dossier
                </button>

                {/* Export Word */}
                <button
                  onClick={exportDocx}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1.5px solid #e0e0f0',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                    color: '#333', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  📥 Télécharger Word
                </button>

                {/* Export Google Slides */}
                <button
                  onClick={exportPptx}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1.5px solid #1400FF',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                    color: '#1400FF', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  📊 Télécharger Google Slides
                </button>

                {/* Save to Drive */}
                {savedUrl ? (
                  <a
                    href={savedUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
                      background: '#1400FF', color: '#fff',
                      fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    ✓ Ouvrir dans Google Drive
                  </a>
                ) : (
                  <button
                    onClick={saveToDrive}
                    disabled={saving}
                    style={{
                      padding: '9px 16px', borderRadius: 8, border: 'none',
                      background: saving ? '#c8c8e8' : '#1400FF',
                      color: '#fff',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    {saving ? '⏳ Sauvegarde...' : '☁️ Sauvegarder dans Drive'}
                  </button>
                )}
              </div>
            </div>

            <DossierPreview dossier={dossier} />
          </div>
        )}
      </main>
    </div>
  )
}
