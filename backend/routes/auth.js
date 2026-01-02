import express from 'express';
import { supabaseAdmin, supabasePublic } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Sign up user with Supabase Auth
    const { data: authData, error: authError } = await supabasePublic.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || null
        }
      }
    });
    
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }
    
    // Update profile with full name if provided
    if (full_name && authData.user) {
      await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', authData.user.id);
    }
    
    res.json({
      message: 'Account created successfully. Please wait for admin approval.',
      user: {
        id: authData.user?.id,
        email: authData.user?.email
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return session
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) {
      // Check if it's an email confirmation error
      if (authError.message && authError.message.toLowerCase().includes('email not confirmed')) {
        return res.status(401).json({ 
          error: 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada y haz clic en el enlace de confirmación.',
          email_not_confirmed: true
        });
      }
      
      // For invalid credentials, check if user exists in auth.users to provide better feedback
      // This helps differentiate between "user doesn't exist" vs "wrong password"
      try {
        const { data: users, error: userCheckError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!userCheckError && users) {
          const userExists = users.users.some(u => u.email?.toLowerCase() === email.toLowerCase());
          
          if (!userExists) {
            // User doesn't exist at all
            return res.status(401).json({ 
              error: 'No existe una cuenta con este correo electrónico. Por favor, regístrate primero.',
              user_not_found: true
            });
          }
        }
      } catch (checkError) {
        console.error('Error checking user existence:', checkError);
        // Continue to generic error if check fails
      }
      
      // User exists but wrong password (or other auth error)
      return res.status(401).json({ error: 'Contraseña incorrecta. Por favor, verifica tus credenciales.' });
    }
    
    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', authData.user.id)
      .single();
    
    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }
    
    // Check if user is activated
    if (!profile.is_active) {
      return res.status(403).json({ 
        error: 'Your account is pending admin approval. Please contact the administrator.',
        pending_approval: true
      });
    }
    
    res.json({
      message: 'Login successful',
      session: authData.session,
      user: profile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Create a client with the user's token to sign them out
      const { error } = await supabasePublic.auth.signOut();
      
      if (error) throw error;
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Get fresh profile data
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('id', req.user.id)
      .single();
    
    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ user: profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/auth/accessible-cas
 * Get list of CA codes the current user can access
 */
router.get('/accessible-cas', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.profile.role;
    
    // Admins and superadmins have access to all CAs
    if (['admin', 'superadmin'].includes(userRole)) {
      // Get all unique CAs from permissions table
      const { data: allCAs, error } = await supabaseAdmin
        .from('user_ca_permissions')
        .select('ca_code, granted_at')
        .order('granted_at', { ascending: false });
      
      if (error) throw error;
      
      // Remove duplicates
      const uniqueCAs = [];
      const seen = new Set();
      for (const ca of (allCAs || [])) {
        if (!seen.has(ca.ca_code)) {
          seen.add(ca.ca_code);
          uniqueCAs.push({ ca_code: ca.ca_code, created_at: ca.granted_at });
        }
      }
      
      return res.json({ 
        all_access: true,
        cas: uniqueCAs,
        count: uniqueCAs.length
      });
    }
    
    // Get specific CA permissions for regular users
    const { data: permissions, error } = await supabaseAdmin
      .from('user_ca_permissions')
      .select('ca_code, granted_at')
      .eq('user_id', userId);
    
    if (error) throw error;
    
    res.json({
      all_access: false,
      cas: permissions || [],
      count: permissions?.length || 0
    });
  } catch (error) {
    console.error('Error getting accessible CAs:', error);
    res.status(500).json({ error: 'Failed to get accessible CAs' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    const { data, error } = await supabasePublic.auth.refreshSession({
      refresh_token
    });
    
    if (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    res.json({
      session: data.session,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;
