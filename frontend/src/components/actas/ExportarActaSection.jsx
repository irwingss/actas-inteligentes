import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/axios'
import toast from 'react-hot-toast'
import { 
  Download,
  FileText,
  ClipboardList,
  MapPin,
  FlaskConical,
  Users,
  Paperclip,
  CheckCircle,
  Clock,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  BarChart3,
  PieChart,
  TrendingUp,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Layers
} from 'lucide-react'

/**
 * Componente ExportarActaSection
 * 
 * Muestra un resumen de métricas del acta:
 * - Hechos: completados, pendientes, por nivel de riesgo
 * - Componentes: total, por tipo, por instalación
 * - Muestreo: puntos de muestreo
 * - Personal: equipo supervisor y otros aspectos
 * - Anexos: seleccionados y personalizados
 * 
 * Incluye botón para generar el acta en Word
 */
export function ExportarActaSection({ 
  borrador,
  codigoAccion,
  onStatusChange
}) {
  const { session } = useAuth()
  
  // Estados para los datos
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [metrics, setMetrics] = useState({
    hechos: { total: 0, completados: 0, pendientes: 0, porRiesgo: {} },
    componentes: { total: 0, porTipo: {}, porInstalacion: {} },
    muestreo: { total: 0, porMatriz: {} },
    personal: { equipoSupervisor: 0, otrosAspectos: 0 },
    anexos: { templateSeleccionados: 0, personalizados: 0, total: 0 }
  })

  // Cargar métricas
  const loadMetrics = useCallback(async () => {
    if (!borrador?.id) return
    
    setLoading(true)
    try {
      // Cargar hechos desde API
      const hechosRes = await api.get(`/api/actas/${borrador.id}/hechos`)
      const hechos = hechosRes.data.hechos || []
      
      // Cargar componentes desde API
      const componentesRes = await api.get(`/api/actas/${borrador.id}/componentes`)
      const componentes = componentesRes.data.componentes || []
      
      // Cargar muestreo (fuente de verdad: backend / actas_muestreos). Fallback a localStorage.
      let muestreoData = []
      try {
        const muestreosRes = await api.get(`/api/actas/${borrador.id}/muestreos`)
        muestreoData = muestreosRes.data?.muestreos || []
      } catch (e) {
        const muestreoKey = `acta_muestreos_${borrador.id}`
        muestreoData = JSON.parse(localStorage.getItem(muestreoKey) || '[]')
      }
      
      // Cargar personal desde localStorage
      const equipoSupervisorData = JSON.parse(localStorage.getItem(`acta_equipo_supervisor_${borrador.id}`) || '[]')
      const equipoOtrosData = JSON.parse(localStorage.getItem(`acta_equipo_otros_${borrador.id}`) || '[]')
      
      // Cargar anexos desde localStorage
      const anexosSeleccionados = JSON.parse(localStorage.getItem(`acta_anexos_${borrador.id}`) || '{}')
      const anexosCustom = JSON.parse(localStorage.getItem(`acta_anexos_custom_${borrador.id}`) || '[]')
      
      // Calcular métricas de hechos
      const hechosCompletados = hechos.filter(h => h.is_completed).length
      const hechosPorRiesgo = hechos.reduce((acc, h) => {
        const nivel = h.nivel_riesgo || 'Sin evaluar'
        acc[nivel] = (acc[nivel] || 0) + 1
        return acc
      }, {})
      
      // Calcular métricas de componentes
      const componentesPorTipo = componentes.reduce((acc, c) => {
        const tipo = c.tipo_componente || 'Sin tipo'
        acc[tipo] = (acc[tipo] || 0) + 1
        return acc
      }, {})
      
      const componentesPorInstalacion = componentes.reduce((acc, c) => {
        const inst = c.instalacion_referencia || 'Sin instalación'
        acc[inst] = (acc[inst] || 0) + 1
        return acc
      }, {})
      
      // Calcular métricas de muestreo (el campo es 'matriz', no 'tipo')
      const muestreoPorMatriz = muestreoData.reduce((acc, m) => {
        const matriz = m.matriz || 'Sin asignar'
        acc[matriz] = (acc[matriz] || 0) + 1
        return acc
      }, {})
      
      // Contar anexos seleccionados (templates)
      const templateSeleccionados = Object.values(anexosSeleccionados).filter(Boolean).length
      const customSeleccionados = anexosCustom.filter(a => anexosSeleccionados[`custom_${a.id}`]).length
      
      setMetrics({
        hechos: {
          total: hechos.length,
          completados: hechosCompletados,
          pendientes: hechos.length - hechosCompletados,
          porRiesgo: hechosPorRiesgo
        },
        componentes: {
          total: componentes.length,
          porTipo: componentesPorTipo,
          porInstalacion: componentesPorInstalacion
        },
        muestreo: {
          total: muestreoData.length,
          porMatriz: muestreoPorMatriz
        },
        personal: {
          equipoSupervisor: equipoSupervisorData.length,
          otrosAspectos: equipoOtrosData.length
        },
        anexos: {
          templateSeleccionados,
          personalizados: customSeleccionados,
          total: templateSeleccionados + customSeleccionados
        }
      })
      
    } catch (error) {
      console.error('Error loading metrics:', error)
    } finally {
      setLoading(false)
    }
  }, [borrador?.id])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  // Generar acta Word
  const handleGenerateWord = async () => {
    if (!borrador?.id) return
    
    setGenerating(true)
    try {
      // Muestreos: el backend los puede cargar desde BD si no enviamos nada
      const muestreos = []

      // Cargar Otros Aspectos desde localStorage para enviar al backend
      // Preferir la clave consolidada (incluye descripciones editadas). Fallback a claves legacy.
      let otrosAspectos = { descripcion: '', fotos: [] }
      try {
        const packed = localStorage.getItem(`acta_borrador_${borrador.id}_otros_aspectos`)
        if (packed) {
          const parsed = JSON.parse(packed)
          otrosAspectos = {
            descripcion: parsed?.descripcion || '',
            fotos: Array.isArray(parsed?.fotos) ? parsed.fotos : []
          }
        } else {
          const otrosAspectosDesc = localStorage.getItem(`acta_otros_aspectos_${borrador.id}_descripcion_general`) || ''
          const otrosAspectosFotos = JSON.parse(localStorage.getItem(`acta_otros_aspectos_${borrador.id}_seleccion`) || '[]')
          otrosAspectos = { descripcion: otrosAspectosDesc, fotos: otrosAspectosFotos }
        }
      } catch (_) {
        const otrosAspectosDesc = localStorage.getItem(`acta_otros_aspectos_${borrador.id}_descripcion_general`) || ''
        const otrosAspectosFotos = JSON.parse(localStorage.getItem(`acta_otros_aspectos_${borrador.id}_seleccion`) || '[]')
        otrosAspectos = { descripcion: otrosAspectosDesc, fotos: otrosAspectosFotos }
      }

      // Equipo supervisor no presente durante la firma del acta
      // Se toma desde la tabla "Otros Aspectos" del módulo Personal y Equipo.
      const equipoOtros = JSON.parse(localStorage.getItem(`acta_equipo_otros_${borrador.id}`) || '[]')
      const supervisoresNoPresentes = Array.isArray(equipoOtros)
        ? equipoOtros.map(m => ({
          nombre: m.apellidos_nombres || '',
          cargo: m.cargo || m.num_colegiatura || '',
          dni: m.dni || ''
        }))
        : []
      
      // Cargar Requerimientos de Información desde localStorage (v2 = checkboxes)
      // y transformar IDs de templates a texto real
      let requerimientos = {}
      try {
        const requerimientosV2 = JSON.parse(localStorage.getItem(`acta_requerimientos_v2_${borrador.id}`) || '{}')
        
        // Si hay datos v2 (nuevo sistema de checkboxes), transformar a formato esperado por backend
        if (Object.keys(requerimientosV2).length > 0) {
          // Cargar templates para obtener el texto
          const tipoSupervision = borrador?.tipo_supervision?.toLowerCase()?.includes('especial') ? 'Especial' : 'Regular'
          const templatesRes = await api.get(`/api/requerimientos?tipo_ca=${tipoSupervision}`)
          const templates = templatesRes.data.templates || []
          const templatesMap = templates.reduce((acc, t) => { acc[t.id] = t; return acc }, {})
          
          // Transformar cada hecho: convertir selectedTemplates IDs a texto + texto manual
          for (const [numeroHecho, data] of Object.entries(requerimientosV2)) {
            const selectedIds = data.selectedTemplates || []
            const textoManual = data.textoManual || ''
            
            // Obtener texto de cada template seleccionado
            const textosChecks = selectedIds
              .map(id => templatesMap[id]?.texto)
              .filter(Boolean)
            
            // Convertir texto manual HTML a texto plano si existe
            let textoManualPlano = ''
            if (textoManual) {
              textoManualPlano = textoManual
                .replace(/<\/p>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/li>/gi, '\n')
                .replace(/<li>/gi, '• ')
                .replace(/<[^>]*>/g, '')
                .trim()
            }
            
            // Construir descripción final
            let descripcion = ''
            
            if (textosChecks.length > 0 && textoManualPlano) {
              // Hay checks Y texto manual: unir checks con \n\n, luego salto de línea + espacio + texto manual
              descripcion = textosChecks.join('\n\n') + '\n\n' + textoManualPlano
            } else if (textosChecks.length > 0) {
              // Solo checks: unir con \n\n
              descripcion = textosChecks.join('\n\n')
            } else if (textoManualPlano) {
              // Solo texto manual: directo sin salto previo
              descripcion = textoManualPlano
            }
            
            // Solo agregar si hay algún contenido
            if (descripcion) {
              requerimientos[numeroHecho] = {
                descripcion,
                plazo: data.plazo || ''
              }
            }
          }
        } else {
          // Fallback al formato antiguo (v1) si existe
          requerimientos = JSON.parse(localStorage.getItem(`acta_requerimientos_${borrador.id}`) || '{}')
        }
      } catch (e) {
        console.warn('Error transformando requerimientos:', e)
        // Fallback al formato antiguo
        requerimientos = JSON.parse(localStorage.getItem(`acta_requerimientos_${borrador.id}`) || '{}')
      }
      
      // Cargar cantidad de firmas del personal del administrado desde localStorage
      const cantidadFirmasAdministrado = parseInt(localStorage.getItem(`acta_firmas_administrado_${borrador.id}`) || '2', 10)
      
      // Cargar equipo supervisor desde localStorage para sección de firmas
      const equipoSupervisor = JSON.parse(localStorage.getItem(`acta_equipo_supervisor_${borrador.id}`) || '[]')
      
      // Cargar cantidad de firmas de otros participantes (peritos, etc.)
      const cantidadFirmasOtrosParticipantes = parseInt(localStorage.getItem(`acta_firmas_otros_participantes_${borrador.id}`) || '2', 10)
      
      // Llamar al endpoint POST para generar el documento Word
      const response = await api.post(`/api/actas/borradores/${borrador.id}/generate-word`, 
        { muestreos, otrosAspectos, requerimientos, cantidadFirmasAdministrado, equipoSupervisor, cantidadFirmasOtrosParticipantes, supervisoresNoPresentes },
        { responseType: 'blob' }
      )
      
      // Crear blob y preparar archivo
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      const fileName = `Acta_Supervision_${codigoAccion || 'acta'}.docx`
      
      // Verificar si estamos en Electron
      const isElectron = window.electron || (navigator.userAgent.toLowerCase().indexOf('electron') > -1)
      
      if (isElectron && window.electron?.saveAndOpenFile) {
        // En Electron: guardar y abrir automáticamente
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        await window.electron.saveAndOpenFile(fileName, uint8Array)
      } else {
        // En navegador web: descargar y abrir con FileSaver API
        const url = window.URL.createObjectURL(blob)
        
        // Descargar el archivo
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Limpiar URL
        setTimeout(() => {
          window.URL.revokeObjectURL(url)
        }, 1000)
      }
      
      // Mostrar toast de éxito
      toast.success(`¡Acta "${fileName}" exportada exitosamente!`, {
        duration: 4000,
        icon: '✅'
      })
      
    } catch (error) {
      console.error('Error generating Word:', error)
      toast.error('Error al generar el documento Word. Por favor intente nuevamente.')
    } finally {
      setGenerating(false)
    }
  }

  // Obtener color por nivel de riesgo
  const getRiskColor = (nivel) => {
    switch (nivel?.toLowerCase()) {
      case 'crítico':
      case 'muy alto':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      case 'alto':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
      case 'medio':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'bajo':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
    }
  }

  // Calcular progreso general
  const calculateProgress = () => {
    let completed = 0
    let total = 5 // Secciones: info, hechos, componentes, personal, anexos
    
    if (borrador?.nombre_administrado) completed++
    if (metrics.hechos.total > 0 && metrics.hechos.completados === metrics.hechos.total) completed++
    if (metrics.componentes.total > 0) completed++
    if (metrics.personal.equipoSupervisor > 0) completed++
    if (metrics.anexos.total > 0) completed++
    
    return Math.round((completed / total) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-500 pink:text-pink-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
            Calculando métricas...
          </p>
        </div>
      </div>
    )
  }

  const progress = calculateProgress()

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
            Exportar Acta
          </h2>
          <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b] mt-1">
            Resumen y métricas del acta para {codigoAccion}
          </p>
        </div>
        <button
          onClick={loadMetrics}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 pink:text-[#64748b] pink:hover:text-[#0f172a] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
          title="Actualizar métricas"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Progreso General */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
                Progreso General
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                Completitud del acta
              </p>
            </div>
          </div>
          <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 pink:text-pink-600">
            {progress}%
          </div>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 pink:bg-pink-100 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500 pink:from-pink-500 pink:to-pink-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
          <div className={`p-2 rounded ${borrador?.nombre_administrado ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            Info General
          </div>
          <div className={`p-2 rounded ${metrics.hechos.total > 0 && metrics.hechos.completados === metrics.hechos.total ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            Hechos
          </div>
          <div className={`p-2 rounded ${metrics.componentes.total > 0 ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            Componentes
          </div>
          <div className={`p-2 rounded ${metrics.personal.equipoSupervisor > 0 ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            Personal
          </div>
          <div className={`p-2 rounded ${metrics.anexos.total > 0 ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
            Anexos
          </div>
        </div>
      </div>

      {/* Métricas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Card: Hechos */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 pink:bg-blue-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Hechos Verificados
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">Total</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                {metrics.hechos.total}
              </span>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 bg-green-50 dark:bg-green-900/20 pink:bg-green-50 rounded-lg p-2 text-center">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-green-700 dark:text-green-400">
                  {metrics.hechos.completados}
                </div>
                <div className="text-xs text-green-600 dark:text-green-500">Completados</div>
              </div>
              <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 pink:bg-amber-50 rounded-lg p-2 text-center">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                  {metrics.hechos.pendientes}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-500">Pendientes</div>
              </div>
            </div>

            {/* Desglose por nivel de riesgo */}
            {Object.keys(metrics.hechos.porRiesgo).length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 pink:border-pink-100">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b] mb-2">
                  Por nivel de riesgo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(metrics.hechos.porRiesgo).map(([nivel, count]) => (
                    <span 
                      key={nivel}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(nivel)}`}
                    >
                      {nivel}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card: Componentes */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 pink:bg-emerald-100 rounded-lg">
              <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Componentes
            </h3>
          </div>
          
          <div className="space-y-3">
            {/* Resumen numérico en 3 columnas */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 pink:bg-emerald-50 rounded-lg p-2 text-center">
                <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {Object.keys(metrics.componentes.porInstalacion).length}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-500">Instalaciones</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50 rounded-lg p-2 text-center">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                  {Object.keys(metrics.componentes.porTipo).length}
                </div>
                <div className="text-[10px] text-blue-600 dark:text-blue-500">Tipos</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 pink:bg-slate-50 rounded-lg p-2 text-center">
                <MapPin className="w-4 h-4 text-slate-600 dark:text-slate-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  {metrics.componentes.total}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Componentes</div>
              </div>
            </div>

          </div>
        </div>

        {/* Card: Muestreo */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 pink:bg-purple-100 rounded-lg">
              <FlaskConical className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Muestreo Ambiental
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">Puntos</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                {metrics.muestreo.total}
              </span>
            </div>

            {metrics.muestreo.total === 0 ? (
              <div className="text-center py-4 text-slate-400 dark:text-slate-500">
                <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin puntos de muestreo</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                  Por matriz
                </p>
                {Object.entries(metrics.muestreo.porMatriz).map(([matriz, count]) => (
                  <div key={matriz} className="flex justify-between items-center text-sm">
                    <span className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                      {matriz.replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Card: Personal */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 pink:bg-cyan-100 rounded-lg">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Personal y Equipo
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">Total</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                {metrics.personal.equipoSupervisor + metrics.personal.otrosAspectos}
              </span>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-cyan-50 dark:bg-cyan-900/20 pink:bg-cyan-50 rounded-lg p-2 text-center">
                <Shield className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-cyan-700 dark:text-cyan-400">
                  {metrics.personal.equipoSupervisor}
                </div>
                <div className="text-xs text-cyan-600 dark:text-cyan-500">Eq. Supervisor</div>
              </div>
              <div className="flex-1 bg-slate-50 dark:bg-slate-700/50 pink:bg-slate-50 rounded-lg p-2 text-center">
                <Users className="w-4 h-4 text-slate-600 dark:text-slate-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  {metrics.personal.otrosAspectos}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Otros Aspectos</div>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Anexos */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 pink:bg-amber-100 rounded-lg">
              <Paperclip className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Anexos
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">Seleccionados</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                {metrics.anexos.total}
              </span>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 pink:bg-amber-50 rounded-lg p-2 text-center">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                  {metrics.anexos.templateSeleccionados}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-500">Templates</div>
              </div>
              <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 pink:bg-emerald-50 rounded-lg p-2 text-center">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {metrics.anexos.personalizados}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-500">Personalizados</div>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Información del Borrador */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-100 dark:bg-slate-700 pink:bg-slate-100 rounded-lg">
              <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Info. del Acta
            </h3>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Expediente</span>
              <span className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
                {borrador?.expediente || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Administrado</span>
              <span className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a] truncate max-w-[150px]">
                {borrador?.nombre_administrado || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 pink:text-[#64748b]">RUC</span>
              <span className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
                {borrador?.ruc || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Estado</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                borrador?.status === 'completed' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {borrador?.status === 'completed' ? 'Completado' : 'En progreso'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Botón Generar Word */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 pink:from-pink-50 pink:to-pink-100 rounded-xl border border-primary-200 dark:border-primary-800 pink:border-pink-200 p-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Generar Documento
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b] mt-1">
              Exporta el acta completa en formato Word (.docx) con todos los datos ingresados.
            </p>
          </div>
          
          <button
            onClick={handleGenerateWord}
            disabled={generating || metrics.hechos.total === 0}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-lg
              transition-all duration-200 transform hover:scale-105
              ${generating || metrics.hechos.total === 0
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 pink:from-pink-500 pink:to-pink-600 pink:hover:from-pink-600 pink:hover:to-pink-700'
              }
            `}
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Generar Acta en Word
              </>
            )}
          </button>
        </div>
        
        {metrics.hechos.total === 0 && (
          <div className="mt-4 flex items-center gap-2 text-amber-600 dark:text-amber-400 pink:text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            Debes agregar al menos un hecho verificado para generar el acta.
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportarActaSection
