import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import proj4 from 'proj4'
import * as topojson from 'topojson-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

/**
 * Reconstruye geometrías de puntos usando valores de columnas lat/lon
 * @param {Object} data - Datos GeoJSON o TopoJSON
 * @param {string} latField - Nombre de la columna de latitud
 * @param {string} lonField - Nombre de la columna de longitud
 * @returns {Object} - Datos con geometrías reconstruidas
 */
function reconstructPointGeometries(data, latField, lonField) {
  // Función para reconstruir un feature
  const reconstructFeature = (feature) => {
    if (!feature || !feature.properties) {
      return feature
    }
    
    // Obtener valores de lat/lon desde propiedades
    const lat = parseFloat(feature.properties[latField])
    const lon = parseFloat(feature.properties[lonField])
    
    // Validar que sean números válidos
    if (isNaN(lat) || isNaN(lon)) {
      console.warn(`[reconstructPointGeometries] Coordenadas inválidas en feature:`, feature.properties)
      return feature
    }
    
    // Validar rangos válidos
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      console.warn(`[reconstructPointGeometries] Coordenadas fuera de rango:`, { lat, lon })
      return feature
    }
    
    // Reconstruir geometría Point con coordenadas correctas
    return {
      ...feature,
      geometry: {
        type: 'Point',
        coordinates: [lon, lat] // GeoJSON usa [longitud, latitud]
      }
    }
  }
  
  // Procesar según tipo de datos
  if (data.type === 'FeatureCollection' && data.features) {
    return {
      ...data,
      features: data.features.map(reconstructFeature)
    }
  } else if (data.type === 'Feature') {
    return reconstructFeature(data)
  } else if (data.type === 'Topology' && data.objects) {
    // TopoJSON: convertir a GeoJSON, reconstruir, y volver a TopoJSON
    // Por simplicidad, convertimos solo el primer objeto
    const objectKeys = Object.keys(data.objects)
    if (objectKeys.length > 0) {
      const firstKey = objectKeys[0]
      
      // Convertir a GeoJSON
      const geojson = topojson.feature(data, data.objects[firstKey])
      
      // Reconstruir features
      const reconstructed = reconstructPointGeometries(geojson, latField, lonField)
      
      // Para TopoJSON, retornamos el GeoJSON reconstruido
      // (el cliente puede manejarlo como GeoJSON regular)
      return reconstructed
    }
  }
  
  return data
}

/**
 * Transforma coordenadas UTM a WGS84 para GeoJSON/TopoJSON
 * @param {Object} data - Datos GeoJSON o TopoJSON
 * @param {string} zone - Zona UTM (17, 18, 19)
 * @returns {Object} - Datos transformados
 */
function transformUtmToWgs84(data, zone) {
  // Definir proyecciones UTM para cada zona de Perú (hemisferio sur)
  const utmProjections = {
    '17': '+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs',
    '18': '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs',
    '19': '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs'
  }
  
  const utmProj = utmProjections[zone]
  if (!utmProj) {
    throw new Error(`Zona UTM inválida: ${zone}`)
  }
  
  const wgs84 = 'EPSG:4326'
  
  // Función recursiva para transformar coordenadas
  const transformCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      // Coordenada individual [x, y]
      const [lon, lat] = proj4(utmProj, wgs84, coords)
      return [lon, lat]
    } else {
      // Array de coordenadas
      return coords.map(transformCoords)
    }
  }
  
  // Transformar geometría
  const transformGeometry = (geometry) => {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return geometry
    }
    
    return {
      ...geometry,
      coordinates: transformCoords(geometry.coordinates)
    }
  }
  
  // Transformar feature
  const transformFeature = (feature) => {
    if (!feature || !feature.geometry) {
      return feature
    }
    
    return {
      ...feature,
      geometry: transformGeometry(feature.geometry)
    }
  }
  
  // Detectar tipo de datos y transformar
  if (data.type === 'FeatureCollection') {
    return {
      ...data,
      features: data.features.map(transformFeature)
    }
  } else if (data.type === 'Feature') {
    return transformFeature(data)
  } else if (data.type === 'Topology') {
    // TopoJSON: convertir a GeoJSON primero, transformar, y devolver GeoJSON
    try {
      const objectKeys = Object.keys(data.objects || {})
      if (objectKeys.length > 0) {
        const firstKey = objectKeys[0]
        const geojson = topojson.feature(data, data.objects[firstKey])
        
        // Transformar el GeoJSON resultante
        const transformed = transformUtmToWgs84(geojson, zone)
        
        console.log('[transformUtmToWgs84] TopoJSON convertido a GeoJSON y transformado')
        return transformed
      }
    } catch (err) {
      console.error('[transformUtmToWgs84] Error convirtiendo TopoJSON:', err)
    }
    
    return data
  } else if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(data.type)) {
    // Geometría directa
    return transformGeometry(data)
  } else if (data.type === 'GeometryCollection') {
    return {
      ...data,
      geometries: data.geometries.map(transformGeometry)
    }
  }
  
  return data
}

