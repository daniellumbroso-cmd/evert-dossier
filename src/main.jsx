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
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '13px',
            fontWeight: '500',
            background: '#ffffff',
            color: '#111111',
            borderRadius: '10px',
            padding: '12px 18px',
            border: '1.5px solid #e8e8f0',
            boxShadow: '0 4px 20px rgba(20,0,255,0.10)'
          },
          success: { iconTheme: { primary: '#1400FF', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#ff3333', secondary: '#ffffff' } }
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
