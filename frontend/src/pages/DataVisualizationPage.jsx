import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import api from '../lib/axios'
import { Download, Filter, X, Calendar, Settings, Zap, RefreshCw, Loader2, Database, Cloud } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { SupervisionSearch } from '../components/SupervisionSearch'
import { JobProgress } from '../components/JobProgress'
import { DataPreview } from '../components/DataPreview'
import { MapView } from '../components/MapView'
import { CacheCheckSkeleton } from '../components/LoadingStages'

// La configuración de baseURL ya está en lib/axios.js

export const DataVisualizationPage = ({ onBack }) => {

  // Estados principales
  const [selectedCodigoAccion, setSelectedCodigoAccion] = useState('')
  const [whereClause, setWhereClause] = useState('')
  const [jobId, setJobId] = useState('')
  const [jobCompleted, setJobCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(null)
  const [hasCachedData, setHasCachedData] = useState(false)
  const [checkingCache, setCheckingCache] = useState(false)
  const [forceSync, setForceSync] = useState(false)

  // Cargar CA pre-seleccionado desde ChatAI
  useEffect(() => {
    const preselectedCA = localStorage.getItem('preselectedCA');
    if (preselectedCA) {
      setSelectedCodigoAccion(preselectedCA);
      localStorage.removeItem('preselectedCA'); // Limpiar después de usar
    }
  }, []);

  // Datos para el mapa
  const [filteredRecords, setFilteredRecords] = useState([])
  const [selectedGlobalId, setSelectedGlobalId] = useState(null)

  // Filtros
  // Filtros dinámicos
  // Filtros dinámicos
  const [filterOptions, setFilterOptions] = useState({
    supervisor: [],
    componente: [],
    tipo_componente: [],
    actividad: [],
    instalacion_referencia: [],
    hecho_detectado: []
  });

  // Search text for each filter dropdown
  const [filterSearchText, setFilterSearchText] = useState({
    supervisor: '',
    componente: '',
    tipo_componente: '',
    actividad: '',
    instalacion_referencia: '',
    hecho_detectado: ''
  });

  const [filterLoading, setFilterLoading] = useState({
    supervisor: false,
    componente: false,
    tipo_componente: false,
    actividad: false,
    instalacion_referencia: false,
    hecho_detectado: false
  });

  const [filtersSelected, setFiltersSelected] = useState({
    supervisor: [],
    componente: [],
    tipo_componente: [],
    actividad: [],
    instalacion_referencia: [],
    hecho_detectado: []
  });

  const [filtersOpen, setFiltersOpen] = useState({
    supervisor: false,
    componente: false,
    tipo_componente: false,
    actividad: false,
    instalacion_referencia: false,
    hecho_detectado: false
  });

  // ZIP export config
  const [zipOrder, setZipOrder] = useState(['fecha', 'componente', 'nombre_supervisor', 'actividad', 'hecho_detec_1'])
  const [zipInclude, setZipInclude] = useState({ componente: true, fecha: true, nombre_supervisor: false, actividad: false, hecho_detec_1: false })
  const [zipConfigOpen, setZipConfigOpen] = useState(false)
  const zipConfigRef = useRef(null)
  const [zipDownloading, setZipDownloading] = useState(false)
  const [filteredDownloading, setFilteredDownloading] = useState(false)
  const [rawDownloading, setRawDownloading] = useState(false)

  // Date picker
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerRef = useRef(null)

  // Filtros avanzados
  const [advancedActive, setAdvancedActive] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtering, setFiltering] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)

  // Refs for dropdowns
  const filterRefs = {
    supervisor: useRef(null),
    componente: useRef(null),
    tipo_componente: useRef(null),
    actividad: useRef(null),
    instalacion_referencia: useRef(null),
    hecho_detectado: useRef(null)
  };

  // Fetch filter options generic function
  const fetchFilterOptions = useCallback((field) => {
    if (!selectedCodigoAccion) return;

    setFilterLoading(prev => ({ ...prev, [field]: true }));

    // Use generic endpoint for ALL filters to ensure consistency with SQLite data
    api.get(`/api/s123/unique-values/${encodeURIComponent(selectedCodigoAccion)}/${field}`)
      .then(({ data }) => {
        const opts = Array.isArray(data?.values) ? data.values : [];
        setFilterOptions(prev => ({ ...prev, [field]: opts }));
      })
      .catch(err => {
        console.error(`Error fetching options for ${field}:`, err);
        setFilterOptions(prev => ({ ...prev, [field]: [] }));
      })
      .finally(() => {
        setFilterLoading(prev => ({ ...prev, [field]: false }));
      });
  }, [selectedCodigoAccion]);

  // Load all filter options when CA is selected
  useEffect(() => {
    if (selectedCodigoAccion) {
      const fields = [
        'supervisor',
        'componente',
        'tipo_componente',
        'actividad',
        'instalacion_referencia',
        'hecho_detectado'
      ];
      fields.forEach(field => fetchFilterOptions(field));
    } else {
      // Reset options if no CA selected
      setFilterOptions({
        supervisor: [],
        componente: [],
        tipo_componente: [],
        actividad: [],
        instalacion_referencia: [],
        hecho_detectado: []
      });
    }
  }, [selectedCodigoAccion, fetchFilterOptions]);

  // Close dropdowns on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      Object.keys(filtersOpen).forEach(key => {
        if (filtersOpen[key] && filterRefs[key].current && !filterRefs[key].current.contains(e.target)) {
          setFiltersOpen(prev => ({ ...prev, [key]: false }));
        }
      });

      if (zipConfigOpen && zipConfigRef.current && !zipConfigRef.current.contains(e.target)) {
        setZipConfigOpen(false)
      }
      if (datePickerOpen && datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setDatePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [filtersOpen, zipConfigOpen, datePickerOpen])

  // Handlers
  const checkCacheStatus = useCallback(async (codigo) => {
    if (!codigo) return;
    setCheckingCache(true);
    try {
      const { data } = await api.get(`/api/s123/cache-info/${encodeURIComponent(codigo)}`);
      setCacheInfo(data);
      setHasCachedData(data.exists);
      setFromCache(data.exists && !data.needsSync);
    } catch (err) {
      console.error('Error checking cache:', err);
    } finally {
      setCheckingCache(false);
    }
  }, []);

  const handleSearchSelect = (item) => {
    setSelectedCodigoAccion(item.CA)
    // Reset filters
    setFiltersSelected({
      supervisor: [],
      componente: [],
      tipo_componente: [],
      actividad: [],
      instalacion_referencia: [],
      hecho_detectado: []
    });
    setFilteredRecords([])
    setJobId('')
    setJobCompleted(false)
    checkCacheStatus(item.CA);
  }

  const fetchJobStatus = useCallback((id) => {
    api.get(`/api/s123/status/${encodeURIComponent(id)}`)
      .then(({ data }) => {
        if (data.status === 'completed') {
          setJobCompleted(true)
          setLoading(false)
          // Auto-apply empty filters to get all records
          applyFilters(id, {})
        } else if (data.status === 'error') {
          setLoading(false)
          setError(data.error || 'Error en el proceso')
        } else {
          setTimeout(() => fetchJobStatus(id), 2000)
        }
      })
      .catch((err) => {
        setLoading(false)
        setError('Error consultando estado del job')
      })
  }, [])

  const startFetch = () => {
    if (!selectedCodigoAccion) return
    setLoading(true)
    setError(null)
    setJobCompleted(false)
    setFilteredRecords([])

    // Use fetch-cached endpoint
    api.post('/api/s123/fetch-cached', {
      codigoAccion: selectedCodigoAccion,
      force: forceSync
    })
      .then(({ data }) => {
        setJobId(data.jobId)
        fetchJobStatus(data.jobId)
      })
      .catch((err) => {
        setLoading(false)
        setError(err.response?.data?.error || 'Error al iniciar carga')
      })
  }

  const applyFilters = (jid, currentFilters = filtersSelected) => {
    if (!jid) return
    setFiltering(true)

    // Prepare params from new state structure
    const params = {
      jobId: jid,
      dateFrom,
      dateTo,
      supervisor: currentFilters.supervisor?.[0] || '',
      tipo_de_reporte: currentFilters.tipo_de_reporte?.[0] || '',
      subcomponente: currentFilters.subcomponente?.[0] || '',
      componente: currentFilters.componente?.[0] || '',
      tipo_componente: currentFilters.tipo_componente?.[0] || '',
      actividad: currentFilters.actividad?.[0] || '',
      instalacion_referencia: currentFilters.instalacion_referencia?.[0] || '',
      hecho_detectado: currentFilters.hecho_detectado?.[0] || ''
    }

    api.post('/api/s123/apply-filters', params)
      .then(({ data }) => {
        setApplyResult(data)
        setFilteredRecords(data.records || [])
        setPreviewRefreshKey(k => k + 1)
      })
      .catch((err) => {
        console.error('Error applying filters:', err)
      })
      .finally(() => {
        setFiltering(false)
      })
  }

  const handleStartFetch = async () => {
    if (!selectedCodigoAccion && !whereClause) {
      console.warn('[handleStartFetch] Intento de fetch sin CA ni WHERE');
      setError('Seleccione un Código de acción (Codigo_accion) o escriba un WHERE.')
      return
    }
    console.log('[handleStartFetch] Iniciando fetch...', { selectedCodigoAccion, whereClause, forceSync });
    setLoading(true)
    setError(null)
    setJobCompleted(false)
    setFromCache(false)
    try {
      let payload;
      // Priorizar código de acción sobre WHERE clause
      if (selectedCodigoAccion) {
        // Código de acción usa caché inteligente
        console.log('[handleStartFetch] Usando endpoint con caché para código:', selectedCodigoAccion);
        payload = { codigoAccion: selectedCodigoAccion, force: forceSync };
        const { data } = await api.post('/api/s123/fetch-cached', payload);
        console.log('[handleStartFetch] JobId recibido del backend:', data.jobId);
        setJobId(data.jobId);
        setFromCache(data.cached || false);
      } else if (whereClause) {
        // WHERE clause personalizado no usa caché
        console.log('[handleStartFetch] Usando endpoint sin caché para WHERE');
        payload = { where: whereClause };
        const { data } = await api.post('/api/s123/fetch', payload);
        setJobId(data.jobId);
        setFromCache(false);
      }
    } catch (e) {
      console.error('[handleStartFetch] Error:', e);
      setError(e?.response?.data?.error || e?.message || 'Error al iniciar la obtención de datos')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAdvanced = () => {
    setAdvancedActive((prev) => {
      const next = !prev
      if (next) {
        setFiltersSelected({
          supervisor: [],
          componente: [],
          tipo_componente: [],
          actividad: [],
          instalacion_referencia: [],
          hecho_detectado: []
        });
        setDateFrom('')
        setDateTo('')
        setDatePickerOpen(false)
      }
      return next
    })
  }

  const handleApplyFilters = async () => {
    if (!jobId) {
      setError('No hay un job activo. Primero ejecuta "Obtener datos".')
      return
    }
    setFiltering(true)
    setError(null)
    try {
      const useAdvanced = advancedActive && Array.isArray(advancedFilters) && advancedFilters.length > 0
      // TODO: Add advanced validation logic if needed
      const advValidation = { valid: true, message: '' };

      if (useAdvanced && !advValidation.valid) {
        setFiltering(false)
        setError(advValidation.message || 'Filtro avanzado inválido.')
        return
      }

      // For now, basic filters only in this implementation plan scope unless advanced is fully restored
      // But we kept the UI for advanced, so we should support it if possible.
      // Assuming advancedFilters structure is compatible with backend if implemented.

      const payload = {
        jobId,
        supervisors: filtersSelected.supervisor,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        tipoDeReporte: undefined, // Obsolete
        subcomponente: undefined, // Obsolete
        componente: filtersSelected.componente,
        tipoComponente: filtersSelected.tipo_componente,
        actividad: filtersSelected.actividad,
        instalacionReferencia: filtersSelected.instalacion_referencia,
        hechoDetectado: filtersSelected.hecho_detectado,
        advanced: advancedActive,
        advancedFilters: advancedFilters
      };
      const { data } = await api.post('/api/s123/apply-filters', payload)
      setApplyResult({ total: data.total || 0, filtered: data.filtered || 0 })
      setPreviewRefreshKey((k) => k + 1)

      // Cargar registros filtrados completos para el mapa
      try {
        const recordsResp = await api.post('/api/s123/filtered-records', payload)
        setFilteredRecords(recordsResp.data.records || [])
      } catch (err) {
        console.warn('[handleApplyFilters] Error cargando registros para mapa:', err)
        setFilteredRecords([])
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Error al aplicar filtros')
    } finally {
      setFiltering(false)
    }
  }

  const handleDownloadFilteredTable = async () => {
    if (!jobId) {
      setError('No hay un job activo. Primero ejecuta "Obtener datos".')
      return
    }
    setError(null)
    setFilteredDownloading(true)
    try {
      await handleApplyFilters()
      const response = await api.get(`/api/s123/filtered-excel/${encodeURIComponent(jobId)}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const base = sanitizeFilenameBase(selectedCodigoAccion || 'tabla_filtrada')
      const ts = buildTimestamp()
      link.setAttribute('download', `${base}_${ts}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error descargando tabla filtrada:', err)
      if (err.response && err.response.data instanceof Blob && err.response.data.type === 'application/json') {
        try {
          const txt = await err.response.data.text()
          const j = JSON.parse(txt)
          setError(j?.error || j?.message || 'No se pudo descargar la tabla filtrada.')
        } catch (_) {
          setError('No se pudo descargar la tabla filtrada.')
        }
      } else {
        setError(err?.message || 'No se pudo descargar la tabla filtrada.')
      }
    } finally {
      setFilteredDownloading(false)
    }
  }

  const handleDownloadPhotosZip = async () => {
    if (!jobId) {
      setError('No hay un job activo. Primero ejecuta "Obtener datos".')
      return
    }
    if (!jobCompleted) {
      setError('El job aún no finaliza. Espera a que termine la descarga de datos y adjuntos.')
      return
    }
    setError(null)
    setZipDownloading(true)
    try {
      const orderToSend = zipOrder.filter((f) => zipInclude[f])
      const payload = { jobId, order: orderToSend }
      const resp = await api.post('/api/s123/photos-zip', payload, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([resp.data]))
      const link = document.createElement('a')
      link.href = url
      const base = sanitizeFilenameBase(selectedCodigoAccion || 'fotografias')
      const ts = buildTimestamp()
      link.setAttribute('download', `${base}_${ts}.zip`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error descargando ZIP de fotografías:', err)
      if (err?.response?.data instanceof Blob && err.response.data.type === 'application/json') {
        try {
          const txt = await err.response.data.text()
          const j = JSON.parse(txt)
          setError(j?.error || j?.message || 'Error al generar ZIP.')
        } catch (_) {
          setError('Error al generar ZIP. Respuesta del servidor no válida.')
        }
      } else {
        setError(err?.message || 'Error al generar ZIP.')
      }
    } finally {
      setZipDownloading(false)
    }
  }

  const moveZipField = (idx, dir) => {
    setZipOrder((prev) => {
      const arr = [...prev]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return arr
      const tmp = arr[idx]
      arr[idx] = arr[j]
      arr[j] = tmp
      return arr
    })
  }

  // Helpers
  const sanitizeFilenameBase = (str) => {
    return str.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  }

  const buildTimestamp = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const H = String(now.getHours()).padStart(2, '0')
    const M = String(now.getMinutes()).padStart(2, '0')
    return `${y}${m}${d}_${H}${M}`
  }

  const ymdToDateLocal = (ymd) => {
    if (!ymd) return undefined
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const toYMD = (dateObj) => {
    if (!dateObj) return ''
    const y = dateObj.getFullYear()
    const m = String(dateObj.getMonth() + 1).padStart(2, '0')
    const d = String(dateObj.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const formatRangeLabel = (f, t) => {
    if (!f && !t) return 'Seleccionar fechas'
    if (f && !t) return `Desde ${f}`
    if (!f && t) return `Hasta ${t}`
    return `${f} - ${t}`
  }

  // Advanced filters helpers (placeholders if not fully implemented)
  const addAdvancedSupervisor = () => {
    setAdvancedFilters(prev => [...prev, { supervisor: '', ranges: [{ id: Date.now(), date: '', from: '', to: '' }] }])
  }

  const removeAdvancedSupervisor = (idx) => {
    setAdvancedFilters(prev => prev.filter((_, i) => i !== idx))
  }

  const updateAdvancedSupervisor = (idx, val) => {
    setAdvancedFilters(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], supervisor: val }
      return next
    })
  }

  const addAdvancedRange = (gIdx) => {
    setAdvancedFilters(prev => {
      const next = [...prev]
      next[gIdx].ranges.push({ id: Date.now(), date: '', from: '', to: '' })
      return next
    })
  }

  const removeAdvancedRange = (gIdx, rId) => {
    setAdvancedFilters(prev => {
      const next = [...prev]
      next[gIdx].ranges = next[gIdx].ranges.filter(r => r.id !== rId)
      return next
    })
  }

  const updateAdvancedRange = (gIdx, rId, field, val) => {
    setAdvancedFilters(prev => {
      const next = [...prev]
      const rIdx = next[gIdx].ranges.findIndex(r => r.id === rId)
      if (rIdx >= 0) {
        next[gIdx].ranges[rIdx][field] = val
      }
      return next
    })
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main Content */}
      <main className="flex-1 px-6 py-8 bg-slate-50 dark:bg-slate-900 pink:bg-transparent">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Page Title */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 pink:text-[var(--text-secondary)] mb-2">
              1. Descargar y Visualizar datos de un Código de Acción (CA)
            </h2>
            <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
              Obtén los datos de un CA desde la nube. Es indispensable hacerlo antes de crear un acta.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 pink:bg-white/95 border-l-4 border-red-500 pink:border-red-600 text-red-700 dark:text-red-400 pink:text-red-700 p-4 rounded-r-lg shadow-md" role="alert">
              <div className="flex items-start">
                <X className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-700 dark:text-red-400 pink:text-red-700 hover:text-red-900 dark:hover:text-red-300 pink:hover:text-red-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Search Section */}
          <div className="bg-white dark:bg-slate-800 pink:bg-white/95 pink:backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-6">
            <SupervisionSearch onSelected={(value, where) => { setSelectedCodigoAccion(value); setWhereClause(where); }} />

            {(selectedCodigoAccion || whereClause) && (
              <div className="mt-4 space-y-2">
                <div className="rounded-lg border border-primary-500 dark:border-primary-400 pink:border-pink-500 bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-50 text-primary-900 dark:text-primary-100 pink:text-pink-900 px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0 text-sm font-medium truncate">
                    {selectedCodigoAccion ? (
                      <span>Seleccionado: <span className="font-semibold">{selectedCodigoAccion}</span></span>
                    ) : (
                      <span>Filtro WHERE: <span className="font-mono truncate">{whereClause}</span></span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ml-3 text-sm underline hover:no-underline pink:text-pink-700 pink:hover:text-pink-900"
                    onClick={() => { selectedCodigoAccion ? (setSelectedCodigoAccion(''), setWhereClause('')) : setWhereClause('') }}
                    aria-label="Limpiar selección"
                  >
                    Limpiar
                  </button>
                </div>

                {/* Skeleton mientras verifica caché */}
                {checkingCache && (
                  <CacheCheckSkeleton />
                )}

                {/* Info de caché disponible */}
                {!checkingCache && hasCachedData && cacheInfo && (
                  <div className="rounded-lg border border-green-500 dark:border-green-400 pink:border-green-600 bg-green-50 dark:bg-green-900/20 pink:bg-green-50/90 text-green-900 dark:text-green-100 pink:text-green-800 px-4 py-3 text-sm flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 dark:bg-green-600 pink:bg-green-500 flex-shrink-0">
                      <Database className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">Datos en caché disponibles</div>
                      <div className="text-xs opacity-80">
                        {cacheInfo.info?.recordCount || 0} registros • {cacheInfo.info?.totalPhotos || 0} fotos
                        {cacheInfo.info?.lastSync && (
                          <span className="ml-1">
                            • Sincronizado: {new Date(cacheInfo.info.lastSync).toLocaleString('es-PE', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Zap className="w-5 h-5 text-green-600 dark:text-green-400 pink:text-green-600 flex-shrink-0" />
                  </div>
                )}

                {/* Sin caché - primera descarga */}
                {!checkingCache && !hasCachedData && selectedCodigoAccion && (
                  <div className="rounded-lg border border-blue-300 dark:border-blue-700 pink:border-pink-300 bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50/90 text-blue-900 dark:text-blue-100 pink:text-pink-900 px-4 py-3 text-sm flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 dark:bg-blue-600 pink:bg-pink-500 flex-shrink-0">
                      <Cloud className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">Primera descarga</div>
                      <div className="text-xs opacity-80">
                        Los datos se descargarán desde ArcGIS y se guardarán localmente
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Checkbox para forzar descarga de fotos */}
              {selectedCodigoAccion && hasCachedData && (
                <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 pink:bg-blue-50/90 rounded-lg border border-blue-200 dark:border-blue-700 pink:border-blue-300 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 pink:hover:bg-blue-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={forceSync}
                    onChange={(e) => setForceSync(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 pink:text-blue-900">
                      Descargar fotos de nuevo
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 pink:text-blue-700">
                      Ignorar caché y volver a descargar todas las fotografías desde ArcGIS
                    </div>
                  </div>
                </label>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleStartFetch}
                  disabled={loading || checkingCache || (!selectedCodigoAccion && !whereClause)}
                  className={`${forceSync
                    ? 'bg-orange-600 hover:bg-orange-700 pink:bg-orange-600 pink:hover:bg-orange-700'
                    : hasCachedData
                      ? 'bg-green-600 hover:bg-green-700 pink:bg-green-600 pink:hover:bg-green-700'
                      : 'bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700'
                    } text-white font-medium px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm flex items-center gap-2 min-w-[180px] justify-center`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : checkingCache ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : forceSync ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Descargar de nuevo</span>
                    </>
                  ) : hasCachedData ? (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Cargar desde caché</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      <span>Descargar datos</span>
                    </>
                  )}
                </button>

                {/* Indicador de estado después del botón */}
                {!loading && !checkingCache && fromCache && jobCompleted && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 pink:bg-green-50/90 text-green-700 dark:text-green-300 pink:text-green-700 rounded-lg border border-green-200 dark:border-green-700 pink:border-green-300 animate-fade-in">
                    <Zap className="w-4 h-4" />
                    <span className="text-sm font-medium">Cargado desde caché</span>
                  </div>
                )}
              </div>
            </div>

            {jobId && (
              <div className="mt-6 space-y-6">
                <JobProgress
                  jobId={jobId}
                  onComplete={async (data) => {
                    setJobCompleted(true)
                    setFromCache(data?.fromCache || false)

                    // Actualizar info de caché DESPUÉS de completar (para ver fotos descargadas)
                    if (selectedCodigoAccion) {
                      console.log('[onComplete] Actualizando info de caché después de completar job');
                      await checkCacheStatus(selectedCodigoAccion);
                    }

                    // Cargar todos los registros para el mapa inicial
                    // CRÍTICO: usar data.id en lugar del jobId del closure para evitar problemas de sincronización
                    try {
                      console.log('[onComplete] 🔍 data completo recibido:', data);
                      console.log('[onComplete] 🆔 Usando jobId:', data.id);
                      const payload = {
                        jobId: data.id,
                        supervisors: [],
                        tipoDeReporte: [],
                        subcomponente: []
                      };
                      console.log('[onComplete] 📦 Payload a enviar:', payload);
                      const recordsResp = await api.post('/api/s123/filtered-records', payload);
                      setFilteredRecords(recordsResp.data.records || [])
                    } catch (err) {
                      console.error('[onComplete] ❌ Error cargando registros para mapa:', err);
                      console.error('[onComplete] ❌ Error response:', err.response?.data);
                      setFilteredRecords([])
                    }
                  }}
                  onJobNotFound={() => {
                    // Limpiar el jobId y estados relacionados cuando el job no existe
                    setJobId('')
                    setJobCompleted(false)
                    setFilteredRecords([])
                  }}
                />

                {/* Filters Section */}
                {jobId && jobCompleted && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <Filter className="h-5 w-5 text-slate-500 dark:text-slate-400 pink:text-[#ff0075]" />
                          <h3 className="font-medium text-slate-900 dark:text-slate-100 pink:text-[#ff0075]">Filtros</h3>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setFiltersSelected({
                                supervisor: [],
                                componente: [],
                                tipo_componente: [],
                                actividad: [],
                                instalacion_referencia: [],
                                hecho_detectado: []
                              });
                              setFilterSearchText({
                                supervisor: '',
                                componente: '',
                                tipo_componente: '',
                                actividad: '',
                                instalacion_referencia: '',
                                hecho_detectado: ''
                              });
                              setDateFrom('');
                              setDateTo('');
                              setAdvancedActive(false);
                              setAdvancedFilters([]);
                              applyFilters(jobId, {
                                supervisor: [],
                                componente: [],
                                tipo_componente: [],
                                actividad: [],
                                instalacion_referencia: [],
                                hecho_detectado: []
                              });
                            }}
                            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 pink:text-[#64748b] pink:hover:text-[#0f172a]"
                          >
                            Limpiar filtros
                          </button>
                          <button
                            onClick={handleToggleAdvanced}
                            className={`text-sm px-3 py-1 rounded-md transition-colors ${advancedActive
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 pink:bg-pink-200 pink:text-[#ff0075]'
                              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 pink:text-[#64748b] pink:hover:bg-pink-100'
                              }`}
                          >
                            {advancedActive ? 'Ocultar Avanzado' : 'Filtro Avanzado'}
                          </button>
                        </div>
                      </div>

                      {/* Basic Filters Grid */}
                      {!advancedActive && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Date Range */}
                          <div className="relative" ref={datePickerRef}>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b] mb-1">
                              Rango de Fechas
                            </label>
                            <button
                              onClick={() => setDatePickerOpen(!datePickerOpen)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 pink:bg-white border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500 text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                            >
                              <span className="truncate">{formatRangeLabel(dateFrom, dateTo)}</span>
                              <Calendar className="h-4 w-4 text-slate-400 pink:text-[#ff0075]" />
                            </button>

                            {datePickerOpen && (
                              <div className="absolute z-[70] mt-1 p-4 bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-lg shadow-xl w-auto min-w-[600px]">
                                <div className="p-2">
                                  <DayPicker
                                    mode="range"
                                    selected={{
                                      from: ymdToDateLocal(dateFrom),
                                      to: ymdToDateLocal(dateTo)
                                    }}
                                    onSelect={(range) => {
                                      setDateFrom(range?.from ? toYMD(range.from) : '');
                                      setDateTo(range?.to ? toYMD(range.to) : '');
                                    }}
                                    numberOfMonths={2}
                                    className="border rounded-md p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                                <div className="mt-4 flex justify-end space-x-2">
                                  <button
                                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                                    className="px-3 py-1 text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 pink:text-[#64748b] pink:hover:text-[#0f172a]"
                                  >
                                    Limpiar
                                  </button>
                                  <button
                                    onClick={() => setDatePickerOpen(false)}
                                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md pink:bg-pink-600 pink:hover:bg-pink-700"
                                  >
                                    Listo
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Dynamic Filters */}
                          {[
                            { key: 'supervisor', label: 'Supervisor' },
                            { key: 'componente', label: 'Componente' },
                            { key: 'tipo_componente', label: 'Tipo Componente' },
                            { key: 'actividad', label: 'Actividad' },
                            { key: 'instalacion_referencia', label: 'Instalación Ref.' },
                            { key: 'hecho_detectado', label: 'Hecho Detectado' }
                          ].map(({ key, label }) => {
                            // Format display value (replace underscores with spaces for supervisor)
                            const formatDisplayValue = (val) => {
                              if (key === 'supervisor' && val) {
                                return String(val).split('_').join(' ');
                              }
                              return val;
                            };

                            // Filter options based on search text
                            const filteredOptions = (filterOptions[key] || []).filter(opt => {
                              if (!filterSearchText[key]) return true;
                              const searchLower = filterSearchText[key].toLowerCase();
                              const optLower = String(opt).toLowerCase();
                              // Also search with spaces for supervisor
                              const optWithSpaces = String(opt).split('_').join(' ').toLowerCase();
                              return optLower.includes(searchLower) || optWithSpaces.includes(searchLower);
                            });

                            return (
                              <div key={key} className="relative" ref={filterRefs[key]}>
                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b] mb-1">
                                  {label}
                                </label>
                                <button
                                  onClick={() => setFiltersOpen(prev => ({ ...prev, [key]: !prev[key] }))}
                                  className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 pink:bg-white border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500 text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                                >
                                  <span className="truncate">
                                    {filtersSelected[key]?.length
                                      ? formatDisplayValue(filtersSelected[key][0])
                                      : (filterLoading[key] ? 'Cargando...' : `Seleccionar ${label}`)}
                                  </span>
                                  <div className="flex items-center">
                                    {filtersSelected[key]?.length > 0 && (
                                      <X
                                        className="h-3 w-3 mr-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFiltersSelected(prev => ({ ...prev, [key]: [] }));
                                        }}
                                      />
                                    )}
                                    <Filter className="h-3 w-3 text-slate-400 pink:text-[#ff0075]" />
                                  </div>
                                </button>

                                {filtersOpen[key] && (
                                  <div className="absolute z-[70] mt-1 w-full bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-md shadow-lg">
                                    {/* Search input */}
                                    <div className="p-2 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                                      <input
                                        type="text"
                                        placeholder={`Buscar ${label.toLowerCase()}...`}
                                        value={filterSearchText[key] || ''}
                                        onChange={(e) => setFilterSearchText(prev => ({ ...prev, [key]: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 pink:bg-pink-50 border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500 text-slate-900 dark:text-slate-100 pink:text-[#0f172a] placeholder-slate-400 pink:placeholder-pink-400"
                                        autoFocus
                                      />
                                    </div>
                                    {/* Options list */}
                                    <div className="max-h-48 overflow-auto">
                                      {filterOptions[key]?.length === 0 ? (
                                        <div className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                                          No hay opciones
                                        </div>
                                      ) : filteredOptions.length === 0 ? (
                                        <div className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                                          No se encontraron resultados
                                        </div>
                                      ) : (
                                        filteredOptions.map((opt, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() => {
                                              setFiltersSelected(prev => ({ ...prev, [key]: [opt] }));
                                              setFiltersOpen(prev => ({ ...prev, [key]: false }));
                                              setFilterSearchText(prev => ({ ...prev, [key]: '' }));
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 ${filtersSelected[key]?.includes(opt)
                                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 pink:bg-pink-200 pink:text-[#ff0075]'
                                              : 'text-slate-700 dark:text-slate-300 pink:text-[#0f172a]'
                                              }`}
                                          >
                                            {formatDisplayValue(opt)}
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Advanced Filters UI */}
                      {advancedActive && (
                        <div className="space-y-4 border-t border-slate-200 dark:border-slate-700 pink:border-pink-300 pt-4 mt-4 animate-in fade-in slide-in-from-top-2">
                          <div className="bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-100 p-3 rounded-lg text-sm text-primary-800 dark:text-primary-200 pink:text-[#ff0075] mb-4 flex items-start">
                            <Zap className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                            <p>Define grupos de filtrado complejos. Cada grupo funciona como una condición "O" (OR), mientras que las condiciones dentro del grupo son "Y" (AND).</p>
                          </div>

                          {advancedFilters.map((group, gIdx) => (
                            <div key={gIdx} className="p-4 border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 relative shadow-sm">
                              <button
                                type="button"
                                onClick={() => removeAdvancedSupervisor(gIdx)}
                                className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors"
                                title="Eliminar grupo"
                              >
                                <X className="h-4 w-4" />
                              </button>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b] mb-1">
                                    Supervisor (Opcional)
                                  </label>
                                  <select
                                    value={group.supervisor}
                                    onChange={(e) => updateAdvancedSupervisor(gIdx, e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 pink:bg-white border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                                  >
                                    <option value="">Cualquiera</option>
                                    {filterOptions.supervisor.map((s, i) => (
                                      <option key={i} value={s}>{String(s).split('_').join(' ')}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                                  Rangos de Fecha y Hora
                                </label>
                                {group.ranges.map((range) => (
                                  <div key={range.id} className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900 pink:bg-pink-50/50 p-2 rounded border border-slate-200 dark:border-slate-700 pink:border-pink-200">
                                    <input
                                      type="date"
                                      value={range.date}
                                      onChange={(e) => updateAdvancedRange(gIdx, range.id, 'date', e.target.value)}
                                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b]">de</span>
                                    <input
                                      type="time"
                                      value={range.from}
                                      onChange={(e) => updateAdvancedRange(gIdx, range.id, 'from', e.target.value)}
                                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b]">a</span>
                                    <input
                                      type="time"
                                      value={range.to}
                                      onChange={(e) => updateAdvancedRange(gIdx, range.id, 'to', e.target.value)}
                                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-800 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-[#0f172a]"
                                    />
                                    {group.ranges.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeAdvancedRange(gIdx, range.id)}
                                        className="text-slate-400 hover:text-red-500 ml-auto"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addAdvancedRange(gIdx)}
                                  className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 pink:text-pink-600 pink:hover:text-pink-700 font-medium"
                                >
                                  + Agregar otro rango
                                </button>
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={addAdvancedSupervisor}
                            className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg text-slate-500 dark:text-slate-400 pink:text-[#64748b] hover:border-primary-500 hover:text-primary-500 dark:hover:border-primary-400 dark:hover:text-primary-400 pink:hover:border-[#ff0075] pink:hover:text-[#ff0075] transition-colors text-sm font-medium"
                          >
                            + Agregar Grupo de Filtros
                          </button>
                        </div>
                      )}

                      {/* Apply Button */}
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => handleApplyFilters()}
                          disabled={filtering}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 pink:bg-pink-600 pink:hover:bg-pink-700 transition-colors"
                        >
                          {filtering ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>Aplicando...</span>
                            </>
                          ) : (
                            <>
                              <Filter className="h-4 w-4" />
                              <span>Aplicar Filtros</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Data Preview */}
                    <DataPreview
                      jobId={jobId}
                      refreshKey={previewRefreshKey}
                      filteredCounts={applyResult}
                      pageSize={15}
                      onRowClick={(row) => {
                        console.log('[DataVisualizationPage] Click en fila, globalId:', row.globalid)
                        setSelectedGlobalId(row.globalid)
                        // Scroll al mapa
                        setTimeout(() => {
                          const mapElement = document.querySelector('.leaflet-container')
                          if (mapElement) {
                            mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }
                        }, 100)
                      }}
                    />

                    {/* Download Actions */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadFilteredTable}
                          disabled={!jobId || filteredDownloading}
                          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white text-sm font-medium px-4 h-10 rounded-lg disabled:opacity-50 shadow-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {filteredDownloading ? 'Preparando…' : 'Descargar tabla filtrada'}
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadPhotosZip}
                          disabled={!jobId || !jobCompleted || zipDownloading}
                          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 pink:bg-pink-600 pink:hover:bg-pink-700 text-white text-sm font-medium px-4 h-10 rounded-lg disabled:opacity-50 shadow-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {zipDownloading ? 'Preparando…' : 'Descargar fotografías ZIP'}
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setZipConfigOpen((v) => !v)}
                            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 pink:bg-white hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50 text-slate-700 dark:text-slate-300 pink:text-slate-700 border border-slate-300 dark:border-slate-600 pink:border-pink-300 text-sm font-medium px-4 h-10 rounded-lg shadow-sm transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                            Configurar jerarquía
                          </button>
                          {zipConfigOpen && (
                            <div ref={zipConfigRef} className="absolute z-20 bottom-full right-0 mb-2 w-[420px] max-w-[92vw] bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-200 rounded-lg shadow-xl">
                              <div className="p-3 border-b border-slate-100 dark:border-slate-700 pink:border-pink-100 text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-800">Jerarquía y selección de carpetas</div>
                              <div className="p-3 space-y-3">
                                <div className="text-xs text-slate-600 dark:text-slate-400 pink:text-slate-700">Usa flechas para reordenar. Desmarca para excluir.</div>
                                <ul className="space-y-2">
                                  {zipOrder.map((f, idx) => (
                                    <li key={f} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 pink:bg-pink-50/50 border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg px-3 py-2">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 text-primary-600 pink:text-[#ff0075] pink:accent-[#ff0075] focus:ring-primary-500 pink:focus:ring-pink-500 rounded"
                                          checked={!!zipInclude[f]}
                                          onChange={(e) => setZipInclude((prev) => ({ ...prev, [f]: e.target.checked }))}
                                        />
                                        <span className="capitalize text-sm pink:text-slate-800">{f.split('_').join(' ')}</span>
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => moveZipField(idx, -1)} className="px-2 py-1 text-xs bg-white dark:bg-slate-800 pink:bg-white border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 text-slate-700 dark:text-slate-300 pink:text-[#ff0075] disabled:opacity-50 disabled:pink:text-pink-300" disabled={idx === 0}>↑</button>
                                        <button type="button" onClick={() => moveZipField(idx, 1)} className="px-2 py-1 text-xs bg-white dark:bg-slate-800 pink:bg-white border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 text-slate-700 dark:text-slate-300 pink:text-[#ff0075] disabled:opacity-50 disabled:pink:text-pink-300" disabled={idx === zipOrder.length - 1}>↓</button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 pink:text-slate-600">
                                  Carpetas actuales: {zipOrder.filter((f) => zipInclude[f]).map((f) => f).join(' / ') || '— ninguna —'}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mapa de ubicaciones */}
                    <div className="mt-6">
                      <MapView
                        records={filteredRecords.length > 0 ? filteredRecords : []}
                        codigoAccion={selectedCodigoAccion}
                        selectedGlobalId={selectedGlobalId}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
