import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Paperclip, Check, Loader2, AlertCircle, RefreshCw, Plus, Pencil, Trash2, X, Save } from 'lucide-react'

/**
 * Componente AnexosSection
 * 
 * Muestra una TABLA de anexos definidos por el superadmin (templates)
 * con columnas: Nro, Descripción, Tipo, Folios (*)
 * 
 * El usuario puede:
 * - Marcar/desmarcar anexos (checkbox en cada fila)
 * - Modificar el TIPO localmente (override del valor de Supabase)
 * - Añadir FOLIOS localmente (campo libre, puede estar vacío)
 * - Agregar anexos personalizados específicos para este borrador
 * 
 * TODO se guarda en localStorage por borrador:
 * - Selecciones: selectedAnexos[templateId] = boolean
 * - Overrides locales: anexosOverrides[templateId] = {tipo?, folios?}
 * - Custom: customAnexos[] (array de {id, texto, tipo, folios})
 * - Selecciones custom: selectedAnexos[`custom_${id}`] = boolean
 * 
 * IMPORTANTE: Los overrides de tipo/folios son LOCALES al borrador,
 * no modifican los datos en Supabase.
 */
// Anexo global fijo que siempre aparece al final
const ANEXO_GLOBAL_ADMINISTRADO = {
  id: '__global_administrado__',
  texto: 'Información entregada por el administrado:',
  tipo: 'virtual',
  isGlobal: true
}

