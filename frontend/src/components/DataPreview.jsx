import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import api from '../lib/axios'
import { ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Search, Eye, EyeOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Column display name mappings
const COLUMN_DISPLAY_NAMES = {
  // Tabla 0 - Main record fields
  codigo_accion: 'CA',
  otro_ca: 'Otro CA',
  fecha: 'Fecha y Hora',
  norte: 'Norte',
  este: 'Este',
  zona: 'Zona UTM',
  altitud: 'Altitud (msnm)',
  componente: 'Componente',
  tipo_componente: 'Tipo de Componente',
  nombre_supervisor: 'Supervisor',
  modalidad: 'Modalidad de la Supervisión',
  actividad: 'Actividad',
  instalacion_referencia: 'Instalación de Ref.',
  nom_pto_ppc: 'PAF, PC, CP',
  num_pto_muestreo: 'Número de Punto (auto)',
  nom_pto_muestreo: 'Nombre de Punto (manual)',
  // Tabla 1 - Layer 1 fields
  FOTO: 'Foto',
  DESCRIP_1: 'Descripción de la Foto',
  // Tabla 2 - Layer 2 fields
  HECHO_DETEC_1: 'Hecho Detectado',
  DESCRIP_2: 'Descripción de la Foto'
}

// Get display name for a column
const getColumnDisplayName = (field) => {
  const lower = field.toLowerCase()
  // Check exact match first
  if (COLUMN_DISPLAY_NAMES[field]) return COLUMN_DISPLAY_NAMES[field]
  // Check lowercase match
  if (COLUMN_DISPLAY_NAMES[lower]) return COLUMN_DISPLAY_NAMES[lower]
  // Return original if no mapping
  return field
}

export const DataPreview = ({ jobId, refreshKey = 0, filteredCounts = null, pageSize = 25, onRowClick = null }) => {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [fields, setFields] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState(pageSize)
  const [sortField, setSortField] = useState('')
  const [sortDir, setSortDir] = useState('asc')
  const [preparing, setPreparing] = useState(false)
  const retryTimerRef = useRef(null)
  const [token, setToken] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token)
      }
    })
  }, [])

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }

  const fetchPage = async (p) => {
    if (!jobId) return
    setLoading(true)
    setError('')
    try {
      const resp = await api.get(`/api/s123/preview/${jobId}`, {
        params: { page: p, pageSize: size }
      })
      const { data, status } = resp
      if (status === 202 || (data && data.preparing)) {
        setPreparing(true)
        setError('')
        clearRetryTimer()
        retryTimerRef.current = setTimeout(() => fetchPage(p), 1200)
        return
      }
      const rows = data.rows || []
      const allFields = data.fields || (rows[0] ? Object.keys(rows[0]) : [])
      // Ocultar columnas técnicas que no son útiles para el usuario
      const hiddenFields = [
        'objectid', 'globalid', 'guid',
        'created_user', 'created_date', 'last_edited_user', 'last_edited_date',
        '_layer1_oid', '_layer0_oid', 'raw_json', 'checksum', 'synced_at',
        '_related_layer1', '_related_layer2', '_photos', 'photos', // Hide nested arrays from main columns
        // Hide flattened fields that are now shown in accordion
        'descrip_1', 'hecho_detec_1', 'descrip_2',
        // Obsolete fields to hide
        'descripcion', 'hallazgos', 'profundidad',
        'descripcion_f01', 'descripcion_f02', 'descripcion_f03', 'descripcion_f04', 'descripcion_f05',
        'descripcion_f06', 'descripcion_f07', 'descripcion_f08', 'descripcion_f09', 'descripcion_f10',
        'hecho_detec', // Legacy
        'parent_globalid',
        'creator', 'editdate', 'editor',
        'datum', 'detalle_componente', 'numero_punto', 'tipo_de_reporte', 'subcomponente'
      ]
      const visibleFields = allFields.filter(f => !hiddenFields.includes(f.toLowerCase()))
      setRows(rows)
      setFields(visibleFields)
      setTotal(data.total || 0)
      setPage(p)
      setPreparing(false)
      clearRetryTimer()
    } catch (e) {
      const status = e?.response?.status
      if (status === 400) {
        setPreparing(true)
        setError('')
        clearRetryTimer()
        retryTimerRef.current = setTimeout(() => fetchPage(p), 1200)
      } else if (status === 404) {
        // Job no encontrado - no reintentar
        setError('Datos no disponibles. Por favor, obtén los datos nuevamente.')
        setPreparing(false)
        clearRetryTimer()
      } else {
        setError(e?.message || 'Error cargando la vista previa')
        setPreparing(false)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    clearRetryTimer()
    setPreparing(false)
    fetchPage(1)
    return () => clearRetryTimer()
  }, [jobId, size, refreshKey])

  if (!jobId) return null

  const totalPages = Math.max(1, Math.ceil(total / size))

  const sortedRows = useMemo(() => {
    if (!sortField) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const va = a?.[sortField]
      const vb = b?.[sortField]
      const na = typeof va === 'number' ? va : Number(va)
      const nb = typeof vb === 'number' ? vb : Number(vb)
      let cmp
      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        cmp = na - nb
      } else {
        const sa = (va ?? '').toString()
        const sb = (vb ?? '').toString()
        cmp = sa.localeCompare(sb, 'es', { sensitivity: 'base', numeric: true })
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortField, sortDir])

  const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]+/g, '')
  const isFechaField = (f) => norm(f).includes('fecha')
  const formatFecha = (v) => {
    const nRaw = typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v)
    if (!Number.isFinite(nRaw)) return String(v ?? '')
    const n = nRaw > 1e11 ? nRaw : nRaw > 1e9 ? nRaw * 1000 : nRaw
    const d = new Date(n)
    if (Number.isNaN(d.getTime())) return String(v ?? '')
    const pad = (x) => String(x).padStart(2, '0')
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    const ss = pad(d.getSeconds())
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
  }

  // Helper to safely parse related layers (may be JSON string or already an array)
  const parseRelatedLayer = (data) => {
    if (!data) return []
    if (Array.isArray(data)) return data
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  const onHeaderClick = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // State for expanded rows
  const [expandedRows, setExpandedRows] = useState(new Set())

  const toggleRow = (e, idx) => {
    e.stopPropagation()
    const newSet = new Set(expandedRows)
    if (newSet.has(idx)) newSet.delete(idx)
    else newSet.add(idx)
    setExpandedRows(newSet)
  }

  // Lightbox Component - rendered in portal for proper fixed positioning
  const Lightbox = () => {
    if (!lightboxPhoto) return null
    return ReactDOM.createPortal(
      <div 
        className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4" 
        onClick={() => setLightboxPhoto(null)}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <button 
          className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black/50 rounded-full p-2"
          onClick={() => setLightboxPhoto(null)}
        >
          <X className="w-8 h-8" />
        </button>
        <img
          src={lightboxPhoto}
          alt="Full size"
          className="max-w-[95vw] max-h-[90vh] object-contain rounded shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>,
      document.body
    )
  }

  // Helper to get OID case-insensitively
  const getOid = (attrs) => attrs.OBJECTID || attrs.objectid || attrs.ObjectId || attrs.OID || attrs.oid

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
          {typeof filteredCounts?.filtered === 'number' && typeof filteredCounts?.total === 'number'
            ? `Filtradas ${filteredCounts.filtered} de ${filteredCounts.total} filas.`
            : `Filtradas ${total} de ${total} filas.`}
        </p>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center text-xs text-slate-600 dark:text-slate-400 pink:text-[#64748b] gap-2">
            <span>Por página</span>
            <div className="relative">
              <select
                className="appearance-none h-9 min-w-[88px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded-lg px-4 pr-8 text-xs bg-white dark:bg-slate-800 pink:bg-white text-slate-800 dark:text-slate-200 pink:text-[#0f172a] shadow-sm hover:border-primary-500 pink:hover:border-pink-500 focus:outline-none focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-primary-500"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                disabled={loading}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
            </div>
          </div>

          <div className="text-[11px] px-3 py-1.5 rounded-full border border-primary-200 dark:border-primary-700 pink:border-pink-300 bg-primary-50 dark:bg-primary-900/20 pink:bg-pink-100 text-primary-700 dark:text-primary-300 pink:text-[#ff0075] whitespace-nowrap font-medium">
            Página {page} de {totalPages}
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 pink:border-pink-300 bg-white/80 dark:bg-slate-800/80 pink:bg-white/90 backdrop-blur px-2 py-1 shadow-sm">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => { clearRetryTimer(); fetchPage(Math.max(1, page - 1)) }}
              disabled={page <= 1 || loading}
              className="inline-flex h-8 items-center gap-1 px-3 text-xs rounded-lg border border-primary-500 dark:border-primary-600 pink:border-[#ff0075] text-primary-600 dark:text-primary-400 pink:text-[#ff0075] hover:bg-primary-50 dark:hover:bg-primary-900/20 pink:hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-slate-300 dark:disabled:border-slate-600 pink:disabled:border-pink-300 disabled:text-slate-400 dark:disabled:text-slate-500 pink:disabled:text-pink-300 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Anterior</span>
            </button>

            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => { clearRetryTimer(); fetchPage(Math.min(totalPages, page + 1)) }}
              disabled={page >= totalPages || loading}
              className="inline-flex h-8 items-center gap-1 px-3 text-xs rounded-lg border border-primary-500 dark:border-primary-600 pink:border-[#ff0075] text-primary-600 dark:text-primary-400 pink:text-[#ff0075] hover:bg-primary-50 dark:hover:bg-primary-900/20 pink:hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-slate-300 dark:disabled:border-slate-600 pink:disabled:border-pink-300 disabled:text-slate-400 dark:disabled:text-slate-500 pink:disabled:text-pink-300 disabled:hover:bg-transparent transition-colors"
            >
              <span className="hidden md:inline">Siguiente</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {preparing ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Preparando vista previa...</div>
      ) : loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">Cargando...</div>
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400 pink:text-red-600">{error}</div>
      ) : (
        <div 
          className="overflow-auto border border-slate-200 dark:border-slate-700 pink:border-pink-200 rounded-lg bg-white dark:bg-slate-800 pink:bg-white/95 shadow-sm cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => {
            const el = e.currentTarget
            el.dataset.isDown = 'true'
            el.dataset.startX = e.pageX - el.offsetLeft
            el.dataset.scrollLeft = el.scrollLeft
          }}
          onMouseLeave={(e) => {
            e.currentTarget.dataset.isDown = 'false'
          }}
          onMouseUp={(e) => {
            e.currentTarget.dataset.isDown = 'false'
          }}
          onMouseMove={(e) => {
            const el = e.currentTarget
            if (el.dataset.isDown !== 'true') return
            e.preventDefault()
            const x = e.pageX - el.offsetLeft
            const walk = (x - Number(el.dataset.startX)) * 2
            el.scrollLeft = Number(el.dataset.scrollLeft) - walk
          }}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 pink:bg-pink-50">
              <tr>
                <th className="w-8 px-3 py-2.5 sticky left-0 top-0 z-50 bg-white dark:bg-slate-800"></th>
                {fields.map((f) => (
                  <th
                    key={f}
                    onClick={() => onHeaderClick(f)}
                    className="text-left px-3 py-2.5 font-bold text-[var(--text-secondary)] whitespace-nowrap select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors sticky top-0 z-40 bg-slate-50 dark:bg-slate-800 pink:bg-pink-50"
                    title="Ordenar"
                  >
                    <span className="inline-flex items-center gap-1">
                      {getColumnDisplayName(f)}
                      {sortField === f && (
                        <span className="text-slate-500 dark:text-slate-400 pink:text-[#ff0075] text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, idx) => {
                const isExpanded = expandedRows.has(idx)
                // Parse related layers (may be JSON strings or arrays)
                const relatedLayer1 = parseRelatedLayer(r._related_layer1)
                const relatedLayer2 = parseRelatedLayer(r._related_layer2)
                const hasRelated = (relatedLayer1.length > 0 || relatedLayer2.length > 0)

                return (
                  <React.Fragment key={idx}>
                    <tr
                      onDoubleClick={() => onRowClick && onRowClick(r)}
                      className={`odd:bg-white dark:odd:bg-slate-800 pink:odd:bg-white even:bg-slate-50 dark:even:bg-slate-800/50 pink:even:bg-pink-50/50 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                      title={onRowClick ? 'Doble clic para ver en el mapa' : ''}
                    >
                      <td className="px-4 py-3 whitespace-nowrap sticky left-0 z-30 bg-white dark:bg-slate-800 pink:bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {hasRelated && (
                          <button
                            type="button"
                            onClick={(e) => toggleRow(e, idx)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 pink:text-[#ff0075] pink:hover:text-[#e6006a] transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>
                      {fields.map((f) => {
                        const raw = r[f]
                        const val = isFechaField(f) ? formatFecha(raw) : String(raw ?? '')
                        return (
                          <td key={f} className="px-3 py-2 text-slate-800 dark:text-slate-200 pink:text-[#0f172a] whitespace-nowrap">{val}</td>
                        )
                      })}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-slate-900/50 pink:bg-pink-50/50">
                        <td colSpan={fields.length + 1} className="p-0 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                          <div className="sticky left-0 w-[74vw] min-w-[800px] max-w-full p-4 space-y-4">
                            {/* Layer 1: Descripciones */}
                            {relatedLayer1.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 pink:text-[#ff0075] uppercase mb-2">Descripciones (Tabla 1)</h4>
                                <div className="overflow-hidden border rounded bg-white dark:bg-slate-800 pink:bg-white/95 pink:border-pink-200 shadow-sm">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-700 pink:bg-pink-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)] w-20">Foto</th>
                                        <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)]">Descripción de la Foto</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {relatedLayer1.map((child, cIdx) => {
                                        // Find photo for this child record (match by OBJECTID)
                                        const childOid = getOid(child)
                                        // Match by OID AND Layer ID (1)
                                        const photo = r._photos?.find(p => p.objectid === childOid && p.layer_id === 1)
                                        const photoUrl = photo && token ? `/api/s123/direct/photo/${r.codigo_accion || r.otro_ca}/${r.globalid}/${encodeURIComponent(photo.filename)}?token=${token}` : null

                                        return (
                                          <tr key={cIdx} className="border-t border-slate-100 dark:border-slate-700 pink:border-pink-100 hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50">
                                            <td className="px-3 py-2">
                                              {photoUrl ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setLightboxPhoto(photoUrl)}
                                                  className="block w-16 h-12 bg-slate-200 pink:bg-pink-100 rounded overflow-hidden hover:opacity-80 transition-opacity border border-slate-300 pink:border-pink-300 relative group"
                                                >
                                                  <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" loading="lazy" />
                                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                                                  </div>
                                                </button>
                                              ) : (
                                                <span className="text-slate-400 pink:text-pink-400 italic text-[10px]">Sin foto</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">{String(child.DESCRIP_1 ?? '')}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Layer 2: Hechos */}
                            {relatedLayer2.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-slate-500 pink:text-[#ff0075] uppercase mb-2">Hechos (Tabla 2)</h4>
                                <div className="overflow-hidden border rounded bg-white dark:bg-slate-800 pink:bg-white/95 pink:border-pink-200 shadow-sm">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-700 pink:bg-pink-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)] w-20">Foto</th>
                                        <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)]">Hecho Detectado</th>
                                        <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)]">Descripción de la Foto</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {relatedLayer2.map((child, cIdx) => {
                                        const childOid = getOid(child)
                                        // Match by OID AND Layer ID (2)
                                        const photo = r._photos?.find(p => p.objectid === childOid && p.layer_id === 2)
                                        const photoUrl = photo && token ? `/api/s123/direct/photo/${r.codigo_accion || r.otro_ca}/${r.globalid}/${encodeURIComponent(photo.filename)}?token=${token}` : null

                                        return (
                                          <tr key={cIdx} className="border-t border-slate-100 dark:border-slate-700 pink:border-pink-100 hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50">
                                            <td className="px-3 py-2">
                                              {photoUrl ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setLightboxPhoto(photoUrl)}
                                                  className="block w-16 h-12 bg-slate-200 pink:bg-pink-100 rounded overflow-hidden hover:opacity-80 transition-opacity border border-slate-300 pink:border-pink-300 relative group"
                                                >
                                                  <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" loading="lazy" />
                                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                                                  </div>
                                                </button>
                                              ) : (
                                                <span className="text-slate-400 pink:text-pink-400 italic text-[10px]">Sin foto</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">{String(child.HECHO_DETEC_1 ?? '')}</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 pink:text-[#64748b]">{String(child.DESCRIP_2 ?? '')}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Lightbox />
    </div>
  )
}
