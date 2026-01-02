import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';
import configService from '../services/configService.js';
import { getToken } from '../lib/arcgisClient.js';

const router = express.Router();

// Cliente Supabase Admin (solo para operaciones directas)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Middleware para validar que Supabase esté configurado
const requireSupabase = (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: 'Servicio de configuración no disponible',
      details: 'Supabase no está configurado. Contacte al administrador.'
    });
  }
  next();
};

/**
 * GET /api/configuration
 * Obtiene la configuración global de la aplicación
 * Requiere: SuperAdmin (usuarios normales NO deben ver la URL)
 * IMPORTANTE: Solo superadmins pueden ver la URL completa de Survey123
 */
router.get('/', authenticate, requireSuperAdmin, requireSupabase, async (req, res) => {
  try {
    const config = await configService.getConfiguration();
    res.json(config);
  } catch (error) {
    console.error('[configuration] Error al obtener configuración:', error);
    res.status(500).json({
      error: 'Error al obtener configuración',
      details: error.message
    });
  }
});

/**
 * POST /api/configuration
 * Actualiza la configuración global de la aplicación
 * Requiere: SuperAdmin
 */
router.post('/', authenticate, requireSuperAdmin, requireSupabase, async (req, res) => {
  try {
    const {
      survey123_url,
      survey123_service_url,
      survey123_feature_service_url,
      field_mappings,
      photo_attachment_config,
      last_sync_columns,
      acta_decenio,
      acta_anio
    } = req.body;

    // Validar que se envíe al menos un campo para actualizar
    if (!survey123_url && !field_mappings && !photo_attachment_config && !last_sync_columns && !acta_decenio && !acta_anio) {
      return res.status(400).json({
        error: 'Debe proporcionar al menos un campo para actualizar'
      });
    }

    // Preparar objeto de actualización
    const updates = {};

    if (survey123_url !== undefined) updates.survey123_url = survey123_url;
    if (req.body.survey123_layer1_url !== undefined) updates.survey123_layer1_url = req.body.survey123_layer1_url;
    if (req.body.survey123_layer2_url !== undefined) updates.survey123_layer2_url = req.body.survey123_layer2_url;
    if (survey123_service_url !== undefined) updates.survey123_service_url = survey123_service_url;
    if (survey123_feature_service_url !== undefined) updates.survey123_feature_service_url = survey123_feature_service_url;
    if (field_mappings !== undefined) updates.field_mappings = field_mappings;
    if (photo_attachment_config !== undefined) updates.photo_attachment_config = photo_attachment_config;
    if (last_sync_columns !== undefined) {
      updates.last_sync_columns = last_sync_columns;
      updates.last_sync_at = new Date().toISOString();
    }
    if (acta_decenio !== undefined) updates.acta_decenio = acta_decenio;
    if (acta_anio !== undefined) updates.acta_anio = acta_anio;

    // Usar el servicio centralizado para actualizar
    const result = await configService.updateConfiguration(updates, req.user.id);

    res.json({
      success: true,
      message: 'Configuración actualizada correctamente',
      data: result
    });
  } catch (error) {
    console.error('[configuration] Error al actualizar configuración:', error);
    res.status(500).json({
      error: 'Error al actualizar configuración',
      details: error.message
    });
  }
});

/**
 * POST /api/configuration/sync
 * Sincroniza con Survey123 para obtener estructura de columnas
 * Requiere: SuperAdmin
 */
