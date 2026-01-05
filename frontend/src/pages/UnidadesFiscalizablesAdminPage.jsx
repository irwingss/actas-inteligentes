import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../hooks/useDarkMode'
import { ThemeToggle } from '../components/ThemeToggle'
import api from '../lib/axios'
import { 
  ArrowLeft, 
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
  Building2,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  Database,
  Cloud
} from 'lucide-react'

export default function UnidadesFiscalizablesAdminPage() {
  const navigate = useNavigate()
  const { isSuperAdmin, loading: authLoading } = useAuth()
  const [theme, cycleTheme] = useTheme()
  const fileInputRef = useRef(null)
  
  // Estados
  const [stats, setStats] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  // Verificar permisos
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/')
    }
  }, [authLoading, isSuperAdmin, navigate])

  // Cargar estadísticas y estado de sincronización
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      const [statsResponse, syncResponse] = await Promise.all([
        api.get('/api/uf/stats/summary'),
        api.get('/api/uf/sync-status').catch(() => ({ data: { status: null } }))
      ])
      setStats(statsResponse.data.stats)
      setSyncStatus(syncResponse.data.status)
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats({ total: 0, lastUpdate: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchStats()
    }
  }, [authLoading, isSuperAdmin, fetchStats])

  // Mostrar mensaje temporal
  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  // Manejar selección de archivo
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        showMessage('error', 'Por favor selecciona un archivo Excel (.xlsx o .xls)')
        return
      }
      setSelectedFile(file)
    }
  }

  // Descargar Excel desde Supabase
  const handleDownload = async () => {
    try {
      setDownloading(true)
      const response = await api.get('/api/uf/download', {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Unidades_Fiscalizables_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      showMessage('success', 'Archivo descargado correctamente')
    } catch (error) {
      console.error('Error downloading:', error)
      showMessage('error', error.response?.data?.error || 'Error al descargar el archivo')
    } finally {
      setDownloading(false)
    }
  }

  // Subir archivo
  const handleUpload = async () => {
    if (!selectedFile) {
      showMessage('error', 'Por favor selecciona un archivo primero')
      return
    }

    try {
      setUploading(true)
      
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await api.post('/api/uf/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      // Mostrar mensaje según resultado de Supabase
      if (response.data.supabaseError) {
        showMessage('error', `${response.data.message}`)
      } else {
        showMessage('success', response.data.message)
      }
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      fetchStats()
    } catch (error) {
      console.error('Error uploading file:', error)
      showMessage('error', error.response?.data?.error || 'Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  // Eliminar todos los datos
  const handleDeleteAll = async () => {
    if (!window.confirm('¿Estás seguro de eliminar TODAS las unidades fiscalizables? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      setLoading(true)
      const response = await api.delete('/api/uf/all')
      showMessage('success', response.data.message)
      fetchStats()
    } catch (error) {
      console.error('Error deleting all:', error)
      showMessage('error', 'Error al eliminar los datos')
    } finally {
      setLoading(false)
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
              <Building2 className="w-6 h-6 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                Unidades Fiscalizables
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
              title="Actualizar estadísticas"
            >
              <RefreshCw className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <ThemeToggle theme={theme} cycleTheme={cycleTheme} />
          </div>
        </div>
      </header>

      {/* Mensaje */}
      {message && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
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
        <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50 border border-blue-200 dark:border-blue-800 pink:border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300 pink:text-blue-700">
            <strong>Base de datos de Unidades Fiscalizables:</strong> Sube un archivo Excel (.xlsx) con la información de 
            administrados y sus unidades fiscalizables. Los datos se sincronizan a Supabase y se descargan automáticamente 
            a cada usuario al abrir la aplicación. Al crear una nueva acta, los usuarios podrán buscar 
            y autocompletar la información del administrado.
          </p>
        </div>

        {/* Estado de sincronización */}
        {syncStatus && (
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
              Estado de Sincronización
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white pink:text-slate-900">
                  {syncStatus.local?.total?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600">
                  Registros Locales
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white pink:text-slate-900">
                  {syncStatus.supabase?.total?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600">
                  Registros en Supabase
                </div>
              </div>
            </div>
            
            {syncStatus.supabase?.lastSync && (
              <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                <strong>Última sincronización:</strong>{' '}
                {new Date(syncStatus.supabase.lastSync).toLocaleDateString('es-PE', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                  timeZone: 'America/Lima'
                })}
                {syncStatus.supabase.lastFile && (
                  <span className="ml-2">({syncStatus.supabase.lastFile})</span>
                )}
              </div>
            )}
            
            {syncStatus.needsSync && (
              <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm">
                ⚠️ Los datos locales no coinciden con Supabase. Los usuarios sincronizarán al abrir la app.
              </div>
            )}
          </div>
        )}

        {/* Estadísticas */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
            Estado Actual
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900 dark:text-white pink:text-slate-900">
                {stats?.total?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600">
                Unidades Fiscalizables
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 pink:bg-slate-50 rounded-lg p-4">
              <div className="text-lg font-medium text-slate-900 dark:text-white pink:text-slate-900">
                {stats?.lastUpdate 
                  ? new Date(stats.lastUpdate).toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Lima'
                    })
                  : 'Nunca'
                }
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-slate-600">
                Última Actualización
              </div>
            </div>
          </div>
        </div>

        {/* Subir archivo */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary-600 dark:text-primary-400 pink:text-pink-600" />
            Gestión de Excel
          </h2>

          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 pink:bg-amber-50 border border-amber-200 dark:border-amber-800 pink:border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300 pink:text-amber-700">
                <strong>Importante:</strong> Al subir un nuevo Excel, se reemplazarán TODOS los datos existentes 
                tanto en local como en Supabase. El archivo debe ser formato .xlsx con headers en fila 1 y la columna 
                <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded mx-1">unidad_fiscalizable</code>.
              </p>
            </div>

            {/* Botón de descarga */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? 'Descargando...' : 'Descargar Excel de Supabase'}
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {syncStatus?.supabase?.total != null 
                  ? `${syncStatus.supabase.total.toLocaleString()} registros en Supabase` 
                  : 'Verificando datos...'}
              </span>
            </div>

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* Subir archivo */}
            <div className="flex flex-col gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="excel-upload"
              />
              
              {/* Área de selección de archivo */}
              <label
                htmlFor="excel-upload"
                className={`flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                  selectedFile 
                    ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20 pink:bg-green-50 pink:border-green-400' 
                    : 'border-slate-300 dark:border-slate-600 pink:border-pink-300 hover:border-primary-400 dark:hover:border-primary-500 pink:hover:border-pink-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50'
                }`}
              >
                {selectedFile ? (
                  <>
                    <CheckCircle className="w-8 h-8 text-green-500 dark:text-green-400" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-green-700 dark:text-green-300 pink:text-green-700">
                        Archivo seleccionado:
                      </span>
                      <span className="text-green-600 dark:text-green-400 pink:text-green-600 text-sm">
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-slate-400 dark:text-slate-500 pink:text-slate-400" />
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700">
                        Haz clic para seleccionar un archivo Excel
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 pink:text-slate-500 text-sm">
                        Formatos soportados: .xlsx, .xls
                      </span>
                    </div>
                  </>
                )}
              </label>

              {/* Botones de acción cuando hay archivo seleccionado */}
              {selectedFile && (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 pink:bg-green-50 rounded-lg border border-green-200 dark:border-green-800">
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {uploading ? 'Sincronizando...' : 'Subir y Sincronizar'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    disabled={uploading}
                    className="px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
                    Los datos actuales serán reemplazados
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columnas esperadas */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] mb-4">
            Columnas del Excel (Headers en Fila 1)
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {[
              { name: 'unidad_fiscalizable', required: true },
              { name: 'razon_social', required: false },
              { name: 'ruc', required: false },
              { name: 'admin_codigo', required: false },
              { name: 'tipo_doc', required: false },
              { name: 'dpto_razon_social', required: false },
              { name: 'prov_razon_social', required: false },
              { name: 'dist_razon_social', required: false },
              { name: 'dpto_ejecucion', required: false },
              { name: 'prov_ejecucion', required: false },
              { name: 'dist_ejecucion', required: false },
              { name: 'admin_direccion', required: false },
              { name: 'competencia', required: false },
              { name: 'actividad', required: false },
              { name: 'sector', required: false },
              { name: 'subsector', required: false },
              { name: 'codigo_antiguo', required: false },
              { name: 'codigo_nuevo', required: false },
              { name: 'admin_estado', required: false },
              { name: 'estad_uf', required: false },
              { name: 'direccion_ref', required: false },
            ].map(col => (
              <div 
                key={col.name}
                className={`px-2 py-1 rounded ${
                  col.required 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <code className="text-xs">{col.name}</code>
                {col.required && <span className="ml-1 text-xs">*</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            * Columna requerida. Headers en fila 1, datos desde fila 2.
          </p>
        </div>

        {/* Zona de peligro */}
        {stats?.total > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 pink:bg-red-50 rounded-xl border border-red-200 dark:border-red-800 pink:border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 pink:text-red-700 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Zona de Peligro
            </h2>
            <p className="text-sm text-red-600 dark:text-red-400 pink:text-red-600 mb-4">
              Esta acción eliminará permanentemente todas las unidades fiscalizables de la base de datos.
            </p>
            <button
              onClick={handleDeleteAll}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar Todos los Datos
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
