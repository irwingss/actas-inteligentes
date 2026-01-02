import React, { useState, useEffect } from 'react'
import { X, Save, Settings2 } from 'lucide-react'

/**
 * Panel de configuración para personalizar una capa
 */
export function LayerSettings({ 
  layer, 
  config = {}, 
  availableFields = [],
  onSave,
  onClose 
}) {
  const [legendField, setLegendField] = useState(config.legendField || '')
  const [labelField, setLabelField] = useState(config.labelField || config.legendField || '')
  const [markerType, setMarkerType] = useState(config.markerType || 'circle')
  const [markerColor, setMarkerColor] = useState(config.markerColor || '#3b82f6')
  const [markerSize, setMarkerSize] = useState(config.markerSize || 8)
  const [layerName, setLayerName] = useState(config.layerName || '')
  
  const isSurvey = layer.id === '__survey123__'
  
  const handleSave = () => {
    onSave({
      legendField,
      labelField,
      markerType,
      markerColor,
      markerSize,
      layerName
    })
    onClose()
  }
  
  const markerTypes = [
    { value: 'circle', label: '● Círculo', icon: '●' },
    { value: 'marker', label: '📍 Pin', icon: '📍' },
    { value: 'dot', label: '• Punto', icon: '•' }
  ]
  
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Configurar Capa
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Nombre de la capa */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Capa
            </label>
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-slate-100">
              {layer.name}
            </div>
          </div>
          
          {/* Nombre personalizado para leyenda de exportación (solo Survey123) */}
          {isSurvey && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nombre en Leyenda de Exportación
              </label>
              <input
                type="text"
                value={layerName}
                onChange={(e) => setLayerName(e.target.value)}
                placeholder="Ej: Puntos de muestreo"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Este nombre aparecerá en la leyenda del modo presentación
              </p>
            </div>
          )}
          
          {/* Campo de Leyenda (colores) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Campo para Leyenda (Colores)
            </label>
            <select
              value={legendField}
              onChange={(e) => setLegendField(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Automático --</option>
              {availableFields.map(field => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Define qué campo se usa para asignar colores únicos
            </p>
          </div>
          
          {/* Campo de Etiquetas (texto) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Campo para Etiquetas (Texto)
            </label>
            <select
              value={labelField}
              onChange={(e) => setLabelField(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Mismo que leyenda --</option>
              {availableFields.map(field => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Define qué campo se muestra en las etiquetas de texto
            </p>
          </div>
          
          {/* Tipo de Marcador */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Tipo de Marcador (solo puntos)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {markerTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setMarkerType(type.value)}
                  className={`px-3 py-2 rounded-lg border-2 transition-all ${
                    markerType === type.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="text-2xl mb-1">{type.icon}</div>
                  <div className="text-xs">{type.label.split(' ')[1]}</div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Color del Marcador */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Color del Marcador
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={markerColor}
                onChange={(e) => setMarkerColor(e.target.value)}
                className="w-16 h-10 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
              />
              <input
                type="text"
                value={markerColor}
                onChange={(e) => setMarkerColor(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Color base para marcadores de esta capa
            </p>
          </div>
          
          {/* Tamaño del Marcador */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tamaño del Marcador: {markerSize}px
            </label>
            <input
              type="range"
              min="4"
              max="16"
              step="1"
              value={markerSize}
              onChange={(e) => setMarkerSize(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span>Pequeño</span>
              <span>Grande</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  )
}
