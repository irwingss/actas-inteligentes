import React from 'react'

export const SkipToContent = () => {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        fixed top-4 left-4 z-50
        px-4 py-2 bg-primary-600 text-white
        rounded-lg font-medium
        focus:outline-none focus:ring-4 focus:ring-primary-500/50
      "
    >
      Saltar al contenido principal
    </a>
  )
}
