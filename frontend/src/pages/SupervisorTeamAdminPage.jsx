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
  Save, 
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  Eye,
  EyeOff,
  Edit3,
  X,
  Search,
  Upload,
  Download
} from 'lucide-react'

export default function SupervisorTeamAdminPage() {
  const navigate = useNavigate()
  const { isSuperAdmin, loading: authLoading } = useAuth()
  const [theme, cycleTheme] = useTheme()
  
  // Estados
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Estado para nuevo miembro
  const [newMember, setNewMember] = useState({
    apellidos_nombres: '',
    dni: '',
    num_colegiatura: ''
  })
  const [addingMember, setAddingMember] = useState(false)
  
  // Estado para edición inline
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({
    apellidos_nombres: '',
    dni: '',
    num_colegiatura: ''
  })

  // Verificar permisos
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/')
    }
  }, [authLoading, isSuperAdmin, navigate])

  // Cargar miembros
  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/supervisor-team/all')
      setMembers(response.data.members || [])
    } catch (error) {
      console.error('Error fetching members:', error)
      showMessage('error', 'Error al cargar miembros del equipo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchMembers()
    }
  }, [authLoading, isSuperAdmin, fetchMembers])

  // Mostrar mensaje temporal
  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Crear nuevo miembro
  const handleAddMember = async () => {
    if (!newMember.apellidos_nombres.trim()) {
      showMessage('error', 'Los apellidos y nombres son requeridos')
      return
    }

    try {
      setAddingMember(true)
      const response = await api.post('/api/supervisor-team', newMember)
      
      setMembers(prev => [...prev, response.data.member].sort((a, b) => 
        a.apellidos_nombres.localeCompare(b.apellidos_nombres)
      ))
      setNewMember({ apellidos_nombres: '', dni: '', num_colegiatura: '' })
      showMessage('success', 'Miembro agregado exitosamente')
    } catch (error) {
      console.error('Error creating member:', error)
      showMessage('error', error.response?.data?.error || 'Error al crear miembro')
    } finally {
      setAddingMember(false)
    }
  }

  // Actualizar miembro
  const handleUpdateMember = async (id) => {
    if (!editData.apellidos_nombres.trim()) {
      showMessage('error', 'Los apellidos y nombres no pueden estar vacíos')
      return
    }

    try {
      setSaving(true)
      const response = await api.put(`/api/supervisor-team/${id}`, editData)
      
      setMembers(prev => prev.map(m => m.id === id ? response.data.member : m).sort((a, b) => 
        a.apellidos_nombres.localeCompare(b.apellidos_nombres)
      ))
      setEditingId(null)
      showMessage('success', 'Miembro actualizado')
    } catch (error) {
      console.error('Error updating member:', error)
      showMessage('error', error.response?.data?.error || 'Error al actualizar miembro')
    } finally {
      setSaving(false)
    }
  }

  // Toggle activar/desactivar miembro
  const handleToggleActive = async (id, currentStatus) => {
    try {
      const response = await api.put(`/api/supervisor-team/${id}`, {
        is_active: !currentStatus
      })
      
      setMembers(prev => prev.map(m => m.id === id ? response.data.member : m))
      showMessage('success', `Miembro ${!currentStatus ? 'activado' : 'desactivado'}`)
    } catch (error) {
      console.error('Error toggling member:', error)
      showMessage('error', 'Error al cambiar estado del miembro')
    }
  }

  // Eliminar miembro
  const handleDeleteMember = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este miembro? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      await api.delete(`/api/supervisor-team/${id}`)
      setMembers(prev => prev.filter(m => m.id !== id))
      showMessage('success', 'Miembro eliminado')
    } catch (error) {
      console.error('Error deleting member:', error)
      showMessage('error', 'Error al eliminar miembro')
    }
  }

  // Iniciar edición
  const startEditing = (member) => {
    setEditingId(member.id)
    setEditData({
      apellidos_nombres: member.apellidos_nombres,
      dni: member.dni || '',
      num_colegiatura: member.num_colegiatura || ''
    })
  }

  // Cancelar edición
  const cancelEditing = () => {
    setEditingId(null)
    setEditData({ apellidos_nombres: '', dni: '', num_colegiatura: '' })
  }

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = ['Apellidos y Nombres', 'DNI', 'N.° Colegiatura', 'Estado']
    const rows = members.map(m => [
      m.apellidos_nombres,
      m.dni || '',
      m.num_colegiatura || '',
      m.is_active ? 'Activo' : 'Inactivo'
    ])
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `equipo_supervisor_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Filtrar miembros
  const filteredMembers = members.filter(m => 
    m.apellidos_nombres.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.dni && m.dni.includes(searchQuery)) ||
    (m.num_colegiatura && m.num_colegiatura.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Estadísticas
  const activeCount = members.filter(m => m.is_active).length
  const inactiveCount = members.filter(m => !m.is_active).length

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
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
              title="Volver al panel de administración"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400 pink:text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                Equipo Supervisor
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </span>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 pink:bg-pink-100 hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-200 text-slate-700 dark:text-slate-300 pink:text-slate-700 rounded-lg transition-colors"
              title="Exportar a CSV"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <ThemeToggle theme={theme} cycleTheme={cycleTheme} />
          </div>
        </div>
      </header>

      {/* Mensaje */}
      {message && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
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

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Estadísticas */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">{members.length}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Total</div>
          </div>
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Activos</div>
          </div>
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-400 dark:text-slate-500">{inactiveCount}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Inactivos</div>
          </div>
        </div>

        {/* Descripción */}
        <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50 border border-blue-200 dark:border-blue-800 pink:border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300 pink:text-blue-700">
            <strong>Equipo Supervisor:</strong> Los miembros que definas aquí estarán disponibles para seleccionar 
            en la sección "Personal y Equipo" de las actas. Cada miembro puede tener DNI y número de colegiatura 
            que se autocompletarán al seleccionarlo.
          </p>
        </div>

        {/* Formulario para nuevo miembro */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
            Agregar Nuevo Miembro
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                Apellidos y Nombres *
              </label>
              <input
                type="text"
                value={newMember.apellidos_nombres}
                onChange={(e) => setNewMember(prev => ({ ...prev, apellidos_nombres: e.target.value }))}
                placeholder="Ej: García López Juan Carlos"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                DNI
              </label>
              <input
                type="text"
                value={newMember.dni}
                onChange={(e) => setNewMember(prev => ({ ...prev, dni: e.target.value }))}
                placeholder="12345678"
                maxLength={8}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-1">
                N.° Colegiatura
              </label>
              <input
                type="text"
                value={newMember.num_colegiatura}
                onChange={(e) => setNewMember(prev => ({ ...prev, num_colegiatura: e.target.value }))}
                placeholder="CIP 123456"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <button
            onClick={handleAddMember}
            disabled={addingMember || !newMember.apellidos_nombres.trim()}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingMember ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Agregar Miembro
          </button>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, DNI o colegiatura..."
            className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-xl bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
          />
        </div>

        {/* Tabla de miembros */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Miembros del Equipo ({filteredMembers.length})
            </h2>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 pink:text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{searchQuery ? 'No se encontraron resultados' : 'No hay miembros registrados'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50 pink:bg-pink-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase tracking-wider">
                      Apellidos y Nombres
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase tracking-wider">
                      DNI
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase tracking-wider">
                      N.° Colegiatura
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
                  {filteredMembers.map((member) => (
                    <tr 
                      key={member.id}
                      className={`
                        transition-colors
                        ${!member.is_active ? 'bg-slate-50 dark:bg-slate-800/50 opacity-60' : ''}
                        hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50
                      `}
                    >
                      {editingId === member.id ? (
                        // Modo edición
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editData.apellidos_nombres}
                              onChange={(e) => setEditData(prev => ({ ...prev, apellidos_nombres: e.target.value }))}
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editData.dni}
                              onChange={(e) => setEditData(prev => ({ ...prev, dni: e.target.value }))}
                              maxLength={8}
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editData.num_colegiatura}
                              onChange={(e) => setEditData(prev => ({ ...prev, num_colegiatura: e.target.value }))}
                              className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded font-medium ${
                              member.is_active 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                            }`}>
                              {member.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleUpdateMember(member.id)}
                                disabled={saving}
                                className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                                title="Guardar"
                              >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // Modo visualización
                        <>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white pink:text-[#0f172a] font-medium">
                            {member.apellidos_nombres}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                            {member.dni || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                            {member.num_colegiatura || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded font-medium ${
                              member.is_active 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                            }`}>
                              {member.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditing(member)}
                                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-100 transition-colors"
                                title="Editar"
                              >
                                <Edit3 className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-slate-600" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(member.id, member.is_active)}
                                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 pink:hover:bg-pink-100 transition-colors"
                                title={member.is_active ? 'Desactivar' : 'Activar'}
                              >
                                {member.is_active ? (
                                  <Eye className="w-4 h-4 text-green-600 dark:text-green-400" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteMember(member.id)}
                                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