router.post('/sync', authenticate, requireSuperAdmin, requireSupabase, async (req, res) => {
  try {
    const { survey123_url } = req.body;

    if (!survey123_url) {
      return res.status(400).json({
        error: 'Se requiere survey123_url para sincronizar'
      });
    }

    // Hacer petición a ArcGIS para obtener la estructura
    console.log('[configuration/sync] 🔄 Consultando Survey123:', survey123_url);

    // Obtener token de autenticación si está disponible
    const token = await getToken();
    console.log('[configuration/sync] 🔐 Token obtenido:', token ? 'Sí' : 'No (acceso público)');

    // Construir URL con token si existe
    // Helper function to fetch fields from a URL
    const fetchLayerFields = async (url, layerName) => {
      try {
        let queryUrl = `${url}/query?where=1%3D1&returnGeometry=false&outFields=*&f=json&resultRecordCount=1`;
        if (token) {
          queryUrl += `&token=${encodeURIComponent(token)}`;
        }
        console.log(`[configuration/sync] 🔄 Consultando ${layerName}:`, url);
        const response = await fetch(queryUrl);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return (data.fields || []).map(field => ({
          name: field.name,
          alias: field.alias || field.name,
          type: field.type,
          length: field.length,
          layer: layerName // Add layer info
        }));
      } catch (e) {
        console.warn(`[configuration/sync] ⚠️ Error fetching ${layerName}:`, e.message);
        return [];
      }
    };

    // Derive URLs for layers 1 and 2
    // Assuming survey123_url ends in /0 or just the service URL
    let baseUrl = survey123_url.trim();
    if (baseUrl.match(/\/\d+$/)) {
      baseUrl = baseUrl.replace(/\/\d+$/, '');
    }
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');

    const url0 = `${baseUrl}/0`;
    const url1 = `${baseUrl}/1`;
    const url2 = `${baseUrl}/2`;

    // Fetch all concurrently
    const [fields0, fields1, fields2] = await Promise.all([
      fetchLayerFields(url0, 'Layer 0'),
      fetchLayerFields(url1, 'Layer 1'),
      fetchLayerFields(url2, 'Layer 2')
    ]);

    console.log(`[configuration/sync] 📦 Campos encontrados: L0=${fields0.length}, L1=${fields1.length}, L2=${fields2.length}`);

    // Combine fields, prioritizing Layer 0 but including unique fields from others
    const allFieldsMap = new Map();

    // Helper to add fields
    const addFields = (fields) => {
      fields.forEach(f => {
        if (!allFieldsMap.has(f.name)) {
          allFieldsMap.set(f.name, f);
        }
      });
    };

    addFields(fields0);
    addFields(fields1);
    addFields(fields2);

    const columns = Array.from(allFieldsMap.values());

    // Obtener configuración actual para comparar
    const currentConfig = await configService.getConfiguration();
    const currentMappings = currentConfig?.field_mappings || {};
    const lastSyncColumns = currentConfig?.last_sync_columns || [];

    // Detectar cambios
    const lastColumnNames = lastSyncColumns.map(c => c.name);
    const currentColumnNames = columns.map(c => c.name);

    const newColumns = columns.filter(c => !lastColumnNames.includes(c.name));
    const removedColumns = lastSyncColumns.filter(c => !currentColumnNames.includes(c.name));
    const unchangedColumns = columns.filter(c => lastColumnNames.includes(c.name));

    // Identificar columnas mapeadas que ya no existen
    const orphanedMappings = Object.entries(currentMappings)
      .filter(([internalKey, survey123Column]) => !currentColumnNames.includes(survey123Column))
      .map(([internalKey, survey123Column]) => ({
        internalKey,
        missingColumn: survey123Column
      }));

    res.json({
      success: true,
      columns,
      changes: {
        new: newColumns,
        removed: removedColumns,
        unchanged: unchangedColumns.length,
        orphanedMappings
      },
      totalColumns: columns.length
    });
  } catch (error) {
    console.error('Error al sincronizar con Survey123:', error);
    res.status(500).json({
      error: 'Error al sincronizar con Survey123',
      details: error.message
    });
  }
});

/**
 * GET /api/configuration/acta-header
 * Obtiene la configuración del header del acta (decenio y año)
 * Requiere: Usuario autenticado
 * NOTA: Endpoint público para que todos los usuarios puedan generar actas
 */
router.get('/acta-header', authenticate, requireSupabase, async (req, res) => {
  try {
    const headerConfig = await configService.getActaHeaderConfig();
    res.json(headerConfig);
  } catch (error) {
    console.error('[configuration] Error al obtener config del header:', error);
    res.status(500).json({
      error: 'Error al obtener configuración del header',
      details: error.message
    });
  }
});

/**
 * GET /api/configuration/field-mapping
 * Obtiene el mapeo de campos actual
 * Requiere: Usuario autenticado
 * NOTA: Usuarios normales pueden ver el mapeo de campos (no incluye URL sensible)
 */
router.get('/field-mapping', authenticate, requireSupabase, async (req, res) => {
  try {
    const fieldMappings = await configService.getFieldMappings();
    res.json({
      field_mappings: fieldMappings
    });
  } catch (error) {
    console.error('[configuration] Error al obtener mapeo de campos:', error);
    res.status(500).json({
      error: 'Error al obtener mapeo de campos',
      details: error.message
    });
  }
});

export default router;
