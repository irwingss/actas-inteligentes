import React, { useState } from 'react'
import { Layers, Eye, EyeOff, ChevronDown, ChevronRight, ChevronUp, Plus, Trash2, ExternalLink, Type, MapPin, Settings2 } from 'lucide-react'

/**
 * Control de capas GeoJSON
 * @param {Object} props
 * @param {Array} props.layers - Array de capas disponibles
 * @param {Object} props.visibleLayers - Estado de visibilidad {layerId: boolean}
 * @param {Object} props.layerLabels - Estado de etiquetas {layerId: boolean}
 * @param {Function} props.onToggleLayer - Callback cuando se toggle una capa
 * @param {Function} props.onToggleLabels - Callback cuando se toggle etiquetas
 * @param {Function} props.onUploadClick - Callback cuando se presiona el botón de subir
 * @param {Function} props.onDeleteClick - Callback cuando se presiona eliminar capa
 */
export function LayersControl({ 
  layers = [], 
  visibleLayers = {}, 
  layerLabels = {}, 
  onToggleLayer, 
  onToggleLabels, 
  onUploadClick,
  onDeleteClick, 
  onClose, 
  isExpanded = false,
  surveyPointsCount = 0,
  showSurveyPoints = true,
  onToggleSurveyPoints,
  onSettingsClick,
  onSurveySettingsClick,
  onMoveUp,
  onMoveDown
}) {
  
  if (layers.length === 0 && surveyPointsCount === 0) {
    return null
  }
  if (!isExpanded) {
    return null // El botón se maneja desde MapView
  }
  
  return (
    <div className="w-full">
      {isExpanded ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Capas TopoJSON
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => window.open('https://mapshaper.org/', '_blank', 'noopener,noreferrer')}
                className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors group"
                title="Convertir SHP a TopoJSON (Mapshaper)"
              >
                <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
              </button>
              <button
                onClick={onUploadClick}
                className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors group"
                title="Subir TopoJSON"
              >
                <Plus className="w-4 h-4 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform" />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); onClose(); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title="Minimizar"
              >
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
          
          {/* Lista de capas */}
          <div className="max-h-96 overflow-y-auto">
            {/* Capa especial: Puntos de Survey123/Código de Acción */}
            {surveyPointsCount > 0 && (
              <div
                className="flex items-center gap-2 px-4 py-3 border-b-2 border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10"
              >
                <button
                  onClick={() => onToggleSurveyPoints(!showSurveyPoints)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  {showSurveyPoints ? (
                    <Eye className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className={`text-sm font-semibold ${
                      showSurveyPoints 
                        ? 'text-blue-700 dark:text-blue-300' 
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      Puntos de Código de Acción
                    </span>
                  </div>
                </button>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded">
                  {surveyPointsCount}
                </span>
                {/* Botón de configuración para puntos Survey123 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSurveySettingsClick()
                  }}
                  className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded transition-colors group"
                  title="Configurar puntos"
                >
                  <Settings2 className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            )}
            
            {/* Capas TopoJSON */}
            {layers.map((layer, index) => {
              const isVisible = visibleLayers[layer.id] !== false // Por defecto visible
              const labelsVisible = layerLabels[layer.id] || false
              const isFirst = index === 0
              const isLast = index === layers.length - 1
              
              return (
                <div
                  key={layer.id}
                  className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  {/* Botones de reordenamiento */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveUp && onMoveUp(index)
                      }}
                      disabled={isFirst}
                      className={`p-0.5 rounded transition-colors ${
                        isFirst
                          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                          : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                      title={isFirst ? 'Ya está al inicio' : 'Mover arriba (se verá encima)'}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveDown && onMoveDown(index)
                      }}
                      disabled={isLast}
                      className={`p-0.5 rounded transition-colors ${
                        isLast
                          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                          : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                      title={isLast ? 'Ya está al final' : 'Mover abajo (se verá debajo)'}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => onToggleLayer(layer.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    {isVisible ? (
                      <Eye className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${
                      isVisible 
                        ? 'text-slate-700 dark:text-slate-300' 
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {layer.name}
                    </span>
                  </button>
                  
                  {/* Botón de etiquetas (solo si la capa es visible) */}
                  {isVisible && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleLabels(layer.id)
                      }}
                      className={`p-1.5 rounded transition-colors group ${
                        labelsVisible
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                      title={labelsVisible ? 'Ocultar etiquetas' : 'Mostrar etiquetas'}
                    >
                      <Type className={`w-4 h-4 transition-colors ${
                        labelsVisible
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                      }`} />
                    </button>
                  )}
                  
                  {/* Botón de configuración */}
                  {isVisible && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSettingsClick(layer)
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-600 rounded transition-colors group"
                      title="Configurar capa"
                    >
                      <Settings2 className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                    </button>
                  )}
                  
                  {/* Botón de eliminar (solo para capas de usuario) */}
                  {layer.canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteClick(layer)
                      }}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors group"
                      title="Eliminar capa"
                    >
                      <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Footer con info */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-400 rounded-b-lg">
            {surveyPointsCount > 0 && (
              <div className="mb-1">
                {surveyPointsCount} punto{surveyPointsCount !== 1 ? 's' : ''} del Código de Acción
              </div>
            )}
            <div>
              {layers.length} capa{layers.length !== 1 ? 's' : ''} TopoJSON
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
