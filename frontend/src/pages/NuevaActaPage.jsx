import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  FileText, 
  ClipboardList, 
  MapPin, 
  Paperclip, 
  Download,
  ChevronRight,
  Check,
  ChevronDown,
  Search,
  Loader2,
  Bot,
  Sparkles,
  FlaskConical, // Para Muestreo ambiental
  Users, // Para Personal y Equipo
  MessageSquare, // Para Otros Aspectos
  ClipboardCheck // Para Requerimiento de Información
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import toast from 'react-hot-toast'

// Componentes
import { AppHeader } from '../components/AppHeader'
import { InformacionGeneralSection, HechosSection, ComponentesSection, MuestreoSection, OtrosAspectosSection, RequerimientoSection, AnexosSection, PersonalEquipoSection, ExportarActaSection } from '../components/actas'
import AISAModal from '../components/AISAModal'

const API_BASE = 'http://localhost:3000'

// Sidebar items configuration
const SIDEBAR_ITEMS = [
  { id: 'info-general', label: 'Información General del Acta', icon: FileText },
  { id: 'hechos', label: 'Hechos', icon: ClipboardList },
  { id: 'componentes', label: 'Componentes', icon: MapPin },
  { id: 'muestreo', label: 'Muestreo Ambiental', icon: FlaskConical },
  { id: 'otros-aspectos', label: 'Otros Aspectos', icon: MessageSquare },
  { id: 'requerimiento', label: 'Requerimiento de Información', icon: ClipboardCheck },
  { id: 'personal-equipo', label: 'Personal y Equipo', icon: Users },
  { id: 'anexos', label: 'Anexos', icon: Paperclip },
  { id: 'exportar', label: 'Exportar acta', icon: Download, isAction: true },
]

