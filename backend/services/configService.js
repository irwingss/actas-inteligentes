import { createClient } from '@supabase/supabase-js';

// Cliente Supabase Admin (lazy initialization)
let supabaseAdmin = null;
let supabaseInitialized = false;

/**
 * Inicializa el cliente de Supabase de forma lazy
 * Se llama la primera vez que se necesita
 */
function getSupabaseClient() {
  if (supabaseInitialized) {
    return supabaseAdmin;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[configService] ⚠️  Supabase no configurado correctamente');
    console.error('[configService] NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
    console.error('[configService] SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    supabaseAdmin = null;
  } else {
    console.log('[configService] ✅ Supabase cliente inicializado');
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }

  supabaseInitialized = true;
  return supabaseAdmin;
}

/**
 * Cache en memoria para configuración
 * Evita queries constantes a Supabase
 */
let configCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene la configuración desde Supabase con cache
 * @returns {Promise<Object>} Configuración completa
 */
export async function getConfiguration() {
  // Inicializar cliente Supabase
  const client = getSupabaseClient();

  // Validar que Supabase esté configurado
  if (!client) {
    throw new Error('Supabase no está configurado');
  }

  // Verificar cache
  const now = Date.now();
  if (configCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('[configService] 📦 Usando configuración desde cache');
    return configCache;
  }

  // Obtener desde Supabase
  console.log('[configService] 🔄 Obteniendo configuración desde Supabase...');
  const { data, error } = await client
    .from('app_configuration')
    .select('*')
    .eq('id', 1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[configService] ❌ Error al obtener configuración:', error);
    throw new Error(`Error al obtener configuración: ${error.message}`);
  }

  // Si no existe configuración, usar valores por defecto
  if (!data) {
    console.log('[configService] ⚠️  No existe configuración, usando valores por defecto');
    const defaultConfig = {
      survey123_url: process.env.LAYER_URL || '',
      survey123_layer1_url: '',
      survey123_layer2_url: '',
      survey123_service_url: '',
      survey123_feature_service_url: '',
      field_mappings: {},
      photo_attachment_config: {},
      last_sync_at: null,
      last_sync_columns: [],
      acta_decenio: '«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»',
      acta_anio: '«Año de la Recuperación y Consolidación de la Economía Peruana»'
    };

    // Guardar en cache
    configCache = defaultConfig;
    cacheTimestamp = now;

    return defaultConfig;
  }

  // Guardar en cache
  configCache = data;
  cacheTimestamp = now;

  console.log('[configService] ✅ Configuración cargada correctamente');
  return data;
}

/**
 * Obtiene solo la URL de Survey123 desde Supabase
 * @returns {Promise<string>} URL del servicio Survey123
 */
export async function getSurvey123Url() {
  try {
    const config = await getConfiguration();
    const url = config.survey123_url || process.env.LAYER_URL || '';

    if (!url) {
      console.warn('[configService] ⚠️  URL de Survey123 no configurada');
    }

    return url;
  } catch (error) {
    console.error('[configService] ❌ Error al obtener URL de Survey123:', error);
    // Fallback a variable de entorno si falla Supabase
    return process.env.LAYER_URL || '';
  }
}

/**
 * Obtiene el mapeo de campos desde Supabase
 * @returns {Promise<Object>} Mapeo de campos {internal_field: survey123_column}
 */
export async function getFieldMappings() {
  try {
    const config = await getConfiguration();
    return config.field_mappings || {};
  } catch (error) {
    console.error('[configService] ❌ Error al obtener mapeo de campos:', error);
    return {};
  }
}

/**
 * Obtiene la configuración de adjuntos de fotos
 * @returns {Promise<Object>} Configuración de fotos
 */
export async function getPhotoAttachmentConfig() {
  try {
    const config = await getConfiguration();
    return config.photo_attachment_config || {};
  } catch (error) {
    console.error('[configService] ❌ Error al obtener configuración de fotos:', error);
    return {};
  }
}

/**
 * Obtiene la configuración del header del acta (decenio y año)
 * @returns {Promise<Object>} Configuración del header {decenio, anio}
 */
export async function getActaHeaderConfig() {
  try {
    const config = await getConfiguration();
    return {
      decenio: config.acta_decenio || '«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»',
      anio: config.acta_anio || '«Año de la Recuperación y Consolidación de la Economía Peruana»'
    };
  } catch (error) {
    console.error('[configService] ❌ Error al obtener config del header:', error);
    return {
      decenio: '«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»',
      anio: '«Año de la Recuperación y Consolidación de la Economía Peruana»'
    };
  }
}

/**
 * Invalida el cache de configuración
 * Útil cuando se actualiza la configuración
 */
export function invalidateCache() {
  console.log('[configService] 🗑️  Invalidando cache de configuración');
  configCache = null;
  cacheTimestamp = null;
}

/**
 * Actualiza la configuración en Supabase
 * @param {Object} updates - Campos a actualizar
 * @param {string} userId - ID del usuario que realiza la actualización
 * @returns {Promise<Object>} Configuración actualizada
 */
export async function updateConfiguration(updates, userId) {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error('Supabase no está configurado');
  }

  console.log('[configService] 💾 Actualizando configuración...');

  // Preparar objeto de actualización
  const payload = {
    ...updates,
    updated_by: userId
  };

  // Verificar si existe configuración
  const { data: existing } = await client
    .from('app_configuration')
    .select('id')
    .eq('id', 1)
    .single();

  let result;
  if (existing) {
    // Actualizar
    const { data, error } = await client
      .from('app_configuration')
      .update(payload)
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;
    result = data;
  } else {
    // Insertar primera configuración
    const { data, error } = await client
      .from('app_configuration')
      .insert({
        id: 1,
        ...payload
      })
      .select()
      .single();

    if (error) throw error;
    result = data;
  }

  // Invalidar cache
  invalidateCache();

  // Registrar en audit log
  await client
    .from('admin_audit_log')
    .insert({
      admin_id: userId,
      action: 'update_app_configuration',
      details: {
        survey123_url_changed: updates.survey123_url !== undefined,
        survey123_layer1_url_changed: updates.survey123_layer1_url !== undefined,
        survey123_layer2_url_changed: updates.survey123_layer2_url !== undefined,
        mappings_updated: updates.field_mappings !== undefined,
        sync_performed: updates.last_sync_columns !== undefined
      }
    });

  console.log('[configService] ✅ Configuración actualizada');
  return result;
}

export default {
  getConfiguration,
  getSurvey123Url,
  getFieldMappings,
  getPhotoAttachmentConfig,
  getActaHeaderConfig,
  invalidateCache,
  updateConfiguration
};
