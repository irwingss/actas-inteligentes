/**
 * Calculadora de Riesgo Ambiental - Anexo 4 del Reglamento de Supervisión OEFA
 * Metodología: RIESGO = PROBABILIDAD × CONSECUENCIA
 * 
 * Basado en el Sistema Nacional de Información Ambiental (SINIA)
 */

// =============================================================================
// CUADRO N° 1: PROBABILIDAD DE OCURRENCIA
// =============================================================================
export const PROBABILIDAD_OPTIONS = [
  { value: 5, label: 'Muy probable', descripcion: 'Se estima que ocurra de manera continua o diaria' },
  { value: 4, label: 'Altamente probable', descripcion: 'Se estima que pueda suceder dentro de una semana' },
  { value: 3, label: 'Probable', descripcion: 'Se estima que pueda suceder dentro de un mes' },
  { value: 2, label: 'Posible', descripcion: 'Se estima que pueda suceder dentro de un año' },
  { value: 1, label: 'Poco probable', descripcion: 'Se estima que pueda suceder en un periodo mayor a un año' },
]

// =============================================================================
// CUADRO N° 2 y 6: CANTIDAD (igual para entorno humano y natural)
// =============================================================================
export const CANTIDAD_CRITERIOS = {
  toneladas: [
    { value: 4, label: '> 5 Tn', min: 5.001, max: Infinity },
    { value: 3, label: '> 2 y ≤ 5 Tn', min: 2.001, max: 5 },
    { value: 2, label: '> 1 y ≤ 2 Tn', min: 1.001, max: 2 },
    { value: 1, label: '≤ 1 Tn', min: 0, max: 1 },
  ],
  volumen: [
    { value: 4, label: '> 50 m³', min: 50.001, max: Infinity },
    { value: 3, label: '> 10 y ≤ 50 m³', min: 10.001, max: 50 },
    { value: 2, label: '> 5 y ≤ 10 m³', min: 5.001, max: 10 },
    { value: 1, label: '≤ 5 m³', min: 0, max: 5 },
  ],
  excesoNorma: [
    { value: 4, label: 'Desde 100% a más', min: 100, max: Infinity },
    { value: 3, label: 'Desde 50% y menor de 100%', min: 50, max: 99.999 },
    { value: 2, label: 'Desde 10% y menor de 50%', min: 10, max: 49.999 },
    { value: 1, label: 'Mayor a 0% y menor de 10%', min: 0.001, max: 9.999 },
  ],
  incumplimiento: [
    { value: 4, label: 'Desde 50% hasta 100%', min: 50, max: 100 },
    { value: 3, label: 'Desde 25% y menor de 50%', min: 25, max: 49.999 },
    { value: 2, label: 'Desde 10% y menor de 25%', min: 10, max: 24.999 },
    { value: 1, label: 'Mayor a 0% y menor de 10%', min: 0.001, max: 9.999 },
  ],
}

// =============================================================================
// CUADRO N° 3 y 7: PELIGROSIDAD (igual para entorno humano y natural)
// =============================================================================
export const PELIGROSIDAD_CARACTERISTICA = [
  { 
    value: 4, 
    label: 'Muy peligrosa', 
    descripcion: 'Muy inflamable, tóxica, causa efectos irreversibles y/o inmediatos'
  },
  { 
    value: 3, 
    label: 'Peligrosa', 
    descripcion: 'Explosiva, inflamable, corrosiva'
  },
  { 
    value: 2, 
    label: 'Poco peligrosa', 
    descripcion: 'Combustible'
  },
  { 
    value: 1, 
    label: 'No peligrosa', 
    descripcion: 'Daños leves y reversibles'
  },
]

export const PELIGROSIDAD_AFECTACION = [
  { 
    value: 4, 
    label: 'Muy alto', 
    descripcion: 'Irreversible y de gran magnitud'
  },
  { 
    value: 3, 
    label: 'Alto', 
    descripcion: 'Irreversible y de mediana magnitud'
  },
  { 
    value: 2, 
    label: 'Medio', 
    descripcion: 'Reversible y de mediana magnitud'
  },
  { 
    value: 1, 
    label: 'Bajo', 
    descripcion: 'Reversible y de baja magnitud'
  },
]

