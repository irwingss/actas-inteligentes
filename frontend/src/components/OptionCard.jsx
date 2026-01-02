import React from 'react'
import { ChevronRight } from 'lucide-react'

export const OptionCard = ({ icon: Icon, title, description, onClick, variant = 'default', badge, count }) => {
  const variantStyles = {
    default: 'bg-white dark:bg-slate-800 pink:bg-white hover:bg-primary-50 pink:hover:bg-pink-50 border-slate-200 dark:border-slate-700 pink:border-pink-200 hover:border-primary-300 pink:hover:theme-border-focus',
    primary: 'theme-gradient-card text-white border-transparent',
  }

  const iconStyles = {
    default: 'bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 theme-text-link',
    primary: 'bg-white/20 text-white',
  }

  return (
    <button
      onClick={onClick}
      className={`
        group relative w-full p-6 rounded-2xl border-2 
        transition-all duration-500 ease-out
        hover:scale-[1.03] hover:shadow-2xl hover:-translate-y-1
        focus:outline-none focus:ring-4 theme-ring-focus
        ${variantStyles[variant]}
      `}
    >
      {/* Badge */}
      {badge && (
        <div className="absolute top-3 right-3 bg-highlight-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
          {badge}
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon Container */}
        <div className={`
          flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center
          transition-all duration-500 group-hover:scale-110 group-hover:rotate-3
          ${iconStyles[variant]}
        `}>
          <Icon className="w-7 h-7" strokeWidth={2} />
        </div>

        {/* Content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className={`
              text-lg font-semibold 
              ${variant === 'primary' ? 'text-white' : 'theme-text-primary'}
            `}>
              {title}
            </h3>
            {/* Count Badge - Inline with title */}
            {count !== undefined && (
              <span className={`
                ${variant === 'primary' ? 'bg-white/20 text-white' : 'bg-primary-100 dark:bg-primary-900/30 pink:bg-pink-100 theme-text-link'} 
                text-xs font-semibold px-2.5 py-1 rounded-full
              `}>
                {count}
              </span>
            )}
          </div>
          <p className={`
            text-sm leading-relaxed
            ${variant === 'primary' ? 'text-white/90' : 'theme-text-muted'}
          `}>
            {description}
          </p>
        </div>

        {/* Arrow Icon */}
        <ChevronRight 
          className={`
            flex-shrink-0 w-5 h-5 transition-all duration-500 
            group-hover:translate-x-2 group-hover:scale-125
            ${variant === 'primary' ? 'text-white/80' : 'theme-text-hint'}
          `}
        />
      </div>
    </button>
  )
}
