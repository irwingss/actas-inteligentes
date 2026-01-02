import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/axios';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessibleCAs, setAccessibleCAs] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // Indica si ya se verificó la autenticación
  const [anexosTemplates, setAnexosTemplates] = useState([]); // Templates de anexos sincronizados
  
  // Refs para evitar llamadas duplicadas
  const fetchingProfile = useRef(false);
  const initialLoadDone = useRef(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Sincronizar configuración de AI desde Supabase al backend local
  const syncAIConfig = useCallback(async (token) => {
    try {
      await api.post(`${API_URL}/api/ai-config/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      // Silenciar - no es crítico
    }
  }, [API_URL]);

  // Cargar templates de anexos desde Supabase
  const fetchAnexosTemplates = useCallback(async (token) => {
    try {
      const response = await api.get(`${API_URL}/api/anexos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.anexos) {
        setAnexosTemplates(response.data.anexos);
      }
    } catch (error) {
      console.error('[AuthContext] Error fetching anexos:', error);
      // No es crítico, mantener array vacío
    }
  }, [API_URL]);

  // Refrescar anexos manualmente (para usar desde componentes)
  const refreshAnexos = useCallback(async () => {
    const token = session?.access_token;
    if (token) {
      await fetchAnexosTemplates(token);
    }
  }, [session?.access_token, fetchAnexosTemplates]);

  // Fetch profile and accessible CAs
  const fetchProfile = useCallback(async (token) => {
    // Evitar llamadas concurrentes
    if (fetchingProfile.current) {
      return;
    }
    
    fetchingProfile.current = true;
    
    try {
      const response = await api.get(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(response.data.user);

      // Fetch accessible CAs
      const casResponse = await api.get(`${API_URL}/api/auth/accessible-cas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAccessibleCAs(casResponse.data);

      // Sincronizar configuración AI y cargar anexos (no bloquear)
      syncAIConfig(token);
      fetchAnexosTemplates(token);
    } catch (error) {
      // Token inválido o expirado - limpiar estado
      setProfile(null);
      setAccessibleCAs(null);
      // Si es 401, la sesión no es válida - hacer logout silencioso
      if (error.response?.status === 401) {
        setSession(null);
        setUser(null);
      }
    } finally {
      fetchingProfile.current = false;
      setLoading(false);
      setAuthChecked(true);
    }
  }, [API_URL, syncAIConfig, fetchAnexosTemplates]);

  // Initialize session - solo una vez
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    
    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession?.access_token) {
          setSession(currentSession);
          setUser(currentSession.user);
          // fetchProfile verificará si el token es válido
          await fetchProfile(currentSession.access_token);
        } else {
          // No hay sesión
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          setAuthChecked(true);
        }
      } catch (error) {
        // Error inesperado - limpiar estado
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        setAuthChecked(true);
      }
    };

    initAuth();

    // Listener para cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ignorar INITIAL_SESSION ya que lo manejamos arriba
      if (event === 'INITIAL_SESSION') return;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.access_token) {
          fetchProfile(newSession.access_token);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setAccessibleCAs(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Sign up
  const signUp = async (email, password, fullName) => {
    try {
      const response = await api.post(`${API_URL}/api/auth/signup`, {
        email,
        password,
        full_name: fullName
      });
      return { data: response.data, error: null };
    } catch (error) {
      return { data: null, error: error.response?.data?.error || error.message };
    }
  };

  // Sign in
  const signIn = async (email, password) => {
    try {
      const response = await api.post(`${API_URL}/api/auth/login`, {
        email,
        password
      });
      
      // Set session from backend response
      const { session: backendSession, user: userProfile } = response.data;
      
      // Set Supabase session y actualizar estado local
      if (backendSession) {
        const { data: { session: newSession } } = await supabase.auth.setSession({
          access_token: backendSession.access_token,
          refresh_token: backendSession.refresh_token
        });
        
        // Actualizar estados locales inmediatamente
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setProfile(userProfile);
        setAuthChecked(true);
        setLoading(false);
        
        // Cargar CAs accesibles
        try {
          const casResponse = await api.get(`${API_URL}/api/auth/accessible-cas`, {
            headers: { Authorization: `Bearer ${backendSession.access_token}` }
          });
          setAccessibleCAs(casResponse.data);
        } catch (e) {
          // No crítico
        }
        
        // Sincronizar config AI y cargar anexos (no bloquear)
        syncAIConfig(backendSession.access_token);
        fetchAnexosTemplates(backendSession.access_token);
      }
      
      return { data: response.data, error: null };
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      const isPending = error.response?.data?.pending_approval;
      const isEmailNotConfirmed = error.response?.data?.email_not_confirmed;
      const isUserNotFound = error.response?.data?.user_not_found;
      return { data: null, error: errorMessage, isPending, isEmailNotConfirmed, isUserNotFound };
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      const token = session?.access_token;
      if (token) {
        await api.post(`${API_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {}); // Ignorar errores del backend
      }
    } finally {
      // Siempre limpiar estado local y Supabase
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setAccessibleCAs(null);
      setAnexosTemplates([]);
      // Mantener authChecked en true para que ProtectedRoute redirija a login
    }
  };

  // Check if user can access a specific CA
  const canAccessCA = (caCode) => {
    if (!profile) return false;
    
    // Admins and superadmins have access to all
    if (['admin', 'superadmin'].includes(profile.role)) {
      return true;
    }
    
    // Regular users need explicit permission
    if (accessibleCAs?.all_access) return true;
    if (!accessibleCAs?.cas || accessibleCAs.cas.length === 0) return false;
    
    // Check if caCode is in the list of accessible CAs
    return accessibleCAs.cas.some(ca => String(ca.ca_code) === String(caCode));
  };

  // Get auth token for API requests
  const getAuthToken = () => {
    return session?.access_token || null;
  };

  // Refresh profile data
  const refreshProfile = async () => {
    if (session?.access_token) {
      await fetchProfile(session.access_token);
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    authChecked,
    accessibleCAs,
    anexosTemplates,
    signUp,
    signIn,
    signOut,
    canAccessCA,
    getAuthToken,
    refreshProfile,
    refreshAnexos,
    isAdmin: profile?.role === 'admin' || profile?.role === 'superadmin',
    isSuperAdmin: profile?.role === 'superadmin',
    isActive: profile?.is_active || false
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
