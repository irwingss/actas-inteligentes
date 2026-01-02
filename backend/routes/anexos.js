import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/anexos
 * Obtener todos los anexos activos (para usuarios normales)
 * Ordenados por 'orden' ascendente
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { data: anexos, error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .select('id, texto, tipo, orden')
      .eq('is_active', true)
      .order('orden', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[anexos] Error fetching anexos:', error);
      return res.status(500).json({ error: 'Error al obtener anexos' });
    }

    res.json({ 
      success: true, 
      anexos: anexos || [],
      count: anexos?.length || 0
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/anexos/all
 * Obtener TODOS los anexos (incluidos inactivos) - Solo superadmin
 */
router.get('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data: anexos, error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .select('*')
      .order('orden', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[anexos] Error fetching all anexos:', error);
      return res.status(500).json({ error: 'Error al obtener anexos' });
    }

    res.json({ 
      success: true, 
      anexos: anexos || [],
      count: anexos?.length || 0
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/anexos
 * Crear un nuevo anexo - Solo superadmin
 */
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, tipo = 'físico' } = req.body;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'El texto del anexo es requerido' });
    }

    // Validar tipo
    if (tipo && !['físico', 'virtual'].includes(tipo)) {
      return res.status(400).json({ error: 'El tipo debe ser "físico" o "virtual"' });
    }

    // Obtener el máximo orden actual
    const { data: maxOrdenResult } = await supabaseAdmin
      .from('acta_anexos_templates')
      .select('orden')
      .order('orden', { ascending: false })
      .limit(1)
      .single();

    const nuevoOrden = (maxOrdenResult?.orden ?? -1) + 1;

    const { data: anexo, error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .insert({
        texto: texto.trim(),
        tipo: tipo || 'físico',
        orden: nuevoOrden,
        is_active: true,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('[anexos] Error creating anexo:', error);
      return res.status(500).json({ error: 'Error al crear anexo' });
    }

    res.status(201).json({ 
      success: true, 
      anexo,
      message: 'Anexo creado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/anexos/reorder
 * Reordenar anexos - Solo superadmin
 * Body: { orderedIds: [id1, id2, id3, ...] }
 * IMPORTANTE: Esta ruta debe estar ANTES de /:id
 */
router.put('/reorder', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs ordenados' });
    }

    // Actualizar el orden de cada anexo
    const updates = orderedIds.map((id, index) => 
      supabaseAdmin
        .from('acta_anexos_templates')
        .update({ orden: index })
        .eq('id', id)
    );

    await Promise.all(updates);

    // Obtener la lista actualizada
    const { data: anexos, error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .select('*')
      .order('orden', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[anexos] Error fetching after reorder:', error);
      return res.status(500).json({ error: 'Error al obtener anexos actualizados' });
    }

    res.json({ 
      success: true, 
      anexos,
      message: 'Orden actualizado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/anexos/:id
 * Actualizar un anexo existente - Solo superadmin
 */
router.put('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, tipo, is_active } = req.body;

    if (texto !== undefined && !texto.trim()) {
      return res.status(400).json({ error: 'El texto del anexo no puede estar vacío' });
    }

    // Validar tipo si se proporciona
    if (tipo !== undefined && !['físico', 'virtual'].includes(tipo)) {
      return res.status(400).json({ error: 'El tipo debe ser "físico" o "virtual"' });
    }

    const updates = {};
    if (texto !== undefined) updates.texto = texto.trim();
    if (tipo !== undefined) updates.tipo = tipo;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: anexo, error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[anexos] Error updating anexo:', error);
      return res.status(500).json({ error: 'Error al actualizar anexo' });
    }

    if (!anexo) {
      return res.status(404).json({ error: 'Anexo no encontrado' });
    }

    res.json({ 
      success: true, 
      anexo,
      message: 'Anexo actualizado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/anexos/:id
 * Eliminar un anexo - Solo superadmin
 */
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('acta_anexos_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[anexos] Error deleting anexo:', error);
      return res.status(500).json({ error: 'Error al eliminar anexo' });
    }

    res.json({ 
      success: true, 
      message: 'Anexo eliminado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================
// ANEXOS PERSONALIZADOS POR CA
// ============================================

/**
 * GET /api/anexos/custom/:caCode
 * Obtener anexos personalizados de un CA específico
 * Cualquier usuario autenticado puede ver (el acceso se valida en frontend)
 */
router.get('/custom/:caCode', authenticate, async (req, res) => {
  try {
    const { caCode } = req.params;

    if (!caCode || !caCode.trim()) {
      return res.status(400).json({ error: 'El código de acción es requerido' });
    }

    const { data: anexos, error } = await supabaseAdmin
      .from('acta_anexos_custom')
      .select('id, texto, orden, created_by, created_at')
      .eq('codigo_accion', caCode.trim())
      .order('orden', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[anexos] Error fetching custom anexos:', error);
      return res.status(500).json({ error: 'Error al obtener anexos personalizados' });
    }

    res.json({ 
      success: true, 
      anexos: anexos || [],
      count: anexos?.length || 0
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/anexos/custom/:caCode
 * Crear un anexo personalizado para un CA
 */
router.post('/custom/:caCode', authenticate, async (req, res) => {
  try {
    const { caCode } = req.params;
    const { texto } = req.body;

    if (!caCode || !caCode.trim()) {
      return res.status(400).json({ error: 'El código de acción es requerido' });
    }

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'El texto del anexo es requerido' });
    }

    // Obtener el máximo orden actual para este CA
    const { data: maxOrdenResult } = await supabaseAdmin
      .from('acta_anexos_custom')
      .select('orden')
      .eq('codigo_accion', caCode.trim())
      .order('orden', { ascending: false })
      .limit(1)
      .single();

    const nuevoOrden = (maxOrdenResult?.orden ?? -1) + 1;

    const { data: anexo, error } = await supabaseAdmin
      .from('acta_anexos_custom')
      .insert({
        codigo_accion: caCode.trim(),
        texto: texto.trim(),
        orden: nuevoOrden,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('[anexos] Error creating custom anexo:', error);
      return res.status(500).json({ error: 'Error al crear anexo personalizado' });
    }

    res.status(201).json({ 
      success: true, 
      anexo,
      message: 'Anexo personalizado creado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/anexos/custom/:id
 * Actualizar un anexo personalizado
 */
router.put('/custom/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'El texto del anexo no puede estar vacío' });
    }

    // Verificar que el usuario es el creador o es superadmin
    const { data: existingAnexo } = await supabaseAdmin
      .from('acta_anexos_custom')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!existingAnexo) {
      return res.status(404).json({ error: 'Anexo no encontrado' });
    }

    const isSuperAdmin = req.user.role === 'superadmin';
    if (existingAnexo.created_by !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para editar este anexo' });
    }

    const { data: anexo, error } = await supabaseAdmin
      .from('acta_anexos_custom')
      .update({ texto: texto.trim() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[anexos] Error updating custom anexo:', error);
      return res.status(500).json({ error: 'Error al actualizar anexo personalizado' });
    }

    res.json({ 
      success: true, 
      anexo,
      message: 'Anexo personalizado actualizado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/anexos/custom/:id
 * Eliminar un anexo personalizado
 */
router.delete('/custom/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el usuario es el creador o es superadmin
    const { data: existingAnexo } = await supabaseAdmin
      .from('acta_anexos_custom')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!existingAnexo) {
      return res.status(404).json({ error: 'Anexo no encontrado' });
    }

    const isSuperAdmin = req.user.role === 'superadmin';
    if (existingAnexo.created_by !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este anexo' });
    }

    const { error } = await supabaseAdmin
      .from('acta_anexos_custom')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[anexos] Error deleting custom anexo:', error);
      return res.status(500).json({ error: 'Error al eliminar anexo personalizado' });
    }

    res.json({ 
      success: true, 
      message: 'Anexo personalizado eliminado exitosamente'
    });
  } catch (error) {
    console.error('[anexos] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
