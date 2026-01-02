import React, { useState, useEffect } from 'react'
import { X, MapPin, Layers, FileText, Calendar, User, Mountain } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * Sidebar del mapa para mostrar detalles del punto seleccionado
 * @param {object} marker - Marcador seleccionado con data.codigo_accion
 * @param {string} codigoAccion - Código de acción (URL permanente)
 * @param {function} onClose - Callback para cerrar
 * @param {function} onPhotoClick - Callback al hacer click en foto
 */
export function MapSidebar({ marker, codigoAccion, onClose, onPhotoClick }) {
  const [token, setToken] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token)
      }
    })
  }, [])

  if (!marker) return null

  console.log('[MapSidebar] 🆕 Abriendo sidebar con código:', codigoAccion, 'globalId:', marker.data.globalid)
  console.log('[MapSidebar] 📸 Fotos disponibles:', {
    hasPhotos: !!marker.data._photos,
    photoCount: marker.data._photos?.length || 0,
    photos: marker.data._photos
  })

  const data = marker.data

  // Formatear nombre del supervisor (reemplazar _ por espacios)
  const formatSupervisorName = (name) => {
    if (!name) return null
    return name.replace(/_/g, ' ')
  }

  // Formatear fecha
  const formatDate = (dateStr) => {
    if (!dateStr) return null

    try {
      let date

      // Si es un timestamp numérico (milisegundos desde epoch)
      if (typeof dateStr === 'number') {
        date = new Date(dateStr)
      }
      // Si es un string que parece timestamp numérico
      else if (typeof dateStr === 'string' && /^\d+$/.test(dateStr)) {
        date = new Date(parseInt(dateStr, 10))
      }
      // Si es una fecha como string en otros formatos
      else if (typeof dateStr === 'string') {
        // Intentar parsear directamente (ISO 8601, etc.)
        date = new Date(dateStr)

        // Si falla, intentar con formato DD/MM/YYYY HH:mm:ss
        if (isNaN(date.getTime()) && dateStr.includes('/')) {
          const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
          if (parts) {
            const [, day, month, year, hour = '00', minute = '00', second = '00'] = parts
            date = new Date(year, month - 1, day, hour, minute, second)
          }
        }
      }

      // Validar que la fecha es válida
      if (!date || isNaN(date.getTime())) {
        console.warn('[MapSidebar] No se pudo parsear fecha:', dateStr)
        return 'Fecha inválida'
      }

      // Formatear fecha y hora en español
      const formatted = new Intl.DateTimeFormat('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(date)

      return formatted

    } catch (error) {
      console.error('[MapSidebar] Error formateando fecha:', dateStr, error)
      return 'Fecha inválida'
    }
  }

  return (
    <>
      {/* Overlay para cerrar */}
      <div
        className="absolute inset-0 bg-black/20 z-[400]"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="absolute top-0 right-0 bottom-0 w-96 bg-white dark:bg-slate-800 pink:bg-white shadow-2xl z-[500] overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-blue-600 pink:from-[#ff0075] pink:to-[#ff6eb4] text-white p-4 flex items-start justify-between z-10">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5" />
              <h3 className="font-semibold text-lg">
                {data.codigo_accion || data.otro_ca || 'Sin código'}
              </h3>
            </div>
            <p className="text-xs text-blue-100 pink:text-pink-100">
              {data.nom_pto_ppc || data.nom_pto_muestreo || data.num_pto_muestreo 
                ? `Punto: ${data.nom_pto_ppc || data.nom_pto_muestreo || data.num_pto_muestreo}`
                : data.componente 
                  ? `Componente: ${data.componente}`
                  : `Registro`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition"
            title="Cerrar (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 space-y-4">
          {/* 1. Información General */}
          <div className="bg-gradient-to-br from-blue-50 to-slate-50 dark:from-slate-700 dark:to-slate-800 rounded-lg p-4 border border-blue-100 dark:border-slate-600">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Información General
            </h4>
            <div className="space-y-3 text-sm">
              {data.tipo_de_reporte && (
                <div className="flex items-start gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 min-w-[100px]">Tipo de reporte:</div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 flex-1">
                    {data.tipo_de_reporte}
                  </div>
                </div>
              )}
              {(data.supervision || data.nombre_supervisor) && (
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Supervisor</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {formatSupervisorName(data.supervision || data.nombre_supervisor)}
                    </div>
                  </div>
                </div>
              )}
              {data.fecha && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Fecha de captura</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {formatDate(data.fecha)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Información del Componente */}
          {(data.componente || data.tipo_componente || data.subcomponente || data.detalle_componente) && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                Componente
              </h4>
              <div className="space-y-2 text-sm">
                {data.componente && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Componente</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {data.componente}
                    </div>
                  </div>
                )}
                {data.tipo_componente && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Tipo de componente</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {data.tipo_componente}
                    </div>
                  </div>
                )}
                {data.subcomponente && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Subcomponente</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {data.subcomponente}
                    </div>
                  </div>
                )}
                {data.detalle_componente && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Detalle</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {data.detalle_componente}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Galería de fotos */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Fotografías
            </h4>
            {(() => {
              const photos = data._photos || [];

              console.log('[MapSidebar] 🖼️ Renderizando galería:', {
                photoCount: photos.length,
                hasToken: !!token,
                photos: photos.map(p => ({ filename: p.filename, layer_id: p.layer_id }))
              });

              if (photos.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <FileText className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No hay fotografías disponibles</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((photo, idx) => {
                    const photoUrl = token
                      ? `/api/s123/direct/photo/${codigoAccion}/${data.globalid}/${encodeURIComponent(photo.filename)}?token=${token}`
                      : null;

                    console.log(`[MapSidebar] 📸 Foto ${idx + 1}:`, {
                      filename: photo.filename,
                      url: photoUrl ? photoUrl.substring(0, 100) + '...' : null
                    });

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          console.log('[MapSidebar] 🖱️ Click en foto:', photo.filename);
                          if (onPhotoClick && photoUrl) {
                            onPhotoClick({ url: photoUrl, filename: photo.filename }, idx, photos);
                          }
                        }}
                        className="relative aspect-square bg-slate-200 dark:bg-slate-600 rounded-lg overflow-hidden hover:opacity-90 transition-opacity border border-slate-300 dark:border-slate-500 group"
                        title={photo.filename}
                      >
                        {photoUrl && (
                          <>
                            <img
                              src={photoUrl}
                              alt={photo.filename}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                console.error('[MapSidebar] ❌ Error cargando foto:', photo.filename, photoUrl);
                                e.target.style.display = 'none';
                              }}
                              onLoad={() => {
                                console.log('[MapSidebar] ✅ Foto cargada:', photo.filename);
                              }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <FileText className="w-6 h-6 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* 4. Ubicación Geográfica */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-green-500" />
              Ubicación Geográfica
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Este (UTM)</div>
                <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {data.este}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Norte (UTM)</div>
                <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {data.norte}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Zona UTM</div>
                <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {data.zona}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Latitud/Longitud</div>
                <div className="font-mono font-medium text-slate-900 dark:text-slate-100 text-xs">
                  {marker.lat.toFixed(6)}°, {marker.lon.toFixed(6)}°
                </div>
              </div>
              {data.altitud && (
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <Mountain className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Altitud</div>
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {data.altitud} m.s.n.m.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5. Detalles Adicionales (Hechos y Descripciones) */}
          {(data.descripcionDetallada || data.hechoDetectado || data.descripcionHecho) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-100 dark:border-amber-800/30">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                Detalles Adicionales
              </h4>
              <div className="space-y-3 text-sm">
                {data.hechoDetectado && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Hecho Detectado</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 p-2 rounded border border-amber-100 dark:border-amber-800/30">
                      {data.hechoDetectado}
                    </div>
                  </div>
                )}
                {data.descripcionHecho && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Descripción del Hecho</div>
                    <div className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 p-2 rounded border border-amber-100 dark:border-amber-800/30 whitespace-pre-wrap text-xs leading-relaxed">
                      {data.descripcionHecho}
                    </div>
                  </div>
                )}
                {data.descripcionDetallada && (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Descripción Detallada</div>
                    <div className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 p-2 rounded border border-amber-100 dark:border-amber-800/30 whitespace-pre-wrap text-xs leading-relaxed">
                      {data.descripcionDetallada}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  )
}
