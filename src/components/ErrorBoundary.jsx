import React from 'react'

// Filet de sécurité : si une page plante, on affiche l'erreur au lieu d'une page
// blanche, pour pouvoir la signaler (capture d'écran) et revenir en arrière.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page plantée :', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7fb', fontFamily: 'Montserrat, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #ececf4', borderRadius: 16, padding: '1.75rem', maxWidth: 560 }}>
          <h1 style={{ fontSize: 17, margin: '0 0 0.6rem', color: '#111' }}>Oups, cette page a planté</h1>
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 1rem', lineHeight: 1.6 }}>
            Faites une capture d'écran de ce message pour le signaler, puis rechargez la page.
          </p>
          <pre style={{ fontSize: 12, background: '#fdecec', color: '#c62828', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', margin: '0 0 1rem' }}>
            {String(error?.message || error)}
          </pre>
          <button onClick={() => window.location.reload()}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#1400FF', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Recharger la page
          </button>
        </div>
      </div>
    )
  }
}
