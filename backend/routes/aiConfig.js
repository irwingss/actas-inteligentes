/**
 * Rutas para configuración de IA
 * GET /api/ai-config - Obtener configuración actual (auth requerido)
 * PUT /api/ai-config - Actualizar configuración (solo superadmin)
 * POST /api/ai-config/sync - Sincronizar desde Supabase (auth requerido)
 */

import express from 'express'
import { authenticate, requireSuperAdmin } from '../middleware/auth.js'
import {
  getLocalAIConfig,
  syncAIConfigFromSupabase,
  saveAIConfigToSupabase
} from '../services/aiConfigService.js'

const router = express.Router()

/**
 * GET /api/ai-config
 * Obtener configuración actual (sin exponer API key completa)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const config = await getLocalAIConfig()
    
    // Enmascarar API key para seguridad (mostrar solo últimos 8 caracteres)
    const maskedApiKey = config.gemini_api_key 
      ? '****' + config.gemini_api_key.slice(-8)
      : null

    res.json({
      success: true,
      config: {
        gemini_api_key_masked: maskedApiKey,
        gemini_api_key_configured: !!config.gemini_api_key,
        gemini_model: config.gemini_model,
        gemini_model_expert: config.gemini_model_expert,
        synced_at: config.synced_at,
        synced_from: config.synced_from
      }
    })
  } catch (error) {
    console.error('[aiConfig] Error obteniendo configuración:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/ai-config/full
 * Obtener configuración completa incluyendo API key (solo superadmin)
 */
router.get('/full', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const config = await getLocalAIConfig()
    
    res.json({
      success: true,
      config: {
        gemini_api_key: config.gemini_api_key || '',
        gemini_model: config.gemini_model,
        gemini_model_expert: config.gemini_model_expert,
        synced_at: config.synced_at,
        synced_from: config.synced_from
      }
    })
  } catch (error) {
    console.error('[aiConfig] Error obteniendo configuración completa:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/ai-config
 * Actualizar configuración (solo superadmin)
 */
router.put('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { gemini_api_key, gemini_model, gemini_model_expert } = req.body
    const userId = req.user.id

    // Validar que al menos un campo esté presente
    if (!gemini_api_key && !gemini_model && !gemini_model_expert) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos un campo para actualizar'
      })
    }

    // Obtener config actual para campos no proporcionados
    const currentConfig = await getLocalAIConfig()

    const newConfig = {
      gemini_api_key: gemini_api_key || currentConfig.gemini_api_key,
      gemini_model: gemini_model || currentConfig.gemini_model,
      gemini_model_expert: gemini_model_expert || currentConfig.gemini_model_expert
    }

    await saveAIConfigToSupabase(newConfig, userId)

    console.log(`[aiConfig] ✅ Configuración actualizada por ${req.user.email}`)

    res.json({
      success: true,
      message: 'Configuración de IA actualizada correctamente',
      config: {
        gemini_api_key_configured: !!newConfig.gemini_api_key,
        gemini_model: newConfig.gemini_model,
        gemini_model_expert: newConfig.gemini_model_expert
      }
    })
  } catch (error) {
    console.error('[aiConfig] Error actualizando configuración:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/ai-config/sync
 * Sincronizar configuración desde Supabase
 */
router.post('/sync', authenticate, async (req, res) => {
  try {
    console.log(`[aiConfig] 🔄 Sincronización solicitada por ${req.user.email}`)
    
    const config = await syncAIConfigFromSupabase()

    res.json({
      success: true,
      message: 'Configuración sincronizada desde Supabase',
      config: {
        gemini_api_key_configured: !!config.gemini_api_key,
        gemini_model: config.gemini_model,
        gemini_model_expert: config.gemini_model_expert
      }
    })
  } catch (error) {
    console.error('[aiConfig] Error sincronizando:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/ai-config/models
 * Obtener lista de modelos disponibles
 */
router.get('/models', authenticate, (req, res) => {
  res.json({
    success: true,
    models: {
      standard: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rápido y económico' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Alta calidad' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Estable y confiable' }
      ],
      expert: [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', description: 'Soporta Structured Output + Google Search (recomendado)' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Sin soporte de tools combinados' }
      ]
    }
  })
})

export default router