// Configurar multer para subida de archivos
const storage = multer.memoryStorage()
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/json', 'application/geo+json', 'text/plain']
    const allowedExts = ['.json', '.geojson', '.topojson']
    const ext = path.extname(file.originalname).toLowerCase()
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos JSON/GeoJSON/TopoJSON'))
    }
  }
})

/**
 * GET /api/geojson/list
 * Lista todos los archivos .geojson disponibles en la carpeta public/geojson
 */
router.get('/list', (req, res) => {
  try {
    const geojsonDir = path.join(__dirname, '../../frontend/public/geojson')
    
    // Verificar si la carpeta existe
    if (!fs.existsSync(geojsonDir)) {
      console.log('[geojson] Carpeta geojson no encontrada')
      return res.json({ layers: [] })
    }
    
    // Leer archivos de la carpeta
    const files = fs.readdirSync(geojsonDir)
    
    // Capas del sistema (pre-instaladas, no se pueden eliminar)
    const systemLayers = ['Lotes Nacional', 'Yacimientos Lote X']
    
    // Filtrar solo archivos .geojson y .json (excluir .meta)
    const layers = files
      .filter(file => {
        // Excluir archivos de metadata
        if (file.endsWith('.meta') || file.includes('.meta.')) return false
        // Solo incluir archivos GeoJSON/TopoJSON
        return file.endsWith('.geojson') || file.endsWith('.json')
      })
      .map(file => {
        const name = file.replace(/\.(geojson|json)$/, '')
        // Convertir nombre de archivo a título legible
        const displayName = name
          .replace(/_/g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase())
        
        // Intentar leer metadata si existe
        let legendField = null
        const metadataPath = path.join(geojsonDir, `${name}.meta`)
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            legendField = metadata.legendField || null
          } catch (err) {
            console.warn(`[geojson] Error leyendo metadata para ${name}:`, err.message)
          }
        }
        
        // Marcar si es capa del sistema o de usuario
        const isSystemLayer = systemLayers.includes(name)
        
        return {
          id: name,
          name: displayName,
          filename: file,
          url: `/geojson/${file}`,
          legendField,
          isSystemLayer,
          canDelete: !isSystemLayer // Solo se pueden eliminar capas de usuario
        }
      })
    
    console.log(`[geojson] ${layers.length} capas encontradas:`, layers.map(l => l.name))
    
    res.json({ layers })
  } catch (error) {
    console.error('[geojson] Error listando capas:', error)
    res.status(500).json({ error: 'Error al listar capas GeoJSON' })
  }
})

