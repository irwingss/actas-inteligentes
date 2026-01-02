import React, { useState, useEffect, useRef } from 'react'
import { Database, FileText, MessageSquare, Loader2 } from 'lucide-react'
import axios from 'axios'
import { OptionCard } from '../components/OptionCard'
import { HeroCard } from '../components/HeroCard'
import { RecentCAsList } from '../components/RecentCAsList'
import { EmptyState } from '../components/EmptyState'
import { SkipToContent } from '../components/SkipToContent'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const HomePage = () => {
  const { session } = useAuth()
  
  // CAs descargados
  const [recentCAs, setRecentCAs] = useState([])
  const [loadingCAs, setLoadingCAs] = useState(true)
  const casLoadedRef = useRef(false)
  
  // Cargar CAs descargados
  useEffect(() => {
    const loadCAs = async () => {
      if (!session?.access_token) {
        setLoadingCAs(false)
        return
      }
      
      if (casLoadedRef.current) return
      
      try {
        const response = await axios.get(`${API_BASE}/api/s123/ca-stats`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        
        if (response.data.success && response.data.stats?.length > 0) {
          setRecentCAs(response.data.stats)
          casLoadedRef.current = true
        }
      } catch (error) {
        console.log('[HomePage] Error cargando CAs:', error.message)
      } finally {
        setLoadingCAs(false)
      }
    }
    
    loadCAs()
  }, [session])

  const handleOptionClick = (option) => {
    if (option === 'visualizar-datos') {
      // Navegar a la página de visualización de datos
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'data-visualization' } }))
    } else if (option === 'conversar-ai') {
      // Navegar a la página de Chat AI
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'chat-ai' } }))
    } else if (option === 'nueva-acta') {
      // Navegar a la página de Nueva Acta
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'nueva-acta' } }))
    } else {
      console.log(`Navegando a: ${option}`)
      // TODO: Implementar navegación para otras opciones
    }
  }

  return (
    <>
      <SkipToContent />
      <div className="min-h-screen flex flex-col">
        {/* Main Content */}
        <main id="main-content" className="flex-1 px-6 py-8">
        <div className="max-w-7xl mx-auto">


          {/* Hero Action - Nueva Acta */}
          <div className="mb-8 relative">
            <HeroCard
                icon={Database}
                title="1. Descargar y Visualizar datos de un Código de Acción (CA)"
                description="Obtén los datos de un CA desde la nube. Es indispensable hacerlo antes de crear un acta."
                onClick={() => handleOptionClick('visualizar-datos')}
                variant="default"
            />
          </div>

          {/* Primary Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            <OptionCard
                icon={FileText}
                title="2. Nueva Acta"
                description="Crea un nuevo acta de reunión o documento oficial con plantillas predefinidas e IA"
                onClick={() => handleOptionClick('nueva-acta')}
                badge=""
              />
              

            <OptionCard
              icon={MessageSquare}
              title="3. Chat AI con la data de campo de un CA"
              description="Utiliza AI para obtener insights de los datos de campo"
              onClick={() => handleOptionClick('conversar-ai')}
              variant="default"
              badge=""
            />
          </div>

          {/* 4. Mis Actas - CAs descargados para continuar trabajando */}
          <div className="mb-8">
            {loadingCAs ? (
              <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-2xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-8 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin theme-text-link" />
                <span className="theme-text-muted">Cargando...</span>
              </div>
            ) : recentCAs.length > 0 ? (
              <RecentCAsList 
                cas={recentCAs}
                onSelectCA={(codigo) => {
                  // Navegar a Nueva Acta con el CA pre-seleccionado
                  window.dispatchEvent(new CustomEvent('navigate', { 
                    detail: { page: 'nueva-acta', codigoAccion: codigo } 
                  }))
                }}
              />
            ) : (
              <EmptyState
                title="No tienes CAs descargados"
                description="Descarga los datos de un CA para comenzar a crear actas."
                actionLabel="Descargar datos de CA"
                onAction={() => handleOptionClick('visualizar-datos')}
                variant="primary"
              />
            )}
          </div>

         
          {/* Footer Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-white">
              Versión 1.0.0 • DSEM-CHID © 2025
            </p>
          </div>
        </div>
      </main>
      </div>
    </>
  )
}
