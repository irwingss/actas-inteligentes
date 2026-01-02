import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Loader2,
  Check,
  FlaskConical,
  ChevronDown
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

const API_BASE = 'http://localhost:3000'

// Matrices por defecto (se sobrescribirán con las de Supabase si existen)
const DEFAULT_MATRICES = [
  { id: 'aire', nombre: 'Aire', orden: 1 },
  { id: 'emisiones_gaseosas', nombre: 'Emisiones gaseosas', orden: 2 },
  { id: 'emisiones_fugitivas', nombre: 'Emisiones fugitivas*', orden: 3 },
  { id: 'ruido_ambiental', nombre: 'Ruido ambiental', orden: 4 },
  { id: 'vibracion', nombre: 'Vibración', orden: 5 },
  { id: 'suelo', nombre: 'Suelo', orden: 6 },
  { id: 'sedimento', nombre: 'Sedimento', orden: 7 },
  { id: 'agua_superficial_rio', nombre: 'Agua Superficial de río', orden: 8 },
  { id: 'agua_superficial_lago', nombre: 'Agua Superficial de lago', orden: 9 },
  { id: 'agua_superficial_laguna', nombre: 'Agua Superficial de laguna', orden: 10 },
  { id: 'agua_residual_industrial', nombre: 'Agua Residual Industrial', orden: 11 },
  { id: 'agua_residual_domestica', nombre: 'Agua Residual Doméstica', orden: 12 },
  { id: 'agua_subterranea', nombre: 'Agua subterránea', orden: 13 },
  { id: 'agua_de_mar', nombre: 'Agua de mar', orden: 14 },
  { id: 'agua_de_reinyeccion', nombre: 'Agua de reinyección', orden: 15 },
  { id: 'agua_de_procesos', nombre: 'Agua de procesos', orden: 16 },
  { id: 'sustancia_desconocida', nombre: 'Sustancia desconocida', orden: 17 },
]

// Opciones para Muestra Dirimente
const DIRIMENTE_OPTIONS = ['No', 'Sí']

