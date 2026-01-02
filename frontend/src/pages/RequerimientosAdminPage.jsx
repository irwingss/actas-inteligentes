import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../hooks/useDarkMode'
import { ThemeToggle } from '../components/ThemeToggle'
import api from '../lib/axios'
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  GripVertical, 
  Save, 
  Loader2,
  AlertCircle,
  CheckCircle,
  ClipboardCheck,
  Eye,
  EyeOff,
  Edit3,
  X,
  Filter,
  Tag
} from 'lucide-react'

// Lista de hechos disponibles (basada en el CSV)
const HECHOS_DISPONIBLES = [
  'A. Acciones de primera respuesta.',
  'C. Almacenamiento de residuos sólidos.',
  'D. Almacenamiento de sustancias químicas.',
  'E. Área estanca.',
  'F. Áreas impactadas (suelo, agua, sedimento, otros con hidrocarburos).',
  'I. Disposición Final de residuos sólidos.',
  'J. Falta de mantenimiento.',
  'K. Limpieza del área afectada.',
  'L. Medidas de prevención.',
  'Ñ. Instalaciones inoperativas por más de 1 año.'
]

export default function RequerimientosAdminPage() {
  const navigate = useNavigate()
  const { isSuperAdmin, loading: authLoading } = useAuth()
  const [theme, cycleTheme] = useTheme()
  
  // Estados principales
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  
  // Filtros
  const [filterTipoCA, setFilterTipoCA] = useState('all') // 'all', 'Especial', 'Regular'
  const [filterHecho, setFilterHecho] = useState('all')
  
  // Estado para nuevo requerimiento
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTexto, setNewTexto] = useState('')
  const [newTipoCA, setNewTipoCA] = useState('Especial')
  const [newHechosAsociados, setNewHechosAsociados] = useState([])
  const [addingTemplate, setAddingTemplate] = useState(false)
  
  // Estado para edición
  const [editingId, setEditingId] = useState(null)
  const [editTexto, setEditTexto] = useState('')
  const [editTipoCA, setEditTipoCA] = useState('Especial')
  const [editHechosAsociados, setEditHechosAsociados] = useState([])
  
  // Estado para drag & drop
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Verificar permisos
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/')
    }
  }, [authLoading, isSuperAdmin, navigate])

  // Cargar templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/requerimientos/all')
      setTemplates(response.data.templates || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
      showMessage('error', 'Error al cargar requerimientos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchTemplates()
    }
  }, [authLoading, isSuperAdmin, fetchTemplates])

  // Mostrar mensaje temporal
  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Crear nuevo template
  const handleAddTemplate = async () => {
    if (!newTexto.trim()) {
      showMessage('error', 'El texto del requerimiento es obligatorio')
      return
    }
    if (newHechosAsociados.length === 0) {
      showMessage('error', 'Debe seleccionar al menos un hecho asociado')
      return
    }

    try {
      setAddingTemplate(true)
      const response = await api.post('/api/requerimientos', {
        texto: newTexto.trim(),
        tipo_ca: newTipoCA,
        hechos_asociados: newHechosAsociados,
        orden: templates.length
      })
      
      setTemplates(prev => [...prev, response.data.template])
      setNewTexto('')
      setNewTipoCA('Especial')
      setNewHechosAsociados([])
      setShowNewForm(false)
      showMessage('success', 'Requerimiento creado exitosamente')
    } catch (error) {
      console.error('Error creating template:', error)
      showMessage('error', error.response?.data?.error || 'Error al crear requerimiento')
    } finally {
      setAddingTemplate(false)
    }
  }

  // Actualizar template
  const handleUpdateTemplate = async (id) => {
    if (!editTexto.trim()) {
      showMessage('error', 'El texto no puede estar vacío')
      return
    }
    if (editHechosAsociados.length === 0) {
      showMessage('error', 'Debe seleccionar al menos un hecho asociado')
      return
    }

    try {
      setSaving(true)
      const response = await api.put(`/api/requerimientos/${id}`, {
        texto: editTexto.trim(),
        tipo_ca: editTipoCA,
        hechos_asociados: editHechosAsociados
      })
      
      setTemplates(prev => prev.map(t => t.id === id ? response.data.template : t))
      setEditingId(null)
      showMessage('success', 'Requerimiento actualizado')
    } catch (error) {
      console.error('Error updating template:', error)
      showMessage('error', error.response?.data?.error || 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  // Toggle activar/desactivar
  const handleToggleActive = async (id, currentStatus) => {
    try {
      const response = await api.put(`/api/requerimientos/${id}`, {
        is_active: !currentStatus
      })
      
      setTemplates(prev => prev.map(t => t.id === id ? response.data.template : t))
      showMessage('success', `Requerimiento ${!currentStatus ? 'activado' : 'desactivado'}`)
    } catch (error) {
      console.error('Error toggling template:', error)
      showMessage('error', 'Error al cambiar estado')
    }
  }

  // Eliminar template
  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('¿Eliminar este requerimiento? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      await api.delete(`/api/requerimientos/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
      showMessage('success', 'Requerimiento eliminado')
    } catch (error) {
      console.error('Error deleting template:', error)
      showMessage('error', 'Error al eliminar')
    }
  }

  // Iniciar edición
  const startEditing = (template) => {
    setEditingId(template.id)
    setEditTexto(template.texto)
    setEditTipoCA(template.tipo_ca)
    setEditHechosAsociados(template.hechos_asociados || [])
  }

  // Cancelar edición
  const cancelEditing = () => {
    setEditingId(null)
    setEditTexto('')
    setEditTipoCA('Especial')
    setEditHechosAsociados([])
  }

  // Toggle hecho en selección múltiple
  const toggleHecho = (hecho, isNew = false) => {
    if (isNew) {
      setNewHechosAsociados(prev => 
        prev.includes(hecho) 
          ? prev.filter(h => h !== hecho)
          : [...prev, hecho]
      )
    } else {
      setEditHechosAsociados(prev => 
        prev.includes(hecho) 
          ? prev.filter(h => h !== hecho)
          : [...prev, hecho]
      )
    }
  }

  // Drag & Drop handlers - IMPORTANTE: stopPropagation para evitar conflicto con Tauri
  const handleDragStart = (e, index) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    setDraggedIndex(index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newTemplates = [...filteredTemplates]
    const [draggedItem] = newTemplates.splice(draggedIndex, 1)
    newTemplates.splice(dragOverIndex, 0, draggedItem)
    
    // Actualizar orden en state (solo los filtrados por ahora)
    const orderedIds = newTemplates.map(t => t.id)
    
    setDraggedIndex(null)
    setDragOverIndex(null)

    try {
      await api.put('/api/requerimientos/reorder', { orderedIds })
      fetchTemplates() // Recargar para obtener orden actualizado
      showMessage('success', 'Orden actualizado')
    } catch (error) {
      console.error('Error reordering:', error)
      showMessage('error', 'Error al reordenar')
      fetchTemplates()
    }
  }

  // Filtrar templates
  const filteredTemplates = templates.filter(t => {
    if (filterTipoCA !== 'all' && t.tipo_ca !== filterTipoCA) return false
    if (filterHecho !== 'all' && !t.hechos_asociados?.includes(filterHecho)) return false
    return true
  })

  // Loading o sin permisos
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-gradient-page">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return null
  }

  return (
    <div className="min-h-screen theme-gradient-page">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 pink:bg-white/95 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300 pink:text-slate-600" />
              </button>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-slate-900">
                  Gestión de Requerimientos de Información
                </h1>
              </div>
            </div>
            <ThemeToggle theme={theme} cycleTheme={cycleTheme} />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mensaje de feedback */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'error' 
              ? 'bg-red-50 dark:bg-red-900/20 pink:bg-red-50 text-red-800 dark:text-red-200 pink:text-red-800' 
              : 'bg-green-50 dark:bg-green-900/20 pink:bg-green-50 text-green-800 dark:text-green-200 pink:text-green-800'
          }`}>
            {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {message.text}
          </div>
        )}

        {/* Filtros y botón de agregar */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {/* Filtro por tipo de CA */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={filterTipoCA}
              onChange={(e) => setFilterTipoCA(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-sm"
            >
              <option value="all">Todos los tipos</option>
              <option value="Especial">Especial</option>
              <option value="Regular">Regular</option>
            </select>
          </div>

          {/* Filtro por hecho */}
          <select
            value={filterHecho}
            onChange={(e) => setFilterHecho(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-sm max-w-xs"
          >
            <option value="all">Todos los hechos</option>
            {HECHOS_DISPONIBLES.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Botón agregar */}
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo Requerimiento
          </button>
        </div>

        {/* Formulario para nuevo requerimiento */}
        {showNewForm && (
          <div className="mb-6 bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-4">
              Nuevo Requerimiento
            </h3>
            
            <div className="space-y-4">
              {/* Texto del requerimiento */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                  Texto del requerimiento *
                </label>
                <textarea
                  value={newTexto}
                  onChange={(e) => setNewTexto(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder:text-slate-400"
                  placeholder="Ingrese el texto del requerimiento de información..."
                />
              </div>

              {/* Tipo de CA */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                  Tipo de CA *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="newTipoCA"
                      value="Especial"
                      checked={newTipoCA === 'Especial'}
                      onChange={(e) => setNewTipoCA(e.target.value)}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300 pink:text-slate-700">Especial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="newTipoCA"
                      value="Regular"
                      checked={newTipoCA === 'Regular'}
                      onChange={(e) => setNewTipoCA(e.target.value)}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300 pink:text-slate-700">Regular</span>
                  </label>
                </div>
              </div>

              {/* Hechos asociados */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                  Hechos asociados * <span className="text-slate-500 font-normal">(seleccione uno o más)</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg">
                  {HECHOS_DISPONIBLES.map(hecho => (
                    <label 
                      key={hecho}
                      className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                        newHechosAsociados.includes(hecho)
                          ? 'bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newHechosAsociados.includes(hecho)}
                        onChange={() => toggleHecho(hecho, true)}
                        className="mt-1 w-4 h-4 text-primary-600 rounded"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 pink:text-slate-700">{hecho}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowNewForm(false)
                    setNewTexto('')
                    setNewTipoCA('Especial')
                    setNewHechosAsociados([])
                  }}
                  className="px-4 py-2 text-slate-700 dark:text-slate-300 pink:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddTemplate}
                  disabled={addingTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {addingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de templates */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200">
            <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {templates.length === 0 
                ? 'No hay requerimientos configurados'
                : 'No hay requerimientos que coincidan con los filtros'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTemplates.map((template, index) => (
              <div
                key={template.id}
                draggable={editingId !== template.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border transition-all ${
                  dragOverIndex === index 
                    ? 'border-primary-500 dark:border-primary-400 pink:border-pink-500 ring-2 ring-primary-500/20' 
                    : 'border-slate-200 dark:border-slate-700 pink:border-pink-200'
                } ${!template.is_active ? 'opacity-60' : ''}`}
              >
                {editingId === template.id ? (
                  // Modo edición
                  <div className="p-6 space-y-4">
                    <textarea
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900"
                    />
                    
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`editTipoCA_${template.id}`}
                          value="Especial"
                          checked={editTipoCA === 'Especial'}
                          onChange={(e) => setEditTipoCA(e.target.value)}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-slate-700 dark:text-slate-300">Especial</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`editTipoCA_${template.id}`}
                          value="Regular"
                          checked={editTipoCA === 'Regular'}
                          onChange={(e) => setEditTipoCA(e.target.value)}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-slate-700 dark:text-slate-300">Regular</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 dark:border-slate-600 rounded-lg">
                      {HECHOS_DISPONIBLES.map(hecho => (
                        <label 
                          key={hecho}
                          className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                            editHechosAsociados.includes(hecho)
                              ? 'bg-primary-50 dark:bg-primary-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={editHechosAsociados.includes(hecho)}
                            onChange={() => toggleHecho(hecho, false)}
                            className="mt-1 w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{hecho}</span>
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateTemplate(template.id)}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  // Modo visualización
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Drag handle */}
                      <div className="cursor-grab hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded">
                        <GripVertical className="w-5 h-5 text-slate-400" />
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            template.tipo_ca === 'Especial'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}>
                            {template.tipo_ca}
                          </span>
                          {!template.is_active && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                              Inactivo
                            </span>
                          )}
                        </div>
                        
                        {/* Texto */}
                        <p className="text-sm text-slate-700 dark:text-slate-300 pink:text-slate-700 whitespace-pre-wrap mb-3">
                          {template.texto}
                        </p>

                        {/* Hechos asociados */}
                        <div className="flex flex-wrap gap-1.5">
                          {template.hechos_asociados?.map(hecho => (
                            <span 
                              key={hecho}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 text-slate-600 dark:text-slate-400 pink:text-slate-600 rounded"
                            >
                              <Tag className="w-3 h-3" />
                              {hecho.length > 30 ? hecho.substring(0, 30) + '...' : hecho}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActive(template.id, template.is_active)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title={template.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {template.is_active ? (
                            <Eye className="w-4 h-4 text-green-600" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        <button
                          onClick={() => startEditing(template)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Contador */}
        <div className="mt-6 text-sm text-slate-500 dark:text-slate-400 text-center">
          Mostrando {filteredTemplates.length} de {templates.length} requerimientos
        </div>
      </main>
    </div>
  )
}
