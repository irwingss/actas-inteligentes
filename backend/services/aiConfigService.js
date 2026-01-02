/**
 * Servicio de Configuración de IA
 * Maneja la configuración centralizada de Gemini (API key, modelos)
 * Sincroniza desde Supabase y cachea en SQLite local
 */

import pool, { get, run, ensureDb } from '../db/config.js'
import { createClient } from '@supabase/supabase-js'

// Cliente Supabase (lazy init)
let supabaseClient = null

function getSupabaseClient() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      supabaseClient = createClient(url, key)
    }
  }
  return supabaseClient
}

/**
 * Ejecutar migración de tabla ai_config si no existe
 */
export async function initAIConfigTable() {
  try {
    const database = await ensureDb()
    database.run(`
      CREATE TABLE IF NOT EXISTS ai_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        gemini_api_key TEXT,
        gemini_model TEXT DEFAULT 'gemini-2.5-flash',
        gemini_model_expert TEXT DEFAULT 'gemini-3-pro-preview',
        synced_at TEXT,
        synced_from TEXT DEFAULT 'supabase'
      )
    `)
    database.run(`INSERT OR IGNORE INTO ai_config (id) VALUES (1)`)
    console.log('[aiConfigService] ✅ Tabla ai_config inicializada')
  } catch (error) {
    console.error('[aiConfigService] ❌ Error inicializando tabla:', error.message)
  }
}

/**
 * Obtener configuración desde cache local (SQLite)
 */
export async function getLocalAIConfig() {
  try {
    const result = await get('SELECT * FROM ai_config WHERE id = 1')
    const config = result.rows[0]
    return config || {
      gemini_api_key: process.env.GEMINI_API_KEY,
      gemini_model: 'gemini-2.5-flash',
      gemini_model_expert: 'gemini-3-pro-preview'
    }
  } catch (error) {
    console.error('[aiConfigService] Error obteniendo config local:', error.message)
    // Fallback a variables de entorno
    return {
      gemini_api_key: process.env.GEMINI_API_KEY,
      gemini_model: 'gemini-2.5-flash',
      gemini_model_expert: 'gemini-3-pro-preview'
    }
  }
}

/**
 * Sincronizar configuración desde Supabase a SQLite local
 */
export async function syncAIConfigFromSupabase() {
  const client = getSupabaseClient()
  
  if (!client) {
    console.log('[aiConfigService] ⚠️ Supabase no configurado, usando config local')
    return getLocalAIConfig()
  }

  try {
    console.log('[aiConfigService] 🔄 Sincronizando configuración desde Supabase...')
    
    const { data, error } = await client
      .from('app_configuration')
      .select('gemini_api_key, gemini_model, gemini_model_expert')
      .eq('id', 1)
      .single()

    if (error) {
      console.error('[aiConfigService] ❌ Error en Supabase:', error.message)
      return getLocalAIConfig()
    }

    if (!data) {
      console.log('[aiConfigService] ⚠️ No hay configuración en Supabase')
      return getLocalAIConfig()
    }

    // Actualizar cache local
    const apiKey = data.gemini_api_key || process.env.GEMINI_API_KEY
    const model = data.gemini_model || 'gemini-2.5-flash'
    const modelExpert = data.gemini_model_expert || 'gemini-3-pro-preview'

    await run(`
      UPDATE ai_config SET 
        gemini_api_key = ?,
        gemini_model = ?,
        gemini_model_expert = ?,
        synced_at = datetime('now'),
        synced_from = 'supabase'
      WHERE id = 1
    `, [apiKey, model, modelExpert])

    console.log('[aiConfigService] ✅ Config sincronizada:', {
      model,
      modelExpert,
      hasApiKey: !!apiKey
    })

    return { gemini_api_key: apiKey, gemini_model: model, gemini_model_expert: modelExpert }
  } catch (error) {
    console.error('[aiConfigService] ❌ Error sincronizando:', error.message)
    return getLocalAIConfig()
  }
}

/**
 * Guardar configuración en Supabase (solo SuperAdmin)
 */
export async function saveAIConfigToSupabase(config, userId) {
  const client = getSupabaseClient()
  
  if (!client) {
    throw new Error('Supabase no está configurado')
  }

  console.log('[aiConfigService] 💾 Guardando configuración en Supabase...')

  const { error } = await client
    .from('app_configuration')
    .update({
      gemini_api_key: config.gemini_api_key,
      gemini_model: config.gemini_model,
      gemini_model_expert: config.gemini_model_expert,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('id', 1)

  if (error) {
    throw new Error(`Error guardando en Supabase: ${error.message}`)
  }

  // Actualizar cache local también
  await run(`
    UPDATE ai_config SET 
      gemini_api_key = ?,
      gemini_model = ?,
      gemini_model_expert = ?,
      synced_at = datetime('now'),
      synced_from = 'supabase'
    WHERE id = 1
  `, [
    config.gemini_api_key,
    config.gemini_model,
    config.gemini_model_expert
  ])

  // Registrar en audit log
  await client.from('admin_audit_log').insert({
    admin_id: userId,
    action: 'update_ai_configuration',
    details: {
      gemini_model_changed: true,
      gemini_model_expert_changed: true,
      api_key_changed: !!config.gemini_api_key
    }
  })

  console.log('[aiConfigService] ✅ Configuración guardada')
  return true
}

/**
 * Obtener API key (para uso en servicios AI)
 */
export async function getGeminiApiKey() {
  const config = await getLocalAIConfig()
  return config.gemini_api_key || process.env.GEMINI_API_KEY
}

/**
 * Obtener modelo por defecto
 */
export async function getGeminiModel() {
  const config = await getLocalAIConfig()
  return config.gemini_model || 'gemini-2.5-flash'
}

/**
 * Obtener modelo para expertos (con structured output + tools)
 */
export async function getGeminiModelExpert() {
  const config = await getLocalAIConfig()
  return config.gemini_model_expert || 'gemini-3-pro-preview'
}

export default {
  initAIConfigTable,
  getLocalAIConfig,
  syncAIConfigFromSupabase,
  saveAIConfigToSupabase,
  getGeminiApiKey,
  getGeminiModel,
  getGeminiModelExpert
}
