import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/supervisor-team
 * Obtener todos los miembros activos del equipo supervisor (para usuarios normales)
 * Ordenados por apellidos_nombres ascendente
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { data: members, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .select('id, apellidos_nombres, dni, num_colegiatura')
      .eq('is_active', true)
      .order('apellidos_nombres', { ascending: true });

    if (error) {
      console.error('[supervisor-team] Error fetching members:', error);
      return res.status(500).json({ error: 'Error al obtener miembros del equipo' });
    }

    res.json({ 
      success: true, 
      members: members || [],
      count: members?.length || 0
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/supervisor-team/all
 * Obtener TODOS los miembros (incluidos inactivos) - Solo superadmin
 */
router.get('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data: members, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .select('*')
      .order('apellidos_nombres', { ascending: true });

    if (error) {
      console.error('[supervisor-team] Error fetching all members:', error);
      return res.status(500).json({ error: 'Error al obtener miembros del equipo' });
    }

    res.json({ 
      success: true, 
      members: members || [],
      count: members?.length || 0
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/supervisor-team
 * Crear un nuevo miembro del equipo - Solo superadmin
 */
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { apellidos_nombres, dni, num_colegiatura } = req.body;

    if (!apellidos_nombres || !apellidos_nombres.trim()) {
      return res.status(400).json({ error: 'Los apellidos y nombres son requeridos' });
    }

    const { data: member, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .insert({
        apellidos_nombres: apellidos_nombres.trim(),
        dni: dni?.trim() || null,
        num_colegiatura: num_colegiatura?.trim() || null,
        is_active: true,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('[supervisor-team] Error creating member:', error);
      return res.status(500).json({ error: 'Error al crear miembro del equipo' });
    }

    res.status(201).json({ 
      success: true, 
      member,
      message: 'Miembro del equipo creado exitosamente'
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/supervisor-team/bulk
 * Crear múltiples miembros del equipo - Solo superadmin
 */
router.post('/bulk', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { members } = req.body;

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de miembros' });
    }

    const membersToInsert = members.map(m => ({
      apellidos_nombres: m.apellidos_nombres?.trim(),
      dni: m.dni?.trim() || null,
      num_colegiatura: m.num_colegiatura?.trim() || null,
      is_active: true,
      created_by: req.user.id
    })).filter(m => m.apellidos_nombres);

    if (membersToInsert.length === 0) {
      return res.status(400).json({ error: 'No hay miembros válidos para insertar' });
    }

    const { data: insertedMembers, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .insert(membersToInsert)
      .select();

    if (error) {
      console.error('[supervisor-team] Error bulk creating members:', error);
      return res.status(500).json({ error: 'Error al crear miembros del equipo' });
    }

    res.status(201).json({ 
      success: true, 
      members: insertedMembers,
      count: insertedMembers?.length || 0,
      message: `${insertedMembers?.length || 0} miembros creados exitosamente`
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/supervisor-team/:id
 * Actualizar un miembro existente - Solo superadmin
 */
router.put('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { apellidos_nombres, dni, num_colegiatura, is_active } = req.body;

    if (apellidos_nombres !== undefined && !apellidos_nombres.trim()) {
      return res.status(400).json({ error: 'Los apellidos y nombres no pueden estar vacíos' });
    }

    const updates = {};
    if (apellidos_nombres !== undefined) updates.apellidos_nombres = apellidos_nombres.trim();
    if (dni !== undefined) updates.dni = dni?.trim() || null;
    if (num_colegiatura !== undefined) updates.num_colegiatura = num_colegiatura?.trim() || null;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: member, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[supervisor-team] Error updating member:', error);
      return res.status(500).json({ error: 'Error al actualizar miembro del equipo' });
    }

    if (!member) {
      return res.status(404).json({ error: 'Miembro no encontrado' });
    }

    res.json({ 
      success: true, 
      member,
      message: 'Miembro del equipo actualizado exitosamente'
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/supervisor-team/:id
 * Eliminar un miembro - Solo superadmin
 */
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('supervisor_team_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[supervisor-team] Error deleting member:', error);
      return res.status(500).json({ error: 'Error al eliminar miembro del equipo' });
    }

    res.json({ 
      success: true, 
      message: 'Miembro del equipo eliminado exitosamente'
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/supervisor-team/search
 * Buscar miembros por nombre (para autocompletado)
 */
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, members: [], count: 0 });
    }

    const { data: members, error } = await supabaseAdmin
      .from('supervisor_team_members')
      .select('id, apellidos_nombres, dni, num_colegiatura')
      .eq('is_active', true)
      .ilike('apellidos_nombres', `%${q}%`)
      .order('apellidos_nombres', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[supervisor-team] Error searching members:', error);
      return res.status(500).json({ error: 'Error al buscar miembros' });
    }

    res.json({ 
      success: true, 
      members: members || [],
      count: members?.length || 0
    });
  } catch (error) {
    console.error('[supervisor-team] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
