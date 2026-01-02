import React from 'react'
import { FileQuestion, Sparkles, ArrowRight } from 'lucide-react'

export const EmptyState = ({ 
  icon: Icon = FileQuestion, 
  title, 
  description, 
  actionLabel, 
  onAction,
  variant = 'default' 
}) => {
  const variantStyles = {
    default: 'from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 pink:from-pink-50 pink:to-pink-100',
    primary: 'from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 pink:from-pink-100 pink:to-pink-200',
    success: 'from-success-50 to-accent-50 dark:from-success-900/20 dark:to-accent-900/20 pink:from-pink-50 pink:to-accent-50',
  }

  return (
    <div className={`bg-gradient-to-br ${variantStyles[variant]} rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 pink:border-pink-300 p-12 text-center`}>
      {/* Icon */}
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white dark:bg-slate-700 pink:bg-white shadow-lg flex items-center justify-center">
        <Icon className="w-10 h-10 theme-text-hint" strokeWidth={1.5} />
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold theme-text-primary mb-2">{title}</h3>
      <p className="theme-text-muted max-w-md mx-auto mb-6 leading-relaxed">
        {description}
      </p>

      {/* Action */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="
            inline-flex items-center gap-2 px-6 py-3 
            bg-primary-600 hover:bg-primary-700 
            pink:bg-[var(--color-primary)] pink:hover:bg-[var(--color-primary-hover)]
            text-white font-semibold rounded-xl
            shadow-lg shadow-primary-500/30 hover:shadow-primary-600/40
                        transition-all duration-300
            hover:scale-105 hover:-translate-y-0.5
            focus:outline-none focus:ring-4 theme-ring-focus
          "
        >
          <Sparkles className="w-5 h-5" />
          {actionLabel}
          <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
