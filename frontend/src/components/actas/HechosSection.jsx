import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  GripVertical, 
  ChevronRight, 
  ChevronLeft,
  Check,
  AlertCircle,
  Camera,
  ArrowLeft,
  Image,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Eye,
  CheckCircle2,
  Circle,
  ImagePlus,
  Pencil,
  Save,
  RotateCcw,
  Sparkles,
  Wand2,
  FileText,
  Maximize2,
  Leaf,
  Scale
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { RichTextEditor } from '../RichTextEditor'
import { AIEnhancePanel } from '../AIEnhancePanel'
import { PhotoDetailModal } from './PhotoDetailModal'
import { normalizeHechoName, getHechoCodigo, HECHOS_BY_CODIGO } from '../../constants/hechosVerificados'

const API_BASE = 'http://localhost:3000'

// Helper para generar ID único por foto (globalid + filename)
// Esto permite que cada foto tenga su propia descripción y anotaciones
const getPhotoUniqueId = (foto) => {
  if (!foto) return null
  // Usar globalid + filename para identificar cada foto de forma única
  return `${foto.globalid || foto.gid}_${foto.filename || ''}`
}

// Opciones para los selects
const PRESUNTO_INCUMPLIMIENTO_OPTIONS = [
  { value: '', label: 'Seleccionar...' },
  { value: 'sí', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'no aplica', label: 'No aplica' },
  { value: 'por determinar', label: 'Por determinar' },
]

const SUBSANADO_OPTIONS = [
  { value: '', label: 'Seleccionar...' },
  { value: 'sí', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'no aplica', label: 'No aplica' },
]

