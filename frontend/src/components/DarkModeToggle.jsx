import React from 'react'
import { Moon, Sun } from 'lucide-react'

export const DarkModeToggle = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="
        relative p-2 rounded-lg 
        bg-slate-100 dark:bg-slate-800
        hover:bg-slate-200 dark:hover:bg-slate-700
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary-500/50
      "
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
    >
      <div className="relative w-5 h-5">
        <Sun 
          className={`
            absolute inset-0 w-5 h-5 text-amber-500
            transition-all duration-300
            ${isDark ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'}
          `}
        />
        <Moon 
          className={`
            absolute inset-0 w-5 h-5 text-slate-400
            transition-all duration-300
            ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}
          `}
        />
      </div>
    </button>
  )
}
