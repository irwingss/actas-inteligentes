import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../lib/axios';
import { 
  Users, Shield, ShieldCheck, UserCog, CheckCircle, XCircle, 
  Plus, Trash2, AlertCircle, Loader2, ArrowLeft, Key, Search, X, Settings, Paperclip, Building2, ListChecks
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useDarkMode';

export default function AdminPanel() {
  const { profile, getAuthToken, isAdmin, isSuperAdmin } = useAuth();
  const [theme, cycleTheme] = useTheme();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newCACode, setNewCACode] = useState('');
  const [newCANotes, setNewCANotes] = useState('');
  const [stats, setStats] = useState(null);
  const [caSearchQuery, setCASearchQuery] = useState('');
  const [caSearchResults, setCASearchResults] = useState([]);
  const [showCADropdown, setShowCADropdown] = useState(false);
  const [loadingCAs, setLoadingCAs] = useState(false);
  const [caSearchError, setCASearchError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [userCACounts, setUserCACounts] = useState({});
  const caInputRef = useRef(null);
  const caCacheRef = useRef(new Map());
  const caSearchTimeoutRef = useRef(null);
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchUsers();
    fetchStats();
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const response = await api.get(`${API_URL}/api/admin/users`);
      const usersData = response.data.users;
      setUsers(usersData);
      
      // Cargar conteo de CAs para usuarios regulares
      const counts = {};
      await Promise.all(
        usersData
          .filter(user => user.role === 'user')
          .map(async (user) => {
            try {
              const permResponse = await api.get(`${API_URL}/api/admin/users/${user.id}/permissions`);
              counts[user.id] = permResponse.data.permissions.length;
            } catch (err) {
              counts[user.id] = 0;
            }
          })
      );
      setUserCACounts(counts);
      setLoading(false);
    } catch (err) {
      setError('Error al cargar usuarios');
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get(`${API_URL}/api/admin/stats`);
      setStats(response.data.stats);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Búsqueda de CAs con debounce
  useEffect(() => {
    const searchQuery = caSearchQuery.trim();
    
    // Limpiar timeout anterior
    if (caSearchTimeoutRef.current) {
      clearTimeout(caSearchTimeoutRef.current);
    }
    
    // Si la búsqueda es muy corta, limpiar resultados
    if (!searchQuery || searchQuery.length < 2) {
      setCASearchResults([]);
      setCASearchError('');
      setLoadingCAs(false);
      return;
    }
    
    // Buscar con debounce de 300ms
    caSearchTimeoutRef.current = setTimeout(async () => {
      setLoadingCAs(true);
      setCASearchError('');
      
      try {
        const key = searchQuery.toLowerCase();
        
        // Verificar caché
        if (caCacheRef.current.has(key)) {
          setCASearchResults(caCacheRef.current.get(key));
          setLoadingCAs(false);
          return;
        }
        
        // Hacer petición al servidor
        const response = await api.get(`${API_URL}/api/s123/codigo-accion-values`, {
          params: { search: searchQuery }
        });
        
        const raw = Array.isArray(response.data.values) ? response.data.values : [];
        const normalized = raw.map((it) => (
          typeof it === 'string' ? { value: it, field: 'Codigo_accion' } : it
        )).filter(it => it && it.value);
        
        // Guardar en caché
        caCacheRef.current.set(key, normalized);
        setCASearchResults(normalized);
      } catch (err) {
        console.error('Error searching CAs:', err);
        setCASearchError('No se pudo obtener resultados. Intenta nuevamente.');
        setCASearchResults([]);
      } finally {
        setLoadingCAs(false);
      }
    }, 300);
    
    return () => {
      if (caSearchTimeoutRef.current) {
        clearTimeout(caSearchTimeoutRef.current);
      }
    };
  }, [caSearchQuery, getAuthToken]);

  const fetchUserPermissions = async (userId) => {
    try {
      const response = await api.get(`${API_URL}/api/admin/users/${userId}/permissions`);
      setUserPermissions(response.data.permissions);
    } catch (err) {
      setError('Error al cargar permisos del usuario');
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setUserPermissions([]);
    if (user.role === 'user') {
      fetchUserPermissions(user.id);
    }
    setError('');
    setSuccess('');
  };

  const handleToggleActive = async (userId, currentStatus) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await api.post(`${API_URL}/api/admin/users/${userId}/activate`, 
        { is_active: !currentStatus }
      );
      
      setSuccess(`Usuario ${!currentStatus ? 'activado' : 'desactivado'} exitosamente`);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, is_active: !currentStatus });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar estado del usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteRole = async (userId, newRole) => {
    if (!isSuperAdmin) {
      setError('Solo superadmins pueden cambiar roles');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await api.post(`${API_URL}/api/admin/users/${userId}/promote`, 
        { role: newRole }
      );
      
      setSuccess(`Rol actualizado exitosamente`);
      await fetchUsers();
      await fetchStats();
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, role: newRole });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar rol');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGrantCAAccess = async () => {
    if (!selectedUser || !newCACode) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await api.post(`${API_URL}/api/admin/users/${selectedUser.id}/permissions`, 
        { ca_code: newCACode, notes: newCANotes }
      );
      
      setSuccess(`Acceso a CA ${newCACode} otorgado exitosamente`);
      setNewCACode('');
      setCASearchQuery('');
      setNewCANotes('');
      setShowCADropdown(false);
      await fetchUserPermissions(selectedUser.id);
      
      // Actualizar conteo de CAs
      setUserCACounts(prev => ({
        ...prev,
        [selectedUser.id]: (prev[selectedUser.id] || 0) + 1
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Error al otorgar permiso');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectCA = (caValue, caField) => {
    setNewCACode(caValue);
    setCASearchQuery(caValue);
    setShowCADropdown(false);
    setCASearchResults([]);
    caInputRef.current?.blur();
  };

  const handleRevokeCAAccess = async (permissionId) => {
    if (!selectedUser) return;

    if (!confirm('¿Estás seguro de revocar este permiso?')) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await api.delete(`${API_URL}/api/admin/users/${selectedUser.id}/permissions/${permissionId}`);
      
      setSuccess('Permiso revocado exitosamente');
      await fetchUserPermissions(selectedUser.id);
      
      // Actualizar conteo de CAs
      setUserCACounts(prev => ({
        ...prev,
        [selectedUser.id]: Math.max(0, (prev[selectedUser.id] || 0) - 1)
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Error al revocar permiso');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDeleteModal = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await api.delete(`${API_URL}/api/admin/users/${userToDelete.id}`);
      
      setSuccess(`Usuario ${userToDelete.email} eliminado exitosamente`);
      handleCloseDeleteModal();
      await fetchUsers();
      await fetchStats();
      if (selectedUser?.id === userToDelete.id) {
        setSelectedUser(null);
        setUserPermissions([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al eliminar usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'superadmin':
        return <span className="px-2 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> SuperAdmin
        </span>;
      case 'admin':
        return <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full flex items-center gap-1">
          <Shield className="w-3 h-3" /> Admin
        </span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-800 rounded-full flex items-center gap-1">
          <Users className="w-3 h-3" /> Usuario
        </span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 pink:text-pink-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 pink:text-white/90 hover:text-slate-900 dark:hover:text-white pink:hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la App
            </button>
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => navigate('/uf-admin')}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 
                             border border-slate-200 dark:border-slate-700 pink:border-pink-300
                             hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-white
                             text-slate-700 dark:text-slate-300 pink:text-slate-700
                             transition-colors shadow-sm hover:shadow-md"
                    title="Unidades Fiscalizables"
                  >
                    <Building2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigate('/anexos-admin')}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 
                             border border-slate-200 dark:border-slate-700 pink:border-pink-300
                             hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-white
                             text-slate-700 dark:text-slate-300 pink:text-slate-700
                             transition-colors shadow-sm hover:shadow-md"
                    title="Gestión de Anexos"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigate('/supervisor-team-admin')}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 
                             border border-slate-200 dark:border-slate-700 pink:border-pink-300
                             hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-white
                             text-slate-700 dark:text-slate-300 pink:text-slate-700
                             transition-colors shadow-sm hover:shadow-md"
                    title="Equipo Supervisor"
                  >
                    <Users className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigate('/requerimientos-admin')}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 
                             border border-slate-200 dark:border-slate-700 pink:border-pink-300
                             hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-white
                             text-slate-700 dark:text-slate-300 pink:text-slate-700
                             transition-colors shadow-sm hover:shadow-md"
                    title="Requerimientos de Información"
                  >
                    <ListChecks className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigate('/configuration')}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 
                             border border-slate-200 dark:border-slate-700 pink:border-pink-300
                             hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-white
                             text-slate-700 dark:text-slate-300 pink:text-slate-700
                             transition-colors shadow-sm hover:shadow-md"
                    title="Configuración Global"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </>
              )}
              <ThemeToggle theme={theme} onToggle={cycleTheme} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white pink:text-white">Panel de Administración</h1>
              <p className="text-slate-600 dark:text-slate-300 pink:text-white/80 mt-1">Gestiona usuarios y permisos</p>
            </div>
            {stats && (
              <div className="flex gap-4">
                <div className="bg-white dark:bg-slate-800 pink:bg-white/95 px-4 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                  <div className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-600">Total Usuarios</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white pink:text-slate-900">{stats.total_users}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 pink:bg-white/95 px-4 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                  <div className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-600">SuperAdmins</div>
                  <div className="text-2xl font-bold text-purple-600">{stats.superadmins}/2</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 pink:bg-red-50/95 border-2 border-red-200 dark:border-red-800 pink:border-red-300 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 pink:text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300 pink:text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 pink:bg-green-50/95 border-2 border-green-200 dark:border-green-800 pink:border-green-300 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 pink:text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300 pink:text-green-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users List */}
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl shadow-lg border-2 border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Usuarios ({users.length})
            </h2>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {users.map(user => (
                <div
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition ${
                    selectedUser?.id === user.id
                      ? 'border-blue-500 dark:border-blue-500 pink:border-pink-500 bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50/95'
                      : 'border-slate-200 dark:border-slate-700 pink:border-pink-200 hover:border-slate-300 dark:hover:border-slate-600 pink:hover:border-pink-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getRoleBadge(user.role)}
                        {user.is_active ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <p className="font-medium text-slate-900 dark:text-white pink:text-slate-900 truncate">{user.email}</p>
                      {user.full_name && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 pink:text-slate-700 truncate">{user.full_name}</p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-600 mt-1">
                        Creado: {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    {/* Badge de conteo de CAs (solo para usuarios regulares) */}
                    {user.role === 'user' && userCACounts[user.id] !== undefined && userCACounts[user.id] > 0 && (
                      <div className="flex-shrink-0">
                        <div className="bg-blue-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow-md">
                          {userCACounts[user.id]}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Details & Permissions */}
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl shadow-lg border-2 border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6">
            {selectedUser ? (
              <>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
                  <UserCog className="w-5 h-5" />
                  Detalles de Usuario
                </h2>

                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50/80 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                  <p className="font-medium text-slate-900 dark:text-white pink:text-slate-900 mb-2">{selectedUser.email}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {getRoleBadge(selectedUser.role)}
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      selectedUser.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedUser.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-4 mb-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-2">Acciones</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleToggleActive(selectedUser.id, selectedUser.is_active)}
                        disabled={actionLoading}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          selectedUser.is_active
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        } disabled:opacity-50`}
                      >
                        {selectedUser.is_active ? 'Desactivar' : 'Activar'}
                      </button>

                      {isSuperAdmin && (
                        <>
                          {/* Promoción a SuperAdmin */}
                          {selectedUser.role !== 'superadmin' && stats?.can_add_superadmin && (
                            <button
                              onClick={() => handlePromoteRole(selectedUser.id, 'superadmin')}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              Promover a SuperAdmin
                            </button>
                          )}
                          
                          {/* Promoción a Admin */}
                          {selectedUser.role === 'user' && (
                            <button
                              onClick={() => handlePromoteRole(selectedUser.id, 'admin')}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <Shield className="w-4 h-4" />
                              Promover a Admin
                            </button>
                          )}
                          
                          {/* Degradación de SuperAdmin a Admin */}
                          {selectedUser.role === 'superadmin' && selectedUser.id !== profile.id && (
                            <>
                              <button
                                onClick={() => handlePromoteRole(selectedUser.id, 'admin')}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
                              >
                                <Shield className="w-4 h-4" />
                                Degradar a Admin
                              </button>
                              <button
                                onClick={() => handlePromoteRole(selectedUser.id, 'user')}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
                              >
                                <Users className="w-4 h-4" />
                                Degradar a Usuario
                              </button>
                            </>
                          )}
                          
                          {/* Degradación de Admin a Usuario */}
                          {selectedUser.role === 'admin' && (
                            <button
                              onClick={() => handlePromoteRole(selectedUser.id, 'user')}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <Users className="w-4 h-4" />
                              Degradar a Usuario
                            </button>
                          )}
                          
                          {/* Mensaje si es el propio superadmin */}
                          {selectedUser.role === 'superadmin' && selectedUser.id === profile.id && (
                            <div className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm">
                              No puedes modificar tu propio rol de SuperAdmin
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delete User Section */}
                  {isSuperAdmin && selectedUser.id !== profile.id && (
                    <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700 pink:border-pink-200">
                      <h3 className="font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-2">Zona de Peligro</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-slate-700 mb-3">
                        {selectedUser.is_active 
                          ? 'Debes desactivar al usuario antes de poder eliminarlo.'
                          : 'Eliminar esta cuenta borrará permanentemente todos sus datos de Supabase.'}
                      </p>
                      <button
                        onClick={() => handleOpenDeleteModal(selectedUser)}
                        disabled={actionLoading || selectedUser.is_active}
                        className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar Usuario
                      </button>
                    </div>
                  )}

                  {/* CA Permissions (for regular users) */}
                  {selectedUser.role === 'user' && (
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white pink:text-slate-900 mb-3 flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        Permisos de CA ({userPermissions.length})
                      </h3>

                      {/* Grant new permission */}
                      <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50/80 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                          Otorgar acceso a nuevo CA
                        </label>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <input
                            ref={caInputRef}
                            type="text"
                            value={caSearchQuery}
                            onChange={(e) => {
                              setCASearchQuery(e.target.value);
                              setNewCACode(e.target.value);
                              setShowCADropdown(true);
                            }}
                            onFocus={() => setShowCADropdown(true)}
                            onBlur={() => setTimeout(() => setShowCADropdown(false), 200)}
                            placeholder="Escribe 2+ caracteres para buscar..."
                            className="w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-900 pink:bg-white rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 pink:focus:ring-pink-500 focus:border-transparent text-sm text-slate-900 dark:text-white pink:text-slate-900"
                          />
                          {loadingCAs ? (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block h-4 w-4 border-2 border-slate-300 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin" aria-label="Buscando" />
                          ) : caSearchQuery ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCASearchQuery('');
                                setNewCACode('');
                                setShowCADropdown(false);
                                setCASearchResults([]);
                                caInputRef.current?.focus();
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                              aria-label="Limpiar búsqueda"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          ) : null}
                          
                          {/* Error de búsqueda */}
                          {caSearchError && showCADropdown && (
                            <div className="absolute z-10 w-full mt-1 p-3 border border-red-200 dark:border-red-800 pink:border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20 pink:bg-red-50/95 shadow-lg">
                              <p className="text-sm text-red-600 dark:text-red-400 pink:text-red-600">{caSearchError}</p>
                            </div>
                          )}
                          
                          {/* Dropdown de resultados */}
                          {showCADropdown && !caSearchError && caSearchResults.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 max-h-60 overflow-auto border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-800 pink:bg-white shadow-lg divide-y divide-slate-200 dark:divide-slate-700 pink:divide-pink-100">
                              {caSearchResults.map((item, index) => {
                                const field = item.field || 'Codigo_accion';
                                const fieldLower = String(field).toLowerCase();
                                const val = String(item.value);
                                return (
                                  <button
                                    key={`${field}|${val}|${index}`}
                                    type="button"
                                    onClick={() => handleSelectCA(val, field)}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 pink:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50 flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{val}</span>
                                    <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${
                                      fieldLower === 'codigo_accion' 
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700' 
                                        : 'bg-slate-50 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}>
                                      {fieldLower === 'codigo_accion' ? 'CA' : 'Otro'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* Mensaje cuando no hay resultados */}
                          {showCADropdown && !loadingCAs && !caSearchError && caSearchQuery.length >= 2 && caSearchResults.length === 0 && (
                            <div className="absolute z-10 w-full mt-1 p-3 border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-800 pink:bg-white shadow-lg">
                              <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600">No se encontraron resultados</p>
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          value={newCANotes}
                          onChange={(e) => setNewCANotes(e.target.value)}
                          placeholder="Notas (opcional)"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 bg-white dark:bg-slate-900 pink:bg-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mb-2 text-slate-900 dark:text-white pink:text-slate-900"
                        />
                        <button
                          onClick={handleGrantCAAccess}
                          disabled={!newCACode || actionLoading}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Otorgar Acceso
                        </button>
                      </div>

                      {/* Permissions list */}
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {userPermissions.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600 text-center py-4">
                            No tiene permisos asignados
                          </p>
                        ) : (
                          userPermissions.map(perm => (
                            <div key={perm.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50/80 rounded-lg border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                              <div className="flex-1">
                                <p className="font-medium text-slate-900 dark:text-white pink:text-slate-900">{perm.ca_code}</p>
                                {perm.notes && (
                                  <p className="text-xs text-slate-600 dark:text-slate-400 pink:text-slate-700">{perm.notes}</p>
                                )}
                                <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-600">
                                  {new Date(perm.granted_at).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() => handleRevokeCAAccess(perm.id)}
                                disabled={actionLoading}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {selectedUser.role !== 'user' && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50/95 rounded-xl border border-blue-200 dark:border-blue-800 pink:border-blue-300">
                      <p className="text-sm text-blue-800 dark:text-blue-300 pink:text-blue-800">
                        {selectedUser.role === 'admin' ? 'Los administradores' : 'Los superadministradores'} tienen acceso automático a todos los CAs.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 pink:text-slate-600">
                <Users className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-500 pink:text-slate-500" />
                <p>Selecciona un usuario para ver sus detalles</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl shadow-2xl max-w-md w-full border-2 border-red-500">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900">
                  Confirmar Eliminación
                </h3>
              </div>
              
              <div className="mb-6">
                <p className="text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-3">
                  ¿Estás seguro de que deseas eliminar permanentemente la cuenta de:
                </p>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 pink:bg-red-50/95 rounded-lg border-2 border-red-200 dark:border-red-800 pink:border-red-300">
                  <p className="font-bold text-red-900 dark:text-red-200 pink:text-red-900 mb-1">
                    {userToDelete.email}
                  </p>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(userToDelete.role)}
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      userToDelete.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {userToDelete.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 pink:bg-yellow-50/95 rounded-lg border border-yellow-200 dark:border-yellow-800 pink:border-yellow-300">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 pink:text-yellow-800 font-medium">
                    ⚠️ Esta acción es irreversible
                  </p>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-400 pink:text-yellow-700 mt-2 space-y-1 list-disc list-inside">
                    <li>Se eliminará el perfil del usuario</li>
                    <li>Se eliminarán todos sus permisos de CA</li>
                    <li>Se eliminará su cuenta de Supabase Auth</li>
                    <li>Esta acción quedará registrada en el audit log</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCloseDeleteModal}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 pink:bg-slate-200 text-slate-700 dark:text-slate-300 pink:text-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 pink:hover:bg-slate-300 rounded-lg font-medium transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Eliminar Definitivamente
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
