import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Check,
  MapPin,
  Anchor
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

const API_BASE = 'http://localhost:3000'

// Helper: Formatea la altitud (redondea a entero)
const formatAltitud = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : value
}

// Helper: Formatea el nombre del componente con tipo si existe
const formatComponenteName = (comp) => {
  if (!comp) return ''
  let nombre = comp.componente || ''
  if (comp.tipo_componente && comp.tipo_componente !== comp.componente) {
    nombre = `${comp.tipo_componente} - ${comp.componente}`
  }
  return nombre
}

export const ComponentesSection = ({ borrador, codigoAccion, onStatusChange }) => {
  const { session } = useAuth()

  // Estado principal
  const [componentes, setComponentes] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)


  // Estado para edición inline
  const [editingCell, setEditingCell] = useState(null) // { rowId, field }
  const [editValue, setEditValue] = useState('')


  // Ref para evitar recargas innecesarias
  const lastLoadedBorradorId = useRef(null)

  // Auth headers helper
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])

  // Cargar componentes guardados del borrador
  // Primero sincroniza automáticamente desde las fotos seleccionadas en hechos
  const loadComponentes = useCallback(async () => {
    if (!borrador?.id || !session?.access_token) return

    // Evitar recargas innecesarias
    if (lastLoadedBorradorId.current === borrador.id && componentes.length > 0) {
      return
    }

    setLoading(true)
    try {
      // 1. Primero sincronizar automáticamente desde hechos (arcgis_records actualizado)
      console.log('[ComponentesSection] 🔄 Sincronizando componentes desde hechos...')
      try {
        await axios.post(
          `${API_BASE}/api/actas/${borrador.id}/componentes/sync-from-hechos`,
          {},
          getAuthHeaders()
        )
        console.log('[ComponentesSection] ✅ Sincronización automática completada')
      } catch (syncError) {
        console.warn('[ComponentesSection] Sincronización automática falló:', syncError.message)
      }

      // 2. Luego cargar los componentes actualizados
      const response = await axios.get(
        `${API_BASE}/api/actas/${borrador.id}/componentes`,
        getAuthHeaders()
      )

      if (response.data.success) {
        // Convertir es_marino de SQLite (0/1) a booleano
        const componentesNormalizados = (response.data.componentes || []).map(c => ({
          ...c,
          es_marino: Boolean(c.es_marino && c.es_marino !== 0 && c.es_marino !== '0')
        }))
        setComponentes(componentesNormalizados)
        lastLoadedBorradorId.current = borrador.id

        // Actualizar estado de la sección
        if (response.data.componentes?.length > 0) {
          onStatusChange?.('componentes', 'completed')
        }
      }
    } catch (error) {
      console.error('[ComponentesSection] Error cargando componentes:', error)
      toast.error('Error al cargar componentes')
    } finally {
      setLoading(false)
    }
  }, [borrador?.id, session, getAuthHeaders, onStatusChange])

  // Cargar al montar
  useEffect(() => {
    loadComponentes()
  }, [loadComponentes])


  // Agregar nueva fila
  const handleAddRow = () => {
    const newComponente = {
      id: `temp_${Date.now()}`, // ID temporal
      numero: componentes.length + 1,
      componente: '',
      este: '',
      norte: '',
      altitud: '',
      descripcion: '',
      es_marino: false, // Por defecto NO es marino
      isNew: true
    }
    setComponentes([...componentes, newComponente])
    onStatusChange?.('componentes', 'in_progress')
  }

  // Toggle para marcar componente como marino (persiste en backend)
  const handleToggleMarino = async (compId) => {
    const comp = componentes.find(c => c.id === compId)
    if (!comp || !borrador?.id) return

    const newEsMarino = !comp.es_marino

    // Actualizar estado local inmediatamente para UI responsiva
    const updatedComponentes = componentes.map(c =>
      c.id === compId ? { ...c, es_marino: newEsMarino } : c
    )
    setComponentes(updatedComponentes)
    onStatusChange?.('componentes', 'in_progress')

    // Persistir en backend (omitir para componentes nuevos no guardados)
    if (!comp.isNew) {
      try {
        await axios.put(
          `${API_BASE}/api/actas/${borrador.id}/componentes/${comp.id}`,
          { es_marino: newEsMarino },
          getAuthHeaders()
        )
        console.log(`[ComponentesSection] ✅ es_marino actualizado: ${comp.id} -> ${newEsMarino}`)
      } catch (error) {
        console.error('[ComponentesSection] Error guardando es_marino:', error)
        toast.error('Error al guardar estado marino')
        // Revertir en caso de error
        setComponentes(componentes)
      }
    }
  }

  // Eliminar fila
  const handleDeleteRow = async (index) => {
    const comp = componentes[index]

    // Si es nuevo (no guardado), solo eliminarlo del estado
    if (comp.isNew) {
      const newComponentes = componentes.filter((_, i) => i !== index)
      // Renumerar
      newComponentes.forEach((c, i) => { c.numero = i + 1 })
      setComponentes(newComponentes)
      return
    }

    // Si está guardado, eliminarlo de la BD
    if (!borrador?.id) return

    try {
      await axios.delete(
        `${API_BASE}/api/actas/${borrador.id}/componentes/${comp.id}`,
        getAuthHeaders()
      )

      const newComponentes = componentes.filter((_, i) => i !== index)
      // Renumerar
      newComponentes.forEach((c, i) => { c.numero = i + 1 })
      setComponentes(newComponentes)
      toast.success('Componente eliminado')
    } catch (error) {
      console.error('[ComponentesSection] Error eliminando componente:', error)
      toast.error('Error al eliminar componente')
    }
  }

  // Iniciar edición de celda
  const handleStartEdit = (rowId, field, currentValue) => {
    setEditingCell({ rowId, field })
    setEditValue(currentValue || '')
  }

  // Guardar edición de celda - guarda inmediatamente solo el componente editado
  const handleSaveEdit = async () => {
    if (!editingCell || !borrador?.id) return

    const { rowId, field } = editingCell
    const index = componentes.findIndex(c => c.id === rowId)
    if (index === -1) {
      setEditingCell(null)
      return
    }

    const comp = componentes[index]
    const newValue = field === 'altitud' ? formatAltitud(editValue) : editValue
    const updatedComp = { ...comp, [field]: newValue }

    // Actualizar estado local inmediatamente
    const updatedComponentes = [...componentes]
    updatedComponentes[index] = updatedComp
    setComponentes(updatedComponentes)
    setEditingCell(null)
    setEditValue('')

    // Guardar en backend
    try {
      if (comp.isNew) {
        // Crear nuevo componente
        const { isNew, id, ...data } = updatedComp
        const response = await axios.post(
          `${API_BASE}/api/actas/${borrador.id}/componentes`,
          data,
          getAuthHeaders()
        )
        // Actualizar con el ID real del servidor
        if (response.data.success && response.data.componente) {
          updatedComponentes[index] = { ...response.data.componente, isNew: false }
          setComponentes([...updatedComponentes])
        }
      } else {
        // Actualizar existente
        await axios.put(
          `${API_BASE}/api/actas/${borrador.id}/componentes/${comp.id}`,
          updatedComp,
          getAuthHeaders()
        )

        // Sincronizar con arcgis_records si tiene globalid_origen y se editó componente/instalacion
        if (comp.globalid_origen && ['componente', 'instalacion_referencia'].includes(field)) {
          await axios.put(
            `${API_BASE}/api/s123/direct/metadata/${comp.globalid_origen}`,
            {
              componente: updatedComp.componente,
              instalacion_referencia: updatedComp.instalacion_referencia
            },
            getAuthHeaders()
          )
          console.log(`[ComponentesSection] ✅ Sincronizado con arcgis_records: ${comp.globalid_origen}`)
        }
      }

      onStatusChange?.('componentes', 'completed')
    } catch (error) {
      console.error('[ComponentesSection] Error guardando componente:', error)
      toast.error('Error al guardar')
    }
  }

  // Cancelar edición
  const handleCancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  // Renderizar celda editable
  // displayValue: lo que se muestra en la celda (puede ser formateado)
  // editableValue: lo que se edita (valor real del campo, opcional - si no se pasa, usa displayValue)
  const renderEditableCell = (comp, field, displayValue, placeholder = '', editableValue = null) => {
    const isEditing = editingCell?.rowId === comp.id && editingCell?.field === field
    const valueToEdit = editableValue !== null ? editableValue : displayValue

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          {field === 'descripcion' ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 pink:border-pink-400 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 min-h-[60px] resize-y"
              placeholder={placeholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') handleCancelEdit()
              }}
            />
          ) : (
            <input
              type={['este', 'norte', 'altitud'].includes(field) ? 'number' : 'text'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 pink:border-pink-400 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500"
              placeholder={placeholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') handleCancelEdit()
              }}
            />
          )}
          <button
            onClick={handleSaveEdit}
            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
            title="Guardar"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      )
    }

    return (
      <div
        onClick={() => handleStartEdit(comp.id, field, valueToEdit)}
        className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50 px-2 py-1 rounded min-h-[28px] whitespace-pre-wrap"
        title="Clic para editar"
      >
        {displayValue || <span className="text-slate-400 italic text-xs">{placeholder}</span>}
      </div>
    )
  }

  // Agrupar componentes por instalación de referencia para visualización
  const componentesAgrupados = React.useMemo(() => {
    if (componentes.length === 0) return []

    const normalizeText = (text) => {
      if (!text) return ''
      return text.trim().toLowerCase().replace(/\s+/g, ' ')
    }

    const capitalizeText = (text) => {
      if (!text) return ''
      return text.trim().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    }

    // Agrupar por instalación
    // IMPORTANTE: Si instalacion_referencia está vacío, usar "Otros" (NO el componente)
    const grupos = new Map()

    componentes.forEach((comp, index) => {
      const instalacionRaw = comp.instalacion_referencia?.trim() || 'Otros'
      const key = normalizeText(instalacionRaw)
      const displayName = instalacionRaw === 'Otros' ? 'Otros' : capitalizeText(instalacionRaw)

      if (!grupos.has(key)) {
        grupos.set(key, {
          instalacion_referencia: displayName,
          componentes: []
        })
      }

      grupos.get(key).componentes.push({ ...comp, originalIndex: index })
    })

    // Ordenar componentes dentro de cada grupo por tipo_componente
    return Array.from(grupos.values()).map(grupo => ({
      ...grupo,
      componentes: grupo.componentes.sort((a, b) => {
        const tipoCompare = (a.tipo_componente || '').localeCompare(b.tipo_componente || '')
        if (tipoCompare !== 0) return tipoCompare
        return (a.componente || '').localeCompare(b.componente || '')
      })
    }))
  }, [componentes])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 pink:text-pink-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
            Componentes Supervisados
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b] mt-1">
            Tabla de componentes de la Unidad Fiscalizable verificados durante la supervisión
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón refrescar - sincroniza desde fotos seleccionadas en hechos */}
          <button
            onClick={() => {
              lastLoadedBorradorId.current = null
              loadComponentes()
            }}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-pink-700 bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-200 rounded-lg transition-colors disabled:opacity-50"
            title="Sincronizar componentes desde fotos seleccionadas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Tabla de componentes */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 pink:bg-pink-50 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-16">
                  N.°
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[200px]">
                  Componentes de la Unidad Fiscalizable
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-28">
                  Este
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-28">
                  Norte
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-24">
                  Altitud
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[250px]">
                  Descripción del componente
                </th>
                <th className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-20" title="Marcar como instalación marina">
                  <div className="flex items-center justify-center gap-1">
                    <Anchor className="w-4 h-4" />
                    <span className="text-xs">Marino</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-16">

                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
              {componentes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 pink:text-slate-400">
                      <MapPin className="w-12 h-12 mb-3 opacity-50" />
                      <p className="text-lg font-medium">No hay componentes</p>
                      <p className="text-sm mt-1">
                        Haz clic en "Sincronizar" para cargar desde hechos o agrega uno manualmente
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                componentesAgrupados.map((grupo, grupoIndex) => (
                  <React.Fragment key={`grupo-${grupoIndex}`}>
                    {/* Fila de cabecera de instalación */}
                    <tr className="bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-100/70">
                      <td
                        colSpan={8}
                        className="px-3 py-2 text-sm font-semibold text-primary-800 dark:text-primary-200 pink:text-pink-800"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>Instalación de Referencia: {grupo.instalacion_referencia}</span>
                          <span className="text-xs font-normal text-primary-600 dark:text-primary-400 pink:text-pink-600">
                            ({grupo.componentes.length} componente{grupo.componentes.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de componentes de esta instalación */}
                    {grupo.componentes.map((comp) => (
                      <tr
                        key={comp.id}
                        className={`
                          hover:bg-slate-50 dark:hover:bg-slate-900/30 pink:hover:bg-pink-50/50 transition-colors
                          ${comp.isNew ? 'bg-green-50/50 dark:bg-green-900/10 pink:bg-green-50/30' : ''}
                        `}
                      >
                        {/* N.° */}
                        <td className="px-3 py-2 text-slate-900 dark:text-white pink:text-slate-900 font-medium pl-6">
                          {comp.numero}
                        </td>

                        {/* Componente */}
                        <td className="px-3 py-2 text-slate-900 dark:text-white pink:text-slate-900">
                          {renderEditableCell(comp, 'componente', formatComponenteName(comp), 'Nombre del componente', comp.componente)}
                        </td>

                        {/* Este */}
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                          {renderEditableCell(comp, 'este', comp.este, 'Este')}
                        </td>

                        {/* Norte */}
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                          {renderEditableCell(comp, 'norte', comp.norte, 'Norte')}
                        </td>

                        {/* Altitud */}
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                          {renderEditableCell(
                            comp,
                            'altitud',
                            formatAltitud(comp.altitud),
                            'Altitud',
                            comp.altitud
                          )}
                        </td>

                        {/* Descripción */}
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 text-xs">
                          {renderEditableCell(comp, 'descripcion', comp.descripcion, 'Descripción del componente')}
                        </td>

                        {/* Marino (toggle) */}
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleToggleMarino(comp.id)}
                            className={`p-1.5 rounded transition-colors ${comp.es_marino
                                ? 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40 dark:text-cyan-400 pink:bg-cyan-100 pink:text-cyan-600'
                                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50'
                              }`}
                            title={comp.es_marino ? 'Componente marino (clic para desmarcar)' : 'Marcar como marino'}
                          >
                            <Anchor className="w-4 h-4" />
                          </button>
                        </td>

                        {/* Acciones */}
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleDeleteRow(comp.originalIndex)}
                            className="p-1.5 text-red-600 dark:text-red-400 pink:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 rounded transition-colors"
                            title="Eliminar componente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con botón agregar */}
        <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200 bg-slate-50 dark:bg-slate-900/30 pink:bg-pink-50/50">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 pink:text-pink-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 pink:hover:bg-pink-100 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar componente
          </button>
        </div>
      </div>
    </div>
  )
}