export const NuevaActaPage = ({ onBack, codigoAccion: initialCA }) => {
  const { user, session, anexosTemplates } = useAuth()
  
  // Estado principal
  const [activeSection, setActiveSection] = useState('info-general')
  const [codigoAccion, setCodigoAccion] = useState(initialCA || '')
  const [tipoActa, setTipoActa] = useState('regular')
  const [borrador, setBorrador] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Estado de completitud por sección
  const [sectionStatus, setSectionStatus] = useState({
    'info-general': 'pending', // 'pending', 'in_progress', 'completed'
    'hechos': 'pending',
    'componentes': 'pending',
    'muestreo': 'pending',
    'otros-aspectos': 'pending',
    'requerimiento': 'pending',
    'personal-equipo': 'pending',
    'anexos': 'pending',
  })
  
  // Datos del CA desde la base de datos local
  const [caData, setCaData] = useState(null)
  const [modalidad, setModalidad] = useState('B') // 'A' o 'B'
  
  // Estado para el dropdown de CAs disponibles
  const [availableCAs, setAvailableCAs] = useState([])
  const [loadingCAs, setLoadingCAs] = useState(false)
  const [caDropdownOpen, setCaDropdownOpen] = useState(false)
  const [caSearchQuery, setCaSearchQuery] = useState('')
  const caDropdownRef = useRef(null)
  const lastLoadedCA = useRef(null) // Para evitar recargas innecesarias
  const borradorRef = useRef(null) // Ref para acceder al borrador actual sin causar re-renders
  const tipoActaRef = useRef(tipoActa)
  const modalidadRef = useRef(modalidad)
  const updateSectionStatusesRef = useRef(null)
  
  // Estado para el modal de AISA y el hecho activo
  const [showAISAModal, setShowAISAModal] = useState(false)
  const [activeHecho, setActiveHecho] = useState(null)
  
  // Mantener refs sincronizados con el estado
  useEffect(() => {
    borradorRef.current = borrador
  }, [borrador])
  
  useEffect(() => {
    tipoActaRef.current = tipoActa
  }, [tipoActa])
  
  useEffect(() => {
    modalidadRef.current = modalidad
  }, [modalidad])
  
  // Ref para evitar recargas de CAs
  const casLoadedRef = useRef(false)
  
  // Limpiar hecho activo cuando se cambia de sección (excepto si es 'hechos')
  useEffect(() => {
    if (activeSection !== 'hechos') {
      setActiveHecho(null)
    }
  }, [activeSection])
  
  // Cargar lista de CAs disponibles al montar - SOLO UNA VEZ
  useEffect(() => {
    const loadAvailableCAs = async () => {
      if (!session?.access_token) {
        console.log('[NuevaActa] Sin sesión activa, esperando...')
        return
      }
      
      // Evitar recargas si ya cargamos los CAs
      if (casLoadedRef.current && availableCAs.length > 0) {
        console.log('[NuevaActa] CAs ya cargados, omitiendo recarga:', availableCAs.length)
        return
      }
      
      setLoadingCAs(true)
      const authHeaders = {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }
      
      try {
        // Primero intentar con cache local
        const cacheResponse = await axios.get(`${API_BASE}/api/s123/ca-stats`, authHeaders)
        if (cacheResponse.data.success && cacheResponse.data.stats?.length > 0) {
          console.log('[NuevaActa] CAs desde cache local:', cacheResponse.data.stats.length)
          setAvailableCAs(cacheResponse.data.stats)
          casLoadedRef.current = true
          setLoadingCAs(false)
          return
        }
      } catch (error) {
        console.log('[NuevaActa] Cache local no disponible, usando ArcGIS...', error.message)
      }
      
      // Fallback: consultar directamente a ArcGIS
      try {
        const arcgisResponse = await axios.get(`${API_BASE}/api/s123/codigo-accion-values`, authHeaders)
        if (arcgisResponse.data.values) {
          // Filtrar solo los que son Codigo_accion (no Otro_CA)
          const caValues = arcgisResponse.data.values
            .filter(v => v.field === 'Codigo_accion' || v.field === 'codigo_accion')
            .map(v => v.value)
          
          // Eliminar duplicados y crear objetos
          const uniqueCAs = [...new Set(caValues)]
          console.log('[NuevaActa] CAs desde ArcGIS:', uniqueCAs.length)
          setAvailableCAs(uniqueCAs.map(ca => ({ codigo: ca, registros_activos: null })))
          casLoadedRef.current = true
        }
      } catch (altError) {
        console.error('[NuevaActa] Error cargando CAs:', altError)
      } finally {
        setLoadingCAs(false)
      }
    }
    loadAvailableCAs()
  }, [session])
  
  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (caDropdownRef.current && !caDropdownRef.current.contains(event.target)) {
        setCaDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Filtrar CAs según búsqueda
  const filteredCAs = availableCAs.filter(ca => {
    const codigo = ca.codigo || ca
    return String(codigo).toLowerCase().includes(caSearchQuery.toLowerCase())
  })
  
  // Cargar datos del CA y obtener modalidad automáticamente
  const loadCAData = useCallback(async (ca, forceReload = false) => {
    if (!ca || !session?.access_token) return
    
    // Evitar recargas innecesarias si ya cargamos este CA
    if (!forceReload && lastLoadedCA.current === ca) {
      console.log('[NuevaActa] CA ya cargado, omitiendo recarga:', ca)
      return
    }
    
    const authHeaders = {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }
    
    setLoading(true)
    try {
      // Intentar obtener modalidad desde cache local
      try {
        const modalidadResponse = await axios.get(`${API_BASE}/api/s123/direct/modalidad/${ca}`, authHeaders)
        if (modalidadResponse.data.modalidad) {
          const detectedModalidad = modalidadResponse.data.modalidad
          setModalidad(detectedModalidad)
          
          // Actualizar tipo de acta basado en modalidad
          // A = Suelos empetrolados, B = Regular/Especial
          if (detectedModalidad === 'A') {
            setTipoActa('suelos_empetrolados')
          } else {
            // Para modalidad B, mantener el tipo actual si ya es regular o especial
            if (tipoActaRef.current === 'suelos_empetrolados') {
              setTipoActa('regular')
            }
          }
        }
      } catch (modalidadError) {
        // Si no hay datos en cache, usar modalidad B por defecto
        console.log('[NuevaActa] No se pudo obtener modalidad, usando B por defecto')
        setModalidad('B')
        if (tipoActaRef.current === 'suelos_empetrolados') {
          setTipoActa('regular')
        }
      }
      
      // Intentar obtener registros del CA desde la cache local
      try {
        const response = await axios.get(`${API_BASE}/api/s123/direct/records/${ca}`, authHeaders)
        if (response.data.records?.length > 0) {
          setCaData(response.data.records)
        }
      } catch (recordsError) {
        console.log('[NuevaActa] No hay registros en cache local para:', ca)
        setCaData(null)
      }
      // Marcar este CA como cargado
      lastLoadedCA.current = ca
    } catch (error) {
      console.error('Error cargando datos del CA:', error)
    } finally {
      setLoading(false)
    }
  }, [session]) // Removido tipoActa para evitar re-ejecuciones
  
  // Cargar o crear borrador
  const loadOrCreateBorrador = useCallback(async (ca, forceReload = false) => {
    if (!ca || !session?.access_token) return
    
    // Si ya tenemos un borrador para este CA, no recargar
    if (!forceReload && borradorRef.current?.codigo_accion === ca) {
      console.log('[NuevaActa] Borrador ya cargado para:', ca)
      return
    }
    
    const authHeaders = {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }
    
    try {
      // Buscar borradores existentes para este CA
      const response = await axios.get(`${API_BASE}/api/actas/borradores`, authHeaders)
      const existingDraft = response.data.borradores?.find(b => b.codigo_accion === ca)
      
      if (existingDraft) {
        // Cargar borrador existente
        const detailResponse = await axios.get(`${API_BASE}/api/actas/borradores/${existingDraft.id}`, authHeaders)
        setBorrador(detailResponse.data.borrador)

        // Cargar muestreos para poder mapear estado sin entrar a la pestaña
        let muestreos = []
        try {
          const muestreosResponse = await axios.get(`${API_BASE}/api/actas/${existingDraft.id}/muestreos`, authHeaders)
          muestreos = muestreosResponse.data.muestreos || []
        } catch (e) {
          // Si falla, mantener vacío (pending)
        }

        // Actualizar estados de sección (incluye muestreos)
        updateSectionStatusesRef.current?.({ ...detailResponse.data, muestreos })
      } else {
        // Crear nuevo borrador
        const createResponse = await axios.post(`${API_BASE}/api/actas/borradores`, {
          codigo_accion: ca,
          tipo_acta: tipoActaRef.current,
          modalidad: modalidadRef.current
        }, authHeaders)
        setBorrador(createResponse.data.borrador)

        // Inicializar estados de sección para un borrador nuevo
        updateSectionStatusesRef.current?.({ borrador: createResponse.data.borrador, hechos: [], componentes: [], anexos: [], muestreos: [] })
      }
    } catch (error) {
      console.error('Error con borrador:', error)
      toast.error('Error al cargar/crear borrador')
    }
  }, [session]) // Removido tipoActa y modalidad para evitar re-ejecuciones
  
  // Actualizar estados de secciones basado en datos del borrador y localStorage
  const updateSectionStatuses = useCallback((data) => {
    const borradorId = data.borrador?.id
    if (!borradorId) return
    
    const newStatus = {
      'info-general': 'pending',
      'hechos': 'pending',
      'componentes': 'pending',
      'muestreo': 'pending',
      'otros-aspectos': 'pending',
      'requerimiento': 'pending',
      'personal-equipo': 'pending',
      'anexos': 'pending',
    }
    
    // === INFO GENERAL ===
    // Campos requeridos según InformacionGeneralSection
    const requiredFields = [
      'expediente', 'nombre_administrado', 'ruc', 'unidad_fiscalizable',
      'departamento', 'provincia', 'distrito', 'actividad_desarrollada',
      'tipo_supervision', 'fecha_hora_inicio', 'fecha_hora_cierre'
    ]
    const filledRequired = requiredFields.filter(field => data.borrador?.[field]?.trim?.()).length
    const hasCompleteEquipo = data.borrador?.equipos_gps?.some(eq => 
      eq.codigo?.trim() && eq.marca?.trim() && eq.sistema?.trim()
    )
    
    if (filledRequired === requiredFields.length && hasCompleteEquipo) {
      newStatus['info-general'] = 'completed'
    } else if (filledRequired > 0 || hasCompleteEquipo) {
      newStatus['info-general'] = 'in_progress'
    }
    
    // === HECHOS ===
    if (data.hechos?.length > 0) {
      const allCompleted = data.hechos.every(h => h.is_completed)
      newStatus['hechos'] = allCompleted ? 'completed' : 'in_progress'
    }

    // === COMPONENTES ===
    if (data.componentes?.length > 0) {
      newStatus['componentes'] = 'completed'
    }

    // === MUESTREO (desde API cuando existe, no usa localStorage) ===
    if (Array.isArray(data.muestreos) && data.muestreos.length > 0) {
      newStatus['muestreo'] = 'completed'
    }

    // === OTROS ASPECTOS (desde localStorage) ===
    // Replicar la lógica de OtrosAspectosSection
    try {
      const seleccionStr = localStorage.getItem(`acta_otros_aspectos_${borradorId}_seleccion`)
      const descGenStr = localStorage.getItem(`acta_otros_aspectos_${borradorId}_descripcion_general`)
      const fotosSeleccionadas = seleccionStr ? JSON.parse(seleccionStr) : []
      const descripcionOtrosAspectos = descGenStr || ''

      const hasFotos = Array.isArray(fotosSeleccionadas) && fotosSeleccionadas.length > 0
      const hasDescripcion = Boolean(String(descripcionOtrosAspectos).trim())

      if (hasFotos && hasDescripcion) {
        newStatus['otros-aspectos'] = 'completed'
      } else if (hasFotos || hasDescripcion) {
        newStatus['otros-aspectos'] = 'in_progress'
      }
    } catch (e) { /* ignore */ }

    // === REQUERIMIENTO DE INFORMACIÓN (desde localStorage) ===
    // Replicar la lógica de RequerimientoSection (completed si hay algún template seleccionado)
    try {
      const requerimientosStr = localStorage.getItem(`acta_requerimientos_v2_${borradorId}`)
      const requerimientos = requerimientosStr ? JSON.parse(requerimientosStr) : {}
      const hasAnySelected = Object.values(requerimientos || {}).some(
        r => Array.isArray(r?.selectedTemplates) && r.selectedTemplates.length > 0
      )
      newStatus['requerimiento'] = hasAnySelected ? 'completed' : 'pending'
    } catch (e) { /* ignore */ }

    // === PERSONAL Y EQUIPO (desde localStorage) ===
    try {
      const supervisorData = localStorage.getItem(`acta_equipo_supervisor_${borradorId}`)
      const otrosData = localStorage.getItem(`acta_equipo_otros_${borradorId}`)
      const hasSupervisor = supervisorData && JSON.parse(supervisorData)?.length > 0
      const hasOtros = otrosData && JSON.parse(otrosData)?.length > 0
      if (hasSupervisor || hasOtros) {
        newStatus['personal-equipo'] = 'completed'
      }
    } catch (e) { /* ignore */ }
    
    // === ANEXOS (desde localStorage + anexosTemplates) ===
    // Replicar exactamente la lógica de AnexosSection
    try {
      const templates = anexosTemplates || []
      const anexosData = localStorage.getItem(`acta_anexos_${borradorId}`)
      const customData = localStorage.getItem(`acta_anexos_custom_${borradorId}`)
      
      const selectedAnexos = anexosData ? JSON.parse(anexosData) : {}
      const customAnexos = customData ? JSON.parse(customData) : []
      
      const totalAnexos = templates.length + customAnexos.length
      
      if (totalAnexos > 0) {
        // Contar selecciones de templates y custom (exactamente como AnexosSection)
        const templateSelectedCount = templates.filter(a => selectedAnexos[a.id]).length
        const customSelectedCount = customAnexos.filter(a => selectedAnexos[`custom_${a.id}`]).length
        const totalSelectedCount = templateSelectedCount + customSelectedCount
        
        if (totalSelectedCount === 0) {
          newStatus['anexos'] = 'pending'
        } else if (totalSelectedCount === totalAnexos) {
          newStatus['anexos'] = 'completed'
        } else {
          newStatus['anexos'] = 'in_progress'
        }
      }
    } catch (e) { /* ignore */ }
    
    setSectionStatus(newStatus)
  }, [anexosTemplates])

  // Mantener una referencia estable al último updateSectionStatuses para usarla en callbacks definidos antes
  updateSectionStatusesRef.current = updateSectionStatuses

  // Recalcular estados cuando cambian los templates de anexos (se cargan async)
  useEffect(() => {
    if (!borrador?.id || !session?.access_token) return
    const authHeaders = {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }
    ;(async () => {
      try {
        const detailResponse = await axios.get(`${API_BASE}/api/actas/borradores/${borrador.id}`, authHeaders)
        let muestreos = []
        try {
          const muestreosResponse = await axios.get(`${API_BASE}/api/actas/${borrador.id}/muestreos`, authHeaders)
          muestreos = muestreosResponse.data.muestreos || []
        } catch (e) {
          // ignore
        }
        updateSectionStatuses({ ...detailResponse.data, muestreos })
      } catch (e) {
        // ignore
      }
    })()
  }, [anexosTemplates, borrador?.id, session?.access_token, updateSectionStatuses])
  
  // Guardar borrador
  const saveBorrador = async (updates) => {
    if (!borrador?.id || !session?.access_token) return
    
    const authHeaders = {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }
    
    setSaving(true)
    try {
      const response = await axios.put(`${API_BASE}/api/actas/borradores/${borrador.id}`, updates, authHeaders)
      setBorrador(response.data.borrador)
      toast.success('Guardado')
    } catch (error) {
      console.error('Error guardando:', error)
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }
  
  // Efecto para cargar datos cuando cambia el CA
  useEffect(() => {
    if (codigoAccion && codigoAccion !== lastLoadedCA.current) {
      loadCAData(codigoAccion)
      loadOrCreateBorrador(codigoAccion)
    }
  }, [codigoAccion]) // Solo depende del CA, no de las funciones
  
  // Callback para actualizar estado de secciones desde los componentes hijos
  const handleSectionStatusChange = useCallback((sectionId, status) => {
    setSectionStatus(prev => {
      if (prev[sectionId] === status) return prev // Evitar re-renders innecesarios
      return { ...prev, [sectionId]: status }
    })
  }, [])
  
  // Obtener icono de estado
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <div className="w-3 h-3 rounded-full bg-green-500" />
      case 'in_progress':
        return <div className="w-3 h-3 rounded-full bg-yellow-500" />
      default:
        return <div className="w-3 h-3 rounded-full bg-red-500" />
    }
  }
  
  // Renderizar contenido de la sección activa
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'info-general':
        return (
          <InformacionGeneralSection
            borrador={borrador}
            onSave={saveBorrador}
            saving={saving}
            modalidad={modalidad}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'hechos':
        return (
          <HechosSection
            borrador={borrador}
            codigoAccion={codigoAccion}
            modalidad={modalidad}
            caData={caData}
            onActiveHechoChange={setActiveHecho}
          />
        )
      case 'componentes':
        return (
          <ComponentesSection
            borrador={borrador}
            codigoAccion={codigoAccion}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'muestreo':
        return (
          <MuestreoSection
            borrador={borrador}
            codigoAccion={codigoAccion}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'otros-aspectos':
        return (
          <OtrosAspectosSection
            borrador={borrador}
            codigoAccion={codigoAccion}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'requerimiento':
        return (
          <RequerimientoSection
            borrador={borrador}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'personal-equipo':
        return (
          <PersonalEquipoSection
            borrador={borrador}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'anexos':
        return (
          <AnexosSection
            borrador={borrador}
            onStatusChange={handleSectionStatusChange}
          />
        )
      case 'exportar':
        return (
          <ExportarActaSection
            borrador={borrador}
            codigoAccion={codigoAccion}
            onStatusChange={handleSectionStatusChange}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="h-screen flex flex-col theme-gradient-page overflow-hidden">
      {/* Header - Usando AppHeader estándar */}
      <AppHeader showBackButton={true} onBack={onBack} />
      
      {/* Main Content - Altura restante después del header */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Fixed dentro del contenedor, no afectado por scroll del main */}
        <aside className="w-72 bg-white dark:bg-slate-800 pink:bg-white/95 border-r border-slate-200 dark:border-slate-700 pink:border-pink-200 flex flex-col flex-shrink-0 overflow-y-auto">
          {/* CA Selector - En el sidebar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-slate-600 mb-2 uppercase tracking-wide">
              Código de Acción
            </label>
            <div className="relative" ref={caDropdownRef}>
              <button
                type="button"
                onClick={() => setCaDropdownOpen(!caDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg text-sm bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 hover:border-primary-400 dark:hover:border-primary-500 pink:hover:border-pink-400 transition-colors"
              >
                {loadingCAs ? (
                  <span className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando...
                  </span>
                ) : (
                  <>
                    <span className={`font-medium truncate ${codigoAccion ? '' : 'text-slate-400'}`}>
                      {codigoAccion || 'Seleccionar CA...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${caDropdownOpen ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
              
              {/* Dropdown */}
              {caDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-600 pink:border-pink-300 rounded-lg shadow-xl z-50 max-h-80 overflow-hidden">
                  {/* Búsqueda */}
                  <div className="p-2 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={caSearchQuery}
                        onChange={(e) => setCaSearchQuery(e.target.value)}
                        placeholder="Buscar CA..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg bg-slate-50 dark:bg-slate-700 pink:bg-pink-50 text-slate-900 dark:text-white pink:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  {/* Lista de CAs */}
                  <div className="overflow-y-auto max-h-56">
                    {filteredCAs.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                        {availableCAs.length === 0 
                          ? 'No hay CAs disponibles. Sincroniza datos primero.'
                          : 'No se encontraron resultados'
                        }
                      </div>
                    ) : (
                      filteredCAs.map((ca, idx) => {
                        const codigo = ca.codigo || ca
                        const registros = ca.registros_activos
                        const isSelected = codigoAccion === codigo
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setCodigoAccion(codigo)
                              setCaDropdownOpen(false)
                              setCaSearchQuery('')
                            }}
                            className={`
                              w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors
                              ${isSelected 
                                ? 'bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 text-primary-700 dark:text-primary-300 pink:text-pink-700' 
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50 text-slate-700 dark:text-slate-300 pink:text-slate-700'
                              }
                            `}
                          >
                            <span className="font-medium truncate">{codigo}</span>
                            {registros !== null && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 pink:text-[#64748b] ml-2 flex-shrink-0">
                                {registros} reg.
                              </span>
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Tipo de acta badge */}
            {codigoAccion && !loading && (
              <div className="mt-3">
                <span className={`
                  inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium
                  ${modalidad === 'A' 
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 pink:bg-amber-100 pink:text-amber-800' 
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 pink:bg-blue-100 pink:text-blue-800'
                  }
                `}>
                  {modalidad === 'A' ? 'Suelos Empetrolados' : 'Regular/Especial'}
                </span>
              </div>
            )}
            
            {/* Indicador de guardado */}
            {saving && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                <div className="w-3 h-3 border-2 border-primary-500 pink:border-pink-500 border-t-transparent rounded-full animate-spin" />
                Guardando...
              </div>
            )}
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              const status = sectionStatus[item.id]
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all
                    ${isActive 
                      ? 'bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 text-primary-700 dark:text-primary-300 pink:text-pink-700 border-2 border-primary-500 pink:border-pink-500' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50 text-slate-700 dark:text-slate-300 pink:text-slate-700 border-2 border-transparent'
                    }
                  `}
                >
                  {/* Status indicator */}
                  {!item.isAction && getStatusIcon(status)}
                  
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600 dark:text-primary-400 pink:text-pink-600' : ''}`} />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <ChevronRight className={`w-4 h-4 ${isActive ? 'text-primary-600 dark:text-primary-400 pink:text-pink-600' : 'text-slate-400'}`} />
                </button>
              )
            })}
          </nav>
          
          {/* Botón AISA en sidebar - Solo visible cuando hay CA seleccionado */}
          {codigoAccion && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200">
              <button
                onClick={() => setShowAISAModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 pink:from-[#ff0075] pink:to-[#ff6eb4] pink:hover:from-[#e6006a] pink:hover:to-[#ff5a9f] text-white rounded-xl shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200"
                title="Abrir asistente AISA"
              >
                <div className="relative">
                  <Bot className="w-5 h-5" />
                  <Sparkles className="w-2.5 h-2.5 absolute -top-1 -right-1 text-yellow-300 animate-pulse" />
                </div>
                <div className="flex-1 text-left">
                  <span className="block text-sm font-semibold">Aisa</span>
                  <span className="block text-[10px] opacity-80">
                    {activeHecho ? 'Hecho activo' : 'Consultar IA'}
                  </span>
                </div>
                {activeHecho && (
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                )}
              </button>
            </div>
          )}
        </aside>
        
        {/* Content Area */}
        <main className="flex-1 theme-gradient-page overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-primary-500 pink:border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">Cargando datos...</p>
              </div>
            </div>
          ) : !codigoAccion ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <FileText className="w-16 h-16 text-slate-300 dark:text-slate-600 pink:text-pink-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-2">
                  Selecciona un Código de Acción
                </h2>
                <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                  Para comenzar a crear un acta, selecciona un código de acción (CA) disponible en el menú lateral.
                </p>
                {availableCAs.length === 0 && !loadingCAs && (
                  <p className="mt-4 text-sm text-amber-600 dark:text-amber-400 pink:text-amber-700">
                    No hay CAs disponibles. Sincroniza datos desde la página de visualización primero.
                  </p>
                )}
              </div>
            </div>
          ) : (
            renderActiveSection()
          )}
        </main>
      </div>
      
      {/* Modal de AISA */}
      <AISAModal
        isOpen={showAISAModal}
        onClose={() => setShowAISAModal(false)}
        caCode={codigoAccion}
        activeHecho={activeHecho}
      />
    </div>
  )
}

export default NuevaActaPage
