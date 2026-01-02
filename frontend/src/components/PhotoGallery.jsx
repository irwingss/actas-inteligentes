import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'

/**
 * Galería de fotos con slider horizontal
 * @param {string} codigoAccion - Código de acción (URL permanente)
 * @param {string} globalId - Global ID del registro
 * @param {function} onPhotoClick - Callback(photo, index, allPhotos)
 */
export function PhotoGallery({ codigoAccion, globalId, onPhotoClick }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [scrollPosition, setScrollPosition] = useState(0)
  const scrollContainerRef = React.useRef(null)

  useEffect(() => {
    if (!codigoAccion || !globalId) {
      setPhotos([])
      setLoading(false)
      return
    }

    console.log('[PhotoGallery] 🆕 Cargando fotos (URL permanente):', { codigoAccion, globalId })

    // ✅ Nuevo endpoint DIRECTO (sin jobs) - URL permanente
    const url = `/api/s123/direct/photos/${codigoAccion}/${globalId}`;
    console.log('[PhotoGallery] 📡 Fetching from:', url);

    fetch(url, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
      .then(res => {
        console.log('[PhotoGallery] 📥 Response status:', res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('[PhotoGallery] 📦 Response data:', data);

        // El endpoint devuelve { codigo, globalId, count, files: [{ name, url, size }, ...] }
        if (data.files && Array.isArray(data.files)) {
          const photosWithUrls = data.files.map(file => ({
            filename: file.name,
            url: file.url // ✅ URL permanente: /api/s123/direct/photo/:codigo/:gid/:filename
          }))
          setPhotos(photosWithUrls)
          console.log('[PhotoGallery] ✅ Cargadas', photosWithUrls.length, 'fotos')
        } else {
          console.warn('[PhotoGallery] ⚠️ No files array in response:', data);
          setPhotos([])
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('[PhotoGallery] ❌ Error cargando fotos:', err)
        setPhotos([])
        setLoading(false)
      })
  }, [codigoAccion, globalId])

  const scroll = (direction) => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollAmount = 200
    const newPosition = direction === 'left'
      ? Math.max(0, scrollPosition - scrollAmount)
      : scrollPosition + scrollAmount

    container.scrollTo({ left: newPosition, behavior: 'smooth' })
    setScrollPosition(newPosition)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm">No hay fotografías disponibles</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          📸 Fotografías ({photos.length})
        </h4>
      </div>

      <div className="relative group">
        {/* Botón izquierdo */}
        {scrollPosition > 0 && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white dark:bg-slate-700 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Contenedor de fotos */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {photos.map((photo, index) => (
            <button
              key={photo.filename}
              onClick={() => onPhotoClick(photo, index, photos)}
              className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <img
                src={photo.url}
                alt={photo.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {/* Botón derecho */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white dark:bg-slate-700 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Indicador de scroll */}
      <div className="flex justify-center gap-1 mt-3">
        {photos.length > 4 && Array.from({ length: Math.ceil(photos.length / 4) }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${Math.floor(scrollPosition / 200) === i
              ? 'bg-blue-500'
              : 'bg-slate-300 dark:bg-slate-600'
              }`}
          />
        ))}
      </div>
    </div>
  )
}
