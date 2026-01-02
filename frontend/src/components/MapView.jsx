import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap, GeoJSON, ScaleControl } from 'react-leaflet'
import { Icon, circleMarker as L_circleMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import proj4 from 'proj4'
import api from '../lib/axios'
import * as topojson from 'topojson-client'
import { Maximize2, Minimize2, MapPin, Info, ChevronDown, ChevronUp, ListOrdered, Layers, Map as MapIcon, FileText, Settings, Camera } from 'lucide-react'
import { Lightbox } from './Lightbox'
import { MapSidebar } from './MapSidebar'
import { LayersControl } from './LayersControl'
import { LayersLegend } from './LayersLegend'
import { TopoJSONUploadWizard } from './TopoJSONUploadWizard'
import { DeleteLayerConfirm } from './DeleteLayerConfirm'
import { LayerSettings } from './LayerSettings'
import { BasemapSelector, BASEMAPS } from './BasemapSelector'
import { NorthArrow } from './NorthArrow'
import { CartographicLegend } from './CartographicLegend'
import { MapConfigModal } from './MapConfigModal'

/**
 * Componente helper para capturar la referencia del mapa y hacer zoom
 */
function MapController({ selectedMarker, mapRef }) {
  const map = useMap()
  
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  
  useEffect(() => {
    if (selectedMarker && map) {
      map.flyTo([selectedMarker.lat, selectedMarker.lon], 16, { duration: 1.5 })
    }
  }, [selectedMarker, map])
  
  return null
}

// Fix default marker icon issue with Leaflet + Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Icono azul por defecto
const blueIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

// Icono rojo para punto seleccionado (más grande para destacar)
const redIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49]
})

/**
 * Componente auxiliar para ajustar límites del mapa (solo una vez)
 */
function FitBounds({ bounds }) {
  const map = useMap()
  const [hasAdjusted, setHasAdjusted] = useState(false)
  
  useEffect(() => {
    if (bounds && bounds.length > 0 && !hasAdjusted) {
      try {
        map.fitBounds(bounds, { padding: [50, 50] })
        setHasAdjusted(true)
      } catch (err) {
        console.warn('[FitBounds] Error ajustando límites:', err)
      }
    }
  }, [bounds, map, hasAdjusted])
  
  // Reset cuando cambien los bounds
  useEffect(() => {
    setHasAdjusted(false)
  }, [JSON.stringify(bounds)])
  
  return null
}

/**
 * Convierte coordenadas UTM a WGS84 (lat/lon)
 * @param {string|number} este - Coordenada Este UTM
 * @param {string|number} norte - Coordenada Norte UTM
 * @param {string|number} zona - Zona UTM (ej: "18", "19")
 * @returns {{ lat: number, lon: number } | null}
 */
function utmToLatLon(este, norte, zona) {
  try {
    const esteNum = parseFloat(este)
    const norteNum = parseFloat(norte)
    const zonaNum = parseInt(zona)
    
    if (!Number.isFinite(esteNum) || !Number.isFinite(norteNum) || !Number.isFinite(zonaNum)) {
      return null
    }
    
    // Definir proyecciones
    // WGS84 (lat/lon estándar)
    const wgs84 = 'EPSG:4326'
    
    // UTM para Perú (hemisferio sur)
    // Usar +south para indicar hemisferio sur
    const utmProj = `+proj=utm +zone=${zonaNum} +south +datum=WGS84 +units=m +no_defs`
    
    // Convertir coordenadas UTM a lat/lon
    const [lon, lat] = proj4(utmProj, wgs84, [esteNum, norteNum])
    
    // Validar que las coordenadas estén en rango razonable para Perú
    // Perú está aproximadamente entre lat -18° y 0°, lon -82° y -68°
    if (lat < -20 || lat > 2 || lon < -85 || lon > -65) {
      console.warn('[MapView] Coordenadas fuera de rango de Perú:', { lat, lon, este: esteNum, norte: norteNum, zona: zonaNum })
      return null
    }
    
    return { lat, lon }
  } catch (error) {
    console.warn('[MapView] Error convirtiendo UTM a lat/lon:', error)
    return null
  }
}

/**
 * Componente de mapa que muestra puntos georreferenciados
 * @param {Object} props
 * @param {Array} props.records - Registros con coordenadas UTM (este, norte, zona)
 * @param {string} props.codigoAccion - Código de acción para URLs permanentes
 * @param {string} props.selectedGlobalId - GlobalId del registro a seleccionar y hacer zoom
 */
