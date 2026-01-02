import React, { useState, useEffect, useMemo } from 'react'
import { 
  X, 
  Sparkles, 
  Check, 
  XCircle, 
  Loader2, 
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Clock,
  Wand2,
  FileText,
  ArrowRight
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { diffWords } from 'diff'

const API_BASE = 'http://localhost:3000'

/**
 * Modal de AI Enhancement con comparación lado a lado estilo diff
 */
export const AIEnhanceModal = ({
  isOpen,
  onClose,
  originalContent,
  fieldType = 'obligacion', // 'obligacion', 'descripcion', 'titulo'
  context = {},
  actaId,
  hechoId,
  onAccept, // Callback cuando se acepta el cambio
  onReject // Callback cuando se rechaza
}) => {
  const { session } = useAuth()
  
  // Estados
  const [loading, setLoading] = useState(false)
  const [enhancedContent, setEnhancedContent] = useState('')
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  
  // Headers de autenticación
  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  })
  
  // Llamar a la API de AI Enhancement cuando se abre el modal
  useEffect(() => {
    if (isOpen && originalContent && !enhancedContent) {
      enhanceContent()
    }
  }, [isOpen, originalContent])
  
  // Reset cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      setEnhancedContent('')
      setError(null)
      setStats(null)
      setShowVersionHistory(false)
    }
  }, [isOpen])
  
  // Llamar a la API de mejora
  const enhanceContent = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-enhance`,
        {
          content: originalContent,
          fieldType,
          context,
          actaId,
          hechoId
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        setEnhancedContent(response.data.enhanced)
        setStats(response.data.stats)
      } else {
        setError(response.data.error || 'Error desconocido')
      }
    } catch (err) {
      console.error('Error en AI Enhancement:', err)
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }
  
  // Cargar historial de versiones
  const loadVersionHistory = async () => {
    if (!hechoId) return
    
    setLoadingVersions(true)
    try {
      const response = await axios.get(
        `${API_BASE}/api/actas/versions/hecho_${fieldType}/${hechoId}/${fieldType}_fiscalizable`,
        getAuthHeaders()
      )
      if (response.data.success) {
        setVersions(response.data.versions)
      }
    } catch (err) {
      console.error('Error cargando versiones:', err)
    } finally {
      setLoadingVersions(false)
    }
  }
  
  // Toggle historial
  const toggleVersionHistory = () => {
    if (!showVersionHistory && versions.length === 0) {
      loadVersionHistory()
    }
    setShowVersionHistory(!showVersionHistory)
  }
  
  // Aceptar cambios
  const handleAccept = async () => {
    // Guardar versión si tenemos hechoId
    if (hechoId && actaId) {
      try {
        await axios.post(
          `${API_BASE}/api/actas/versions`,
          {
            entityType: `hecho_${fieldType}`,
            entityId: hechoId,
            actaId,
            fieldName: `${fieldType}_fiscalizable`,
            content: enhancedContent,
            versionType: 'ai_enhanced',
            aiModel: 'gemini-2.5-flash'
          },
          getAuthHeaders()
        )
      } catch (err) {
        console.warn('No se pudo guardar versión:', err)
      }
    }
    
    onAccept?.(enhancedContent)
    toast.success('Texto mejorado aplicado')
    onClose()
  }
  
  // Rechazar cambios
  const handleReject = () => {
    onReject?.()
    onClose()
  }
  
  // Regenerar
  const handleRegenerate = () => {
    setEnhancedContent('')
    enhanceContent()
  }
  
  // Restaurar versión anterior
  const handleRestoreVersion = async (version) => {
    try {
      await axios.put(
        `${API_BASE}/api/actas/versions/${version.id}/restore`,
        {},
        getAuthHeaders()
      )
      onAccept?.(version.content)
      toast.success(`Versión ${version.version_number} restaurada`)
      onClose()
    } catch (err) {
      toast.error('Error al restaurar versión')
    }
  }
  
  // Calcular diff entre original y mejorado
  const diffResult = useMemo(() => {
    if (!originalContent || !enhancedContent) return []
    
    // Limpiar HTML para comparación
    const cleanOriginal = stripHtml(originalContent)
    const cleanEnhanced = stripHtml(enhancedContent)
    
    return diffWords(cleanOriginal, cleanEnhanced)
  }, [originalContent, enhancedContent])
  
  // Estadísticas del diff
  const diffStats = useMemo(() => {
    let added = 0, removed = 0, unchanged = 0
    diffResult.forEach(part => {
      const words = part.value.split(/\s+/).filter(w => w).length
      if (part.added) added += words
      else if (part.removed) removed += words
      else unchanged += words
    })
    return { added, removed, unchanged, total: added + removed + unchanged }
  }, [diffResult])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
              <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                AI Enhancer - Mejora de Redacción
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Redacción técnica optimizada para documentos OEFA
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Botón historial */}
            {hechoId && (
              <button
                onClick={toggleVersionHistory}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <History className="w-4 h-4" />
                Historial
                {showVersionHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Historial de versiones (colapsable) */}
        {showVersionHistory && (
          <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Versiones anteriores
            </h3>
            {loadingVersions ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando...
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-slate-500">No hay versiones guardadas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {versions.map(v => (
                  <button
                    key={v.id}
                    onClick={() => handleRestoreVersion(v)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors
                      ${v.is_current 
                        ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-violet-300 dark:hover:border-violet-600'
                      }
                    `}
                  >
                    <Clock className="w-3 h-3" />
                    v{v.version_number}
                    {v.version_type === 'ai_enhanced' && <Wand2 className="w-3 h-3 text-violet-500" />}
                    {v.is_current && <span className="text-green-600">(actual)</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Contenido principal */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-violet-200 dark:border-violet-800 rounded-full animate-pulse" />
                <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-violet-500 animate-bounce" />
              </div>
              <p className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">
                Mejorando redacción...
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Gemini AI está optimizando tu texto
              </p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16">
              <XCircle className="w-16 h-16 text-red-400 mb-4" />
              <p className="text-lg font-medium text-red-600 dark:text-red-400">
                Error al procesar
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md text-center">
                {error}
              </p>
              <button
                onClick={handleRegenerate}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Estadísticas del diff */}
              {enhancedContent && (
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <span className="w-3 h-3 bg-green-500/20 border border-green-500 rounded" />
                      +{diffStats.added} añadidas
                    </span>
                    <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                      <span className="w-3 h-3 bg-red-500/20 border border-red-500 rounded" />
                      -{diffStats.removed} eliminadas
                    </span>
                    <span className="text-slate-500">
                      {diffStats.unchanged} sin cambios
                    </span>
                  </div>
                  {stats && (
                    <div className="text-xs text-slate-400">
                      {stats.processingTimeMs}ms • ~{stats.tokensInput + stats.tokensOutput} tokens
                    </div>
                  )}
                </div>
              )}
              
              {/* Comparación lado a lado */}
              <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700">
                {/* Panel izquierdo - Original */}
                <div className="flex flex-col overflow-hidden">
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        Versión Original
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <DiffView 
                      diffResult={diffResult} 
                      showType="removed" 
                      originalHtml={originalContent}
                    />
                  </div>
                </div>
                
                {/* Panel derecho - Mejorado */}
                <div className="flex flex-col overflow-hidden">
                  <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Versión Mejorada con AI
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <DiffView 
                      diffResult={diffResult} 
                      showType="added" 
                      originalHtml={enhancedContent}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Footer con acciones */}
        {!loading && !error && enhancedContent && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Regenerar
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleReject}
                className="flex items-center gap-2 px-5 py-2.5 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Descartar
              </button>
              <button
                onClick={handleAccept}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-lg shadow-green-500/25"
              >
                <Check className="w-4 h-4" />
                Aceptar Cambios
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Componente para mostrar el diff con highlighting
 */
const DiffView = ({ diffResult, showType, originalHtml }) => {
  // Si no hay diff, mostrar el HTML original
  if (!diffResult || diffResult.length === 0) {
    return (
      <div 
        className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
        dangerouslySetInnerHTML={{ __html: originalHtml || '' }}
      />
    )
  }
  
  return (
    <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
      {diffResult.map((part, index) => {
        // Determinar el estilo según el tipo de cambio
        if (part.added) {
          // Solo mostrar añadidos en el panel derecho
          if (showType === 'added') {
            return (
              <span 
                key={index}
                className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-0.5 rounded"
              >
                {part.value}
              </span>
            )
          }
          return null
        }
        
        if (part.removed) {
          // Solo mostrar eliminados en el panel izquierdo
          if (showType === 'removed') {
            return (
              <span 
                key={index}
                className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 line-through px-0.5 rounded"
              >
                {part.value}
              </span>
            )
          }
          return null
        }
        
        // Texto sin cambios - mostrar en ambos paneles
        return <span key={index}>{part.value}</span>
      })}
    </div>
  )
}

/**
 * Helper: Eliminar HTML de un texto
 */
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export default AIEnhanceModal
