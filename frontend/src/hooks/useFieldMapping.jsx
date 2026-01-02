import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Hook para gestionar el mapeo de campos centralizado desde Supabase
 * Este hook sincroniza los nombres de columnas de Survey123 con las variables internas de la app
 * 
 * @returns {Object} - Objeto con el mapeo de campos y funciones de utilidad
 */
export function useFieldMapping() {
  const [fieldMappings, setFieldMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  /**
   * Obtiene el mapeo de campos desde el servidor
   */
  const fetchFieldMappings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_URL}/api/configuration/field-mapping`);

      if (response.data.field_mappings) {
        setFieldMappings(response.data.field_mappings);
        setLastFetch(new Date());
      }
    } catch (err) {
      console.error('Error al obtener mapeo de campos:', err);
      setError(err.response?.data?.error || 'Error al cargar configuración');

      // Fallback a mapeo por defecto en caso de error - FORMULARIO 2026
      setFieldMappings({
        // Datos generales
        fecha_hora: 'fecha_hora',
        supervisor: 'supervisor',
        ca: 'ca',
        otro_ca: 'otro_ca',
        modalidad: 'modalidad',
        actividad: 'actividad',
        tipo_componente: 'tipo_componente',
        componente: 'componente',
        instalacion_referencia: 'instalacion_referencia',
        nom_pto_ppc: 'nom_pto_ppc',
        num_pto_muestreo: 'num_pto_muestreo',
        nom_pto_muestreo: 'nom_pto_muestreo',

        // Localización
        norte: 'norte',
        este: 'este',
        zona: 'zona',
        datum: 'datum',
        altitud: 'altitud',

        // Multimedia (solo primera instancia como ejemplo)
        foto_1: 'foto_1',
        descrip_1: 'descrip_1',
        hecho_detec_1: 'hecho_detec_1',

        // Geoespacial
        geo_pregunta: 'geo_pregunta',
        geo_area_1: 'geo_area_1',
        geo_longitud_1: 'geo_longitud_1',
        geo_punto_1: 'geo_punto_1',

        // Sistema
        globalid: 'GlobalID'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar mapeo al montar el componente
  useEffect(() => {
    fetchFieldMappings();
  }, [fetchFieldMappings]);

  /**
   * Obtiene el nombre de columna de Survey123 para un campo interno
   * @param {string} internalField - Nombre interno del campo (ej: 'codigo_accion')
   * @returns {string} - Nombre de columna en Survey123 (ej: 'CODIGO_ACCION')
   */
  const getSurveyColumn = useCallback((internalField) => {
    return fieldMappings[internalField] || internalField;
  }, [fieldMappings]);

  /**
   * Obtiene el nombre interno desde un nombre de columna de Survey123
   * @param {string} surveyColumn - Nombre de columna en Survey123
   * @returns {string|null} - Nombre interno del campo o null si no existe
   */
  const getInternalField = useCallback((surveyColumn) => {
    const entry = Object.entries(fieldMappings).find(
      ([_, value]) => value === surveyColumn
    );
    return entry ? entry[0] : null;
  }, [fieldMappings]);

  /**
   * Transforma un objeto con nombres de columnas de Survey123 a nombres internos
   * @param {Object} surveyData - Objeto con datos de Survey123
   * @returns {Object} - Objeto con campos internos
   */
  const transformToInternal = useCallback((surveyData) => {
    const transformed = {};

    Object.entries(surveyData).forEach(([surveyKey, value]) => {
      const internalKey = getInternalField(surveyKey);
      if (internalKey) {
        transformed[internalKey] = value;
      } else {
        // Mantener campos no mapeados con su nombre original
        transformed[surveyKey] = value;
      }
    });

    return transformed;
  }, [getInternalField]);

  /**
   * Transforma un objeto con nombres internos a nombres de Survey123
   * @param {Object} internalData - Objeto con campos internos
   * @returns {Object} - Objeto con nombres de Survey123
   */
  const transformToSurvey = useCallback((internalData) => {
    const transformed = {};

    Object.entries(internalData).forEach(([internalKey, value]) => {
      const surveyKey = getSurveyColumn(internalKey);
      transformed[surveyKey] = value;
    });

    return transformed;
  }, [getSurveyColumn]);

  /**
   * Valida si todos los campos requeridos están mapeados
   * @param {Array<string>} requiredFields - Lista de campos internos requeridos
   * @returns {Object} - Objeto con validación { valid: boolean, missing: string[] }
   */
  const validateMapping = useCallback((requiredFields) => {
    const missing = requiredFields.filter(field => !fieldMappings[field]);

    return {
      valid: missing.length === 0,
      missing
    };
  }, [fieldMappings]);

  return {
    // Estado
    fieldMappings,
    loading,
    error,
    lastFetch,

    // Funciones de transformación
    getSurveyColumn,
    getInternalField,
    transformToInternal,
    transformToSurvey,
    validateMapping,

    // Funciones de gestión
    refresh: fetchFieldMappings
  };
}

/**
 * Campos requeridos por la aplicación
 * Esta constante lista todos los campos internos que DEBE tener la app
 * 
 * FORMULARIO 2026: Estructura actualizada para el nuevo formulario (Strict Schema)
 */
export const REQUIRED_INTERNAL_FIELDS = [
  // === DATOS GENERALES ===
  'objectid',
  'globalid',
  'fecha_hora',
  'supervisor',
  'ca',
  'modalidad',
  'actividad',
  'tipo_componente',
  'componente',

  // === LOCALIZACIÓN ===
  'norte',
  'este',
  'zona',
  'altitud',

  // === CAMPOS RELACIONADOS (Flattened) ===
  'descrip_1',
  'hecho_detec_1',
  'descrip_2'
];

/**
 * Configuración de campos con metadatos - FORMULARIO 2026
 * Estructura completa preparada para el nuevo formulario Survey123
 * Útil para construir UI de mapeo
 */
export const INTERNAL_FIELDS_METADATA = {
  // ========================================
  // SECCIÓN: IDENTIFICADORES
  // ========================================
  objectid: {
    label: 'Object ID',
    description: 'Identificador numérico único',
    required: true,
    type: 'number',
    category: 'sistema'
  },

  globalid: {
    label: 'Global ID',
    description: 'Identificador global único de ArcGIS',
    required: true,
    type: 'string',
    category: 'sistema'
  },

  // ========================================
  // SECCIÓN: DATOS GENERALES
  // ========================================

  fecha_hora: {
    label: 'Fecha y Hora',
    description: 'Fecha y hora del registro',
    required: true,
    type: 'datetime',
    category: 'datos_generales'
  },

  supervisor: {
    label: 'Supervisor',
    description: 'Supervisor responsable',
    required: true,
    type: 'string',
    category: 'datos_generales'
  },

  ca: {
    label: 'CA (Código de Acción)',
    description: 'Código de acción de supervisión',
    required: true,
    type: 'string',
    category: 'datos_generales'
  },

  otro_ca: {
    label: 'Otro Código CA',
    description: 'Código CA alternativo',
    required: false,
    type: 'string',
    category: 'datos_generales'
  },

  modalidad: {
    label: 'Modalidad',
    description: 'Modalidad de supervisión',
    required: true,
    type: 'string',
    category: 'datos_generales'
  },

  actividad: {
    label: 'Actividad',
    description: 'Actividad realizada',
    required: true,
    type: 'string',
    category: 'datos_generales'
  },

  tipo_componente: {
    label: 'Tipo de Componente',
    description: 'Clasificación del componente',
    required: true,
    type: 'string',
    category: 'datos_generales'
  },

  componente: {
    label: 'Componente',
    description: 'Nombre del componente',
    required: false,
    type: 'string',
    category: 'datos_generales'
  },

  instalacion_referencia: {
    label: 'Instalación Referencia',
    description: 'Instalación de referencia',
    required: false,
    type: 'string',
    category: 'datos_generales'
  },

  nom_pto_ppc: {
    label: 'Nombre Punto PPC',
    description: 'Nombre del punto PPC',
    required: false,
    type: 'string',
    category: 'datos_generales'
  },

  num_pto_muestreo: {
    label: 'Num Punto Muestreo',
    description: 'Número de punto de muestreo',
    required: false,
    type: 'number',
    category: 'datos_generales'
  },

  nom_pto_muestreo: {
    label: 'Nom Punto Muestreo',
    description: 'Nombre del punto de muestreo',
    required: false,
    type: 'string',
    category: 'datos_generales'
  },

  // ========================================
  // SECCIÓN: LOCALIZACIÓN
  // ========================================

  norte: {
    label: 'Norte',
    description: 'Coordenada Norte',
    required: true,
    type: 'number',
    category: 'localizacion'
  },

  este: {
    label: 'Este',
    description: 'Coordenada Este',
    required: true,
    type: 'number',
    category: 'localizacion'
  },

  zona: {
    label: 'Zona',
    description: 'Zona UTM',
    required: true,
    type: 'string',
    category: 'localizacion'
  },

  altitud: {
    label: 'Altitud',
    description: 'Altitud',
    required: true,
    type: 'number',
    category: 'localizacion'
  },

  // ========================================
  // SECCIÓN: CAMPOS RELACIONADOS (Flattened)
  // ========================================

  descrip_1: {
    label: 'Descripción 1 (Layer 1)',
    description: 'Descripción desde Layer 1',
    required: false,
    type: 'string',
    category: 'relacionados'
  },

  hecho_detec_1: {
    label: 'Hecho Detectado 1 (Layer 2)',
    description: 'Hecho detectado desde Layer 2',
    required: false,
    type: 'string',
    category: 'relacionados'
  },

  descrip_2: {
    label: 'Descripción 2 (Layer 2)',
    description: 'Descripción adicional desde Layer 2',
    required: false,
    type: 'string',
    category: 'relacionados'
  },

  guid: {
    label: 'GUID',
    description: 'GUID de relación',
    required: false,
    type: 'string',
    category: 'relacionados'
  },

  // ========================================
  // SECCIÓN: AUDITORÍA
  // ========================================

  created_user: {
    label: 'Created User',
    description: 'Usuario creador',
    required: false,
    type: 'string',
    category: 'auditoria'
  },

  created_date: {
    label: 'Created Date',
    description: 'Fecha de creación',
    required: false,
    type: 'datetime',
    category: 'auditoria'
  },

  last_edited_user: {
    label: 'Last Edited User',
    description: 'Usuario última edición',
    required: false,
    type: 'string',
    category: 'auditoria'
  },

  last_edited_date: {
    label: 'Last Edited Date',
    description: 'Fecha última edición',
    required: false,
    type: 'datetime',
    category: 'auditoria'
  }
};
