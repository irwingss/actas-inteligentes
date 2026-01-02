import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  FileText
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import RichTextEditor from '../RichTextEditor'
import { 
  normalizeHechoName, 
  getHechoCodigo,
  HECHOS_BY_CODIGO 
} from '../../constants/hechosVerificados'

const API_BASE = 'http://localhost:3000'

/**
 * RequerimientoSection - Tabla 7: Requerimiento de Información
 * 
 * Muestra una lista de checkboxes con requerimientos estándar basados en:
 * - El tipo de supervisión (Especial o Regular) desde borrador.tipo_supervision
 * - El hecho detectado de cada hecho habilitado
 * 
 * Los templates de requerimientos se cargan desde Supabase y pueden ser
 * gestionados por superadmins en /requerimientos-admin
 */
export const RequerimientoSection = ({ borrador, onStatusChange }) => {
  const { session } = useAuth()
  
  // Estados principales
  const [loading, setLoading] = useState(true)
  const [hechosElegibles, setHechosElegibles] = useState([])
  const [templates, setTemplates] = useState([])
  const [requerimientos, setRequerimientos] = useState({})
  // Estructura: { [numeroHecho]: { selectedTemplates: [id1, id2], plazo: "10", textoManual: "<p>...</p>" } }
  
  // Estados de UI
  const [expandedHechos, setExpandedHechos] = useState({})
  
  // Ref para evitar guardar antes de cargar datos iniciales
  const hasLoadedFromStorage = useRef(false)
  
  // Obtener tipo de supervisión del borrador
  const tipoSupervision = useMemo(() => {
    const tipo = borrador?.tipo_supervision?.toLowerCase() || ''
    if (tipo.includes('especial')) return 'Especial'
    if (tipo.includes('regular')) return 'Regular'
    // Default basado en tipo_acta si tipo_supervision no está definido
    if (borrador?.tipo_acta === 'especial') return 'Especial'
    return 'Regular'
  }, [borrador?.tipo_supervision, borrador?.tipo_acta])
  
  // Auth headers helper
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])
  
  // Clave para localStorage
  const getStorageKey = useCallback(() => {
    if (!borrador?.id) return null
    return `acta_requerimientos_v2_${borrador.id}`
  }, [borrador?.id])
  
  // Cargar datos
  const loadData = useCallback(async () => {
    if (!borrador?.id || !session?.access_token) return
    
    setLoading(true)
    try {
      // 1. Cargar templates de requerimientos desde Supabase (filtrado por tipo)
      const templatesResponse = await axios.get(
        `${API_BASE}/api/requerimientos?tipo_ca=${tipoSupervision}`,
        getAuthHeaders()
      )
      const loadedTemplates = templatesResponse.data.templates || []
      setTemplates(loadedTemplates)
      console.log('[RequerimientoSection] Templates cargados:', loadedTemplates.length, 'para tipo:', tipoSupervision)
      
      // 2. Cargar hechos del borrador
      const hechosResponse = await axios.get(
        `${API_BASE}/api/actas/${borrador.id}/hechos`,
        getAuthHeaders()
      )
      const todosLosHechos = hechosResponse.data.hechos || []
      
      // 3. Cargar estado de habilitados (switch on/off) desde localStorage
      const habilitadosKey = `acta_hechos_${borrador.id}_habilitados`
      let habilitados = {}
      try {
        const habilitadosStr = localStorage.getItem(habilitadosKey)
        if (habilitadosStr) {
          const habilitadosRaw = JSON.parse(habilitadosStr)
          // Normalizar claves antiguas (con underscores) a nuevas (con espacios)
          Object.entries(habilitadosRaw).forEach(([key, value]) => {
            const normalizedKey = normalizeHechoName(key)
            habilitados[normalizedKey] = value
          })
          console.log('[RequerimientoSection] Habilitados cargados:', Object.keys(habilitados).length)
        }
      } catch (e) {
        console.warn('[RequerimientoSection] Error cargando habilitados:', e)
      }
      
      // 4. Filtrar hechos que están:
      //    - Completados (is_completed = 1 o true)
      //    - Y con switch ON (habilitados[hechoKey] = true)
      // IMPORTANTE: Si no hay entrada en habilitados, el hecho NO se muestra (default: false)
      // Esto asegura que solo los hechos explícitamente activos aparezcan
      const elegibles = todosLosHechos.filter(hecho => {
        const isCompleted = hecho.is_completed === 1 || hecho.is_completed === true
        // Normalizar la clave del hecho para buscar en habilitados
        const hechoKeyRaw = hecho.hecho_detec_original || hecho.titulo_hecho
        const hechoKey = normalizeHechoName(hechoKeyRaw)
        // Solo mostrar si está explícitamente habilitado (switch ON)
        const isHabilitado = habilitados[hechoKey] === true
        
        console.log('[RequerimientoSection] Evaluando hecho:', {
          key: hechoKey?.substring(0, 30),
          isCompleted,
          isHabilitado,
          pasaFiltro: isCompleted && isHabilitado
        })
        
        return isCompleted && isHabilitado
      })
      
      elegibles.sort((a, b) => (a.numero_hecho || 0) - (b.numero_hecho || 0))
      setHechosElegibles(elegibles)
      
      // 5. Cargar requerimientos guardados desde localStorage
      const storageKey = getStorageKey()
      if (storageKey) {
        try {
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            setRequerimientos(parsed)
            console.log('[RequerimientoSection] Requerimientos cargados:', Object.keys(parsed).length)
          }
        } catch (e) {
          console.warn('[RequerimientoSection] Error cargando requerimientos:', e)
        }
      }
      
      // Inicializar expandedHechos con todos expandidos
      const initialExpanded = {}
      elegibles.forEach((_, idx) => {
        initialExpanded[idx + 1] = true
      })
      setExpandedHechos(initialExpanded)
      
      hasLoadedFromStorage.current = true
      
    } catch (error) {
      console.error('[RequerimientoSection] Error cargando datos:', error)
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [borrador?.id, session?.access_token, tipoSupervision, getAuthHeaders, getStorageKey])
  
  // Actualizar estado de la sección
  const updateSectionStatus = useCallback(() => {
    if (!onStatusChange) return
    
    if (hechosElegibles.length === 0) {
      onStatusChange('requerimiento', 'pending')
      return
    }
    
    // Verificar si hay al menos un requerimiento seleccionado O texto manual
    const hasAnyContent = Object.values(requerimientos).some(r => {
      const hasTemplates = r.selectedTemplates?.length > 0
      const hasTexto = r.textoManual && r.textoManual.replace(/<[^>]*>/g, '').trim().length > 0
      return hasTemplates || hasTexto
    })
    onStatusChange('requerimiento', hasAnyContent ? 'completed' : 'pending')
  }, [onStatusChange, hechosElegibles.length, requerimientos])
  
  // Cargar datos al montar o cuando cambie el tipo de supervisión
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Guardar en localStorage cuando cambien los requerimientos
  useEffect(() => {
    const storageKey = getStorageKey()
    if (!storageKey || !hasLoadedFromStorage.current) return
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(requerimientos))
      console.log('[RequerimientoSection] Guardado:', Object.keys(requerimientos).length)
    } catch (e) {
      console.error('[RequerimientoSection] Error guardando:', e)
    }
  }, [requerimientos, getStorageKey])
  
  // Actualizar estado cuando cambien los requerimientos
  useEffect(() => {
    if (!hasLoadedFromStorage.current) return
    updateSectionStatus()
  }, [requerimientos, updateSectionStatus])
  
  // Obtener templates aplicables a un hecho específico
  // Usa la lista centralizada de hechos verificados (A-S, Ñ) de Survey123
  const getTemplatesForHecho = useCallback((hecho) => {
    const hechoOriginal = hecho.hecho_detec_original || hecho.titulo_hecho || ''
    const normalizedHecho = normalizeHechoName(hechoOriginal)
    const hechoCode = getHechoCodigo(normalizedHecho)
    
    console.log('[RequerimientoSection] Buscando templates para:', {
      original: hechoOriginal?.substring(0, 50),
      normalized: normalizedHecho?.substring(0, 50),
      code: hechoCode
    })
    
    return templates.filter(template => {
      return template.hechos_asociados?.some(templateHecho => {
        const normalizedTemplate = normalizeHechoName(templateHecho)
        const templateCode = getHechoCodigo(normalizedTemplate)
        
        // Comparar por código de letra (A, B, C... Ñ... S)
        // Este es el método más robusto ya que el código es único
        const matchByCode = hechoCode && templateCode && hechoCode === templateCode
        
        // Fallback: comparar por nombre si el código no coincide
        const matchByName = !matchByCode && (
          normalizedHecho.toLowerCase().includes(normalizedTemplate.toLowerCase()) ||
          normalizedTemplate.toLowerCase().includes(normalizedHecho.toLowerCase())
        )
        
        return matchByCode || matchByName
      })
    })
  }, [templates])
  
  // Toggle selección de un template
  const toggleTemplate = (numeroHecho, templateId) => {
    setRequerimientos(prev => {
      const current = prev[numeroHecho] || { selectedTemplates: [], plazo: '' }
      const selected = current.selectedTemplates || []
      
      const newSelected = selected.includes(templateId)
        ? selected.filter(id => id !== templateId)
        : [...selected, templateId]
      
      return {
        ...prev,
        [numeroHecho]: {
          ...current,
          selectedTemplates: newSelected
        }
      }
    })
  }
  
  // Actualizar plazo
  const updatePlazo = (numeroHecho, plazo) => {
    setRequerimientos(prev => ({
      ...prev,
      [numeroHecho]: {
        ...prev[numeroHecho],
        selectedTemplates: prev[numeroHecho]?.selectedTemplates || [],
        plazo
      }
    }))
  }
  
  // Actualizar texto manual
  const updateTextoManual = (numeroHecho, textoManual) => {
    setRequerimientos(prev => ({
      ...prev,
      [numeroHecho]: {
        ...prev[numeroHecho],
        selectedTemplates: prev[numeroHecho]?.selectedTemplates || [],
        plazo: prev[numeroHecho]?.plazo || '',
        textoManual
      }
    }))
  }
  
  // Helper para verificar si hay contenido de texto enriquecido
  const hasRichTextContent = (html) => {
    if (!html) return false
    const text = html.replace(/<[^>]*>/g, '').trim()
    return text.length > 0
  }
  
  // Toggle expandir/colapsar hecho
  const toggleExpanded = (numeroHecho) => {
    setExpandedHechos(prev => ({
      ...prev,
      [numeroHecho]: !prev[numeroHecho]
    }))
  }
  
  // Obtener datos de un hecho
  const getHechoData = (numeroHecho) => {
    return requerimientos[numeroHecho] || { selectedTemplates: [], plazo: '', textoManual: '' }
  }
  
  // Renderizar loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary-500 pink:text-pink-500 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">Cargando requerimientos...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
            Requerimiento de Información
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
            Selecciona los requerimientos estándar para cada hecho verificado
          </p>
        </div>
        
        {/* Badge de tipo */}
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${
          tipoSupervision === 'Especial'
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        }`}>
          {tipoSupervision}
        </span>
      </div>
      
      {/* Mensaje informativo */}
      <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50/80 border border-blue-200 dark:border-blue-800 pink:border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 pink:text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200 pink:text-blue-800">
            <p className="font-medium mb-1">Tabla 7 del Acta de Supervisión</p>
            <p>
              Se muestran requerimientos estándar filtrados por <strong>tipo de supervisión ({tipoSupervision})</strong> y 
              <strong> hecho detectado</strong>. Marca los que apliquen y define el plazo en días hábiles.
            </p>
          </div>
        </div>
      </div>
      
      {/* Lista de hechos con sus requerimientos */}
      {hechosElegibles.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 pink:text-pink-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white pink:text-[#0f172a] mb-2">
            No hay hechos elegibles
          </h3>
          <p className="text-slate-500 dark:text-slate-400 pink:text-[#64748b] max-w-md mx-auto">
            Para añadir requerimientos, primero debes tener al menos un hecho 
            <strong className="text-slate-700 dark:text-slate-300"> completado</strong> y 
            <strong className="text-slate-700 dark:text-slate-300"> activo</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {hechosElegibles.map((hecho, index) => {
            const numeroHecho = index + 1
            const hechoData = getHechoData(numeroHecho)
            const applicableTemplates = getTemplatesForHecho(hecho)
            const isExpanded = expandedHechos[numeroHecho]
            const selectedCount = hechoData.selectedTemplates?.length || 0
            const hasManualText = hasRichTextContent(hechoData.textoManual)
            const hasAnyContent = selectedCount > 0 || hasManualText
            
            // Obtener código de letra del hecho original (A, B, ... S, Ñ)
            const hechoOriginal = hecho.hecho_detec_original || ''
            const normalizedOriginal = normalizeHechoName(hechoOriginal)
            const hechoCode = getHechoCodigo(normalizedOriginal)
            const hechoCanonical = HECHOS_BY_CODIGO[hechoCode]
            
            // Mostrar el título personalizado si existe, o el nombre canónico normalizado
            const hechoName = hecho.titulo_hecho || normalizedOriginal || 'Hecho sin nombre'
            
            return (
              <div 
                key={hecho.id || index}
                className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden"
              >
                {/* Header del hecho (clickeable) */}
                <button
                  onClick={() => toggleExpanded(numeroHecho)}
                  className="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 pink:hover:bg-pink-50/30 transition-colors"
                >
                  {/* Número de hecho */}
                  <div className={`
                    w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0
                    ${hasAnyContent
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }
                  `}>
                    {numeroHecho}
                  </div>
                  
                  {/* Info del hecho */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-white pink:text-slate-900 truncate">
                        {hechoName}
                      </p>
                      {/* Badge con código de hecho para matching */}
                      {hechoCode && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 flex-shrink-0" title={hechoCanonical?.nombre || normalizedOriginal}>
                          {hechoCode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500 mt-0.5">
                      {applicableTemplates.length > 0 
                        ? `${applicableTemplates.length} requerimiento${applicableTemplates.length !== 1 ? 's' : ''} disponible${applicableTemplates.length !== 1 ? 's' : ''}`
                        : 'Solo texto manual'
                      }
                      {selectedCount > 0 && (
                        <span className="text-green-600 dark:text-green-400 ml-2">
                          • {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {hasManualText && (
                        <span className="text-green-600 dark:text-green-400 ml-2">
                          • Texto manual añadido
                        </span>
                      )}
                    </p>
                  </div>
                  
                  {/* Indicadores */}
                  <div className="flex items-center gap-2">
                    {hasAnyContent && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>
                
                {/* Contenido expandible */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pink:border-pink-100">
                    {/* Lista de checkboxes (solo si hay templates configurados) */}
                    {applicableTemplates.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Requerimientos predefinidos
                        </p>
                        {applicableTemplates.map((template) => {
                          const isSelected = hechoData.selectedTemplates?.includes(template.id)
                          
                          return (
                            <label
                              key={template.id}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-50 border border-primary-200 dark:border-primary-800 pink:border-pink-200'
                                  : 'bg-slate-50 dark:bg-slate-700/50 pink:bg-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50/50 border border-transparent'
                              }`}
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-primary-600 border-primary-600 pink:bg-pink-600 pink:border-pink-600'
                                    : 'border-slate-300 dark:border-slate-500 pink:border-pink-300'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleTemplate(numeroHecho, template.id)}
                                  className="sr-only"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-pre-wrap">
                                  {template.texto}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    
                    {/* Campo de texto manual - SIEMPRE visible */}
                    <div className={`${applicableTemplates.length > 0 ? 'mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 pink:border-pink-100' : 'mt-4'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          {applicableTemplates.length > 0 ? 'Requerimiento adicional (manual)' : 'Requerimiento manual'}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {applicableTemplates.length > 0 
                          ? 'Añade texto adicional que se mostrará debajo de los requerimientos seleccionados.'
                          : 'No hay requerimientos predefinidos para este hecho. Ingresa el requerimiento de forma manual.'
                        }
                      </p>
                      <RichTextEditor
                        value={hechoData.textoManual || ''}
                        onChange={(value) => updateTextoManual(numeroHecho, value)}
                        placeholder="Escribe aquí el requerimiento de información adicional..."
                        minHeight="120px"
                      />
                    </div>
                    
                    {/* Campo de plazo */}
                    <div className="mt-4 flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-700 pink:border-pink-100">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
                        Plazo para cumplimiento:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={hechoData.plazo || ''}
                        onChange={(e) => updatePlazo(numeroHecho, e.target.value)}
                        placeholder="10"
                        className="w-20 px-3 py-2 border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg 
                          bg-white dark:bg-slate-700 pink:bg-white
                          text-slate-900 dark:text-white pink:text-slate-900 text-center
                          placeholder:text-slate-400
                          focus:outline-none focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500
                          text-sm"
                      />
                      <span className="text-sm text-slate-500 dark:text-slate-400">días hábiles</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      
      {/* Resumen y nota al pie */}
      {hechosElegibles.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 pink:text-slate-500">
          <span>
            {hechosElegibles.length} hecho{hechosElegibles.length !== 1 ? 's' : ''} •{' '}
            {Object.values(requerimientos).reduce((sum, r) => sum + (r.selectedTemplates?.length || 0), 0)} check{Object.values(requerimientos).reduce((sum, r) => sum + (r.selectedTemplates?.length || 0), 0) !== 1 ? 's' : ''} •{' '}
            {Object.values(requerimientos).filter(r => r.textoManual && r.textoManual.replace(/<[^>]*>/g, '').trim().length > 0).length} texto{Object.values(requerimientos).filter(r => r.textoManual && r.textoManual.replace(/<[^>]*>/g, '').trim().length > 0).length !== 1 ? 's' : ''} manual{Object.values(requerimientos).filter(r => r.textoManual && r.textoManual.replace(/<[^>]*>/g, '').trim().length > 0).length !== 1 ? 'es' : ''}
          </span>
          <span className="italic">
            Los cambios se guardan automáticamente
          </span>
        </div>
      )}
    </div>
  )
}

export default RequerimientoSection
