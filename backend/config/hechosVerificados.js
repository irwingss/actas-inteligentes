/**
 * Lista completa de Hechos Verificados de Survey123
 * 
 * Estos son los únicos valores válidos que pueden venir del campo HECHO_DETEC_1
 * de ArcGIS Survey123. Cualquier otro valor es inválido.
 * 
 * NOTA: Survey123 puede enviar estos valores duplicados (bug conocido)
 * Ejemplo: "A. Acciones de primera respuesta.A. Acciones de primera respuesta."
 * La normalización debe manejar este caso.
 */

export const HECHOS_VERIFICADOS = [
  { codigo: 'A', nombre: 'A. Acciones de primera respuesta.' },
  { codigo: 'B', nombre: 'B. Almacenamiento de hidrocarburos.' },
  { codigo: 'C', nombre: 'C. Almacenamiento de residuos sólidos.' },
  { codigo: 'D', nombre: 'D. Almacenamiento de sustancias químicas.' },
  { codigo: 'E', nombre: 'E. Área estanca.' },
  { codigo: 'F', nombre: 'F. Áreas impactadas (suelo, agua, sedimento, otros con hidrocarburos).' },
  { codigo: 'G', nombre: 'G. Comunicación de la Culminación de Perforación de Pozos (art. 77 del RPAAH).' },
  { codigo: 'H', nombre: 'H. Componente sin IGA.' },
  { codigo: 'I', nombre: 'I. Disposición Final de residuos sólidos.' },
  { codigo: 'J', nombre: 'J. Falta de mantenimiento.' },
  { codigo: 'K', nombre: 'K. Limpieza del área afectada.' },
  { codigo: 'L', nombre: 'L. Medidas de prevención.' },
  { codigo: 'M', nombre: 'M. Presunta excedencia del ECA Ruido.' },
  { codigo: 'N', nombre: 'N. Reporte de emergencia ambiental.' },
  { codigo: 'Ñ', nombre: 'Ñ. Instalaciones inoperativas por más de 1 año.' },
  { codigo: 'O', nombre: 'O. Sin Hallazgo.' },
  { codigo: 'P', nombre: 'P. Transporte de residuos sólidos.' },
  { codigo: 'Q', nombre: 'Q. Vertimiento de Efluentes.' },
  { codigo: 'R', nombre: 'R. Verificar el cumplimiento del IGA.' },
  { codigo: 'S', nombre: 'S. Otros Aspectos.' }
];

// Mapa para búsqueda rápida por código
export const HECHOS_BY_CODIGO = HECHOS_VERIFICADOS.reduce((acc, h) => {
  acc[h.codigo] = h;
  return acc;
}, {});

// Mapa para búsqueda rápida por nombre completo (normalizado a minúsculas)
export const HECHOS_BY_NOMBRE = HECHOS_VERIFICADOS.reduce((acc, h) => {
  acc[h.nombre.toLowerCase()] = h;
  return acc;
}, {});

// Lista de códigos válidos
export const CODIGOS_VALIDOS = HECHOS_VERIFICADOS.map(h => h.codigo);

/**
 * Normaliza un nombre de hecho de Survey123
 * Maneja:
 * - Underscores -> espacios: "J._Falta_de_mantenimiento." -> "J. Falta de mantenimiento."
 * - Bug de duplicación: "X. Texto.X. Texto." -> "X. Texto."
 * - Punto final faltante
 * 
 * @param {string} hechoName - Nombre del hecho (posiblemente con _ y/o duplicado)
 * @returns {string} - Nombre normalizado limpio
 */
export function normalizeHechoName(hechoName) {
  if (!hechoName) return '';
  
  let normalized = String(hechoName).trim();
  
  // 1. Reemplazar underscores por espacios
  normalized = normalized.replace(/_/g, ' ');
  
  // 2. Normalizar espacios múltiples
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 3. Detectar y remover duplicación (el hecho aparece dos veces seguidas)
  // Patrón: "X. Texto.X. Texto." o "X. Texto. X. Texto."
  const halfLength = Math.floor(normalized.length / 2);
  const firstHalf = normalized.substring(0, halfLength).trim();
  const secondHalf = normalized.substring(halfLength).trim();
  
  if (firstHalf === secondHalf && firstHalf.length > 0) {
    normalized = firstHalf;
  }
  
  // 4. Asegurar que termine con punto
  if (normalized.length > 0 && !normalized.endsWith('.')) {
    normalized += '.';
  }
  
  return normalized;
}

/**
 * Extrae el código de letra de un hecho (A, B, ..., Ñ, ..., S)
 * 
 * @param {string} hechoName - Nombre del hecho
 * @returns {string} - Código de letra o cadena vacía
 */
export function getHechoCodigo(hechoName) {
  if (!hechoName) return '';
  const normalized = normalizeHechoName(hechoName);
  const match = normalized.match(/^([A-SÑ])\./i);
  return match ? match[1].toUpperCase() : '';
}

/**
 * Valida si un nombre de hecho es válido según la lista de Survey123
 * 
 * @param {string} hechoName - Nombre del hecho a validar
 * @returns {boolean} - true si es válido
 */
export function isHechoValido(hechoName) {
  const codigo = getHechoCodigo(hechoName);
  return CODIGOS_VALIDOS.includes(codigo);
}

/**
 * Obtiene el hecho canónico dado un nombre (posiblemente corrupto)
 * 
 * @param {string} hechoName - Nombre del hecho
 * @returns {object|null} - Objeto del hecho o null si no se encuentra
 */
export function getHechoCanonical(hechoName) {
  const codigo = getHechoCodigo(hechoName);
  return HECHOS_BY_CODIGO[codigo] || null;
}

export default {
  HECHOS_VERIFICADOS,
  HECHOS_BY_CODIGO,
  HECHOS_BY_NOMBRE,
  CODIGOS_VALIDOS,
  normalizeHechoName,
  getHechoCodigo,
  isHechoValido,
  getHechoCanonical
};