export const HechosSection = ({ borrador, codigoAccion, modalidad, caData, onActiveHechoChange }) => {
  const { session } = useAuth()
  
  // Estados principales
  const [hechosDisponibles, setHechosDisponibles] = useState([]) // Todos los hechos del CA (filas individuales)
  const [hechosAgrupados, setHechosAgrupados] = useState([]) // Hechos agrupados por valor categórico
  const [hechosHabilitados, setHechosHabilitados] = useState({}) // Map: valorHecho -> boolean
  const [selectedHecho, setSelectedHecho] = useState(null) // Hecho agrupado seleccionado
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'photos' | 'detail'
  const [detailStep, setDetailStep] = useState(1) // 1: Datos generales, 2: Obligación, 3: Medios probatorios, 4: Descripción, 5: Req. Subsanación, 6: Análisis de Riesgo
  
  // Estados para los campos del formulario
  const [presuntoIncumplimiento, setPresuntoIncumplimiento] = useState('')
  const [subsanado, setSubsanado] = useState('')
  const [obligacion, setObligacion] = useState('')
  const [descripcionHecho, setDescripcionHecho] = useState('')
  const [nivelRiesgo, setNivelRiesgo] = useState('')
  const [justificacionRiesgo, setJustificacionRiesgo] = useState('')
  const [impactoPotencial, setImpactoPotencial] = useState('')
  const [medidasMitigacion, setMedidasMitigacion] = useState('')
  
  // Estado para Requerimiento de Subsanación (nuevo paso 5)
  const [requerimientoSubsanacion, setRequerimientoSubsanacion] = useState('')
  
  // ================== ESTADOS PARA ANÁLISIS DE RIESGO - ANEXO 4 OEFA ==================
  // Paso 1: Selección de entorno
  const [entornoAfectacion, setEntornoAfectacion] = useState('') // 'NATURAL' | 'HUMANO'
  
  // Factores comunes (Cuadros 2-4, 6-8)
  const [factorCantidad, setFactorCantidad] = useState(0) // 1-4
  const [factorPeligrosidad, setFactorPeligrosidad] = useState(0) // 1-4
  const [factorExtension, setFactorExtension] = useState(0) // 1-4
  
  // Factor específico Entorno Humano (Cuadro 5)
  const [factorPersonasExpuestas, setFactorPersonasExpuestas] = useState(0) // 1-4
  
  // Factor específico Entorno Natural (Cuadro 9)
  const [factorMedioAfectado, setFactorMedioAfectado] = useState(0) // 1-4
  
  // Probabilidad de ocurrencia (Cuadro 1)
  const [probabilidadOcurrencia, setProbabilidadOcurrencia] = useState(0) // 1-5
  
  // Valores calculados (se derivan automáticamente)
  const [scoreConsecuencia, setScoreConsecuencia] = useState(0) // 5-20
  const [valorConsecuencia, setValorConsecuencia] = useState(0) // 1-5 (gravedad)
  const [valorRiesgo, setValorRiesgo] = useState(0) // 1-25
  const [tipoIncumplimiento, setTipoIncumplimiento] = useState('') // Derivado del nivel de riesgo
  
  // Texto generado automáticamente del análisis de riesgo
  const [textoAnalisisRiesgo, setTextoAnalisisRiesgo] = useState('')
  
  // Estado para drag & drop (solo hechos habilitados)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [ordenHechos, setOrdenHechos] = useState([]) // Array de valores de hecho en orden
  
  // Fotos del hecho seleccionado
  const [fotosDisponibles, setFotosDisponibles] = useState([])
  const [fotosSeleccionadas, setFotosSeleccionadas] = useState([])
  const [loadingFotos, setLoadingFotos] = useState(false)
  
  // Estado para descripciones editables
  const [mostrarEditadas, setMostrarEditadas] = useState(true) // Switch: true = "Mi versión", false = "Original"
  const [descripcionesEditadas, setDescripcionesEditadas] = useState({}) // Map: photoUniqueId -> texto editado
  const [savingDescripcion, setSavingDescripcion] = useState(null) // photoUniqueId que se está guardando
  
  // Estado para metadata editables (componente, instalacion_referencia)
  const [metadataEditadas, setMetadataEditadas] = useState({}) // Map: globalid -> { componente?, instalacion_referencia? }
  const [savingMetadata, setSavingMetadata] = useState(null) // globalid que se está guardando
  
  // Estado para título del hecho
  const [tituloHecho, setTituloHecho] = useState('')
  const [hechoGuardadoId, setHechoGuardadoId] = useState(null) // ID del hecho en la BD
  const [hechosCompletados, setHechosCompletados] = useState({}) // Map: valorHecho -> boolean (completados)
  const [hechosTitulos, setHechosTitulos] = useState({}) // Map: valorHecho -> titulo personalizado
  const [savingTitulo, setSavingTitulo] = useState(false)
  const [savingBorrador, setSavingBorrador] = useState(false) // Para guardar borrador
  
  // Estado para generador de descripción AI
  const [generatingDescription, setGeneratingDescription] = useState(false)
  
  // Estado para generador de análisis de riesgo AI
  const [generatingRiskAnalysis, setGeneratingRiskAnalysis] = useState(false)
  
  // Estado para modal de foto maximizada
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  
  // Estado para anotaciones de fotos (óvalos/círculos dibujados)
  const [photoAnnotations, setPhotoAnnotations] = useState({}) // Map: photoUniqueId -> array de anotaciones
  
  // Estado para paginación de fotos (optimización para 1000+ fotos)
  const [photosPage, setPhotosPage] = useState(0)
  const PHOTOS_PER_PAGE = 20 // Cargar de a 20 fotos para rendimiento
  const [photoDimensions, setPhotoDimensions] = useState({}) // Map: photoUniqueId -> {width, height}

  const THUMB_WIDTH = 160 // Tailwind w-40 (10rem)
  const THUMB_HEIGHT = 112 // Tailwind h-28 (7rem)
  
  // Ref para evitar recargas innecesarias al cambiar de pestaña
  const lastLoadedCA = useRef(null)
  const isInitialLoad = useRef(true)
  const componentMounted = useRef(false) // Para detectar si es un re-mount
  const hasLoadedFromStorage = useRef(false) // Para controlar carga de localStorage

  // Clave única para localStorage basada en el borrador
  const getStorageKey = useCallback((suffix) => {
    if (!borrador?.id) return null
    return `acta_hechos_${borrador.id}_${suffix}`
  }, [borrador?.id])
  
  // Auth headers helper
  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${session?.access_token}` }
  }), [session])
  
  // Agrupar hechos por su valor categórico
  // IMPORTANTE: Normaliza el valor para limpiar underscores y duplicados de Survey123
  const agruparHechosPorValor = (hechos) => {
    const grupos = {}
    
    hechos.forEach(h => {
      // Normalizar el valor: quitar underscores, duplicados, etc.
      const valorNormalizado = normalizeHechoName(h.valor || '')
      if (!valorNormalizado) return
      
      if (!grupos[valorNormalizado]) {
        // Obtener el código de letra (A, B, ... S, Ñ)
        const codigo = getHechoCodigo(valorNormalizado)
        const hechoCanonical = HECHOS_BY_CODIGO[codigo]
        
        grupos[valorNormalizado] = {
          valor: valorNormalizado,
          valorOriginal: h.valor, // Guardar original por si se necesita
          codigo: codigo,
          nombreCanonical: hechoCanonical?.nombre || valorNormalizado,
          registros: [], // Todas las filas con este hecho
          fuentes: new Set(),
          componentes: new Set(),
          tiposComponente: new Set(),
          descripciones: [],
          totalFotos: 0
        }
      }
      
      grupos[valorNormalizado].registros.push(h)
      grupos[valorNormalizado].fuentes.add(h.fuente)
      grupos[valorNormalizado].totalFotos += (h.cantidadFotos || 0)
      if (h.componente) grupos[valorNormalizado].componentes.add(h.componente)
      if (h.tipo_componente) grupos[valorNormalizado].tiposComponente.add(h.tipo_componente)
      if (h.descripcion) grupos[valorNormalizado].descripciones.push(h.descripcion)
    })
    
    // Convertir a array y formatear
    return Object.values(grupos).map(g => ({
      valor: g.valor,
      valorOriginal: g.valorOriginal,
      codigo: g.codigo,
      nombreCanonical: g.nombreCanonical,
      registros: g.registros,
      cantidadRegistros: g.registros.length,
      cantidadFotos: g.totalFotos,
      fuentes: Array.from(g.fuentes),
      componentes: Array.from(g.componentes),
      tiposComponente: Array.from(g.tiposComponente),
      descripcion: g.descripciones[0] || '', // Usar primera descripción encontrada
      globalids: g.registros.map(r => r.globalid) // Lista de globalids para cargar fotos
    }))
  }
  
  // Efecto para enriquecer fotos seleccionadas cuando se cargan las disponibles
  // Esto es necesario porque las fotos guardadas en BD pueden no tener URL o tener URL con token expirado
  useEffect(() => {
    if (fotosDisponibles.length > 0 && fotosSeleccionadas.length > 0) {
      // Verificar si las fotos seleccionadas necesitan enriquecerse
      // Enriquecer si falta globalid O si falta url O si la url no tiene el token actual
      const token = session?.access_token
      const necesitaEnriquecer = fotosSeleccionadas.some(f => 
        !f.globalid || !f.url || (token && !f.url.includes(token))
      )
      
      if (necesitaEnriquecer) {
        console.log('[HechosSection] Enriqueciendo fotos seleccionadas con metadata y URLs actualizadas...')
        const fotosEnriquecidas = fotosSeleccionadas.map(fotoSel => {
          // Buscar la foto correspondiente en las disponibles
          const fotoCompleta = fotosDisponibles.find(
            fd => fd.gid === fotoSel.gid && fd.filename === fotoSel.filename
          )
          if (fotoCompleta) {
            return { ...fotoCompleta } // Usar la foto completa con toda su metadata y URL actualizada
          }
          return fotoSel // Mantener la original si no se encuentra
        })
        setFotosSeleccionadas(fotosEnriquecidas)
        console.log('[HechosSection] Fotos enriquecidas:', fotosEnriquecidas.length)
      }
    }
  }, [fotosDisponibles, session?.access_token]) // Cuando cambian las fotos disponibles o el token
  
  // Helper para formatear título (reemplazar _ por espacios)
  const formatTitulo = (texto) => {
    if (!texto) return ''
    return texto.replace(/_/g, ' ')
  }
  
  // Helper para normalizar claves (para comparación flexible)
  // IMPORTANTE: Usar normalizeHechoName para manejar underscores y duplicados
  const normalizeKey = (key) => {
    if (!key) return ''
    // Primero normalizar con la función principal (quita _, duplicados, etc.)
    const normalized = normalizeHechoName(key)
    // Luego convertir a minúsculas para comparación case-insensitive
    return normalized.toLowerCase().trim()
  }
  
  // Helper para extraer la parte base de una clave (antes del pipe o la clave completa si no hay pipe)
  const getBaseKey = (key) => {
    if (!key) return ''
    // Si tiene pipe, tomar la primera parte (que es la versión deduplicada)
    const parts = key.split('|').map(p => p.trim()).filter(p => p)
    return parts[0] || key
  }
  
  // Helper para buscar título personalizado (con búsqueda pipe-aware como fallback)
  const getTituloPersonalizado = (hechoValor) => {
    // Primero, búsqueda exacta
    if (hechosTitulos[hechoValor]) {
      return hechosTitulos[hechoValor]
    }
    
    // Si no hay coincidencia exacta, buscar con claves que contengan el valor (pipe-aware)
    // Esto maneja el caso donde la BD tiene "A | A" pero buscamos "A"
    const valorBase = getBaseKey(hechoValor)
    for (const [key, titulo] of Object.entries(hechosTitulos)) {
      const keyBase = getBaseKey(key)
      // Comparar las partes base (antes del pipe)
      if (keyBase === valorBase || normalizeKey(keyBase) === normalizeKey(valorBase)) {
        console.log('[getTituloPersonalizado] Match pipe-aware encontrado:', key, '->', titulo)
        return titulo
      }
    }
    
    // Último intento: normalización completa
    const valorNormalizado = normalizeKey(hechoValor)
    for (const [key, titulo] of Object.entries(hechosTitulos)) {
      if (normalizeKey(key) === valorNormalizado) {
        console.log('[getTituloPersonalizado] Match normalizado encontrado:', key, '->', titulo)
        return titulo
      }
    }
    
    return null
  }
  
  // Helper para verificar si un hecho está completado (con búsqueda pipe-aware como fallback)
  const isHechoCompletado = (hechoValor) => {
    // Primero, búsqueda exacta
    if (hechosCompletados[hechoValor]) {
      return true
    }
    
    // Si no hay coincidencia exacta, buscar con claves que contengan el valor (pipe-aware)
    // Esto maneja el caso donde la BD tiene "A | A" pero buscamos "A" o viceversa
    const valorBase = getBaseKey(hechoValor)
    for (const key of Object.keys(hechosCompletados)) {
      if (hechosCompletados[key]) {
        const keyBase = getBaseKey(key)
        // Comparar las partes base (antes del pipe)
        if (keyBase === valorBase || normalizeKey(keyBase) === normalizeKey(valorBase)) {
          return true
        }
      }
    }
    
    // Último intento: normalización completa
    const valorNormalizado = normalizeKey(hechoValor)
    for (const key of Object.keys(hechosCompletados)) {
      if (hechosCompletados[key] && normalizeKey(key) === valorNormalizado) {
        return true
      }
    }
    
    return false
  }
  
  // Helper para verificar si HTML tiene contenido real (no solo tags vacíos)
  const hasRichTextContent = (html) => {
    if (!html) return false
    // Remover tags HTML y espacios en blanco
    const textContent = html.replace(/<[^>]*>/g, '').trim()
    return textContent.length > 0
  }
  
  // ================== FUNCIONES DE CÁLCULO - ANEXO 4 OEFA ==================
  
  /**
   * Mapear puntuación de consecuencia (5-20) a valor de gravedad (1-5)
   * Cuadros N° 10 y 11 del Anexo 4
   */
  const mapearPuntuacionAConsecuencia = (score) => {
    if (score >= 18) return 5 // Crítica
    if (score >= 15) return 4 // Grave
    if (score >= 11) return 3 // Moderada
    if (score >= 8) return 2  // Leve
    return 1 // No relevante (5-7)
  }
  
  /**
   * Obtener etiqueta de condición de consecuencia
   */
  const getCondicionConsecuencia = (valor) => {
    switch (valor) {
      case 5: return 'Crítica'
      case 4: return 'Grave'
      case 3: return 'Moderada'
      case 2: return 'Leve'
      case 1: return 'No relevante'
      default: return '-'
    }
  }
  
  /**
   * Mapear valor de riesgo (1-25) a nivel de riesgo
   * Cuadro N° 12 del Anexo 4
   */
  const mapearRiesgoANivel = (riesgoValor) => {
    if (riesgoValor >= 16) return 'SIGNIFICATIVO'
    if (riesgoValor >= 6) return 'MODERADO'
    return 'LEVE'
  }
  
  /**
   * Mapear nivel de riesgo a tipo de incumplimiento
   * Regla de negocio sobre el Anexo 4
   */
  const mapearNivelAIncumplimiento = (nivelRiesgo) => {
    switch (nivelRiesgo) {
      case 'SIGNIFICATIVO': return 'INCUMPLIMIENTO SIGNIFICATIVO'
      case 'MODERADO': return 'INCUMPLIMIENTO MODERADO'
      case 'LEVE': return 'INCUMPLIMIENTO LEVE'
      default: return '-'
    }
  }
  
  /**
   * Obtener color del nivel de riesgo para UI
   */
  const getColorNivelRiesgo = (nivel) => {
    switch (nivel) {
      case 'SIGNIFICATIVO': return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-500' }
      case 'MODERADO': return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-500' }
      case 'LEVE': return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-500' }
      default: return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-300' }
    }
  }
  
  // Opciones para los selects del Anexo 4
  const OPCIONES_CANTIDAD = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) Menor (<1 Tn | <5 m³ | <10% exceso | <10% incumplimiento)' },
    { value: 2, label: '2) Bajo (>1-2 Tn | 5-10 m³ | 10-50% exceso | 10-25% incumplimiento)' },
    { value: 3, label: '3) Medio (>2-5 Tn | 10-50 m³ | 50-100% exceso | 25-50% incumplimiento)' },
    { value: 4, label: '4) Alto (>5 Tn | >50 m³ | ≥100% exceso | 50-100% incumplimiento)' }
  ]
  
  const OPCIONES_PELIGROSIDAD = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) No peligrosa (daños leves y reversibles, bajo grado de afectación)' },
    { value: 2, label: '2) Poco peligrosa (combustible, grado medio reversible)' },
    { value: 3, label: '3) Peligrosa (explosiva, inflamable, corrosiva, grado alto irreversible)' },
    { value: 4, label: '4) Muy peligrosa (muy inflamable, tóxica, efectos irreversibles/inmediatos)' }
  ]
  
  const OPCIONES_EXTENSION = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) Puntual (radio ≤0.1 km, <500 m²)' },
    { value: 2, label: '2) Poco extenso (radio ≤0.5 km, 500-1000 m²)' },
    { value: 3, label: '3) Extenso (radio ≤1 km, 1000-10000 m²)' },
    { value: 4, label: '4) Muy extenso (radio >1 km, >10000 m²)' }
  ]
  
  const OPCIONES_PERSONAS_EXPUESTAS = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) Muy bajo (<5 personas)' },
    { value: 2, label: '2) Bajo (5-49 personas)' },
    { value: 3, label: '3) Alto (50-100 personas)' },
    { value: 4, label: '4) Muy alto (>100 personas)' }
  ]
  
  const OPCIONES_MEDIO_AFECTADO = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) Industrial' },
    { value: 2, label: '2) Agrícola' },
    { value: 3, label: '3) Fuera de ANP, zonas de amortiguamiento o ecosistemas frágiles' },
    { value: 4, label: '4) ANP (nacional, regional, privada), zona de amortiguamiento o ecosistema frágil' }
  ]
  
  const OPCIONES_PROBABILIDAD = [
    { value: 0, label: 'Seleccionar...' },
    { value: 1, label: '1) Poco probable (puede suceder en >1 año)' },
    { value: 2, label: '2) Posible (puede suceder dentro de 1 año)' },
    { value: 3, label: '3) Probable (puede suceder dentro de 1 mes)' },
    { value: 4, label: '4) Altamente probable (puede suceder dentro de 1 semana)' },
    { value: 5, label: '5) Muy probable (ocurre de manera continua o diaria)' }
  ]
  
  // Efecto para calcular valores automáticamente cuando cambian los factores
  useEffect(() => {
    if (!entornoAfectacion) {
      setScoreConsecuencia(0)
      setValorConsecuencia(0)
      setValorRiesgo(0)
      setNivelRiesgo('')
      setTipoIncumplimiento('')
      return
    }
    
    // Calcular score de consecuencia según la fórmula del Anexo 4
    let score = 0
    if (entornoAfectacion === 'HUMANO') {
      // Fórmula Nº 2: Cantidad + 2*Peligrosidad + Extensión + PersonasExpuestas
      score = factorCantidad + (2 * factorPeligrosidad) + factorExtension + factorPersonasExpuestas
    } else if (entornoAfectacion === 'NATURAL') {
      // Fórmula Nº 3: Cantidad + 2*Peligrosidad + Extensión + MedioAfectado
      score = factorCantidad + (2 * factorPeligrosidad) + factorExtension + factorMedioAfectado
    }
    
    setScoreConsecuencia(score)
    
    // Mapear score a valor de consecuencia (gravedad 1-5)
    const consecuencia = score > 0 ? mapearPuntuacionAConsecuencia(score) : 0
    setValorConsecuencia(consecuencia)
    
    // Calcular riesgo: Probabilidad × Consecuencia
    const riesgo = probabilidadOcurrencia * consecuencia
    setValorRiesgo(riesgo)
    
    // Determinar nivel de riesgo
    if (riesgo > 0) {
      const nivel = mapearRiesgoANivel(riesgo)
      setNivelRiesgo(nivel.toLowerCase()) // Mantener compatibilidad con el estado existente
      setTipoIncumplimiento(mapearNivelAIncumplimiento(nivel))
    } else {
      setNivelRiesgo('')
      setTipoIncumplimiento('')
    }
  }, [entornoAfectacion, factorCantidad, factorPeligrosidad, factorExtension, factorPersonasExpuestas, factorMedioAfectado, probabilidadOcurrencia])
  
  // ================== GENERACIÓN AUTOMÁTICA DEL TEXTO DE ANÁLISIS DE RIESGO ==================
  // Mapeos para obtener texto descriptivo de cada factor
  const getTextoEntorno = (entorno) => entorno === 'NATURAL' ? 'Natural' : entorno === 'HUMANO' ? 'Humano' : ''
  
  const getTextoCantidad = (valor) => {
    const textos = {
      1: 'considerando como la única obligación indicada en la normativa, se considera un valor menor al 10% de incumplimiento',
      2: 'considerando el nivel de incumplimiento entre 10% y 25%',
      3: 'considerando el nivel de incumplimiento entre 25% y 50%',
      4: 'considerando el nivel de incumplimiento entre 50% y 100%'
    }
    return textos[valor] || ''
  }
  
  const getTextoPeligrosidad = (valor) => {
    const textos = {
      1: 'Baja',
      2: 'Poco peligrosa',
      3: 'Peligrosa',
      4: 'Muy peligrosa'
    }
    return textos[valor] || ''
  }
  
  const getTextoExtension = (valor) => {
    const textos = {
      1: 'Puntual',
      2: 'Poco extenso',
      3: 'Extenso',
      4: 'Muy extenso'
    }
    return textos[valor] || ''
  }
  
  const getTextoPersonasExpuestas = (valor) => {
    const textos = {
      1: 'menos de 5 personas expuestas',
      2: 'entre 5 y 49 personas expuestas',
      3: 'entre 50 y 100 personas expuestas',
      4: 'más de 100 personas expuestas'
    }
    return textos[valor] || ''
  }
  
  const getTextoMedioAfectado = (valor) => {
    const textos = {
      1: 'zona industrial',
      2: 'zona agrícola',
      3: 'zona fuera de ANP, zonas de amortiguamiento o ecosistemas frágiles',
      4: 'ANP (nacional, regional, privada), zona de amortiguamiento o ecosistema frágil'
    }
    return textos[valor] || ''
  }
  
  // Mapeo de probabilidad a texto descriptivo
  const getTextoProbabilidad = (valor) => {
    const textos = {
      1: 'Poco probable (puede suceder en más de un año)',
      2: 'Posible (puede suceder dentro de un año)',
      3: 'Probable (puede suceder dentro de un mes)',
      4: 'Altamente probable (puede suceder dentro de una semana)',
      5: 'Muy probable (ocurre de manera continua o diaria)'
    }
    return textos[valor] || ''
  }
  
  // Mapeo de consecuencia a texto descriptivo
  const getTextoConsecuencia = (valor) => {
    const textos = {
      1: 'No relevante',
      2: 'Leve',
      3: 'Moderada',
      4: 'Grave',
      5: 'Crítica'
    }
    return textos[valor] || ''
  }
  
  // Mapeo de nivel de riesgo a texto descriptivo
  const getTextoNivelRiesgo = (nivel) => {
    const textos = {
      'leve': 'LEVE (1-5)',
      'moderado': 'MODERADO (6-15)',
      'significativo': 'SIGNIFICATIVO (16-25)'
    }
    return textos[nivel?.toLowerCase()] || nivel || ''
  }
  
  // Efecto para generar automáticamente el texto del análisis de riesgo
  // IMPORTANTE: Calculamos los valores internamente para evitar dependencias circulares con otros useEffects
  useEffect(() => {
    if (!entornoAfectacion) {
      setTextoAnalisisRiesgo('')
      return
    }
    
    // Calcular valores internamente (misma lógica que el otro useEffect pero sin depender de estados)
    const factorEntornoValor = entornoAfectacion === 'NATURAL' ? factorMedioAfectado : factorPersonasExpuestas
    const calcScore = factorCantidad + (2 * factorPeligrosidad) + factorExtension + factorEntornoValor
    
    // Mapear score a consecuencia (igual que mapearPuntuacionAConsecuencia)
    let calcConsecuencia = 0
    if (calcScore >= 18) calcConsecuencia = 5
    else if (calcScore >= 15) calcConsecuencia = 4
    else if (calcScore >= 11) calcConsecuencia = 3
    else if (calcScore >= 8) calcConsecuencia = 2
    else if (calcScore >= 5) calcConsecuencia = 1
    
    // Calcular riesgo
    const calcRiesgo = probabilidadOcurrencia * calcConsecuencia
    
    // Determinar nivel de riesgo
    let calcNivel = ''
    if (calcRiesgo >= 16) calcNivel = 'significativo'
    else if (calcRiesgo >= 6) calcNivel = 'moderado'
    else if (calcRiesgo >= 1) calcNivel = 'leve'
    
    // Construir el texto HTML con viñetas
    const items = []
    
    // ===== SECCIÓN 1: FACTORES DE CONSECUENCIA =====
    // Entorno
    if (entornoAfectacion) {
      items.push(`<strong>Entorno:</strong> ${getTextoEntorno(entornoAfectacion)}.`)
    }
    
    // Cantidad
    if (factorCantidad > 0) {
      items.push(`<strong>Cantidad (${factorCantidad}):</strong> ${getTextoCantidad(factorCantidad)}.`)
    }
    
    // Peligrosidad
    if (factorPeligrosidad > 0) {
      items.push(`<strong>Peligrosidad (${factorPeligrosidad}):</strong> ${getTextoPeligrosidad(factorPeligrosidad)}.`)
    }
    
    // Medio potencialmente afectado (solo para entorno natural) o Personas expuestas (para humano)
    if (entornoAfectacion === 'NATURAL' && factorMedioAfectado > 0) {
      items.push(`<strong>Medio potencialmente afectado (${factorMedioAfectado}):</strong> ${getTextoMedioAfectado(factorMedioAfectado)}.`)
    } else if (entornoAfectacion === 'HUMANO' && factorPersonasExpuestas > 0) {
      items.push(`<strong>Personas expuestas (${factorPersonasExpuestas}):</strong> ${getTextoPersonasExpuestas(factorPersonasExpuestas)}.`)
    }
    
    // Extensión
    if (factorExtension > 0) {
      items.push(`<strong>Extensión (${factorExtension}):</strong> ${getTextoExtension(factorExtension)}.`)
    }
    
    // ===== SECCIÓN 2: CÁLCULO DE CONSECUENCIA =====
    if (calcScore >= 5 && factorCantidad > 0 && factorPeligrosidad > 0 && factorExtension > 0 && factorEntornoValor > 0) {
      items.push(`<strong>Cálculo de Consecuencia:</strong> ${factorCantidad} + (2 × ${factorPeligrosidad}) + ${factorExtension} + ${factorEntornoValor} = <strong>${calcScore}</strong> → Consecuencia <strong>${getTextoConsecuencia(calcConsecuencia)} (${calcConsecuencia})</strong>.`)
    }
    
    // ===== SECCIÓN 3: PROBABILIDAD DE OCURRENCIA =====
    if (probabilidadOcurrencia > 0) {
      items.push(`<strong>Probabilidad de ocurrencia (${probabilidadOcurrencia}):</strong> ${getTextoProbabilidad(probabilidadOcurrencia)}.`)
    }
    
    // ===== SECCIÓN 4: CÁLCULO FINAL DE RIESGO =====
    if (calcRiesgo > 0 && probabilidadOcurrencia > 0 && calcConsecuencia > 0) {
      items.push(`<strong>Cálculo de Riesgo:</strong> Probabilidad (${probabilidadOcurrencia}) × Consecuencia (${calcConsecuencia}) = <strong>${calcRiesgo}</strong>.`)
    }
    
    // ===== SECCIÓN 5: NIVEL DE RIESGO FINAL =====
    if (calcNivel) {
      items.push(`<strong>Nivel de Riesgo:</strong> <strong>${getTextoNivelRiesgo(calcNivel)}</strong>.`)
    }
    
    // Generar HTML con lista de viñetas
    if (items.length > 0) {
      const html = `<ul>\n${items.map(item => `  <li>${item}</li>`).join('\n')}\n</ul>`
      setTextoAnalisisRiesgo(html)
    } else {
      setTextoAnalisisRiesgo('')
    }
  }, [entornoAfectacion, factorCantidad, factorPeligrosidad, factorExtension, factorPersonasExpuestas, factorMedioAfectado, probabilidadOcurrencia])
  
  // Generar análisis de riesgo con Gemini AI
  const generarAnalisisRiesgoAI = async () => {
    if (!valorRiesgo || !entornoAfectacion) {
      toast.error('Completa primero todos los factores del análisis de riesgo')
      return
    }
    
    setGeneratingRiskAnalysis(true)
    try {
      const response = await axios.post(`${API_BASE}/api/actas/ai-generate-risk-analysis`, {
        // Contexto del hecho
        obligacion,
        descripcionHecho,
        tituloHecho,
        // Datos del análisis de riesgo
        entornoAfectacion,
        factorCantidad,
        factorPeligrosidad,
        factorExtension,
        factorPersonasExpuestas,
        factorMedioAfectado,
        probabilidadOcurrencia,
        // Valores calculados
        scoreConsecuencia,
        valorConsecuencia,
        valorRiesgo,
        nivelRiesgo,
        tipoIncumplimiento
      }, getAuthHeaders())
      
      if (response.data.success) {
        // Convertir texto plano a HTML para RichTextEditor
        const toHtml = (text) => {
          if (!text) return ''
          // Dividir por saltos de línea dobles (párrafos) o simples
          return text
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(p => p)
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('')
        }
        
        const justHtml = toHtml(response.data.justificacion)
        const impactoHtml = toHtml(response.data.impactoPotencial)
        const medidasHtml = toHtml(response.data.medidasMitigacion)
        
        setJustificacionRiesgo(justHtml)
        setImpactoPotencial(impactoHtml)
        setMedidasMitigacion(medidasHtml)
        
        // Guardar como versión inicial si hay hechoGuardadoId
        if (hechoGuardadoId && borrador?.id) {
          const saveVersion = async (fieldName, content) => {
            if (!content) return
            try {
              await axios.post(`${API_BASE}/api/actas/versions`, {
                entityType: `hecho_${fieldName}`,
                entityId: hechoGuardadoId,
                actaId: borrador.id,
                fieldName: `${fieldName}_fiscalizable`,
                content: content,
                contentPlain: content.replace(/<[^>]*>/g, ''),
                versionType: 'ai_generated',
                aiModel: 'gemini-2.5-flash',
                createdBy: session?.user?.email || 'local'
              }, getAuthHeaders())
            } catch (e) {
              console.warn(`Error guardando versión de ${fieldName}:`, e)
            }
          }
          
          // Guardar las 3 versiones en paralelo
          await Promise.all([
            saveVersion('justificacion_riesgo', justHtml),
            saveVersion('impacto_potencial', impactoHtml),
            saveVersion('medidas_mitigacion', medidasHtml)
          ])
        }
        
        toast.success('Análisis de riesgo generado con IA')
      } else {
        throw new Error(response.data.error || 'Error desconocido')
      }
    } catch (error) {
      console.error('Error generando análisis de riesgo:', error)
      toast.error('Error al generar análisis: ' + (error.response?.data?.error || error.message))
    } finally {
      setGeneratingRiskAnalysis(false)
    }
  }
  
  // Cargar hechos disponibles del CA
  const loadHechosDisponibles = useCallback(async (forceReload = false) => {
    if (!codigoAccion || !session?.access_token) return
    
    // Evitar recargas innecesarias si ya cargamos este CA
    if (!forceReload && lastLoadedCA.current === codigoAccion && !isInitialLoad.current) {
      console.log('[HechosSection] CA ya cargado, omitiendo recarga:', codigoAccion)
      return
    }
    
    setLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/api/actas/hechos-disponibles/${codigoAccion}`, getAuthHeaders())
      if (response.data.success) {
        const hechos = response.data.hechos || []
        setHechosDisponibles(hechos)
        
        // Agrupar hechos por valor categórico
        const agrupados = agruparHechosPorValor(hechos)
        setHechosAgrupados(agrupados)
        
        // Solo inicializar habilitados/orden si es la primera carga o cambio de CA
        if (isInitialLoad.current || lastLoadedCA.current !== codigoAccion) {
          // Intentar cargar orden y habilitados desde localStorage
          const ordenKey = getStorageKey('orden')
          const habilitadosKey = getStorageKey('habilitados')
          
          let ordenGuardado = null
          let habilitadosGuardado = null
          
          if (ordenKey && habilitadosKey) {
            try {
              const ordenStr = localStorage.getItem(ordenKey)
              const habilitadosStr = localStorage.getItem(habilitadosKey)
              if (ordenStr) {
                const ordenRaw = JSON.parse(ordenStr)
                // Normalizar claves antiguas (con underscores) a nuevas (con espacios)
                ordenGuardado = ordenRaw.map(v => normalizeHechoName(v))
              }
              if (habilitadosStr) {
                const habilitadosRaw = JSON.parse(habilitadosStr)
                // Normalizar claves antiguas
                habilitadosGuardado = {}
                Object.entries(habilitadosRaw).forEach(([key, value]) => {
                  const normalizedKey = normalizeHechoName(key)
                  habilitadosGuardado[normalizedKey] = value
                })
              }
            } catch (e) {
              console.warn('[HechosSection] Error cargando desde localStorage:', e)
            }
          }
          
          // Valores actuales de los hechos
          const valoresActuales = new Set(agrupados.map(g => g.valor))
          
          // Si hay orden guardado, usarlo pero filtrar hechos que ya no existen
          // y agregar hechos nuevos al final
          if (ordenGuardado && Array.isArray(ordenGuardado)) {
            // Filtrar valores que aún existen
            const ordenFiltrado = ordenGuardado.filter(v => valoresActuales.has(v))
            // Encontrar valores nuevos que no están en el orden guardado
            const valoresNuevos = agrupados
              .map(g => g.valor)
              .filter(v => !ordenGuardado.includes(v))
            // Combinar: orden guardado + nuevos al final
            setOrdenHechos([...ordenFiltrado, ...valoresNuevos])
            console.log('[HechosSection] Orden restaurado desde localStorage:', ordenFiltrado.length, 'guardados,', valoresNuevos.length, 'nuevos')
          } else {
            // No hay orden guardado, usar orden por defecto
            const ordenInit = agrupados.map(g => g.valor)
            setOrdenHechos(ordenInit)
          }
          
          // Si hay habilitados guardados, usarlos
          if (habilitadosGuardado && typeof habilitadosGuardado === 'object') {
            // Inicializar con valores guardados, nuevos hechos DESHABILITADOS por defecto
            const habilitadosInit = {}
            agrupados.forEach(g => {
              habilitadosInit[g.valor] = habilitadosGuardado.hasOwnProperty(g.valor) 
                ? habilitadosGuardado[g.valor] 
                : false // Por defecto OFF hasta que el usuario lo active o complete
            })
            setHechosHabilitados(habilitadosInit)
          } else {
            // No hay guardado, todos DESHABILITADOS por defecto
            // El usuario debe activar manualmente o completar para que aparezcan
            const habilitadosInit = {}
            agrupados.forEach(g => {
              habilitadosInit[g.valor] = false
            })
            setHechosHabilitados(habilitadosInit)
          }
          
          hasLoadedFromStorage.current = true
        }
        
        // Marcar como cargado
        lastLoadedCA.current = codigoAccion
        isInitialLoad.current = false
        
        // Log de valores de hechos agrupados para comparar con BD
        console.log('[loadHechosDisponibles] Valores de hechos agrupados:', agrupados.map(g => g.valor))
        
        // Cargar hechos completados desde la BD
        await loadHechosCompletados()
      }
    } catch (error) {
      console.error('Error cargando hechos disponibles:', error)
      toast.error('Error al cargar hechos')
    } finally {
      setLoading(false)
    }
  }, [codigoAccion, session, getAuthHeaders])
  
  // Cargar hechos completados desde la BD
  const loadHechosCompletados = async () => {
    if (!borrador?.id || !session?.access_token) {
      console.log('[loadHechosCompletados] ⚠️ Sin borrador o sesión. borrador?.id:', borrador?.id)
      return
    }
    
    try {
      console.log('[loadHechosCompletados] Cargando hechos para borrador:', borrador.id, 'CA:', borrador.codigo_accion)
      const response = await axios.get(`${API_BASE}/api/actas/${borrador.id}/hechos`, getAuthHeaders())
      console.log('[loadHechosCompletados] Respuesta BD:', response.data.hechos?.map(h => ({
        id: h.id,
        hecho_detec_original: h.hecho_detec_original,
        titulo_hecho: h.titulo_hecho,
        is_completed: h.is_completed
      })))
      
      if (response.data.success && response.data.hechos) {
        const completadosMap = {}
        const titulosMap = {}
        const habilitadosFromDB = {}
        
        response.data.hechos.forEach(hecho => {
          if (hecho.hecho_detec_original) {
            // IMPORTANTE: Normalizar la clave para que coincida con hechosAgrupados
            const claveNormalizada = normalizeHechoName(hecho.hecho_detec_original)
            
            // Guardar estado completado
            if (hecho.is_completed === 1) {
              completadosMap[claveNormalizada] = true
              // Si está completado, también debe estar habilitado
              habilitadosFromDB[claveNormalizada] = true
            }
            
            // Guardar título personalizado si existe
            if (hecho.titulo_hecho && hecho.titulo_hecho.trim()) {
              titulosMap[claveNormalizada] = hecho.titulo_hecho
              console.log('[HechosSection] Título cargado:', claveNormalizada, '->', hecho.titulo_hecho)
            }
          }
        })
        
        console.log('[HechosSection] Hechos completados cargados:', Object.keys(completadosMap).length)
        console.log('[HechosSection] Títulos personalizados cargados:', Object.keys(titulosMap).length)
        
        // DIAGNÓSTICO: Comparar claves de BD con valores de hechos agrupados
        if (hechosAgrupados.length > 0) {
          const valoresAgrupados = hechosAgrupados.map(h => h.valor)
          const clavesBD = Object.keys(completadosMap)
          console.log('[HechosSection] 📊 DIAGNÓSTICO DE CLAVES:')
          console.log('  - Valores en hechosAgrupados:', valoresAgrupados)
          console.log('  - Claves en completadosMap (BD normalizado):', clavesBD)
          
          // Verificar coincidencias
          clavesBD.forEach(claveBD => {
            const coincide = valoresAgrupados.includes(claveBD)
            console.log(`  - Clave BD "${claveBD}" ${coincide ? '✅ COINCIDE' : '❌ NO COINCIDE'} con algún valor agrupado`)
          })
        }
        
        setHechosCompletados(completadosMap)
        setHechosTitulos(titulosMap)
        
        // IMPORTANTE: Actualizar habilitados para hechos completados
        // Los hechos completados deben tener switch ON aunque localStorage diga lo contrario
        if (Object.keys(habilitadosFromDB).length > 0) {
          setHechosHabilitados(prev => {
            const updated = { ...prev }
            Object.entries(habilitadosFromDB).forEach(([key, value]) => {
              // Solo activar, no desactivar (el usuario puede haber desactivado manualmente)
              if (value) {
                updated[key] = true
              }
            })
            console.log('[HechosSection] Habilitados actualizados desde BD:', Object.keys(habilitadosFromDB))
            return updated
          })
        }
      }
    } catch (error) {
      console.warn('Error cargando hechos completados:', error.message)
    }
  }
  
  // Efecto para cargar hechos - CORREGIDO para evitar recargas al cambiar de pestaña
  useEffect(() => {
    // Si ya estamos montados y el CA es el mismo, no recargar
    if (componentMounted.current && lastLoadedCA.current === codigoAccion) {
      console.log('[HechosSection] Evitando recarga - CA ya cargado:', codigoAccion)
      return
    }
    
    // Marcar como montado después de la primera ejecución
    if (!componentMounted.current) {
      componentMounted.current = true
    }
    
    // Solo cargar si hay CA y es diferente al último cargado
    if (codigoAccion && codigoAccion !== lastLoadedCA.current) {
      console.log('[HechosSection] Cargando nuevo CA:', codigoAccion)
      loadHechosDisponibles()
    }
  }, [codigoAccion]) // Solo depende del CA, no de la función
  
  // Cleanup: No resetear isInitialLoad en unmount para mantener el estado entre tabs
  useEffect(() => {
    return () => {
      // Mantener lastLoadedCA al desmontar para que al volver no recargue
      // isInitialLoad se deja como está
    }
  }, [])
  
  // Cargar hechos completados cuando el borrador esté disponible Y los hechos agrupados ya estén cargados
  // IMPORTANTE: Este es el punto donde sincronizamos el estado de la BD con el estado local
  useEffect(() => {
    if (borrador?.id && session?.access_token && hechosAgrupados.length > 0) {
      console.log('[useEffect borrador] Borrador disponible Y hechos cargados. Sincronizando con BD...')
      loadHechosCompletados()
    }
  }, [borrador?.id, session?.access_token, hechosAgrupados.length])
  
  // NUEVO: Limpiar localStorage antiguo cuando los datos vienen de BD
  // Esto garantiza que el estado de BD prevalece sobre localStorage desactualizado
  useEffect(() => {
    if (Object.keys(hechosCompletados).length > 0 && hechosAgrupados.length > 0) {
      // Reconstruir habilitados basándose en:
      // 1. Hechos completados SIEMPRE habilitados
      // 2. Hechos no completados: respetar localStorage si existe, sino OFF
      const storageKey = getStorageKey('habilitados')
      let habilitadosFromStorage = {}
      
      try {
        const habilitadosStr = localStorage.getItem(storageKey)
        if (habilitadosStr) {
          const raw = JSON.parse(habilitadosStr)
          // Normalizar claves antiguas
          Object.entries(raw).forEach(([key, value]) => {
            habilitadosFromStorage[normalizeHechoName(key)] = value
          })
        }
      } catch (e) {
        console.warn('[HechosSection] Error leyendo habilitados de localStorage:', e)
      }
      
      const habilitadosMerged = {}
      hechosAgrupados.forEach(h => {
        const key = h.valor
        if (hechosCompletados[key]) {
          // Completados SIEMPRE habilitados
          habilitadosMerged[key] = true
        } else if (habilitadosFromStorage.hasOwnProperty(key)) {
          // No completados: respetar localStorage
          habilitadosMerged[key] = habilitadosFromStorage[key]
        } else {
          // Nuevos hechos sin estado guardado: OFF por defecto
          habilitadosMerged[key] = false
        }
      })
      
      console.log('[HechosSection] Habilitados sincronizados con BD:', {
        completados: Object.keys(hechosCompletados).length,
        habilitados: Object.values(habilitadosMerged).filter(Boolean).length
      })
      
      setHechosHabilitados(habilitadosMerged)
    }
  }, [hechosCompletados, hechosAgrupados, getStorageKey])

  // Guardar orden en localStorage cuando cambie
  useEffect(() => {
    const storageKey = getStorageKey('orden')
    if (!storageKey || ordenHechos.length === 0 || !hasLoadedFromStorage.current) return
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(ordenHechos))
      console.log('[HechosSection] Orden guardado en localStorage:', ordenHechos.length, 'hechos')
    } catch (error) {
      console.error('[HechosSection] Error guardando orden:', error)
    }
  }, [ordenHechos, getStorageKey])

  // Guardar habilitados en localStorage cuando cambien
  useEffect(() => {
    const storageKey = getStorageKey('habilitados')
    if (!storageKey || Object.keys(hechosHabilitados).length === 0 || !hasLoadedFromStorage.current) return
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(hechosHabilitados))
      console.log('[HechosSection] Habilitados guardados en localStorage')
    } catch (error) {
      console.error('[HechosSection] Error guardando habilitados:', error)
    }
  }, [hechosHabilitados, getStorageKey])
  
  // Notificar al padre cuando cambia el hecho activo (para AISA modal)
  useEffect(() => {
    if (onActiveHechoChange) {
      // Si estamos en vista de detalle con un hecho seleccionado, notificar
      if (viewMode === 'detail' && selectedHecho) {
        onActiveHechoChange(selectedHecho)
      } else {
        // No hay hecho activo
        onActiveHechoChange(null)
      }
    }
  }, [viewMode, selectedHecho, onActiveHechoChange])
  
  // Toggle habilitar/deshabilitar hecho
  const toggleHecho = (hechoKey) => {
    setHechosHabilitados(prev => ({
      ...prev,
      [hechoKey]: !prev[hechoKey]
    }))
  }
  
  // Drag & Drop handlers - IMPORTANTE: stopPropagation para evitar conflicto con Tauri
  const handleDragStart = (e, index) => {
    e.stopPropagation()
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString()) // Requerido para Firefox
  }
  
  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex === null || draggedIndex === index) return
    
    const newOrden = [...ordenHechos]
    const draggedItem = newOrden[draggedIndex]
    newOrden.splice(draggedIndex, 1)
    newOrden.splice(index, 0, draggedItem)
    
    setOrdenHechos(newOrden)
    setDraggedIndex(index)
  }
  
  const handleDrop = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    // El reordenamiento ya se hizo en handleDragOver, solo limpiamos el estado
    setDraggedIndex(null)
  }
  
  const handleDragEnd = async () => {
    setDraggedIndex(null)
    // Sincronizar orden con la BD para que se refleje en la exportación Word
    await syncOrdenWithDB()
  }
  
  // Sincronizar el orden de hechos con la BD
  const syncOrdenWithDB = async () => {
    if (!borrador?.id || !session?.access_token) return
    
    try {
      // 1. Obtener los hechos guardados en la BD para este borrador
      const response = await axios.get(`${API_BASE}/api/actas/${borrador.id}/hechos`, getAuthHeaders())
      if (!response.data.success || !response.data.hechos) return
      
      const hechosEnBD = response.data.hechos
      if (hechosEnBD.length === 0) return
      
      // 2. Crear un mapa de hecho_detec_original -> id
      const hechoIdMap = {}
      hechosEnBD.forEach(h => {
        if (h.hecho_detec_original) {
          hechoIdMap[h.hecho_detec_original] = h.id
        }
      })
      
      // 3. Filtrar solo los hechos que están en la BD y ordenarlos según ordenHechos
      const idsOrdenados = ordenHechos
        .filter(valor => hechoIdMap[valor] !== undefined)
        .map(valor => hechoIdMap[valor])
      
      if (idsOrdenados.length === 0) return
      
      // 4. Llamar al endpoint de reorder
      await axios.put(
        `${API_BASE}/api/actas/${borrador.id}/hechos/reorder`,
        { orden: idsOrdenados },
        getAuthHeaders()
      )
      
      console.log('[HechosSection] Orden sincronizado con BD:', idsOrdenados.length, 'hechos')
    } catch (error) {
      console.warn('[HechosSection] Error sincronizando orden con BD:', error.message)
      // No mostrar toast para no interrumpir la experiencia del usuario
    }
  }
  
  // Cargar fotos de todos los registros del hecho agrupado
  const loadFotosForHecho = async (hechoAgrupado) => {
    if (!hechoAgrupado?.globalids?.length || !session?.access_token) return
    
    setLoadingFotos(true)
    const token = session.access_token
    
    try {
      // Cargar fotos de todos los globalids del grupo
      const allPhotos = []
      
      for (const globalid of hechoAgrupado.globalids) {
        try {
          const response = await axios.get(
            `${API_BASE}/api/s123/photos-by-ca/${codigoAccion}?globalid=${globalid}`,
            getAuthHeaders()
          )
          
          // Encontrar el registro COMPLETO de tabla 0 para obtener TODA la metadata
          const registroOriginal = hechoAgrupado.registros.find(r => r.globalid === globalid)
          
          // El backend devuelve 'groups' como array de fotos individuales
          // Cada elemento tiene: { gid, filename, metadata }
          if (response.data.groups && Array.isArray(response.data.groups)) {
            response.data.groups.forEach((photoItem, photoArrayIndex) => {
              // photoItem es una foto individual con gid, filename, metadata
              const fname = photoItem.filename
              const gid = photoItem.gid
              
              if (!fname || !gid) return // Saltar si no tiene datos válidos
              
              // El backend ya envía layerId y descripcion específica para cada foto
              // layer_id = 1 (Descripcion) → DESCRIP_1
              // layer_id = 2 (Hechos) → DESCRIP_2
              const layerId = photoItem.layerId || 1
              
              // PRIORIDAD: Usar descripción que viene del backend (ya es específica según layer_id)
              const descripcionEspecifica = photoItem.descripcion || ''
              const hechoDetecEspecifico = photoItem.hecho_detec_especifico || ''
              
              console.log(`[loadFotosForHecho] Foto ${fname}: layerId=${layerId}, descripción="${descripcionEspecifica?.substring(0, 30)}...")`)
              
              // Construir objeto foto con TODA la metadata disponible
              allPhotos.push({
                // Identificadores
                filename: fname,
                gid: gid,
                globalid: globalid,
                layerId: layerId, // Layer de origen: 1=Descripcion, 2=Hechos
                url: `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${gid}/${encodeURIComponent(fname)}?token=${token}`,
                
                // Metadata de ubicación (priorizar registro original, luego metadata del backend)
                componente: registroOriginal?.componente || registroOriginal?.Componente || photoItem.metadata?.componente || '',
                tipo_componente: registroOriginal?.tipo_componente || registroOriginal?.Tipo_componente || photoItem.metadata?.tipo_componente || '',
                locacion: registroOriginal?.locacion || registroOriginal?.Locacion || '',
                instalacion_referencia: registroOriginal?.instalacion_referencia || '',
                subcomponente: registroOriginal?.subcomponente || '',
                
                // Coordenadas
                x: registroOriginal?.x || '',
                y: registroOriginal?.y || '',
                coordenadas: registroOriginal?.x && registroOriginal?.y 
                  ? `${registroOriginal.x}, ${registroOriginal.y}` 
                  : '',
                
                // Supervisor y fechas
                supervisor: registroOriginal?.nombre_supervisor || photoItem.metadata?.supervisor || '',
                nombre_supervisor: registroOriginal?.nombre_supervisor || '',
                fecha: registroOriginal?.fecha || registroOriginal?.creation_date || registroOriginal?.CreationDate || photoItem.metadata?.fecha || '',
                creation_date: registroOriginal?.creation_date || '',
                
                // Descripción ESPECÍFICA de esta foto (NO usar fallback genérico para evitar compartir descripciones)
                descripcion: descripcionEspecifica,
                descripcion_original: descripcionEspecifica, // Guardar original para revertir
                hecho_detec: hechoDetecEspecifico,
                
                // Otros campos útiles
                tipo_de_reporte: registroOriginal?.tipo_de_reporte || '',
                modalidad: registroOriginal?.modalidad || '',
                fuente: registroOriginal?.fuente || '',
                
                // Guardar referencia al registro completo por si se necesita más info
                _registroCompleto: registroOriginal
              })
            })
          }
        } catch (err) {
          console.warn(`Error cargando fotos para globalid ${globalid}:`, err.message)
        }
      }
      
      console.log(`[loadFotosForHecho] Cargadas ${allPhotos.length} fotos con metadata completa`)
      setFotosDisponibles(allPhotos)
      
      // Cargar anotaciones para las fotos individuales (después de tener las fotos)
      loadPhotoAnnotations(allPhotos)
      
      // Cargar descripciones editadas por photoId (después de tener las fotos)
      loadDescripcionesEditadas(allPhotos)
      
      // NOTA: Las ediciones de metadata (componente, instalacion_referencia) ya vienen
      // en registroOriginal desde arcgis_records que es la fuente de verdad para fotos
    } catch (error) {
      console.error('Error cargando fotos:', error)
      setFotosDisponibles([])
    } finally {
      setLoadingFotos(false)
    }
  }
  
  // Seleccionar/deseleccionar foto
  const toggleFoto = (foto) => {
    setFotosSeleccionadas(prev => {
      const exists = prev.find(f => f.filename === foto.filename && f.gid === foto.gid)
      if (exists) {
        return prev.filter(f => !(f.filename === foto.filename && f.gid === foto.gid))
      }
      return [...prev, foto]
    })
  }
  
  // Cargar descripciones editadas para las fotos del hecho
  // Ahora usa photoId único (globalid_filename) en lugar de globalid
  const loadDescripcionesEditadas = async (fotos) => {
    if (!session?.access_token || !fotos?.length) return
    
    try {
      // Construir lista de photoIds
      const photoIds = fotos.map(foto => getPhotoUniqueId(foto)).filter(Boolean)
      
      if (photoIds.length === 0) return
      
      console.log(`[loadDescripcionesEditadas] Cargando descripciones para ${photoIds.length} fotos`)
      
      const response = await axios.get(
        `${API_BASE}/api/s123/direct/descripciones-por-fotos?photoIds=${encodeURIComponent(photoIds.join(','))}`,
        getAuthHeaders()
      )
      
      if (response.data.success && response.data.descripciones) {
        console.log(`[loadDescripcionesEditadas] ${response.data.count} descripciones editadas encontradas`)
        setDescripcionesEditadas(response.data.descripciones)
      }
    } catch (err) {
      console.warn(`Error cargando descripciones editadas:`, err.message)
    }
  }
  
  // Guardar descripción editada
  // photoId es el ID único de la foto (globalid_filename)
  const guardarDescripcion = async (photoId, texto) => {
    if (!session?.access_token) return
    
    setSavingDescripcion(photoId)
    try {
      // Guardar en backend usando photoId completo
      await axios.put(
        `${API_BASE}/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: texto },
        getAuthHeaders()
      )
      
      // Actualizar estado local
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: texto
      }))
      
      toast.success('Descripción guardada')
    } catch (error) {
      console.error('Error guardando descripción:', error)
      toast.error('Error al guardar')
    } finally {
      setSavingDescripcion(null)
    }
  }
  
  // Manejar cambio de descripción en el input
  // photoId es el ID único de la foto (globalid_filename)
  const handleDescripcionChange = (photoId, texto) => {
    setDescripcionesEditadas(prev => ({
      ...prev,
      [photoId]: texto
    }))
  }
  
  // Revertir a descripción original
  // photoId es el ID único de la foto (globalid_filename)
  const revertirDescripcion = async (photoId, descripcionOriginal) => {
    setSavingDescripcion(photoId)
    try {
      await axios.put(
        `${API_BASE}/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: null }, // null = borrar edición
        getAuthHeaders()
      )
      
      // Restaurar la original en el estado local
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: descripcionOriginal || ''
      }))
      
      toast.success('Descripción revertida a original')
    } catch (error) {
      console.error('Error revirtiendo descripción:', error)
      toast.error('Error al revertir')
    } finally {
      setSavingDescripcion(null)
    }
  }
  
  // ==================== METADATA EDITABLES (componente, instalacion_referencia) ====================
  
  // Manejar cambio de metadata en el modal
  const handleMetadataChange = (globalid, metadata) => {
    setMetadataEditadas(prev => ({
      ...prev,
      [globalid]: { ...(prev[globalid] || {}), ...metadata }
    }))
  }
  
  // Guardar metadata editada en backend (arcgis_records es la fuente de verdad para fotos)
  const guardarMetadata = async (globalid, metadata) => {
    console.log(`[HechosSection] 🔄 guardarMetadata llamado:`, { globalid, metadata })
    
    if (!session?.access_token) {
      toast.error('Sesión no válida')
      return
    }
    
    if (!globalid) {
      console.error('[HechosSection] ❌ globalid es undefined o null')
      toast.error('Error: ID de registro no válido')
      return
    }
    
    setSavingMetadata(globalid)
    try {
      // Guardar en arcgis_records (fuente de verdad para fotos)
      console.log(`[HechosSection] 📤 Enviando PUT a /api/s123/direct/metadata/${globalid}`)
      const response = await axios.put(
        `${API_BASE}/api/s123/direct/metadata/${globalid}`,
        metadata,
        getAuthHeaders()
      )
      console.log(`[HechosSection] ✅ Respuesta del servidor:`, response.data)
      
      // Actualizar estado local
      setMetadataEditadas(prev => ({
        ...prev,
        [globalid]: metadata
      }))
      
      // Actualizar también la foto en fotosDisponibles para reflejar el cambio
      setFotosDisponibles(prev => prev.map(foto => {
        if (foto.globalid === globalid) {
          return {
            ...foto,
            componente: metadata.componente ?? foto.componente,
            instalacion_referencia: metadata.instalacion_referencia ?? foto.instalacion_referencia
          }
        }
        return foto
      }))
      
      // Actualizar también fotosSeleccionadas para mantener consistencia
      setFotosSeleccionadas(prev => prev.map(foto => {
        if (foto.globalid === globalid) {
          return {
            ...foto,
            componente: metadata.componente ?? foto.componente,
            instalacion_referencia: metadata.instalacion_referencia ?? foto.instalacion_referencia
          }
        }
        return foto
      }))
      
      toast.success('Datos guardados')
    } catch (error) {
      console.error('Error guardando metadata:', error)
      toast.error('Error al guardar corrección')
    } finally {
      setSavingMetadata(null)
    }
  }
  
  // Manejar cambios en anotaciones de fotos
  // photoId es el ID único de la foto (globalid_filename)
  const handleAnnotationsChange = async (photoId, newAnnotations) => {
    // Actualizar estado local inmediatamente
    setPhotoAnnotations(prev => ({
      ...prev,
      [photoId]: newAnnotations
    }))
    
    // Guardar en el backend usando el photoId completo (globalid_filename)
    // El backend debe manejar anotaciones por foto individual
    try {
      await axios.put(
        `${API_BASE}/api/s123/direct/anotaciones/${encodeURIComponent(photoId)}`,
        { anotaciones: JSON.stringify(newAnnotations) },
        getAuthHeaders()
      )
      toast.success(`${newAnnotations.length} anotación(es) guardada(s)`)
    } catch (error) {
      console.error('Error guardando anotaciones:', error)
      // No mostrar error al usuario ya que las anotaciones se guardaron localmente
    }
  }
  
  // Cargar anotaciones para las fotos del hecho
  // Ahora carga por photoId único (globalid_filename) en lugar de solo globalid
  const loadPhotoAnnotations = async (fotos) => {
    if (!session?.access_token || !fotos?.length) return
    
    const annotationsMap = {}
    
    for (const foto of fotos) {
      const photoId = getPhotoUniqueId(foto)
      if (!photoId) continue
      
      try {
        const response = await axios.get(
          `${API_BASE}/api/s123/direct/anotaciones/${encodeURIComponent(photoId)}`,
          getAuthHeaders()
        )
        if (response.data.success && response.data.anotaciones) {
          annotationsMap[photoId] = JSON.parse(response.data.anotaciones)
        }
      } catch (err) {
        // No hay anotaciones para esta foto, es normal
      }
    }
    
    setPhotoAnnotations(annotationsMap)
  }

  const renderThumbnailAnnotations = useCallback((foto) => {
    if (!foto) return null
    const photoId = getPhotoUniqueId(foto)
    if (!photoId) return null
    const annotationsForPhoto = photoAnnotations[photoId]
    if (!annotationsForPhoto || annotationsForPhoto.length === 0) return null

    const containerWidth = THUMB_WIDTH
    const containerHeight = THUMB_HEIGHT
    const dims = photoDimensions[photoId]
    const imgWidth = dims?.width || annotationsForPhoto[0]?.imageWidth || containerWidth
    const imgHeight = dims?.height || annotationsForPhoto[0]?.imageHeight || containerHeight
    const imageRatio = imgWidth / imgHeight
    const containerRatio = containerWidth / containerHeight
    let renderWidth = containerWidth
    let renderHeight = containerHeight
    let offsetX = 0
    let offsetY = 0

    if (imageRatio > containerRatio) {
      renderWidth = containerWidth
      renderHeight = containerWidth / imageRatio
      offsetY = (containerHeight - renderHeight) / 2
    } else if (imageRatio < containerRatio) {
      renderHeight = containerHeight
      renderWidth = containerHeight * imageRatio
      offsetX = (containerWidth - renderWidth) / 2
    }

    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        width={containerWidth}
        height={containerHeight}
      >
        {annotationsForPhoto.map((ann, annIdx) => {
          const baseWidth = ann.imageWidth || imgWidth || 1
          const baseHeight = ann.imageHeight || imgHeight || 1
          const scaleX = renderWidth / baseWidth
          const scaleY = renderHeight / baseHeight
          const strokeW = Math.max(1, (ann.strokeWidth || 3) * Math.min(scaleX, scaleY))
          const color = ann.strokeColor || '#ff0000'
          const type = ann.type || 'ellipse'
          
          // Ellipse (default, compatibilidad con anotaciones antiguas)
          if (type === 'ellipse' || !ann.type) {
            const cx = offsetX + (ann.cx || 0) * scaleX
            const cy = offsetY + (ann.cy || 0) * scaleY
            const rx = Math.abs((ann.rx || 0) * scaleX)
            const ry = Math.abs((ann.ry || 0) * scaleY)
            return (
              <ellipse
                key={`${foto.globalid}-ann-${ann.id || annIdx}`}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
              />
            )
          }
          
          // Rectángulo (sin fondo)
          if (type === 'rectangle') {
            const x = offsetX + (ann.x || 0) * scaleX
            const y = offsetY + (ann.y || 0) * scaleY
            const width = (ann.width || 0) * scaleX
            const height = (ann.height || 0) * scaleY
            return (
              <rect
                key={`${foto.globalid}-ann-${ann.id || annIdx}`}
                x={x}
                y={y}
                width={width}
                height={height}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
              />
            )
          }
          
          // Fondo (rectángulo con relleno semitransparente)
          if (type === 'background') {
            const x = offsetX + (ann.x || 0) * scaleX
            const y = offsetY + (ann.y || 0) * scaleY
            const width = (ann.width || 0) * scaleX
            const height = (ann.height || 0) * scaleY
            const opacity = ann.opacity || 0.5 // Usar opacidad configurada (50%-100%)
            return (
              <rect
                key={`${foto.globalid}-ann-${ann.id || annIdx}`}
                x={x}
                y={y}
                width={width}
                height={height}
                fill={color}
                fillOpacity={opacity}
                stroke={color}
                strokeWidth={strokeW}
              />
            )
          }
          
          // Flecha
          if (type === 'arrow') {
            const startX = offsetX + (ann.startX || 0) * scaleX
            const startY = offsetY + (ann.startY || 0) * scaleY
            const endX = offsetX + (ann.endX || 0) * scaleX
            const endY = offsetY + (ann.endY || 0) * scaleY
            const angle = Math.atan2(endY - startY, endX - startX)
            const headLength = Math.max(6, strokeW * 3)
            
            const tip1X = endX - headLength * Math.cos(angle - Math.PI / 6)
            const tip1Y = endY - headLength * Math.sin(angle - Math.PI / 6)
            const tip2X = endX - headLength * Math.cos(angle + Math.PI / 6)
            const tip2Y = endY - headLength * Math.sin(angle + Math.PI / 6)
            
            return (
              <g key={`${foto.globalid}-ann-${ann.id || annIdx}`}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX - Math.cos(angle) * headLength * 0.5}
                  y2={endY - Math.sin(angle) * headLength * 0.5}
                  stroke={color}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                />
                <polygon
                  points={`${endX},${endY} ${tip1X},${tip1Y} ${tip2X},${tip2Y}`}
                  fill={color}
                />
              </g>
            )
          }
          
          // Texto (con soporte para saltos de línea)
          if (type === 'text') {
            const x = offsetX + (ann.x || 0) * scaleX
            const y = offsetY + (ann.y || 0) * scaleY
            const fontSize = Math.max(8, (ann.fontSize || 24) * Math.min(scaleX, scaleY))
            const lineHeight = fontSize * 1.2
            const lines = (ann.text || '').split('\n')
            
            return (
              <text
                key={`${foto.globalid}-ann-${ann.id || annIdx}`}
                x={x}
                y={y}
                fill={color}
                fontSize={fontSize}
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
              >
                {lines.map((line, lineIdx) => (
                  <tspan key={lineIdx} x={x} dy={lineIdx === 0 ? 0 : lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            )
          }
          
          return null
        })}
      </svg>
    )
  }, [photoAnnotations, photoDimensions])
  
  // Entrar al detalle de un hecho agrupado
  const enterHechoDetail = async (hechoAgrupado) => {
    setSelectedHecho(hechoAgrupado)
    setDetailStep(1) // Empezar por datos generales
    setFotosSeleccionadas([])
    setDescripcionesEditadas({}) // Limpiar descripciones anteriores
    setPhotoAnnotations({}) // Limpiar anotaciones anteriores
    setPhotoDimensions({})
    setHechoGuardadoId(null) // Reset del ID guardado
    setViewMode('detail')
    loadFotosForHecho(hechoAgrupado)
    
    // Las descripciones y anotaciones se cargan en loadFotosForHecho después de obtener las fotos
    // usando photoId único (globalid_filename) para cada foto individual
    
    // Buscar si ya existe un hecho guardado - ESPERAR a que termine
    const hechoGuardado = await loadHechoGuardado(hechoAgrupado)
    
    // Si NO hay hecho guardado, usar valores por defecto
    // IMPORTANTE: Priorizar título personalizado de hechosTitulos si existe (con búsqueda normalizada)
    if (!hechoGuardado) {
      setTituloHecho(getTituloPersonalizado(hechoAgrupado.valor) || hechoAgrupado.valor || '')
      setPresuntoIncumplimiento('')
      setSubsanado('')
      setObligacion('')
      setDescripcionHecho(hechoAgrupado.descripcion || '')
      setNivelRiesgo('')
      setJustificacionRiesgo('')
      setImpactoPotencial('')
      setMedidasMitigacion('')
      setRequerimientoSubsanacion('')
      // Reset estados del Anexo 4
      setEntornoAfectacion('')
      setFactorCantidad(0)
      setFactorPeligrosidad(0)
      setFactorExtension(0)
      setFactorPersonasExpuestas(0)
      setFactorMedioAfectado(0)
      setProbabilidadOcurrencia(0)
      setTextoAnalisisRiesgo('')
    }
  }
  
  // Cargar hecho guardado de la BD (si existe) - Retorna true si encontró uno
  const loadHechoGuardado = async (hechoAgrupado) => {
    if (!borrador?.id || !session?.access_token) return false
    
    try {
      const response = await axios.get(`${API_BASE}/api/actas/${borrador.id}/hechos`, getAuthHeaders())
      if (response.data.success && response.data.hechos) {
        console.log('[HechosSection] Buscando hecho guardado. hechoAgrupado.valor:', hechoAgrupado.valor)
        console.log('[HechosSection] hechoAgrupado.globalids:', hechoAgrupado.globalids)
        console.log('[HechosSection] Hechos en BD:', response.data.hechos.map(h => ({ 
          id: h.id, 
          hecho_detec_original: h.hecho_detec_original, 
          titulo_hecho: h.titulo_hecho,
          globalid_origen: h.globalid_origen 
        })))
        
        // Buscar un hecho con el mismo hecho_detec_original o globalid_origen
        const hechoExistente = response.data.hechos.find(h => 
          h.hecho_detec_original === hechoAgrupado.valor ||
          hechoAgrupado.globalids?.includes(h.globalid_origen)
        )
        if (hechoExistente) {
          console.log('[HechosSection] ✅ Hecho guardado ENCONTRADO:', hechoExistente.id, 'titulo_hecho:', hechoExistente.titulo_hecho)
          setHechoGuardadoId(hechoExistente.id)
          // Restaurar TODOS los campos guardados
          // NOTA: La BD usa 'obligacion' y 'descripcion', no 'obligacion_fiscalizable' ni 'descripcion_hecho'
          // IMPORTANTE: Priorizar titulo de BD > titulo del map (con búsqueda normalizada) > valor original
          setTituloHecho(hechoExistente.titulo_hecho || getTituloPersonalizado(hechoAgrupado.valor) || hechoAgrupado.valor || '')
          setPresuntoIncumplimiento(hechoExistente.presunto_incumplimiento || '')
          setSubsanado(hechoExistente.subsanado || '')
          setObligacion(hechoExistente.obligacion || '')
          setDescripcionHecho(hechoExistente.descripcion || hechoAgrupado.descripcion || '')
          setNivelRiesgo(hechoExistente.nivel_riesgo || '')
          setJustificacionRiesgo(hechoExistente.justificacion_riesgo || '')
          setImpactoPotencial(hechoExistente.impacto_potencial || '')
          setMedidasMitigacion(hechoExistente.medidas_mitigacion || '')
          // Restaurar estados del Anexo 4 OEFA
          setEntornoAfectacion(hechoExistente.entorno_afectacion || '')
          setFactorCantidad(hechoExistente.factor_cantidad || 0)
          setFactorPeligrosidad(hechoExistente.factor_peligrosidad || 0)
          setFactorExtension(hechoExistente.factor_extension || 0)
          setFactorPersonasExpuestas(hechoExistente.factor_personas_expuestas || 0)
          setFactorMedioAfectado(hechoExistente.factor_medio_afectado || 0)
          setProbabilidadOcurrencia(hechoExistente.probabilidad_ocurrencia || 0)
          // NO restauramos textoAnalisisRiesgo - el useEffect lo regenerará automáticamente
          // basándose en los factores, asegurando que siempre esté actualizado
          // Restaurar requerimiento de subsanación
          setRequerimientoSubsanacion(hechoExistente.requerimiento_subsanacion || '')
          // Restaurar fotos seleccionadas si existen
          if (hechoExistente.fotos_seleccionadas) {
            try {
              const fotosGuardadas = JSON.parse(hechoExistente.fotos_seleccionadas)
              // Si las fotos guardadas tienen globalid, usarlas directamente
              // Si no, intentar enriquecer con datos de fotosDisponibles cuando estén cargadas
              if (fotosGuardadas.length > 0 && fotosGuardadas[0].globalid) {
                setFotosSeleccionadas(fotosGuardadas)
              } else {
                // Guardar temporalmente para enriquecer después cuando carguen las fotos
                setFotosSeleccionadas(fotosGuardadas)
                console.log('[HechosSection] Fotos guardadas sin globalid, se enriquecerán cuando carguen')
              }
            } catch (e) {
              console.warn('Error parseando fotos guardadas:', e)
            }
          }
          return true // Encontró hecho guardado
        } else {
          console.log('[HechosSection] ❌ Hecho guardado NO encontrado para:', hechoAgrupado.valor)
        }
      }
      return false // No encontró hecho guardado
    } catch (error) {
      console.warn('Error cargando hecho guardado:', error.message)
      return false
    }
  }
  
  // Guardar borrador del hecho (todos los campos actuales)
  const guardarBorrador = async () => {
    if (!borrador?.id || !session?.access_token || !selectedHecho) return
    
    setSavingBorrador(true)
    try {
      // 1. Guardar todas las descripciones editadas de fotos
      const descripcionesPromises = Object.entries(descripcionesEditadas).map(async ([globalid, texto]) => {
        // Solo guardar si hay texto (evitar guardar vacíos)
        if (texto !== undefined && texto !== null) {
          try {
            await axios.put(
              `${API_BASE}/api/s123/direct/descripcion/${globalid}`,
              { campo: 'descrip_1', valor: texto },
              getAuthHeaders()
            )
            console.log(`[guardarBorrador] ✅ Descripción guardada para ${globalid}`)
          } catch (err) {
            console.warn(`[guardarBorrador] ⚠️ Error guardando descripción ${globalid}:`, err.message)
          }
        }
      })
      
      // Esperar a que todas las descripciones se guarden
      const descripcionesGuardadas = await Promise.all(descripcionesPromises)
      const cantidadDescripciones = Object.keys(descripcionesEditadas).length
      if (cantidadDescripciones > 0) {
        console.log(`[guardarBorrador] ${cantidadDescripciones} descripciones de fotos guardadas`)
      }
      
      // 2. Guardar los datos del hecho
      console.log('[guardarBorrador] Guardando hecho con:')
      console.log('  - titulo_hecho:', tituloHecho)
      console.log('  - hecho_detec_original:', selectedHecho.valor)
      const datosHecho = {
        titulo_hecho: tituloHecho,
        hecho_detec_original: selectedHecho.valor,
        descripcion_original: selectedHecho.descripcion || '',
        globalid_origen: selectedHecho.globalids?.[0] || null,
        // Campos del formulario
        presunto_incumplimiento: presuntoIncumplimiento || null,
        subsanado: subsanado || null,
        obligacion_fiscalizable: obligacion || null,
        descripcion_hecho: descripcionHecho || null,
        nivel_riesgo: nivelRiesgo || null,
        justificacion_riesgo: justificacionRiesgo || null,
        impacto_potencial: impactoPotencial || null,
        medidas_mitigacion: medidasMitigacion || null,
        // Campos del Anexo 4 OEFA
        entorno_afectacion: entornoAfectacion || null,
        factor_cantidad: factorCantidad || null,
        factor_peligrosidad: factorPeligrosidad || null,
        factor_extension: factorExtension || null,
        factor_personas_expuestas: factorPersonasExpuestas || null,
        factor_medio_afectado: factorMedioAfectado || null,
        probabilidad_ocurrencia: probabilidadOcurrencia || null,
        score_consecuencia: scoreConsecuencia || null,
        valor_consecuencia: valorConsecuencia || null,
        valor_riesgo: valorRiesgo || null,
        tipo_incumplimiento: tipoIncumplimiento || null,
        texto_analisis_riesgo: textoAnalisisRiesgo || null,
        // Requerimiento de subsanación
        requerimiento_subsanacion: requerimientoSubsanacion || null,
        // Fotos seleccionadas (guardar como JSON con toda la metadata necesaria)
        // IMPORTANTE: Usar valores EDITADOS de metadataEditadas y descripcionesEditadas
        fotos_seleccionadas: fotosSeleccionadas.length > 0 
          ? JSON.stringify(fotosSeleccionadas.map(f => {
              const photoId = getPhotoUniqueId(f)
              const metadataEdits = metadataEditadas[f.globalid] || {}
              const descripcionEditada = photoId ? descripcionesEditadas[photoId] : undefined
              
              return { 
                gid: f.gid, 
                filename: f.filename,
                globalid: f.globalid,
                // Usar valores editados con fallback a originales
                componente: metadataEdits.componente ?? f.componente,
                tipo_componente: f.tipo_componente,
                instalacion_referencia: metadataEdits.instalacion_referencia ?? f.instalacion_referencia ?? f.instalacionReferencia,
                descripcion: descripcionEditada ?? f.descripcion
              }
            }))
          : null
      }
      
      let savedHechoId = hechoGuardadoId
      
      if (hechoGuardadoId) {
        // Actualizar hecho existente
        await axios.put(
          `${API_BASE}/api/actas/${borrador.id}/hechos/${hechoGuardadoId}`,
          datosHecho,
          getAuthHeaders()
        )
        toast.success('Borrador guardado')
      } else {
        // Crear nuevo hecho
        const response = await axios.post(
          `${API_BASE}/api/actas/${borrador.id}/hechos`,
          datosHecho,
          getAuthHeaders()
        )
        if (response.data.success && response.data.hecho) {
          savedHechoId = response.data.hecho.id
          setHechoGuardadoId(savedHechoId)
          toast.success('Borrador guardado')
        }
      }
      
      // Actualizar el título en la lista si es diferente al original
      if (selectedHecho?.valor && tituloHecho && tituloHecho.trim() !== selectedHecho.valor) {
        setHechosTitulos(prev => ({
          ...prev,
          [selectedHecho.valor]: tituloHecho
        }))
      } else if (selectedHecho?.valor) {
        // Si el título es igual al original, removerlo del map
        setHechosTitulos(prev => {
          const newTitulos = { ...prev }
          delete newTitulos[selectedHecho.valor]
          return newTitulos
        })
      }
      
      return savedHechoId
    } catch (error) {
      console.error('Error guardando borrador:', error)
      toast.error('Error al guardar borrador')
      return null
    } finally {
      setSavingBorrador(false)
    }
  }
  
  // Guardar/Actualizar título del hecho en la BD (legacy - mantener por compatibilidad)
  const guardarTituloHecho = async () => {
    if (!borrador?.id || !session?.access_token || !selectedHecho) return
    
    setSavingTitulo(true)
    try {
      if (hechoGuardadoId) {
        // Actualizar hecho existente
        await axios.put(
          `${API_BASE}/api/actas/${borrador.id}/hechos/${hechoGuardadoId}`,
          { titulo_hecho: tituloHecho },
          getAuthHeaders()
        )
        toast.success('Título actualizado')
      } else {
        // Crear nuevo hecho
        const response = await axios.post(
          `${API_BASE}/api/actas/${borrador.id}/hechos`,
          {
            titulo_hecho: tituloHecho,
            hecho_detec_original: selectedHecho.valor,
            descripcion_original: selectedHecho.descripcion || '',
            globalid_origen: selectedHecho.globalids?.[0] || null
          },
          getAuthHeaders()
        )
        if (response.data.success && response.data.hecho) {
          setHechoGuardadoId(response.data.hecho.id)
          toast.success('Título guardado')
        }
      }
      
      // Actualizar el título en la lista si es diferente al original
      if (tituloHecho && tituloHecho.trim() !== selectedHecho.valor) {
        setHechosTitulos(prev => ({
          ...prev,
          [selectedHecho.valor]: tituloHecho
        }))
      } else {
        // Si el título es igual al original, removerlo del map
        setHechosTitulos(prev => {
          const newTitulos = { ...prev }
          delete newTitulos[selectedHecho.valor]
          return newTitulos
        })
      }
    } catch (error) {
      console.error('Error guardando título:', error)
      toast.error('Error al guardar título')
    } finally {
      setSavingTitulo(false)
    }
  }
  
  /**
   * Generar descripción del hecho usando AI
   * Toma las descripciones editadas de las fotos seleccionadas como input
   */
  const generarDescripcionAI = async () => {
    // Validar que hay fotos seleccionadas
    if (!fotosSeleccionadas || fotosSeleccionadas.length === 0) {
      toast.error('Selecciona al menos una foto como medio probatorio')
      return
    }
    
    // Obtener las descripciones de las fotos seleccionadas con TODA la metadata
    const descripcionesFotos = fotosSeleccionadas.map(foto => {
      // Buscar la descripción editada por photoId único (globalid_filename)
      const photoId = getPhotoUniqueId(foto)
      const descripcionEditada = descripcionesEditadas[photoId]
      // Fallbacks para descripción original (múltiples campos posibles de tabla 0)
      const descripcionOriginal = foto.descripcion || foto.descrip_1 || foto.descrip_2 || foto.description || ''
      
      // Usar nullish coalescing para consistencia con la UI
      const descripcionFinal = (descripcionEditada !== undefined && descripcionEditada !== null) 
        ? descripcionEditada 
        : descripcionOriginal
      
      // Buscar metadata editada (componente, instalacion_referencia)
      // Metadata sigue usando globalid porque se aplica a todo el registro
      const metadataEdits = metadataEditadas[foto.globalid] || {}
      
      console.log(`[Foto ${foto.filename}] photoId=${photoId}, editada="${descripcionEditada?.substring(0, 50)}...", original="${descripcionOriginal?.substring(0, 50)}..."`)
      console.log(`[Foto ${foto.filename}] 📍 instalacion_referencia: foto="${foto.instalacion_referencia}", metadataEdits="${metadataEdits.instalacion_referencia}", globalid="${foto.globalid}"`)
      
      return {
        // Identificadores
        globalid: foto.globalid,
        filename: foto.filename,
        photoId: photoId,
        
        // Descripción (prioridad: editada > descrip_1 > descrip_2 > descripcion)
        descripcion: descripcionFinal,
        
        // Ubicación completa - PRIORIZA EDICIONES LOCALES sobre valores originales
        componente: metadataEdits.componente ?? foto.componente ?? '',
        locacion: foto.locacion || '',
        tipo_componente: foto.tipo_componente || '',
        instalacion_referencia: metadataEdits.instalacion_referencia ?? foto.instalacion_referencia ?? '',
        subcomponente: foto.subcomponente || '',
        
        // Coordenadas UTM
        coordenadas: foto.coordenadas || (foto.x && foto.y ? `${foto.x}, ${foto.y}` : ''),
        x: foto.x || '',
        y: foto.y || '',
        
        // Fechas y personal
        fecha: foto.fecha || '',
        supervisor: foto.supervisor || '',
        
        // Información del hecho
        hecho_detec: foto.hecho_detec || '',
        tipo_de_reporte: foto.tipo_de_reporte || '',
        modalidad: foto.modalidad || '',
        fuente: foto.fuente || ''
      }
    })
    
    // Filtrar fotos sin descripción
    const fotosConDescripcion = descripcionesFotos.filter(f => f.descripcion && f.descripcion.trim() !== '')
    
    console.log(`[generarDescripcionAI] ${fotosSeleccionadas.length} fotos seleccionadas, ${fotosConDescripcion.length} con descripción`)
    console.log('[generarDescripcionAI] descripcionesEditadas:', descripcionesEditadas)
    
    if (fotosConDescripcion.length === 0) {
      toast.error('Las fotos seleccionadas no tienen descripciones. Añade descripciones primero.')
      return
    }
    
    setGeneratingDescription(true)
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/actas/ai-generate-description`,
        {
          fotos: fotosConDescripcion,
          context: {
            // Título corto (hecho detectado)
            hechoDetec: selectedHecho?.valor || '',
            // Título largo trabajado por el usuario
            tituloHecho: tituloHecho || '',
            // Descripción original del hecho (del CA)
            descripcionOriginal: selectedHecho?.descripcion || '',
            // Obligación ya redactada
            obligacion: obligacion || '',
            // Componentes involucrados
            componentes: selectedHecho?.componentes || [],
            // Datos de la supervisión
            modalidad: modalidad || '',
            codigoAccion: codigoAccion || '',
            // Datos adicionales del hecho
            presuntoIncumplimiento: presuntoIncumplimiento || '',
            subsanado: subsanado || ''
          }
        },
        getAuthHeaders()
      )
      
      if (response.data.success && response.data.description) {
        setDescripcionHecho(response.data.description)
        toast.success('Descripción generada correctamente')
      } else {
        toast.error(response.data.error || 'Error al generar descripción')
      }
    } catch (error) {
      console.error('Error generando descripción:', error)
      toast.error(error.response?.data?.error || 'Error al generar descripción')
    } finally {
      setGeneratingDescription(false)
    }
  }
  
  // Obtener hechos agrupados ordenados
  const getHechosOrdenados = () => {
    return ordenHechos
      .map(valor => hechosAgrupados.find(h => h.valor === valor))
      .filter(Boolean)
  }
  
  // Contar hechos habilitados
  const hechosHabilitadosCount = Object.values(hechosHabilitados).filter(Boolean).length
  
  // ==================== OPTIMIZACIÓN PARA 1000+ FOTOS ====================
  
  // Fotos paginadas - solo renderiza las de la página actual
  const paginatedPhotos = useMemo(() => {
    const start = photosPage * PHOTOS_PER_PAGE
    const end = start + PHOTOS_PER_PAGE
    return fotosDisponibles.slice(start, end)
  }, [fotosDisponibles, photosPage, PHOTOS_PER_PAGE])
  
  // Total de páginas
  const totalPhotoPages = useMemo(() => {
    return Math.ceil(fotosDisponibles.length / PHOTOS_PER_PAGE)
  }, [fotosDisponibles.length, PHOTOS_PER_PAGE])
  
  // Reset página al cargar nuevas fotos
  useEffect(() => {
    setPhotosPage(0)
  }, [fotosDisponibles.length])
  
  // Abrir modal de foto
  const openPhotoModal = useCallback((foto, indexInPage) => {
    const globalIndex = (photosPage * PHOTOS_PER_PAGE) + indexInPage
    setSelectedPhotoIndex(globalIndex)
    setPhotoModalOpen(true)
  }, [photosPage, PHOTOS_PER_PAGE])
  
  // Navegar en modal
  const navigatePhotoModal = useCallback((newIndex) => {
    if (newIndex >= 0 && newIndex < fotosDisponibles.length) {
      setSelectedPhotoIndex(newIndex)
      // Si la foto está en otra página, actualizar la página
      const newPage = Math.floor(newIndex / PHOTOS_PER_PAGE)
      if (newPage !== photosPage) {
        setPhotosPage(newPage)
      }
    }
  }, [fotosDisponibles.length, photosPage, PHOTOS_PER_PAGE])
  
  // Ir a página específica
  const goToPhotoPage = useCallback((page) => {
    if (page >= 0 && page < totalPhotoPages) {
      setPhotosPage(page)
    }
  }, [totalPhotoPages])

  // Vista de lista de hechos (tabla única)
  const renderListView = () => (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
          Hechos Verificados
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
          Activa los hechos que deseas incluir en el acta. Puedes reordenarlos arrastrando.
        </p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#64748b]">
            {hechosHabilitadosCount} de {hechosAgrupados.length} hechos activos
          </span>
        </div>

                    {/* Tip */}
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50 rounded-lg border border-blue-200 dark:border-blue-800 pink:border-pink-200">
        <p className="text-sm text-blue-800 dark:text-blue-300 pink:text-[#ff0075]">
          <strong>💡 Consejos:</strong> 
        </p>
        <ul className="list-disc pl-5 text-sm text-blue-800 dark:text-blue-300 pink:text-[#ff0075]">
          <li>Solo se exportarán los hechos completados.</li>
          <li>Si deseas que un hecho (completado o no) no se exporte, desactívalo con el switch.</li>
          <li>Arrastra los hechos activos para ordenarlos según aparecerán en el acta.</li>
        </ul>
      </div>

      </div>


      
      {/* Tabla de hechos */}
      <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : hechosAgrupados.length === 0 ? (
          <div className="text-center py-16 text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No se encontraron hechos</p>
            <p className="text-sm mt-1">Verifica que el CA tenga datos sincronizados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {getHechosOrdenados().map((hechoAgrupado, index) => {
              const hechoKey = hechoAgrupado.valor
              const isEnabled = hechosHabilitados[hechoKey]
              const isDragging = draggedIndex === index
              const isCompleted = isHechoCompletado(hechoKey)
              
              return (
                <div
                  key={hechoKey}
                  draggable={isEnabled}
                  onDragStart={(e) => isEnabled && handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`
                    flex items-center gap-4 p-4 transition-all
                    ${isDragging ? 'opacity-50 bg-primary-50 dark:bg-primary-900/20' : ''}
                    ${isCompleted 
                      ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500' 
                      : isEnabled 
                        ? 'bg-white dark:bg-slate-800' 
                        : 'bg-slate-50 dark:bg-slate-900/50'
                    }
                    ${isEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    ${!isCompleted && 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                  `}
                >
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleHecho(hechoKey)}
                    className="flex-shrink-0 focus:outline-none"
                    title={isEnabled ? 'Desactivar hecho' : 'Activar hecho'}
                  >
                    {isEnabled ? (
                      <ToggleRight className="w-10 h-6 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-10 h-6 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>
                  
                  {/* Grip handle (solo si está habilitado) */}
                  <div className={`flex-shrink-0 ${isEnabled ? 'opacity-100' : 'opacity-0'}`}>
                    <GripVertical className="w-5 h-5 text-slate-400" />
                  </div>
                  
                  {/* Número de orden */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
                    ${isEnabled 
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' 
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                    }
                  `}>
                    {isEnabled ? getHechosOrdenados().filter((h, i) => i <= index && hechosHabilitados[h.valor]).length : '-'}
                  </div>
                  
                  {/* Contenido del hecho */}
                  <div className={`flex-1 min-w-0 ${!isEnabled ? 'opacity-50' : ''}`}>
                    {/* Título del hecho - Mostrar título personalizado si existe (con búsqueda normalizada) */}
                    <div className="font-medium text-slate-900 dark:text-white pink:text-[#0f172a]">
                      {getTituloPersonalizado(hechoKey) || formatTitulo(hechoAgrupado.valor)}
                    </div>
                    {/* Mostrar nombre corto original si hay título personalizado */}
                    {getTituloPersonalizado(hechoKey) && (
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 italic">
                        Hecho original: {formatTitulo(hechoAgrupado.valor)}
                      </div>
                    )}
                    {/* Badges debajo del título */}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {/* Badge de cantidad de registros */}
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                        {hechoAgrupado.cantidadRegistros} {hechoAgrupado.cantidadRegistros === 1 ? 'registro' : 'registros'}
                      </span>
                      {/* Badge de cantidad de fotos */}
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        {hechoAgrupado.cantidadFotos} {hechoAgrupado.cantidadFotos === 1 ? 'foto' : 'fotos'}
                      </span>
                      {/* Badges de fuentes */}
                      {hechoAgrupado.fuentes.map(fuente => (
                        <span key={fuente} className={`
                          px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0
                          ${fuente === 'tabla2' 
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          }
                        `}>
                          {fuente === 'tabla2' ? 'Hecho detectado' : 'Verificación'}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* Botón de desarrollar o badge completado */}
                  {isCompleted ? (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Completado
                      </span>
                      <button
                        onClick={() => isEnabled && enterHechoDetail(hechoAgrupado)}
                        disabled={!isEnabled}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        Editar
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => isEnabled && enterHechoDetail(hechoAgrupado)}
                      disabled={!isEnabled}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0
                        ${isEnabled 
                          ? 'bg-primary-600 hover:bg-primary-700 text-white pink:bg-pink-600 pink:hover:bg-pink-700' 
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
                        }
                      `}
                    >
                      Abrir
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
  
  // Vista de detalle de un hecho - PHOTOS FIRST APPROACH
  const renderDetailView = () => {
    if (!selectedHecho) return null
    
    const inputClass = `
      w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 
      rounded-lg bg-white dark:bg-slate-700 pink:bg-white 
      text-slate-900 dark:text-white pink:text-slate-900 
      focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent
    `
    
    const textareaClass = `
      w-full px-3 py-2 border border-slate-300 dark:border-slate-600 pink:border-pink-300 
      rounded-lg bg-white dark:bg-slate-700 pink:bg-white 
      text-slate-900 dark:text-white pink:text-slate-900 
      focus:ring-2 focus:ring-primary-500 pink:focus:ring-pink-500 focus:border-transparent
      min-h-[100px] resize-y
    `
    
    return (
      <div className="p-6">
        {/* Header con navegación y stepper */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => {
                if (detailStep === 2) {
                  setDetailStep(1)
                } else {
                  setViewMode('list')
                  setSelectedHecho(null)
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400 pink:text-pink-600" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">
                {formatTitulo(tituloHecho || selectedHecho.valor)}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                  {selectedHecho.cantidadRegistros} {selectedHecho.cantidadRegistros === 1 ? 'registro' : 'registros'}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  {selectedHecho.cantidadFotos || 0} fotos
                </span>
              </div>
            </div>
          </div>
          
          {/* Stepper visual - 6 pasos compacto */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 pink:bg-white rounded-xl p-3 border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-x-auto">
            {/* Paso 1: Datos generales */}
            <button
              onClick={() => setDetailStep(1)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 1 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : tituloHecho.trim() && presuntoIncumplimiento && subsanado
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 1 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : tituloHecho.trim() && presuntoIncumplimiento && subsanado
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {tituloHecho.trim() && presuntoIncumplimiento && subsanado && detailStep !== 1 ? <Check className="w-3 h-3" /> : '1'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 1 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Datos
              </span>
            </button>
            
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            
            {/* Paso 2: Obligación */}
            <button
              onClick={() => setDetailStep(2)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 2 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : hasRichTextContent(obligacion)
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 2 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : hasRichTextContent(obligacion)
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {hasRichTextContent(obligacion) && detailStep !== 2 ? <Check className="w-3 h-3" /> : '2'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 2 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Obligación
              </span>
            </button>
            
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            
            {/* Paso 3: Medios probatorios */}
            <button
              onClick={() => setDetailStep(3)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 3 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : fotosSeleccionadas.length > 0
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 3 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : fotosSeleccionadas.length > 0 
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {fotosSeleccionadas.length > 0 && detailStep !== 3 ? <Check className="w-3 h-3" /> : '3'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 3 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Medios
              </span>
            </button>
            
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            
            {/* Paso 4: Descripción */}
            <button
              onClick={() => setDetailStep(4)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 4 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : descripcionHecho.trim()
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 4 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : descripcionHecho.trim()
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {descripcionHecho.trim() && detailStep !== 4 ? <Check className="w-3 h-3" /> : '4'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 4 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Descripción
              </span>
            </button>
            
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            
            {/* Paso 5: Requerimiento de Subsanación */}
            <button
              onClick={() => setDetailStep(5)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 5 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : hasRichTextContent(requerimientoSubsanacion)
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 5 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : hasRichTextContent(requerimientoSubsanacion)
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {hasRichTextContent(requerimientoSubsanacion) && detailStep !== 5 ? <Check className="w-3 h-3" /> : '5'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 5 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Subsanación
              </span>
            </button>
            
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            
            {/* Paso 6: Análisis de riesgo */}
            <button
              onClick={() => setDetailStep(6)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg flex-shrink-0 transition-all ${
                detailStep === 6 
                  ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500' 
                  : nivelRiesgo
                    ? 'border-2 border-green-300 dark:border-green-700'
                    : 'border-2 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                detailStep === 6 
                  ? 'bg-primary-600 pink:bg-[#ff0075] text-white' 
                  : nivelRiesgo
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-600 pink:bg-pink-200 text-slate-600 dark:text-slate-300 pink:text-[#0f172a]'
              }`}>
                {nivelRiesgo && detailStep !== 6 ? <Check className="w-3 h-3" /> : '6'}
              </div>
              <span className={`text-[10px] font-medium hidden lg:block ${detailStep === 6 ? 'text-primary-700 dark:text-primary-300 pink:text-[#ff0075]' : 'text-slate-600 dark:text-slate-400 pink:text-[#64748b]'}`}>
                Riesgo
              </span>
            </button>
          </div>
        </div>
        
        {/* PASO 1: Datos Generales */}
        {detailStep === 1 && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                tituloHecho.trim() && presuntoIncumplimiento && subsanado
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
              }`}>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                  {tituloHecho.trim() && presuntoIncumplimiento && subsanado ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                  Paso 1: Datos Generales
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                  Información básica del hecho verificado
                </p>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Título del Hecho Verificado */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Título del Hecho Verificado (redacción completa) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Redacta el título completo y descriptivo que aparecerá en el acta
                  </p>
                  <textarea
                    value={tituloHecho}
                    onChange={(e) => setTituloHecho(e.target.value)}
                    placeholder="Ej: Se verificó la presencia de residuos sólidos dispuestos inadecuadamente en el área de almacenamiento temporal del componente EA-01..."
                    className={textareaClass}
                    rows={3}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {tituloHecho.length} caracteres
                  </p>
                </div>
                
                {/* Presunto Incumplimiento y Subsanado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      ¿Presunto Incumplimiento? <span className="text-red-500">*</span>
                    </label>
                    <select 
                      value={presuntoIncumplimiento}
                      onChange={(e) => setPresuntoIncumplimiento(e.target.value)}
                      className={inputClass}
                    >
                      {PRESUNTO_INCUMPLIMIENTO_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      ¿Subsanado? <span className="text-red-500">*</span>
                    </label>
                    <select 
                      value={subsanado}
                      onChange={(e) => setSubsanado(e.target.value)}
                      className={inputClass}
                    >
                      {SUBSANADO_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Botones de navegación */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={guardarBorrador}
                    disabled={savingBorrador}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {savingBorrador ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Guardar borrador
                  </button>
                  <button
                    onClick={() => setDetailStep(2)}
                    disabled={!tituloHecho.trim() || !presuntoIncumplimiento || !subsanado}
                    className={`
                      flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
                      ${tituloHecho.trim() && presuntoIncumplimiento && subsanado
                        ? 'bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white' 
                        : 'bg-slate-200 pink:bg-pink-200 text-slate-400 pink:text-[#64748b] cursor-not-allowed'
                      }
                    `}
                  >
                    Continuar
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* PASO 2: Obligación */}
        {detailStep === 2 && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                hasRichTextContent(obligacion)
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
              }`}>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                  {hasRichTextContent(obligacion) ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                  Paso 2: Obligación Fiscalizable
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                  Referencia a la obligación incumplida o verificada
                </p>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Obligación fiscalizable <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Referencia al IGA, norma, compromiso ambiental u otra obligación aplicable. 
                    Use el editor para dar formato: <strong>negrita</strong>, <em>cursiva</em>, listas, notas al pie, etc.
                  </p>
                  <RichTextEditor
                    value={obligacion}
                    onChange={setObligacion}
                    placeholder="Ej: Artículo 5 del D.S. N° 002-2013-MINAM - Estándares de Calidad Ambiental para Suelo..."
                    minHeight="180px"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    AISA puede cometer errores, siempre revisa el contenido.
                  </p>
                  
                  {/* Panel AI Enhancer inline */}
                  <AIEnhancePanel
                    content={obligacion}
                    fieldType="obligacion"
                    context={{
                      codigoAccion: codigoAccion,
                      componente: selectedHecho?.componentes?.[0] || '',
                      hechoDetec: selectedHecho?.valor || '',
                      // Incluir fotos seleccionadas para contexto
                      fotos: fotosSeleccionadas.map(f => ({
                        descripcion: descripcionesEditadas[`${f.gid}_${f.filename}`] || f.descripcion || '',
                        componente: f.componente,
                        tipo_componente: f.tipo_componente
                      }))
                    }}
                    actaId={borrador?.id}
                    hechoId={hechoGuardadoId}
                    onContentChange={setObligacion}
                    disabled={!hasRichTextContent(obligacion)}
                  />
                </div>
                
                {/* Botones de navegación */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setDetailStep(1)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={guardarBorrador}
                      disabled={savingBorrador}
                      className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      {savingBorrador ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Guardar borrador
                    </button>
                    <button
                      onClick={() => setDetailStep(3)}
                      disabled={!hasRichTextContent(obligacion)}
                      className={`
                        flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
                        ${hasRichTextContent(obligacion)
                          ? 'bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white' 
                          : 'bg-slate-200 pink:bg-pink-200 text-slate-400 pink:text-[#64748b] cursor-not-allowed'
                        }
                      `}
                    >
                      Continuar
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* PASO 3: Medios Probatorios */}
        {detailStep === 3 && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                fotosSeleccionadas.length > 0
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                      {fotosSeleccionadas.length > 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <Camera className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      )}
                      Paso 3: Medios Probatorios
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                      Selecciona las fotografías que evidencian este hecho
                    </p>
                  </div>
                
                  {/* Switch Original / Mi versión */}
                  <div className="flex items-center gap-3 bg-white dark:bg-slate-700 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600">
                    <span className={`text-xs font-medium ${!mostrarEditadas ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
                      Original
                    </span>
                    <button
                      onClick={() => setMostrarEditadas(!mostrarEditadas)}
                      className="relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                      style={{ backgroundColor: mostrarEditadas ? '#3b82f6' : '#cbd5e1' }}
                    >
                      <div 
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${mostrarEditadas ? 'translate-x-5' : 'translate-x-0.5'}`}
                      />
                    </button>
                    <span className={`text-xs font-medium ${mostrarEditadas ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
                      Mi versión
                    </span>
                  </div>
                </div>
              </div>
            
              <div className="p-6">
                {loadingFotos ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    <span className="ml-3 text-slate-500">Cargando fotografías...</span>
                  </div>
                ) : fotosDisponibles.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <Image className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">No hay fotografías disponibles</p>
                    <p className="text-sm mt-1">Este registro no tiene fotos asociadas</p>
                  </div>
                ) : (
                  <>
                    {/* Info de cantidad total */}
                    {fotosDisponibles.length > PHOTOS_PER_PAGE && (
                      <div className="mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>{fotosDisponibles.length} fotos</strong> disponibles. 
                          Mostrando página {photosPage + 1} de {totalPhotoPages} ({PHOTOS_PER_PAGE} por página).
                        </p>
                      </div>
                    )}
                    
                    {/* Carrete vertical de fotos - PAGINADO para rendimiento */}
                    <div className="space-y-4 mb-4 max-h-[450px] overflow-y-auto pr-2 pl-3 pt-3">
                      {paginatedPhotos.map((foto, idx) => {
                        const globalIdx = (photosPage * PHOTOS_PER_PAGE) + idx
                        const isSelected = fotosSeleccionadas.some(f => f.filename === foto.filename && f.gid === foto.gid)
                        // Construir URL si no existe o usar la existente
                        const fotoUrl = foto.url || `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${foto.gid}/${encodeURIComponent(foto.filename)}?token=${session?.access_token}`
                        
                        return (
                          <div
                            key={`${foto.gid}-${foto.filename}-${globalIdx}`}
                            className={`
                              flex gap-4 p-3 rounded-xl border-2 transition-all
                              ${isSelected 
                                ? 'border-green-400 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-400/30' 
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                              }
                            `}
                          >
                            {/* Zona izquierda: checkbox y miniatura */}
                            <div className="flex-shrink-0 flex items-start gap-3">
                              <button
                                onClick={() => toggleFoto(foto)}
                                className={`
                                  w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2
                                  ${isSelected 
                                    ? 'bg-green-500 border-green-500 text-white shadow-green-500/40 shadow-lg' 
                                    : 'bg-white border-slate-300 text-slate-400 hover:border-slate-400'
                                  }
                                `}
                                aria-pressed={isSelected}
                                title={isSelected ? 'Quitar selección' : 'Seleccionar foto'}
                              >
                                {isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                              </button>

                              <div
                                className="relative rounded-xl overflow-hidden group"
                                style={{ width: `${THUMB_WIDTH}px`, height: `${THUMB_HEIGHT}px`, backgroundColor: '#050505' }}
                              >
                                <img
                                  src={fotoUrl}
                                  alt={foto.filename}
                                  className="w-full h-full object-contain cursor-zoom-in"
                                  loading="lazy"
                                  onClick={() => openPhotoModal(foto, idx)}
                                  onLoad={(e) => {
                                    const naturalWidth = e.target.naturalWidth || 0
                                    const naturalHeight = e.target.naturalHeight || 0
                                    const photoId = getPhotoUniqueId(foto)
                                    if (!naturalWidth || !naturalHeight || !photoId) return
                                    setPhotoDimensions(prev => {
                                      const existing = prev[photoId]
                                      if (existing && existing.width === naturalWidth && existing.height === naturalHeight) {
                                        return prev
                                      }
                                      return {
                                        ...prev,
                                        [photoId]: {
                                          width: naturalWidth,
                                          height: naturalHeight
                                        }
                                      }
                                    })
                                  }}
                                  onError={(e) => {
                                    e.target.onerror = null
                                    e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23e2e8f0" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="12">Sin imagen</text></svg>'
                                  }}
                                />

                                {/* Overlay con anotaciones */}
                                {renderThumbnailAnnotations(foto)}

                                {/* Número de orden si está seleccionado */}
                                {isSelected && (
                                  <div className="absolute bottom-1 right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    #{fotosSeleccionadas.findIndex(f => f.filename === foto.filename && f.gid === foto.gid) + 1}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Descripción a la derecha */}
                            <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-semibold ${isSelected ? 'text-green-700 dark:text-green-300' : 'text-slate-900 dark:text-white'}`}>
                                    Foto {globalIdx + 1}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleFoto(foto); }}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                      isSelected 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' 
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                                    }`}
                                  >
                                    {isSelected ? '✓ Seleccionada' : 'Seleccionar'}
                                  </button>
                                </div>
                                {foto.componente && (
                                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">
                                    {foto.componente}
                                  </span>
                                )}
                              </div>
                              
                              {/* Descripción compacta - cada foto tiene su propia descripción */}
                              {mostrarEditadas ? (
                                <textarea
                                  value={descripcionesEditadas[getPhotoUniqueId(foto)] ?? foto.descripcion ?? ''}
                                  onChange={(e) => handleDescripcionChange(getPhotoUniqueId(foto), e.target.value)}
                                  placeholder="Escribe la descripción..."
                                  className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                  rows={2}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                  {foto.descripcion || 'Sin descripción'}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    
                    {/* Paginación de fotos */}
                    {totalPhotoPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mb-4 py-3 border-y border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => goToPhotoPage(photosPage - 1)}
                          disabled={photosPage === 0}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        
                        {/* Page numbers */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(totalPhotoPages, 7) }, (_, i) => {
                            let pageNum
                            if (totalPhotoPages <= 7) {
                              pageNum = i
                            } else if (photosPage < 3) {
                              pageNum = i
                            } else if (photosPage > totalPhotoPages - 4) {
                              pageNum = totalPhotoPages - 7 + i
                            } else {
                              pageNum = photosPage - 3 + i
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => goToPhotoPage(pageNum)}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                  pageNum === photosPage
                                    ? 'bg-primary-600 text-white'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {pageNum + 1}
                              </button>
                            )
                          })}
                        </div>
                        
                        <button
                          onClick={() => goToPhotoPage(photosPage + 1)}
                          disabled={photosPage === totalPhotoPages - 1}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                    
                    {/* Resumen y botones */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">
                          {fotosSeleccionadas.length}
                        </span> de {fotosDisponibles.length} fotos seleccionadas
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDetailStep(2)}
                          className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Anterior
                        </button>
                        <button
                          onClick={guardarBorrador}
                          disabled={savingBorrador}
                          className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                        >
                          {savingBorrador ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Guardar borrador
                        </button>
                        <button
                          onClick={() => setDetailStep(4)}
                          disabled={fotosSeleccionadas.length === 0}
                          className={`
                            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
                            ${fotosSeleccionadas.length > 0 
                              ? 'bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white' 
                              : 'bg-slate-200 pink:bg-pink-200 text-slate-400 pink:text-[#64748b] cursor-not-allowed'
                            }
                          `}
                        >
                          Continuar
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* PASO 4: Descripción del Hecho */}
        {detailStep === 4 && (
          <div className="space-y-6">
            {/* Resumen de fotos seleccionadas */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900 dark:text-white">
                  Medios probatorios ({fotosSeleccionadas.length})
                </h4>
                <button
                  onClick={() => setDetailStep(3)}
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                >
                  Modificar selección
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {fotosSeleccionadas.map((foto, idx) => {
                  // Encontrar el índice global de esta foto
                  const globalIdx = fotosDisponibles.findIndex(
                    f => f.filename === foto.filename && f.gid === foto.gid
                  )
                  const fotoUrl = foto.url || `${API_BASE}/api/s123/direct/photo/${codigoAccion}/${foto.gid}/${encodeURIComponent(foto.filename)}?token=${session?.access_token}`

                  return (
                    <div
                      key={`selected-${foto.gid}-${foto.filename}`}
                      className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-primary-200 cursor-pointer hover:border-primary-400 transition-colors group"
                      style={{ width: `${THUMB_WIDTH}px`, height: `${THUMB_HEIGHT}px`, backgroundColor: '#050505' }}
                      onClick={() => {
                        if (globalIdx >= 0) {
                          setSelectedPhotoIndex(globalIdx)
                          setPhotoModalOpen(true)
                        }
                      }}
                      title="Click para ver foto maximizada"
                    >
                      <img
                        src={fotoUrl}
                        alt=""
                        className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                        loading="lazy"
                        onLoad={(e) => {
                          const naturalWidth = e.target.naturalWidth || 0
                          const naturalHeight = e.target.naturalHeight || 0
                          const photoId = getPhotoUniqueId(foto)
                          if (!naturalWidth || !naturalHeight || !photoId) return
                          setPhotoDimensions(prev => {
                            const existing = prev[photoId]
                            if (existing && existing.width === naturalWidth && existing.height === naturalHeight) {
                              return prev
                            }
                            return {
                              ...prev,
                              [photoId]: {
                                width: naturalWidth,
                                height: naturalHeight
                              }
                            }
                          })
                        }}
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="112"><rect fill="%23050505" width="160" height="112"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-size="12">Error</text></svg>'
                        }}
                      />

                      {renderThumbnailAnnotations(foto)}

                      <div className="absolute bottom-1 right-1 bg-primary-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Formulario de descripción */}
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                descripcionHecho.trim()
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                      {descripcionHecho.trim() ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      )}
                      Paso 4: Descripción del Hecho
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                      Describe detalladamente el hecho verificado
                    </p>
                  </div>
                  
                  {/* Botón Generar Descripción AI */}
                  <button
                    onClick={generarDescripcionAI}
                    disabled={generatingDescription || fotosSeleccionadas.length === 0}
                    className={`
                      flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all shadow-lg
                      ${fotosSeleccionadas.length > 0 && !generatingDescription
                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-violet-500/25 hover:shadow-violet-500/40'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                      }
                    `}
                    title={fotosSeleccionadas.length === 0 
                      ? 'Selecciona fotos en el paso 3 para generar descripción' 
                      : 'Generar descripción basada en las fotos seleccionadas'
                    }
                  >
                    {generatingDescription ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generando...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        <span>Generar Descripción</span>
                        <Sparkles className="w-3.5 h-3.5 opacity-75" />
                      </>
                    )}
                  </button>
                </div>
                
                {/* Info helper si no hay fotos */}
                {fotosSeleccionadas.length === 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    <span>Selecciona fotografías en el <strong>Paso 3 (Medios Probatorios)</strong> para habilitar el generador AI</span>
                  </div>
                )}
                
                {/* Info helper si hay fotos pero sin descripción */}
                {fotosSeleccionadas.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-3 py-2 rounded-lg">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span><strong>{fotosSeleccionadas.length} foto{fotosSeleccionadas.length !== 1 ? 's' : ''}</strong> seleccionada{fotosSeleccionadas.length !== 1 ? 's' : ''}. El AI generará la descripción basándose en sus descripciones.</span>
                  </div>
                )}
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Descripción del Hecho <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Descripción clara y precisa del hecho verificado, incluyendo ubicación, condiciones observadas y cualquier detalle relevante.
                    Use el editor para dar formato: <strong>negrita</strong>, <em>cursiva</em>, listas, notas al pie, etc.
                  </p>
                  <RichTextEditor
                    value={descripcionHecho}
                    onChange={setDescripcionHecho}
                    placeholder="Durante la supervisión realizada el día... se verificó que en el componente... se observó..."
                    minHeight="200px"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    AISA puede cometer errores, siempre revisa el contenido.
                  </p>
                  
                  {/* Panel AI Enhancer inline para descripción */}
                  <AIEnhancePanel
                    content={descripcionHecho}
                    fieldType="descripcion"
                    context={{
                      codigoAccion: codigoAccion,
                      componente: selectedHecho?.componentes?.[0] || '',
                      hechoDetec: selectedHecho?.valor || '',
                      // Incluir fotos seleccionadas para enriquecer la revisión de experto
                      fotos: fotosSeleccionadas.map(f => ({
                        descripcion: descripcionesEditadas[`${f.gid}_${f.filename}`] || f.descripcion || '',
                        descripcionEditada: descripcionesEditadas[`${f.gid}_${f.filename}`],
                        componente: f.componente,
                        tipo_componente: f.tipo_componente,
                        filename: f.filename
                      }))
                    }}
                    actaId={borrador?.id}
                    hechoId={hechoGuardadoId}
                    onContentChange={setDescripcionHecho}
                    disabled={!descripcionHecho.trim() || descripcionHecho.length < 20}
                  />
                </div>
                
                {/* Botones de navegación */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setDetailStep(3)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={guardarBorrador}
                      disabled={savingBorrador}
                      className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      {savingBorrador ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Guardar borrador
                    </button>
                    <button
                      onClick={() => setDetailStep(5)}
                      disabled={!descripcionHecho.trim()}
                      className={`
                        flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
                        ${descripcionHecho.trim()
                          ? 'bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white' 
                          : 'bg-slate-200 pink:bg-pink-200 text-slate-400 pink:text-[#64748b] cursor-not-allowed'
                        }
                      `}
                    >
                      Continuar
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* PASO 5: Requerimiento de Subsanación */}
        {detailStep === 5 && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                hasRichTextContent(requerimientoSubsanacion)
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                      {hasRichTextContent(requerimientoSubsanacion) ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      )}
                      Paso 5: Requerimiento de Subsanación
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                      Indicar el requerimiento de corrección y plazo si el hecho no fue subsanado
                    </p>
                  </div>
                  
                  {/* Botón Añadir Genérico */}
                  <button
                    onClick={() => setRequerimientoSubsanacion('<p>No aplica; sin embargo, el administrado puede presentar información sobre los componentes analizados en el presente hecho que considere pertinentes.</p>')}
                    disabled={hasRichTextContent(requerimientoSubsanacion)}
                    className={`
                      flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                      ${hasRichTextContent(requerimientoSubsanacion)
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg'
                      }
                    `}
                    title="Añadir texto genérico predefinido"
                  >
                    <Wand2 className="w-4 h-4" />
                    Añadir genérico
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Requerimiento de Subsanación
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Si el hecho no fue subsanado antes del cierre de la acción de supervisión, efectuar el requerimiento de corrección indicando la actividad requerida y el plazo.
                    Use el editor para dar formato: <strong>negrita</strong>, <em>cursiva</em>, listas, etc.
                  </p>
                  <RichTextEditor
                    value={requerimientoSubsanacion}
                    onChange={setRequerimientoSubsanacion}
                    placeholder="Ej: No aplica; sin embargo, el administrado puede presentar información sobre los componentes analizados..."
                    minHeight="180px"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    AISA puede cometer errores, siempre revisa el contenido.
                  </p>
                  
                  {/* Panel AI Enhancer inline */}
                  <AIEnhancePanel
                    content={requerimientoSubsanacion}
                    fieldType="requerimiento_subsanacion"
                    context={{
                      codigoAccion: codigoAccion,
                      componente: selectedHecho?.componentes?.[0] || '',
                      hechoDetec: selectedHecho?.valor || '',
                      subsanado: subsanado,
                      presuntoIncumplimiento: presuntoIncumplimiento,
                      descripcion: descripcionHecho,
                      obligacion: obligacion
                    }}
                    actaId={borrador?.id}
                    hechoId={hechoGuardadoId}
                    onContentChange={setRequerimientoSubsanacion}
                    disabled={!hasRichTextContent(requerimientoSubsanacion)}
                  />
                </div>
                
                {/* Botones de navegación */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setDetailStep(4)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={guardarBorrador}
                      disabled={savingBorrador}
                      className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      {savingBorrador ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Guardar borrador
                    </button>
                    <button
                      onClick={() => setDetailStep(6)}
                      className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white rounded-lg font-semibold transition-all"
                    >
                      Continuar
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* PASO 6: Análisis de Riesgo - METODOLOGÍA ANEXO 4 OEFA */}
        {detailStep === 6 && (
          <div className="space-y-6">
            
            {/* Formulario de Análisis de Riesgo - ANEXO 4 OEFA */}
            <div className="bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 pink:border-pink-200 overflow-hidden">
              <div className={`px-6 py-4 border-b border-slate-200 dark:border-slate-700 ${
                nivelRiesgo
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                  : 'bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20'
              }`}>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white pink:text-[#0f172a] flex items-center gap-2">
                  {nivelRiesgo ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                  Paso 6: Análisis de Riesgo Ambiental
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-1">
                  Metodología según Anexo 4 del Reglamento de Supervisión del OEFA
                </p>
              </div>
              
              <div className="p-6 space-y-8">
                
                {/* ========== SECCIÓN 1: SELECCIÓN DE ENTORNO ========== */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">Selección de Entorno Afectado</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setEntornoAfectacion('NATURAL')
                        setFactorPersonasExpuestas(0) // Reset factor de humano
                      }}
                      className={`
                        p-4 rounded-xl border-2 transition-all text-left
                        ${entornoAfectacion === 'NATURAL'
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          entornoAfectacion === 'NATURAL' ? 'bg-green-500 text-white' : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                        }`}>
                          <Leaf className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">Entorno Natural</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Flora, fauna, suelo, agua, aire</p>
                        </div>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setEntornoAfectacion('HUMANO')
                        setFactorMedioAfectado(0) // Reset factor de natural
                      }}
                      className={`
                        p-4 rounded-xl border-2 transition-all text-left
                        ${entornoAfectacion === 'HUMANO'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          entornoAfectacion === 'HUMANO' ? 'bg-blue-500 text-white' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        }`}>
                          <Scale className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">Entorno Humano</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Salud, seguridad, bienes de personas</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
                
                {/* ========== SECCIÓN 2: FACTORES DE CONSECUENCIA ========== */}
                {entornoAfectacion && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">2</span>
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">
                        Factores de Consecuencia
                        <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                          ({entornoAfectacion === 'HUMANO' ? 'Fórmula Nº 2' : 'Fórmula Nº 3'})
                        </span>
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Factor Cantidad */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Cantidad <span className="text-slate-400"></span>
                        </label>
                        <select 
                          value={factorCantidad}
                          onChange={(e) => setFactorCantidad(Number(e.target.value))}
                          className={inputClass}
                        >
                          {OPCIONES_CANTIDAD.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Factor Peligrosidad */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Peligrosidad <span className="text-slate-400"></span>
                          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">×2 en fórmula</span>
                        </label>
                        <select 
                          value={factorPeligrosidad}
                          onChange={(e) => setFactorPeligrosidad(Number(e.target.value))}
                          className={inputClass}
                        >
                          {OPCIONES_PELIGROSIDAD.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Factor Extensión */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Extensión <span className="text-slate-400"></span>
                        </label>
                        <select 
                          value={factorExtension}
                          onChange={(e) => setFactorExtension(Number(e.target.value))}
                          className={inputClass}
                        >
                          {OPCIONES_EXTENSION.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Factor específico según entorno */}
                      {entornoAfectacion === 'HUMANO' ? (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Personas Potencialmente Expuestas <span className="text-slate-400"></span>
                          </label>
                          <select 
                            value={factorPersonasExpuestas}
                            onChange={(e) => setFactorPersonasExpuestas(Number(e.target.value))}
                            className={inputClass}
                          >
                            {OPCIONES_PERSONAS_EXPUESTAS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Medio Potencialmente Afectado <span className="text-slate-400"></span>
                          </label>
                          <select 
                            value={factorMedioAfectado}
                            onChange={(e) => setFactorMedioAfectado(Number(e.target.value))}
                            className={inputClass}
                          >
                            {OPCIONES_MEDIO_AFECTADO.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    
                    {/* Panel de resultado de Consecuencia */}
                    {scoreConsecuencia > 0 && (
                      <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="text-sm text-purple-600 dark:text-purple-300">
                              {entornoAfectacion === 'HUMANO' 
                                ? `${factorCantidad} + 2×${factorPeligrosidad} + ${factorExtension} + ${factorPersonasExpuestas}`
                                : `${factorCantidad} + 2×${factorPeligrosidad} + ${factorExtension} + ${factorMedioAfectado}`
                              }
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Cantidad + 2×Peligrosidad + Extensión + {entornoAfectacion === 'HUMANO' ? 'Personas' : 'Medio'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">{scoreConsecuencia}</p>
                              <p className="text-xs text-slate-500">Puntuación</p>
                            </div>
                            <div className="w-px h-12 bg-purple-200 dark:bg-purple-700" />
                            <div className="text-center">
                              <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{valorConsecuencia}</p>
                              <p className="text-xs text-slate-500">Gravedad</p>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 text-sm font-medium">
                              {getCondicionConsecuencia(valorConsecuencia)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* ========== SECCIÓN 3: PROBABILIDAD DE OCURRENCIA ========== */}
                {entornoAfectacion && valorConsecuencia > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400">3</span>
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">
                        Probabilidad de Ocurrencia
                        <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400"></span>
                      </h4>
                    </div>
                    
                    <div>
                      <select 
                        value={probabilidadOcurrencia}
                        onChange={(e) => setProbabilidadOcurrencia(Number(e.target.value))}
                        className={`${inputClass} max-w-xl`}
                      >
                        {OPCIONES_PROBABILIDAD.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                {/* ========== PANEL DE RESULTADO FINAL ========== */}
                {valorRiesgo > 0 && (
                  <div className={`p-6 rounded-xl border-2 ${getColorNivelRiesgo(nivelRiesgo?.toUpperCase()).border} ${getColorNivelRiesgo(nivelRiesgo?.toUpperCase()).bg}`}>
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                      {/* Fórmula visual */}
                      <div className="flex items-center gap-4 text-center">
                        <div>
                          <p className="text-4xl font-bold text-slate-700 dark:text-slate-200">{probabilidadOcurrencia}</p>
                          <p className="text-xs text-slate-500 mt-1">Probabilidad</p>
                        </div>
                        <span className="text-2xl text-slate-400">×</span>
                        <div>
                          <p className="text-4xl font-bold text-slate-700 dark:text-slate-200">{valorConsecuencia}</p>
                          <p className="text-xs text-slate-500 mt-1">Consecuencia</p>
                        </div>
                        <span className="text-2xl text-slate-400">=</span>
                        <div>
                          <p className="text-5xl font-bold text-slate-900 dark:text-white">{valorRiesgo}</p>
                          <p className="text-xs text-slate-500 mt-1">Riesgo</p>
                        </div>
                      </div>
                      
                      {/* Resultado */}
                      <div className="text-center lg:text-right">
                        <div className={`inline-block px-6 py-3 rounded-xl ${
                          nivelRiesgo === 'significativo' ? 'bg-red-500 text-white' :
                          nivelRiesgo === 'moderado' ? 'bg-yellow-500 text-white' :
                          'bg-green-500 text-white'
                        }`}>
                          <p className="text-2xl font-bold uppercase">Riesgo {nivelRiesgo}</p>
                          <p className="text-sm opacity-90">{tipoIncumplimiento}</p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          Rango del nivel de riesgo encontrado: de
                          {nivelRiesgo === 'significativo' ? ' 16 a 25' :
                           nivelRiesgo === 'moderado' ? ' 6 a 15' : ' 1 a 5'}
                          {' '} puntos
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* ========== SECCIÓN: TEXTO GENERADO DEL ANÁLISIS ========== */}
                {textoAnalisisRiesgo && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a]">
                        Resumen del Análisis de Riesgo
                        <span className="ml-2 text-xs font-normal text-slate-400">(generado automáticamente)</span>
                      </h4>
                    </div>
                    
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <RichTextEditor
                        value={textoAnalisisRiesgo}
                        onChange={setTextoAnalisisRiesgo}
                        placeholder="El texto se genera automáticamente al seleccionar los factores..."
                        minHeight="100px"
                      />
                    </div>
                  </div>
                )}
                
                {/* ========== SECCIÓN 4: CAMPOS COMPLEMENTARIOS ========== */}
                {valorRiesgo > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 pink:text-[#0f172a] flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Información Complementaria
                        <span className="text-sm font-normal text-slate-400">(opcional)</span>
                      </h4>
                      
                      {/* Botón para generar con Gemini */}
                      <button
                        onClick={generarAnalisisRiesgoAI}
                        disabled={generatingRiskAnalysis || !valorRiesgo}
                        className={`
                          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${generatingRiskAnalysis || !valorRiesgo
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white shadow-md hover:shadow-lg'
                          }
                        `}
                      >
                        {generatingRiskAnalysis ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generar con IA
                          </>
                        )}
                      </button>
                    </div>
                    
                    {/* ===== 1. Justificación del riesgo ===== */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
                        Justificación del Análisis de Riesgo
                      </label>
                      <RichTextEditor
                        value={justificacionRiesgo}
                        onChange={setJustificacionRiesgo}
                        placeholder="Describa las razones que sustentan los valores asignados a cada factor..."
                        minHeight="120px"
                      />
                      <AIEnhancePanel
                        content={justificacionRiesgo}
                        onContentChange={setJustificacionRiesgo}
                        fieldType="justificacion_riesgo"
                        actaId={borrador?.id}
                        hechoId={hechoGuardadoId}
                        context={{ obligacion, descripcionHecho, nivelRiesgo, tipoIncumplimiento }}
                      />
                    </div>
                    
                    {/* ===== 2. Impacto potencial ===== */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
                        Impacto Potencial
                      </label>
                      <RichTextEditor
                        value={impactoPotencial}
                        onChange={setImpactoPotencial}
                        placeholder="Describa el impacto potencial si el riesgo se materializa..."
                        minHeight="120px"
                      />
                      <AIEnhancePanel
                        content={impactoPotencial}
                        onContentChange={setImpactoPotencial}
                        fieldType="impacto_potencial"
                        actaId={borrador?.id}
                        hechoId={hechoGuardadoId}
                        context={{ obligacion, descripcionHecho, nivelRiesgo, tipoIncumplimiento }}
                      />
                    </div>
                    
                    {/* ===== 3. Medidas de mitigación ===== */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
                        Medidas de Mitigación Sugeridas
                      </label>
                      <RichTextEditor
                        value={medidasMitigacion}
                        onChange={setMedidasMitigacion}
                        placeholder="Acciones recomendadas para mitigar el riesgo..."
                        minHeight="120px"
                      />
                      <AIEnhancePanel
                        content={medidasMitigacion}
                        onContentChange={setMedidasMitigacion}
                        fieldType="medidas_mitigacion"
                        actaId={borrador?.id}
                        hechoId={hechoGuardadoId}
                        context={{ obligacion, descripcionHecho, nivelRiesgo, tipoIncumplimiento }}
                      />
                    </div>
                  </div>
                )}
                
                {/* ========== BOTONES DE ACCIÓN ========== */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setDetailStep(5)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Anterior
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={guardarBorrador}
                      disabled={savingBorrador}
                      className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      {savingBorrador ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Guardar borrador
                    </button>
                    <button
                      onClick={async () => {
                        // Guardar borrador y obtener el ID del hecho
                        const savedId = await guardarBorrador()
                        
                        // Marcar como completado en la BD usando el ID retornado
                        const idToUse = savedId || hechoGuardadoId
                        if (idToUse) {
                          try {
                            await axios.put(
                              `${API_BASE}/api/actas/${borrador.id}/hechos/${idToUse}`,
                              { is_completed: 1 },
                              getAuthHeaders()
                            )
                            console.log('[HechosSection] ✅ Hecho marcado como completado, ID:', idToUse)
                          } catch (err) {
                            console.warn('Error marcando hecho como completado:', err.message)
                          }
                        } else {
                          console.warn('[HechosSection] ⚠️ No se pudo marcar como completado: sin ID')
                        }
                        
                        // Actualizar estado local de completados
                        setHechosCompletados(prev => ({
                          ...prev,
                          [selectedHecho.valor]: true
                        }))
                        
                        // Activar el switch (habilitado) automáticamente al completar
                        setHechosHabilitados(prev => ({
                          ...prev,
                          [selectedHecho.valor]: true
                        }))
                        
                        toast.success('Hecho completado')
                        setViewMode('list')
                        setSelectedHecho(null)
                      }}
                      disabled={!nivelRiesgo || savingBorrador}
                      className={`
                        flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-colors
                        ${nivelRiesgo && !savingBorrador
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }
                      `}
                    >
                      <Check className="w-4 h-4" />
                      Finalizar Hecho
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {viewMode === 'list' ? renderListView() : renderDetailView()}
      
      {/* Modal de foto maximizada con metadata */}
      <PhotoDetailModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        foto={fotosDisponibles[selectedPhotoIndex]}
        fotos={fotosDisponibles}
        currentIndex={selectedPhotoIndex}
        onNavigate={navigatePhotoModal}
        descripcionesEditadas={descripcionesEditadas}
        metadataEditadas={metadataEditadas}
        annotations={photoAnnotations}
        onAnnotationsChange={handleAnnotationsChange}
        onDescripcionChange={handleDescripcionChange}
        onGuardarDescripcion={guardarDescripcion}
        onRevertDescripcion={revertirDescripcion}
        onMetadataChange={handleMetadataChange}
        onGuardarMetadata={guardarMetadata}
        savingDescripcion={savingDescripcion}
        savingMetadata={savingMetadata}
      />
    </>
  )
}

export default HechosSection
