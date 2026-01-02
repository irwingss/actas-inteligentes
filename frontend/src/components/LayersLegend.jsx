import React, { useState } from 'react'
import { ListOrdered, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { ColorPicker } from './ColorPicker'

/**
 * Leyenda de colores para capas GeoJSON
 * @param {Object} props
 * @param {Object} props.geojsonData - Datos GeoJSON {layerId: FeatureCollection}
 * @param {Object} props.visibleLayers - Estado de visibilidad {layerId: boolean}
 * @param {Array} props.availableLayers - Lista de capas disponibles
 * @param {Object} props.visibleFeatures - Estado de visibilidad de features {layerId: {featureIndex: boolean}}
 * @param {Function} props.onFeatureClick - Callback cuando se hace click en un feature
 * @param {Function} props.onToggleFeature - Callback para toggle de feature individual
 */
export function LayersLegend({ 
  geojsonData = {}, 
  visibleLayers = {}, 
  availableLayers = [], 
  visibleFeatures = {},
  layerConfigs = {},
  customColors = {},
  onFeatureClick,
  onToggleFeature,
  onHideAll,
  onShowAll,
  onClose,
  onColorChange,
  isExpanded = false
}) {
  // Estado para el color picker y su elemento ancla
  const [colorPickerData, setColorPickerData] = useState(null)
  const [colorPickerAnchor, setColorPickerAnchor] = useState(null)
  const [expandedLayers, setExpandedLayers] = useState({}) // {layerId: boolean}
  
  // Generar paleta de colores (MISMO algoritmo que en MapView)
  const generateColors = (count) => {
    // Paleta base profesional de 24 colores altamente distinguibles
    // Basada en paletas categóricas de Tableau, D3 y ColorBrewer optimizadas
    const basePalette = [
      '#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
      '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
      '#9A6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
      '#000075', '#a9a9a9', '#ff6347', '#00ced1', '#ff1493', '#00ff7f'
    ]
    
    if (count <= 24) {
      return basePalette.slice(0, count)
    }
    
    // Para muchos colores (>24), usar estrategia de múltiples pasadas
    // Combina: hue uniforme + variaciones de saturación/luminosidad estratégicas
    const colors = [...basePalette] // Empezar con los 24 base
    const remaining = count - 24
    const goldenRatio = 0.618033988749895
    
    // Generar colores adicionales en múltiples pasadas
    // Pasada 1: Hues intermedios con saturación alta
    const pass1Count = Math.ceil(remaining / 3)
    for (let i = 0; i < pass1Count; i++) {
      const hue = ((24 + i) * goldenRatio * 360) % 360
      colors.push(`hsl(${Math.round(hue)}, 85%, 45%)`)
    }
    
    // Pasada 2: Hues con saturación media y luminosidad diferente
    const pass2Count = Math.ceil(remaining / 3)
    for (let i = 0; i < pass2Count; i++) {
      const hue = ((24 + pass1Count + i) * goldenRatio * 360 + 180) % 360
      colors.push(`hsl(${Math.round(hue)}, 70%, 55%)`)
    }
    
    // Pasada 3: Completar con variaciones adicionales
    const pass3Count = remaining - pass1Count - pass2Count
    for (let i = 0; i < pass3Count; i++) {
      const hue = ((24 + pass1Count + pass2Count + i) * goldenRatio * 360 + 90) % 360
      colors.push(`hsl(${Math.round(hue)}, 75%, 40%)`)
    }
    
    return colors.slice(0, count)
  }
  
  // Obtener CATEGORÍAS agrupadas POR CAPA
  const layersWithCategories = []
  
  availableLayers.forEach(layer => {
    if (visibleLayers[layer.id]) {
      const data = geojsonData[layer.id]
      const layerVisibleFeatures = visibleFeatures[layer.id] || {}
      
      if (data?.features) {
        // Agrupar features por categoría
        const categoryMap = new Map()
        
        data.features.forEach((feature, index) => {
          // Usar el campo de leyenda configurado (personalizado o por defecto)
          let categoryValue = null
          const config = layerConfigs[layer.id] || {}
          const legendField = config.legendField || layer.legendField
          
          if (legendField && feature.properties?.[legendField]) {
            categoryValue = feature.properties[legendField]
          } else {
            // Fallback a campos comunes
            categoryValue = feature.properties?.NOMBRE ||
                           feature.properties?.UF_nombre || 
                           feature.properties?.UNIDAD_FIS || 
                           feature.properties?.name ||
                           'Sin categoría'
          }
          
          if (!categoryMap.has(categoryValue)) {
            categoryMap.set(categoryValue, [])
          }
          
          categoryMap.get(categoryValue).push({
            feature: feature,
            featureIndex: index,
            isVisible: layerVisibleFeatures[index] !== false
          })
        })
        
        // Generar colores para categorías únicas de esta capa (ORDENADAS ALFABÉTICAMENTE PRIMERO)
        const uniqueCategories = Array.from(categoryMap.keys()).sort((a, b) => 
          a.localeCompare(b, 'es', { sensitivity: 'base' })
        )
        const colors = generateColors(uniqueCategories.length)
        
        // Crear lista de categorías para esta capa (ya ordenadas)
        const categories = uniqueCategories.map((categoryValue, catIndex) => {
          const categoryFeatures = categoryMap.get(categoryValue)
          const visibleCount = categoryFeatures.filter(f => f.isVisible).length
          const totalCount = categoryFeatures.length
          const allVisible = visibleCount === totalCount
          const someVisible = visibleCount > 0 && visibleCount < totalCount
          
          // Usar color personalizado si existe, sino usar color generado
          const categoryKey = `${layer.id}-${categoryValue}`
          const color = customColors[categoryKey] || colors[catIndex]
          
          return {
            category: categoryValue,
            categoryKey: categoryKey,
            color: color,
            features: categoryFeatures,
            allVisible: allVisible,
            someVisible: someVisible,
            visibleCount: visibleCount,
            totalCount: totalCount
          }
        })
        
        // Ya no es necesario ordenar porque ya están ordenadas desde el principio
        
        layersWithCategories.push({
          layerId: layer.id,
          layerName: layer.name,
          categories: categories
        })
      }
    }
  })
  
  if (layersWithCategories.length === 0) {
    return null
  }
  
  // Total de categorías
  const totalCategories = layersWithCategories.reduce((sum, layer) => sum + layer.categories.length, 0)
  
  if (!isExpanded) {
    return null // El botón se maneja desde MapView
  }
  
  return (
    <div className="w-full max-w-xs">
      {isExpanded ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            {/* Título y botón cerrar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Leyenda
                </h3>
              </div>
              <button
                onClick={(e) => { e.preventDefault(); onClose(); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                title="Minimizar"
              >
                <ChevronUp className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
          
          {/* Lista de capas y sus categorías */}
          <div className="overflow-y-auto flex-1">
            {layersWithCategories.map((layer) => {
              const isExpanded = expandedLayers[layer.layerId] !== false // Por defecto expandido
              
              // Funciones para esta capa
              const handleShowAllInLayer = (e) => {
                e.stopPropagation()
                layer.categories.forEach(cat => {
                  cat.features.forEach(f => {
                    onToggleFeature && onToggleFeature(layer.layerId, f.featureIndex, true)
                  })
                })
              }
              
              const handleHideAllInLayer = (e) => {
                e.stopPropagation()
                layer.categories.forEach(cat => {
                  cat.features.forEach(f => {
                    onToggleFeature && onToggleFeature(layer.layerId, f.featureIndex, false)
                  })
                })
              }
              
              return (
                <div key={layer.layerId} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                  {/* Header de la capa */}
                  <div className="bg-slate-50 dark:bg-slate-700/50">
                    <button
                      onClick={() => setExpandedLayers(prev => ({ ...prev, [layer.layerId]: !isExpanded }))}
                      className="w-full px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {layer.layerName}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {layer.categories.length} cat.
                      </span>
                    </button>
                    
                    {/* Botones de acción por capa */}
                    {isExpanded && (
                      <div className="px-4 pb-2 flex gap-2">
                        <button
                          onClick={handleShowAllInLayer}
                          className="flex-1 px-2 py-1 text-[10px] font-medium bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 rounded transition-colors flex items-center justify-center gap-1"
                          title={`Mostrar todas las categorías de ${layer.layerName}`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Mostrar</span>
                        </button>
                        
                        <button
                          onClick={handleHideAllInLayer}
                          className="flex-1 px-2 py-1 text-[10px] font-medium bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded transition-colors flex items-center justify-center gap-1"
                          title={`Ocultar todas las categorías de ${layer.layerName}`}
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>Ocultar</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Lista de categorías de esta capa */}
                  {isExpanded && (
                    <div>
                      {layer.categories.map((item, catIndex) => (
                        <div
                          key={`${layer.layerId}-${item.category}-${catIndex}`}
                          className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {/* Toggle de visibilidad de toda la categoría */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Toggle todos los features de esta categoría
                                item.features.forEach(f => {
                                  onToggleFeature && onToggleFeature(layer.layerId, f.featureIndex)
                                })
                              }}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors flex-shrink-0"
                              title={item.allVisible ? 'Ocultar categoría' : 'Mostrar categoría'}
                            >
                              {item.allVisible ? (
                                <Eye className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              ) : item.someVisible ? (
                                <Eye className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                            
                            {/* Cuadro de color (clickeable para cambiar) */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setColorPickerAnchor(e.currentTarget)
                                setColorPickerData({
                                  categoryKey: item.categoryKey,
                                  categoryName: item.category,
                                  currentColor: item.color,
                                  layerId: layer.layerId
                                })
                              }}
                              className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 hover:border-blue-500 hover:scale-110 transition-all cursor-pointer"
                              style={{ 
                                backgroundColor: item.color,
                                opacity: item.allVisible ? 1 : item.someVisible ? 0.6 : 0.3
                              }}
                              title="Click para cambiar color"
                            />
                            
                            {/* Nombre de categoría clickeable para zoom al primer feature */}
                            <button
                              onClick={() => onFeatureClick && onFeatureClick(item.features[0].feature, layer.layerId)}
                              className="flex-1 min-w-0 text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title={`Click para hacer zoom a ${item.category}`}
                            >
                              <div className={`text-xs font-medium truncate ${
                                item.allVisible
                                  ? 'text-slate-700 dark:text-slate-300' 
                                  : item.someVisible
                                  ? 'text-slate-600 dark:text-slate-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}>
                                {item.category}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {item.totalCount} polígono{item.totalCount !== 1 ? 's' : ''}
                              </div>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
            {totalCategories} {totalCategories === 1 ? 'categoría' : 'categorías'} en {layersWithCategories.length} {layersWithCategories.length === 1 ? 'capa' : 'capas'}
          </div>
        </div>
      ) : null}
      
      {/* Color Picker Popover */}
      {colorPickerData && colorPickerAnchor && (
        <ColorPicker
          initialColor={colorPickerData.currentColor}
          categoryName={colorPickerData.categoryName}
          anchorEl={colorPickerAnchor}
          onSave={(newColor) => {
            onColorChange && onColorChange(colorPickerData.categoryKey, newColor)
            setColorPickerData(null)
            setColorPickerAnchor(null)
          }}
          onClose={() => {
            setColorPickerData(null)
            setColorPickerAnchor(null)
          }}
        />
      )}
    </div>
  )
}
