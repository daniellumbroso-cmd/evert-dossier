import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const urlParams = new URLSearchParams(window.location.search)
  const error = urlParams.get('error')

  useEffect(() => {
    if (!loading && user) navigate('/app')
  }, [user, loading])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f6ff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'Montserrat, sans-serif'
    }}>
      {/* Subtle background pattern */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(20,0,255,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(20,0,255,0.03) 0%, transparent 40%)',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 440, width: '100%' }}>

        {/* Logo */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '3rem',
          animation: 'fadeUp 0.5s ease forwards'
        }}>
          <img src="/evert-logo.png" alt="ever&quot;T" style={{ height: 44, width: 'auto' }} />
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          border: '1.5px solid #e8e8f0',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          boxShadow: '0 4px 32px rgba(20,0,255,0.06)'
        }}>
          {/* Headline */}
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
            fontSize: 28, color: '#111',
            margin: '0 0 0.5rem', lineHeight: 1.2,
            animation: 'fadeUp 0.5s ease 0.1s forwards', opacity: 0
          }}>
            Générateur de<br />
            <span style={{ color: '#1400FF' }}>dossiers candidats</span>
          </h1>

          <p style={{
            fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#888',
            margin: '0 0 2rem', lineHeight: 1.6, fontWeight: 400,
            animation: 'fadeUp 0.5s ease 0.2s forwards', opacity: 0
          }}>
            Transformez un CV en dossier Ever"T en quelques secondes.
          </p>

          {error && (
            <div style={{
              background: 'rgba(255,50,50,0.06)', border: '1.5px solid rgba(255,50,50,0.2)',
              borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem',
              color: '#cc3333', fontSize: 13, fontFamily: 'Montserrat, sans-serif', fontWeight: 500
            }}>
              {error === 'unauthorized_domain'
                ? '⚠️ Accès refusé — compte @ever-t.com requis'
                : '⚠️ Erreur d\'authentification, réessayez'}
            </div>
          )}

          {/* CTA Google */}
          <a
            href="/api/auth/login"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', boxSizing: 'border-box',
              background: '#1400FF', color: '#fff',
              padding: '14px 24px', borderRadius: 12,
              fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14,
              textDecoration: 'none', transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(20,0,255,0.25)',
              animation: 'fadeUp 0.5s ease 0.3s forwards', opacity: 0
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(20,0,255,0.35)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,0,255,0.25)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff" fillOpacity="0.9"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#fff" fillOpacity="0.9"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity="0.9"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity="0.9"/>
            </svg>
            Se connecter avec Google
          </a>

          <p style={{
            marginTop: '1.25rem', fontSize: 12, color: '#bbb',
            fontFamily: 'Montserrat, sans-serif', fontWeight: 400,
            animation: 'fadeUp 0.5s ease 0.4s forwards', opacity: 0
          }}>
            Réservé aux comptes @ever-t.com
          </p>
        </div>
      </div>
    </div>
  )
}