export function MapView({ records = [], codigoAccion, selectedGlobalId = null }) {
  const [markers, setMarkers] = useState([])
  const [bounds, setBounds] = useState(null)
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [allPhotos, setAllPhotos] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Estados para capas GeoJSON
  const [availableLayers, setAvailableLayers] = useState([])
  const [geojsonData, setGeojsonData] = useState({})
  const [visibleLayers, setVisibleLayers] = useState({})
  const [visibleFeatures, setVisibleFeatures] = useState({}) // {layerId: {featureIndex: boolean}}
  const [layerLabels, setLayerLabels] = useState({}) // {layerId: boolean} - controla visibilidad de etiquetas
  const [showSurveyPoints, setShowSurveyPoints] = useState(true) // Controlar visibilidad de puntos Survey123
  
  // Configuraciones personalizadas por capa
  const [layerConfigs, setLayerConfigs] = useState({}) // {layerId: {legendField, labelField, markerType, markerColor, markerSize}}
  const [surveyConfig, setSurveyConfig] = useState({ // Configuración para puntos Survey123
    markerType: 'marker',
    markerColor: '#ef4444',
    markerSize: 10
  })
  const [customColors, setCustomColors] = useState({}) // {categoryKey: color} - Colores personalizados por categoría
  
  // Control de ventanas emergentes (solo una abierta a la vez)
  const [openPanel, setOpenPanel] = useState(null) // 'legend' | 'layers' | 'info' | 'sidebar' | 'basemap' | null
  
  // Mapa base seleccionado
  const [currentBasemap, setCurrentBasemap] = useState('osm')
  
  // Modo de presentación cartográfico
  const [presentationMode, setPresentationMode] = useState(false)
  const [showMapConfig, setShowMapConfig] = useState(false)
  const [mapMetadata, setMapMetadata] = useState({
    mapTitle: 'Mapa de Capas',
    codigoAccion: '',
    expediente: ''
  })
  const [presentationHiddenCategories, setPresentationHiddenCategories] = useState({})
  
  // Estado para el wizard de subida
  const [showUploadWizard, setShowUploadWizard] = useState(false)
  
  // Estado para confirmación de eliminación
  const [layerToDelete, setLayerToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Estado para modal de configuración
  const [layerToConfig, setLayerToConfig] = useState(null)
  const [showSurveySettings, setShowSurveySettings] = useState(false)
  
  const mapRef = React.useRef(null)
  const mapContainerRef = React.useRef(null)
  
  // Definir iconos para marcadores
  const defaultIcon = new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })
  
  const selectedIcon = new Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })
  
  // Crear icono personalizado basado en configuración
  const createCustomIcon = (config, isSelected = false) => {
    const { markerType = 'marker', markerColor = '#ef4444', markerSize = 10 } = config
    
    // Usar color más intenso para seleccionado
    const color = isSelected ? '#dc2626' : markerColor
    
    let svg = ''
    let iconSize = []
    let iconAnchor = []
    let popupAnchor = []
    let shadowSize = []
    let shadowUrl = null
    
    if (markerType === 'circle') {
      // Círculo relleno con borde
      const radius = markerSize
      const size = radius * 2 + 4
      svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" 
                  fill="${color}" 
                  stroke="${isSelected ? '#fff' : '#334155'}" 
                  stroke-width="2"
                  opacity="${isSelected ? 1 : 0.9}"/>
        </svg>
      `.trim()
      iconSize = [size, size]
      iconAnchor = [size / 2, size / 2]
      popupAnchor = [0, -size / 2]
      shadowSize = [0, 0]
      
    } else if (markerType === 'dot') {
      // Punto pequeño con borde brillante
      const radius = Math.max(4, markerSize / 2)
      const size = radius * 2 + 6
      svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${radius + 2}" 
                  fill="#fff" 
                  opacity="0.6"/>
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" 
                  fill="${color}" 
                  stroke="#fff" 
                  stroke-width="1.5"
                  opacity="${isSelected ? 1 : 0.95}"/>
        </svg>
      `.trim()
      iconSize = [size, size]
      iconAnchor = [size / 2, size / 2]
      popupAnchor = [0, -size / 2]
      shadowSize = [0, 0]
      
    } else {
      // Pin/Marker por defecto
      const size = markerSize * 2.5
      const height = markerSize * 4.1
      svg = `
        <svg width="${size}" height="${height}" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" 
                fill="${color}" 
                stroke="#fff" 
                stroke-width="2"/>
          <circle cx="12.5" cy="12.5" r="5" fill="#fff" opacity="0.8"/>
        </svg>
      `.trim()
      iconSize = [size, height]
      iconAnchor = [size / 2, height]
      popupAnchor = [1, -height + 10]
      shadowSize = [height, height]
      shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
    }
    
    const iconUrl = 'data:image/svg+xml;base64,' + btoa(svg)
    
    return new Icon({
      iconUrl,
      shadowUrl,
      iconSize,
      iconAnchor,
      popupAnchor,
      shadowSize
    })
  }
  
  // Log del codigoAccion para debugging
  useEffect(() => {
    console.log('[MapView] 🆕 Código de acción recibido:', codigoAccion)
  }, [codigoAccion])
  
  // Generar paleta de colores distintos con máxima diferenciación visual
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
  
  // Convertir GeometryCollection/TopoJSON a FeatureCollection
  const convertToFeatureCollection = (data, layerName) => {
    // Si es TopoJSON, convertir primero
    if (data.type === 'Topology') {
      console.log('[MapView] Detectado TopoJSON, convirtiendo...')
      try {
        // TopoJSON puede tener múltiples objetos, usar el primero
        const objectKeys = Object.keys(data.objects)
        if (objectKeys.length > 0) {
          const firstKey = objectKeys[0]
          const geojson = topojson.feature(data, data.objects[firstKey])
          console.log('[MapView] ✅ TopoJSON convertido a GeoJSON')
          // Recursivamente convertir el resultado
          return convertToFeatureCollection(geojson, layerName)
        }
      } catch (error) {
        console.error('[MapView] Error convirtiendo TopoJSON:', error)
        return null
      }
    }
    
    // Si es GeometryCollection, convertir a FeatureCollection
    if (data.type === 'GeometryCollection' && Array.isArray(data.geometries)) {
      // Generar nombres automáticos solo si no hay propiedades
      const isYacimientos = layerName.toLowerCase().includes('yacimiento')
      
      return {
        type: 'FeatureCollection',
        features: data.geometries.map((geometry, index) => ({
          type: 'Feature',
          id: index,
          properties: {
            name: isYacimientos ? `Yacimiento ${index + 1}` : `Área ${index + 1}`,
            featureIndex: index // IMPORTANTE: Mantener índice original
          },
          geometry: geometry
        }))
      }
    }
    
    // Si ya es FeatureCollection, agregar featureIndex si no existe
    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      return {
        ...data,
        features: data.features.map((feature, index) => ({
          ...feature,
          properties: {
            ...feature.properties,
            featureIndex: feature.properties?.featureIndex ?? index // Preservar o agregar índice
          }
        }))
      }
    }
    
    // Si es un Feature único, envolverlo en FeatureCollection
    if (data.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [data]
      }
    }
    
    // Si es una geometría directa, envolverla
    if (data.type && ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(data.type)) {
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: data
        }]
      }
    }
    
    console.warn('[MapView] Formato GeoJSON no reconocido:', data)
    return null
  }
  
  // Cargar capas GeoJSON disponibles
  const loadLayers = async () => {
    try {
      const response = await api.get('/api/geojson/list')
      const layers = response.data.layers || []
      setAvailableLayers(layers)
      
      // Inicializar solo "Lotes Nacional" como visible por defecto
      const initialVisibility = {}
      layers.forEach(layer => {
        initialVisibility[layer.id] = layer.id === 'Lotes_Nacional' || layer.name === 'Lotes Nacional'
      })
      
      // Añadir capa especial de puntos Survey123 si hay registros
      if (records && records.length > 0) {
        initialVisibility['__survey123_points__'] = true
      }
      
      setVisibleLayers(initialVisibility)
      
      console.log('[MapView] 🗺️ Capas GeoJSON cargadas:', layers.length)
      
      // Cargar datos de cada capa
      for (const layer of layers) {
        try {
          const geoResponse = await api.get(layer.url)
          const rawData = geoResponse.data
          
          // Convertir a FeatureCollection si es necesario
          const featureCollection = convertToFeatureCollection(rawData, layer.name)
          
          if (featureCollection) {
            setGeojsonData(prev => ({
              ...prev,
              [layer.id]: featureCollection
            }))
            
            // Inicializar todos los features como visibles
            setVisibleFeatures(prev => {
              const layerFeatures = {}
              featureCollection.features.forEach((_, index) => {
                layerFeatures[index] = true
              })
              return {
                ...prev,
                [layer.id]: layerFeatures
              }
            })
            
            console.log(`[MapView] ✅ Capa cargada: ${layer.name} (${featureCollection.features.length} features)`)
          } else {
            console.warn(`[MapView] ⚠️ Capa inválida: ${layer.name}`)
          }
        } catch (error) {
          console.error(`[MapView] ❌ Error cargando capa ${layer.name}:`, error)
        }
      }
    } catch (error) {
      console.error('[MapView] Error cargando lista de capas:', error)
    }
  }
  
  useEffect(() => {
    loadLayers()
  }, [])
  
  // Handler para cuando se sube una nueva capa
  const handleUploadSuccess = (newLayer) => {
    console.log('[MapView] 📤 Nueva capa subida:', newLayer.name)
    // Recargar todas las capas
    loadLayers()
  }
  
  // Handler para toggle de etiquetas de capa
  const handleToggleLabels = (layerId) => {
    setLayerLabels(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }))
  }
  
  // Guardar configuración de una capa
  const handleSaveLayerConfig = (layerId, config) => {
    setLayerConfigs(prev => ({
      ...prev,
      [layerId]: config
    }))
    console.log('[MapView] ⚙️ Configuración guardada para capa:', layerId, config)
  }
  
  // Guardar configuración de puntos Survey123
  const handleSaveSurveyConfig = (config) => {
    setSurveyConfig(config)
    console.log('[MapView] ⚙️ Configuración guardada para puntos Survey123:', config)
  }
  
  // Obtener campos disponibles de una capa
  const getLayerFields = (layerId) => {
    const data = geojsonData[layerId]
    if (!data) return []
    
    const fields = new Set()
    
    try {
      if (data.type === 'FeatureCollection' && data.features) {
        data.features.forEach(feature => {
          if (feature.properties) {
            Object.keys(feature.properties).forEach(key => {
              // Excluir campos técnicos
              if (!['featureIndex', 'Shape_Leng', 'Shape_Area', 'OBJECTID'].includes(key)) {
                fields.add(key)
              }
            })
          }
        })
      }
    } catch (err) {
      console.warn('[MapView] Error extrayendo campos:', err)
    }
    
    return Array.from(fields).sort()
  }
  
  // Obtener campos disponibles de puntos Survey123
  const getSurveyFields = () => {
    if (!markers || markers.length === 0) return []
    
    const fields = new Set()
    
    try {
      markers.forEach(marker => {
        if (marker.data) {
          Object.keys(marker.data).forEach(key => {
            // Excluir campos técnicos y de coordenadas
            const excludeFields = [
              'objectid', 'OBJECTID', 
              'globalid', 'GLOBALID',
              'este', 'Este', 'ESTE',
              'norte', 'Norte', 'NORTE',
              'zona', 'Zona', 'ZONA',
              'Shape_Leng', 'Shape_Area'
            ]
            
            if (!excludeFields.includes(key)) {
              fields.add(key)
            }
          })
        }
      })
    } catch (err) {
      console.warn('[MapView] Error extrayendo campos de Survey123:', err)
    }
    
    return Array.from(fields).sort()
  }
  
  // Cambiar color personalizado de una categoría
  const handleColorChange = (categoryKey, newColor) => {
    setCustomColors(prev => ({
      ...prev,
      [categoryKey]: newColor
    }))
    console.log('[MapView] 🎨 Color personalizado guardado:', categoryKey, newColor)
  }
  
  // Mover capa hacia arriba (se renderizará encima)
  const handleMoveLayerUp = (index) => {
    if (index <= 0) return
    
    setAvailableLayers(prev => {
      const newLayers = [...prev]
      // Intercambiar con el elemento anterior
      const temp = newLayers[index - 1]
      newLayers[index - 1] = newLayers[index]
      newLayers[index] = temp
      console.log('[MapView] ⬆️ Capa movida arriba:', newLayers[index - 1].name)
      return newLayers
    })
  }
  
  // Mover capa hacia abajo (se renderizará debajo)
  const handleMoveLayerDown = (index) => {
    setAvailableLayers(prev => {
      if (index >= prev.length - 1) return prev
      
      const newLayers = [...prev]
      // Intercambiar con el elemento siguiente
      const temp = newLayers[index + 1]
      newLayers[index + 1] = newLayers[index]
      newLayers[index] = temp
      console.log('[MapView] ⬇️ Capa movida abajo:', newLayers[index + 1].name)
      return newLayers
    })
  }
  
  // Generar lista de categorías para la leyenda cartográfica
  // Solo muestra categorías que tienen al menos un feature visible en la leyenda operativa
  const getCartographicCategories = () => {
    const categories = []
    
    // Añadir puntos Survey123 (si hay markers, aunque no estén visibles)
    if (markers.length > 0 && showSurveyPoints) {
      const legendField = surveyConfig.legendField
      const surveyName = surveyConfig.layerName || 'Puntos de muestreo'
      
      if (legendField) {
        // Si hay campo de leyenda, agrupar por categorías
        const categorySet = new Set()
        markers.forEach(m => {
          const value = m.data?.[legendField]
          if (value) categorySet.add(String(value))
        })
        
        const uniqueCategories = Array.from(categorySet).sort((a, b) => 
          a.localeCompare(b, 'es', { sensitivity: 'base' })
        )
        const colors = generateColors(uniqueCategories.length)
        
        uniqueCategories.forEach((categoryValue, idx) => {
          categories.push({
            key: `__survey123__-${categoryValue}`,
            name: categoryValue,
            color: colors[idx],
            layerName: surveyName,
            visible: showSurveyPoints,
            isSurvey: false // Tratar como categoría normal para agrupar correctamente
          })
        })
      } else {
        // Sin campo de leyenda, una sola entrada
        categories.push({
          key: '__survey123__',
          name: surveyName,
          color: surveyConfig.markerColor || '#ef4444',
          layerName: 'Survey123',
          visible: showSurveyPoints,
          isSurvey: true
        })
      }
    }
    
    availableLayers.forEach(layer => {
      if (visibleLayers[layer.id]) {
        const data = geojsonData[layer.id]
        const layerVisibleFeatures = visibleFeatures[layer.id] || {}
        
        if (data?.features) {
          const config = layerConfigs[layer.id] || {}
          const legendField = config.legendField || layer.legendField
          
          // Primero: obtener TODAS las categorías (visibles o no) para mantener orden de colores
          const allCategories = new Set()
          data.features.forEach((feature) => {
            let categoryValue = null
            
            if (legendField && feature.properties?.[legendField]) {
              categoryValue = feature.properties[legendField]
            } else {
              categoryValue = feature.properties?.NOMBRE ||
                             feature.properties?.UF_nombre || 
                             feature.properties?.UNIDAD_FIS || 
                             feature.properties?.name ||
                             'Sin categoría'
            }
            
            allCategories.add(categoryValue)
          })
          
          // Generar colores para TODAS las categorías (ordenadas alfabéticamente para mantener consistencia)
          const allCategoriesArray = Array.from(allCategories).sort((a, b) => 
            a.localeCompare(b, 'es', { sensitivity: 'base' })
          )
          const colors = generateColors(allCategoriesArray.length)
          
          // Crear mapeo de colores (igual que en el renderizado)
          const categoryColorMap = {}
          allCategoriesArray.forEach((category, index) => {
            const categoryKey = `${layer.id}-${category}`
            categoryColorMap[category] = customColors[categoryKey] || colors[index]
          })
          
          // Segundo: filtrar solo categorías visibles
          const visibleCategoryMap = new Map()
          
          data.features.forEach((feature, index) => {
            // Solo considerar features visibles en la leyenda operativa
            const isFeatureVisible = layerVisibleFeatures[index] !== false
            if (!isFeatureVisible) return
            
            let categoryValue = null
            
            if (legendField && feature.properties?.[legendField]) {
              categoryValue = feature.properties[legendField]
            } else {
              categoryValue = feature.properties?.NOMBRE ||
                             feature.properties?.UF_nombre || 
                             feature.properties?.UNIDAD_FIS || 
                             feature.properties?.name ||
                             'Sin categoría'
            }
            
            if (!visibleCategoryMap.has(categoryValue)) {
              visibleCategoryMap.set(categoryValue, [])
            }
            visibleCategoryMap.get(categoryValue).push(feature)
          })
          
          // Crear entradas solo para categorías visibles (pero con colores correctos)
          visibleCategoryMap.forEach((features, categoryValue) => {
            const categoryKey = `${layer.id}-${categoryValue}`
            const color = categoryColorMap[categoryValue] // Usar el color del mapa
            
            categories.push({
              key: categoryKey,
              name: categoryValue,
              color: color,
              layerName: layer.name,
              visible: presentationHiddenCategories[categoryKey] !== false
            })
          })
        }
      }
    })
    
    return categories
  }
  
  // Toggle categoría en leyenda cartográfica (solo visual, no afecta capas reales)
  const handleTogglePresentationCategory = (categoryKey) => {
    // Si es Survey123, toggle de visibilidad de puntos
    if (categoryKey === '__survey123__') {
      setShowSurveyPoints(prev => !prev)
      return
    }
    
    // Para otras categorías, toggle en presentationHiddenCategories
    setPresentationHiddenCategories(prev => ({
      ...prev,
      [categoryKey]: prev[categoryKey] === false ? true : false
    }))
  }
  
  // Handler para eliminar capa
  const handleDeleteLayer = async () => {
    if (!layerToDelete) return
    
    setIsDeleting(true)
    
    try {
      const response = await api.delete(`/api/geojson/delete/${layerToDelete.id}`)
      
      if (response.data.success) {
        console.log('[MapView] 🗑️ Capa eliminada:', layerToDelete.name)
        
        // Cerrar modal
        setLayerToDelete(null)
        
        // Recargar capas
        await loadLayers()
      } else {
        console.error('[MapView] Error eliminando capa:', response.data.error)
        alert('Error al eliminar la capa: ' + response.data.error)
      }
    } catch (error) {
      console.error('[MapView] Error eliminando capa:', error)
      alert('Error al eliminar la capa: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsDeleting(false)
    }
  }
  
  // Toggle visibilidad de capa
  const handleToggleLayer = (layerId) => {
    setVisibleLayers(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }))
  }
  
  // Toggle visibilidad de feature individual
  // forceState (opcional): true = mostrar, false = ocultar, undefined = toggle
  const handleToggleFeature = (layerId, featureIndex, forceState) => {
    setVisibleFeatures(prev => {
      const currentState = prev[layerId]?.[featureIndex]
      const newState = forceState !== undefined ? forceState : !currentState
      
      return {
        ...prev,
        [layerId]: {
          ...prev[layerId],
          [featureIndex]: newState
        }
      }
    })
  }
  
  // Ocultar todos los features de todas las capas
  const handleHideAllFeatures = () => {
    const newVisibleFeatures = {}
    
    availableLayers.forEach(layer => {
      if (visibleLayers[layer.id]) {
        const data = geojsonData[layer.id]
        if (data?.features) {
          newVisibleFeatures[layer.id] = {}
          data.features.forEach((_, index) => {
            newVisibleFeatures[layer.id][index] = false
          })
        }
      }
    })
    
    setVisibleFeatures(newVisibleFeatures)
  }
  
  // Mostrar todos los features de todas las capas
  const handleShowAllFeatures = () => {
    const newVisibleFeatures = {}
    
    availableLayers.forEach(layer => {
      if (visibleLayers[layer.id]) {
        const data = geojsonData[layer.id]
        if (data?.features) {
          newVisibleFeatures[layer.id] = {}
          data.features.forEach((_, index) => {
            newVisibleFeatures[layer.id][index] = true
          })
        }
      }
    })
    
    setVisibleFeatures(newVisibleFeatures)
  }
  
  // Hacer zoom a un feature específico
  const handleFeatureClick = (feature, layerId) => {
    if (!mapRef.current || !feature) return
    
    try {
      // Crear un GeoJSON layer temporal para obtener los bounds
      const L = window.L
      const tempLayer = L.geoJSON(feature)
      const bounds = tempLayer.getBounds()
      
      if (bounds.isValid()) {
        // Hacer zoom al feature con animación
        // Padding mínimo para que ocupe toda la pantalla
        mapRef.current.flyToBounds(bounds, {
          padding: [20, 20],  // Padding mínimo
          duration: 1.5,
          maxZoom: 18         // Permitir acercamiento máximo
        })
      }
    } catch (error) {
      console.error('[MapView] Error haciendo zoom a feature:', error)
    }
  }
  
  // Manejar fullscreen
  const toggleFullscreen = () => {
    if (!mapContainerRef.current) return
    
    if (!document.fullscreenElement) {
      mapContainerRef.current.requestFullscreen().catch(err => {
        console.error('[MapView] Error al entrar en fullscreen:', err)
      })
    } else {
      document.exitFullscreen()
    }
  }
  
  // Detectar cambios en fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])
  
  // Seleccionar y hacer zoom cuando cambia selectedGlobalId
  useEffect(() => {
    if (selectedGlobalId && markers.length > 0) {
      const marker = markers.find(m => m.data.globalid === selectedGlobalId)
      if (marker) {
        console.log('[MapView] 🎯 Haciendo zoom a registro:', selectedGlobalId)
        setSelectedMarker(marker)
      }
    }
  }, [selectedGlobalId, markers])
  
  useEffect(() => {
    if (!records || records.length === 0) {
      setMarkers([])
      setBounds(null)
      return
    }
    
    // Convertir registros a marcadores
    const newMarkers = []
    const validCoords = []
    
    for (const record of records) {
      // Buscar columnas de coordenadas (case-insensitive)
      const esteRaw = record.este || record.Este || record.ESTE
      const norteRaw = record.norte || record.Norte || record.NORTE
      const zona = record.zona || record.Zona || record.ZONA
      
      if (!esteRaw || !norteRaw || !zona) {
        // console.warn('[MapView] Registro sin coordenadas:', record)
        continue
      }
      
      // FIX: Los datos tienen Este y Norte INVERTIDOS
      // En Perú, Norte debe ser ~8-10 millones, Este debe ser ~200k-800k
      // Si "este" > 1,000,000, entonces está invertido
      const esteNum = parseFloat(esteRaw)
      const norteNum = parseFloat(norteRaw)
      
      let este, norte
      if (esteNum > 1000000) {
        // Están invertidos - corregir automáticamente
        este = norteRaw
        norte = esteRaw
        // Log solo ocasionalmente para debugging
        if (Math.random() < 0.02) {
          console.log('[MapView] ⚠️ Coordenadas auto-corregidas (Este y Norte estaban invertidos)')
        }
      } else {
        este = esteRaw
        norte = norteRaw
      }
      
      const coords = utmToLatLon(este, norte, zona)
      
      if (coords) {
        newMarkers.push({
          id: record.globalid || record.GLOBALID || record.objectid || record.OBJECTID || Math.random(),
          lat: coords.lat,
          lon: coords.lon,
          data: record
        })
        validCoords.push([coords.lat, coords.lon])
      }
      // Las coordenadas inválidas ya se filtran automáticamente
    }
    
    setMarkers(newMarkers)
    setBounds(validCoords.length > 0 ? validCoords : null)
  }, [records])
  
  // Manejar click en foto para abrir lightbox
  const handlePhotoClick = (photo, index, photos) => {
    setLightboxPhoto(photo)
    setLightboxIndex(index)
    setAllPhotos(photos || [photo])
  }
  
  // Navegación del lightbox
  const handleLightboxNext = () => {
    if (lightboxIndex < allPhotos.length - 1) {
      const newIndex = lightboxIndex + 1
      setLightboxIndex(newIndex)
      setLightboxPhoto(allPhotos[newIndex])
    }
  }
  
  const handleLightboxPrev = () => {
    if (lightboxIndex > 0) {
      const newIndex = lightboxIndex - 1
      setLightboxIndex(newIndex)
      setLightboxPhoto(allPhotos[newIndex])
    }
  }
  
  // Cerrar sidebar con ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && selectedMarker) {
        setSelectedMarker(null)
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedMarker])
  
  if (markers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          📍 Mapa de Ubicaciones
        </h3>
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No hay puntos con coordenadas válidas para mostrar en el mapa
        </div>
      </div>
    )
  }
  
  // Centro por defecto (Perú central)
  const defaultCenter = [-9.19, -75.0152]
  
  return (
    <div 
      ref={mapContainerRef}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            📍 Mapa de Ubicaciones
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {markers.length} {markers.length === 1 ? 'punto mostrado' : 'puntos mostrados'}
          </p>
        </div>
        
        {/* Botón Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          ) : (
            <Maximize2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          )}
        </button>
      </div>
      
      <div className={`relative overflow-hidden isolate ${isFullscreen ? 'h-screen' : 'h-[600px]'}`}>
        <MapContainer
          center={defaultCenter}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          className="z-0 rounded-lg"
          zoomControl={false}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          touchZoom={true}
          dragging={true}
          maxZoom={22}
          minZoom={3}
        >
          <TileLayer
            key={currentBasemap}
            attribution={BASEMAPS.find(b => b.id === currentBasemap)?.attribution || ''}
            url={BASEMAPS.find(b => b.id === currentBasemap)?.url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
            maxZoom={BASEMAPS.find(b => b.id === currentBasemap)?.maxZoom || 19}
          />
          
          {/* Controller para zoom automático */}
          <MapController selectedMarker={selectedMarker} mapRef={mapRef} />
          
          {/* Controles de zoom personalizados */}
          <ZoomControl position="topright" />
          
          {/* Barra de escala (visible en modo presentación) */}
          {presentationMode && (
            <ScaleControl position="bottomleft" imperial={false} />
          )}
          
          {/* Capas GeoJSON */}
          {availableLayers.map((layer) => {
            const data = geojsonData[layer.id]
            const isVisible = visibleLayers[layer.id]
            
            if (!data || !isVisible) return null
            
            // Validar que sea FeatureCollection válida
            if (!data.type || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
              console.warn(`[MapView] Capa ${layer.name} no es FeatureCollection válida`)
              return null
            }
            
            // Filtrar solo features visibles
            const layerVisibleFeatures = visibleFeatures[layer.id] || {}
            const filteredData = {
              ...data,
              features: data.features.filter((feature) => {
                const featureIndex = feature.properties?.featureIndex
                // Si no tiene índice, mostrar por defecto
                if (featureIndex === undefined) return true
                // Mostrar si no está explícitamente oculto
                return layerVisibleFeatures[featureIndex] !== false
              })
            }
            
            if (filteredData.features.length === 0) return null
            
            // Obtener configuración de la capa (personalizada o por defecto)
            const currentLayer = availableLayers.find(l => l.id === layer.id)
            const config = layerConfigs[layer.id] || {}
            const legendField = config.legendField || currentLayer?.legendField
            const labelField = config.labelField || legendField // Campo independiente para etiquetas
            
            // Extraer categorías únicas del campo de leyenda
            const categories = new Set()
            data.features.forEach(feature => {
              let categoryValue = null
              
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
              
              categories.add(categoryValue)
            })
            
            // Generar colores solo para categorías únicas (ordenadas alfabéticamente)
            const uniqueCategories = Array.from(categories).sort((a, b) => 
              a.localeCompare(b, 'es', { sensitivity: 'base' })
            )
            const colors = generateColors(uniqueCategories.length)
            
            // Crear mapeo categoría → color (usar color personalizado si existe)
            const categoryColorMap = {}
            uniqueCategories.forEach((category, index) => {
              const categoryKey = `${layer.id}-${category}`
              // Priorizar color personalizado, sino usar color generado
              categoryColorMap[category] = customColors[categoryKey] || colors[index]
            })
            
            try {
              return (
                <GeoJSON
                  key={`${layer.id}-${Object.values(layerVisibleFeatures).join('-')}-${JSON.stringify(customColors)}`}
                  data={filteredData}
                  pointToLayer={(feature, latlng) => {
                    // Personalizar marcadores de puntos
                    const markerType = config.markerType || 'circle'
                    const markerColor = config.markerColor || categoryColorMap[feature.properties?.[legendField]] || '#3b82f6'
                    const markerSize = config.markerSize || 8
                    
                    if (markerType === 'circle') {
                      return L_circleMarker(latlng, {
                        radius: markerSize,
                        fillColor: markerColor,
                        color: markerColor,
                        weight: 2,
                        opacity: 0.8,
                        fillOpacity: 0.6
                      })
                    } else if (markerType === 'dot') {
                      return L_circleMarker(latlng, {
                        radius: markerSize / 2,
                        fillColor: markerColor,
                        color: markerColor,
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.9
                      })
                    } else {
                      // marker type - usar ícono leaflet por defecto
                      return L_circleMarker(latlng, {
                        radius: markerSize,
                        fillColor: markerColor,
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                      })
                    }
                  }}
                  style={(feature) => {
                    // Obtener categoría del feature
                    let categoryValue = null
                    
                    if (legendField && feature.properties?.[legendField]) {
                      categoryValue = feature.properties[legendField]
                    } else {
                      categoryValue = feature.properties?.NOMBRE ||
                                     feature.properties?.UF_nombre || 
                                     feature.properties?.UNIDAD_FIS || 
                                     feature.properties?.name ||
                                     'Sin categoría'
                    }
                    
                    // Asignar color basado en la categoría
                    const color = categoryColorMap[categoryValue] || '#3b82f6'
                    
                    return {
                      color: color,
                      weight: 2,
                      opacity: 0.8,
                      fillOpacity: 0.3,
                      fillColor: color
                    }
                  }}
                  onEachFeature={(feature, leafletLayer) => {
                    // Usar el campo de etiquetas configurado (puede ser diferente del campo de leyenda)
                    let featureName = null
                    
                    if (labelField && feature.properties?.[labelField]) {
                      featureName = feature.properties[labelField]
                    } else {
                      // Fallback a campos comunes (NOMBRE tiene prioridad para yacimientos)
                      featureName = feature.properties?.NOMBRE ||
                                    feature.properties?.UF_nombre || 
                                    feature.properties?.UNIDAD_FIS || 
                                    feature.properties?.name ||
                                    `Feature ${feature.id || ''}`
                    }
                    
                    // Etiqueta permanente (si está activada para esta capa)
                    if (layerLabels[layer.id]) {
                      leafletLayer.bindTooltip(featureName, {
                        permanent: true,
                        direction: 'center',
                        className: 'polygon-label',
                        opacity: 1
                      })
                    }
                    
                    // Crear popup con TODA la información (clic)
                    let popupContent = `<div style="max-width: 300px;"><strong style="font-size: 13px; display: block; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 4px;">${featureName}</strong>`
                    
                    if (feature.properties) {
                      // Listar todas las propiedades excepto campos técnicos/internos
                      Object.entries(feature.properties).forEach(([key, value]) => {
                        // Filtrar campos no deseados
                        const excludedKeys = [
                          'featureIndex', 'name',
                          'Shape_Leng', 'Shape_Area', 'SHAPE_Leng', 'SHAPE_Area', 'shape_leng', 'shape_area',
                          'OBJECTID', 'OBJECTID_1', 'ObjectID', 'objectid', 'FID', 'fid'
                        ]
                        
                        if (value !== null && value !== undefined && value !== '' && 
                            !excludedKeys.includes(key) && 
                            !key.toLowerCase().includes('shape_le') && 
                            !key.toLowerCase().includes('shape_ar') &&
                            !key.toLowerCase().includes('objectid')) {
                          popupContent += `<div style="margin: 4px 0; font-size: 11px;">
                            <span style="color: rgba(255,255,255,0.7);">${key}:</span> 
                            <span style="font-weight: 500;">${value}</span>
                          </div>`
                        }
                      })
                    }
                    
                    popupContent += `</div>`
                    
                    // Popup detallado al hacer clic (solo si NO hay etiqueta permanente)
                    if (!layerLabels[layer.id]) {
                      leafletLayer.bindPopup(popupContent, {
                        className: 'geojson-popup',
                        maxWidth: 350
                      })
                    }
                  }}
                />
              )
            } catch (error) {
              console.error(`[MapView] Error renderizando capa ${layer.name}:`, error)
              return null
            }
          })}
          
          {/* Marcadores individuales (solo si la capa está visible) */}
          {showSurveyPoints && (() => {
            // Si hay campo de leyenda configurado, agrupar y asignar colores
            const legendField = surveyConfig.legendField
            
            if (legendField && markers.length > 0) {
              // Obtener categorías únicas (ordenadas alfabéticamente)
              const categorySet = new Set()
              markers.forEach(m => {
                const value = m.data?.[legendField]
                if (value) categorySet.add(String(value))
              })
              
              const categories = Array.from(categorySet).sort((a, b) => 
                a.localeCompare(b, 'es', { sensitivity: 'base' })
              )
              const colors = generateColors(categories.length)
              
              // Mapeo categoría → color
              const categoryColors = {}
              categories.forEach((cat, idx) => {
                categoryColors[cat] = colors[idx]
              })
              
              return markers.map((marker, index) => {
                const isSelected = selectedMarker && selectedMarker.id === marker.id
                const categoryValue = marker.data?.[legendField] 
                  ? String(marker.data[legendField])
                  : 'Sin categoría'
                
                // Usar color según categoría
                const markerColor = categoryColors[categoryValue] || surveyConfig.markerColor || '#ef4444'
                const markerConfigWithColor = { ...surveyConfig, markerColor }
                const customIcon = createCustomIcon(markerConfigWithColor, isSelected)
                
                return (
                  <Marker
                    key={index}
                    position={[marker.lat, marker.lon]}
                    icon={customIcon}
                    eventHandlers={{
                      click: () => {
                        setSelectedMarker(marker)
                        setOpenPanel(null)
                      }
                    }}
                  />
                )
              })
            } else {
              // Sin agrupación, usar color global
              return markers.map((marker, index) => {
                const isSelected = selectedMarker && selectedMarker.id === marker.id
                const customIcon = createCustomIcon(surveyConfig, isSelected)
                
                return (
                  <Marker
                    key={index}
                    position={[marker.lat, marker.lon]}
                    icon={customIcon}
                    eventHandlers={{
                      click: () => {
                        setSelectedMarker(marker)
                        setOpenPanel(null)
                      }
                    }}
                  />
                )
              })
            }
          })()}
        </MapContainer>
        
        {/* Controles de Mapa - Esquina superior derecha debajo de zoom */}
        <div className="absolute top-28 right-3 z-[600] flex flex-col gap-2">
          {/* Botón Configurar Metadatos */}
          <button
            onClick={() => setShowMapConfig(true)}
            className={`p-2.5 bg-white rounded-md shadow-lg border border-slate-300 transition-all ${
              presentationMode 
                ? 'opacity-30 hover:opacity-100' 
                : 'hover:bg-slate-50'
            }`}
            title="Configurar metadatos del mapa"
          >
            <Settings className="w-5 h-5 text-slate-700" />
          </button>
          
          {/* Botón Modo Captura */}
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`p-2.5 rounded-md shadow-lg border transition-all ${
              presentationMode
                ? 'bg-indigo-500 border-indigo-600 opacity-30 hover:opacity-100'
                : 'bg-white border-slate-300 hover:bg-slate-50'
            }`}
            title={presentationMode ? 'Desactivar modo captura' : 'Activar modo captura'}
          >
            <Camera className={`w-5 h-5 ${
              presentationMode 
                ? 'text-white'
                : 'text-slate-700'
            }`} />
          </button>
        </div>
        
        {/* Elementos cartográficos (modo presentación) */}
        {presentationMode && (
          <>
            {/* Brújula (North Arrow) - Draggable */}
            <NorthArrow />
            
            {/* Leyenda cartográfica - Draggable */}
            <CartographicLegend
              mapTitle={mapMetadata.mapTitle}
              codigoAccion={mapMetadata.codigoAccion}
              expediente={mapMetadata.expediente}
              categories={getCartographicCategories()}
              onToggleCategory={handleTogglePresentationCategory}
            />
          </>
        )}
        
        {/* Controles operativos (ocultos en modo presentación) */}
        {!presentationMode && (
          <>
            {/* Sidebar lateral para mostrar detalles del punto seleccionado */}
            {selectedMarker && openPanel === null && (
          <MapSidebar
            marker={selectedMarker}
            codigoAccion={codigoAccion}
            onClose={() => setSelectedMarker(null)}
            onPhotoClick={handlePhotoClick}
          />
        )}
        
        {/* Leyenda y controles adicionales */}
        <div className="absolute bottom-4 left-4 z-[1100]">
          {openPanel === 'info' ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg px-4 py-3 border border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">💡 Navegación</div>
                  <button
                    onClick={(e) => { e.preventDefault(); setOpenPanel(null); }}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                    title="Minimizar leyenda"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
                <div className="space-y-1">
                  <div>• Scroll para zoom</div>
                  <div>• Arrastra para mover</div>
                  <div>• Click en punto para detalles</div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 space-y-2">
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Leyenda</div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500 fill-blue-500" />
                    <span>Punto de muestreo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-red-500 fill-red-500" />
                    <span>Punto seleccionado</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                setOpenPanel('info')
                setSelectedMarker(null) // Cerrar sidebar al abrir panel
              }}
              className="bg-white rounded-lg shadow-lg p-3 border-0 hover:bg-blue-500 transition-colors group"
              title="Mostrar leyenda"
            >
              <Info className="w-5 h-5 group-hover:text-white text-black group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {/* Selector de mapa base */}
        <div className="absolute bottom-32 left-4 z-[500]">
          {openPanel === 'basemap' ? (
            <BasemapSelector
              currentBasemap={currentBasemap}
              onSelect={(basemap) => setCurrentBasemap(basemap.id)}
              onClose={() => setOpenPanel(null)}
              isExpanded={true}
            />
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                setOpenPanel('basemap')
                setSelectedMarker(null)
              }}
              className="bg-white rounded-lg shadow-lg p-3 border-0 hover:bg-green-500 transition-colors group"
              title="Cambiar mapa base"
            >
              <MapIcon className="w-5 h-5 group-hover:text-white text-black group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {/* Control de capas GeoJSON */}
        <div className="absolute bottom-20 left-4 z-[500]">
          {openPanel === 'layers' ? (
            <LayersControl
              layers={availableLayers}
              visibleLayers={visibleLayers}
              layerLabels={layerLabels}
              onToggleLayer={handleToggleLayer}
              onToggleLabels={handleToggleLabels}
              onUploadClick={() => setShowUploadWizard(true)}
              onDeleteClick={(layer) => setLayerToDelete(layer)}
              onClose={() => setOpenPanel(null)}
              isExpanded={true}
              surveyPointsCount={markers.length}
              showSurveyPoints={showSurveyPoints}
              onToggleSurveyPoints={(visible) => setShowSurveyPoints(visible)}
              onSettingsClick={(layer) => setLayerToConfig(layer)}
              onSurveySettingsClick={() => setShowSurveySettings(true)}
              onMoveUp={handleMoveLayerUp}
              onMoveDown={handleMoveLayerDown}
            />
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                setOpenPanel('layers')
                setSelectedMarker(null) // Cerrar sidebar al abrir panel
              }}
              className="bg-white rounded-lg shadow-lg p-3 border-0 hover:bg-blue-500 transition-colors group"
              title="Capas TopoJSON"
            >
              <Layers className="w-5 h-5 group-hover:text-white text-black group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {/* Leyenda de colores */}
        <div className="absolute top-4 left-4 z-[400]">
          {openPanel === 'legend' ? (
            <LayersLegend
              geojsonData={geojsonData}
              visibleLayers={visibleLayers}
              availableLayers={availableLayers}
              visibleFeatures={visibleFeatures}
              layerConfigs={layerConfigs}
              customColors={customColors}
              onFeatureClick={handleFeatureClick}
              onToggleFeature={handleToggleFeature}
              onHideAll={handleHideAllFeatures}
              onShowAll={handleShowAllFeatures}
              onColorChange={handleColorChange}
              onClose={() => setOpenPanel(null)}
              isExpanded={true}
            />
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                setOpenPanel('legend')
                setSelectedMarker(null) // Cerrar sidebar al abrir panel
              }}
              className="bg-white rounded-lg shadow-lg p-3 border-0 hover:bg-blue-500 transition-colors group"
              title="Mostrar leyenda"
            >
              <ListOrdered className="w-5 h-5 group-hover:text-white text-black group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
          </>
        )}
      </div>
      
      {/* Modal de configuración de metadatos del mapa */}
      {showMapConfig && (
        <MapConfigModal
          initialConfig={mapMetadata}
          onSave={(config) => setMapMetadata(config)}
          onClose={() => setShowMapConfig(false)}
        />
      )}
      
      {/* Lightbox para ver fotos */}
      {lightboxPhoto && (
        <Lightbox
          photo={lightboxPhoto}
          onClose={() => setLightboxPhoto(null)}
          onNext={handleLightboxNext}
          onPrev={handleLightboxPrev}
          hasNext={lightboxIndex < allPhotos.length - 1}
          hasPrev={lightboxIndex > 0}
        />
      )}
      
      {/* Wizard de subida de TopoJSON */}
      {showUploadWizard && (
        <TopoJSONUploadWizard
          onClose={() => setShowUploadWizard(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}
      
      {/* Modal de confirmación de eliminación */}
      {layerToDelete && (
        <DeleteLayerConfirm
          layer={layerToDelete}
          onConfirm={handleDeleteLayer}
          onCancel={() => setLayerToDelete(null)}
          isDeleting={isDeleting}
        />
      )}
      
      {/* Modal de configuración de capa GeoJSON */}
      {layerToConfig && (
        <LayerSettings
          layer={layerToConfig}
          config={layerConfigs[layerToConfig.id] || {}}
          availableFields={getLayerFields(layerToConfig.id)}
          onSave={(config) => handleSaveLayerConfig(layerToConfig.id, config)}
          onClose={() => setLayerToConfig(null)}
        />
      )}
      
      {/* Modal de configuración de puntos Survey123 */}
      {showSurveySettings && (
        <LayerSettings
          layer={{ name: 'Puntos de Código de Acción', id: '__survey123__' }}
          config={surveyConfig}
          availableFields={getSurveyFields()}
          onSave={handleSaveSurveyConfig}
          onClose={() => setShowSurveySettings(false)}
        />
      )}
    </div>
  )
}
