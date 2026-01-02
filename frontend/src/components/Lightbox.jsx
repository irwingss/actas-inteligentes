import React, { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

/**
 * Lightbox para ver imágenes en detalle
 */
export function Lightbox({ photo, onClose, onNext, onPrev, hasNext, hasPrev }) {
  const [zoom, setZoom] = React.useState(1)
  
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    
    window.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'auto'
    }
  }, [onClose, onNext, onPrev, hasNext, hasPrev])
  
  if (!photo) return null
  
  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-10">
        <div className="flex items-center justify-between text-white">
          <div className="text-sm font-medium">
            {photo.filename}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Zoom out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Zoom in"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition ml-2"
              title="Cerrar (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Imagen */}
      <div className="relative w-full h-full flex items-center justify-center p-16">
        <img
          src={photo.url}
          alt={photo.filename}
          className="max-w-full max-h-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          onClick={() => setZoom(zoom === 1 ? 2 : 1)}
        />
      </div>
      
      {/* Navegación */}
      {hasPrev && (
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition text-white"
          title="Anterior (←)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      
      {hasNext && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition text-white"
          title="Siguiente (→)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      
      {/* Overlay click to close */}
      <div 
        className="absolute inset-0 -z-10" 
        onClick={onClose}
      />
    </div>
  )
}
