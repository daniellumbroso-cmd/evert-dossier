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
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none'
      }} />

      {/* Accent glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(232,255,71,0.06) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          marginBottom: '3rem',
          animation: 'fadeUp 0.5s ease forwards'
        }}>
          <div style={{
            width: 44, height: 44, background: '#e8ff47', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: '#0a0a0a'
          }}>
            e"T
          </div>
          <span style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#fafaf8',
            letterSpacing: '-0.02em'
          }}>
            ever"T
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 5vw, 48px)',
          color: '#fafaf8', margin: '0 0 1rem', lineHeight: 1.1, letterSpacing: '-0.03em',
          animation: 'fadeUp 0.5s ease 0.1s forwards', opacity: 0
        }}>
          Générateur de<br />
          <span style={{ color: '#e8ff47' }}>dossiers candidats</span>
        </h1>

        <p style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: '#9a9a90',
          margin: '0 0 2.5rem', lineHeight: 1.6,
          animation: 'fadeUp 0.5s ease 0.2s forwards', opacity: 0
        }}>
          Transformez un CV en dossier Ever"T en quelques secondes.
          Accès réservé à l'équipe.
        </p>

        {error && (
          <div style={{
            background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)',
            borderRadius: 8, padding: '10px 16px', marginBottom: '1.5rem',
            color: '#ff8080', fontSize: 13, fontFamily: 'DM Sans, sans-serif'
          }}>
            {error === 'unauthorized_domain'
              ? 'Accès refusé — compte @ever-t.com requis'
              : 'Erreur d\'authentification, réessayez'}
          </div>
        )}

        {/* CTA */}
        <a
          href="/api/auth/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: '#fafaf8', color: '#0a0a0a',
            padding: '14px 28px', borderRadius: 10,
            fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15,
            textDecoration: 'none', transition: 'all 0.2s',
            animation: 'fadeUp 0.5s ease 0.3s forwards', opacity: 0
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#e8ff47'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#fafaf8'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Se connecter avec Google
        </a>

        <p style={{
          marginTop: '2rem', fontSize: 12, color: '#5c5c55',
          fontFamily: 'DM Sans, sans-serif',
          animation: 'fadeUp 0.5s ease 0.4s forwards', opacity: 0
        }}>
          Réservé aux comptes @ever-t.com
        </p>
      </div>
    </div>
  )
}