/**
 * POST /api/geojson/upload
 * Sube y valida un archivo TopoJSON/GeoJSON
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se recibió ningún archivo' 
      })
    }
    
    const { filename, legendField, latitudeField, longitudeField, utmZone } = req.body
    
    if (!filename || !filename.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre de archivo requerido' 
      })
    }
    
    // Validar que el contenido sea JSON válido
    let jsonData
    try {
      jsonData = JSON.parse(req.file.buffer.toString('utf-8'))
    } catch (err) {
      return res.status(400).json({ 
        success: false, 
        error: 'El archivo no contiene JSON válido: ' + err.message 
      })
    }
    
    // Validar estructura básica TopoJSON/GeoJSON
    const validTypes = [
      'Topology', // TopoJSON
      'FeatureCollection', 'Feature', 'GeometryCollection', // GeoJSON
      'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon' // Geometrías
    ]
    
    if (!jsonData.type || !validTypes.includes(jsonData.type)) {
      return res.status(400).json({ 
        success: false, 
        error: `Tipo de archivo no válido. Se esperaba uno de: ${validTypes.join(', ')}` 
      })
    }
    
    // Si se especificó zona UTM, transformar coordenadas de la geometría
    if (utmZone) {
      console.log(`[geojson] 🔄 Transformando coordenadas UTM Zona ${utmZone} a WGS84...`)
      try {
        jsonData = transformUtmToWgs84(jsonData, utmZone)
        console.log(`[geojson] ✅ Coordenadas transformadas exitosamente`)
      } catch (err) {
        console.error('[geojson] Error transformando coordenadas:', err)
        return res.status(400).json({ 
          success: false, 
          error: 'Error transformando coordenadas UTM: ' + err.message 
        })
      }
    }
    
    // Si se especificaron columnas lat/lon (para capas sin coordenadas válidas), reconstruir geometrías
    if (latitudeField && longitudeField) {
      console.log(`[geojson] 📍 Reconstruyendo geometrías desde columnas: ${latitudeField} / ${longitudeField}...`)
      try {
        jsonData = reconstructPointGeometries(jsonData, latitudeField, longitudeField)
        console.log(`[geojson] ✅ Geometrías reconstruidas exitosamente`)
      } catch (err) {
        console.error('[geojson] Error reconstruyendo geometrías:', err)
        return res.status(400).json({ 
          success: false, 
          error: 'Error reconstruyendo coordenadas desde columnas: ' + err.message 
        })
      }
    }
    
    // Sanitizar nombre de archivo
    const sanitizedName = filename.trim().replace(/[^a-zA-Z0-9_\s-]/g, '').replace(/\s+/g, '_')
    
    if (!sanitizedName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre de archivo inválido después de sanitización' 
      })
    }
    
    // Ruta destino
    const geojsonDir = path.join(__dirname, '../../frontend/public/geojson')
    
    // Crear carpeta si no existe
    if (!fs.existsSync(geojsonDir)) {
      fs.mkdirSync(geojsonDir, { recursive: true })
    }
    
    // Verificar si ya existe un archivo con ese nombre
    let finalFilename = `${sanitizedName}.json`
    let finalPath = path.join(geojsonDir, finalFilename)
    let counter = 1
    
    while (fs.existsSync(finalPath)) {
      finalFilename = `${sanitizedName}_${counter}.json`
      finalPath = path.join(geojsonDir, finalFilename)
      counter++
    }
    
    // Guardar archivo
    fs.writeFileSync(finalPath, JSON.stringify(jsonData, null, 2), 'utf-8')
    
    console.log(`[geojson] ✅ Archivo subido: ${finalFilename} (${(req.file.size / 1024).toFixed(1)} KB)`)
    
    // Si se especificó un campo de leyenda, guardarlo en metadata (sin extensión .json)
    if (legendField) {
      const metadataPath = path.join(geojsonDir, `${sanitizedName}.meta`)
      fs.writeFileSync(metadataPath, JSON.stringify({ legendField }, null, 2), 'utf-8')
      console.log(`[geojson] ℹ️  Campo de leyenda configurado: ${legendField}`)
    }
    
    // Retornar info de la capa creada
    const layerInfo = {
      id: sanitizedName,
      name: sanitizedName.replace(/_/g, ' '),
      filename: finalFilename,
      url: `/geojson/${finalFilename}`,
      legendField: legendField || null
    }
    
    res.json({ 
      success: true, 
      layer: layerInfo,
      message: 'Capa subida exitosamente' 
    })
    
  } catch (error) {
    console.error('[geojson] Error subiendo archivo:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error interno al procesar el archivo: ' + error.message 
    })
  }
})

/**
 * DELETE /api/geojson/delete/:layerId
 * Elimina una capa TopoJSON/GeoJSON subida por el usuario
 */
router.delete('/delete/:layerId', (req, res) => {
  try {
    const { layerId } = req.params
    
    if (!layerId || !layerId.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID de capa requerido' 
      })
    }
    
    const geojsonDir = path.join(__dirname, '../../frontend/public/geojson')
    
    // Capas del sistema que NO se pueden eliminar
    const systemLayers = ['Lotes Nacional', 'Yacimientos Lote X']
    
    if (systemLayers.includes(layerId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'No se puede eliminar una capa del sistema' 
      })
    }
    
    // Buscar archivo principal (.json o .geojson)
    const possibleExtensions = ['.json', '.geojson']
    let mainFilePath = null
    let foundExtension = null
    
    for (const ext of possibleExtensions) {
      const testPath = path.join(geojsonDir, `${layerId}${ext}`)
      if (fs.existsSync(testPath)) {
        mainFilePath = testPath
        foundExtension = ext
        break
      }
    }
    
    if (!mainFilePath) {
      return res.status(404).json({ 
        success: false, 
        error: 'Capa no encontrada' 
      })
    }
    
    // Eliminar archivo principal
    fs.unlinkSync(mainFilePath)
    console.log(`[geojson] ❌ Archivo eliminado: ${layerId}${foundExtension}`)
    
    // Eliminar metadata si existe
    const metadataPath = path.join(geojsonDir, `${layerId}.meta`)
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath)
      console.log(`[geojson] ❌ Metadata eliminada: ${layerId}.meta`)
    }
    
    res.json({ 
      success: true, 
      message: 'Capa eliminada exitosamente',
      deletedLayer: layerId
    })
    
  } catch (error) {
    console.error('[geojson] Error eliminando capa:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error interno al eliminar la capa: ' + error.message 
    })
  }
})

export default router