// =============================================================================
// CUADRO N° 4 y 8: EXTENSIÓN (igual para entorno humano y natural)
// =============================================================================
export const EXTENSION_CRITERIOS = {
  radio: [
    { value: 4, label: 'Muy extenso', descripcion: 'Radio mayor a 1 km', min: 1.001, max: Infinity },
    { value: 3, label: 'Extenso', descripcion: 'Radio hasta 1 km', min: 0.501, max: 1 },
    { value: 2, label: 'Poco extenso', descripcion: 'Radio hasta 0.5 km', min: 0.101, max: 0.5 },
    { value: 1, label: 'Puntual', descripcion: 'Radio hasta 0.1 km', min: 0, max: 0.1 },
  ],
  area: [
    { value: 4, label: 'Muy extenso', descripcion: '> 10,000 m²', min: 10001, max: Infinity },
    { value: 3, label: 'Extenso', descripcion: '> 1,000 y ≤ 10,000 m²', min: 1001, max: 10000 },
    { value: 2, label: 'Poco extenso', descripcion: '> 500 y ≤ 1,000 m²', min: 501, max: 1000 },
    { value: 1, label: 'Puntual', descripcion: '≤ 500 m²', min: 0, max: 500 },
  ],
}

// =============================================================================
// CUADRO N° 5: PERSONAS POTENCIALMENTE EXPUESTAS (solo entorno humano)
// =============================================================================
export const PERSONAS_EXPUESTAS = [
  { value: 4, label: 'Muy alto', descripcion: 'Más de 100 personas', min: 101, max: Infinity },
  { value: 3, label: 'Alto', descripcion: 'Entre 50 y 100 personas', min: 50, max: 100 },
  { value: 2, label: 'Bajo', descripcion: 'Entre 5 y 49 personas', min: 5, max: 49 },
  { value: 1, label: 'Muy bajo', descripcion: 'Menos de 5 personas', min: 0, max: 4 },
]

// =============================================================================
// CUADRO N° 9: MEDIO POTENCIALMENTE AFECTADO (solo entorno natural)
// =============================================================================
export const MEDIO_AFECTADO = [
  { 
    value: 4, 
    label: 'Área Natural Protegida (ANP)', 
    descripcion: 'ANP de administración nacional, regional y privada, zonas de amortiguamiento o ecosistemas frágiles'
  },
  { 
    value: 3, 
    label: 'Área fuera de ANP', 
    descripcion: 'Área fuera del ANP de administración nacional, regional y privada; o de zonas de amortiguamiento o ecosistemas frágiles'
  },
  { 
    value: 2, 
    label: 'Agrícola', 
    descripcion: 'Zona de uso agrícola'
  },
  { 
    value: 1, 
    label: 'Industrial', 
    descripcion: 'Zona industrial'
  },
]

// =============================================================================
// CUADROS N° 10 y 11: MAPEO DE PUNTUACIÓN A CONSECUENCIA (igual para ambos entornos)
// =============================================================================
export const CONSECUENCIA_MAPPING = [
  { valor: 5, condicion: 'Crítica', min: 18, max: 20 },
  { valor: 4, condicion: 'Grave', min: 15, max: 17 },
  { valor: 3, condicion: 'Moderada', min: 11, max: 14 },
  { valor: 2, condicion: 'Leve', min: 8, max: 10 },
  { valor: 1, condicion: 'No relevante', min: 5, max: 7 },
]

// =============================================================================
// CUADRO N° 12: NIVEL DE RIESGO
// =============================================================================
export const NIVEL_RIESGO_MAPPING = [
  { nivel: 'SIGNIFICATIVO', label: 'Riesgo significativo', min: 16, max: 25, color: 'red' },
  { nivel: 'MODERADO', label: 'Riesgo moderado', min: 6, max: 15, color: 'orange' },
  { nivel: 'LEVE', label: 'Riesgo leve', min: 1, max: 5, color: 'green' },
]

