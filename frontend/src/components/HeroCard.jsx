import React from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'

export const HeroCard = ({ icon: Icon, title, description, onClick, badge }) => {
  return (
    <button
      onClick={onClick}
      className="
        group relative w-full p-8 rounded-3xl 
        theme-gradient-card hover:scale-[1.02]
        text-white border-2 border-transparent
        shadow-2xl shadow-primary-500/30 hover:shadow-primary-600/40
                transition-all duration-500 ease-out
        hover:scale-[1.02] hover:-translate-y-1
        focus:outline-none focus:ring-4 theme-ring-focus
        overflow-hidden
      "
    >
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.3),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.2),transparent)]" />
      </div>

      {/* Badge */}
      {badge && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{badge}</span>
        </div>
      )}

      <div className="relative flex items-center gap-6">
        {/* Icon Container */}
        <div className="
          flex-shrink-0 w-20 h-20 rounded-2xl 
          bg-white/20 backdrop-blur-sm
          flex items-center justify-center
          transition-all duration-500
          group-hover:scale-110 group-hover:rotate-3
          shadow-lg
        ">
          <Icon className="w-10 h-10" strokeWidth={2} />
        </div>

        {/* Content */}
        <div className="flex-1 text-left">
          <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
            {title}
          </h3>
          <p className="text-base text-white/90 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Arrow Icon */}
        <ChevronRight 
          className="
            flex-shrink-0 w-8 h-8 
            transition-all duration-500 
            group-hover:translate-x-2 group-hover:scale-125
            text-white/80
          "
        />
      </div>
    </button>
  )
}
