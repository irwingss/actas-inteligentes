import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { 
  Sparkles, 
  Check, 
  X, 
  Loader2, 
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Clock,
  Wand2,
  FileText,
  Eye,
  EyeOff,
  GitCompare,
  CheckCircle2,
  ArrowRight,
  Scale,
  Leaf,
  ExternalLink,
  BookOpen,
  Copy,
  CheckCheck,
  User,
  Trash2,
  FolderSearch,
  FileSearch,
  Send,
  Upload,
  File,
  FileText as FileTextIcon,
  Plus,
  RefreshCw
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { diffWords } from 'diff'

const API_BASE = 'http://localhost:3000'

/**
 * Componente de texto animado con slide up y fade
 * Para mostrar progreso de operaciones
 */
const AnimatedProgressText = ({ texts, interval = 2500, className = '' }) => {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [isExiting, setIsExiting] = React.useState(false)
  
  React.useEffect(() => {
    if (!texts || texts.length <= 1) return
    
    const timer = setInterval(() => {
      setIsExiting(true)
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % texts.length)
        setIsExiting(false)
      }, 250)
    }, interval)
    
    return () => clearInterval(timer)
  }, [texts, interval])
  
  if (!texts || texts.length === 0) return null
  
  return (
    <div className="h-5 mt-1 overflow-hidden flex items-center justify-center">
      <span 
        style={{ transition: 'all 0.25s ease-out' }}
        className={`
          inline-block
          ${className}
          ${isExiting 
            ? 'opacity-0 -translate-y-2' 
            : 'opacity-100 translate-y-0'
          }
        `}
      >
        {texts[currentIndex]}
      </span>
    </div>
  )
}

// Textos de progreso secuenciales (simulan los pasos reales del backend)
// El intervalo se ajusta para que coincida con los tiempos reales de procesamiento
const PROGRESS_TEXTS = {
  enhance: [
    'Separando componentes del texto...',
    'Procesando con AISA...',
    'Re-ensamblando resultado...'
  ],
  environmental: [
    'Buscando en Google normativa ambiental peruana...',
    'Consultando online las ECA, LMP y guías OEFA...',
    'Buscando online información relevante...',
    'Estructurando el enfoque técnico...',
    'Generando texto sugerido...',
    'Integrando hallazgos al texto...',
    'Separando componentes del texto...',
    'Procesando con AISA...',
    'Re-ensamblando resultado...'
  ],
  legal: [
    'Buscando marco jurídico en fuentes oficiales...',
    'Consultando fuentes oficiales...',
    'Buscando información relevante...',    
    'Procesando con AISA...',
    'Estructurando dictamen legal...',
    'Generando texto con fundamentación legal...',
    'Integrando hallazgos al texto...'
  ],
  rag: [
    'Conectando con store de documentos...',
    'Buscando información relevante...',
    'Procesando con AISA...',
    'Integrando hallazgos al texto...'
  ]
}

/**
 * Limpiar formato markdown de texto
 * Quita: **, *, ##, #, `, etc.
 */