export const AnexosSection = ({ 
  borrador,
  onStatusChange 
}) => {
  const { anexosTemplates, refreshAnexos } = useAuth()
  
  // Estado local de selecciones: Map de anexoId -> boolean
  const [selectedAnexos, setSelectedAnexos] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  // Estado para overrides locales (tipo y folios) de templates
  const [anexosOverrides, setAnexosOverrides] = useState({})
  
  // Estado para el anexo global "Información entregada por el administrado"
  const [globalAdministradoText, setGlobalAdministradoText] = useState('')
  const [globalAdministradoTipo, setGlobalAdministradoTipo] = useState('físico')
  const [globalAdministradoFolios, setGlobalAdministradoFolios] = useState('')
  
  // Estado para anexos personalizados (locales al borrador)
  const [customAnexos, setCustomAnexos] = useState([])
  const [newAnexoText, setNewAnexoText] = useState('')
  const [newAnexoTipo, setNewAnexoTipo] = useState('físico')
  const [newAnexoFolios, setNewAnexoFolios] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  
  const hasLoadedRef = useRef(false)
  const borradorIdRef = useRef(null)

  // Clave única para localStorage basada en el borrador
  const getStorageKey = useCallback(() => {
    if (!borrador?.id) return null
    return `acta_anexos_${borrador.id}`
  }, [borrador?.id])

  // Clave para anexos personalizados
  const getCustomStorageKey = useCallback(() => {
    if (!borrador?.id) return null
    return `acta_anexos_custom_${borrador.id}`
  }, [borrador?.id])

  // Clave para overrides locales (tipo y folios)
  const getOverridesStorageKey = useCallback(() => {
    if (!borrador?.id) return null
    return `acta_anexos_overrides_${borrador.id}`
  }, [borrador?.id])

  // Clave para el texto del anexo global "Información entregada por el administrado"
  const getGlobalAdministradoKey = useCallback(() => {
    if (!borrador?.id) return null
    return `acta_anexos_global_administrado_${borrador.id}`
  }, [borrador?.id])

  // Cargar selecciones, overrides y anexos personalizados desde localStorage
  useEffect(() => {
    const storageKey = getStorageKey()
    const customKey = getCustomStorageKey()
    const overridesKey = getOverridesStorageKey()
    const globalAdminKey = getGlobalAdministradoKey()
    if (!storageKey) {
      setLoading(false)
      return
    }

    // Evitar recargas innecesarias si ya cargamos para este borrador
    if (hasLoadedRef.current && borradorIdRef.current === borrador?.id) {
      return
    }

    try {
      // Cargar selecciones
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
          setSelectedAnexos(parsed)
        }
      } else {
        setSelectedAnexos({})
      }

      // Cargar overrides (tipo y folios locales)
      if (overridesKey) {
        const savedOverrides = localStorage.getItem(overridesKey)
        if (savedOverrides) {
          const parsedOverrides = JSON.parse(savedOverrides)
          if (parsedOverrides && typeof parsedOverrides === 'object') {
            setAnexosOverrides(parsedOverrides)
          }
        } else {
          setAnexosOverrides({})
        }
      }

      // Cargar anexos personalizados
      if (customKey) {
        const savedCustom = localStorage.getItem(customKey)
        if (savedCustom) {
          const parsedCustom = JSON.parse(savedCustom)
          if (Array.isArray(parsedCustom)) {
            setCustomAnexos(parsedCustom)
          }
        } else {
          setCustomAnexos([])
        }
      }

      // Cargar datos del anexo global "Información entregada por el administrado"
      if (globalAdminKey) {
        const savedGlobalData = localStorage.getItem(globalAdminKey)
        if (savedGlobalData) {
          try {
            const parsed = JSON.parse(savedGlobalData)
            setGlobalAdministradoText(parsed.text || '')
            setGlobalAdministradoTipo(parsed.tipo || 'físico')
            setGlobalAdministradoFolios(parsed.folios || '')
          } catch {
            // Compatibilidad con formato anterior (solo texto)
            setGlobalAdministradoText(savedGlobalData)
            setGlobalAdministradoTipo('físico')
            setGlobalAdministradoFolios('')
          }
        } else {
          setGlobalAdministradoText('')
          setGlobalAdministradoTipo('físico')
          setGlobalAdministradoFolios('')
        }
      }
    } catch (error) {
      console.error('[AnexosSection] Error loading saved data:', error)
      setSelectedAnexos({})
      setAnexosOverrides({})
      setCustomAnexos([])
      setGlobalAdministradoText('')
      setGlobalAdministradoTipo('físico')
      setGlobalAdministradoFolios('')
    }

    hasLoadedRef.current = true
    borradorIdRef.current = borrador?.id
    setLoading(false)
  }, [borrador?.id, getStorageKey, getCustomStorageKey, getOverridesStorageKey, getGlobalAdministradoKey])

  // Guardar selecciones en localStorage cuando cambian
  useEffect(() => {
    const storageKey = getStorageKey()
    if (!storageKey || loading) return

    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedAnexos))
    } catch (error) {
      console.error('[AnexosSection] Error saving selections:', error)
    }
  }, [selectedAnexos, getStorageKey, loading])

  // Guardar overrides en localStorage cuando cambian
  useEffect(() => {
    const overridesKey = getOverridesStorageKey()
    if (!overridesKey || loading) return

    try {
      localStorage.setItem(overridesKey, JSON.stringify(anexosOverrides))
    } catch (error) {
      console.error('[AnexosSection] Error saving overrides:', error)
    }
  }, [anexosOverrides, getOverridesStorageKey, loading])

  // Guardar anexos personalizados en localStorage cuando cambian
  useEffect(() => {
    const customKey = getCustomStorageKey()
    if (!customKey || loading) return

    try {
      localStorage.setItem(customKey, JSON.stringify(customAnexos))
    } catch (error) {
      console.error('[AnexosSection] Error saving custom anexos:', error)
    }
  }, [customAnexos, getCustomStorageKey, loading])

  // Guardar datos del anexo global en localStorage cuando cambian
  useEffect(() => {
    const globalAdminKey = getGlobalAdministradoKey()
    if (!globalAdminKey || loading) return

    try {
      const dataToSave = {
        text: globalAdministradoText,
        tipo: globalAdministradoTipo,
        folios: globalAdministradoFolios
      }
      localStorage.setItem(globalAdminKey, JSON.stringify(dataToSave))
    } catch (error) {
      console.error('[AnexosSection] Error saving global administrado data:', error)
    }
  }, [globalAdministradoText, globalAdministradoTipo, globalAdministradoFolios, getGlobalAdministradoKey, loading])

  // Actualizar estado de la sección basado en selecciones (templates + custom)
  useEffect(() => {
    if (!onStatusChange || loading) return

    const templates = anexosTemplates || []
    const totalAnexos = templates.length + customAnexos.length
    
    if (totalAnexos === 0) {
      onStatusChange('anexos', 'pending')
      return
    }

    // Contar selecciones de templates y custom
    const templateSelectedCount = templates.filter(a => selectedAnexos[a.id]).length
    const customSelectedCount = customAnexos.filter(a => selectedAnexos[`custom_${a.id}`]).length
    const totalSelectedCount = templateSelectedCount + customSelectedCount
    
    if (totalSelectedCount === 0) {
      onStatusChange('anexos', 'pending')
    } else if (totalSelectedCount === totalAnexos) {
      onStatusChange('anexos', 'completed')
    } else {
      onStatusChange('anexos', 'in_progress')
    }
  }, [selectedAnexos, anexosTemplates, customAnexos, onStatusChange, loading])

  // Toggle selección de un anexo
  const handleToggleAnexo = (anexoId) => {
    setSelectedAnexos(prev => ({
      ...prev,
      [anexoId]: !prev[anexoId]
    }))
  }

  // Seleccionar/deseleccionar todos
  const handleSelectAll = () => {
    const templates = anexosTemplates || []
    const allSelected = templates.every(a => selectedAnexos[a.id])
    
    if (allSelected) {
      // Deseleccionar todos
      setSelectedAnexos({})
    } else {
      // Seleccionar todos
      const newSelection = {}
      templates.forEach(a => {
        newSelection[a.id] = true
      })
      setSelectedAnexos(newSelection)
    }
  }

  // Refrescar anexos templates desde el servidor
  const handleRefresh = async () => {
    if (refreshing || !refreshAnexos) return
    
    try {
      setRefreshing(true)
      await refreshAnexos()
    } catch (error) {
      console.error('[AnexosSection] Error refreshing anexos:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const formatVirtualFolios = (value) => (value || '').toString().slice(0, 500)

  const parsePhysicalFolios = (value) => {
    if (value === null || value === undefined || value === '') return ''
    const parsed = parseInt(value, 10)
    if (Number.isNaN(parsed) || parsed < 0) return ''
    return parsed
  }

  const normalizeFoliosForTipo = (value, tipo) =>
    tipo === 'virtual' ? formatVirtualFolios(value) : parsePhysicalFolios(value)

  // Actualizar tipo local de un anexo template
  const handleUpdateTipo = (anexoId, nuevoTipo) => {
    setAnexosOverrides(prev => {
      const current = prev[anexoId] || {}
      return {
        ...prev,
        [anexoId]: {
          ...current,
          tipo: nuevoTipo,
          folios: normalizeFoliosForTipo(current.folios ?? '', nuevoTipo)
        }
      }
    })
  }

  const handleUpdateFolios = (anexoId, nuevosFolios, tipoActual) => {
    const processedValue = normalizeFoliosForTipo(nuevosFolios, tipoActual)

    setAnexosOverrides(prev => ({
      ...prev,
      [anexoId]: {
        ...prev[anexoId],
        folios: processedValue
      }
    }))
  }

  // Agregar nuevo anexo personalizado (local)
  const handleAddCustomAnexo = () => {
    if (!newAnexoText.trim()) return

    const newAnexo = {
      id: `local_${Date.now()}`,
      texto: newAnexoText.trim(),
      tipo: newAnexoTipo,
      folios: newAnexoTipo === 'virtual'
        ? formatVirtualFolios(newAnexoFolios)
        : (newAnexoFolios ? parsePhysicalFolios(newAnexoFolios) : null)
    }
    
    setCustomAnexos(prev => [...prev, newAnexo])
    // Auto-seleccionar el nuevo anexo
    setSelectedAnexos(prev => ({
      ...prev,
      [`custom_${newAnexo.id}`]: true
    }))
    setNewAnexoText('')
    setNewAnexoTipo('físico')
    setNewAnexoFolios('')
  }

  // Actualizar tipo de un anexo personalizado
  const handleUpdateCustomTipo = (anexoId, nuevoTipo) => {
    setCustomAnexos(prev => prev.map(a => 
      a.id === anexoId
        ? { ...a, tipo: nuevoTipo, folios: normalizeFoliosForTipo(a.folios ?? '', nuevoTipo) }
        : a
    ))
  }

  // Actualizar folios de un anexo personalizado
  const handleUpdateCustomFolios = (anexoId, nuevosFolios, tipoActual) => {
    const processedValue = normalizeFoliosForTipo(nuevosFolios, tipoActual)

    setCustomAnexos(prev => prev.map(a => 
      a.id === anexoId ? { ...a, folios: processedValue } : a
    ))
  }

  // Iniciar edición
  const handleStartEdit = (anexo) => {
    setEditingId(anexo.id)
    setEditText(anexo.texto)
  }

  // Cancelar edición
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  // Guardar edición (local)
  const handleSaveEdit = () => {
    if (!editText.trim() || !editingId) return

    setCustomAnexos(prev => prev.map(a => 
      a.id === editingId ? { ...a, texto: editText.trim() } : a
    ))
    handleCancelEdit()
  }

  // Eliminar anexo personalizado (local)
  const handleDeleteCustomAnexo = (id) => {
    if (!confirm('¿Estás seguro de eliminar este anexo personalizado?')) return

    setCustomAnexos(prev => prev.filter(a => a.id !== id))
    // Remover de selección
    setSelectedAnexos(prev => {
      const { [`custom_${id}`]: _, ...rest } = prev
      return rest
    })
  }

  // Calcular estadísticas
  const templates = anexosTemplates || []
  const selectedCount = Object.values(selectedAnexos).filter(Boolean).length
  const allSelected = templates.length > 0 && templates.every(a => selectedAnexos[a.id])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500 pink:text-pink-500" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Paperclip className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Anexos
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
              Marca los anexos que aplican a esta acta
            </p>
          </div>
        </div>

        {/* Botón refrescar */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 rounded-lg transition-colors disabled:opacity-50"
          title="Actualizar lista de anexos"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {templates.length === 0 ? (
        // Sin anexos definidos
        <div className="bg-amber-50 dark:bg-amber-900/20 pink:bg-amber-50 border border-amber-200 dark:border-amber-800 pink:border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-amber-700 dark:text-amber-300 pink:text-amber-700 font-medium">
            No hay anexos definidos
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400 pink:text-amber-600 mt-1">
            El superadministrador debe definir los anexos disponibles desde el panel de administración.
          </p>
        </div>
      ) : (
        <>
          {/* Barra de progreso y seleccionar todos */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">
                {selectedCount} de {templates.length + customAnexos.length} seleccionados
              </span>
              <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 pink:bg-pink-500 transition-all duration-300"
                  style={{ width: `${(templates.length + customAnexos.length) > 0 ? (selectedCount / (templates.length + customAnexos.length)) * 100 : 0}%` }}
                />
              </div>
            </div>

            <button
              onClick={handleSelectAll}
              className="text-sm text-primary-600 dark:text-primary-400 pink:text-pink-600 hover:underline"
            >
              {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>

          {/* TABLA de anexos */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 pink:bg-pink-100">
                  <th className="w-10 px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700">
                    <input
                      type="checkbox"
                      checked={allSelected && templates.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="w-12 px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700">Nro.</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[200px]">Descripción</th>
                  <th className="w-28 px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700">Tipo</th>
                  <th className="w-80 px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700">Folios (*)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
                {templates.map((anexo, index) => {
                  const isSelected = !!selectedAnexos[anexo.id]
                  const override = anexosOverrides[anexo.id] || {}
                  const tipoActual = override.tipo !== undefined ? override.tipo : (anexo.tipo || 'físico')
                  const foliosActual = override.folios !== undefined ? override.folios : ''
                  const isVirtual = tipoActual === 'virtual'
                  const foliosDisplayValue = foliosActual === '' || foliosActual === null || foliosActual === undefined
                    ? ''
                    : String(foliosActual)
                  
                  return (
                    <tr
                      key={anexo.id}
                      className={`
                        transition-colors
                        ${isSelected 
                          ? 'bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-50' 
                          : 'bg-white dark:bg-slate-900 pink:bg-white hover:bg-slate-50 dark:hover:bg-slate-800 pink:hover:bg-pink-50/50'
                        }
                      `}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleAnexo(anexo.id)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      
                      {/* Nro */}
                      <td className="px-3 py-3 text-center font-medium text-slate-900 dark:text-white pink:text-slate-900">
                        {index + 1}
                      </td>
                      
                      {/* Descripción */}
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-pre-wrap break-words max-w-md">
                        {anexo.texto}
                      </td>
                      
                      {/* Tipo (editable localmente) */}
                      <td className="px-3 py-3">
                        <select
                          value={tipoActual}
                          onChange={(e) => handleUpdateTipo(anexo.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:ring-1 focus:ring-primary-500 pink:focus:ring-pink-500"
                        >
                          <option value="físico">físico</option>
                          <option value="virtual">virtual</option>
                        </select>
                      </td>
                      
                      {/* Folios (editable localmente) */}
                      <td className="px-3 py-3 align-top">
                        {isVirtual ? (
                          <textarea
                            value={foliosDisplayValue}
                            onChange={(e) => handleUpdateFolios(anexo.id, e.target.value, tipoActual)}
                            placeholder="Describe carpetas/archivos digitales..."
                            rows={3}
                            maxLength={500}
                            className="w-full min-w-[180px] px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-primary-500 pink:focus:ring-pink-500 resize-y"
                          />
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={foliosDisplayValue}
                            onChange={(e) => handleUpdateFolios(anexo.id, e.target.value, tipoActual)}
                            placeholder="—"
                            className="w-full px-2 py-1.5 text-sm text-center rounded border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-primary-500 pink:focus:ring-pink-500"
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {/* Anexo global fijo: Información entregada por el administrado */}
            <div className="border-t-2 border-amber-300 dark:border-amber-600 pink:border-amber-300">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-amber-50 dark:bg-amber-900/20 pink:bg-amber-50">
                    {/* Checkbox */}
                    <td className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={!!selectedAnexos[ANEXO_GLOBAL_ADMINISTRADO.id]}
                        onChange={() => handleToggleAnexo(ANEXO_GLOBAL_ADMINISTRADO.id)}
                        className="w-4 h-4 rounded border-amber-400 dark:border-amber-600 text-amber-600 focus:ring-amber-500"
                      />
                    </td>
                    
                    {/* Nro */}
                    <td className="w-12 px-3 py-3 text-center font-medium text-amber-700 dark:text-amber-300">
                      {templates.length + 1}
                    </td>
                    
                    {/* Descripción */}
                    <td className="px-3 py-3 min-w-[200px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-amber-800 dark:text-amber-200">
                            {ANEXO_GLOBAL_ADMINISTRADO.texto}
                          </span>
                          {globalAdministradoText && (
                            <span className="text-slate-700 dark:text-slate-300">
                              {globalAdministradoText}
                            </span>
                          )}
                        </div>
                        <span className="px-2 py-0.5 text-xs rounded bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 font-medium w-fit">
                          siempre disponible
                        </span>
                        
                        {/* Campo de texto que aparece cuando está seleccionado */}
                        {selectedAnexos[ANEXO_GLOBAL_ADMINISTRADO.id] && (
                          <div className="mt-1">
                            <textarea
                              value={globalAdministradoText}
                              onChange={(e) => setGlobalAdministradoText(e.target.value.slice(0, 500))}
                              placeholder="Escribe aquí lo que va después de los dos puntos..."
                              rows={2}
                              maxLength={500}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
                            />
                            <div className="flex justify-end mt-1">
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                {globalAdministradoText.length}/500
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    {/* Tipo (editable) */}
                    <td className="w-28 px-3 py-3">
                      <select
                        value={globalAdministradoTipo}
                        onChange={(e) => setGlobalAdministradoTipo(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="físico">físico</option>
                        <option value="virtual">virtual</option>
                      </select>
                    </td>
                    
                    {/* Folios (editable) */}
                    <td className="w-80 px-3 py-3 align-top">
                      {globalAdministradoTipo === 'virtual' ? (
                        <textarea
                          value={globalAdministradoFolios}
                          onChange={(e) => setGlobalAdministradoFolios(e.target.value.slice(0, 500))}
                          placeholder="Describe carpetas/archivos digitales..."
                          rows={3}
                          maxLength={500}
                          className="w-full min-w-[180px] px-2 py-1.5 text-sm rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-amber-500 resize-y"
                        />
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={globalAdministradoFolios}
                          onChange={(e) => setGlobalAdministradoFolios(e.target.value)}
                          placeholder="—"
                          className="w-full px-2 py-1.5 text-sm text-center rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-amber-500"
                        />
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Pie de tabla con nota */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 pink:bg-pink-50/50 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200">
              <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500 italic">
                (*) En el caso de información digitalizada, indicar el número de carpetas y/o archivos adjuntos
              </p>
            </div>
          </div>
        </>
      )}

      {/* Sección de anexos personalizados */}
      {borrador?.codigo_accion && (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400 pink:text-emerald-600" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
              Anexos Personalizados
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 pink:bg-emerald-100 text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">
              Solo para este CA
            </span>
          </div>
          
          <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mb-4">
            Agrega anexos adicionales específicos para esta acta.
          </p>

          {/* Formulario para agregar nuevo anexo personalizado */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/10 pink:bg-emerald-50/50 rounded-xl border border-emerald-200 dark:border-emerald-800 pink:border-emerald-200">
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Descripción</label>
              <textarea
                value={newAnexoText}
                onChange={(e) => setNewAnexoText(e.target.value)}
                placeholder="Escribe la descripción del anexo..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAddCustomAnexo()
                  }
                }}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Tipo</label>
              <select
                value={newAnexoTipo}
                onChange={(e) => setNewAnexoTipo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              >
                <option value="físico">físico</option>
                <option value="virtual">virtual</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Folios</label>
              {newAnexoTipo === 'virtual' ? (
                <textarea
                  value={newAnexoFolios}
                  onChange={(e) => setNewAnexoFolios(e.target.value.slice(0, 500))}
                  placeholder="Describe carpetas/archivos digitales..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-y"
                />
              ) : (
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newAnexoFolios}
                  onChange={(e) => setNewAnexoFolios(e.target.value)}
                  placeholder="—"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm text-center"
                />
              )}
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                onClick={handleAddCustomAnexo}
                disabled={!newAnexoText.trim()}
                className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>
          </div>

          {/* Tabla de anexos personalizados */}
          {customAnexos.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 pink:text-slate-400 italic text-center py-4">
              No hay anexos personalizados para este CA
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-emerald-200 dark:border-emerald-800 pink:border-emerald-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-100 dark:bg-emerald-900/30 pink:bg-emerald-100">
                    <th className="w-10 px-3 py-3 text-left font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">
                      ✓
                    </th>
                    <th className="w-12 px-3 py-3 text-center font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">Nro.</th>
                    <th className="px-3 py-3 text-left font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700 min-w-[200px]">Descripción</th>
                    <th className="w-28 px-3 py-3 text-center font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">Tipo</th>
                    <th className="w-80 px-3 py-3 text-center font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">Folios (*)</th>
                    <th className="w-20 px-3 py-3 text-center font-semibold text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-200 dark:divide-emerald-800 pink:divide-emerald-200">
                  {customAnexos.map((anexo, index) => {
                    const isSelected = !!selectedAnexos[`custom_${anexo.id}`]
                    const isEditing = editingId === anexo.id
                    
                    return (
                      <tr
                        key={anexo.id}
                        className={`
                          transition-colors
                          ${isSelected 
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 pink:bg-emerald-50' 
                            : 'bg-white dark:bg-slate-900 pink:bg-white hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
                          }
                        `}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleAnexo(`custom_${anexo.id}`)}
                            className="w-4 h-4 rounded border-emerald-300 dark:border-emerald-600 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        
                        {/* Nro */}
                        <td className="px-3 py-3 text-center font-medium text-emerald-700 dark:text-emerald-300 pink:text-emerald-700">
                          +{index + 1}
                        </td>
                        
                        {/* Descripción */}
                        <td className="px-3 py-3 whitespace-pre-wrap break-words max-w-md">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={2}
                                className="flex-1 px-2 py-1.5 rounded border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 resize-none text-sm"
                                autoFocus
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={!editText.trim()}
                                  className="p-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-400 text-white rounded transition-colors"
                                  title="Guardar"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 text-slate-600 dark:text-slate-300 rounded transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-700 dark:text-slate-300 pink:text-slate-700">
                              {anexo.texto}
                            </span>
                          )}
                        </td>
                        
                        {/* Tipo */}
                        <td className="px-3 py-3">
                          <select
                            value={anexo.tipo || 'físico'}
                            onChange={(e) => handleUpdateCustomTipo(anexo.id, e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="físico">físico</option>
                            <option value="virtual">virtual</option>
                          </select>
                        </td>
                        
                        {/* Folios */}
                        <td className="px-3 py-3 align-top">
                          {(anexo.tipo || 'físico') === 'virtual' ? (
                            <textarea
                              value={anexo.folios ? String(anexo.folios) : ''}
                              onChange={(e) => handleUpdateCustomFolios(anexo.id, e.target.value, anexo.tipo || 'físico')}
                              placeholder="Describe carpetas/archivos digitales..."
                              rows={3}
                              maxLength={500}
                              className="w-full min-w-[180px] px-2 py-1.5 text-sm rounded border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-emerald-500 resize-y"
                            />
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={anexo.folios ?? ''}
                              onChange={(e) => handleUpdateCustomFolios(anexo.id, e.target.value, anexo.tipo || 'físico')}
                              placeholder="—"
                              className="w-full px-2 py-1.5 text-sm text-center rounded border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-1 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        
                        {/* Acciones */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {!isEditing && (
                              <>
                                <button
                                  onClick={() => handleStartEdit(anexo)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                  title="Editar descripción"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCustomAnexo(anexo.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resumen al final */}
      {(selectedCount > 0 || customAnexos.some(a => selectedAnexos[`custom_${a.id}`])) && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 pink:bg-green-50 border border-green-200 dark:border-green-800 pink:border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 pink:text-green-700">
            <Check className="w-5 h-5" />
            <span className="font-medium">
              {(() => {
                const templateSelected = templates.filter(a => selectedAnexos[a.id]).length
                const customSelected = customAnexos.filter(a => selectedAnexos[`custom_${a.id}`]).length
                const total = templateSelected + customSelected
                
                if (templateSelected === templates.length && customSelected === customAnexos.length && total > 0) {
                  return 'Todos los anexos están marcados'
                }
                
                const parts = []
                if (templateSelected > 0) {
                  parts.push(`${templateSelected} predefinido${templateSelected > 1 ? 's' : ''}`)
                }
                if (customSelected > 0) {
                  parts.push(`${customSelected} personalizado${customSelected > 1 ? 's' : ''}`)
                }
                return parts.length > 0 ? parts.join(' + ') + ' marcado' + (total > 1 ? 's' : '') : ''
              })()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnexosSection
