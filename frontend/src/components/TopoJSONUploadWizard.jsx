import React, { useState, useCallback } from 'react'
import { Upload, CheckCircle, XCircle, AlertCircle, FileJson, ChevronRight, X } from 'lucide-react'
import * as topojson from 'topojson-client'
import api from '../lib/axios'

/**
 * Wizard para subir TopoJSON con validación y configuración de leyenda
 */
export function TopoJSONUploadWizard({ onClose, onUploadSuccess }) {
  const [step, setStep] = useState(1) // 1: Upload, 2: Validate, 3: UTM Zone (if needed), 4: Configure, 5: Confirm
  const [file, setFile] = useState(null)
  const [fileName, setFileName] = useState('')
  const [validationResult, setValidationResult] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [availableFields, setAvailableFields] = useState([])
  const [selectedLegendField, setSelectedLegendField] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
  const [hasUtmCoordinates, setHasUtmCoordinates] = useState(false)
  const [utmZone, setUtmZone] = useState('18')
  const [needsColumnMapping, setNeedsColumnMapping] = useState(false)
  const [latitudeField, setLatitudeField] = useState('')
  const [longitudeField, setLongitudeField] = useState('')
  
  // Step 1: Cargar archivo
  const handleFileSelect = useCallback((event) => {
    const selectedFile = event.target.files[0]
    if (!selectedFile) return
    
    setError(null)
    setFile(selectedFile)
    
    // Sugerir nombre sin extensión
    const name = selectedFile.name.replace(/\.(topojson|json|geojson)$/i, '')
    setFileName(name)
    
    // Leer y validar archivo
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target.result
        const data = JSON.parse(content)
        
        // Validar que sea TopoJSON o GeoJSON
        const validation = validateTopology(data)
        setValidationResult(validation)
        
        if (validation.isValid) {
          setParsedData(data)
          
          // Extraer campos disponibles para leyenda
          const fields = extractFields(data)
          setAvailableFields(fields)
          
          // Auto-seleccionar primer campo si hay alguno
          if (fields.length > 0) {
            setSelectedLegendField(fields[0])
          }
          
          // Detectar tipo de coordenadas
          const coordAnalysis = analyzeCoordinates(data)
          
          if (coordAnalysis.hasUtm) {
            // Coordenadas UTM detectadas en geometría
            setHasUtmCoordinates(true)
            setNeedsColumnMapping(false)
          } else if (coordAnalysis.needsMapping) {
            // No hay coordenadas válidas en geometría, necesita mapeo de columnas
            setNeedsColumnMapping(true)
            setHasUtmCoordinates(false)
            
            // Intentar auto-detectar campos lat/lon
            if (fields.length > 0) {
              const latField = fields.find(f => /^(lat|latitude|latitud|y)$/i.test(f))
              const lonField = fields.find(f => /^(lon|lng|long|longitude|longitud|x)$/i.test(f))
              
              if (latField) setLatitudeField(latField)
              if (lonField) setLongitudeField(lonField)
            }
          } else {
            // Coordenadas WGS84 válidas
            setHasUtmCoordinates(false)
            setNeedsColumnMapping(false)
          }
          
          setStep(2)
        }
      } catch (err) {
        setValidationResult({
          isValid: false,
          errors: ['Error al parsear JSON: ' + err.message],
          warnings: []
        })
        setStep(2)
      }
    }
    
    reader.onerror = () => {
      setError('Error al leer el archivo')
    }
    
    reader.readAsText(selectedFile)
  }, [])
  
  // Validar estructura TopoJSON/GeoJSON
  const validateTopology = (data) => {
    const errors = []
    const warnings = []
    
    if (!data || typeof data !== 'object') {
      errors.push('El archivo debe contener un objeto JSON válido')
      return { isValid: false, errors, warnings, type: 'unknown' }
    }
    
    // Detectar tipo
    let type = 'unknown'
    
    if (data.type === 'Topology') {
      type = 'topojson'
      
      // Validar TopoJSON
      if (!data.objects || typeof data.objects !== 'object') {
        errors.push('TopoJSON debe tener propiedad "objects"')
      } else if (Object.keys(data.objects).length === 0) {
        errors.push('TopoJSON debe tener al menos un objeto en "objects"')
      }
      
      if (!data.arcs || !Array.isArray(data.arcs)) {
        warnings.push('TopoJSON no tiene propiedad "arcs" válida')
      }
      
    } else if (data.type === 'FeatureCollection') {
      type = 'geojson'
      
      // Validar FeatureCollection
      if (!data.features || !Array.isArray(data.features)) {
        errors.push('FeatureCollection debe tener propiedad "features" como array')
      } else if (data.features.length === 0) {
        warnings.push('FeatureCollection no contiene features')
      }
      
    } else if (data.type === 'Feature') {
      type = 'geojson'
      
      if (!data.geometry) {
        errors.push('Feature debe tener propiedad "geometry"')
      }
      
    } else if (data.type === 'GeometryCollection') {
      type = 'geojson'
      
      if (!data.geometries || !Array.isArray(data.geometries)) {
        errors.push('GeometryCollection debe tener propiedad "geometries"')
      }
      
    } else if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(data.type)) {
      type = 'geojson'
      
      if (!data.coordinates) {
        errors.push('Geometría debe tener propiedad "coordinates"')
      }
      
    } else {
      errors.push(`Tipo de archivo no reconocido: ${data.type || 'sin tipo'}`)
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      type
    }
  }
  
  // Extraer campos de propiedades para usar como leyenda
  const extractFields = (data) => {
    const fields = new Set()
    
    try {
      if (data.type === 'Topology' && data.objects) {
        // TopoJSON: convertir primer objeto a GeoJSON
        const objectKeys = Object.keys(data.objects)
        if (objectKeys.length > 0) {
          const geojson = topojson.feature(data, data.objects[objectKeys[0]])
          
          if (geojson.type === 'FeatureCollection' && geojson.features) {
            geojson.features.forEach(feature => {
              if (feature.properties) {
                Object.keys(feature.properties).forEach(key => fields.add(key))
              }
            })
          }
        }
      } else if (data.type === 'FeatureCollection' && data.features) {
        // GeoJSON FeatureCollection
        data.features.forEach(feature => {
          if (feature.properties) {
            Object.keys(feature.properties).forEach(key => fields.add(key))
          }
        })
      } else if (data.type === 'Feature' && data.properties) {
        // GeoJSON Feature único
        Object.keys(data.properties).forEach(key => fields.add(key))
      }
    } catch (err) {
      console.warn('[TopoJSONUploadWizard] Error extrayendo campos:', err)
    }
    
    return Array.from(fields).filter(field => {
      // Filtrar campos técnicos/internos
      const excludedPatterns = [
        /^(objectid|fid|id|gid)$/i,
        /^shape_/i,
        /^geom/i,
        /featureindex/i
      ]
      return !excludedPatterns.some(pattern => pattern.test(field))
    })
  }
  
  // Analizar coordenadas de la capa
  const analyzeCoordinates = (data) => {
    try {
      let coordinates = []
      
      // Extraer coordenadas de la geometría
      if (data.type === 'Topology' && data.objects) {
        const objectKeys = Object.keys(data.objects)
        if (objectKeys.length > 0) {
          const geojson = topojson.feature(data, data.objects[objectKeys[0]])
          
          if (geojson.type === 'FeatureCollection' && geojson.features) {
            geojson.features.forEach(feature => {
              if (feature.geometry?.coordinates) {
                const coords = extractCoordinatesFromGeometry(feature.geometry)
                coordinates.push(...coords)
              }
            })
          }
        }
      } else if (data.type === 'FeatureCollection' && data.features) {
        data.features.forEach(feature => {
          if (feature.geometry?.coordinates) {
            const coords = extractCoordinatesFromGeometry(feature.geometry)
            coordinates.push(...coords)
          }
        })
      }
      
      if (coordinates.length === 0) {
        return { hasUtm: false, needsMapping: true }
      }
      
      // Analizar rangos
      const xValues = coordinates.map(c => c[0])
      const yValues = coordinates.map(c => c[1])
      
      const minX = Math.min(...xValues)
      const maxX = Math.max(...xValues)
      const minY = Math.min(...yValues)
      const maxY = Math.max(...yValues)
      
      // Detectar si son coordenadas inválidas (0,0 o null)
      const allZero = xValues.every(x => x === 0) && yValues.every(y => y === 0)
      if (allZero) {
        return { hasUtm: false, needsMapping: true }
      }
      
      // Detectar UTM: X (Este): 100,000 - 1,000,000, Y (Norte): 8,000,000 - 10,500,000
      const isUtmX = minX > 100000 && maxX < 1000000
      const isUtmY = minY > 8000000 && maxY < 10500000
      
      if (isUtmX && isUtmY) {
        return { hasUtm: true, needsMapping: false }
      }
      
      // Detectar WGS84 válido: X (lon): -180 a 180, Y (lat): -90 a 90
      const isValidLon = minX >= -180 && maxX <= 180
      const isValidLat = minY >= -90 && maxY <= 90
      
      if (isValidLon && isValidLat) {
        return { hasUtm: false, needsMapping: false }
      }
      
      // Si no coincide con ningún patrón, asumir que necesita mapeo
      return { hasUtm: false, needsMapping: true }
    } catch (err) {
      console.warn('[TopoJSONUploadWizard] Error analizando coordenadas:', err)
      return { hasUtm: false, needsMapping: false }
    }
  }
  
  // DEPRECATED: Función anterior
  const detectPointLayer_OLD = (data) => {
    try {
      let geometryTypes = new Set()
      
      if (data.type === 'Topology' && data.objects) {
        // TopoJSON: convertir primer objeto a GeoJSON
        const objectKeys = Object.keys(data.objects)
        if (objectKeys.length > 0) {
          const geojson = topojson.feature(data, data.objects[objectKeys[0]])
          
          if (geojson.type === 'FeatureCollection' && geojson.features) {
            geojson.features.forEach(feature => {
              if (feature.geometry?.type) {
                geometryTypes.add(feature.geometry.type)
              }
            })
          } else if (geojson.geometry?.type) {
            geometryTypes.add(geojson.geometry.type)
          }
        }
      } else if (data.type === 'FeatureCollection' && data.features) {
        data.features.forEach(feature => {
          if (feature.geometry?.type) {
            geometryTypes.add(feature.geometry.type)
          }
        })
      } else if (data.type === 'Feature' && data.geometry?.type) {
        geometryTypes.add(data.geometry.type)
      } else if (data.type) {
        geometryTypes.add(data.type)
      }
      
      // Es capa de puntos si solo tiene Point o MultiPoint
      const types = Array.from(geometryTypes)
      return types.length > 0 && types.every(t => t === 'Point' || t === 'MultiPoint')
    } catch (err) {
      console.warn('[TopoJSONUploadWizard] Error detectando tipo de geometría:', err)
      return false
    }
  }
  
  // DEPRECATED: Función anterior de detección UTM
  const detectUtmCoordinates_OLD = (data) => {
    try {
      let coordinates = []
      
      if (data.type === 'Topology' && data.objects) {
        // TopoJSON: convertir primer objeto a GeoJSON
        const objectKeys = Object.keys(data.objects)
        if (objectKeys.length > 0) {
          const geojson = topojson.feature(data, data.objects[objectKeys[0]])
          
          if (geojson.type === 'FeatureCollection' && geojson.features) {
            geojson.features.forEach(feature => {
              if (feature.geometry?.coordinates) {
                const coords = extractCoordinatesFromGeometry(feature.geometry)
                coordinates.push(...coords)
              }
            })
          }
        }
      } else if (data.type === 'FeatureCollection' && data.features) {
        data.features.forEach(feature => {
          if (feature.geometry?.coordinates) {
            const coords = extractCoordinatesFromGeometry(feature.geometry)
            coordinates.push(...coords)
          }
        })
      }
      
      if (coordinates.length === 0) return false
      
      // Analizar rangos típicos de UTM
      const xValues = coordinates.map(c => c[0])
      const yValues = coordinates.map(c => c[1])
      
      const minX = Math.min(...xValues)
      const maxX = Math.max(...xValues)
      const minY = Math.min(...yValues)
      const maxY = Math.max(...yValues)
      
      // Rangos típicos UTM:
      // X (Este): 166,000 - 834,000
      // Y (Norte): Para Perú: 8,500,000 - 10,000,000
      const isUtmX = minX > 100000 && maxX < 1000000
      const isUtmY = minY > 8000000 && maxY < 10500000
      
      return isUtmX && isUtmY
    } catch (err) {
      console.warn('[TopoJSONUploadWizard] Error detectando UTM:', err)
      return false
    }
  }
  
  // Extraer coordenadas de cualquier tipo de geometría
  const extractCoordinatesFromGeometry = (geometry) => {
    const coords = []
    
    if (geometry.type === 'Point') {
      coords.push(geometry.coordinates)
    } else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
      coords.push(...geometry.coordinates)
    } else if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
      geometry.coordinates.forEach(ring => {
        if (Array.isArray(ring)) coords.push(...ring)
      })
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        polygon.forEach(ring => {
          if (Array.isArray(ring)) coords.push(...ring)
        })
      })
    }
    
    return coords.filter(c => Array.isArray(c) && c.length >= 2)
  }
  
  // Step 3: Confirmar y subir
  const handleUpload = async () => {
    if (!file || !fileName.trim()) {
      setError('Nombre de archivo requerido')
      return
    }
    
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('filename', fileName.trim())
      formData.append('legendField', selectedLegendField || '')
      
      // Si tiene coordenadas UTM, enviar zona
      if (hasUtmCoordinates) {
        formData.append('utmZone', utmZone)
      }
      
      // Si necesita mapeo de columnas lat/lon
      if (needsColumnMapping && latitudeField && longitudeField) {
        formData.append('latitudeField', latitudeField)
        formData.append('longitudeField', longitudeField)
      }
      
      const response = await api.post('/api/geojson/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      if (response.data.success) {
        setStep(5)
        
        // Notificar éxito después de un momento
        setTimeout(() => {
          if (onUploadSuccess) {
            onUploadSuccess(response.data.layer)
          }
          onClose()
        }, 1500)
      } else {
        setError(response.data.error || 'Error al subir archivo')
      }
    } catch (err) {
      console.error('[TopoJSONUploadWizard] Error subiendo:', err)
      setError(err.response?.data?.error || 'Error al subir el archivo')
    } finally {
      setIsUploading(false)
    }
  }
  
  // Renderizado por step
  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Selecciona un archivo TopoJSON
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Se validará automáticamente al cargar
              </p>
              
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors">
                <FileJson className="w-5 h-5" />
                <span className="font-medium">Seleccionar archivo</span>
                <input
                  type="file"
                  accept=".json,.geojson,.topojson"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              
              <div className="mt-6 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>✓ Formatos soportados: .json, .geojson, .topojson</p>
                <p>✓ TopoJSON y GeoJSON válidos</p>
              </div>
            </div>
          </div>
        )
      
      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <FileJson className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {file?.name}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {(file?.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            
            {validationResult && (
              <div className="space-y-3">
                {/* Resultado de validación */}
                {validationResult.isValid ? (
                  <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        ✓ Archivo válido
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Tipo: {validationResult.type?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">
                        Errores encontrados:
                      </p>
                      <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                        {validationResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                
                {/* Advertencias */}
                {validationResult.warnings.length > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                        Advertencias:
                      </p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                        {validationResult.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setStep(1)
                  setFile(null)
                  setValidationResult(null)
                  setParsedData(null)
                }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Elegir otro archivo
              </button>
              
              {validationResult?.isValid && (
                <button
                  onClick={() => setStep((hasUtmCoordinates || needsColumnMapping) ? 3 : 4)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )
      
      case 3:
        // Paso 3: Zona UTM o Selector de columnas (según el caso)
        if (hasUtmCoordinates) {
          // Selector de zona UTM
          return (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Coordenadas UTM detectadas
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Se han detectado coordenadas en sistema UTM en la geometría. Por favor, indica la zona UTM correspondiente para transformarlas correctamente a WGS84.
                    </p>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Zona UTM del Perú
                </label>
                <select
                  value={utmZone}
                  onChange={(e) => setUtmZone(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="17">Zona 17 - Oeste (~84° a 78° Oeste)</option>
                  <option value="18">Zona 18 - Centro (~78° a 72° Oeste) - Más común</option>
                  <option value="19">Zona 19 - Este (~72° a 66° Oeste)</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  💡 La mayoría del territorio peruano está en la zona 18. Si tus datos provienen de la costa central o Lima, selecciona zona 18.
                </p>
              </div>
              
              {/* Botones */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Atrás
                </button>
                
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        } else if (needsColumnMapping) {
          // Selector de columnas lat/lon
          return (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Capa de puntos detectada
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Selecciona qué columnas contienen las coordenadas de latitud y longitud de tus puntos.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Columna de Latitud
                </label>
                <select
                  value={latitudeField}
                  onChange={(e) => setLatitudeField(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {availableFields.map(field => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Columna de Longitud
                </label>
                <select
                  value={longitudeField}
                  onChange={(e) => setLongitudeField(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {availableFields.map(field => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400">
              💡 Estas columnas deben contener valores numéricos. Latitud: -90 a 90, Longitud: -180 a 180
            </p>
            
            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Atrás
              </button>
              
              <button
                onClick={() => setStep(4)}
                disabled={!latitudeField || !longitudeField}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          )
        } else {
          return null
        }
      
      case 4:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nombre de la capa
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Ej: Lotes Nacional"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Este nombre aparecerá en el control de capas
              </p>
            </div>
            
            {availableFields.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Campo para leyenda (opcional)
                </label>
                <select
                  value={selectedLegendField}
                  onChange={(e) => setSelectedLegendField(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Sin campo de leyenda --</option>
                  {availableFields.map(field => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Se usará para generar colores únicos por categoría
                </p>
              </div>
            )}
            
            {availableFields.length === 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  ℹ️ No se encontraron campos de propiedades en este archivo
                </p>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            
            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep((hasUtmCoordinates || needsColumnMapping) ? 3 : 2)}
                disabled={isUploading}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Atrás
              </button>
              
              <button
                onClick={handleUpload}
                disabled={isUploading || !fileName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Subir capa
                  </>
                )}
              </button>
            </div>
          </div>
        )
      
      case 5:
        return (
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              ¡Capa subida exitosamente!
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              La capa "{fileName}" ya está disponible
            </p>
            {hasUtmCoordinates && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                ✓ Coordenadas transformadas de UTM Zona {utmZone} a WGS84
              </p>
            )}
            {needsColumnMapping && latitudeField && longitudeField && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                ✓ Coordenadas reconstruidas desde columnas: {latitudeField} / {longitudeField}
              </p>
            )}
          </div>
        )
      
      default:
        return null
    }
  }
  
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Subir TopoJSON
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Paso {Math.min(step, (hasUtmCoordinates || needsColumnMapping) ? 5 : 4)} de {(hasUtmCoordinates || needsColumnMapping) ? 5 : 4}
            </p>
          </div>
          
          {step !== 5 && (
            <button
              onClick={onClose}
              disabled={isUploading}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          )}
        </div>
        
        {/* Content */}
        <div className="px-6 py-4">
          {renderContent()}
        </div>
        
        {/* Progress indicator */}
        {step !== 4 && (
          <div className="px-6 pb-4">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    s <= step ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
