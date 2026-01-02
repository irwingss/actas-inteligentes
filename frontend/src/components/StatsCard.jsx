import React from 'react'
import { TrendingUp } from 'lucide-react'

export const StatsCard = ({ icon: Icon, label, value, trend, color = 'primary' }) => {
  const colorClasses = {
    primary: 'from-primary-500 to-primary-600 text-primary-600',
    secondary: 'from-secondary-500 to-secondary-600 text-secondary-600',
    accent: 'from-accent-500 to-accent-600 text-accent-600',
    success: 'from-success-500 to-success-600 text-success-600',
    highlight: 'from-highlight-500 to-highlight-600 text-highlight-600',
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClasses[color]} bg-opacity-10 dark:bg-opacity-20 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colorClasses[color].split(' ')[2]} dark:text-opacity-90`} strokeWidth={2.5} />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-success-600 dark:text-success-400 text-xs font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{value}</div>
      <div className="text-sm text-slate-600 dark:text-slate-400">{label}</div>
    </div>
  )
}
