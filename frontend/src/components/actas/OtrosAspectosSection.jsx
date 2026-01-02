import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  Camera,
  Image,
  Loader2,
  CheckCircle2,
  Circle,
  Pencil,
  Save,
  Sparkles,
  Wand2,
  FileText,
  Maximize2,
  ChevronRight,
  Check,
  MessageSquare
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { RichTextEditor } from '../RichTextEditor'
import { AIEnhancePanel } from '../AIEnhancePanel'
import { PhotoDetailModal } from './PhotoDetailModal'

const API_BASE = 'http://localhost:3000'

// Helper para generar ID único por foto
const getPhotoUniqueId = (foto) => {
  if (!foto) return null
  return `${foto.globalid || foto.gid}_${foto.filename || ''}`
}

const THUMB_WIDTH = 160
const THUMB_HEIGHT = 112
const PHOTOS_PER_PAGE = 20

export const OtrosAspectosSection = ({ borrador, codigoAccion, onStatusChange }) => {
  const { session } = useAuth()
  
  // Estados principales
  const [otrosAspectos, setOtrosAspectos] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Navegación de pasos (como en HechosSection) - solo 2 pasos
  const [detailStep, setDetailStep] = useState(1) // 1: Medios probatorios, 2: Descripción
  
  // Fotos disponibles y seleccionadas
  const [fotosDisponibles, setFotosDisponibles] = useState([])
  const [fotosSeleccionadas, setFotosSeleccionadas] = useState([])
  const [loadingFotos, setLoadingFotos] = useState(false)
  
  // Descripciones editables
  const [mostrarEditadas, setMostrarEditadas] = useState(true)
  const [descripcionesEditadas, setDescripcionesEditadas] = useState({})
  
  // Descripción general de Otros Aspectos
  const [descripcionOtrosAspectos, setDescripcionOtrosAspectos] = useState('')
  const [generatingDescription, setGeneratingDescription] = useState(false)
  
  // Modal de foto
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  
  // Paginación
  const [photosPage, setPhotosPage] = useState(0)
  const [photoDimensions, setPhotoDimensions] = useState({})
  
  // Ref para evitar recargas
  const lastLoadedCA = useRef(null)
  
  // Auth headers helper
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])
  
  // Clave para localStorage
  const getStorageKey = useCallback((suffix) => {
    if (!borrador?.id) return null
    return `acta_otros_aspectos_${borrador.id}_${suffix}`
  }, [borrador?.id])
  
  // Cargar otros aspectos del CA
  const loadOtrosAspectos = useCallback(async () => {
    if (!codigoAccion || !session?.access_token) return
    
    if (lastLoadedCA.current === codigoAccion) return
    
    setLoading(true)
    try {
      const response = await axios.get(
        `${API_BASE}/api/actas/otros-aspectos-disponibles/${codigoAccion}`,
        getAuthHeaders()
      )
      
      if (response.data.success) {
        setOtrosAspectos(response.data.otrosAspectos || [])
        lastLoadedCA.current = codigoAccion
        
        if (response.data.otrosAspectos?.length > 0) {
          loadFotosFromGlobalids(response.data.otrosAspectos.map(oa => oa.globalid))
        }
      }
    } catch (error) {
      console.error('[OtrosAspectos] Error cargando:', error)
      toast.error('Error al cargar otros aspectos')
    } finally {
      setLoading(false)
    }
  }, [codigoAccion, session, getAuthHeaders])
  
  // Cargar fotos de los globalids
  const loadFotosFromGlobalids = async (globalids) => {
    if (!globalids || globalids.length === 0) return
    
    setLoadingFotos(true)
    try {
      const allPhotos = []
      
      for (const gid of globalids) {
        try {
          const response = await axios.get(
            `${API_BASE}/api/actas/fotos-disponibles/${codigoAccion}?globalid=${gid}`,
            getAuthHeaders()
          )
          if (response.data.success && response.data.fotos) {
            const fotosConUrl = response.data.fotos.map(f => ({
              ...f,
              gid: f.record_globalid,
              globalid: f.record_globalid,
              url: `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${f.record_globalid}/${encodeURIComponent(f.filename)}?token=${session?.access_token}`
            }))
            allPhotos.push(...fotosConUrl)
          }
        } catch (e) {
          console.warn(`Error cargando fotos para ${gid}:`, e.message)
        }
      }
      
      setFotosDisponibles(allPhotos)
      
      // Cargar selección guardada
      const savedKey = getStorageKey('seleccion')
      if (savedKey) {
        try {
          const saved = localStorage.getItem(savedKey)
          if (saved) {
            const savedIds = JSON.parse(saved)
            const fotosRecuperadas = allPhotos.filter(f => 
              savedIds.some(s => s.gid === f.gid && s.filename === f.filename)
            )
            setFotosSeleccionadas(fotosRecuperadas)
          }
        } catch (e) {
          console.warn('Error recuperando selección:', e)
        }
      }
      
      // Cargar descripciones editadas del backend
      loadDescripcionesEditadas(allPhotos)
      
      // Cargar descripción general
      const descGenKey = getStorageKey('descripcion_general')
      if (descGenKey) {
        try {
          const saved = localStorage.getItem(descGenKey)
          if (saved) {
            setDescripcionOtrosAspectos(saved)
          }
        } catch (e) {
          console.warn('Error recuperando descripción general:', e)
        }
      }
    } catch (error) {
      console.error('[OtrosAspectos] Error cargando fotos:', error)
    } finally {
      setLoadingFotos(false)
    }
  }
  
  // Efecto para cargar datos
  useEffect(() => {
    loadOtrosAspectos()
  }, [loadOtrosAspectos])
  
  // Guardar selección completa en localStorage (con globalid, descripciones editadas y otros datos necesarios)
  useEffect(() => {
    const key = getStorageKey('seleccion')
    if (key && fotosSeleccionadas.length > 0) {
      // Guardar objetos foto completos con descripciones editadas para que el backend pueda procesarlos
      const toSave = fotosSeleccionadas.map(f => {
        const photoId = getPhotoUniqueId(f)
        // Usar descripción editada si existe, sino la original
        const descripcionFinal = descripcionesEditadas[photoId] ?? f.descripcion ?? f.descrip_1 ?? ''
        return {
          gid: f.gid,
          globalid: f.globalid || f.gid,
          filename: f.filename,
          componente: f.componente || '',
          tipo_componente: f.tipo_componente || '',
          instalacion_referencia: f.instalacion_referencia || '',
          descripcion: descripcionFinal,
          descripcionOriginal: f.descripcion || f.descrip_1 || '',
          este: f.este || '',
          norte: f.norte || '',
          altitud: f.altitud || ''
        }
      })
      localStorage.setItem(key, JSON.stringify(toSave))
    }
  }, [fotosSeleccionadas, descripcionesEditadas, getStorageKey])
  
  // NOTA: Las descripciones editadas ahora se guardan en el backend via guardarDescripcion()
  // Ya no usamos localStorage para esto, se cargan desde loadDescripcionesEditadas()
  
  // Guardar descripción general
  useEffect(() => {
    const key = getStorageKey('descripcion_general')
    if (key && descripcionOtrosAspectos) {
      localStorage.setItem(key, descripcionOtrosAspectos)
    }
  }, [descripcionOtrosAspectos, getStorageKey])
  
  // Actualizar estado de la sección
  useEffect(() => {
    if (onStatusChange) {
      if (fotosSeleccionadas.length > 0 && descripcionOtrosAspectos.trim()) {
        onStatusChange('otros-aspectos', 'completed')
      } else if (fotosSeleccionadas.length > 0 || descripcionOtrosAspectos.trim()) {
        onStatusChange('otros-aspectos', 'in_progress')
      } else {
        onStatusChange('otros-aspectos', 'pending')
      }
    }
  }, [fotosSeleccionadas, descripcionOtrosAspectos, onStatusChange])
  
  // Toggle selección de foto
  const toggleFoto = (foto) => {
    setFotosSeleccionadas(prev => {
      const exists = prev.some(f => f.gid === foto.gid && f.filename === foto.filename)
      if (exists) {
        return prev.filter(f => !(f.gid === foto.gid && f.filename === foto.filename))
      } else {
        return [...prev, foto]
      }
    })
  }
  
  // Manejar cambio de descripción
  const handleDescripcionChange = (photoId, texto) => {
    setDescripcionesEditadas(prev => ({
      ...prev,
      [photoId]: texto
    }))
  }
  
  // Estado para guardar descripción
  const [savingDescripcion, setSavingDescripcion] = useState(null)
  
  // Cargar descripciones editadas del backend
  const loadDescripcionesEditadas = async (fotos) => {
    if (!session?.access_token || !fotos?.length) return
    
    try {
      const photoIds = fotos.map(f => getPhotoUniqueId(f)).filter(Boolean)
      if (photoIds.length === 0) return
      
      console.log(`[OtrosAspectos] Cargando descripciones para ${photoIds.length} fotos`)
      
      const response = await axios.get(
        `${API_BASE}/api/s123/direct/descripciones-por-fotos?photoIds=${encodeURIComponent(photoIds.join(','))}`,
        getAuthHeaders()
      )
      
      if (response.data.success && response.data.descripciones) {
        console.log(`[OtrosAspectos] ${response.data.count} descripciones editadas encontradas`)
        setDescripcionesEditadas(response.data.descripciones)
      }
    } catch (err) {
      console.warn(`Error cargando descripciones editadas:`, err.message)
    }
  }
  
  // Guardar descripción editada al backend
  const guardarDescripcion = async (photoId, texto) => {
    if (!session?.access_token) return
    
    setSavingDescripcion(photoId)
    try {
      await axios.put(
        `${API_BASE}/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: texto },
        getAuthHeaders()
      )
      
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: texto
      }))
      
      toast.success('Descripción guardada')
    } catch (error) {
      console.error('Error guardando descripción:', error)
      toast.error('Error al guardar')
    } finally {
      setSavingDescripcion(null)
    }
  }
  
  // Revertir a descripción original
  const revertirDescripcion = async (photoId, descripcionOriginal) => {
    setSavingDescripcion(photoId)
    try {
      await axios.put(
        `${API_BASE}/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: null },
        getAuthHeaders()
      )
      
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: descripcionOriginal || ''
      }))
      
      toast.success('Descripción revertida a original')
    } catch (error) {
      console.error('Error revirtiendo descripción:', error)
      toast.error('Error al revertir')
    } finally {
      setSavingDescripcion(null)
    }
  }
  
  // Generar descripción con AI
  const generarDescripcionAI = async () => {
    if (fotosSeleccionadas.length === 0) {
      toast.error('Selecciona al menos una foto')
      return
    }
    
    const descripcionesFotos = fotosSeleccionadas.map(foto => {
      const photoId = getPhotoUniqueId(foto)
      const descripcionEditada = descripcionesEditadas[photoId]
      const descripcionOriginal = foto.descripcion || foto.descrip_1 || ''
      
      return {
        globalid: foto.globalid,
        filename: foto.filename,
        descripcion: descripcionEditada ?? descripcionOriginal,
        componente: foto.componente || '',
        tipo_componente: foto.tipo_componente || '',
        instalacion_referencia: foto.instalacion_referencia || ''
      }
    })
    
    const fotosConDescripcion = descripcionesFotos.filter(f => f.descripcion?.trim())
    
    if (fotosConDescripcion.length === 0) {
      toast.error('Las fotos seleccionadas no tienen descripciones')
      return
    }
    
    setGeneratingDescription(true)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-generate-otros-aspectos`,
        {
          fotos: fotosConDescripcion,
          context: {
            codigoAccion,
            totalFotos: fotosSeleccionadas.length
          }
        },
        getAuthHeaders()
      )
      
      if (response.data.success && response.data.description) {
        setDescripcionOtrosAspectos(response.data.description)
        toast.success('Descripción generada correctamente')
      } else {
        toast.error(response.data.error || 'Error al generar descripción')
      }
    } catch (error) {
      console.error('Error generando descripción:', error)
      toast.error(error.response?.data?.error || 'Error al generar descripción')
    } finally {
      setGeneratingDescription(false)
    }
  }
  
  // Guardar borrador - guarda en localStorage los datos de otros aspectos
  const guardarBorrador = async () => {
    if (!borrador?.id) return
    
    setSaving(true)
    try {
      // Preparar fotos con descripciones editadas
      const fotosConDescripciones = fotosSeleccionadas.map(foto => {
        const photoId = getPhotoUniqueId(foto)
        return {
          ...foto,
          descripcion: descripcionesEditadas[photoId] ?? foto.descripcion ?? '',
          descripcionOriginal: foto.descripcion || ''
        }
      })
      
      // Guardar en localStorage para la generación del acta
      const otrosAspectosData = {
        descripcion: descripcionOtrosAspectos,
        fotos: fotosConDescripciones,
        fotosIds: fotosSeleccionadas.map(f => ({ gid: f.gid, filename: f.filename })),
        descripcionesEditadas: descripcionesEditadas,
        timestamp: Date.now()
      }
      
      localStorage.setItem(
        `acta_borrador_${borrador.id}_otros_aspectos`, 
        JSON.stringify(otrosAspectosData)
      )
      
      toast.success('Otros Aspectos guardados correctamente')
    } catch (error) {
      console.error('Error guardando:', error)
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }
  
  // Paginación
  const paginatedPhotos = useMemo(() => {
    const start = photosPage * PHOTOS_PER_PAGE
    const end = start + PHOTOS_PER_PAGE
    return fotosDisponibles.slice(start, end)
  }, [fotosDisponibles, photosPage])
  
  const totalPhotoPages = useMemo(() => {
    return Math.ceil(fotosDisponibles.length / PHOTOS_PER_PAGE)
  }, [fotosDisponibles.length])
  
  useEffect(() => {
    setPhotosPage(0)
  }, [fotosDisponibles.length])
  
  const openPhotoModal = useCallback((foto, indexInPage) => {
    const globalIndex = (photosPage * PHOTOS_PER_PAGE) + indexInPage
    setSelectedPhotoIndex(globalIndex)
    setPhotoModalOpen(true)
  }, [photosPage])
  
  const navigatePhotoModal = useCallback((newIndex) => {
    if (newIndex >= 0 && newIndex < fotosDisponibles.length) {
      setSelectedPhotoIndex(newIndex)
      const newPage = Math.floor(newIndex / PHOTOS_PER_PAGE)
      if (newPage !== photosPage) {
        setPhotosPage(newPage)
      }
    }
  }, [fotosDisponibles.length, photosPage])
  
  // Si no hay otros aspectos
  if (!loading && otrosAspectos.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <MessageSquare className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Sin Otros Aspectos
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Este CA no tiene registros con "Otros Aspectos" (S._Otros_Aspectos).
            Esta sección se completa automáticamente cuando hay datos disponibles.
          </p>
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-500 pink:text-pink-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
            Cargando otros aspectos...
          </p>
        </div>
      </div>
    )
  }
  
  // Vista principal con navegación de pasos (igual que en un hecho)
  return (
    <div className="p-6 space-y-6">
      {/* Header con título */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
            Otros Aspectos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
            Sección 6 del Acta - Aspectos complementarios verificados
          </p>
        </div>
        
        {/* Botón Guardar */}
        <button
          onClick={guardarBorrador}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
      </div>
      
      {/* Navegación de pasos (igual que en HechosSection pero solo 2 pasos) */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-4">
        <div className="flex items-center justify-center gap-4 overflow-x-auto">
          {/* Paso 1: Medios probatorios */}
          <button
            onClick={() => setDetailStep(1)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0 transition-all ${
              detailStep === 1 
                ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                : fotosSeleccionadas.length > 0
                  ? 'border-2 border-green-300 dark:border-green-700'
                  : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
              detailStep === 1 
                ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                : fotosSeleccionadas.length > 0 
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
            }`}>
              {fotosSeleccionadas.length > 0 && detailStep !== 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className={`text-sm font-medium ${detailStep === 1 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
              Medios Probatorios
            </span>
          </button>
          
          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          
          {/* Paso 2: Descripción */}
          <button
            onClick={() => setDetailStep(2)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0 transition-all ${
              detailStep === 2 
                ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                : descripcionOtrosAspectos.trim()
                  ? 'border-2 border-green-300 dark:border-green-700'
                  : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
              detailStep === 2 
                ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                : descripcionOtrosAspectos.trim()
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
            }`}>
              {descripcionOtrosAspectos.trim() && detailStep !== 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className={`text-sm font-medium ${detailStep === 2 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
              Descripción
            </span>
          </button>
        </div>
      </div>
      
      {/* PASO 1: Medios Probatorios */}
      {detailStep === 1 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
            <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
              fotosSeleccionadas.length > 0
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                    {fotosSeleccionadas.length > 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Camera className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    )}
                    Paso 1: Medios Probatorios
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                    Selecciona las fotografías para Otros Aspectos
                  </p>
                </div>
              
                {/* Switch Original / Mi versión */}
                <div className="flex items-center gap-3 bg-white dark:bg-slate-700 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600">
                  <span className={`text-xs font-medium ${!mostrarEditadas ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
                    Original
                  </span>
                  <button
                    onClick={() => setMostrarEditadas(!mostrarEditadas)}
                    className="relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    style={{ backgroundColor: mostrarEditadas ? '#3b82f6' : '#cbd5e1' }}
                  >
                    <div 
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${mostrarEditadas ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                  <span className={`text-xs font-medium ${mostrarEditadas ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
                    Mi versión
                  </span>
                </div>
              </div>
            </div>
          
            <div className="p-6">
              {loadingFotos ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                  <span className="ml-3 text-slate-500">Cargando fotografías...</span>
                </div>
              ) : fotosDisponibles.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                  <Image className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No hay fotografías disponibles</p>
                  <p className="text-sm mt-1">Los registros de Otros Aspectos no tienen fotos asociadas</p>
                </div>
              ) : (
                <>
                  {/* Info de cantidad total */}
                  {fotosDisponibles.length > PHOTOS_PER_PAGE && (
                    <div className="mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <strong>{fotosDisponibles.length} fotos</strong> disponibles. 
                        Mostrando página {photosPage + 1} de {totalPhotoPages} ({PHOTOS_PER_PAGE} por página).
                      </p>
                    </div>
                  )}
                  
                  {/* Carrete vertical de fotos */}
                  <div className="space-y-4 mb-4 max-h-[450px] overflow-y-auto pr-2 pl-3 pt-3">
                    {paginatedPhotos.map((foto, idx) => {
                      const globalIdx = (photosPage * PHOTOS_PER_PAGE) + idx
                      const isSelected = fotosSeleccionadas.some(f => f.filename === foto.filename && f.gid === foto.gid)
                      const fotoUrl = foto.url || `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${foto.gid}/${encodeURIComponent(foto.filename)}?token=${session?.access_token}`
                      
                      return (
                        <div
                          key={`${foto.gid}-${foto.filename}-${globalIdx}`}
                          className={`
                            flex gap-4 p-3 rounded-xl border-2 transition-all
                            ${isSelected 
                              ? 'border-green-400 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-400/30' 
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                            }
                          `}
                        >
                          {/* Zona izquierda: checkbox y miniatura */}
                          <div className="flex-shrink-0 flex items-start gap-3">
                            <button
                              onClick={() => toggleFoto(foto)}
                              className={`
                                w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2
                                ${isSelected 
                                  ? 'bg-green-500 border-green-500 text-white shadow-green-500/40 shadow-lg' 
                                  : 'bg-white border-slate-300 text-slate-400 hover:border-slate-400'
                                }
                              `}
                              aria-pressed={isSelected}
                              title={isSelected ? 'Quitar selección' : 'Seleccionar foto'}
                            >
                              {isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </button>

                            <div
                              className="relative rounded-xl overflow-hidden group"
                              style={{ width: `${THUMB_WIDTH}px`, height: `${THUMB_HEIGHT}px`, backgroundColor: '#050505' }}
                            >
                              <img
                                src={fotoUrl}
                                alt={foto.filename}
                                className="w-full h-full object-contain cursor-zoom-in"
                                loading="lazy"
                                onClick={() => openPhotoModal(foto, idx)}
                                onError={(e) => {
                                  e.target.onerror = null
                                  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23e2e8f0" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="12">Sin imagen</text></svg>'
                                }}
                              />

                              {/* Número de orden si está seleccionado */}
                              {isSelected && (
                                <div className="absolute bottom-1 right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  #{fotosSeleccionadas.findIndex(f => f.filename === foto.filename && f.gid === foto.gid) + 1}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Descripción a la derecha */}
                          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${isSelected ? 'text-green-700 dark:text-green-300' : 'text-slate-900 dark:text-white'}`}>
                                  Foto {globalIdx + 1}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFoto(foto); }}
                                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                    isSelected 
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' 
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                                  }`}
                                >
                                  {isSelected ? '✓ Seleccionada' : 'Seleccionar'}
                                </button>
                              </div>
                              {foto.componente && (
                                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">
                                  {foto.componente}
                                </span>
                              )}
                            </div>
                            
                            {/* Descripción compacta */}
                            {(() => {
                              const photoId = getPhotoUniqueId(foto)
                              const descripcionActual = descripcionesEditadas[photoId] ?? foto.descripcion ?? ''
                              const descripcionOriginal = foto.descripcion || ''
                              const hasChanges = descripcionesEditadas[photoId] !== undefined && descripcionesEditadas[photoId] !== descripcionOriginal
                              const isSaving = savingDescripcion === photoId
                              
                              return mostrarEditadas ? (
                                <div className="space-y-1.5">
                                  <textarea
                                    value={descripcionActual}
                                    onChange={(e) => handleDescripcionChange(photoId, e.target.value)}
                                    placeholder="Escribe la descripción de la foto..."
                                    className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    rows={2}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  {/* Botones guardar/revertir */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); guardarDescripcion(photoId, descripcionActual); }}
                                      disabled={isSaving}
                                      className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                                    >
                                      {isSaving ? 'Guardando...' : 'Guardar'}
                                    </button>
                                    {hasChanges && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); revertirDescripcion(photoId, descripcionOriginal); }}
                                        disabled={isSaving}
                                        className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors disabled:opacity-50"
                                      >
                                        Revertir
                                      </button>
                                    )}
                                    {/* Botón para abrir modal */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openPhotoModal(foto, globalIdx); }}
                                      className="ml-auto px-2 py-0.5 text-[10px] font-medium rounded bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60 transition-colors"
                                    >
                                      Editar detalle
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                  {foto.descripcion || 'Sin descripción'}
                                </p>
                              )
                            })()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Paginación */}
                  {totalPhotoPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setPhotosPage(p => Math.max(0, p - 1))}
                        disabled={photosPage === 0}
                        className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="text-sm text-slate-500">
                        Página {photosPage + 1} de {totalPhotoPages}
                      </span>
                      <button
                        onClick={() => setPhotosPage(p => Math.min(totalPhotoPages - 1, p + 1))}
                        disabled={photosPage === totalPhotoPages - 1}
                        className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Botón continuar */}
          <div className="flex justify-end">
            <button
              onClick={() => setDetailStep(2)}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white font-semibold rounded-lg transition-colors"
            >
              Continuar a Descripción
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      
      {/* PASO 2: Descripción */}
      {detailStep === 2 && (
        <div className="space-y-6">
          {/* Resumen de fotos seleccionadas */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-slate-900 dark:text-white">
                Medios probatorios ({fotosSeleccionadas.length})
              </h4>
              <button
                onClick={() => setDetailStep(1)}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
              >
                Modificar selección
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {fotosSeleccionadas.map((foto, idx) => {
                const globalIdx = fotosDisponibles.findIndex(
                  f => f.filename === foto.filename && f.gid === foto.gid
                )
                const fotoUrl = foto.url || `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${foto.gid}/${encodeURIComponent(foto.filename)}?token=${session?.access_token}`

                return (
                  <div
                    key={`selected-${foto.gid}-${foto.filename}`}
                    className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-primary-200 cursor-pointer hover:border-primary-400 transition-colors group"
                    style={{ width: `${THUMB_WIDTH}px`, height: `${THUMB_HEIGHT}px`, backgroundColor: '#050505' }}
                    onClick={() => {
                      if (globalIdx >= 0) {
                        setSelectedPhotoIndex(globalIdx)
                        setPhotoModalOpen(true)
                      }
                    }}
                    title="Click para ver foto maximizada"
                  >
                    <img
                      src={fotoUrl}
                      alt=""
                      className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                      loading="lazy"
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="112"><rect fill="%23050505" width="160" height="112"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-size="12">Error</text></svg>'
                      }}
                    />
                    <div className="absolute bottom-1 right-1 bg-primary-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      #{idx + 1}
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Formulario de descripción */}
          <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
            <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
              descripcionOtrosAspectos.trim()
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                    {descripcionOtrosAspectos.trim() ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    )}
                    Paso 2: Descripción de Otros Aspectos
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                    Describe los aspectos verificados que complementan la supervisión
                  </p>
                </div>
                
                {/* Botón Generar Descripción AI */}
                <button
                  onClick={generarDescripcionAI}
                  disabled={generatingDescription || fotosSeleccionadas.length === 0}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all shadow-lg
                    ${fotosSeleccionadas.length > 0 && !generatingDescription
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-violet-500/25 hover:shadow-violet-500/40'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                    }
                  `}
                  title={fotosSeleccionadas.length === 0 
                    ? 'Selecciona fotos en el paso 1 para generar descripción' 
                    : 'Generar descripción basada en las fotos seleccionadas'
                  }
                >
                  {generatingDescription ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generando...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>Generar Descripción</span>
                      <Sparkles className="w-3.5 h-3.5 opacity-75" />
                    </>
                  )}
                </button>
              </div>
              
              {/* Info helper si no hay fotos */}
              {fotosSeleccionadas.length === 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                  <Camera className="w-4 h-4 flex-shrink-0" />
                  <span>Selecciona fotografías en el <strong>Paso 1 (Medios Probatorios)</strong> para habilitar el generador AI</span>
                </div>
              )}
              
              {/* Info helper si hay fotos */}
              {fotosSeleccionadas.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-3 py-2 rounded-lg">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span><strong>{fotosSeleccionadas.length} foto{fotosSeleccionadas.length !== 1 ? 's' : ''}</strong> seleccionada{fotosSeleccionadas.length !== 1 ? 's' : ''}. El AI generará la descripción basándose en sus descripciones.</span>
                </div>
              )}
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descripción de Otros Aspectos
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Descripción de los aspectos complementarios verificados durante la supervisión.
                  Esta sección NO es para hechos verificados ni incumplimientos.
                </p>
                <RichTextEditor
                  value={descripcionOtrosAspectos}
                  onChange={setDescripcionOtrosAspectos}
                  placeholder="Durante la supervisión se verificaron las condiciones generales de..."
                  minHeight="200px"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  AISA puede cometer errores, siempre revisa el contenido.
                </p>
                
                {/* Panel AI Enhancer inline para descripción */}
                <AIEnhancePanel
                  content={descripcionOtrosAspectos}
                  fieldType="otros_aspectos"
                  context={{
                    codigoAccion: codigoAccion,
                    fotos: fotosSeleccionadas.map(f => ({
                      descripcion: descripcionesEditadas[getPhotoUniqueId(f)] || f.descripcion || '',
                      componente: f.componente,
                      tipo_componente: f.tipo_componente,
                      instalacion_referencia: f.instalacion_referencia,
                      filename: f.filename
                    }))
                  }}
                  actaId={borrador?.id}
                  onContentChange={setDescripcionOtrosAspectos}
                  disabled={!descripcionOtrosAspectos.trim() || descripcionOtrosAspectos.length < 20}
                />
              </div>
              
              {/* Botones de navegación */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setDetailStep(1)}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Volver a Medios Probatorios
                </button>
                
                <button
                  onClick={guardarBorrador}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white font-semibold rounded-lg transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar Otros Aspectos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de foto */}
      {photoModalOpen && fotosDisponibles[selectedPhotoIndex] && (
        <PhotoDetailModal
          isOpen={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          foto={fotosDisponibles[selectedPhotoIndex]}
          fotoIndex={selectedPhotoIndex}
          totalFotos={fotosDisponibles.length}
          onNavigate={navigatePhotoModal}
          codigoAccion={codigoAccion}
          isSelected={fotosSeleccionadas.some(
            f => f.gid === fotosDisponibles[selectedPhotoIndex].gid && 
                 f.filename === fotosDisponibles[selectedPhotoIndex].filename
          )}
          onToggleSelect={() => toggleFoto(fotosDisponibles[selectedPhotoIndex])}
          descripcionesEditadas={descripcionesEditadas}
          onDescripcionChange={(photoId, texto) => handleDescripcionChange(photoId, texto)}
          onGuardarDescripcion={(photoId, texto) => guardarDescripcion(photoId, texto)}
          onRevertDescripcion={(photoId) => revertirDescripcion(
            photoId, 
            fotosDisponibles[selectedPhotoIndex]?.descripcion || ''
          )}
          savingDescripcion={savingDescripcion}
        />
      )}
    </div>
  )
}

export default OtrosAspectosSection
