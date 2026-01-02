import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// All admin routes require authentication
router.use(authenticate);

/**
 * GET /api/admin/users
 * Get all users (admins and superadmins only)
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/:userId/permissions
 * Get CA permissions for a specific user
 */
router.get('/users/:userId/permissions', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data: permissions, error } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('id, ca_code, granted_at, granted_by, notes')
      .eq('user_id', userId)
      .order('granted_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * POST /api/admin/users/:userId/permissions
 * Grant CA access to a user
 */
router.post('/users/:userId/permissions', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { ca_code, notes } = req.body;
    
    if (!ca_code) {
      return res.status(400).json({ error: 'CA code is required' });
    }
    
    // Insert permission
    const { data: permission, error } = await supabaseAdmin
      .from('user_ca_permissions')
      .insert({
        user_id: userId,
        ca_code,
        granted_by: req.profile.id,
        notes: notes || null
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'User already has access to this CA' });
      }
      throw error;
    }
    
    // Log action
    await supabaseAdmin.rpc('log_admin_action', {
      p_admin_id: req.profile.id,
      p_action: 'grant_ca_access',
      p_target_user_id: userId,
      p_target_ca_code: ca_code,
      p_details: { notes }
    });
    
    res.json({ permission, message: 'CA access granted successfully' });
  } catch (error) {
    console.error('Error granting CA access:', error);
    res.status(500).json({ error: 'Failed to grant CA access' });
  }
});

/**
 * DELETE /api/admin/users/:userId/permissions/:permissionId
 * Revoke CA access from a user
 */
router.delete('/users/:userId/permissions/:permissionId', requireAdmin, async (req, res) => {
  try {
    const { userId, permissionId } = req.params;
    
    // Get permission details before deleting (for logging)
    const { data: permission } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('ca_code')
      .eq('id', permissionId)
      .eq('user_id', userId)
      .single();
    
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    
    // Delete permission
    const { error } = await supabaseAdmin
      .from('user_ca_permissions')
      .delete()
      .eq('id', permissionId)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    // Log action
    await supabaseAdmin.rpc('log_admin_action', {
      p_admin_id: req.profile.id,
      p_action: 'revoke_ca_access',
      p_target_user_id: userId,
      p_target_ca_code: permission.ca_code
    });
    
    res.json({ message: 'CA access revoked successfully' });
  } catch (error) {
    console.error('Error revoking CA access:', error);
    res.status(500).json({ error: 'Failed to revoke CA access' });
  }
});

/**
 * POST /api/admin/users/:userId/activate
 * Activate or deactivate a user
 */
router.post('/users/:userId/activate', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;
    
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }
    
    // Use RPC function for validation and logging
    const { data, error } = await supabaseAdmin.rpc('toggle_user_active', {
      p_target_user_id: userId,
      p_toggled_by: req.profile.id,
      p_active: is_active
    });
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(403).json({ error: data.error });
    }
    
    res.json({ message: `User ${is_active ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Error toggling user active status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

/**
 * POST /api/admin/users/:userId/promote
 * Promote user role (superadmin only)
 */
router.post('/users/:userId/promote', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Use RPC function for validation and logging
    const { data, error } = await supabaseAdmin.rpc('promote_user_role', {
      p_target_user_id: userId,
      p_new_role: role,
      p_promoted_by: req.profile.id
    });
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(403).json({ error: data.error });
    }
    
    res.json({ 
      message: 'User role updated successfully',
      old_role: data.old_role,
      new_role: data.new_role
    });
  } catch (error) {
    console.error('Error promoting user:', error);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

/**
 * GET /api/admin/audit-log
 * Get audit log (admins and superadmins only)
 */
router.get('/audit-log', requireAdmin, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const { data: logs, error, count } = await supabaseAdmin
      .from('admin_audit_log')
      .select('*, admin:admin_id(email), target_user:target_user_id(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    res.json({ logs, total: count });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user account permanently (superadmin only)
 */
router.delete('/users/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Use RPC function for validation and deletion
    const { data, error } = await supabaseAdmin.rpc('delete_user_account', {
      p_target_user_id: userId,
      p_deleted_by: req.profile.id
    });
    
    if (error) throw error;
    
    if (!data.success) {
      return res.status(403).json({ error: data.error });
    }
    
    res.json({ 
      message: 'Usuario eliminado exitosamente',
      deleted_email: data.deleted_email,
      deleted_role: data.deleted_role
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * GET /api/admin/stats
 * Get admin dashboard stats
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    // Get counts
    const { data: userCounts } = await supabaseAdmin
      .from('profiles')
      .select('role', { count: 'exact' });
    
    const stats = {
      total_users: userCounts?.length || 0,
      superadmins: userCounts?.filter(u => u.role === 'superadmin').length || 0,
      admins: userCounts?.filter(u => u.role === 'admin').length || 0,
      regular_users: userCounts?.filter(u => u.role === 'user').length || 0,
      can_add_superadmin: false
    };
    
    // Check if can add superadmin
    const { data: superadminCheck } = await supabaseAdmin.rpc('check_superadmin_limit');
    if (superadminCheck && superadminCheck.length > 0) {
      stats.can_add_superadmin = superadminCheck[0].can_add;
      stats.superadmin_limit = superadminCheck[0].max_count;
    }
    
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
