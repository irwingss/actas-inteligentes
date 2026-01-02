import React from 'react'
import { Map, Check, ChevronUp } from 'lucide-react'

/**
 * Selector de mapas base con múltiples opciones
 */
export function BasemapSelector({ 
  currentBasemap,
  onSelect,
  onClose,
  isExpanded = false 
}) {
  
  const basemaps = [
    {
      id: 'osm',
      name: 'OpenStreetMap',
      description: 'Mapa estándar de calles',
      thumbnail: '🗺️',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    },
    {
      id: 'google-satellite',
      name: 'Google Satellite',
      description: 'Imágenes satelitales de alta resolución',
      thumbnail: '🛰️',
      url: 'https://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}',
      attribution: '© Google',
      maxZoom: 20
    },
    {
      id: 'google-hybrid',
      name: 'Google Hybrid',
      description: 'Satélite con etiquetas',
      thumbnail: '🗺️',
      url: 'https://www.google.cn/maps/vt?lyrs=y@189&gl=cn&x={x}&y={y}&z={z}',
      attribution: '© Google',
      maxZoom: 20
    },
    {
      id: 'google-streets',
      name: 'Google Streets',
      description: 'Calles y rutas de Google',
      thumbnail: '🚗',
      url: 'https://www.google.cn/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}',
      attribution: '© Google',
      maxZoom: 20
    },
    {
      id: 'google-terrain',
      name: 'Google Terrain',
      description: 'Terreno con relieve',
      thumbnail: '⛰️',
      url: 'https://www.google.cn/maps/vt?lyrs=p@189&gl=cn&x={x}&y={y}&z={z}',
      attribution: '© Google',
      maxZoom: 20
    },
    {
      id: 'esri-satellite',
      name: 'ESRI World Imagery',
      description: 'Imágenes satelitales globales',
      thumbnail: '🌍',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri',
      maxZoom: 19
    },
    {
      id: 'esri-topo',
      name: 'ESRI Topographic',
      description: 'Mapa topográfico detallado',
      thumbnail: '🗻',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri',
      maxZoom: 19
    },
    {
      id: 'carto-dark',
      name: 'CartoDB Dark',
      description: 'Tema oscuro minimalista',
      thumbnail: '🌙',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '© CartoDB',
      maxZoom: 19
    },
    {
      id: 'carto-light',
      name: 'CartoDB Light',
      description: 'Tema claro minimalista',
      thumbnail: '☀️',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '© CartoDB',
      maxZoom: 19
    }
  ]
  
  if (!isExpanded) {
    return null
  }
  
  return (
    <div className="w-full max-w-sm">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-h-[500px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Mapa Base
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
        
        {/* Lista de mapas base */}
        <div className="overflow-y-auto flex-1">
          {basemaps.map((basemap) => {
            const isSelected = currentBasemap === basemap.id
            
            return (
              <button
                key={basemap.id}
                onClick={() => {
                  onSelect(basemap)
                  onClose()
                }}
                className={`w-full px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Emoji/Thumbnail */}
                  <div className="text-2xl flex-shrink-0">
                    {basemap.thumbnail}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${
                        isSelected
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {basemap.name}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {basemap.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
          {basemaps.length} mapas disponibles
        </div>
      </div>
    </div>
  )
}

// Exportar también la lista de basemaps para uso en MapView
export const BASEMAPS = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  {
    id: 'google-satellite',
    name: 'Google Satellite',
    url: 'https://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20
  },
  {
    id: 'google-hybrid',
    name: 'Google Hybrid',
    url: 'https://www.google.cn/maps/vt?lyrs=y@189&gl=cn&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20
  },
  {
    id: 'google-streets',
    name: 'Google Streets',
    url: 'https://www.google.cn/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20
  },
  {
    id: 'google-terrain',
    name: 'Google Terrain',
    url: 'https://www.google.cn/maps/vt?lyrs=p@189&gl=cn&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 20
  },
  {
    id: 'esri-satellite',
    name: 'ESRI World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 19
  },
  {
    id: 'esri-topo',
    name: 'ESRI Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 19
  },
  {
    id: 'carto-dark',
    name: 'CartoDB Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CartoDB</a>',
    maxZoom: 19
  },
  {
    id: 'carto-light',
    name: 'CartoDB Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CartoDB</a>',
    maxZoom: 19
  }
]
