import React, { useState, useEffect } from 'react'
import { X, Sparkles } from 'lucide-react'

export const OnboardingTooltip = ({ targetId, message, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('onboarding_seen')
    if (!seen) {
      setTimeout(() => setIsVisible(true), 500)
    } else {
      setHasSeenOnboarding(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem('onboarding_seen', 'true')
    setHasSeenOnboarding(true)
  }

  if (!isVisible || hasSeenOnboarding) return null

  const positionClasses = {
    top: '-top-16 left-1/2 -translate-x-1/2',
    bottom: '-bottom-16 left-1/2 -translate-x-1/2',
    left: 'top-1/2 -left-64 -translate-y-1/2',
    right: 'top-1/2 -right-64 -translate-y-1/2',
  }

  return (
    <div className={`absolute ${positionClasses[position]} z-50 animate-bounce`}>
      <div className="relative bg-gradient-to-r from-primary-500 to-primary-600 text-white px-4 py-3 rounded-xl shadow-2xl max-w-xs">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse" />
          <p className="text-sm font-medium leading-relaxed">{message}</p>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Arrow */}
        <div className={`absolute w-3 h-3 bg-primary-600 rotate-45 ${
          position === 'top' ? 'bottom-[-6px] left-1/2 -translate-x-1/2' :
          position === 'bottom' ? 'top-[-6px] left-1/2 -translate-x-1/2' :
          position === 'left' ? 'right-[-6px] top-1/2 -translate-y-1/2' :
          'left-[-6px] top-1/2 -translate-y-1/2'
        }`} />
      </div>
    </div>
  )
}
