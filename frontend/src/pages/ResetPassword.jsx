import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useDarkMode';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const navigate = useNavigate();

  // Verificar si hay un token de recuperación válido
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Usuario llegó desde el enlace de recuperación
        console.log('Password recovery mode activated');
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validaciones
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setSuccess(true);
      
      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error) {
      setError(error.message || 'Error al restablecer la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center theme-gradient-page px-6 py-12 relative">
      {/* Theme Toggle - Fixed Position */}
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle theme={theme} onToggle={cycleTheme} />
      </div>

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-12">
          {/* Logo OEFA - Grande y centrado */}
          <div className="flex justify-center mb-8">
            <img 
              src={theme === 'dark' ? "./logo_oefa_dark.png" : theme === 'pink' ? "./logo_oefa_dark.png" : "./logo_oefa_light.png"}
              alt="Logo OEFA"
              className="h-24 w-auto object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 pink:text-white mb-3">
            Restablecer contraseña
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 pink:text-white/90 pink:font-semibold">
            Ingresa tu nueva contraseña
          </p>
        </div>

        {/* Reset Form Card */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-2xl border-2 border-slate-200 dark:border-slate-700 pink:border-pink-200 p-8 shadow-xl">
          {/* Success Message */}
          {success ? (
            <div className="theme-bg-success theme-border-success border-2 rounded-xl p-6 text-center">
              <CheckCircle className="w-16 h-16 theme-color-success mx-auto mb-4" />
              <h3 className="text-xl font-bold theme-text-success mb-2">
                ¡Contraseña actualizada!
              </h3>
              <p className="text-sm theme-text-success-muted">
                Tu contraseña ha sido restablecida exitosamente. Serás redirigido al login en unos segundos...
              </p>
            </div>
          ) : (
            <>
              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 rounded-xl border-2 theme-bg-error theme-border-error flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 theme-color-error flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold theme-text-error">
                    {error}
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold theme-label mb-2">
                    Nueva contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 theme-input focus:ring-2 theme-ring-focus focus:border-transparent transition-all"
                    placeholder="••••••••"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-semibold theme-label mb-2">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 theme-input focus:ring-2 theme-ring-focus focus:border-transparent transition-all"
                    placeholder="••••••••"
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 rounded-xl theme-gradient-btn text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Restablecer contraseña
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
