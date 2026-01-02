/**
 * Mapeo centralizado de columnas de ArcGIS
 * 
 * ESTRICTAMENTE BASADO EN EL ESQUEMA JSON PROPORCIONADO (Layers 0, 1, 2)
 * No agregar campos que no existan en el servicio.
 */

const FIELD_MAPPING = {
  // ========================================
  // LAYER 0: Movil_sup_lotx (Puntos)
  // ========================================

  objectId: {
    primary: 'OBJECTID',
    fallbacks: [],
    alias: 'oidField',
    description: 'Identificador único del objeto'
  },

  globalId: {
    primary: 'GLOBALID',
    fallbacks: [],
    alias: 'globalidField',
    description: 'Identificador global único'
  },

  fecha: {
    primary: 'FECHA_HORA',
    fallbacks: [],
    alias: 'fecha',
    description: 'Fecha del registro'
  },

  nombreSupervisor: {
    primary: 'SUPERVISOR',
    fallbacks: [],
    alias: 'nombreSupervisor',
    description: 'Nombre del supervisor'
  },

  codigoAccion: {
    primary: 'CA',
    fallbacks: [],
    alias: 'codigoAccion',
    description: 'Código de acción (CA)'
  },

  otroCA: {
    primary: 'OTRO_CA',
    fallbacks: [],
    alias: 'otroCA',
    description: 'Otro Código de acción'
  },

  modalidad: {
    primary: 'MODALIDAD',
    fallbacks: [],
    alias: 'modalidad',
    description: 'Modalidad'
  },

  actividad: {
    primary: 'ACTIVIDAD',
    fallbacks: [],
    alias: 'actividad',
    description: 'Actividad'
  },

  componente: {
    primary: 'COMPONENTE',
    fallbacks: [],
    alias: 'componente',
    description: 'Componente'
  },

  instalacionReferencia: {
    primary: 'INSTALACION_REFERENCIA',
    fallbacks: [],
    alias: 'instalacionReferencia',
    description: 'Instalación de referencia'
  },

  nomPtoPpc: {
    primary: 'NOM_PTO_PPC',
    fallbacks: [],
    alias: 'nomPtoPpc',
    description: 'Nombre Punto PPC'
  },

  numPtoMuestreo: {
    primary: 'NUM_PTO_MUESTREO',
    fallbacks: [],
    alias: 'numPtoMuestreo',
    description: 'Número Punto Muestreo'
  },

  norte: {
    primary: 'NORTE',
    fallbacks: [],
    alias: 'norte',
    description: 'Coordenada Norte'
  },

  este: {
    primary: 'ESTE',
    fallbacks: [],
    alias: 'este',
    description: 'Coordenada Este'
  },

  zona: {
    primary: 'ZONA',
    fallbacks: [],
    alias: 'zona',
    description: 'Zona'
  },

  altitud: {
    primary: 'ALTITUD',
    fallbacks: [],
    alias: 'altitud',
    description: 'Altitud'
  },

  tipoComponente: {
    primary: 'TIPO_COMPONENTE',
    fallbacks: [],
    alias: 'tipoComponente',
    description: 'Tipo de Componente'
  },

  nomPtoMuestreo: {
    primary: 'NOM_PTO_MUESTREO',
    fallbacks: [],
    alias: 'nomPtoMuestreo',
    description: 'Nombre Punto Muestreo'
  },

  // System Fields Layer 0
  createdUser: {
    primary: 'CREATED_USER',
    fallbacks: [],
    alias: 'createdUser',
    description: 'Usuario creador'
  },

  createdDate: {
    primary: 'CREATED_DATE',
    fallbacks: [],
    alias: 'createdDate',
    description: 'Fecha creación'
  },

  lastEditedUser: {
    primary: 'LAST_EDITED_USER',
    fallbacks: [],
    alias: 'lastEditedUser',
    description: 'Usuario última edición'
  },

  lastEditedDate: {
    primary: 'LAST_EDITED_DATE',
    fallbacks: [],
    alias: 'lastEditedDate',
    description: 'Fecha última edición'
  },

  // ========================================
  // LAYER 1: Descripcion (Tabla)
  // ========================================

  descrip1: {
    primary: 'DESCRIP_1',
    fallbacks: [],
    alias: 'descrip1',
    description: 'Descripción 1 (Tabla Descripcion)'
  },

  guid: {
    primary: 'GUID',
    fallbacks: [],
    alias: 'guid',
    description: 'GUID para relación'
  },

  // ========================================
  // LAYER 2: Hechos (Tabla)
  // ========================================

  hechoDetec1: {
    primary: 'HECHO_DETEC_1',
    fallbacks: [],
    alias: 'hechoDetec1',
    description: 'Hecho Detectado 1 (Tabla Hechos)'
  },

  descrip2: {
    primary: 'DESCRIP_2',
    fallbacks: [],
    alias: 'descrip2',
    description: 'Descripción 2 (Tabla Hechos)'
  }
};

/**
 * Busca el nombre real de una columna en un array de headers
 */
function findFieldInHeaders(fieldKey, headers) {
  const mapping = FIELD_MAPPING[fieldKey];
  if (!mapping) return null;

  // Strict match only for primary
  if (headers.includes(mapping.primary)) return mapping.primary;

  return null;
}

/**
 * Busca el nombre real de una columna (Loose - Case Insensitive)
 */
function findFieldInHeadersLoose(fieldKey, headers) {
  const mapping = FIELD_MAPPING[fieldKey];
  if (!mapping) return null;

  const headersLower = headers.map(h => String(h || '').toLowerCase());
  const primaryLower = mapping.primary.toLowerCase();

  const index = headersLower.indexOf(primaryLower);
  if (index !== -1) return headers[index];

  return null;
}

function getPrimaryFieldName(fieldKey) {
  const mapping = FIELD_MAPPING[fieldKey];
  return mapping ? mapping.primary : fieldKey;
}

function getAllFieldNames(fieldKey) {
  const mapping = FIELD_MAPPING[fieldKey];
  if (!mapping) return [fieldKey];
  return [mapping.primary];
}

function getQueryFieldNames() {
  const fields = {};
  for (const key in FIELD_MAPPING) {
    fields[key] = FIELD_MAPPING[key].primary;
  }
  return fields;
}

export {
  FIELD_MAPPING,
  findFieldInHeaders,
  findFieldInHeadersLoose,
  getPrimaryFieldName,
  getAllFieldNames,
  getQueryFieldNames
};

export default FIELD_MAPPING;
