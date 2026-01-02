import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, Save, Building2, MapPin, Calendar, Clock, Cpu, Search, Loader2, X } from 'lucide-react'
import api from '../../lib/axios'

export const InformacionGeneralSection = ({ borrador, onSave, saving, modalidad, onStatusChange }) => {
  // Estado del formulario
  const [formData, setFormData] = useState({
    expediente: '',
    nombre_administrado: '',
    ruc: '',
    unidad_fiscalizable: '',
    departamento: '',
    provincia: '',
    distrito: '',
    direccion_referencia: '',
    actividad_desarrollada: '',
    etapa: '',
    tipo_supervision: '',
    orientativa: 'No',
    estado: '',
    fecha_hora_inicio: '',
    fecha_hora_cierre: '',
  })
  
  // Equipos GPS (array de objetos)
  const [equiposGPS, setEquiposGPS] = useState([
    { id: 1, codigo: '', marca: '', sistema: 'WGS 84/UTM' }
  ])
  
  // Estados para búsqueda de Unidad Fiscalizable
  const [ufSearchQuery, setUfSearchQuery] = useState('')
  const [ufSearchResults, setUfSearchResults] = useState([])
  const [showUFDropdown, setShowUFDropdown] = useState(false)
  const [loadingUFs, setLoadingUFs] = useState(false)
  const ufInputRef = useRef(null)
  const ufDropdownRef = useRef(null)
  const ufSearchTimeoutRef = useRef(null)
  
  // Cargar datos del borrador cuando cambie
  useEffect(() => {
    if (borrador) {
      setFormData({
        expediente: borrador.expediente || '',
        nombre_administrado: borrador.nombre_administrado || '',
        ruc: borrador.ruc || '',
        unidad_fiscalizable: borrador.unidad_fiscalizable || '',
        departamento: borrador.departamento || '',
        provincia: borrador.provincia || '',
        distrito: borrador.distrito || '',
        direccion_referencia: borrador.direccion_referencia || '',
        actividad_desarrollada: borrador.actividad_desarrollada || '',
        etapa: borrador.etapa || '',
        tipo_supervision: borrador.tipo_supervision || '',
        orientativa: borrador.orientativa || 'No',
        estado: borrador.estado || '',
        fecha_hora_inicio: borrador.fecha_hora_inicio || '',
        fecha_hora_cierre: borrador.fecha_hora_cierre || '',
      })
      
      if (borrador.equipos_gps && borrador.equipos_gps.length > 0) {
        setEquiposGPS(borrador.equipos_gps)
      }
    }
  }, [borrador])
  
  // Campos requeridos para considerar la sección completa
  const requiredFields = [
    'expediente',
    'nombre_administrado',
    'ruc',
    'unidad_fiscalizable',
    'departamento',
    'provincia',
    'distrito',
    'actividad_desarrollada',
    'tipo_supervision',
    'fecha_hora_inicio',
    'fecha_hora_cierre'
  ]
  
  // Verificar si un equipo GPS está completo
  const isEquipoComplete = (equipo) => {
    return equipo.codigo?.trim() && equipo.marca?.trim() && equipo.sistema?.trim()
  }
  
  // Calcular estado de completitud
  const calculateCompletionStatus = () => {
    const filledRequired = requiredFields.filter(field => formData[field]?.trim()).length
    const hasCompleteEquipo = equiposGPS.some(isEquipoComplete)
    
    if (filledRequired === requiredFields.length && hasCompleteEquipo) {
      return 'completed'
    } else if (filledRequired > 0 || hasCompleteEquipo) {
      return 'in_progress'
    }
    return 'pending'
  }
  
  // Notificar cambios de estado al padre
  useEffect(() => {
    if (onStatusChange) {
      const status = calculateCompletionStatus()
      onStatusChange('info-general', status)
    }
  }, [formData, equiposGPS, onStatusChange])
  
  // Manejar cambios en el formulario
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  
  // Búsqueda de Unidades Fiscalizables con debounce
  useEffect(() => {
    const searchQuery = ufSearchQuery.trim()
    
    if (ufSearchTimeoutRef.current) {
      clearTimeout(ufSearchTimeoutRef.current)
    }
    
    if (!searchQuery || searchQuery.length < 2) {
      setUfSearchResults([])
      setLoadingUFs(false)
      return
    }
    
    ufSearchTimeoutRef.current = setTimeout(async () => {
      setLoadingUFs(true)
      try {
        const response = await api.get('/api/uf/search', {
          params: { q: searchQuery, limit: 15 }
        })
        setUfSearchResults(response.data.results || [])
      } catch (error) {
        console.error('Error buscando UFs:', error)
        setUfSearchResults([])
      } finally {
        setLoadingUFs(false)
      }
    }, 300)
    
    return () => {
      if (ufSearchTimeoutRef.current) {
        clearTimeout(ufSearchTimeoutRef.current)
      }
    }
  }, [ufSearchQuery])
  
  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        ufDropdownRef.current && 
        !ufDropdownRef.current.contains(event.target) &&
        ufInputRef.current &&
        !ufInputRef.current.contains(event.target)
      ) {
        setShowUFDropdown(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Seleccionar una Unidad Fiscalizable y autocompletar campos
  const handleSelectUF = (uf) => {
    // Construir la actividad desarrollada
    const actividadDesarrollada = uf.competencia 
      ? `Extracción de ${uf.competencia}`
      : ''
    
    setFormData(prev => ({
      ...prev,
      unidad_fiscalizable: uf.unidad_fiscalizable || '',
      nombre_administrado: uf.razon_social || prev.nombre_administrado,
      ruc: uf.ruc || prev.ruc,
      departamento: uf.dpto_ejecucion || prev.departamento,
      provincia: uf.prov_ejecucion || prev.provincia,
      distrito: uf.dist_ejecucion || prev.distrito,
      direccion_referencia: uf.direccion_ref || prev.direccion_referencia,
      actividad_desarrollada: actividadDesarrollada || prev.actividad_desarrollada,
    }))
    
    setUfSearchQuery('')
    setShowUFDropdown(false)
    setUfSearchResults([])
  }
  
  // Limpiar selección de UF
  const handleClearUF = () => {
    setFormData(prev => ({
      ...prev,
      unidad_fiscalizable: '',
      nombre_administrado: '',
      ruc: '',
      departamento: '',
      provincia: '',
      distrito: '',
      direccion_referencia: '',
      actividad_desarrollada: '',
    }))
    setUfSearchQuery('')
  }
  
  // Manejar cambios en equipos GPS
  const handleEquipoChange = (id, field, value) => {
    setEquiposGPS(prev => prev.map(eq => 
      eq.id === id ? { ...eq, [field]: value } : eq
    ))
  }
  
  // Agregar equipo GPS
  const addEquipo = () => {
    const newId = Math.max(...equiposGPS.map(e => e.id), 0) + 1
    setEquiposGPS(prev => [...prev, { id: newId, codigo: '', marca: '', sistema: 'WGS 84/UTM' }])
  }
  
  // Eliminar equipo GPS
  const removeEquipo = (id) => {
    if (equiposGPS.length > 1) {
      setEquiposGPS(prev => prev.filter(eq => eq.id !== id))
    }
  }
  
  // Guardar cambios
  const handleSave = () => {
    onSave({
      ...formData,
      equipos_gps: equiposGPS,
      last_section_edited: 'info-general'
    })
  }
  
  // Estilos comunes para inputs
  const inputClass = `
    w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 
    rounded-lg bg-white dark:bg-slate-700 pink:bg-white 
    text-slate-900 dark:text-white pink:text-slate-900 
    focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent
    placeholder:text-slate-400 dark:placeholder:text-slate-500
  `
  
  const labelClass = `
    block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1
  `

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white pink:text-slate-900">
            Información General del Acta
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600 mt-1">
            Complete los datos generales de la supervisión
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      
      {/* Formulario estilo tabla como en el Word */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
        
        {/* Título de sección */}
        <div className="bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 px-4 py-2 border-b border-slate-200 dark:border-slate-600 pink:border-pink-200">
          <h3 className="font-semibold text-slate-800 dark:text-white pink:text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            1. Datos Generales
          </h3>
        </div>
        
        <div className="p-4 space-y-4">
                    
          {/* Expediente */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Expediente N.°
            </label>
            <div className="col-span-3">
              <input
                type="text"
                value={formData.expediente}
                onChange={(e) => handleChange('expediente', e.target.value)}
                placeholder="XXXX-202X-DSEM-CHID"
                className={inputClass}
              />
            </div>
          </div>
          {/* Unidad Fiscalizable con Autocomplete */}
          <div className="grid grid-cols-4 gap-4 items-start">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 pt-2">
              Unidad Fiscalizable
            </label>
            <div className="col-span-3 relative">
              {/* Campo seleccionado o búsqueda */}
              {formData.unidad_fiscalizable ? (
                <div className="flex items-center gap-2">
                  <div className={`flex-1 px-3 py-2 border border-green-300 dark:border-green-600 pink:border-green-300 
                                  rounded-lg bg-green-50 dark:bg-green-900/20 pink:bg-green-50 
                                  text-slate-900 dark:text-white pink:text-slate-900`}>
                    <span className="font-medium">{formData.unidad_fiscalizable}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearUF}
                    className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Limpiar selección"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div ref={ufInputRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={ufSearchQuery}
                      onChange={(e) => {
                        setUfSearchQuery(e.target.value)
                        setShowUFDropdown(true)
                      }}
                      onFocus={() => setShowUFDropdown(true)}
                      placeholder="Buscar unidad fiscalizable..."
                      className={`${inputClass} pl-10`}
                    />
                    {loadingUFs && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                  
                  {/* Dropdown de resultados */}
                  {showUFDropdown && ufSearchQuery.length >= 2 && (
                    <div 
                      ref={ufDropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 pink:bg-white 
                                border border-slate-200 dark:border-slate-600 pink:border-pink-200 
                                rounded-lg shadow-lg max-h-60 overflow-y-auto"
                    >
                      {loadingUFs ? (
                        <div className="p-3 text-center text-slate-500 dark:text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        </div>
                      ) : ufSearchResults.length === 0 ? (
                        <div className="p-3 text-center text-slate-500 dark:text-slate-400 text-sm">
                          No se encontraron resultados
                        </div>
                      ) : (
                        ufSearchResults.map((uf) => (
                          <button
                            key={uf.id}
                            type="button"
                            onClick={() => handleSelectUF(uf)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-50
                                     border-b border-slate-100 dark:border-slate-700 pink:border-pink-100 last:border-b-0
                                     transition-colors"
                          >
                            <div className="font-medium text-slate-900 dark:text-white pink:text-slate-900 text-sm">
                              {uf.unidad_fiscalizable}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500 mt-0.5">
                              {uf.razon_social} {uf.ruc && `• RUC: ${uf.ruc}`}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Escribe para buscar y autocompletar datos del administrado
              </p>
            </div>
          </div>
          
          {/* Nombre del Administrado y RUC */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Nombre del Administrado
            </label>
            <div className="col-span-2">
              <input
                type="text"
                value={formData.nombre_administrado}
                onChange={(e) => handleChange('nombre_administrado', e.target.value)}
                placeholder="Nombre de la empresa"
                className={inputClass}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-nowrap">
                  RUC
                </label>
                <input
                  type="text"
                  value={formData.ruc}
                  onChange={(e) => handleChange('ruc', e.target.value)}
                  placeholder="20XXXXXXXXX"
                  maxLength={11}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          
         
          
          {/* Ubicación: Departamento, Provincia, Distrito */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Departamento
            </label>
            <input
              type="text"
              value={formData.departamento}
              onChange={(e) => handleChange('departamento', e.target.value)}
              placeholder="Departamento"
              className={inputClass}
            />
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 text-center">
              Provincia
            </label>
            <input
              type="text"
              value={formData.provincia}
              onChange={(e) => handleChange('provincia', e.target.value)}
              placeholder="Provincia"
              className={inputClass}
            />
          </div>
          
          <div className="grid grid-cols-4 gap-4 items-center">
            <div></div>
            <div></div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 text-center">
              Distrito
            </label>
            <input
              type="text"
              value={formData.distrito}
              onChange={(e) => handleChange('distrito', e.target.value)}
              placeholder="Distrito"
              className={inputClass}
            />
          </div>
          
          {/* Dirección */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Dirección y/o Referencia
            </label>
            <div className="col-span-3">
              <input
                type="text"
                value={formData.direccion_referencia}
                onChange={(e) => handleChange('direccion_referencia', e.target.value)}
                placeholder="Dirección o referencia de ubicación"
                className={inputClass}
              />
            </div>
          </div>
          
          {/* Actividad Desarrollada y Etapa */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Actividad Desarrollada
            </label>
            <div className="col-span-2">
              <input
                type="text"
                value={formData.actividad_desarrollada}
                onChange={(e) => handleChange('actividad_desarrollada', e.target.value)}
                placeholder="Tipo de actividad"
                className={inputClass}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-nowrap">
                  Etapa
                </label>
                <select
                  value={formData.etapa}
                  onChange={(e) => handleChange('etapa', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Seleccionar...</option>
                  <option value="En operación">En operación</option>
                  <option value="En abandono">En abandono</option>
                  <option value="En suspensión">En suspensión</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Tipo de Supervisión, Orientativa, Estado */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
              Tipo de Supervisión
            </label>
            <select
              value={formData.tipo_supervision}
              onChange={(e) => handleChange('tipo_supervision', e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar...</option>
              <option value="Regular">Regular</option>
              <option value="Especial">Especial</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-nowrap">
                Orientativa
              </label>
              <select
                value={formData.orientativa}
                onChange={(e) => handleChange('orientativa', e.target.value)}
                className={inputClass}
              >
                <option value="Sí">Sí</option>
                <option value="No">No</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-nowrap">
                Estado
              </label>
              <select
                value={formData.estado}
                onChange={(e) => handleChange('estado', e.target.value)}
                className={inputClass}
              >
                <option value="">Seleccionar...</option>
                <option value="En actividad">En actividad</option>
                <option value="En exploración">En exploración</option>
                <option value="En explotación">En explotación</option>
                <option value="En refinación">En refinación</option>
                <option value="En comercialización">En comercialización</option>
                <option value="En transporte">En transporte</option>
              </select>
            </div>
          </div>
          
          {/* Fechas */}
          <div className="grid grid-cols-4 gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Fecha/Hora de Inicio
            </label>
            <input
              type="datetime-local"
              value={formData.fecha_hora_inicio}
              onChange={(e) => handleChange('fecha_hora_inicio', e.target.value)}
              className={inputClass}
            />
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 flex items-center gap-1 justify-center">
              <Clock className="w-4 h-4" />
              Fecha/Hora de Cierre
            </label>
            <input
              type="datetime-local"
              value={formData.fecha_hora_cierre}
              onChange={(e) => handleChange('fecha_hora_cierre', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        
        {/* Equipos GPS */}
        <div className="border-t border-slate-200 dark:border-slate-700 pink:border-pink-200">
          <div className="bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 px-4 py-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-white pink:text-slate-800 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Equipos GPS
            </h3>
            <button
              onClick={addEquipo}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
          
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">
                  <th className="pb-2 font-medium">Código</th>
                  <th className="pb-2 font-medium">Marca</th>
                  <th className="pb-2 font-medium">Sistema</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
                {equiposGPS.map((equipo) => (
                  <tr key={equipo.id}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={equipo.codigo}
                        onChange={(e) => handleEquipoChange(equipo.id, 'codigo', e.target.value)}
                        placeholder="Código"
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={equipo.marca}
                        onChange={(e) => handleEquipoChange(equipo.id, 'marca', e.target.value)}
                        placeholder="Ej: Garmin Montana 750i"
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={equipo.sistema}
                        onChange={(e) => handleEquipoChange(equipo.id, 'sistema', e.target.value)}
                        className={inputClass}
                      >
                        <option value="WGS 84/UTM">WGS 84/UTM</option>
                        <option value="PSAD 56">PSAD 56</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeEquipo(equipo.id)}
                        disabled={equiposGPS.length === 1}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Nota informativa */}
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50 rounded-lg border border-blue-200 dark:border-blue-800 pink:border-pink-200">
        <p className="text-sm text-blue-800 dark:text-blue-300 pink:text-pink-800">
          <strong>Nota:</strong> Esta información corresponde a la sección "1. Datos Generales" del acta de supervisión. 
          Los cambios se guardan automáticamente en su equipo local.
        </p>
      </div>
    </div>
  )
}

export default InformacionGeneralSection
