import { supabaseAdmin } from '../config/supabase.js';
import { getJob } from '../lib/s123Jobs.js';

/**
 * Middleware to authenticate user from Bearer token
 * Attaches user and profile to req.user
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get user profile with role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }
    
    // Check if user is active
    if (!profile.is_active) {
      return res.status(403).json({ error: 'User account is not activated. Contact admin.' });
    }
    
    // Attach user and profile to request
    req.user = user;
    req.profile = profile;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to check if user is admin or superadmin
 */
export function requireAdmin(req, res, next) {
  if (!req.profile || !['admin', 'superadmin'].includes(req.profile.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Middleware to check if user is superadmin
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.profile || req.profile.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
}

/**
 * Middleware to validate CA access for regular users
 * Admins and superadmins bypass this check
 * Checks caCode or jobId from req.params
 */
export async function validateCAAccess(req, res, next) {
  try {
    const { caCode, jobId } = req.params;
    const codigo = caCode || jobId;
    const { profile } = req;
    
    if (!codigo) {
      return res.status(400).json({ error: 'CA code required' });
    }
    
    // Admins and superadmins have access to all CAs
    if (['admin', 'superadmin'].includes(profile.role)) {
      return next();
    }
    
    // Check if regular user has permission for this CA
    const { data: permission } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('ca_code', codigo)
      .single();
    
    if (!permission) {
      return res.status(403).json({ error: 'No access to this CA code' });
    }
    
    next();
  } catch (error) {
    console.error('CA access validation error:', error);
    return res.status(500).json({ error: 'Failed to validate CA access' });
  }
}

/**
 * Middleware to validate CA access for regular users (body version)
 * Checks caCode or jobId from req.body instead of req.params
 */
export async function validateCAAccessBody(req, res, next) {
  try {
    const { caCode, jobId } = req.body;
    const codigo = caCode || jobId;
    const { profile } = req;
    
    if (!codigo) {
      return res.status(400).json({ error: 'CA code required in request body' });
    }
    
    // Admins and superadmins have access to all CAs
    if (['admin', 'superadmin'].includes(profile.role)) {
      return next();
    }
    
    // Check if regular user has permission for this CA
    const { data: permission } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('ca_code', codigo)
      .single();
    
    if (!permission) {
      return res.status(403).json({ error: 'No access to this CA code' });
    }
    
    next();
  } catch (error) {
    console.error('CA access validation error:', error);
    return res.status(500).json({ error: 'Failed to validate CA access' });
  }
}

/**
 * Middleware to validate job access based on jobId in URL params
 * Gets the job first, then validates CA access
 */
export async function validateJobAccess(req, res, next) {
  try {
    const jobId = req.params.jobId;
    const { profile, user } = req;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID required' });
    }
    
    // Get the job (this already validates userId ownership)
    const job = await getJob(jobId, user.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    }
    
    // Admins and superadmins have access to all jobs
    if (['admin', 'superadmin'].includes(profile.role)) {
      return next();
    }
    
    // For regular users, check if they have permission for this CA
    const caCode = job.caCode || job.supervision;
    
    if (!caCode) {
      // If no CA code in job, allow (might be an old job or special case)
      return next();
    }
    
    // Check if regular user has permission for this CA
    const { data: permission } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('ca_code', caCode)
      .single();
    
    if (!permission) {
      return res.status(403).json({ 
        error: 'No tienes acceso a este código de acción',
        caCode 
      });
    }
    
    next();
  } catch (error) {
    console.error('Job access validation error:', error);
    return res.status(500).json({ error: 'Failed to validate job access' });
  }
}

/**
 * Middleware to validate job access based on jobId in request body
 * Gets the job first, then validates CA access
 */ 
export async function validateJobAccessBody(req, res, next) {
  try {
    const { profile, user } = req;
    console.log('[validateJobAccessBody] 📥 Full req.body:', JSON.stringify(req.body));
    console.log('[validateJobAccessBody] 📥 req.body type:', typeof req.body);
    console.log('[validateJobAccessBody] 📥 req.body.jobId:', req.body?.jobId);
    const jobId = req.body?.jobId;
    console.log('[validateJobAccessBody] 🔑 jobId extraído:', jobId);
    console.log('[validateJobAccessBody] 👤 user:', user?.id, 'profile:', profile?.role);
    
    if (!jobId) {
      console.error('[validateJobAccessBody] ❌ No jobId en body');
      console.error('[validateJobAccessBody] ❌ Keys disponibles en body:', Object.keys(req.body || {}));
      return res.status(400).json({ 
        error: 'Job ID required in request body',
        received: req.body,
        keys: Object.keys(req.body || {})
      });
    }
    
    // Get the job (this already validates userId ownership)
    const job = await getJob(jobId, user.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    }
    
    // Admins and superadmins have access to all jobs
    if (['admin', 'superadmin'].includes(profile.role)) {
      return next();
    }
    
    // For regular users, check if they have permission for this CA
    const caCode = job.caCode || job.supervision;
    
    if (!caCode) {
      // If no CA code in job, allow (might be an old job or special case)
      return next();
    }
    
    // Check if regular user has permission for this CA
    const { data: permission } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('ca_code', caCode)
      .single();
    
    if (!permission) {
      return res.status(403).json({ 
        error: 'No tienes acceso a este código de acción',
        caCode 
      });
    }
    
    next();
  } catch (error) {
    console.error('Job access validation error (body):', error);
    return res.status(500).json({ error: 'Failed to validate job access' });
  }
}
