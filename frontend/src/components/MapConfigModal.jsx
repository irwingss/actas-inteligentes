import React, { useState, useEffect } from 'react'
import { X, Save, Map } from 'lucide-react'

/**
 * Modal de configuración de metadatos del mapa
 */
export function MapConfigModal({ 
  initialConfig = {},
  onSave,
  onClose 
}) {
  const [mapTitle, setMapTitle] = useState(initialConfig.mapTitle || '')
  const [codigoAccion, setCodigoAccion] = useState(initialConfig.codigoAccion || '')
  const [expediente, setExpediente] = useState(initialConfig.expediente || '')
  
  const handleSave = () => {
    onSave({
      mapTitle: mapTitle.trim() || 'Mapa de Capas',
      codigoAccion: codigoAccion.trim(),
      expediente: expediente.trim()
    })
    onClose()
  }
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Configurar Metadatos del Mapa
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Título del mapa */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Título del Mapa *
            </label>
            <input
              type="text"
              value={mapTitle}
              onChange={(e) => setMapTitle(e.target.value)}
              placeholder="Ej: Mapa de Yacimientos Lote X"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              autoFocus
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Aparecerá como encabezado en la leyenda cartográfica
            </p>
          </div>
          
          {/* Código de Acción */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Código de Acción
            </label>
            <input
              type="text"
              value={codigoAccion}
              onChange={(e) => setCodigoAccion(e.target.value)}
              placeholder="Ej: CA-2025-001"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Código de identificación del código de acción (opcional)
            </p>
          </div>
          
          {/* Expediente */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Expediente
            </label>
            <input
              type="text"
              value={expediente}
              onChange={(e) => setExpediente(e.target.value)}
              placeholder="Ej: EXP-2025-OEFA-123"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Número de expediente asociado (opcional)
            </p>
          </div>
          
          {/* Vista previa */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">Vista previa:</p>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                {mapTitle || 'Mapa de Capas'}
              </div>
              {codigoAccion && (
                <div className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Código de Acción:</span> {codigoAccion}
                </div>
              )}
              {expediente && (
                <div className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Expediente:</span> {expediente}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  )
}
