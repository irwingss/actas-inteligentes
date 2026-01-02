/**
 * Rutas de Requerimientos de Información Templates
 * CRUD para templates de requerimientos estándar (superadmins)
 * GET público para todos los usuarios autenticados
 */
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { authenticate, requireSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// Cliente Supabase admin (service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Aplicar autenticación a todas las rutas
router.use(authenticate)

/**
 * GET /api/requerimientos
 * Obtener todos los requerimientos activos
 * Filtros opcionales: ?tipo_ca=Especial|Regular&hecho=valor
 */
router.get('/', async (req, res) => {
  try {
    const { tipo_ca, hecho } = req.query
    
    let query = supabaseAdmin
      .from('requerimientos_templates')
      .select('*')
      .eq('is_active', true)
      .order('orden', { ascending: true })
    
    // Filtrar por tipo de CA si se especifica
    if (tipo_ca) {
      query = query.eq('tipo_ca', tipo_ca)
    }
    
    // Filtrar por hecho asociado si se especifica
    if (hecho) {
      query = query.contains('hechos_asociados', [hecho])
    }
    
    const { data, error } = await query
    
    if (error) {
      // Si la tabla no existe (PGRST205), retornar array vacío en lugar de error
      // Esto permite que la app funcione antes de aplicar la migración
      if (error.code === 'PGRST205') {
        console.warn('[requerimientos] Tabla requerimientos_templates no existe. Ejecuta la migración 011.')
        return res.json({ success: true, templates: [], warning: 'Tabla no configurada. Contacta al administrador.' })
      }
      console.error('[requerimientos] Error obteniendo templates:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, templates: data || [] })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/requerimientos/all
 * Obtener TODOS los requerimientos (incluidos inactivos)
 * Solo superadmins
 */
router.get('/all', requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('requerimientos_templates')
      .select('*')
      .order('orden', { ascending: true })
    
    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('[requerimientos] Tabla requerimientos_templates no existe. Ejecuta la migración 011.')
        return res.json({ success: true, templates: [], warning: 'Tabla no configurada. Ejecuta la migración 011_requerimientos_templates.sql en Supabase.' })
      }
      console.error('[requerimientos] Error obteniendo todos los templates:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, templates: data || [] })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/requerimientos/hechos
 * Obtener lista única de todos los hechos disponibles
 */
router.get('/hechos', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('requerimientos_templates')
      .select('hechos_asociados, tipo_ca')
      .eq('is_active', true)
    
    if (error) {
      if (error.code === 'PGRST205') {
        return res.json({ success: true, hechos: { especial: [], regular: [] }, warning: 'Tabla no configurada' })
      }
      console.error('[requerimientos] Error obteniendo hechos:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    // Extraer hechos únicos por tipo
    const hechosEspecial = new Set()
    const hechosRegular = new Set()
    
    data?.forEach(template => {
      template.hechos_asociados?.forEach(hecho => {
        if (template.tipo_ca === 'Especial') {
          hechosEspecial.add(hecho)
        } else {
          hechosRegular.add(hecho)
        }
      })
    })
    
    res.json({ 
      success: true, 
      hechos: {
        Especial: Array.from(hechosEspecial).sort(),
        Regular: Array.from(hechosRegular).sort()
      }
    })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/requerimientos/by-hecho/:hechoNormalizado
 * Obtener requerimientos para un hecho específico normalizado
 * El hecho viene URL-encoded y debe coincidir con algún valor del array hechos_asociados
 */
router.get('/by-hecho/:hechoNormalizado', async (req, res) => {
  try {
    const { hechoNormalizado } = req.params
    const { tipo_ca } = req.query
    
    // Decodificar el hecho
    const hecho = decodeURIComponent(hechoNormalizado)
    
    let query = supabaseAdmin
      .from('requerimientos_templates')
      .select('*')
      .eq('is_active', true)
      .contains('hechos_asociados', [hecho])
      .order('orden', { ascending: true })
    
    if (tipo_ca) {
      query = query.eq('tipo_ca', tipo_ca)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[requerimientos] Error obteniendo por hecho:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, templates: data || [] })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/requerimientos
 * Crear nuevo template de requerimiento
 * Solo superadmins
 */
router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { texto, hechos_asociados, tipo_ca, orden } = req.body
    
    // Validaciones
    if (!texto?.trim()) {
      return res.status(400).json({ success: false, error: 'El texto es requerido' })
    }
    if (!hechos_asociados || !Array.isArray(hechos_asociados) || hechos_asociados.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe asociar al menos un hecho' })
    }
    if (!tipo_ca || !['Especial', 'Regular'].includes(tipo_ca)) {
      return res.status(400).json({ success: false, error: 'tipo_ca debe ser Especial o Regular' })
    }
    
    const { data, error } = await supabaseAdmin
      .from('requerimientos_templates')
      .insert({
        texto: texto.trim(),
        hechos_asociados,
        tipo_ca,
        orden: orden || 0,
        created_by: req.user?.id
      })
      .select()
      .single()
    
    if (error) {
      console.error('[requerimientos] Error creando template:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, template: data })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/requerimientos/reorder
 * Reordenar templates
 * Solo superadmins
 */
router.put('/reorder', requireSuperAdmin, async (req, res) => {
  try {
    const { orderedIds } = req.body
    
    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds debe ser un array' })
    }
    
    // Actualizar orden de cada template
    const updates = orderedIds.map((id, index) => 
      supabaseAdmin
        .from('requerimientos_templates')
        .update({ orden: index, updated_by: req.user?.id })
        .eq('id', id)
    )
    
    await Promise.all(updates)
    
    res.json({ success: true, message: 'Orden actualizado' })
  } catch (error) {
    console.error('[requerimientos] Error reordenando:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/requerimientos/:id
 * Actualizar template existente
 * Solo superadmins
 */
router.put('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { texto, hechos_asociados, tipo_ca, orden, is_active } = req.body
    
    const updateData = { updated_by: req.user?.id }
    
    if (texto !== undefined) updateData.texto = texto.trim()
    if (hechos_asociados !== undefined) updateData.hechos_asociados = hechos_asociados
    if (tipo_ca !== undefined) {
      if (!['Especial', 'Regular'].includes(tipo_ca)) {
        return res.status(400).json({ success: false, error: 'tipo_ca debe ser Especial o Regular' })
      }
      updateData.tipo_ca = tipo_ca
    }
    if (orden !== undefined) updateData.orden = orden
    if (is_active !== undefined) updateData.is_active = is_active
    
    const { data, error } = await supabaseAdmin
      .from('requerimientos_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('[requerimientos] Error actualizando template:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, template: data })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/requerimientos/:id
 * Eliminar template
 * Solo superadmins
 */
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    
    const { error } = await supabaseAdmin
      .from('requerimientos_templates')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('[requerimientos] Error eliminando template:', error)
      return res.status(500).json({ success: false, error: error.message })
    }
    
    res.json({ success: true, message: 'Template eliminado' })
  } catch (error) {
    console.error('[requerimientos] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
