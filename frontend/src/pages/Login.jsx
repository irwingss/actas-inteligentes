import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle, Loader2, CheckCircle, Info, UserX } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useDarkMode';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState('error'); // 'error', 'warning', 'info', 'purple'
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [theme, cycleTheme] = useTheme();
  const navigate = useNavigate();
  const { signIn, user, loading: authLoading } = useAuth();

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorType('error');
    setLoading(true);

    const { data, error: signInError, isPending, isEmailNotConfirmed, isUserNotFound } = await signIn(email, password);
    
    if (signInError) {
      // Determinar el tipo de error para el estilo visual
      if (isEmailNotConfirmed) {
        setErrorType('info');
        setError('Tu correo electrónico aún no ha sido confirmado. Por favor revisa tu bandeja de entrada y haz clic en el enlace de confirmación.');
      } else if (isPending) {
        setErrorType('warning');
        setError('Tu cuenta está pendiente de aprobación. Un administrador debe activarla.');
      } else if (isUserNotFound) {
        setErrorType('purple');
        setError('No existe una cuenta con este correo electrónico.');
      } else if (signInError.includes('Invalid login credentials') || signInError.includes('credenciales')) {
        setErrorType('error');
        setError('Credenciales inválidas. Verifica tu correo y contraseña.');
      } else if (signInError.includes('desactivada') || signInError.includes('inactive')) {
        setErrorType('warning');
        setError('Tu cuenta está desactivada. Contacta al administrador.');
      } else {
        setErrorType('error');
        setError(signInError);
      }
    } else {
      navigate('/');
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);

    try {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setForgotSuccess(true);
    } catch (error) {
      setForgotError(error.message || 'Error al enviar el correo de recuperación');
    } finally {
      setForgotLoading(false);
    }
  };

  // Determinar clases de estilo según el tipo de error
  const getErrorClasses = () => {
    switch (errorType) {
      case 'warning':
        return 'theme-bg-warning theme-border-warning';
      case 'info':
        return 'theme-bg-info theme-border-info';
      case 'purple':
        return 'theme-bg-purple theme-border-purple';
      default:
        return 'theme-bg-error theme-border-error';
    }
  };

  const getErrorTextClass = () => {
    switch (errorType) {
      case 'warning':
        return 'theme-text-warning';
      case 'info':
        return 'theme-text-info';
      case 'purple':
        return 'theme-text-purple';
      default:
        return 'theme-text-error';
    }
  };

  const getErrorIconClass = () => {
    switch (errorType) {
      case 'warning':
        return 'theme-color-warning';
      case 'info':
        return 'theme-color-info';
      case 'purple':
        return 'theme-color-purple';
      default:
        return 'theme-color-error';
    }
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'info':
        return <Info className={`w-5 h-5 ${getErrorIconClass()} flex-shrink-0 mt-0.5`} />;
      case 'purple':
        return <UserX className={`w-5 h-5 ${getErrorIconClass()} flex-shrink-0 mt-0.5`} />;
      default:
        return <AlertCircle className={`w-5 h-5 ${getErrorIconClass()} flex-shrink-0 mt-0.5`} />;
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
            Bienvenido
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 pink:text-white/90 pink:font-semibold">
            Sistema de Actas de Supervisión Ambiental
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-2xl border-2 border-slate-200 dark:border-slate-700 pink:border-pink-200 p-8 shadow-xl">
          {/* Forgot Password Modal */}
          {showForgotPassword ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold theme-text-primary mb-2">
                  Recuperar contraseña
                </h2>
                <p className="text-sm theme-text-muted">
                  Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                </p>
              </div>

              {forgotSuccess ? (
                <div className="theme-bg-success theme-border-success border-2 rounded-xl p-6 text-center">
                  <CheckCircle className="w-12 h-12 theme-color-success mx-auto mb-3" />
                  <p className="text-sm font-semibold theme-text-success">
                    ¡Correo enviado! Revisa tu bandeja de entrada.
                  </p>
                </div>
              ) : (
                <>
                  {forgotError && (
                    <div className="p-4 rounded-xl border-2 theme-bg-error theme-border-error flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 theme-color-error flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-semibold theme-text-error">{forgotError}</p>
                    </div>
                  )}

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label htmlFor="forgot-email" className="block text-sm font-semibold theme-label mb-2">
                        Correo electrónico
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 theme-input focus:ring-2 theme-ring-focus focus:border-transparent transition-all"
                        placeholder="tu@correo.com"
                        disabled={forgotLoading}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full px-6 py-3 rounded-xl theme-gradient-btn text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Mail className="w-5 h-5" />
                          Enviar enlace
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}

              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotSuccess(false);
                  setForgotError('');
                }}
                className="w-full text-center text-sm font-semibold theme-text-link hover:underline"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              {/* Error Message */}
              {error && (
                <div className={`mb-6 p-4 rounded-xl border-2 ${getErrorClasses()} flex items-start gap-3`}>
                  {getErrorIcon()}
                  <p className={`text-sm font-semibold ${getErrorTextClass()}`}>
                    {error}
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold theme-label mb-2">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 theme-input focus:ring-2 theme-ring-focus focus:border-transparent transition-all"
                    placeholder="tu@correo.com"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold theme-label mb-2">
                    Contraseña
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

                {/* Forgot Password Link */}
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm font-semibold theme-text-link hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 rounded-xl theme-gradient-btn text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Iniciando sesión...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      Iniciar sesión
                    </>
                  )}
                </button>
              </form>

              {/* Register Link */}
              <div className="mt-8 pt-6 border-t-2 border-slate-100 dark:border-slate-700 pink:border-pink-100 text-center">
                <p className="text-sm theme-text-muted">
                  ¿No tienes una cuenta?{' '}
                  <Link to="/register" className="font-bold theme-text-link hover:underline">
                    Regístrate aquí
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
