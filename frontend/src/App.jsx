import React, { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './context/AuthContext'
import { HomePage } from './pages/HomePage'
import { DataVisualizationPage } from './pages/DataVisualizationPage'
import ChatAIPage from './pages/ChatAIPage'
import { NuevaActaPage } from './pages/NuevaActaPage'
import { AppHeader } from './components/AppHeader'

function AppContent() {
  const { user, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState('home') // 'home' | 'data-visualization' | 'chat-ai' | 'nueva-acta'
  const [pageParams, setPageParams] = useState({}) // Parámetros adicionales para páginas

  // Escuchar eventos de navegación
  useEffect(() => {
    const handleNavigate = (event) => {
      const { page, ...params } = event.detail
      setCurrentPage(page)
      setPageParams(params)
    }
    window.addEventListener('navigate', handleNavigate)
    return () => window.removeEventListener('navigate', handleNavigate)
  }, [])

  const handleBackToHome = () => {
    setCurrentPage('home')
    setPageParams({})
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-gradient-page">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 pink:border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="theme-text-muted pink:font-semibold">Cargando...</p>
        </div>
      </div>
    )
  }

  // Routing simple
  // NuevaActaPage tiene su propio header, así que no mostramos AppHeader
  const showAppHeader = currentPage !== 'nueva-acta'
  const showBackButton = currentPage === 'data-visualization' || currentPage === 'chat-ai'
  
  return (
    <>
      {showAppHeader && (
        <AppHeader 
          showBackButton={showBackButton} 
          onBack={showBackButton ? handleBackToHome : null}
        />
      )}
      {currentPage === 'data-visualization' ? (
        <DataVisualizationPage onBack={handleBackToHome} />
      ) : currentPage === 'chat-ai' ? (
        <ChatAIPage onBack={handleBackToHome} />
      ) : currentPage === 'nueva-acta' ? (
        <NuevaActaPage onBack={handleBackToHome} codigoAccion={pageParams.codigoAccion} />
      ) : (
        <HomePage />
      )}
    </>
  );
}

function App() {
  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 5000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            borderRadius: '8px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: '#f1f5f9',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f1f5f9',
            },
            duration: 6000,
          },
        }}
      />
      <AppContent />
    </>
  )
}

export default App
