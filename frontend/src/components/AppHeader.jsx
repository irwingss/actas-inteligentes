import React, { useState } from 'react'
import { Bell, User, LogOut, ArrowLeft, Shield, ChevronDown } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useDarkMode'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export const AppHeader = ({ showBackButton = false, onBack = null }) => {
  const { profile, signOut, isAdmin, isSuperAdmin, accessibleCAs } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [theme, cycleTheme] = useTheme()
  const navigate = useNavigate()

  // Mock stats - En producción vendría de una API
  const pendientes = 2

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleAdminPanel = () => {
    navigate('/admin')
    setShowUserMenu(false)
  }

  // Obtener iniciales del email si no hay nombre completo
  const getInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ')
      return names.length > 1
        ? `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`
        : names[0].charAt(0).toUpperCase()
    }
    return profile?.email?.charAt(0).toUpperCase() || 'U'
  }

  const getDisplayName = () => {
    return profile?.full_name || profile?.email || 'Usuario'
  }

  const getRoleBadge = () => {
    if (isSuperAdmin) {
      return <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 pink:bg-pink-100 text-purple-700 dark:text-purple-300 theme-text-primary rounded-full font-medium">SuperAdmin</span>
    }
    if (isAdmin) {
      return <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 pink:bg-pink-100 text-blue-700 dark:text-blue-300 theme-text-primary rounded-full font-medium">Admin</span>
    }
    return null
  }

  const getAccessInfo = () => {
    if (isAdmin || isSuperAdmin) {
      return <span className="text-xs theme-text-muted">Acceso a todos los CAs</span>
    }
    if (accessibleCAs?.cas && accessibleCAs.cas.length > 0) {
      return <span className="text-xs theme-text-muted">{accessibleCAs.cas.length} CAs asignados</span>
    }
    return <span className="text-xs theme-text-hint">Sin CAs asignados</span>
  }

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 pink:bg-white/90 backdrop-blur-sm border-b theme-border sticky top-0 z-[60]">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back Button (opcional) */}
            {showBackButton && onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 rounded-lg transition-colors"
                aria-label="Volver"
              >
                <ArrowLeft className="w-5 h-5 theme-text-link" />
              </button>
            )}

            {/* Logo OEFA - cambia según el tema */}
            <img
              src={theme === 'dark' ? "./logo_oefa_dark.png" : theme === 'pink' ? "./logo_oefa_dark.png" : "./logo_oefa_light.png"}
              alt="Logo OEFA"
              className="h-10 w-auto object-contain"
            />
            <div>
              <h1 className="text-lg font-semibold theme-text-secondary">
                Actas Inteligentes
              </h1>
              <p className="text-sm theme-text-muted">
                Sistema de Gestión de Actas
              </p>
            </div>
          </div>

          {/* User Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle theme={theme} onToggle={cycleTheme} />
            <button
              className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 rounded-lg transition-colors"
              aria-label="Notificaciones"
            >
              <Bell className="w-5 h-5 theme-text-link" />
              {pendientes > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" aria-label={`${pendientes} pendientes`} />
              )}
            </button>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 rounded-lg transition-colors"
              >
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium theme-text-secondary">
                      {profile?.email}
                    </p>
                    {getRoleBadge()}
                  </div>
                  {getAccessInfo()}
                </div>
                <div className="w-8 h-8 rounded-full theme-gradient-btn flex items-center justify-center text-white font-semibold text-sm">
                  {getInitials()}
                </div>
                <ChevronDown className={`w-4 h-4 theme-text-muted transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 pink:bg-white rounded-xl shadow-2xl border theme-border py-2 z-20">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                      <p className="text-sm font-semibold theme-text-primary">
                        {profile?.full_name || 'Usuario'}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 pink:text-pink-400 mt-0.5">
                        {profile?.email}
                      </p>
                      {(isAdmin || isSuperAdmin) && (
                        <div className="mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isSuperAdmin
                              ? 'bg-purple-100 dark:bg-purple-900/30 pink:bg-pink-100 text-purple-700 dark:text-purple-300 theme-text-primary'
                              : 'bg-blue-100 dark:bg-blue-900/30 pink:bg-pink-100 text-blue-700 dark:text-blue-300 theme-text-primary'
                            }`}>
                            {isSuperAdmin ? 'SuperAdmin' : 'Admin'}
                          </span>
                        </div>
                      )}
                    </div>

                    {(isAdmin || isSuperAdmin) && (
                      <button
                        onClick={handleAdminPanel}
                        className="w-full px-4 py-2.5 text-left text-sm theme-text-link hover:bg-slate-50 dark:hover:bg-slate-700/50 pink:hover:bg-pink-50 transition-colors flex items-center gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Panel de Administración
                      </button>
                    )}

                    <button
                      onClick={handleSignOut}
                      className="w-full px-4 py-2.5 text-left text-sm theme-color-error hover:bg-red-50 dark:hover:bg-red-900/20 pink:hover:bg-pink-50 transition-colors flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar Sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
