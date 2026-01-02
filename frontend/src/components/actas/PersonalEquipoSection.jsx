import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/axios'
import {
  Users,
  Plus,
  Trash2,
  Search,
  Loader2,
  ChevronDown,
  UserPlus,
  AlertCircle,
  CheckCircle,
  ArrowRight
} from 'lucide-react'

// Clave para localStorage
const getStorageKey = (borradorId, tableType) => `acta_equipo_${tableType}_${borradorId}`

export function PersonalEquipoSection({ borrador, onStatusChange }) {
  const { session } = useAuth()

  // Estados para los miembros disponibles
  const [availableMembers, setAvailableMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  // Estados para las dos tablas
  const [equipoSupervisor, setEquipoSupervisor] = useState([])
  const [equipoOtrosAspectos, setEquipoOtrosAspectos] = useState([])
  
  // Estado para cantidad de firmas del personal del administrado
  const [cantidadFirmasAdministrado, setCantidadFirmasAdministrado] = useState(2)
  
  // Estado para cantidad de firmas de otros participantes (peritos, etc.)
  const [cantidadFirmasOtrosParticipantes, setCantidadFirmasOtrosParticipantes] = useState(2)

  // Estados para el selector
  const [activeTable, setActiveTable] = useState('supervisor') // 'supervisor' | 'otros'
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Mensaje de feedback
  const [message, setMessage] = useState(null)

  // Cargar miembros disponibles desde Supabase
  const fetchMembers = useCallback(async () => {
    try {
      setLoadingMembers(true)
      const response = await api.get('/api/supervisor-team')
      setAvailableMembers(response.data.members || [])
    } catch (error) {
      console.error('Error fetching team members:', error)
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  // Cargar datos guardados desde localStorage
  const loadFromStorage = useCallback(() => {
    if (!borrador?.id) return

    try {
      const supervisorData = localStorage.getItem(getStorageKey(borrador.id, 'supervisor'))
      const otrosData = localStorage.getItem(getStorageKey(borrador.id, 'otros'))
      const firmasAdminData = localStorage.getItem(`acta_firmas_administrado_${borrador.id}`)

      if (supervisorData) {
        setEquipoSupervisor(JSON.parse(supervisorData))
      }
      if (otrosData) {
        setEquipoOtrosAspectos(JSON.parse(otrosData))
      }
      if (firmasAdminData) {
        setCantidadFirmasAdministrado(parseInt(firmasAdminData, 10) || 2)
      }
      
      const firmasOtrosData = localStorage.getItem(`acta_firmas_otros_participantes_${borrador.id}`)
      if (firmasOtrosData) {
        setCantidadFirmasOtrosParticipantes(parseInt(firmasOtrosData, 10) || 2)
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error)
    }
  }, [borrador?.id])

  // Guardar en localStorage
  const saveToStorage = useCallback((tableType, data) => {
    if (!borrador?.id) return

    try {
      localStorage.setItem(getStorageKey(borrador.id, tableType), JSON.stringify(data))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }, [borrador?.id])
  
  // Guardar cantidad de firmas del administrado
  const saveFirmasAdministrado = useCallback((cantidad) => {
    if (!borrador?.id) return
    try {
      localStorage.setItem(`acta_firmas_administrado_${borrador.id}`, String(cantidad))
    } catch (error) {
      console.error('Error saving firmas administrado:', error)
    }
  }, [borrador?.id])
  
  // Handler para cambiar cantidad de firmas del administrado
  const handleCantidadFirmasChange = (e) => {
    const value = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 2))
    setCantidadFirmasAdministrado(value)
    saveFirmasAdministrado(value)
  }
  
  // Guardar cantidad de firmas de otros participantes
  const saveFirmasOtrosParticipantes = useCallback((cantidad) => {
    if (!borrador?.id) return
    try {
      localStorage.setItem(`acta_firmas_otros_participantes_${borrador.id}`, String(cantidad))
    } catch (error) {
      console.error('Error saving firmas otros participantes:', error)
    }
  }, [borrador?.id])
  
  // Handler para cambiar cantidad de firmas de otros participantes
  const handleCantidadFirmasOtrosChange = (e) => {
    const value = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 2))
    setCantidadFirmasOtrosParticipantes(value)
    saveFirmasOtrosParticipantes(value)
  }

  // Efectos iniciales
  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  // Actualizar estado de la sección
  useEffect(() => {
    const hasData = equipoSupervisor.length > 0 || equipoOtrosAspectos.length > 0
    onStatusChange?.('personal-equipo', hasData ? 'completed' : 'pending')
  }, [equipoSupervisor, equipoOtrosAspectos, onStatusChange])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mostrar mensaje temporal
  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // Agregar miembro a una tabla
  const handleAddMember = (member) => {
    // Verificar si el miembro ya está en alguna de las dos tablas
    const inSupervisor = equipoSupervisor.some(m => m.id === member.id)
    const inOtros = equipoOtrosAspectos.some(m => m.id === member.id)

    if (inSupervisor || inOtros) {
      const currentLocation = inSupervisor ? 'Equipo Supervisor' : 'Otros Aspectos'
      showMessage('error', `Este miembro ya está en ${currentLocation}. Una persona solo puede estar en un equipo a la vez.`)
      return
    }

    const newEntry = {
      id: member.id,
      apellidos_nombres: member.apellidos_nombres,
      dni: member.dni || '',
      num_colegiatura: member.num_colegiatura || '',
      addedAt: new Date().toISOString()
    }

    if (activeTable === 'supervisor') {
      const newData = [...equipoSupervisor, newEntry]
      setEquipoSupervisor(newData)
      saveToStorage('supervisor', newData)
      showMessage('success', 'Agregado al Equipo Supervisor')
    } else {
      const newData = [...equipoOtrosAspectos, newEntry]
      setEquipoOtrosAspectos(newData)
      saveToStorage('otros', newData)
      showMessage('success', 'Agregado a Otros Aspectos')
    }

    setDropdownOpen(false)
    setSearchQuery('')
  }

  // Eliminar miembro de una tabla
  const handleRemoveMember = (tableType, memberId) => {
    if (tableType === 'supervisor') {
      const newData = equipoSupervisor.filter(m => m.id !== memberId)
      setEquipoSupervisor(newData)
      saveToStorage('supervisor', newData)
    } else {
      const newData = equipoOtrosAspectos.filter(m => m.id !== memberId)
      setEquipoOtrosAspectos(newData)
      saveToStorage('otros', newData)
    }
  }

  // Mover miembro entre tablas
  const handleMoveMember = (fromTable, memberId) => {
    const sourceData = fromTable === 'supervisor' ? equipoSupervisor : equipoOtrosAspectos
    const member = sourceData.find(m => m.id === memberId)

    if (!member) return

    if (fromTable === 'supervisor') {
      // Mover de Supervisor a Otros
      if (equipoOtrosAspectos.some(m => m.id === memberId)) {
        showMessage('error', 'Este miembro ya está en Otros Aspectos')
        return
      }
      const newSupervisor = equipoSupervisor.filter(m => m.id !== memberId)
      const newOtros = [...equipoOtrosAspectos, member]
      setEquipoSupervisor(newSupervisor)
      setEquipoOtrosAspectos(newOtros)
      saveToStorage('supervisor', newSupervisor)
      saveToStorage('otros', newOtros)
      showMessage('success', 'Movido a Otros Aspectos')
    } else {
      // Mover de Otros a Supervisor
      if (equipoSupervisor.some(m => m.id === memberId)) {
        showMessage('error', 'Este miembro ya está en Equipo Supervisor')
        return
      }
      const newOtros = equipoOtrosAspectos.filter(m => m.id !== memberId)
      const newSupervisor = [...equipoSupervisor, member]
      setEquipoOtrosAspectos(newOtros)
      setEquipoSupervisor(newSupervisor)
      saveToStorage('otros', newOtros)
      saveToStorage('supervisor', newSupervisor)
      showMessage('success', 'Movido a Equipo Supervisor')
    }
  }

  // Filtrar miembros disponibles
  const filteredMembers = availableMembers.filter(m =>
    m.apellidos_nombres.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Componente de tabla reutilizable
  const TeamTable = ({ title, data, tableType, emptyMessage }) => (
    <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
          {title}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
            ({data.length})
          </span>
        </h3>
      </div>

      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 pink:bg-pink-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase">
                  N.°
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase">
                  Apellidos y Nombres
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase">
                  DNI
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase">
                  N.° Colegiatura
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 pink:text-slate-600 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-200">
              {data.map((member, index) => (
                <tr
                  key={member.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
                    {member.apellidos_nombres}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                    {member.dni || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                    {member.num_colegiatura || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleMoveMember(tableType, member.id)}
                        className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 pink:hover:bg-blue-100 transition-colors"
                        title={tableType === 'supervisor' ? 'Mover a Otros Aspectos' : 'Mover a Equipo Supervisor'}
                      >
                        <ArrowRight className={`w-4 h-4 text-blue-600 dark:text-blue-400 ${tableType === 'otros' ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(tableType, member.id)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
          Personal y Equipo
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
          Selecciona los miembros del equipo supervisor para esta acta
        </p>
      </div>

      {/* Mensaje de feedback */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${message.type === 'error'
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
      )}

      {/* Selector de miembros */}
      <div className="bg-slate-50 dark:bg-slate-800/50 pink:bg-pink-50/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 pink:border-pink-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Selector de tabla destino */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 pink:text-slate-600 mb-1.5 uppercase">
              Agregar a
            </label>
            <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 pink:border-pink-300">
              <button
                onClick={() => setActiveTable('supervisor')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTable === 'supervisor'
                  ? 'bg-primary-600 pink:bg-pink-600 text-white'
                  : 'bg-white dark:bg-slate-700 pink:bg-white text-slate-700 dark:text-slate-300 pink:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 pink:hover:bg-pink-100'
                  }`}
              >
                Equipo Supervisor
              </button>
              <button
                onClick={() => setActiveTable('otros')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTable === 'otros'
                  ? 'bg-primary-600 pink:bg-pink-600 text-white'
                  : 'bg-white dark:bg-slate-700 pink:bg-white text-slate-700 dark:text-slate-300 pink:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 pink:hover:bg-pink-100'
                  }`}
              >
                Otros Aspectos
              </button>
            </div>
          </div>

          {/* Dropdown de búsqueda */}
          <div className="flex-1 relative" ref={dropdownRef}>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 pink:text-slate-600 mb-1.5 uppercase">
              Buscar miembro
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setDropdownOpen(true)
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Buscar por apellidos y nombres..."
                className="w-full pl-10 pr-10 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
              />
              {loadingMembers ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <ChevronDown
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              )}
            </div>

            {/* Dropdown de resultados */}
            {dropdownOpen && !loadingMembers && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-600 pink:border-pink-300 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                {filteredMembers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                    {searchQuery ? 'No se encontraron resultados' : 'No hay miembros disponibles'}
                  </div>
                ) : (
                  filteredMembers.map((member) => {
                    const inSupervisor = equipoSupervisor.some(m => m.id === member.id)
                    const inOtros = equipoOtrosAspectos.some(m => m.id === member.id)
                    const isAlreadyInAnyTable = inSupervisor || inOtros

                    return (
                      <button
                        key={member.id}
                        onClick={() => handleAddMember(member)}
                        disabled={isAlreadyInAnyTable}
                        className={`
                          w-full flex items-center justify-between px-4 py-3 text-left transition-colors
                          ${isAlreadyInAnyTable
                            ? 'bg-slate-50 dark:bg-slate-700/50 opacity-50 cursor-not-allowed'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50'
                          }
                        `}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a] truncate">
                            {member.apellidos_nombres}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b] flex gap-3">
                            {member.dni && <span>DNI: {member.dni}</span>}
                            {member.num_colegiatura && <span>{member.num_colegiatura}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {inSupervisor && (
                            <span className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              Supervisor
                            </span>
                          )}
                          {inOtros && (
                            <span className="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              Otros
                            </span>
                          )}
                          {!isAlreadyInAnyTable && (
                            <UserPlus className="w-4 h-4 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tablas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TeamTable
          title="Equipo Supervisor"
          data={equipoSupervisor}
          tableType="supervisor"
          emptyMessage="Agrega miembros al equipo supervisor"
        />
        <TeamTable
          title="Equipo Supervisor en Otros Aspectos"
          data={equipoOtrosAspectos}
          tableType="otros"
          emptyMessage="Agrega miembros para otros aspectos"
        />
      </div>

      {/* Sección: Cantidad de firmas del Personal del Administrado */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 pink:bg-amber-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-amber-600 dark:text-amber-400 pink:text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Personal del Administrado
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
              Define la cantidad de espacios para firma del personal del administrado en el acta
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
            Cantidad de espacios para firma:
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={cantidadFirmasAdministrado}
            onChange={handleCantidadFirmasChange}
            className="w-20 px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-center focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
            (mín. 1, máx. 10)
          </span>
        </div>
        
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 pink:text-slate-400">
          Estos espacios aparecerán en la Sección 8 del acta exportada con campos para Apellidos y Nombres, DNI y Cargo.
        </p>
      </div>

      {/* Sección: Cantidad de firmas de Otros Participantes (Peritos, etc.) */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 pink:bg-purple-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600 dark:text-purple-400 pink:text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white pink:text-[#0f172a]">
              Otros Participantes
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
              Define la cantidad de espacios para firma de peritos, técnicos, testigos, fiscales, etc.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
            Cantidad de espacios para firma:
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={cantidadFirmasOtrosParticipantes}
            onChange={handleCantidadFirmasOtrosChange}
            className="w-20 px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-slate-900 text-center focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
            (mín. 1, máx. 10)
          </span>
        </div>
        
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 pink:text-slate-400">
          Estos espacios aparecerán en la Sección 10 del acta exportada con campos para Apellidos y Nombres, DNI y Cargo.
        </p>
      </div>

      {/* Nota informativa */}
      <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50 border border-blue-200 dark:border-blue-800 pink:border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300 pink:text-blue-700">
          <strong>Nota:</strong> Los datos del equipo se guardan automáticamente en tu navegador.
          Puedes mover miembros entre tablas usando el botón de flecha, o eliminarlos con el botón de papelera.
        </p>
      </div>
    </div>
  )
}

export default PersonalEquipoSection