// =============================================================================
// MAPEO DE NIVEL DE RIESGO A TIPO DE INCUMPLIMIENTO (regla de negocio)
// =============================================================================
export const INCUMPLIMIENTO_MAPPING = {
  'SIGNIFICATIVO': { tipo: 'INCUMPLIMIENTO_SIGNIFICATIVO', label: 'Incumplimiento significativo/grave' },
  'MODERADO': { tipo: 'INCUMPLIMIENTO_MODERADO', label: 'Incumplimiento moderado' },
  'LEVE': { tipo: 'INCUMPLIMIENTO_LEVE', label: 'Incumplimiento leve' },
}

// =============================================================================
// FUNCIONES DE CÁLCULO
// =============================================================================

/**
 * Calcula el valor de CANTIDAD basado en los datos de entrada
 * Toma el valor más alto entre las variables disponibles
 * @param {Object} datos - { toneladas, volumen, excesoNorma, incumplimiento }
 * @returns {number} Valor de 1-4, o 0 si no hay datos
 */
export function calcularValorCantidad(datos) {
  const valores = []
  
  // Evaluar toneladas
  if (datos.toneladas !== null && datos.toneladas !== undefined && datos.toneladas !== '') {
    const tn = parseFloat(datos.toneladas)
    if (!isNaN(tn)) {
      const match = CANTIDAD_CRITERIOS.toneladas.find(c => tn >= c.min && tn <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  // Evaluar volumen
  if (datos.volumen !== null && datos.volumen !== undefined && datos.volumen !== '') {
    const vol = parseFloat(datos.volumen)
    if (!isNaN(vol)) {
      const match = CANTIDAD_CRITERIOS.volumen.find(c => vol >= c.min && vol <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  // Evaluar % exceso de norma
  if (datos.excesoNorma !== null && datos.excesoNorma !== undefined && datos.excesoNorma !== '') {
    const exc = parseFloat(datos.excesoNorma)
    if (!isNaN(exc) && exc > 0) {
      const match = CANTIDAD_CRITERIOS.excesoNorma.find(c => exc >= c.min && exc <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  // Evaluar % incumplimiento
  if (datos.incumplimiento !== null && datos.incumplimiento !== undefined && datos.incumplimiento !== '') {
    const inc = parseFloat(datos.incumplimiento)
    if (!isNaN(inc) && inc > 0) {
      const match = CANTIDAD_CRITERIOS.incumplimiento.find(c => inc >= c.min && inc <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  // Retornar el máximo, o 0 si no hay valores
  return valores.length > 0 ? Math.max(...valores) : 0
}

/**
 * Calcula el valor de PELIGROSIDAD
 * Toma el mayor entre característica intrínseca y grado de afectación
 * @param {Object} datos - { caracteristica: number, afectacion: number }
 * @returns {number} Valor de 1-4, o 0 si no hay datos
 */
export function calcularValorPeligrosidad(datos) {
  const valores = []
  
  if (datos.caracteristica && datos.caracteristica > 0) {
    valores.push(datos.caracteristica)
  }
  
  if (datos.afectacion && datos.afectacion > 0) {
    valores.push(datos.afectacion)
  }
  
  return valores.length > 0 ? Math.max(...valores) : 0
}

/**
 * Calcula el valor de EXTENSIÓN
 * Toma el mayor entre radio y área
 * @param {Object} datos - { radio: number (km), area: number (m²) }
 * @returns {number} Valor de 1-4, o 0 si no hay datos
 */
export function calcularValorExtension(datos) {
  const valores = []
  
  // Evaluar radio (km)
  if (datos.radio !== null && datos.radio !== undefined && datos.radio !== '') {
    const rad = parseFloat(datos.radio)
    if (!isNaN(rad) && rad >= 0) {
      const match = EXTENSION_CRITERIOS.radio.find(c => rad >= c.min && rad <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  // Evaluar área (m²)
  if (datos.area !== null && datos.area !== undefined && datos.area !== '') {
    const ar = parseFloat(datos.area)
    if (!isNaN(ar) && ar >= 0) {
      const match = EXTENSION_CRITERIOS.area.find(c => ar >= c.min && ar <= c.max)
      if (match) valores.push(match.value)
    }
  }
  
  return valores.length > 0 ? Math.max(...valores) : 0
}

/**
 * Calcula el valor de PERSONAS POTENCIALMENTE EXPUESTAS (solo entorno humano)
 * @param {number} cantidad - Número de personas
 * @returns {number} Valor de 1-4, o 0 si no hay datos
 */
export function calcularPersonasPotencialmenteExpuestas(cantidad) {
  if (cantidad === null || cantidad === undefined || cantidad === '') return 0
  
  const n = parseInt(cantidad)
  if (isNaN(n) || n < 0) return 0
  
  const match = PERSONAS_EXPUESTAS.find(c => n >= c.min && n <= c.max)
  return match ? match.value : 0
}

/**
 * Calcula el valor de MEDIO POTENCIALMENTE AFECTADO (solo entorno natural)
 * @param {number} tipoMedio - Valor de 1-4
 * @returns {number} Valor de 1-4, o 0 si no hay datos
 */
export function calcularMedioPotencialmenteAfectado(tipoMedio) {
  if (!tipoMedio || tipoMedio < 1 || tipoMedio > 4) return 0
  return tipoMedio
}

/**
 * Mapea la puntuación total a un valor de CONSECUENCIA (1-5)
 * @param {number} score - Puntuación total (5-20)
 * @returns {Object} { valor: 1-5, condicion: string }
 */
export function mapearPuntuacionAConsecuencia(score) {
  if (score < 5 || score > 20) {
    return { valor: 0, condicion: 'Inválido' }
  }
  
  const match = CONSECUENCIA_MAPPING.find(c => score >= c.min && score <= c.max)
  return match ? { valor: match.valor, condicion: match.condicion } : { valor: 0, condicion: 'Inválido' }
}

/**
 * Mapea el valor de PROBABILIDAD a un valor 1-5
 * @param {number} valorProb - Valor de probabilidad seleccionado
 * @returns {number} Valor de 1-5
 */
export function mapearProbabilidad(valorProb) {
  if (!valorProb || valorProb < 1 || valorProb > 5) return 0
  return valorProb
}

/**
 * Mapea el valor de RIESGO a un NIVEL DE RIESGO
 * @param {number} riesgoValor - Valor de riesgo (1-25)
 * @returns {Object} { nivel: string, label: string, color: string }
 */
export function mapearRiesgoANivel(riesgoValor) {
  if (riesgoValor < 1 || riesgoValor > 25) {
    return { nivel: 'INVALIDO', label: 'Valor inválido', color: 'gray' }
  }
  
  const match = NIVEL_RIESGO_MAPPING.find(n => riesgoValor >= n.min && riesgoValor <= n.max)
  return match || { nivel: 'INVALIDO', label: 'Valor inválido', color: 'gray' }
}

/**
 * Mapea el NIVEL DE RIESGO a un TIPO DE INCUMPLIMIENTO
 * @param {string} nivelRiesgo - 'LEVE', 'MODERADO', 'SIGNIFICATIVO'
 * @returns {Object} { tipo: string, label: string }
 */
export function mapearNivelAIncumplimiento(nivelRiesgo) {
  return INCUMPLIMIENTO_MAPPING[nivelRiesgo] || { tipo: 'DESCONOCIDO', label: 'Desconocido' }
}

/**
 * ALGORITMO PRINCIPAL: Calcula el riesgo ambiental completo
 * @param {Object} params - Todos los parámetros de entrada
 * @returns {Object} Resultado completo del cálculo
 */
export function calcularRiesgoAmbiental({
  entorno, // 'NATURAL' | 'HUMANO'
  cantidad, // { toneladas, volumen, excesoNorma, incumplimiento }
  peligrosidad, // { caracteristica, afectacion }
  extension, // { radio, area }
  personasExpuestas, // número (solo entorno humano)
  medioAfectado, // 1-4 (solo entorno natural)
  probabilidadValor, // 1-5
}) {
  // 1. Calcular valores de factores
  const valorCantidad = calcularValorCantidad(cantidad)
  const valorPeligrosidad = calcularValorPeligrosidad(peligrosidad)
  const valorExtension = calcularValorExtension(extension)
  
  // 2. Calcular factor específico del entorno
  let valorFactorEntorno = 0
  let nombreFactorEntorno = ''
  
  if (entorno === 'HUMANO') {
    valorFactorEntorno = calcularPersonasPotencialmenteExpuestas(personasExpuestas)
    nombreFactorEntorno = 'Personas potencialmente expuestas'
  } else if (entorno === 'NATURAL') {
    valorFactorEntorno = calcularMedioPotencialmenteAfectado(medioAfectado)
    nombreFactorEntorno = 'Medio potencialmente afectado'
  }
  
  // 3. Calcular score según fórmula
  // Score = Cantidad + 2*Peligrosidad + Extensión + FactorEntorno
  const score = valorCantidad + (2 * valorPeligrosidad) + valorExtension + valorFactorEntorno
  
  // 4. Mapear score a consecuencia
  const consecuencia = mapearPuntuacionAConsecuencia(score)
  
  // 5. Obtener probabilidad
  const probabilidad = mapearProbabilidad(probabilidadValor)
  
  // 6. Calcular riesgo
  const riesgoValor = probabilidad * consecuencia.valor
  
  // 7. Obtener nivel de riesgo
  const nivelRiesgo = mapearRiesgoANivel(riesgoValor)
  
  // 8. Obtener tipo de incumplimiento
  const tipoIncumplimiento = mapearNivelAIncumplimiento(nivelRiesgo.nivel)
  
  // Retornar resultado completo
  return {
    // Inputs procesados
    entorno,
    factores: {
      cantidad: valorCantidad,
      peligrosidad: valorPeligrosidad,
      extension: valorExtension,
      factorEntorno: {
        nombre: nombreFactorEntorno,
        valor: valorFactorEntorno
      }
    },
    
    // Cálculos intermedios
    score, // Puntuación total (5-20)
    formula: `${valorCantidad} + 2×${valorPeligrosidad} + ${valorExtension} + ${valorFactorEntorno} = ${score}`,
    
    // Consecuencia
    consecuencia: {
      valor: consecuencia.valor,
      condicion: consecuencia.condicion
    },
    
    // Probabilidad
    probabilidad: {
      valor: probabilidad,
      label: PROBABILIDAD_OPTIONS.find(p => p.value === probabilidad)?.label || 'Desconocido'
    },
    
    // Riesgo final
    riesgo: {
      valor: riesgoValor,
      formula: `${probabilidad} × ${consecuencia.valor} = ${riesgoValor}`,
      nivel: nivelRiesgo.nivel,
      label: nivelRiesgo.label,
      color: nivelRiesgo.color
    },
    
    // Tipo de incumplimiento
    incumplimiento: tipoIncumplimiento,
    
    // Validación
    isValid: valorCantidad > 0 && valorPeligrosidad > 0 && valorExtension > 0 && valorFactorEntorno > 0 && probabilidad > 0
  }
}

/**
 * Obtiene el color de badge según el valor (1-4)
 */
export function getFactorBadgeColor(valor) {
  switch (valor) {
    case 4: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 3: return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 2: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 1: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    default: return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
  }
}

/**
 * Obtiene el color del nivel de riesgo
 */
export function getRiskLevelColor(nivel) {
  switch (nivel) {
    case 'SIGNIFICATIVO': return 'bg-red-500 text-white'
    case 'MODERADO': return 'bg-orange-500 text-white'
    case 'LEVE': return 'bg-green-500 text-white'
    default: return 'bg-slate-400 text-white'
  }
}

/**
 * Obtiene el color del badge de consecuencia
 */
export function getConsequenceBadgeColor(valor) {
  switch (valor) {
    case 5: return 'bg-red-600 text-white'
    case 4: return 'bg-red-500 text-white'
    case 3: return 'bg-orange-500 text-white'
    case 2: return 'bg-yellow-500 text-white'
    case 1: return 'bg-green-500 text-white'
    default: return 'bg-slate-400 text-white'
  }
}
