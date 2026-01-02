import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, UserPlus, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useDarkMode';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const navigate = useNavigate();
  const { signUp, user, loading: authLoading } = useAuth();

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

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

    if (fullName.trim().length < 3) {
      setError('El nombre debe tener al menos 3 caracteres');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await signUp(email, password, fullName.trim());
    
    if (signUpError) {
      if (signUpError.includes('already registered') || signUpError.includes('ya existe')) {
        setError('Ya existe una cuenta con este correo electrónico.');
      } else if (signUpError.includes('invalid email') || signUpError.includes('correo inválido')) {
        setError('El correo electrónico no es válido.');
      } else {
        setError(signUpError);
      }
    } else {
      setSuccess(true);
    }
    
    setLoading(false);
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
            Crear cuenta
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 pink:text-white/90 pink:font-semibold">
            Sistema de Actas de Supervisión Ambiental
          </p>
        </div>

        {/* Register Form Card */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-2xl border-2 border-slate-200 dark:border-slate-700 pink:border-pink-200 p-8 shadow-xl">
          {/* Success Message */}
          {success ? (
            <div className="theme-bg-success theme-border-success border-2 rounded-xl p-6 text-center">
              <CheckCircle className="w-16 h-16 theme-color-success mx-auto mb-4" />
              <h3 className="text-xl font-bold theme-text-success mb-2">
                ¡Registro exitoso!
              </h3>
              <p className="text-sm theme-text-success-muted mb-4">
                Hemos enviado un correo de confirmación a <strong>{email}</strong>. 
                Por favor revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
              </p>
              <p className="text-xs theme-text-muted">
                Una vez confirmado tu correo, un administrador deberá aprobar tu cuenta antes de que puedas acceder al sistema.
              </p>
              <Link 
                to="/login" 
                className="inline-block mt-6 px-6 py-2 rounded-xl theme-gradient-btn text-white font-bold transition-all"
              >
                Ir al inicio de sesión
              </Link>
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
                  <label htmlFor="fullName" className="block text-sm font-semibold theme-label mb-2">
                    Nombre completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 theme-input focus:ring-2 theme-ring-focus focus:border-transparent transition-all"
                    placeholder="Juan Pérez García"
                    disabled={loading}
                  />
                </div>

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
                  <p className="text-xs theme-text-hint mt-1">Mínimo 6 caracteres</p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold theme-label mb-2">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirmPassword"
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
                      Registrando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5" />
                      Crear cuenta
                    </>
                  )}
                </button>
              </form>

              {/* Login Link */}
              <div className="mt-8 pt-6 border-t-2 border-slate-100 dark:border-slate-700 pink:border-pink-100 text-center">
                <p className="text-sm theme-text-muted">
                  ¿Ya tienes una cuenta?{' '}
                  <Link to="/login" className="font-bold theme-text-link hover:underline">
                    Inicia sesión aquí
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
