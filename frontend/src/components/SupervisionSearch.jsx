import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../lib/axios'
import { useAuth } from '../context/AuthContext'
import { Search, X, Check, Lock } from 'lucide-react'

export function SupervisionSearch({ onSelected }) {
  const { accessibleCAs, isAdmin, isSuperAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [values, setValues] = useState([])
  const [error, setError] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const listboxId = 's123-suggest-list'
  const cacheRef = useRef(new Map())
  const [groupFilter, setGroupFilter] = useState('all')
  const [recents, setRecents] = useState([])
  const [collapsed, setCollapsed] = useState(false)

  const debouncedQuery = useMemo(() => query.trim(), [query])

  // Filter CAs based on user permissions
  const filterByPermissions = (items) => {
    // Admins and superadmins see all
    if (isAdmin || isSuperAdmin || accessibleCAs?.all_access) {
      return items
    }

    // Regular users only see their assigned CAs
    if (!accessibleCAs?.cas || accessibleCAs.cas.length === 0) {
      return []
    }

    // Extract ca_code values from the cas array
    const allowedCodes = accessibleCAs.cas.map(ca => String(ca.ca_code))

    return items.filter(item =>
      allowedCodes.includes(String(item.value))
    )
  }

  useEffect(() => {
    let cancelled = false
    const fetchValues = async () => {
      setLoading(true)
      setError('')
      try {
        const key = debouncedQuery.toLowerCase()
        if (cacheRef.current.has(key)) {
          const cached = cacheRef.current.get(key)
          const filtered = filterByPermissions(cached)
          setValues(filtered)
        } else {
          const { data } = await api.get('/api/s123/codigo-accion-values', {
            params: { search: debouncedQuery }
          })
          if (!cancelled) {
            const raw = Array.isArray(data.values) ? data.values : []
            const normalized = raw.map((it) => (
              typeof it === 'string' ? { value: it, field: 'Codigo_accion' } : it
            )).filter(it => it && it.value)
            cacheRef.current.set(key, normalized)
            const filtered = filterByPermissions(normalized)
            setValues(filtered)
          }
        }
      } catch (e) {
        console.error('[SupervisionSearch] Error fetching values:', e)
        if (!cancelled) setError('No se pudo obtener resultados. Intenta nuevamente.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (!debouncedQuery || debouncedQuery.length < 2) {
      setValues([])
      setError('')
      setLoading(false)
      return () => { }
    }

    const t = setTimeout(() => { setVisibleCount(20); fetchValues() }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [debouncedQuery])

  useEffect(() => { setHighlightedIndex(-1) }, [debouncedQuery])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('s123_recent_codes')
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          const validRecents = arr.filter(it => it && it.value)
          const filteredRecents = filterByPermissions(validRecents)
          setRecents(filteredRecents)
        }
      }
    } catch (_) { }
    // inputRef.current?.focus() // Removed aggressive auto-focus
  }, [accessibleCAs, isAdmin, isSuperAdmin])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setValues([])
      setHighlightedIndex(-1)
      setCollapsed(true)
      return
    }
    const pool = showRecent ? recents : filteredSortedItems
    const poolLen = pool.length
    if (poolLen === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % poolLen)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const maxIdx = poolLen - 1
      setHighlightedIndex((prev) => (prev <= 0 ? maxIdx : prev - 1))
    } else if (e.key === 'Enter') {
      const targetIdx = highlightedIndex >= 0 && highlightedIndex < poolLen ? highlightedIndex : 0
      const item = pool[targetIdx]
      const field = item.field || 'Codigo_accion'
      const val = String(item.value)
      handleSelect(val, field)
    }
  }

  const getHighlighted = (text, q) => {
    const t = String(text)
    const s = String(q || '').trim()
    if (!s) return t
    const idx = t.toLowerCase().indexOf(s.toLowerCase())
    if (idx === -1) return t
    const before = t.slice(0, idx)
    const match = t.slice(idx, idx + s.length)
    const after = t.slice(idx + s.length)
    return (
      <span>
        {before}
        <mark className="bg-yellow-200 dark:bg-yellow-600 text-slate-900 dark:text-slate-100 px-0.5 rounded">{match}</mark>
        {after}
      </span>
    )
  }

  const limited = values.slice(0, visibleCount)
  const sortedItems = useMemo(() => {
    const weight = (f) => {
      const s = String(f || 'CA').toLowerCase()
      return (s === 'ca' || s === 'codigo_accion') ? 0 : 1
    }
    return [...limited].sort((a, b) => {
      const fa = a?.field || 'CA'
      const fb = b?.field || 'CA'
      const wa = weight(fa)
      const wb = weight(fb)
      if (wa !== wb) return wa - wb
      return String(a?.value).localeCompare(String(b?.value), 'es')
    })
  }, [limited])

  const filteredSortedItems = useMemo(() => {
    if (groupFilter === 'codigo') return sortedItems.filter(it => {
      const s = String(it.field || 'CA').toLowerCase()
      return s === 'ca' || s === 'codigo_accion'
    })
    if (groupFilter === 'otros') return sortedItems.filter(it => {
      const s = String(it.field || '').toLowerCase()
      return s !== 'ca' && s !== 'codigo_accion'
    })
    return sortedItems
  }, [sortedItems, groupFilter])

  const showRecent = !loading && debouncedQuery.length < 2 && recents.length > 0
  const expanded = (!loading && values.length > 0) || showRecent

  const saveRecent = (val, field) => {
    try {
      const next = [{ value: val, field }, ...recents.filter(r => r.value !== val || r.field !== field)].slice(0, 5)
      setRecents(next)
      localStorage.setItem('s123_recent_codes', JSON.stringify(next))
    } catch (_) { }
  }

  const handleSelect = (val, field) => {
    onSelected(val, `${field} = '${val.replace(/'/g, "''")}'`)
    saveRecent(val, field)
    setQuery(val)
    setValues([])
    setHighlightedIndex(-1)
    setCollapsed(true)
    inputRef.current?.blur()
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Buscar por código de acción u otro código</label>
        <div className="relative" role="combobox" aria-haspopup="listbox" aria-owns={listboxId} aria-expanded={expanded && !collapsed}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setCollapsed(false); setQuery(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe 2+ caracteres para buscar..."
            ref={inputRef}
            onFocus={() => setCollapsed(false)}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={highlightedIndex >= 0 ? `s123-opt-${highlightedIndex}` : undefined}
            className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
          {loading ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block h-4 w-4 border-2 border-slate-300 dark:border-slate-600 border-t-primary-600 rounded-full animate-spin" aria-label="Cargando" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery(''); setValues([]); setError(''); setHighlightedIndex(-1); setCollapsed(false); onSelected('', ''); inputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {!isAdmin && !isSuperAdmin && (!accessibleCAs?.cas || accessibleCAs.cas.length === 0) && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <Lock className="w-4 h-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-800 dark:text-yellow-200">
            <p className="font-medium">Sin acceso a CAs</p>
            <p>No tienes códigos de acción asignados. Contacta a un administrador para obtener permisos.</p>
          </div>
        </div>
      )}

      {values.length > 0 && !loading && !collapsed && (
        <div className="text-xs text-slate-500 dark:text-slate-400">Resultados (mostrando {Math.min(values.length, visibleCount)} de {values.length})</div>
      )}

      {!collapsed && <div className="text-xs text-slate-400 dark:text-slate-500">Consejo: usa ↑/↓ para navegar, Enter para seleccionar</div>}

      {values.length > 0 && !loading && !collapsed && (
        <div className="flex items-center gap-1 text-xs">
          <button type="button" className={`px-3 py-1.5 rounded-lg border transition-colors ${groupFilter === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`} onClick={() => setGroupFilter('all')}>Todos</button>
          <button type="button" className={`px-3 py-1.5 rounded-lg border transition-colors ${groupFilter === 'codigo' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`} onClick={() => setGroupFilter('codigo')}>Códigos de acción</button>
          <button type="button" className={`px-3 py-1.5 rounded-lg border transition-colors ${groupFilter === 'otros' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`} onClick={() => setGroupFilter('otros')}>Otros</button>
        </div>
      )}

      {!collapsed && (
        <div id={listboxId} className="max-h-60 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700 shadow-lg" role="listbox" aria-label="Resultados de búsqueda">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`s-${i}`} className="p-3 text-sm">
                <div className="h-3 w-1/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))
          ) : showRecent ? (
            <>
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">Recientes</div>
              {recents.map((item, i) => {
                const field = item.field || 'CA'
                const fieldLower = String(field).toLowerCase()
                const isCA = fieldLower === 'ca' || fieldLower === 'codigo_accion'
                const val = String(item.value)
                return (
                  <button
                    id={`s123-rc-${i}`}
                    key={`r|${field}|${val}`}
                    type="button"
                    onClick={() => handleSelect(val, field)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between ${i === highlightedIndex ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                    role="option"
                    aria-selected={i === highlightedIndex}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {i === highlightedIndex ? <Check className="text-primary-600 dark:text-primary-400 flex-shrink-0 w-4 h-4" /> : <span className="w-4" />}
                      <div className="truncate">{val}</div>
                    </div>
                    <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${isCA ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700' : 'bg-secondary-50 dark:bg-secondary-900/20 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-700'}`}>
                      {field}
                    </span>
                  </button>
                )
              })}
            </>
          ) : values.length === 0 ? (
            <div className="p-3 text-sm text-slate-500 dark:text-slate-400">{debouncedQuery.length < 2 ? 'Escribe al menos 2 caracteres para buscar' : 'Sin resultados'}</div>
          ) : (
            <>
              {filteredSortedItems.map((item, i) => {
                const key = `${item.field}|${item.value}`
                const field = item.field || 'CA'
                const fieldLower = String(field).toLowerCase()
                const isCA = fieldLower === 'ca' || fieldLower === 'codigo_accion'
                const val = String(item.value)
                const prev = filteredSortedItems[i - 1]?.field || null
                const isNewGroup = !prev || String(prev).toLowerCase() !== fieldLower
                return (
                  <React.Fragment key={key}>
                    {isNewGroup && (
                      <div className="px-3 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                        {isCA ? 'Códigos de acción' : 'Otros códigos'}
                      </div>
                    )}
                    <button
                      id={`s123-opt-${i}`}
                      type="button"
                      onClick={() => handleSelect(val, field)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between ${i === highlightedIndex ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                      role="option"
                      aria-selected={i === highlightedIndex}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {i === highlightedIndex ? <Check className="text-primary-600 dark:text-primary-400 flex-shrink-0 w-4 h-4" /> : <span className="w-4" />}
                        <div className="truncate">{getHighlighted(val, debouncedQuery)}</div>
                      </div>
                      <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${isCA ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700' : 'bg-secondary-50 dark:bg-secondary-900/20 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-700'}`}>
                        {field}
                      </span>
                    </button>
                  </React.Fragment>
                )
              })}
              {values.length > visibleCount && (
                <div className="p-2 bg-white dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 20)}
                    className="w-full text-center text-xs text-primary-600 dark:text-primary-400 border border-primary-600 dark:border-primary-500 bg-white dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg px-3 py-2 transition-colors"
                  >
                    Mostrar más ({values.length - visibleCount} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
