import { useAuth } from '../hooks/useAuth'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif', color: '#9a9a90', fontSize: 14
      }}>
        Chargement...
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  return children
}
