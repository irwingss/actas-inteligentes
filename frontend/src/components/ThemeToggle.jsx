import React from 'react'
import { Moon, Sun, Rabbit } from 'lucide-react'

export const ThemeToggle = ({ theme, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="
        relative p-2 rounded-lg border-2
        theme-bg-soft
        border-slate-200 dark:border-slate-700 pink:border-pink-200
        hover:theme-bg-hover
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 pink:focus:ring-pink-300/50
      "
      aria-label={
        theme === 'light' 
          ? 'Cambiar a modo oscuro' 
          : theme === 'dark' 
          ? 'Cambiar a modo rosa' 
          : 'Cambiar a modo claro'
      }
    >
      <div className="relative w-5 h-5">
        {/* Sun - Light Mode */}
        <Sun 
          className={`
            absolute inset-0 w-5 h-5 text-amber-500
            transition-all duration-300
            ${theme === 'light' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'}
          `}
        />
        
        {/* Moon - Dark Mode */}
        <Moon 
          className={`
            absolute inset-0 w-5 h-5 text-slate-400
            transition-all duration-300
            ${theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}
          `}
        />
        
        {/* Rabbit - Pink Mode */}
        <Rabbit 
          className={`
            absolute inset-0 w-5 h-5 text-pink-500
            transition-all duration-300
            ${theme === 'pink' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'}
          `}
        />
      </div>
    </button>
  )
}