export const MuestreoSection = ({ borrador, codigoAccion, onStatusChange }) => {
  const { session } = useAuth()
  
  // Estado principal
  const [muestreos, setMuestreos] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Estado para matrices (opciones de agrupación)
  const [matrices, setMatrices] = useState(DEFAULT_MATRICES)
  
  // Estado para edición inline
  const [editingCell, setEditingCell] = useState(null) // { rowId, field }
  const [editValue, setEditValue] = useState('')
  
  // Estado para dropdown de matriz
  const [matrizDropdownOpen, setMatrizDropdownOpen] = useState(null) // id del muestreo con dropdown abierto
  
  // Ref para evitar recargas innecesarias
  const lastLoadedBorradorId = useRef(null)
  
  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (matrizDropdownOpen && !e.target.closest('.matriz-dropdown')) {
        setMatrizDropdownOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [matrizDropdownOpen])
  
  // Auth headers helper
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])
  
  // Cargar muestreos - sincroniza automáticamente desde arcgis_records
  const loadMuestreos = useCallback(async () => {
    if (!borrador?.id || !session?.access_token) return
    
    // Evitar recargas innecesarias
    if (lastLoadedBorradorId.current === borrador.id && muestreos.length > 0) {
      return
    }
    
    setLoading(true)
    try {
      // 1. Primero sincronizar automáticamente desde datos (actividad G._Muestreo)
      console.log('[MuestreoSection] 🔄 Sincronizando muestreos desde datos...')
      try {
        await axios.post(
          `${API_BASE}/api/actas/${borrador.id}/muestreos/sync-from-datos`,
          {},
          getAuthHeaders()
        )
        console.log('[MuestreoSection] ✅ Sincronización automática completada')
      } catch (syncError) {
        console.warn('[MuestreoSection] Sincronización automática falló:', syncError.message)
      }
      
      // 2. Luego cargar los muestreos actualizados
      const response = await axios.get(
        `${API_BASE}/api/actas/${borrador.id}/muestreos`,
        getAuthHeaders()
      )
      
      if (response.data.success) {
        setMuestreos(response.data.muestreos || [])
        lastLoadedBorradorId.current = borrador.id
        
        // Actualizar estado de la sección
        if (response.data.muestreos?.length > 0) {
          onStatusChange?.('muestreo', 'completed')
        }
      }
    } catch (error) {
      console.error('[MuestreoSection] Error cargando muestreos:', error)
      toast.error('Error al cargar muestreos')
    } finally {
      setLoading(false)
    }
  }, [borrador?.id, session, getAuthHeaders, onStatusChange])
  
  // Cargar matrices desde Supabase (o usar por defecto)
  const loadMatrices = useCallback(async () => {
    if (!session?.access_token) return
    
    try {
      const response = await axios.get(
        `${API_BASE}/api/matrices-muestreo`,
        getAuthHeaders()
      )
      
      if (response.data.success && response.data.matrices?.length > 0) {
        setMatrices(response.data.matrices)
      }
    } catch (error) {
      // Si el endpoint no existe, usar matrices por defecto
      console.log('[MuestreoSection] Usando matrices por defecto')
    }
  }, [session, getAuthHeaders])
  
  // Cargar al montar
  useEffect(() => {
    loadMuestreos()
    loadMatrices()
  }, [loadMuestreos, loadMatrices])
  
  // Agrupar muestreos por matriz y ordenar
  const muestreosAgrupados = useMemo(() => {
    // Crear mapa de matrices ordenadas
    const matrizOrden = {}
    matrices.forEach((m, idx) => {
      matrizOrden[m.id] = idx
      matrizOrden[m.nombre] = idx
    })
    
    // Agrupar por matriz
    const grupos = {}
    const sinMatriz = []
    
    muestreos.forEach(m => {
      const matrizKey = m.matriz || 'sin_asignar'
      if (matrizKey === 'sin_asignar') {
        sinMatriz.push(m)
      } else {
        if (!grupos[matrizKey]) {
          grupos[matrizKey] = []
        }
        grupos[matrizKey].push(m)
      }
    })
    
    // Ordenar grupos según orden de matrices
    const gruposOrdenados = matrices
      .filter(m => grupos[m.id] || grupos[m.nombre])
      .map(m => ({
        matriz: m,
        muestreos: grupos[m.id] || grupos[m.nombre] || []
      }))
    
    // Agregar sin asignar al final si hay
    if (sinMatriz.length > 0) {
      gruposOrdenados.push({
        matriz: { id: 'sin_asignar', nombre: 'Sin asignar', orden: 999 },
        muestreos: sinMatriz
      })
    }
    
    return gruposOrdenados
  }, [muestreos, matrices])
  
  // Agregar nueva fila
  const handleAddRow = async () => {
    if (!borrador?.id) return
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/${borrador.id}/muestreos`,
        {
          codigo_punto: '',
          nro_muestras: '',
          matriz: '',
          descripcion: '',
          muestra_dirimente: 'No'
        },
        getAuthHeaders()
      )
      
      if (response.data.success) {
        setMuestreos([...muestreos, response.data.muestreo])
        onStatusChange?.('muestreo', 'in_progress')
      }
    } catch (error) {
      console.error('[MuestreoSection] Error creando muestreo:', error)
      toast.error('Error al agregar punto de muestreo')
    }
  }
  
  // Eliminar fila por ID
  const handleDeleteRow = async (muestreoId) => {
    if (!borrador?.id) return
    
    try {
      await axios.delete(
        `${API_BASE}/api/actas/${borrador.id}/muestreos/${muestreoId}`,
        getAuthHeaders()
      )
      
      setMuestreos(prev => prev.filter(m => m.id !== muestreoId))
      toast.success('Punto de muestreo eliminado')
    } catch (error) {
      console.error('[MuestreoSection] Error eliminando muestreo:', error)
      toast.error('Error al eliminar')
    }
  }
  
  // Cambiar matriz de un muestreo (esto reordena automáticamente)
  const handleMatrizChange = async (muestreoId, newMatriz) => {
    if (!borrador?.id) return
    
    // Actualizar localmente primero
    setMuestreos(prev => prev.map(m => 
      m.id === muestreoId ? { ...m, matriz: newMatriz } : m
    ))
    setMatrizDropdownOpen(null)
    
    // Persistir en backend
    try {
      await axios.put(
        `${API_BASE}/api/actas/${borrador.id}/muestreos/${muestreoId}`,
        { matriz: newMatriz },
        getAuthHeaders()
      )
      onStatusChange?.('muestreo', 'completed')
    } catch (error) {
      console.error('[MuestreoSection] Error actualizando matriz:', error)
      toast.error('Error al guardar matriz')
    }
  }
  
  // Cambiar muestra dirimente
  const handleDirimenteChange = async (muestreoId, newValue) => {
    if (!borrador?.id) return
    
    // Actualizar localmente primero
    setMuestreos(prev => prev.map(m => 
      m.id === muestreoId ? { ...m, muestra_dirimente: newValue } : m
    ))
    
    // Persistir en backend
    try {
      await axios.put(
        `${API_BASE}/api/actas/${borrador.id}/muestreos/${muestreoId}`,
        { muestra_dirimente: newValue },
        getAuthHeaders()
      )
    } catch (error) {
      console.error('[MuestreoSection] Error actualizando dirimente:', error)
      toast.error('Error al guardar')
    }
  }
  
  const formatAltitudeDisplay = (value) => {
    if (value === null || value === undefined || value === '') return ''
    const parsed = Number(value)
    return Number.isFinite(parsed) ? String(Math.round(parsed)) : value
  }

  // Iniciar edición de celda
  const handleStartEdit = (rowId, field, currentValue) => {
    const valueToUse = field === 'altitud' ? formatAltitudeDisplay(currentValue) : currentValue
    setEditingCell({ rowId, field })
    setEditValue(valueToUse || '')
  }
  
  // Guardar edición de celda
  const handleSaveEdit = async (rowId, field) => {
    if (!borrador?.id) return
    
    const newValue = field === 'altitud' ? formatAltitudeDisplay(editValue) : editValue
    
    // Actualizar localmente primero
    setMuestreos(prev => prev.map(m => 
      m.id === rowId ? { ...m, [field]: newValue } : m
    ))
    setEditingCell(null)
    setEditValue('')
    
    // Persistir en backend
    try {
      await axios.put(
        `${API_BASE}/api/actas/${borrador.id}/muestreos/${rowId}`,
        { [field]: newValue },
        getAuthHeaders()
      )
      onStatusChange?.('muestreo', 'completed')
    } catch (error) {
      console.error('[MuestreoSection] Error guardando edición:', error)
      toast.error('Error al guardar')
    }
  }
  
  // Cancelar edición
  const handleCancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }
  
  // Manejar teclas en edición
  const handleKeyDown = (e, rowId, field) => {
    if (e.key === 'Enter') {
      handleSaveEdit(rowId, field)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }
  
  // Renderizar celda editable
  const renderEditableCell = (muestreo, field, displayValue, placeholder, rawValue) => {
    const isEditing = editingCell?.rowId === muestreo.id && editingCell?.field === field
    
    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSaveEdit(muestreo.id, field)}
          onKeyDown={(e) => handleKeyDown(e, muestreo.id, field)}
          autoFocus
          className="w-full px-2 py-1 text-sm border border-primary-400 dark:border-primary-500 pink:border-pink-400 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 pink:focus:ring-pink-500 bg-white dark:bg-slate-700 pink:bg-white"
        />
      )
    }
    
    return (
      <div 
        onClick={() => handleStartEdit(muestreo.id, field, rawValue ?? displayValue)}
        className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50 px-2 py-1 rounded min-h-[28px] whitespace-pre-wrap"
        title="Clic para editar"
      >
        {displayValue || <span className="text-slate-400 italic text-xs">{placeholder}</span>}
      </div>
    )
  }
  
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
            Muestreo Ambiental
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b] mt-1">
            Tabla de puntos de muestreo ambiental verificados durante la supervisión
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Botón refrescar - sincroniza desde datos */}
          <button
            onClick={() => {
              lastLoadedBorradorId.current = null
              loadMuestreos()
            }}
            disabled={loading || saving}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-pink-700 bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-200 rounded-lg transition-colors disabled:opacity-50"
            title="Sincronizar puntos de muestreo desde datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>
      
      {/* Tabla de muestreos */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm overflow-visible">
        <div className="min-w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-50 dark:bg-emerald-900/20 pink:bg-emerald-50 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-12">
                  Nro.
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[120px]">
                  Código de punto
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-20">
                  Nro. de muestras
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[140px]">
                  Matriz
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 min-w-[200px]">
                  Descripción
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-24">
                  Norte
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-24">
                  Este
                </th>
                <th className="px-2 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-20">
                  Altitud
                </th>
                <th className="px-2 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-24">
                  Muestra Dirimente
                </th>
                <th className="px-2 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 pink:text-slate-700 w-12">
                  
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
              {muestreos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 pink:text-slate-400">
                      <FlaskConical className="w-12 h-12 mb-3 opacity-50" />
                      <p className="text-lg font-medium">No hay puntos de muestreo</p>
                      <p className="text-sm mt-1">
                        Los puntos de muestreo se sincronizarán automáticamente desde los datos del CA (actividad G)
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                // Renderizar agrupado por matriz
                muestreosAgrupados.map((grupo, grupoIdx) => (
                  <React.Fragment key={grupo.matriz.id}>
                    {/* Header de grupo (matriz) */}
                    <tr className="bg-slate-100 dark:bg-slate-700 pink:bg-slate-100">
                      <td colSpan={10} className="px-3 py-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 pink:text-slate-800">
                          {grupo.matriz.nombre}
                        </span>
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                          ({grupo.muestreos.length} punto{grupo.muestreos.length !== 1 ? 's' : ''})
                        </span>
                      </td>
                    </tr>
                    
                    {/* Filas de muestreos del grupo */}
                    {grupo.muestreos.map((muestreo, index) => {
                      // Calcular número global
                      let globalNum = 1
                      for (let i = 0; i < grupoIdx; i++) {
                        globalNum += muestreosAgrupados[i].muestreos.length
                      }
                      globalNum += index
                      
                      return (
                        <tr 
                          key={muestreo.id} 
                          className={`
                            hover:bg-slate-50 dark:hover:bg-slate-900/30 pink:hover:bg-pink-50/50 transition-colors
                            ${muestreo.isNew ? 'bg-emerald-50/50 dark:bg-emerald-900/10 pink:bg-emerald-50/30' : ''}
                          `}
                        >
                          {/* Nro. */}
                          <td className="px-2 py-2 text-slate-900 dark:text-white pink:text-slate-900 font-medium text-center">
                            {globalNum}
                          </td>
                          
                          {/* Código de punto */}
                          <td className="px-2 py-2 text-slate-900 dark:text-white pink:text-slate-900">
                            {renderEditableCell(muestreo, 'codigo_punto', muestreo.codigo_punto, 'Código')}
                          </td>
                          
                          {/* Nro. de muestras */}
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 text-center">
                            {renderEditableCell(muestreo, 'nro_muestras', muestreo.nro_muestras, '--')}
                          </td>
                          
                          {/* Matriz (dropdown) */}
                          <td className="px-2 py-2 relative">
                            <div className="relative matriz-dropdown">
                              <button
                                onClick={() => setMatrizDropdownOpen(matrizDropdownOpen === muestreo.id ? null : muestreo.id)}
                                className="w-full flex items-center justify-between gap-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white hover:border-emerald-400 transition-colors"
                              >
                                <span className={muestreo.matriz ? 'text-slate-900 dark:text-white pink:text-slate-900' : 'text-slate-400 italic'}>
                                  {muestreo.matriz ? matrices.find(m => m.id === muestreo.matriz || m.nombre === muestreo.matriz)?.nombre || muestreo.matriz : 'Seleccionar...'}
                                </span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              
                              {matrizDropdownOpen === muestreo.id && (
                                <div className="absolute z-[100] top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                                  {matrices.map(m => (
                                    <button
                                      key={m.id}
                                      onClick={() => handleMatrizChange(muestreo.id, m.id)}
                                      className={`w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/30 pink:hover:bg-emerald-50 transition-colors
                                        ${(muestreo.matriz === m.id || muestreo.matriz === m.nombre) ? 'bg-emerald-100 dark:bg-emerald-900/50 pink:bg-emerald-100 font-medium' : ''}
                                      `}
                                    >
                                      {m.nombre}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          
                          {/* Descripción */}
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 text-xs">
                            {renderEditableCell(muestreo, 'descripcion', muestreo.descripcion, 'Descripción')}
                          </td>
                          
                          {/* Norte */}
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                            {renderEditableCell(muestreo, 'norte', muestreo.norte, '--')}
                          </td>
                          
                          {/* Este */}
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                            {renderEditableCell(muestreo, 'este', muestreo.este, '--')}
                          </td>
                          
                          {/* Altitud */}
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 font-mono text-xs">
                            {renderEditableCell(
                              muestreo,
                              'altitud',
                              formatAltitudeDisplay(muestreo.altitud),
                              '--',
                              muestreo.altitud
                            )}
                          </td>
                          
                          {/* Muestra Dirimente (dropdown simple) */}
                          <td className="px-2 py-2 text-center">
                            <select
                              value={muestreo.muestra_dirimente || 'No'}
                              onChange={(e) => handleDirimenteChange(muestreo.id, e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              {DIRIMENTE_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          
                          {/* Acciones */}
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleDeleteRow(muestreo.id)}
                              className="p-1 text-red-600 dark:text-red-400 pink:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 rounded transition-colors"
                              title="Eliminar punto de muestreo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
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
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 pink:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 pink:hover:bg-emerald-100 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar punto de muestreo
          </button>
        </div>
      </div>
      
    </div>
  )
}