const stripMarkdown = (text) => {
  if (!text) return text
  return text
    .replace(/#{1,6}\s*/g, '')           // Headers: ##, ###, etc.
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // Bold: **texto**
    .replace(/\*([^*]+)\*/g, '$1')       // Italic: *texto*
    .replace(/__([^_]+)__/g, '$1')       // Bold: __texto__
    .replace(/_([^_]+)_/g, '$1')         // Italic: _texto_
    .replace(/`([^`]+)`/g, '$1')         // Code: `texto`
    .replace(/~~([^~]+)~~/g, '$1')       // Strikethrough: ~~texto~~
    .replace(/^\s*[-*+]\s+/gm, '• ')     // Lists: - item, * item → • item
    .replace(/^\s*\d+\.\s+/gm, '')       // Numbered lists: 1. item
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links: [texto](url) → texto
    .replace(/\n{3,}/g, '\n\n')          // Multiple newlines
    .trim()
}

/**
 * Limpiar artefactos de citación de Gemini
 * Ejemplos: [cite: 3 (from previous step)], [cita: 3], [3], [source: X]
 */
const cleanCitations = (text) => {
  if (!text) return text
  return text
    .replace(/\[cite:\s*\d+[^\]]*\]/gi, '') // [cite: 3 (from previous step)]
    .replace(/\[cita:\s*\d+[^\]]*\]/gi, '') // [cita: 3]
    .replace(/\[source:\s*[^\]]*\]/gi, '') // [source: X]
    .replace(/\[ref:\s*[^\]]*\]/gi, '') // [ref: X]
    .replace(/\[nota:\s*[^\]]*\]/gi, '') // [nota: X]
    .replace(/\[\d+\]/g, '') // [3]
    .replace(/\(\s*from previous step\s*\)/gi, '') // (from previous step) suelto
    .replace(/\s{2,}/g, ' ') // Múltiples espacios
    .trim()
}

/**
 * Limpiar comillas envolventes del texto sugerido
 * El experto a veces agrega " al inicio y final
 */
const cleanWrappingQuotes = (text) => {
  if (!text) return text
  let cleaned = text.trim()
  // Remover comillas al inicio y final (varios tipos)
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith('«') && cleaned.endsWith('»')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  return cleaned
}

/**
 * Limpiar texto completamente: markdown + citaciones + comillas
 * Usar para textos que se muestran en diff o comparación
 */
const cleanText = (text) => {
  if (!text) return text
  return cleanWrappingQuotes(cleanCitations(stripMarkdown(text)))
}

/**
 * Panel inline de AI Enhancement con historial de versiones y comparación
 * Se integra directamente debajo del editor
 */
export const AIEnhancePanel = ({
  content,
  fieldType = 'obligacion',
  context = {},
  actaId,
  hechoId,
  onContentChange, // Callback para actualizar el contenido del editor padre
  disabled = false
}) => {
  const { session } = useAuth()
  
  // Estados del panel
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('enhance') // 'enhance' | 'history' | 'compare'
  
  // Estados de AI Enhancement
  const [loading, setLoading] = useState(false)
  const [enhancedContent, setEnhancedContent] = useState('')
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  
  // Estados de revisión de expertos
  const [loadingExpert, setLoadingExpert] = useState(null) // 'environmental' | 'legal' | null
  const [expertReview, setExpertReview] = useState(null) // { type, name, review }
  const [expertError, setExpertError] = useState(null)
  const [showExpertPanel, setShowExpertPanel] = useState(false)
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)
  
  // Estados de historial
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState(null)
  
  // Estado para comparación
  const [compareMode, setCompareMode] = useState(false)
  const [compareWith, setCompareWith] = useState(null) // Versión o contenido mejorado para comparar
  
  // Estados de Experto RAG
  const [showRAGModal, setShowRAGModal] = useState(false)
  const [loadingRAG, setLoadingRAG] = useState(false)
  const [loadingRAGStores, setLoadingRAGStores] = useState(false)
  const [ragStores, setRagStores] = useState({ caStores: [], globalStores: [] })
  const [selectedRAGStore, setSelectedRAGStore] = useState(null)
  const [ragInstruction, setRagInstruction] = useState('')
  const [caStore, setCAStore] = useState(null) // Store del CA actual
  const [caStoreDocuments, setCAStoreDocuments] = useState([])
  const [loadingCAStore, setLoadingCAStore] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [ragTab, setRagTab] = useState('documents') // 'documents' | 'other-stores'
  
  // Headers de autenticación
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])
  
  // Cargar historial de versiones cuando se expande
  useEffect(() => {
    if (isExpanded && hechoId && versions.length === 0) {
      loadVersionHistory()
    }
  }, [isExpanded, hechoId])
  
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
  
  // Llamar a la API de mejora
  const enhanceContent = async () => {
    if (!content || content.trim().length < 10) {
      toast.error('Escribe al menos 10 caracteres para mejorar')
      return
    }
    
    setLoading(true)
    setError(null)
    setExpertReview(null) // Limpiar para que Regenerar sepa que es mejora simple
    setActiveTab('enhance')
    setIsExpanded(true)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-enhance`,
        {
          content,
          fieldType,
          context,
          actaId,
          hechoId
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        // Limpiar artefactos de citación de Gemini
        const cleanedEnhanced = cleanCitations(response.data.enhanced)
        setEnhancedContent(cleanedEnhanced)
        setStats(response.data.stats)
        setCompareWith(cleanedEnhanced)
        setCompareMode(true)
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
  
  // Solicitar revisión de experto (usando nuevo endpoint estructurado)
  const requestExpertReview = async (expertType) => {
    if (!content || content.trim().length < 10) {
      toast.error('Escribe al menos 10 caracteres para solicitar revisión')
      return
    }
    
    setLoadingExpert(expertType)
    setExpertError(null)
    setShowExpertPanel(true)
    setIsExpanded(true)
    
    try {
      // Usar nuevo endpoint estructurado con Gemini 3
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-expert-structured`,
        {
          content,
          fieldType,
          expertType,
          context, // Incluye fotos si están disponibles
          actaId,
          hechoId
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        const reviewData = response.data.review // JSON estructurado
        
        console.log('[AIEnhancePanel] Respuesta estructurada recibida:', {
          confianza: reviewData.confianza,
          observaciones: reviewData.observaciones?.length,
          fuentes: reviewData.fuentes?.length,
          textoSugerido: reviewData.textoSugerido?.substring(0, 100)
        })
        
        // Construir HTML para mostrar (formato limpio desde JSON)
        const reviewHtml = buildReviewHtml(reviewData, expertType)
        const sourcesHtml = buildSourcesHtml(reviewData.fuentes)
        
        // Limpiar texto sugerido de markdown/citaciones
        const cleanedSuggestedText = cleanText(reviewData.textoSugerido)
        
        setExpertReview({
          type: response.data.expertType,
          name: response.data.expertName,
          review: reviewHtml,
          sources: sourcesHtml,
          suggestedText: cleanedSuggestedText, // ✅ Limpio de markdown
          structured: reviewData, // Guardar datos estructurados completos
          stats: response.data.stats
        })
        
        // Siempre hay texto sugerido con el nuevo endpoint
        if (cleanedSuggestedText) {
          setEnhancedContent(cleanedSuggestedText)
          setCompareWith(cleanedSuggestedText)
          setCompareMode(true)
          setShowExpertPanel(false)
        }
      } else {
        setExpertError(response.data.error || 'Error desconocido')
      }
    } catch (err) {
      console.error('Error en revisión de experto:', err)
      setExpertError(err.response?.data?.error || err.message)
    } finally {
      setLoadingExpert(null)
    }
  }
  
  // Construir HTML desde respuesta estructurada
  const buildReviewHtml = (data, expertType) => {
    const icon = expertType === 'environmental' ? '🔬' : '⚖️'
    let html = `<div class="expert-review">`
    
    // Análisis preliminar (limpiar markdown)
    html += `<div class="assessment"><h5>${icon} Análisis Preliminar</h5><p>${cleanText(data.analisisPreliminar)}</p></div>`
    
    // Marco normativo
    if (data.marcoNormativo?.length > 0) {
      html += `<div class="legal-framework"><h5>📜 Marco Normativo</h5><ul>`
      data.marcoNormativo.forEach(n => {
        html += `<li><strong>${cleanText(n.norma)}</strong> - ${cleanText(n.articulo)}`
        if (n.citaTextual) html += `<br/><em>"${cleanText(n.citaTextual)}"</em>`
        html += `<br/><small>${cleanText(n.relevancia)}</small></li>`
      })
      html += `</ul></div>`
    }
    
    // Observaciones con prioridad
    if (data.observaciones?.length > 0) {
      html += `<div class="suggestions"><h5>💡 Observaciones</h5><ul>`
      data.observaciones.forEach(o => {
        const prioColor = o.prioridad === 'alta' ? '#ef4444' : o.prioridad === 'media' ? '#f59e0b' : '#22c55e'
        html += `<li><span style="color:${prioColor};font-weight:bold;">[${o.prioridad.toUpperCase()}]</span> `
        html += `<strong>${cleanText(o.aspecto)}:</strong> ${cleanText(o.recomendacion)}</li>`
      })
      html += `</ul></div>`
    }
    
    // Texto sugerido (ya limpio, pero por seguridad)
    html += `<div class="recommended-text"><h5>✨ Texto Sugerido</h5><blockquote>${cleanText(data.textoSugerido)}</blockquote></div>`
    
    // Indicadores
    html += `<div class="indicators" style="margin-top:1rem;padding:0.5rem;background:#f1f5f9;border-radius:0.5rem;">`
    html += `<small>📊 Confianza: <strong>${data.confianza}</strong>`
    if (data.requiereRevisionHumana) html += ` | ⚠️ Requiere revisión humana`
    html += `</small></div>`
    
    html += `</div>`
    return html
  }
  
  // Construir HTML de fuentes desde array estructurado
  const buildSourcesHtml = (fuentes) => {
    if (!fuentes?.length) return null
    let html = `<ul>`
    fuentes.forEach(f => {
      html += `<li><a href="${f.url}" target="_blank" rel="noopener">${f.titulo}</a>`
      if (f.seccion) html += ` <small>(${f.seccion})</small>`
      html += `</li>`
    })
    html += `</ul>`
    return html
  }
  
  // Copiar revisión al portapapeles
  const copyExpertReviewToClipboard = () => {
    if (!expertReview) return
    const plainText = stripHtml(expertReview.review)
    navigator.clipboard.writeText(plainText)
    setCopiedToClipboard(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiedToClipboard(false), 2000)
  }
  
  // ============================================
  // EXPERTO RAG - Funciones
  // ============================================
  
  // Obtener o crear el store del CA actual
  const getOrCreateCAStore = async () => {
    const caCode = context?.codigoAccion
    console.log('[AIEnhancePanel] 🔍 context:', context)
    console.log('[AIEnhancePanel] 🔍 caCode:', caCode)
    
    if (!caCode) {
      toast.error('No hay código de CA disponible')
      return null
    }
    
    setLoadingCAStore(true)
    try {
      console.log(`[AIEnhancePanel] 📤 Solicitando store para CA: ${caCode}`)
      const response = await axios.post(
        `${API_BASE}/api/actas/rag-store-for-ca`,
        { caCode },
        getAuthHeaders()
      )
      
      console.log('[AIEnhancePanel] 📥 Respuesta del backend:', response.data)
      
      if (response.data.success) {
        const store = response.data.store
        console.log('[AIEnhancePanel] ✅ Store obtenido:', store)
        setCAStore(store)
        setSelectedRAGStore(store)
        
        if (response.data.created) {
          toast.success(`Store creado para CA-${caCode}`)
        }
        
        // Cargar documentos del store
        console.log('[AIEnhancePanel] 📂 Cargando documentos del store:', store.name)
        await loadCAStoreDocuments(store.name)
        
        return store
      } else {
        console.log('[AIEnhancePanel] ❌ Backend respondió sin success:', response.data)
      }
    } catch (err) {
      console.error('[AIEnhancePanel] ❌ Error obteniendo/creando store del CA:', err.response?.data || err)
      toast.error('Error al configurar store del CA')
    } finally {
      setLoadingCAStore(false)
    }
    return null
  }
  
  // Cargar documentos del store del CA
  const loadCAStoreDocuments = async (storeName) => {
    if (!storeName) {
      console.log('[AIEnhancePanel] ⚠️ No hay storeName para cargar documentos')
      return
    }
    
    console.log(`[AIEnhancePanel] 📂 Cargando documentos del store: ${storeName}`)
    
    try {
      // Usar el mismo endpoint que usa el RAGSidebar
      const encodedStoreName = encodeURIComponent(storeName)
      console.log(`[AIEnhancePanel] 🔗 URL: ${API_BASE}/api/file-search/stores/${encodedStoreName}/documents`)
      
      const response = await axios.get(
        `${API_BASE}/api/file-search/stores/${encodedStoreName}/documents`,
        getAuthHeaders()
      )
      
      console.log(`[AIEnhancePanel] 📦 Respuesta:`, response.data)
      
      if (response.data.success) {
        setCAStoreDocuments(response.data.documents || [])
        console.log(`[AIEnhancePanel] ✅ Cargados ${response.data.documents?.length || 0} documentos`)
      } else {
        console.log(`[AIEnhancePanel] ❌ Respuesta no exitosa:`, response.data)
        setCAStoreDocuments([])
      }
    } catch (err) {
      console.error('[AIEnhancePanel] ❌ Error cargando documentos:', err.response?.data || err.message)
      setCAStoreDocuments([])
    }
  }
  
  // Subir archivo al store del CA
  const uploadFileToCAStore = async (file) => {
    if (!caStore) {
      toast.error('No hay store configurado')
      return
    }
    
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileSearchStoreName', caStore.name)
      formData.append('displayName', file.name)
      
      // Usar el mismo endpoint que usa el RAGSidebar
      const response = await axios.post(
        `${API_BASE}/api/file-search/upload`,
        formData,
        {
          headers: {
            ...getAuthHeaders().headers,
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      
      if (response.data.success) {
        toast.success(`Archivo "${file.name}" subido`)
        // Esperar un momento antes de recargar para dar tiempo a la API
        setTimeout(async () => {
          await loadCAStoreDocuments(caStore.name)
        }, 300)
      }
    } catch (err) {
      console.error('Error subiendo archivo:', err)
      toast.error(err.response?.data?.error || 'Error al subir archivo')
    } finally {
      setUploadingFile(false)
    }
  }
  
  // Eliminar documento del store
  const deleteDocumentFromStore = async (documentName) => {
    if (!confirm('¿Eliminar este documento?')) return
    
    try {
      // Usar el mismo endpoint que usa el RAGSidebar
      const encodedDocumentName = encodeURIComponent(documentName)
      const response = await axios.delete(
        `${API_BASE}/api/file-search/documents/${encodedDocumentName}`,
        getAuthHeaders()
      )
      
      if (response.data.success) {
        toast.success('Documento eliminado')
        // Recargar documentos
        await loadCAStoreDocuments(caStore.name)
      }
    } catch (err) {
      console.error('Error eliminando documento:', err)
      toast.error('Error al eliminar documento')
    }
  }
  
  // Seleccionar un store y cargar sus documentos
  const selectStoreAndLoadDocs = async (store) => {
    console.log('[AIEnhancePanel] 🎯 Seleccionando store:', store.displayName || store.name)
    setSelectedRAGStore(store)
    await loadCAStoreDocuments(store.name)
  }
  
  // Cargar stores RAG disponibles (otros stores, no del CA)
  const loadRAGStores = async () => {
    setLoadingRAGStores(true)
    try {
      const caCode = context?.codigoAccion || ''
      
      const response = await axios.get(
        `${API_BASE}/api/actas/rag-stores?caCode=${encodeURIComponent(caCode)}`,
        getAuthHeaders()
      )
      
      if (response.data.success) {
        setRagStores({
          caStores: response.data.caStores || [],
          globalStores: response.data.globalStores || []
        })
      }
    } catch (err) {
      console.error('Error cargando stores RAG:', err)
    } finally {
      setLoadingRAGStores(false)
    }
  }
  
  // Abrir modal RAG
  const openRAGModal = async () => {
    if (!content || content.trim().length < 10) {
      toast.error('Escribe al menos 10 caracteres para usar el Experto RAG')
      return
    }
    
    setShowRAGModal(true)
    setRagInstruction('')
    setRagTab('documents')
    
    // Auto-crear/obtener store del CA
    await getOrCreateCAStore()
    
    // También cargar otros stores
    loadRAGStores()
  }
  
  // Solicitar enriquecimiento RAG
  const requestRAGEnrichment = async () => {
    if (!selectedRAGStore) {
      toast.error('Selecciona un store de documentos')
      return
    }
    
    if (!ragInstruction || ragInstruction.trim().length < 5) {
      toast.error('Escribe una instrucción de al menos 5 caracteres')
      return
    }
    
    setLoadingRAG(true)
    setIsExpanded(true)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-expert-rag`,
        {
          content,
          fieldType,
          storeName: selectedRAGStore.name,
          customInstruction: ragInstruction,
          actaId,
          hechoId
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        const enrichedText = cleanText(response.data.enrichedText)
        
        setExpertReview({
          type: 'rag',
          name: 'Experto RAG',
          suggestedText: enrichedText,
          stats: response.data.stats
        })
        
        setEnhancedContent(enrichedText)
        setCompareWith(enrichedText)
        setCompareMode(true)
        setShowRAGModal(false)
        
        toast.success('Texto enriquecido con documentos')
      } else {
        toast.error(response.data.error || 'Error en enriquecimiento RAG')
      }
    } catch (err) {
      console.error('Error en Experto RAG:', err)
      const errorData = err.response?.data
      if (errorData?.blockedReason === 'RECITATION') {
        toast.error('La normativa contiene texto protegido. Pide un resumen en lugar de citas textuales.', { duration: 6000 })
      } else {
        toast.error(errorData?.error || 'Error al consultar documentos')
      }
    } finally {
      setLoadingRAG(false)
    }
  }
  
  // Ver comparación del texto sugerido por experto (sin aplicar aún)
  const showExpertComparison = () => {
    if (!expertReview?.suggestedText) {
      toast.error('No se encontró texto sugerido en la revisión')
      return
    }
    
    // Activar modo comparación con el texto sugerido
    setEnhancedContent(expertReview.suggestedText)
    setCompareWith(expertReview.suggestedText)
    setCompareMode(true)
    setShowExpertPanel(false)
  }
  
  // Aplicar texto sugerido por experto directamente (después de comparar)
  const applyExpertSuggestion = async () => {
    if (!expertReview) return
    
    // Usar el texto ya extraído en expertReview.suggestedText
    const suggestedText = expertReview.suggestedText
    
    if (suggestedText) {
      // Guardar versión con el nombre del experto
      if (hechoId && actaId) {
        try {
          await axios.post(
            `${API_BASE}/api/actas/versions`,
            {
              entityType: `hecho_${fieldType}`,
              entityId: hechoId,
              actaId,
              fieldName: `${fieldType}_fiscalizable`,
              content: suggestedText,
              versionType: expertReview.type === 'environmental' ? 'expert_environmental' : 'expert_legal',
              aiModel: `gemini-expert-${expertReview.type}`
            },
            getAuthHeaders()
          )
          loadVersionHistory()
        } catch (err) {
          console.warn('No se pudo guardar versión:', err)
        }
      }
      
      onContentChange?.(suggestedText)
      toast.success(`Texto del ${expertReview.name} aplicado`)
      setShowExpertPanel(false)
      setCompareMode(false)
      setEnhancedContent('')
    } else {
      toast.error('No se encontró texto sugerido en la revisión')
    }
  }
  
  // Aceptar cambios de AI
  const handleAcceptEnhanced = async () => {
    // Determinar el tipo de versión basado en si vino de un experto o mejora simple
    let versionType = 'ai_enhanced'
    let aiModel = 'gemini-2.5-flash'
    let successMessage = 'Texto mejorado aplicado'
    
    if (expertReview?.type === 'environmental') {
      versionType = 'expert_environmental'
      aiModel = 'gemini-expert-environmental'
      successMessage = 'Texto del Experto Ambiental aplicado'
    } else if (expertReview?.type === 'legal') {
      versionType = 'expert_legal'
      aiModel = 'gemini-expert-legal'
      successMessage = 'Texto del Experto Legal aplicado'
    } else if (expertReview?.type === 'rag') {
      versionType = 'expert_rag'
      aiModel = 'gemini-rag'
      successMessage = 'Texto del Experto RAG aplicado'
    }
    
    // Guardar versión
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
            versionType,
            aiModel
          },
          getAuthHeaders()
        )
        // Recargar versiones
        loadVersionHistory()
      } catch (err) {
        console.warn('No se pudo guardar versión:', err)
      }
    }
    
    onContentChange?.(enhancedContent)
    setCompareMode(false)
    setEnhancedContent('')
    setExpertReview(null) // Limpiar para próximas interacciones
    toast.success(successMessage)
  }
  
  // Descartar cambios de AI
  const handleRejectEnhanced = () => {
    setCompareMode(false)
    setEnhancedContent('')
    setCompareWith(null)
  }
  
  // Seleccionar versión para comparar
  const handleSelectVersion = (version) => {
    setSelectedVersion(version)
    setCompareWith(version.content)
    setCompareMode(true)
    setActiveTab('compare')
  }
  
  // Restaurar versión
  const handleRestoreVersion = async (version) => {
    try {
      await axios.put(
        `${API_BASE}/api/actas/versions/${version.id}/restore`,
        {},
        getAuthHeaders()
      )
      onContentChange?.(version.content)
      setCompareMode(false)
      setSelectedVersion(null)
      loadVersionHistory()
      toast.success(`Versión ${version.version_number} restaurada`)
    } catch (err) {
      toast.error('Error al restaurar versión')
    }
  }
  
  // Eliminar versión
  const handleDeleteVersion = async (version) => {
    if (version.is_current) {
      toast.error('No se puede eliminar la versión actual')
      return
    }
    
    if (!window.confirm(`¿Eliminar la versión ${version.version_number}? Esta acción no se puede deshacer.`)) {
      return
    }
    
    try {
      await axios.delete(
        `${API_BASE}/api/actas/versions/${version.id}`,
        getAuthHeaders()
      )
      loadVersionHistory()
      toast.success(`Versión ${version.version_number} eliminada`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar versión')
    }
  }
  
  // Eliminar TODAS las versiones (excepto la actual)
  const handleDeleteAllVersions = async () => {
    const nonCurrentVersions = versions.filter(v => !v.is_current)
    if (nonCurrentVersions.length === 0) {
      toast.error('No hay versiones para eliminar')
      return
    }
    
    if (!window.confirm(`¿Eliminar ${nonCurrentVersions.length} versiones antiguas? La versión actual se mantendrá. Esta acción no se puede deshacer.`)) {
      return
    }
    
    let deleted = 0
    for (const version of nonCurrentVersions) {
      try {
        await axios.delete(
          `${API_BASE}/api/actas/versions/${version.id}`,
          getAuthHeaders()
        )
        deleted++
      } catch (err) {
        console.warn(`No se pudo eliminar versión ${version.id}:`, err.message)
      }
    }
    
    loadVersionHistory()
    toast.success(`${deleted} versiones eliminadas`)
  }
  
  // Ver contenido de una versión directamente
  const handleViewVersion = (version) => {
    setSelectedVersion(version)
    setCompareWith(version.content)
    setCompareMode(true)
  }
  
  // Cerrar visualización de versión
  const handleCloseVersionView = () => {
    setCompareMode(false)
    setSelectedVersion(null)
    setCompareWith(null)
  }
  
  // Refs para scroll sincronizado del diff viewer
  const diffLeftRef = useRef(null)
  const diffRightRef = useRef(null)
  const isScrollingSyncRef = useRef(false)
  
  // Handler para sincronizar scroll entre paneles del diff
  const handleDiffScroll = useCallback((source) => {
    if (isScrollingSyncRef.current) return
    
    const sourceEl = source === 'left' ? diffLeftRef.current : diffRightRef.current
    const targetEl = source === 'left' ? diffRightRef.current : diffLeftRef.current
    
    if (!sourceEl || !targetEl) return
    
    isScrollingSyncRef.current = true
    targetEl.scrollTop = sourceEl.scrollTop
    
    // Reset flag después de un pequeño delay
    requestAnimationFrame(() => {
      isScrollingSyncRef.current = false
    })
  }, [])
  
  // Calcular diff
  // Si hay enhancedContent: comparamos original (content) vs sugerencia (enhancedContent)
  // Si hay selectedVersion: comparamos versión anterior (selectedVersion) vs actual (content)
  const diffResult = useMemo(() => {
    if (!content || !compareWith) return []
    const cleanCurrent = stripHtml(content)
    const cleanCompare = stripHtml(compareWith)
    
    // Si es una sugerencia AI pendiente, el diff es: original -> sugerencia
    if (enhancedContent) {
      return diffWords(cleanCurrent, cleanCompare)
    }
    // Si es comparación con versión anterior, el diff es: anterior -> actual
    return diffWords(cleanCompare, cleanCurrent)
  }, [content, compareWith, enhancedContent])
  
  // Estadísticas del diff
  const diffStats = useMemo(() => {
    let added = 0, removed = 0, unchanged = 0
    diffResult.forEach(part => {
      const words = part.value.split(/\s+/).filter(w => w).length
      if (part.added) added += words
      else if (part.removed) removed += words
      else unchanged += words
    })
    return { added, removed, unchanged }
  }, [diffResult])
  
  // Formatear fecha
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('es-PE', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }
  
  return (
    <div className="mt-3 space-y-2">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Botón AI Enhancer */}
          <button
            onClick={enhanceContent}
            disabled={disabled || loading || !content || content.trim().length < 10}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${!disabled && content && content.trim().length >= 10
                ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 pink:from-[#ff0075] pink:to-[#ff6eb4] text-white shadow-lg shadow-violet-500/25 pink:shadow-pink-500/25'
                : 'bg-slate-200 dark:bg-slate-700 pink:bg-pink-100 text-slate-400 pink:text-pink-400 cursor-not-allowed'
              }
            `}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {loading ? 'Mejorando...' : 'Mejorar redacción'}
          </button>
          
          {/* Botón Experto Ambiental */}
          <button
            onClick={() => requestExpertReview('environmental')}
            disabled={disabled || loadingExpert || !content || content.trim().length < 10}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${!disabled && content && content.trim().length >= 10
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }
            `}
            title="Revisión por experto ambiental profesional"
          >
            {loadingExpert === 'environmental' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Leaf className="w-4 h-4" />
            )}
            {loadingExpert === 'environmental' ? 'Revisando...' : 'Experto Ambiental'}
          </button>
          
          {/* Botón Experto Legal */}
          <button
            onClick={() => requestExpertReview('legal')}
            disabled={disabled || loadingExpert || !content || content.trim().length < 10}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${!disabled && content && content.trim().length >= 10
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }
            `}
            title="Revisión por experto legal ambiental"
          >
            {loadingExpert === 'legal' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scale className="w-4 h-4" />
            )}
            {loadingExpert === 'legal' ? 'Revisando...' : 'Experto Legal'}
          </button>
          
          {/* Botón Experto RAG */}
          <button
            onClick={openRAGModal}
            disabled={disabled || loadingRAG || !content || content.trim().length < 10}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${!disabled && content && content.trim().length >= 10
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-cyan-500/25'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              }
            `}
            title="Enriquecer con documentos RAG"
          >
            {loadingRAG ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSearch className="w-4 h-4" />
            )}
            {loadingRAG ? 'Buscando...' : 'Experto RAG'}
          </button>
          
          {/* Botón Historial */}
          <button
            onClick={() => {
              setIsExpanded(!isExpanded)
              setActiveTab('history')
              setShowExpertPanel(false)
              if (!isExpanded && versions.length === 0) {
                loadVersionHistory()
              }
            }}
            disabled={!hechoId}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${hechoId
                ? 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            <History className="w-4 h-4" />
            Versiones
            {versions.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 rounded-full">
                {versions.length}
              </span>
            )}
          </button>
        </div>
        
        {/* Toggle comparación si hay algo que comparar */}
        {compareWith && (
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all
              ${compareMode
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }
            `}
          >
            <GitCompare className="w-4 h-4" />
            {compareMode ? 'Ocultar comparación' : 'Ver comparación'}
          </button>
        )}
      </div>
      
      {/* Panel de Revisión de Experto */}
      {showExpertPanel && (
        <div className={`border rounded-xl overflow-hidden animate-fade-in ${
          (expertReview?.type === 'environmental' || loadingExpert === 'environmental')
            ? 'border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20'
            : 'border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
        }`}>
          {/* Header */}
          <div className={`px-4 py-3 border-b flex items-center justify-between ${
            (expertReview?.type === 'environmental' || loadingExpert === 'environmental')
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-900/30'
              : 'border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30'
          }`}>
            <div className="flex items-center gap-2">
              {expertReview?.type === 'environmental' || loadingExpert === 'environmental' ? (
                <Leaf className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Scale className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              )}
              <h4 className={`font-medium ${
                expertReview?.type === 'environmental' || loadingExpert === 'environmental'
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : 'text-amber-800 dark:text-amber-300'
              }`}>
                {expertReview?.name || (loadingExpert === 'environmental' ? 'Experto Ambiental' : 'Experto Legal')}
              </h4>
            </div>
            <button
              onClick={() => setShowExpertPanel(false)}
              className={`p-1 rounded transition-colors ${
                expertReview?.type === 'environmental' || loadingExpert === 'environmental'
                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Contenido */}
          <div className="p-4">
            {loadingExpert ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                  <div className={`w-12 h-12 border-4 rounded-full animate-pulse ${
                    loadingExpert === 'environmental' 
                      ? 'border-emerald-200 dark:border-emerald-800' 
                      : 'border-amber-200 dark:border-amber-800'
                  }`} />
                  {loadingExpert === 'environmental' ? (
                    <Leaf className="absolute inset-0 m-auto w-6 h-6 text-emerald-500 animate-bounce" />
                  ) : (
                    <Scale className="absolute inset-0 m-auto w-6 h-6 text-amber-500 animate-bounce" />
                  )}
                </div>
                <p className={`mt-3 text-sm font-medium ${
                  loadingExpert === 'environmental' 
                    ? 'text-emerald-700 dark:text-emerald-300' 
                    : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {loadingExpert === 'environmental' ? 'Consultando experto ambiental...' : 'Consultando experto legal...'}
                </p>
                <AnimatedProgressText 
                  texts={PROGRESS_TEXTS[loadingExpert] || PROGRESS_TEXTS.environmental}
                  interval={5000}
                  className={`text-xs text-center ${
                    loadingExpert === 'environmental' 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                />
              </div>
            ) : expertError ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{expertError}</p>
                <button
                  onClick={() => requestExpertReview(expertReview?.type || 'environmental')}
                  className="mt-2 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
                >
                  Reintentar consulta
                </button>
              </div>
            ) : expertReview ? (
              <div className="space-y-3">
                {/* Acciones */}
                <div className={`flex items-center justify-end gap-2 pb-3 border-b ${
                  expertReview.type === 'environmental' 
                    ? 'border-emerald-200 dark:border-emerald-700' 
                    : 'border-amber-200 dark:border-amber-700'
                }`}>
                  <button
                    onClick={copyExpertReviewToClipboard}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      expertReview.type === 'environmental'
                        ? 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/50'
                        : 'text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/50'
                    }`}
                  >
                    {copiedToClipboard ? (
                      <CheckCheck className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedToClipboard ? 'Copiado' : 'Copiar'}
                  </button>
                  
                  {/* Botón Ver Comparación - muestra diff antes de aplicar */}
                  {expertReview.suggestedText && (
                    <button
                      onClick={showExpertComparison}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                        expertReview.type === 'environmental'
                          ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                          : 'border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                      }`}
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                      Ver comparación
                    </button>
                  )}
                  
                  {/* Botón Aplicar directo */}
                  <button
                    onClick={applyExpertSuggestion}
                    disabled={!expertReview.suggestedText}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors ${
                      expertReview.suggestedText
                        ? expertReview.type === 'environmental'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar
                  </button>
                </div>
                
                {/* Contenido de la revisión */}
                <div 
                  className={`prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 max-h-96 overflow-y-auto
                    prose-h4:text-base prose-h4:font-semibold prose-h4:mt-4 prose-h4:mb-2
                    prose-h5:text-sm prose-h5:font-semibold prose-h5:mt-3 prose-h5:mb-1
                    prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline hover:prose-a:no-underline
                    prose-blockquote:border-l-4 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded prose-blockquote:my-3
                    prose-ul:my-2 prose-li:my-0.5
                    ${expertReview.type === 'environmental'
                      ? 'prose-h4:text-emerald-800 dark:prose-h4:text-emerald-300 prose-h5:text-emerald-700 dark:prose-h5:text-emerald-400 prose-strong:text-emerald-700 dark:prose-strong:text-emerald-400 prose-blockquote:border-emerald-400 prose-blockquote:bg-emerald-50 dark:prose-blockquote:bg-emerald-900/20'
                      : 'prose-h4:text-amber-800 dark:prose-h4:text-amber-300 prose-h5:text-amber-700 dark:prose-h5:text-amber-400 prose-strong:text-amber-700 dark:prose-strong:text-amber-400 prose-blockquote:border-amber-400 prose-blockquote:bg-amber-50 dark:prose-blockquote:bg-amber-900/20'
                    }`}
                  dangerouslySetInnerHTML={{ __html: expertReview.review }}
                />
                
                {/* Disclaimer */}
                <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
                  <p className="flex items-start gap-2">
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Los enlaces proporcionados son a fuentes oficiales. Verifique siempre la información 
                      en los portales de OEFA, MINAM, OSINERGMIN y demás entidades competentes.
                    </span>
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      
      {/* Panel expandible */}
      {(isExpanded || compareMode) && !showExpertPanel && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 animate-fade-in">
          {/* Tabs */}
          {isExpanded && !compareMode && (
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-white dark:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <History className="w-4 h-4" />
                  Historial de Versiones
                </div>
              </button>
            </div>
          )}
          
          {/* Contenido del panel */}
          <div className="p-4">
            {/* Vista de comparación lado a lado */}
            {compareMode && compareWith && (
              <div className="space-y-3">
                {/* Header de comparación */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                      <span className="w-3 h-3 bg-red-500/20 border border-red-500 rounded" />
                      -{diffStats.removed} eliminadas
                    </span>
                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <span className="w-3 h-3 bg-green-500/20 border border-green-500 rounded" />
                      +{diffStats.added} añadidas
                    </span>
                    {stats && (
                      <span className="text-slate-400 text-xs">
                        {stats.processingTimeMs}ms
                      </span>
                    )}
                  </div>
                  
                  {/* Acciones */}
                  <div className="flex items-center gap-2">
                    {enhancedContent && (
                      <>
                        <button
                          onClick={() => {
                            // Regenerar con el mismo tipo de mejora que se usó
                            if (expertReview?.type === 'environmental' || expertReview?.type === 'legal') {
                              // Fue un experto (ambiental o legal)
                              requestExpertReview(expertReview.type)
                            } else if (expertReview?.type === 'rag') {
                              // Fue experto RAG - reabrir modal
                              openRAGModal()
                            } else {
                              // Fue mejora simple de redacción
                              enhanceContent()
                            }
                          }}
                          disabled={loading || loadingExpert || loadingRAG}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {expertReview?.type === 'environmental' ? 'Regenerar Ambiental' :
                           expertReview?.type === 'legal' ? 'Regenerar Legal' : 
                           expertReview?.type === 'rag' ? 'Regenerar RAG' : 'Regenerar'}
                        </button>
                        <button
                          onClick={handleRejectEnhanced}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Descartar
                        </button>
                        <button
                          onClick={handleAcceptEnhanced}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Aceptar
                        </button>
                      </>
                    )}
                    {selectedVersion && !enhancedContent && (
                      <>
                        <button
                          onClick={() => {
                            setCompareMode(false)
                            setSelectedVersion(null)
                            setCompareWith(null)
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cerrar
                        </button>
                        <button
                          onClick={() => handleRestoreVersion(selectedVersion)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restaurar v{selectedVersion.version_number}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Paneles lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Panel izquierdo */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className={`px-3 py-2 border-b border-slate-200 dark:border-slate-700 ${
                      enhancedContent 
                        ? 'bg-slate-50 dark:bg-slate-900/50' 
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      <div className={`flex items-center gap-2 text-sm font-medium ${
                        enhancedContent 
                          ? 'text-slate-600 dark:text-slate-400' 
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {enhancedContent ? (
                          <>
                            <FileText className="w-4 h-4" />
                            Texto Original
                          </>
                        ) : (
                          <>
                            <History className="w-4 h-4" />
                            Versión Anterior ({selectedVersion?.version_number})
                          </>
                        )}
                      </div>
                    </div>
                    <div 
                      ref={diffLeftRef}
                      onScroll={() => handleDiffScroll('left')}
                      className="p-3 max-h-64 overflow-y-auto text-sm leading-relaxed"
                    >
                      <DiffView diffResult={diffResult} showType="removed" />
                    </div>
                  </div>
                  
                  {/* Panel derecho */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className={`px-3 py-2 border-b border-slate-200 dark:border-slate-700 ${
                      enhancedContent 
                        ? expertReview?.type === 'environmental'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20'
                          : expertReview?.type === 'legal'
                            ? 'bg-amber-50 dark:bg-amber-900/20'
                            : expertReview?.type === 'rag'
                              ? 'bg-cyan-50 dark:bg-cyan-900/20'
                              : 'bg-green-50 dark:bg-green-900/20' 
                        : 'bg-blue-50 dark:bg-blue-900/20'
                    }`}>
                      <div className={`flex items-center gap-2 text-sm font-medium ${
                        enhancedContent 
                          ? expertReview?.type === 'environmental'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : expertReview?.type === 'legal'
                              ? 'text-amber-700 dark:text-amber-400'
                              : expertReview?.type === 'rag'
                                ? 'text-cyan-700 dark:text-cyan-400'
                                : 'text-green-700 dark:text-green-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}>
                        {enhancedContent ? (
                          expertReview?.type === 'environmental' ? (
                            <>
                              <Leaf className="w-4 h-4" />
                              Sugerencia Experto Ambiental
                            </>
                          ) : expertReview?.type === 'legal' ? (
                            <>
                              <Scale className="w-4 h-4" />
                              Sugerencia Experto Legal
                            </>
                          ) : expertReview?.type === 'rag' ? (
                            <>
                              <FileSearch className="w-4 h-4" />
                              Sugerencia Experto RAG
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Sugerencia AI (pendiente)
                            </>
                          )
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Versión Actual
                          </>
                        )}
                      </div>
                    </div>
                    <div 
                      ref={diffRightRef}
                      onScroll={() => handleDiffScroll('right')}
                      className="p-3 max-h-64 overflow-y-auto text-sm leading-relaxed"
                    >
                      <DiffView diffResult={diffResult} showType="added" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Fuentes del Experto (fuera del comparador) */}
            {expertReview?.sources && compareMode && (
              <div className={`mt-4 p-4 rounded-lg border ${
                expertReview.type === 'environmental'
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {expertReview.type === 'environmental' ? (
                    <Leaf className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <h5 className={`text-sm font-medium ${
                    expertReview.type === 'environmental'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {expertReview.type === 'environmental' 
                      ? '🌿 Fuentes y Referencias Técnicas'
                      : '⚖️ Referencias Normativas y Bibliográficas'}
                  </h5>
                </div>
                <div 
                  className={`prose prose-sm dark:prose-invert max-w-none text-sm
                    prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline hover:prose-a:no-underline
                    prose-ul:my-1 prose-li:my-0.5 prose-li:text-slate-600 dark:prose-li:text-slate-400
                    ${expertReview.type === 'environmental'
                      ? 'prose-strong:text-emerald-700 dark:prose-strong:text-emerald-400'
                      : 'prose-strong:text-amber-700 dark:prose-strong:text-amber-400'
                    }`}
                  dangerouslySetInnerHTML={{ __html: expertReview.sources }}
                />
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ExternalLink className="w-3 h-3" />
                  Verifique siempre la información en los portales oficiales de OEFA, MINAM y demás entidades competentes.
                </p>
              </div>
            )}
            
            {/* Historial de versiones */}
            {activeTab === 'history' && !compareMode && (
              <div>
                {/* Header con acciones */}
                {versions.length > 0 && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {versions.length} versión{versions.length !== 1 ? 'es' : ''} guardada{versions.length !== 1 ? 's' : ''}
                      </span>
                      {versions.some(v => v.version_type?.includes('ai') || v.version_type?.includes('expert')) && (
                        <span className="px-2 py-0.5 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Enhancer activo
                        </span>
                      )}
                    </div>
                    {versions.filter(v => !v.is_current).length > 0 && (
                      <button
                        onClick={handleDeleteAllVersions}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Eliminar todas las versiones antiguas"
                      >
                        <Trash2 className="w-3 h-3" />
                        Borrar historial
                      </button>
                    )}
                  </div>
                )}
                
                {loadingVersions ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Cargando versiones...
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No hay versiones guardadas</p>
                    <p className="text-xs mt-1">Las versiones se guardan al aceptar mejoras de AI</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((version, index) => (
                      <div
                        key={version.id}
                        className={`
                          flex items-center justify-between p-3 rounded-lg border transition-all
                          ${version.is_current
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {/* Icono circular con tipo de versión */}
                          <div className={`
                            w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                            ${version.is_current
                              ? 'bg-green-500 text-white'
                              : version.version_type === 'ai_enhanced'
                                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                                : version.version_type === 'expert_environmental'
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                                  : version.version_type === 'expert_legal'
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                                    : version.version_type === 'expert_rag'
                                      ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400'
                                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }
                          `}>
                            {version.is_current ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : version.version_type === 'ai_enhanced' ? (
                              <Wand2 className="w-4 h-4" />
                            ) : version.version_type === 'expert_environmental' ? (
                              <Leaf className="w-4 h-4" />
                            ) : version.version_type === 'expert_legal' ? (
                              <Scale className="w-4 h-4" />
                            ) : version.version_type === 'expert_rag' ? (
                              <FileSearch className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                v{version.version_number}
                              </span>
                              {/* Badge según quién ofreció los cambios - SIEMPRE visible */}
                              {version.version_type === 'ai_enhanced' && (
                                <span className="px-2 py-0.5 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 rounded-full flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  Redactor AI
                                </span>
                              )}
                              {version.version_type === 'expert_environmental' && (
                                <span className="px-2 py-0.5 text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full flex items-center gap-1">
                                  <Leaf className="w-3 h-3" />
                                  Experto Ambiental
                                </span>
                              )}
                              {version.version_type === 'expert_legal' && (
                                <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full flex items-center gap-1">
                                  <Scale className="w-3 h-3" />
                                  Experto Legal
                                </span>
                              )}
                              {version.version_type === 'expert_rag' && (
                                <span className="px-2 py-0.5 text-xs bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 rounded-full flex items-center gap-1">
                                  <FileSearch className="w-3 h-3" />
                                  Experto RAG
                                </span>
                              )}
                              {(!version.version_type || version.version_type === 'manual') && (
                                <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  Manual
                                </span>
                              )}
                              {version.is_current && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full font-medium">
                                  Actual
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {formatDate(version.created_at)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Acciones - simplificadas */}
                        <div className="flex items-center gap-1">
                          {!version.is_current && (
                            <>
                              <button
                                onClick={() => handleViewVersion(version)}
                                className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title="Ver esta versión"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Ver</span>
                              </button>
                              <button
                                onClick={() => handleRestoreVersion(version)}
                                className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Restaurar esta versión"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Restaurar</span>
                              </button>
                              <button
                                onClick={() => handleDeleteVersion(version)}
                                className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Eliminar esta versión"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {version.is_current && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              En uso
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <button
                  onClick={enhanceContent}
                  className="mt-2 text-sm text-red-700 dark:text-red-300 underline hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            )}
            
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-violet-200 dark:border-violet-800 rounded-full animate-pulse" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-violet-500 animate-bounce" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Mejorando redacción...
                </p>
                <AnimatedProgressText 
                  texts={PROGRESS_TEXTS.enhance}
                  interval={4000}
                  className="text-xs text-center text-slate-400"
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* ============================================
          MODAL EXPERTO RAG
          ============================================ */}
      {showRAGModal && (
        <div className=" top-0 left-0 right-0 bottom-0 fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in" style={{ zIndex: 100 }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-cyan-500 to-blue-600 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FileSearch className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Experto RAG</h3>
                    <p className="text-xs text-white/80">
                      {caStore ? `Store: ${caStore.displayName}` : 'Enriquecer texto con documentos'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRAGModal(false)}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Content - Two Column Layout */}
            <div className="flex-1 overflow-hidden flex">
              {/* Left Column - Documents */}
              <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-slate-700">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <button
                    onClick={() => setRagTab('documents')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      ragTab === 'documents'
                        ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-900/20'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 inline mr-2" />
                    Documentos del CA
                    {caStoreDocuments.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 rounded-full">
                        {caStoreDocuments.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setRagTab('other-stores')
                      if (ragStores.caStores.length === 0 && ragStores.globalStores.length === 0) {
                        loadRAGStores()
                      }
                    }}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      ragTab === 'other-stores'
                        ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-900/20'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <FolderSearch className="w-4 h-4 inline mr-2" />
                    Otros Stores
                  </button>
                </div>
                
                {/* Tab Content */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                  {/* Loading CA Store */}
                  {loadingCAStore && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mb-3" />
                      <p className="text-sm text-slate-500">Configurando store del CA...</p>
                    </div>
                  )}
                  
                  {/* Tab: Documentos del CA */}
                  {!loadingCAStore && ragTab === 'documents' && (
                    <>
                      {/* Upload Zone */}
                      <div 
                        className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                          !caStore || uploadingFile 
                            ? 'border-slate-400 dark:border-slate-600 opacity-60' 
                            : 'border-slate-300 dark:border-slate-600 hover:border-cyan-400 dark:hover:border-cyan-500 cursor-pointer'
                        }`}
                        onClick={() => {
                          if (caStore && !uploadingFile) {
                            document.getElementById('rag-file-upload')?.click()
                          } else if (!caStore) {
                            toast.error('Esperando configuración del store...')
                          }
                        }}
                      >
                        <input
                          type="file"
                          id="rag-file-upload"
                          accept=".pdf,.txt,.doc,.docx"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              uploadFileToCAStore(file)
                              e.target.value = '' // Reset input
                            }
                          }}
                          className="hidden"
                          disabled={uploadingFile}
                        />
                        <div
                          className={`flex flex-col items-center justify-center ${
                            uploadingFile ? 'opacity-50' : ''
                          }`}
                        >
                          {uploadingFile ? (
                            <>
                              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-2" />
                              <span className="text-sm text-slate-500">Subiendo archivo...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-slate-400 mb-2" />
                              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                Clic para subir archivo
                              </span>
                              <span className="text-xs text-slate-400 mt-1">
                                PDF, TXT, DOC (máx. 50MB)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Lista de documentos */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Documentos cargados
                          </h4>
                          {selectedRAGStore && (
                            <button
                              onClick={() => loadCAStoreDocuments(selectedRAGStore.name)}
                              className="p-1.5 text-slate-400 hover:text-cyan-500 rounded transition-colors"
                              title="Recargar lista"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        
                        {caStoreDocuments.length === 0 ? (
                          <div className="py-6 text-center bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                            <FileTextIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No hay documentos aún</p>
                            <p className="text-xs text-slate-400 mt-1">Sube PDFs para enriquecer tu redacción</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {caStoreDocuments.map(doc => (
                              <div
                                key={doc.name}
                                className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg group overflow-hidden"
                              >
                                <File className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 break-words">
                                    {doc.displayName || doc.originalFilename || 'Documento'}
                                  </p>
                                  {doc.sizeBytes && (
                                    <p className="text-xs text-slate-400">
                                      {(doc.sizeBytes / 1024).toFixed(1)} KB
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => deleteDocumentFromStore(doc.name)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                                  title="Eliminar documento"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {/* Tab: Otros Stores */}
                  {!loadingCAStore && ragTab === 'other-stores' && (
                    <div className="space-y-2">
                      {loadingRAGStores ? (
                        <div className="flex items-center gap-2 p-4 justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                          <span className="text-sm text-slate-500">Cargando stores...</span>
                        </div>
                      ) : (
                        <>
                          {caStore && (
                            <button
                              onClick={() => selectStoreAndLoadDocs(caStore)}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                selectedRAGStore?.name === caStore.name
                                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-cyan-300'
                              }`}
                            >
                              <BookOpen className={`w-5 h-5 ${
                                selectedRAGStore?.name === caStore.name ? 'text-cyan-500' : 'text-slate-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate text-slate-700 dark:text-slate-300">
                                  {caStore.displayName}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 text-xs bg-cyan-500 text-white rounded-full">
                                CA Actual
                              </span>
                            </button>
                          )}
                          
                          {ragStores.caStores.filter(s => s.name !== caStore?.name).map(store => (
                            <button
                              key={store.name}
                              onClick={() => selectStoreAndLoadDocs(store)}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                selectedRAGStore?.name === store.name
                                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-cyan-300'
                              }`}
                            >
                              <BookOpen className={`w-4 h-4 ${
                                selectedRAGStore?.name === store.name ? 'text-cyan-500' : 'text-slate-400'
                              }`} />
                              <p className="text-sm truncate text-slate-700 dark:text-slate-300">
                                {store.displayName || store.name.split('/').pop()}
                              </p>
                            </button>
                          ))}
                          
                          {ragStores.globalStores.length > 0 && (
                            <>
                              <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">Stores Globales:</p>
                              {ragStores.globalStores.map(store => (
                                <button
                                  key={store.name}
                                  onClick={() => selectStoreAndLoadDocs(store)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                    selectedRAGStore?.name === store.name
                                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                      : 'border-slate-200 dark:border-slate-700 hover:border-cyan-300'
                                  }`}
                                >
                                  <FolderSearch className={`w-4 h-4 ${
                                    selectedRAGStore?.name === store.name ? 'text-cyan-500' : 'text-slate-400'
                                  }`} />
                                  <p className="text-sm truncate text-slate-700 dark:text-slate-300">
                                    {store.displayName || store.name.split('/').pop()}
                                  </p>
                                </button>
                              ))}
                            </>
                          )}
                          
                          {ragStores.caStores.length === 0 && ragStores.globalStores.length === 0 && !caStore && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-center">
                              <p className="text-sm text-slate-500">No hay otros stores disponibles</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Right Column - Instructions */}
              <div className="w-80 flex flex-col bg-slate-50 dark:bg-slate-900/30">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-cyan-500" />
                    Instrucción para el Experto
                  </h4>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <textarea
                    value={ragInstruction}
                    onChange={(e) => setRagInstruction(e.target.value)}
                    placeholder="Ej: Busca información sobre límites máximos permisibles de hidrocarburos en suelos y añádela al texto..."
                    className="flex-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none text-sm"
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    Describe qué información buscar en los documentos y cómo integrarla al texto.
                  </p>
                  
                  {/* Store info */}
                  {selectedRAGStore && (
                    <div className="mt-4 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                      <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="font-medium">Store seleccionado:</span>
                      </div>
                      <p className="text-sm text-cyan-800 dark:text-cyan-200 mt-1 truncate">
                        {selectedRAGStore.displayName || 'Store'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setShowRAGModal(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={requestRAGEnrichment}
                disabled={!selectedRAGStore || !ragInstruction.trim() || loadingRAG || (selectedRAGStore?.name === caStore?.name && caStoreDocuments.length === 0)}
                className={`flex items-center gap-2 px-5 py-2 text-sm rounded-lg transition-all ${
                  selectedRAGStore && ragInstruction.trim() && !loadingRAG && !(selectedRAGStore?.name === caStore?.name && caStoreDocuments.length === 0)
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
                title={selectedRAGStore?.name === caStore?.name && caStoreDocuments.length === 0 ? 'Primero sube documentos al store del CA' : ''}
              >
                {loadingRAG ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enriquecer Texto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Componente para mostrar el diff con highlighting
 */
const DiffView = ({ diffResult, showType }) => {
  if (!diffResult || diffResult.length === 0) {
    return <span className="text-slate-400">Sin contenido</span>
  }
  
  return (
    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
      {diffResult.map((part, index) => {
        if (part.added) {
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

export default AIEnhancePanel
