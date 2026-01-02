import React from 'react'
import { FileText, Clock, ChevronRight } from 'lucide-react'

export const RecentCAsList = ({ cas, onSelectCA }) => {
  if (!cas || cas.length === 0) {
    return null
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Sin fecha'
    
    // Manejar timestamps Unix (milisegundos)
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp) 
      : new Date(timestamp)
    
    if (isNaN(date.getTime())) return 'Sin fecha'
    
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Hoy'
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
    return `Hace ${Math.floor(diffDays / 30)} meses`
  }

  return (
    <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-2xl border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 theme-text-link" />
          <h3 className="font-semibold theme-text-primary">4. Mis Actas</h3>
        </div>
        <span className="text-sm theme-text-muted">
          {cas.length} {cas.length === 1 ? 'CA disponible' : 'CAs disponibles'}
        </span>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700 pink:divide-pink-100">
        {cas.slice(0, 5).map((ca, index) => (
          <div
            key={ca.codigo || index}
            onClick={() => onSelectCA?.(ca.codigo)}
            className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 theme-text-link" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium theme-text-primary truncate group-hover:theme-text-link transition-colors">
                  {ca.codigo}
                </h4>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs theme-text-muted flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(ca.ultima_sincronizacion || ca.ultima_edicion)}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-600 pink:text-pink-300">•</span>
                  <span className="text-xs theme-text-muted">
                    {ca.registros_activos} {ca.registros_activos === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
              </div>

              {/* Arrow indicator */}
              <ChevronRight className="w-5 h-5 theme-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
