/**
 * Rutas para gestionar matrices de muestreo
 * Las matrices se sincronizan con Supabase para compartir entre usuarios
 */

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { authenticate, requireSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Matrices por defecto (cuando no hay en Supabase)
const DEFAULT_MATRICES = [
  { id: 'aire', nombre: 'Aire', orden: 1 },
  { id: 'emisiones_gaseosas', nombre: 'Emisiones gaseosas', orden: 2 },
  { id: 'emisiones_fugitivas', nombre: 'Emisiones fugitivas*', orden: 3 },
  { id: 'ruido_ambiental', nombre: 'Ruido ambiental', orden: 4 },
  { id: 'vibracion', nombre: 'Vibración', orden: 5 },
  { id: 'suelo', nombre: 'Suelo', orden: 6 },
  { id: 'sedimento', nombre: 'Sedimento', orden: 7 },
  { id: 'agua_superficial_rio', nombre: 'Agua Superficial de río', orden: 8 },
  { id: 'agua_superficial_lago', nombre: 'Agua Superficial de lago', orden: 9 },
  { id: 'agua_superficial_laguna', nombre: 'Agua Superficial de laguna', orden: 10 },
  { id: 'agua_residual_industrial', nombre: 'Agua Residual Industrial', orden: 11 },
  { id: 'agua_residual_domestica', nombre: 'Agua Residual Doméstica', orden: 12 },
  { id: 'agua_subterranea', nombre: 'Agua subterránea', orden: 13 },
  { id: 'agua_de_mar', nombre: 'Agua de mar', orden: 14 },
  { id: 'agua_de_reinyeccion', nombre: 'Agua de reinyección', orden: 15 },
  { id: 'agua_de_procesos', nombre: 'Agua de procesos', orden: 16 },
  { id: 'sustancia_desconocida', nombre: 'Sustancia desconocida', orden: 17 },
]

// Aplicar autenticación a todas las rutas
router.use(authenticate)

/**
 * GET /api/matrices-muestreo
 * Obtener todas las matrices activas
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matrices_muestreo')
      .select('*')
      .eq('is_active', true)
      .order('orden', { ascending: true })
    
    if (error) {
      // Si la tabla no existe, devolver las por defecto
      if (error.code === '42P01') { // table does not exist
        return res.json({ success: true, matrices: DEFAULT_MATRICES, source: 'default' })
      }
      throw error
    }
    
    // Si no hay matrices, devolver las por defecto
    if (!data || data.length === 0) {
      return res.json({ success: true, matrices: DEFAULT_MATRICES, source: 'default' })
    }
    
    res.json({ success: true, matrices: data, source: 'supabase' })
  } catch (error) {
    console.error('[matrices] Error obteniendo matrices:', error)
    // En caso de error, devolver las por defecto
    res.json({ success: true, matrices: DEFAULT_MATRICES, source: 'default' })
  }
})

/**
 * GET /api/matrices-muestreo/all
 * Obtener TODAS las matrices (incluyendo inactivas) - Solo superadmins
 */
router.get('/all', requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matrices_muestreo')
      .select('*')
      .order('orden', { ascending: true })
    
    if (error) {
      if (error.code === '42P01') {
        return res.json({ success: true, matrices: DEFAULT_MATRICES, needsInit: true })
      }
      throw error
    }
    
    res.json({ success: true, matrices: data || [] })
  } catch (error) {
    console.error('[matrices] Error obteniendo todas las matrices:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/matrices-muestreo
 * Crear nueva matriz - Solo superadmins
 */
router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { nombre, orden } = req.body
    
    if (!nombre) {
      return res.status(400).json({ success: false, error: 'El nombre es requerido' })
    }
    
    // Generar ID a partir del nombre
    const id = nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    
    const { data, error } = await supabase
      .from('matrices_muestreo')
      .insert({
        id,
        nombre,
        orden: orden || 999,
        is_active: true,
        created_by: req.user.id
      })
      .select()
      .single()
    
    if (error) throw error
    
    res.json({ success: true, matriz: data })
  } catch (error) {
    console.error('[matrices] Error creando matriz:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/matrices-muestreo/reorder
 * Reordenar matrices - Solo superadmins
 * IMPORTANTE: Esta ruta debe estar ANTES de /:id
 */
router.put('/reorder', requireSuperAdmin, async (req, res) => {
  try {
    const { ordenamiento } = req.body // Array de { id, orden }
    
    if (!Array.isArray(ordenamiento)) {
      return res.status(400).json({ success: false, error: 'ordenamiento debe ser un array' })
    }
    
    // Actualizar cada matriz
    for (const item of ordenamiento) {
      const { error } = await supabase
        .from('matrices_muestreo')
        .update({ orden: item.orden, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      
      if (error) throw error
    }
    
    res.json({ success: true, message: 'Matrices reordenadas' })
  } catch (error) {
    console.error('[matrices] Error reordenando matrices:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/matrices-muestreo/:id
 * Actualizar matriz - Solo superadmins
 */
router.put('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { nombre, orden, is_active } = req.body
    
    const updateData = {}
    if (nombre !== undefined) updateData.nombre = nombre
    if (orden !== undefined) updateData.orden = orden
    if (is_active !== undefined) updateData.is_active = is_active
    updateData.updated_at = new Date().toISOString()
    
    const { data, error } = await supabase
      .from('matrices_muestreo')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    res.json({ success: true, matriz: data })
  } catch (error) {
    console.error('[matrices] Error actualizando matriz:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/matrices-muestreo/:id
 * Eliminar matriz - Solo superadmins
 */
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    
    const { error } = await supabase
      .from('matrices_muestreo')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    res.json({ success: true, message: 'Matriz eliminada' })
  } catch (error) {
    console.error('[matrices] Error eliminando matriz:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/matrices-muestreo/init
 * Inicializar matrices por defecto en Supabase - Solo superadmins
 */
router.post('/init', requireSuperAdmin, async (req, res) => {
  try {
    // Insertar matrices por defecto
    const { data, error } = await supabase
      .from('matrices_muestreo')
      .upsert(
        DEFAULT_MATRICES.map(m => ({
          ...m,
          is_active: true,
          created_by: req.user.id
        })),
        { onConflict: 'id' }
      )
      .select()
    
    if (error) throw error
    
    res.json({ success: true, matrices: data, message: 'Matrices inicializadas' })
  } catch (error) {
    console.error('[matrices] Error inicializando matrices:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
