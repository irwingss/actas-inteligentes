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
  Paperclip,
  Eye,
  EyeOff,
  Edit3,
  X
} from 'lucide-react'

export default function AnexosAdminPage() {
  const navigate = useNavigate()
  const { isSuperAdmin, loading: authLoading } = useAuth()
  const [theme, cycleTheme] = useTheme()
  
  // Estados
  const [anexos, setAnexos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  
  // Estado para nuevo anexo
  const [newAnexoText, setNewAnexoText] = useState('')
  const [newAnexoTipo, setNewAnexoTipo] = useState('físico')
  const [addingAnexo, setAddingAnexo] = useState(false)
  
  // Estado para edición inline
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editTipo, setEditTipo] = useState('físico')
  
  // Estado para drag & drop
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Verificar permisos
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/')
    }
  }, [authLoading, isSuperAdmin, navigate])

  // Cargar anexos
  const fetchAnexos = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/anexos/all')
      setAnexos(response.data.anexos || [])
    } catch (error) {
      console.error('Error fetching anexos:', error)
      showMessage('error', 'Error al cargar anexos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchAnexos()
    }
  }, [authLoading, isSuperAdmin, fetchAnexos])

  // Mostrar mensaje temporal
  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Crear nuevo anexo
  const handleAddAnexo = async () => {
    if (!newAnexoText.trim()) {
      showMessage('error', 'El texto del anexo es requerido')
      return
    }

    try {
      setAddingAnexo(true)
      const response = await api.post('/api/anexos', {
        texto: newAnexoText.trim(),
        tipo: newAnexoTipo
      })
      
      setAnexos(prev => [...prev, response.data.anexo])
      setNewAnexoText('')
      setNewAnexoTipo('físico')
      showMessage('success', 'Anexo creado exitosamente')
    } catch (error) {
      console.error('Error creating anexo:', error)
      showMessage('error', error.response?.data?.error || 'Error al crear anexo')
    } finally {
      setAddingAnexo(false)
    }
  }

  // Actualizar anexo
  const handleUpdateAnexo = async (id) => {
    if (!editText.trim()) {
      showMessage('error', 'El texto del anexo no puede estar vacío')
      return
    }

    try {
      setSaving(true)
      const response = await api.put(`/api/anexos/${id}`, {
        texto: editText.trim(),
        tipo: editTipo
      })
      
      setAnexos(prev => prev.map(a => a.id === id ? response.data.anexo : a))
      setEditingId(null)
      showMessage('success', 'Anexo actualizado')
    } catch (error) {
      console.error('Error updating anexo:', error)
      showMessage('error', error.response?.data?.error || 'Error al actualizar anexo')
    } finally {
      setSaving(false)
    }
  }

  // Toggle activar/desactivar anexo
  const handleToggleActive = async (id, currentStatus) => {
    try {
      const response = await api.put(`/api/anexos/${id}`, {
        is_active: !currentStatus
      })
      
      setAnexos(prev => prev.map(a => a.id === id ? response.data.anexo : a))
      showMessage('success', `Anexo ${!currentStatus ? 'activado' : 'desactivado'}`)
    } catch (error) {
      console.error('Error toggling anexo:', error)
      showMessage('error', 'Error al cambiar estado del anexo')
    }
  }

  // Eliminar anexo
  const handleDeleteAnexo = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este anexo? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      await api.delete(`/api/anexos/${id}`)
      setAnexos(prev => prev.filter(a => a.id !== id))
      showMessage('success', 'Anexo eliminado')
    } catch (error) {
      console.error('Error deleting anexo:', error)
      showMessage('error', 'Error al eliminar anexo')
    }
  }

  // Iniciar edición
  const startEditing = (anexo) => {
    setEditingId(anexo.id)
    setEditText(anexo.texto)
    setEditTipo(anexo.tipo || 'físico')
  }

  // Cancelar edición
  const cancelEditing = () => {
    setEditingId(null)
    setEditText('')
    setEditTipo('físico')
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

    // Reordenar localmente
    const newAnexos = [...anexos]
    const [draggedItem] = newAnexos.splice(draggedIndex, 1)
    newAnexos.splice(dragOverIndex, 0, draggedItem)
    setAnexos(newAnexos)

    setDraggedIndex(null)
    setDragOverIndex(null)

    // Guardar nuevo orden en el servidor
    try {
      setSaving(true)
      await api.put('/api/anexos/reorder', {
        orderedIds: newAnexos.map(a => a.id)
      })
      showMessage('success', 'Orden actualizado')
    } catch (error) {
      console.error('Error reordering:', error)
      showMessage('error', 'Error al guardar el orden')
      // Recargar para restaurar el orden original
      fetchAnexos()
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen theme-gradient-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 pink:text-pink-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen theme-gradient-page">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 pink:bg-white/95 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
              title="Volver al panel de administración"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400 pink:text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <Paperclip className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                Gestión de Anexos
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </span>
            )}
            <ThemeToggle theme={theme} cycleTheme={cycleTheme} />
          </div>
        </div>
      </header>

      {/* Mensaje */}
      {message && (
        <div className={`max-w-5xl mx-auto px-4 mt-4`}>
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            message.type === 'error' 
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          }`}>
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm">{message.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Descripción */}
        <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50 border border-blue-200 dark:border-blue-800 pink:border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-sm text-blue-700 dark:text-blue-300 pink:text-blue-700">
            <strong>Anexos de Actas:</strong> Los anexos que definas aquí aparecerán como checkboxes en la sección "Anexos" 
            de todas las actas. Los usuarios podrán marcar cuáles aplican a cada acta específica. 
            Puedes arrastrar y soltar para reordenar los anexos.
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 pink:text-blue-600">
            <strong>Tipo de anexo:</strong> El tipo determina cómo se ingresa el campo "Folios" en cada acta:
            <span className="inline-block ml-2 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">físico</span> = número de folios (entero),
            <span className="inline-block ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">virtual</span> = descripción de carpetas/archivos digitales (texto hasta 500 caracteres).
          </p>
        </div>

        {/* Formulario para nuevo anexo */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
            Agregar Nuevo Anexo
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                  Descripción del Anexo *
                </label>
                <textarea
                  value={newAnexoText}
                  onChange={(e) => setNewAnexoText(e.target.value)}
                  placeholder="Ej: Plano topográfico del área supervisada..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                  Tipo *
                </label>
                <select
                  value={newAnexoTipo}
                  onChange={(e) => setNewAnexoTipo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="físico">físico</option>
                  <option value="virtual">virtual</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={handleAddAnexo}
              disabled={addingAnexo || !newAnexoText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingAnexo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Agregar Anexo
            </button>
          </div>
        </div>

        {/* Lista de anexos */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Anexos Definidos ({anexos.length})
            </h2>
          </div>

          {anexos.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 pink:text-slate-500">
              <Paperclip className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay anexos definidos todavía.</p>
              <p className="text-sm mt-1">Agrega el primer anexo usando el formulario de arriba.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
              {anexos.map((anexo, index) => (
                <div
                  key={anexo.id}
                  draggable={editingId !== anexo.id}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  className={`
                    flex items-start gap-3 px-6 py-4 transition-colors
                    ${draggedIndex === index ? 'opacity-50 bg-slate-100 dark:bg-slate-700' : ''}
                    ${dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-primary-500 pink:border-pink-500' : ''}
                    ${!anexo.is_active ? 'bg-slate-50 dark:bg-slate-800/50 opacity-60' : ''}
                    hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50
                  `}
                >
                  {/* Handle de arrastre */}
                  <div className="pt-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    {editingId === anexo.id ? (
                      // Modo edición
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="md:col-span-3">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent resize-none"
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tipo</label>
                            <select
                              value={editTipo}
                              onChange={(e) => setEditTipo(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent text-sm"
                            >
                              <option value="físico">físico</option>
                              <option value="virtual">virtual</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateAnexo(anexo.id)}
                            disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-sm rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Modo visualización
                      <>
                        <div className="flex items-start gap-3">
                          <p className="text-slate-900 dark:text-white pink:text-[#0f172a] flex-1">
                            {anexo.texto}
                          </p>
                          <span className={`flex-shrink-0 px-2 py-0.5 text-xs rounded font-medium ${
                            anexo.tipo === 'virtual' 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          }`}>
                            {anexo.tipo || 'físico'}
                          </span>
                        </div>
                        {!anexo.is_active && (
                          <span className="inline-block mt-2 px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs rounded">
                            Desactivado
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Acciones */}
                  {editingId !== anexo.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEditing(anexo)}
                        className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-100 transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-slate-600" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(anexo.id, anexo.is_active)}
                        className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-100 transition-colors"
                        title={anexo.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {anexo.is_active ? (
                          <Eye className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteAnexo(anexo.id)}
                        className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
