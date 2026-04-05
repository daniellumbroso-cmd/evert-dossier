import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import LoginPage from './pages/LoginPage'
import AppPage from './pages/AppPage'
import ProtectedRoute from './components/ProtectedRoute'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '14px',
            background: '#0a0a0a',
            color: '#fafaf8',
            borderRadius: '8px',
            padding: '12px 16px'
          },
          success: { iconTheme: { primary: '#e8ff47', secondary: '#0a0a0a' } }
        }}
      />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/app" element={
          <ProtectedRoute>
            <AppPage />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
