import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { 
  X, 
  MapPin, 
  Calendar, 
  User, 
  FileText, 
  Layers, 
  Mountain,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize2,
  Info,
  Camera,
  PenTool,
  Pencil,
  Save,
  Undo2,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { diffWords } from 'diff'
import { PhotoAnnotationTool } from './PhotoAnnotationTool'

// Helper para generar ID único por foto (globalid + filename)
// Debe coincidir con la función en HechosSection.jsx
const getPhotoUniqueId = (foto) => {
  if (!foto) return null
  return `${foto.globalid || foto.gid}_${foto.filename || ''}`
}

/**
 * Modal para ver foto maximizada con metadata ambiental relevante
 * Optimizado para navegación rápida entre fotos
 */
export const PhotoDetailModal = ({
  isOpen,
  onClose,
  foto,
  fotos = [], // Array completo para navegación
  currentIndex = 0,
  onNavigate, // Callback para cambiar foto
  descripcionesEditadas = {},
  metadataEditadas = {}, // Map: globalid -> { componente?, instalacion_referencia? }
  annotations = {}, // Map: globalid -> array de anotaciones
  onAnnotationsChange, // Callback para guardar anotaciones
  onDescripcionChange,
  onGuardarDescripcion,
  onRevertDescripcion,
  onMetadataChange, // Callback para cambiar metadata editada
  onGuardarMetadata, // Callback para guardar metadata
  savingDescripcion,
  savingMetadata
}) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [showMetadata, setShowMetadata] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
  const [isAnnotating, setIsAnnotating] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [descripcionBackup, setDescripcionBackup] = useState('')
  const [metadataBackup, setMetadataBackup] = useState({})
  // Estados para AI Enhancement de descripción
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhancedDescription, setEnhancedDescription] = useState('')
  const [previousDescription, setPreviousDescription] = useState('') // Solo la versión inmediata anterior
  const [showDiff, setShowDiff] = useState(false)
  const imageRef = useRef(null)
  const canvasOverlayRef = useRef(null)
  
  const { session } = useAuth()
  const API_BASE = 'http://localhost:3000'

  // Usar ID único por foto para descripciones y anotaciones
  const photoId = getPhotoUniqueId(foto)
  const descripcionEditable = photoId ? (descripcionesEditadas[photoId] ?? foto?.descripcion ?? '') : ''
  const descripcionOriginal = foto?.descripcion_original ?? foto?.descripcion ?? ''
  
  // Metadata editables - componente e instalacion_referencia
  // Nota: Metadata usa globalid porque aplica a todo el registro, no a foto individual
  const metadataActual = foto?.globalid ? (metadataEditadas[foto.globalid] || {}) : {}
  const componenteEditable = metadataActual.componente ?? foto?.componente ?? ''
  const instalacionEditable = metadataActual.instalacion_referencia ?? foto?.instalacion_referencia ?? ''
  const componenteOriginal = foto?.componente ?? ''
  const instalacionOriginal = foto?.instalacion_referencia ?? ''

  const handleStartEditingDescripcion = () => {
    setDescripcionBackup(descripcionEditable)
    setIsEditingDescription(true)
  }

  const handleCancelDescripcion = () => {
    if (photoId && onDescripcionChange) {
      onDescripcionChange(photoId, descripcionBackup)
    }
    setIsEditingDescription(false)
  }

  const handleSaveDescripcion = () => {
    if (photoId && onGuardarDescripcion) {
      onGuardarDescripcion(photoId, descripcionEditable)
    }
    setIsEditingDescription(false)
  }

  const handleRevertDescripcion = () => {
    if (photoId && onRevertDescripcion) {
      onRevertDescripcion(photoId, descripcionOriginal)
    }
    setIsEditingDescription(false)
  }

  // Handlers para edición de metadata (componente, instalacion_referencia)
  const handleStartEditingMetadata = () => {
    setMetadataBackup({ componente: componenteEditable, instalacion_referencia: instalacionEditable })
    setIsEditingMetadata(true)
  }

  const handleCancelMetadata = () => {
    if (foto?.globalid && onMetadataChange) {
      onMetadataChange(foto.globalid, metadataBackup)
    }
    setIsEditingMetadata(false)
  }

  const handleSaveMetadata = () => {
    console.log('[PhotoDetailModal] 💾 handleSaveMetadata llamado:', {
      fotoGlobalid: foto?.globalid,
      hasOnGuardarMetadata: !!onGuardarMetadata,
      componente: componenteEditable,
      instalacion: instalacionEditable
    })
    
    if (foto?.globalid && onGuardarMetadata) {
      onGuardarMetadata(foto.globalid, { componente: componenteEditable, instalacion_referencia: instalacionEditable })
    } else {
      console.error('[PhotoDetailModal] ❌ No se puede guardar:', {
        fotoGlobalid: foto?.globalid,
        hasOnGuardarMetadata: !!onGuardarMetadata
      })
    }
    setIsEditingMetadata(false)
  }

  const handleRevertMetadata = () => {
    if (foto?.globalid && onMetadataChange) {
      onMetadataChange(foto.globalid, { componente: componenteOriginal, instalacion_referencia: instalacionOriginal })
    }
    setIsEditingMetadata(false)
  }

  const handleMetadataFieldChange = (field, value) => {
    if (foto?.globalid && onMetadataChange) {
      const current = metadataEditadas[foto.globalid] || {}
      onMetadataChange(foto.globalid, { ...current, [field]: value })
    }
  }

  // ============================================
  // AI Enhancement para descripción de fotos
  // ============================================
  
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])

  // Mejorar descripción con AI
  const handleEnhanceDescription = async () => {
    if (!descripcionEditable || descripcionEditable.trim().length < 10) {
      toast.error('Escribe al menos 10 caracteres para mejorar')
      return
    }
    
    setIsEnhancing(true)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-enhance`,
        {
          content: descripcionEditable,
          fieldType: 'foto_descripcion',
          context: {
            componente: foto?.componente,
            tipo_componente: foto?.tipo_componente,
            hecho_detec: foto?.hecho_detec,
            supervisor: foto?.supervisor || foto?.nombre_supervisor
          }
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        // Guardar versión anterior antes de mostrar la mejorada
        setPreviousDescription(descripcionEditable)
        setEnhancedDescription(response.data.enhanced)
        setShowDiff(true)
        toast.success('Texto mejorado generado')
      } else {
        toast.error(response.data.error || 'Error al mejorar texto')
      }
    } catch (err) {
      console.error('Error en AI Enhancement:', err)
      toast.error(err.response?.data?.error || 'Error al conectar con el servicio de AI')
    } finally {
      setIsEnhancing(false)
    }
  }

  // Aceptar el texto mejorado
  const handleAcceptEnhanced = () => {
    if (photoId && onDescripcionChange && enhancedDescription) {
      // El previousDescription ya tiene el texto anterior (guardado antes de mostrar el enhanced)
      onDescripcionChange(photoId, enhancedDescription)
      setEnhancedDescription('')
      setShowDiff(false)
      toast.success('Texto mejorado aplicado')
    }
  }

  // Rechazar el texto mejorado
  const handleRejectEnhanced = () => {
    setEnhancedDescription('')
    setShowDiff(false)
  }

  // Revertir a la versión inmediata anterior
  const handleRevertToPrevious = () => {
    if (photoId && onDescripcionChange && previousDescription) {
      // Guardar el actual como nuevo "anterior" antes de revertir
      const currentText = descripcionEditable
      onDescripcionChange(photoId, previousDescription)
      setPreviousDescription(currentText)
      toast.success('Revertido a versión anterior')
    }
  }

  // Calcular diff entre texto actual y mejorado
  const diffResult = useMemo(() => {
    if (!showDiff || !enhancedDescription) return []
    const original = descripcionEditable || ''
    const enhanced = enhancedDescription || ''
    return diffWords(original, enhanced)
  }, [showDiff, descripcionEditable, enhancedDescription])

  // Reset state when photo changes
  useEffect(() => {
    setZoom(1)
    setRotation(0)
    setImageLoading(true)
    setImageError(false)
    setIsAnnotating(false)
    setIsEditingDescription(false)
    setIsEditingMetadata(false)
    // Reset enhancement states
    setEnhancedDescription('')
    setShowDiff(false)
    // No reseteamos previousDescription para mantener historial entre fotos del mismo CA
  }, [foto?.filename, foto?.gid])

  // Get current photo annotations - usar ID único por foto
  const currentAnnotations = photoId ? (annotations[photoId] || []) : []

  // Handle annotations change - usar ID único por foto
  const handleAnnotationsChange = (newAnnotations) => {
    if (onAnnotationsChange && photoId) {
      onAnnotationsChange(photoId, newAnnotations)
    }
    setIsAnnotating(false)
  }

  // Draw annotations overlay on the image
  // El canvas se escala junto con la imagen via CSS transform
  useEffect(() => {
    if (!canvasOverlayRef.current || !imageRef.current || currentAnnotations.length === 0) return
    if (imageLoading || imageError) return
    if (!imageDimensions.width || !imageDimensions.height) return

    const canvas = canvasOverlayRef.current
    const img = imageRef.current
    const ctx = canvas.getContext('2d')

    // Dimensiones de la imagen SIN zoom (offsetWidth/Height no incluyen transform)
    const displayedWidth = img.offsetWidth
    const displayedHeight = img.offsetHeight

    // El canvas tiene el mismo tamaño base que la imagen
    canvas.width = displayedWidth
    canvas.height = displayedHeight

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Escala desde coordenadas originales de la imagen a coordenadas del canvas
    const scaleX = displayedWidth / imageDimensions.width
    const scaleY = displayedHeight / imageDimensions.height

    currentAnnotations.forEach(ann => {
      const color = ann.strokeColor || '#ff0000'
      const lineWidth = ann.strokeWidth || 3
      
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      
      // Determinar tipo de anotación
      const type = ann.type || 'ellipse'
      
      switch (type) {
        case 'ellipse':
        default:
          // Círculo/Óvalo
          if (ann.cx !== undefined) {
            const scaledCx = ann.cx * scaleX
            const scaledCy = ann.cy * scaleY
            const scaledRx = Math.abs(ann.rx || 0) * scaleX
            const scaledRy = Math.abs(ann.ry || 0) * scaleY
            
            if (scaledRx > 0 && scaledRy > 0) {
              ctx.beginPath()
              ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, 0, 0, 2 * Math.PI)
              ctx.stroke()
            }
          }
          break
          
        case 'rectangle':
          // Rectángulo sin fondo
          if (ann.x !== undefined) {
            const scaledX = ann.x * scaleX
            const scaledY = ann.y * scaleY
            const scaledWidth = ann.width * scaleX
            const scaledHeight = ann.height * scaleY
            
            ctx.beginPath()
            ctx.rect(scaledX, scaledY, scaledWidth, scaledHeight)
            ctx.stroke()
          }
          break
          
        case 'background':
          // Fondo con relleno semitransparente
          if (ann.x !== undefined) {
            const scaledX = ann.x * scaleX
            const scaledY = ann.y * scaleY
            const scaledWidth = ann.width * scaleX
            const scaledHeight = ann.height * scaleY
            
            // Fondo con transparencia configurable (50%-100%)
            ctx.save()
            ctx.globalAlpha = ann.opacity || 0.5
            ctx.fillStyle = color
            ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight)
            ctx.restore()
            
            // Borde
            ctx.beginPath()
            ctx.rect(scaledX, scaledY, scaledWidth, scaledHeight)
            ctx.stroke()
          }
          break
          
        case 'arrow':
          // Flecha con punta triangular
          if (ann.startX !== undefined) {
            const scaledStartX = ann.startX * scaleX
            const scaledStartY = ann.startY * scaleY
            const scaledEndX = ann.endX * scaleX
            const scaledEndY = ann.endY * scaleY
            
            // Calcular ángulo de la flecha
            const angle = Math.atan2(scaledEndY - scaledStartY, scaledEndX - scaledStartX)
            
            // Tamaño de la punta proporcional al grosor
            const headLength = Math.max(15, lineWidth * 4)
            
            // Línea principal (hasta antes de la punta)
            const lineEndX = scaledEndX - Math.cos(angle) * headLength * 0.8
            const lineEndY = scaledEndY - Math.sin(angle) * headLength * 0.8
            
            ctx.beginPath()
            ctx.moveTo(scaledStartX, scaledStartY)
            ctx.lineTo(lineEndX, lineEndY)
            ctx.stroke()
            
            // Punta triangular (rellena)
            const tip1X = scaledEndX - headLength * Math.cos(angle - Math.PI / 6)
            const tip1Y = scaledEndY - headLength * Math.sin(angle - Math.PI / 6)
            const tip2X = scaledEndX - headLength * Math.cos(angle + Math.PI / 6)
            const tip2Y = scaledEndY - headLength * Math.sin(angle + Math.PI / 6)
            
            ctx.beginPath()
            ctx.moveTo(scaledEndX, scaledEndY)
            ctx.lineTo(tip1X, tip1Y)
            ctx.lineTo(tip2X, tip2Y)
            ctx.closePath()
            ctx.fill()
          }
          break
          
        case 'text':
          // Texto (con soporte para saltos de línea)
          if (ann.x !== undefined && ann.text) {
            const scaledX = ann.x * scaleX
            const scaledY = ann.y * scaleY
            const scaledSize = (ann.fontSize || 24) * Math.min(scaleX, scaleY)
            const lineHeight = scaledSize * 1.2
            
            ctx.font = `bold ${scaledSize}px Arial, sans-serif`
            ctx.fillStyle = color
            ctx.textBaseline = 'top'
            
            // Sombra para mejor legibilidad
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
            ctx.shadowBlur = 4
            ctx.shadowOffsetX = 2
            ctx.shadowOffsetY = 2
            
            // Dividir texto por saltos de línea y dibujar cada línea
            const lines = ann.text.split('\n')
            lines.forEach((line, index) => {
              ctx.fillText(line, scaledX, scaledY + index * lineHeight)
            })
            
            // Reset sombra
            ctx.shadowColor = 'transparent'
            ctx.shadowBlur = 0
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = 0
          }
          break
      }
    })
  }, [currentAnnotations, imageLoading, imageError, imageDimensions])

  // Keyboard navigation - DESACTIVAR cuando está abierta la herramienta de anotaciones
  useEffect(() => {
    if (!isOpen) return
    // Si está anotando, no aplicar atajos del visualizador
    if (isAnnotating) return

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (currentIndex > 0 && onNavigate) {
            onNavigate(currentIndex - 1)
          }
          break
        case 'ArrowRight':
          if (currentIndex < fotos.length - 1 && onNavigate) {
            onNavigate(currentIndex + 1)
          }
          break
        case '+':
        case '=':
          setZoom(z => Math.min(z + 0.25, 3))
          break
        case '-':
          setZoom(z => Math.max(z - 0.25, 0.5))
          break
        case 'r':
          setRotation(r => (r + 90) % 360)
          break
        case 'i':
          setShowMetadata(s => !s)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, currentIndex, fotos.length, onNavigate, isAnnotating])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !foto) return null

  // Format date - handles Unix timestamps, ISO strings, and dd/mm/yyyy formats
  const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
      let date
      
      // Handle numeric timestamps (Unix ms from ArcGIS)
      if (typeof dateStr === 'number') {
        // ArcGIS timestamps are in milliseconds
        date = new Date(dateStr)
      } 
      // Handle string that looks like a timestamp (all digits, typically 13 digits for ms)
      else if (typeof dateStr === 'string' && /^\d{10,13}$/.test(dateStr.trim())) {
        const ts = parseInt(dateStr.trim(), 10)
        // If 10 digits, it's seconds; if 13, it's milliseconds
        date = new Date(ts.toString().length === 10 ? ts * 1000 : ts)
      }
      // Handle dd/mm/yyyy format
      else if (typeof dateStr === 'string' && /^(\d{1,2})[\/](\d{1,2})[\/](\d{4})(.*)$/.test(dateStr)) {
        const match = dateStr.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})(.*)$/)
        const day = parseInt(match[1], 10)
        const month = parseInt(match[2], 10) - 1
        const year = parseInt(match[3], 10)
        const rest = match[4]?.trim()
        if (rest) {
          date = new Date(`${year}-${month + 1}-${day} ${rest}`)
        } else {
          date = new Date(year, month, day)
        }
      }
      // Handle ISO strings and other formats
      else {
        date = new Date(dateStr)
      }
      
      // Validate the date
      if (isNaN(date.getTime())) return null
      
      // Check if date is reasonable (between 2000 and 2100)
      const year = date.getFullYear()
      if (year < 2000 || year > 2100) return null
      
      return new Intl.DateTimeFormat('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date)
    } catch {
      return null
    }
  }

  // Format supervisor name
  const formatSupervisor = (name) => {
    if (!name) return null
    return name.replace(/_/g, ' ')
  }

  // Verificar si hay ediciones locales de metadata
  const hasMetadataEdits = foto?.globalid && metadataEditadas[foto.globalid] && (
    metadataEditadas[foto.globalid].componente !== undefined ||
    metadataEditadas[foto.globalid].instalacion_referencia !== undefined
  )

  // Metadata groups for environmental relevance (sin componente/instalación que se editan aparte)
  const metadataGroups = [
    {
      title: 'Ubicación',
      icon: MapPin,
      color: 'blue',
      items: [
        { label: 'Tipo', value: foto.tipo_componente },
        { label: 'Subcomponente', value: foto.subcomponente },
        { label: 'Coordenadas UTM', value: foto.coordenadas || (foto.x && foto.y ? `E: ${foto.x}, N: ${foto.y}` : null) },
      ].filter(i => i.value)
    },
    {
      title: 'Supervisión',
      icon: User,
      color: 'green',
      items: [
        { label: 'Supervisor', value: formatSupervisor(foto.supervisor || foto.nombre_supervisor) },
        { label: 'Fecha', value: formatDate(foto.fecha || foto.creation_date || foto.created_date) },
        { label: 'Tipo de Reporte', value: foto.tipo_de_reporte },
        { label: 'Modalidad', value: foto.modalidad },
      ].filter(i => i.value)
    },
    {
      title: 'Hecho Detectado',
      icon: FileText,
      color: 'amber',
      items: [
        { label: 'Hecho', value: foto.hecho_detec },
        { label: 'Fuente', value: foto.fuente },
      ].filter(i => i.value)
    }
  ].filter(g => g.items.length > 0)

  // Usar createPortal para renderizar directamente en body, evitando problemas de z-index
  // cuando el modal se abre desde un contexto con z-index menor (como ChatAI)
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full h-full flex flex-col">
        {/* Header */}
        <div className={`absolute top-0 left-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 ${showMetadata ? 'right-80' : 'right-0'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Cerrar (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-white">
                <h3 className="font-semibold text-lg">
                  {foto.componente || 'Sin componente'}
                </h3>
                <p className="text-sm text-white/70">
                  Foto {currentIndex + 1} de {fotos.length} • {foto.filename}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Alejar (-)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-sm min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Acercar (+)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-white/30 mx-2" />
              <button
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Rotar (R)"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowMetadata(s => !s)}
                className={`p-2 rounded-lg transition-colors ${
                  showMetadata 
                    ? 'bg-blue-500/50 text-white' 
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="Mostrar/Ocultar metadata (I)"
              >
                <Info className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-white/30 mx-2" />
              <button
                onClick={() => setIsAnnotating(true)}
                className="px-3 py-2 rounded-lg transition-colors flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium shadow-lg"
                title="Anotar foto - Círculos, rectángulos, flechas y texto"
              >
                <PenTool className="w-4 h-4" />
                {currentAnnotations.length > 0 ? (
                  <span>Editar anotaciones ({currentAnnotations.length})</span>
                ) : (
                  <span>Anotar</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Image Container */}
          <div className={`flex-1 flex items-center justify-center p-4 ${showMetadata ? 'pr-4' : ''}`}>
            {/* Navigation Left */}
            {currentIndex > 0 && onNavigate && (
              <button
                onClick={() => onNavigate(currentIndex - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                title="Anterior (←)"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}

            {/* Image */}
            <div className="relative max-w-full max-h-full">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {imageError ? (
                <div className="flex flex-col items-center justify-center text-white/50 p-8">
                  <Camera className="w-24 h-24 mb-4" />
                  <p>No se pudo cargar la imagen</p>
                </div>
              ) : (
                <div className="relative">
                  <img
                    ref={imageRef}
                    src={foto.url}
                    alt={foto.filename}
                    className="max-w-full max-h-[calc(100vh-140px)] object-contain transition-transform duration-200"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    }}
                    onLoad={(e) => {
                      setImageLoading(false)
                      setImageDimensions({
                        width: e.target.naturalWidth,
                        height: e.target.naturalHeight
                      })
                    }}
                    onError={() => {
                      setImageLoading(false)
                      setImageError(true)
                    }}
                    draggable={false}
                  />
                  {/* Canvas overlay para mostrar anotaciones */}
                  {currentAnnotations.length > 0 && !imageLoading && (
                    <canvas
                      ref={canvasOverlayRef}
                      className="absolute top-1/2 left-1/2 pointer-events-none"
                      style={{
                        transform: `translate(-50%, -50%) scale(${zoom}) rotate(${rotation}deg)`,
                        transformOrigin: 'center center'
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Navigation Right */}
            {currentIndex < fotos.length - 1 && onNavigate && (
              <button
                onClick={() => onNavigate(currentIndex + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                style={{ right: showMetadata ? '340px' : '16px' }}
                title="Siguiente (→)"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </div>

          {/* Metadata Panel */}
          {showMetadata && (
            <div className="w-80 bg-white dark:bg-slate-900/95 pink:bg-pink-50 backdrop-blur border-l border-slate-200 dark:border-white/10 pink:border-pink-200 overflow-y-auto">
              {/* Spacer for header to prevent overlap */}
              <div className="h-14" />
              <div className="p-4 pt-0 space-y-4">
                {/* Description */}
                <div className="bg-slate-100 dark:bg-white/5 pink:bg-pink-100/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-white/50 pink:text-pink-600 uppercase tracking-wide flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Descripción
                    </h4>
                    {/* Botón para revertir a versión anterior (siempre visible si hay anterior) */}
                    {previousDescription && !showDiff && (
                      <button
                        onClick={handleRevertToPrevious}
                        className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 pink:text-amber-600 hover:text-amber-700 dark:hover:text-amber-300"
                        title="Revertir a versión anterior"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Anterior
                      </button>
                    )}
                  </div>

                  {isEditingDescription && foto?.globalid ? (
                    <>
                      {/* Vista de Diff cuando está activo */}
                      {showDiff && enhancedDescription ? (
                        <div className="space-y-3">
                          {/* Toggle para mostrar/ocultar diff */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 dark:text-white/50 pink:text-pink-500">
                              Vista de cambios
                            </span>
                            <button
                              onClick={() => setShowDiff(!showDiff)}
                              className={`p-1.5 rounded transition-colors ${
                                showDiff 
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                              }`}
                              title={showDiff ? 'Ocultar cambios' : 'Ver cambios'}
                            >
                              {showDiff ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          
                          {/* Diff inline - texto con cambios marcados */}
                          <div className="bg-white dark:bg-black/40 pink:bg-white border border-slate-300 dark:border-white/10 pink:border-pink-300 rounded-lg p-3 text-sm leading-relaxed max-h-48 overflow-y-auto">
                            {diffResult.map((part, index) => (
                              <span
                                key={index}
                                className={
                                  part.added
                                    ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-0.5 rounded'
                                    : part.removed
                                    ? 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 line-through px-0.5 rounded'
                                    : 'text-slate-700 dark:text-white/90 pink:text-pink-800'
                                }
                              >
                                {part.value}
                              </span>
                            ))}
                          </div>
                          
                          {/* Botones de acción para el diff */}
                          <div className="flex gap-2">
                            <button
                              onClick={handleRejectEnhanced}
                              className="flex-1 px-3 py-2 text-xs rounded bg-slate-200 dark:bg-white/10 pink:bg-pink-200 hover:bg-slate-300 dark:hover:bg-white/20 pink:hover:bg-pink-300 text-slate-700 dark:text-white pink:text-pink-700"
                            >
                              Descartar
                            </button>
                            <button
                              onClick={handleAcceptEnhanced}
                              className="flex-1 px-3 py-2 text-xs rounded bg-green-500 hover:bg-green-600 text-white flex items-center justify-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              Aceptar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Textarea normal de edición */}
                          <textarea
                            value={descripcionEditable}
                            onChange={(e) => onDescripcionChange && onDescripcionChange(photoId, e.target.value)}
                            placeholder="Describe lo observado en la foto"
                            className="w-full text-sm text-slate-900 dark:text-white pink:text-pink-900 bg-white dark:bg-black/40 pink:bg-white border border-slate-300 dark:border-white/10 pink:border-pink-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 pink:focus:ring-pink-400 resize-none"
                            rows={8}
                          />
                          <div className="flex flex-col gap-2 mt-3">
                            {/* Fila superior: Revertir original + AI Enhance + Contador */}
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={handleRevertDescripcion}
                                className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/60 pink:text-pink-500 hover:text-slate-700 dark:hover:text-white pink:hover:text-pink-700"
                              >
                                <Undo2 className="w-3 h-3" />
                                Original
                              </button>
                              
                              {/* Botón Mejorar con AI */}
                              <button
                                onClick={handleEnhanceDescription}
                                disabled={isEnhancing || descripcionEditable.length < 10}
                                className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors ${
                                  isEnhancing || descripcionEditable.length < 10
                                    ? 'bg-purple-200/50 dark:bg-purple-900/20 text-purple-400 cursor-not-allowed'
                                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                                }`}
                                title="Mejorar redacción con AI"
                              >
                                {isEnhancing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                {isEnhancing ? 'Mejorando...' : 'Mejorar'}
                              </button>
                              
                              <span className="text-[11px] text-slate-400 dark:text-white/40 pink:text-pink-400">
                                {descripcionEditable.length} chars
                              </span>
                            </div>
                            
                            {/* Fila inferior: Cancelar + Guardar */}
                            <div className="flex gap-2">
                              <button
                                onClick={handleCancelDescripcion}
                                className="flex-1 px-3 py-2 text-xs rounded bg-slate-200 dark:bg-white/10 pink:bg-pink-200 hover:bg-slate-300 dark:hover:bg-white/20 pink:hover:bg-pink-300 text-slate-700 dark:text-white pink:text-pink-700"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={handleSaveDescripcion}
                                disabled={savingDescripcion === photoId}
                                className={`flex-1 px-3 py-2 text-xs rounded text-white flex items-center justify-center gap-1 ${
                                  savingDescripcion === photoId
                                    ? 'bg-green-500/40 cursor-not-allowed'
                                    : 'bg-green-500 hover:bg-green-600'
                                }`}
                              >
                                {savingDescripcion === photoId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Guardar
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 dark:text-white/90 pink:text-pink-800 leading-relaxed whitespace-pre-line mb-3">
                        {descripcionEditable || 'Sin descripción registrada para esta foto.'}
                      </p>
                      {foto?.globalid && (
                        <button
                          onClick={handleStartEditingDescripcion}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-200 dark:bg-white/10 pink:bg-pink-200 hover:bg-slate-300 dark:hover:bg-white/20 pink:hover:bg-pink-300 text-slate-700 dark:text-white pink:text-pink-700 flex items-center justify-center gap-2"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar descripción
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Componente e Instalación de Referencia - EDITABLES */}
                <div className="bg-slate-100 dark:bg-white/5 pink:bg-pink-100/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Componente e Instalación
                      {hasMetadataEdits && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-normal normal-case">
                          editado
                        </span>
                      )}
                    </h4>
                  </div>

                  {isEditingMetadata && foto?.globalid ? (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-white/50 pink:text-pink-500 mb-1">
                            Instalación de Referencia
                          </label>
                          <input
                            type="text"
                            value={instalacionEditable}
                            onChange={(e) => handleMetadataFieldChange('instalacion_referencia', e.target.value)}
                            placeholder="Ej: Planta de Residuos"
                            className="w-full text-sm text-slate-900 dark:text-white pink:text-pink-900 bg-white dark:bg-black/40 pink:bg-white border border-slate-300 dark:border-white/10 pink:border-pink-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 pink:focus:ring-pink-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-white/50 pink:text-pink-500 mb-1">
                            Componente
                          </label>
                          <input
                            type="text"
                            value={componenteEditable}
                            onChange={(e) => handleMetadataFieldChange('componente', e.target.value)}
                            placeholder="Ej: Trinchera 3"
                            className="w-full text-sm text-slate-900 dark:text-white pink:text-pink-900 bg-white dark:bg-black/40 pink:bg-white border border-slate-300 dark:border-white/10 pink:border-pink-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 pink:focus:ring-pink-400"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 mt-3">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={handleRevertMetadata}
                            className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/60 pink:text-pink-500 hover:text-slate-700 dark:hover:text-white pink:hover:text-pink-700"
                          >
                            <Undo2 className="w-3 h-3" />
                            Revertir a original
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelMetadata}
                            className="flex-1 px-3 py-2 text-xs rounded bg-slate-200 dark:bg-white/10 pink:bg-pink-200 hover:bg-slate-300 dark:hover:bg-white/20 pink:hover:bg-pink-300 text-slate-700 dark:text-white pink:text-pink-700"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleSaveMetadata}
                            disabled={savingMetadata === foto.globalid}
                            className={`flex-1 px-3 py-2 text-xs rounded text-white flex items-center justify-center gap-1 ${
                              savingMetadata === foto.globalid
                                ? 'bg-green-500/40 cursor-not-allowed'
                                : 'bg-green-500 hover:bg-green-600'
                            }`}
                          >
                            {savingMetadata === foto.globalid ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                            Guardar
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs text-slate-500 dark:text-white/50 pink:text-pink-500 flex-shrink-0">
                            Instalación:
                          </span>
                          <span className="text-sm text-slate-800 dark:text-white/90 pink:text-pink-800 text-right break-words min-w-0">
                            {instalacionEditable || <span className="text-slate-400 italic">Sin definir</span>}
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs text-slate-500 dark:text-white/50 pink:text-pink-500 flex-shrink-0">
                            Componente:
                          </span>
                          <span className="text-sm text-slate-800 dark:text-white/90 pink:text-pink-800 text-right break-words min-w-0">
                            {componenteEditable || <span className="text-slate-400 italic">Sin definir</span>}
                          </span>
                        </div>
                      </div>
                      {foto?.globalid && onMetadataChange && (
                        <button
                          onClick={handleStartEditingMetadata}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-200 dark:bg-white/10 pink:bg-pink-200 hover:bg-slate-300 dark:hover:bg-white/20 pink:hover:bg-pink-300 text-slate-700 dark:text-white pink:text-pink-700 flex items-center justify-center gap-2"
                        >
                          <Pencil className="w-3 h-3" />
                          Corregir datos
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Metadata Groups */}
                {metadataGroups.map((group, idx) => {
                  const Icon = group.icon
                  const colorClasses = {
                    blue: 'text-blue-400',
                    green: 'text-green-400',
                    amber: 'text-amber-400',
                  }
                  
                  return (
                    <div key={idx} className="bg-slate-100 dark:bg-white/5 pink:bg-pink-100/50 rounded-lg p-4">
                      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${colorClasses[group.color] || 'text-slate-500 dark:text-white/50 pink:text-pink-500'}`}>
                        <Icon className="w-4 h-4" />
                        {group.title}
                      </h4>
                      <div className="space-y-2">
                        {group.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex justify-between items-start gap-2">
                            <span className="text-xs text-slate-500 dark:text-white/50 pink:text-pink-500 flex-shrink-0">
                              {item.label}:
                            </span>
                            <span className="text-sm text-slate-800 dark:text-white/90 pink:text-pink-800 text-right break-words min-w-0">
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Keyboard shortcuts hint */}
                <div className="text-[10px] text-slate-400 dark:text-white/30 pink:text-pink-400 text-center pt-2">
                  ← → Navegar • + - Zoom • R Rotar • I Info • ESC Cerrar
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Herramienta de anotación */}
      {isAnnotating && (
        <PhotoAnnotationTool
          imageUrl={foto.url}
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          annotations={currentAnnotations}
          onAnnotationsChange={handleAnnotationsChange}
          isActive={isAnnotating}
          onClose={() => setIsAnnotating(false)}
        />
      )}
    </div>,
    document.body
  )
}

export default PhotoDetailModal
