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

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf8' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #ebebе6',
        background: '#fafaf8',
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem'
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 60
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, background: '#0a0a0a', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 12, color: '#e8ff47'
            }}>
              e"T
            </div>
            <span style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#0a0a0a'
            }}>
              Dossier Generator
            </span>
          </div>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {user.picture && (
                  <img src={user.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                )}
                <span style={{ fontSize: 13, color: '#5c5c55', fontFamily: 'DM Sans, sans-serif' }}>
                  {user.name || user.email}
                </span>
              </div>
              <button
                onClick={logout}
                style={{
                  background: 'none', border: '1px solid #d4d4cc', borderRadius: 6,
                  padding: '5px 10px', cursor: 'pointer', color: '#5c5c55',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 4
                }}
              >
                <LogOut size={12} /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>
        {!dossier ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

            {/* Left — Input */}
            <div style={{
              background: '#fff', border: '1px solid #ebebе6', borderRadius: 16,
              padding: '1.5rem', animation: 'fadeUp 0.4s ease forwards'
            }}>
              <h2 style={{
                fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18,
                margin: '0 0 1.5rem', color: '#0a0a0a'
              }}>
                CV du candidat
              </h2>

              {/* Tabs */}
              <div style={{
                display: 'flex', background: '#f5f5f2', borderRadius: 8, padding: 3,
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
                      flex: 1, padding: '7px 12px', borderRadius: 6, border: 'none',
                      background: tab === t.id ? '#fff' : 'transparent',
                      boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13,
                      fontWeight: tab === t.id ? 500 : 400,
                      color: tab === t.id ? '#0a0a0a' : '#9a9a90',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s'
                    }}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'pdf' ? (
                <div
                  {...getRootProps()}
                  style={{
                    border: `2px dashed ${isDragActive ? '#0a0a0a' : pdfFile ? '#e8ff47' : '#d4d4cc'}`,
                    borderRadius: 12, padding: '2.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                    background: isDragActive ? '#f5f5f2' : pdfFile ? '#fffff0' : '#fafaf8',
                    transition: 'all 0.2s'
                  }}
                >
                  <input {...getInputProps()} />
                  {pdfFile ? (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                      <p style={{ fontFamily: 'DM Sans', fontWeight: 500, margin: '0 0 4px', color: '#0a0a0a' }}>
                        {pdfFile.name}
                      </p>
                      <p style={{ fontSize: 12, color: '#9a9a90', margin: 0, fontFamily: 'DM Sans' }}>
                        {(pdfFile.size / 1024).toFixed(0)} KB — cliquez pour changer
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload size={28} style={{ color: '#d4d4cc', marginBottom: 10 }} />
                      <p style={{ fontFamily: 'DM Sans', fontWeight: 500, margin: '0 0 4px', color: '#0a0a0a' }}>
                        Déposez le CV PDF ici
                      </p>
                      <p style={{ fontSize: 13, color: '#9a9a90', margin: 0, fontFamily: 'DM Sans' }}>
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
                    width: '100%', minHeight: 200, padding: '12px 14px',
                    border: '1px solid #d4d4cc', borderRadius: 10, resize: 'vertical',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.6,
                    color: '#0a0a0a', background: '#fafaf8', outline: 'none'
                  }}
                  onFocus={e => e.target.style.borderColor = '#0a0a0a'}
                  onBlur={e => e.target.style.borderColor = '#d4d4cc'}
                />
              )}
            </div>

            {/* Right — Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: '#fff', border: '1px solid #ebebе6', borderRadius: 16,
                padding: '1.5rem', animation: 'fadeUp 0.4s ease 0.1s forwards', opacity: 0
              }}>
                <h2 style={{
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18,
                  margin: '0 0 1.25rem', color: '#0a0a0a'
                }}>
                  Options
                </h2>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5c5c55', marginBottom: 6, fontFamily: 'DM Sans', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Communauté
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={community}
                      onChange={e => setCommunity(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 32px 9px 12px',
                        border: '1px solid #d4d4cc', borderRadius: 8,
                        fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#0a0a0a',
                        background: '#fafaf8', appearance: 'none', cursor: 'pointer', outline: 'none'
                      }}
                    >
                      {COMMUNITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9a9a90', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5c5c55', marginBottom: 6, fontFamily: 'DM Sans', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Besoin client (optionnel)
                  </label>
                  <textarea
                    value={besoinClient}
                    onChange={e => setBesoinClient(e.target.value)}
                    placeholder="Ex: Mission React Senior sur un projet e-commerce, besoin d'expertise CI/CD et AWS..."
                    style={{
                      width: '100%', minHeight: 80, padding: '10px 12px',
                      border: '1px solid #d4d4cc', borderRadius: 8, resize: 'vertical',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5,
                      color: '#0a0a0a', background: '#fafaf8', outline: 'none'
                    }}
                    onFocus={e => e.target.style.borderColor = '#0a0a0a'}
                    onBlur={e => e.target.style.borderColor = '#d4d4cc'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5c5c55', marginBottom: 6, fontFamily: 'DM Sans', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Instructions (optionnel)
                  </label>
                  <textarea
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="Ex: Mettre en avant l'expérience start-up, reformuler le titre..."
                    style={{
                      width: '100%', minHeight: 80, padding: '10px 12px',
                      border: '1px solid #d4d4cc', borderRadius: 8, resize: 'vertical',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5,
                      color: '#0a0a0a', background: '#fafaf8', outline: 'none'
                    }}
                    onFocus={e => e.target.style.borderColor = '#0a0a0a'}
                    onBlur={e => e.target.style.borderColor = '#d4d4cc'}
                  />
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generate}
                disabled={loading}
                style={{
                  width: '100%', padding: '16px',
                  background: loading ? '#d4d4cc' : '#0a0a0a',
                  color: loading ? '#9a9a90' : '#e8ff47',
                  border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s', animation: 'fadeUp 0.4s ease 0.2s forwards', opacity: 0
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <Sparkles size={18} />
                {loading ? 'Génération en cours...' : 'Générer le dossier'}
              </button>

              {/* Progress steps */}
              {loading && currentStep >= 0 && (
                <div style={{
                  background: '#fff', border: '1px solid #ebebе6', borderRadius: 12,
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
                        background: i < currentStep ? '#0a0a0a' : i === currentStep ? '#e8ff47' : '#f5f5f2',
                        border: `2px solid ${i < currentStep ? '#0a0a0a' : i === currentStep ? '#e8ff47' : '#d4d4cc'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: i === currentStep ? 'pulse-dot 1s ease infinite' : 'none'
                      }}>
                        {i < currentStep && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="#fafaf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                        fontWeight: i === currentStep ? 500 : 400,
                        color: i === currentStep ? '#0a0a0a' : '#9a9a90'
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
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, margin: 0, color: '#0a0a0a'
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
                    padding: '9px 16px', border: '1px solid #d4d4cc', borderRadius: 8,
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#5c5c55'
                  }}
                >
                  ← Nouveau dossier
                </button>

                {/* Export Word */}
                <button
                  onClick={exportDocx}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1px solid #d4d4cc',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500,
                    color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  📥 Télécharger Word
                </button>

                {/* Save to Drive */}
                {savedUrl ? (
                  <a
                    href={savedUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
                      background: '#0a0a0a', color: '#e8ff47',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500,
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
                      background: saving ? '#d4d4cc' : '#0a0a0a',
                      color: saving ? '#9a9a90' : '#e8ff47',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500,
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
