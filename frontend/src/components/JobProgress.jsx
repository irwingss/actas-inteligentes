import React, { useEffect, useState, useRef } from 'react'
import api from '../lib/axios'
import { 
  Database, 
  Cloud, 
  Image, 
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Zap
} from 'lucide-react'

// Mapeo de estados a información visual
const STATUS_INFO = {
  pending: { 
    icon: Loader2, 
    label: 'Iniciando...', 
    color: 'blue',
    animate: true 
  },
  checking_cache: { 
    icon: Database, 
    label: 'Verificando caché local...', 
    color: 'blue',
    animate: true 
  },
  reading_cache: { 
    icon: Zap, 
    label: 'Leyendo desde caché...', 
    color: 'green',
    animate: true 
  },
  syncing: { 
    icon: Cloud, 
    label: 'Sincronizando con ArcGIS...', 
    color: 'blue',
    animate: true 
  },
  preparing: { 
    icon: Database, 
    label: 'Preparando datos...', 
    color: 'blue',
    animate: true 
  },
  running: { 
    icon: Loader2, 
    label: 'Procesando...', 
    color: 'blue',
    animate: true 
  },
  completed: { 
    icon: CheckCircle2, 
    label: 'Completado', 
    color: 'green',
    animate: false 
  },
  failed: { 
    icon: AlertCircle, 
    label: 'Error', 
    color: 'red',
    animate: false 
  },
  error: { 
    icon: AlertCircle, 
    label: 'Error', 
    color: 'red',
    animate: false 
  }
}

export function JobProgress({ jobId, onComplete, onJobNotFound }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [completedCalled, setCompletedCalled] = useState(false)
  const [animatedRecordsPct, setAnimatedRecordsPct] = useState(0)
  const [animatedPhotosPct, setAnimatedPhotosPct] = useState(0)
  const onCompleteRef = useRef(onComplete)
  const onJobNotFoundRef = useRef(onJobNotFound)
  
  // Mantener las referencias actualizadas
  useEffect(() => {
    onCompleteRef.current = onComplete
    onJobNotFoundRef.current = onJobNotFound
  }, [onComplete, onJobNotFound])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let interval
    let hasCalledComplete = false

    const fetchStatus = async () => {
      try {
        const { data } = await api.get(`/api/s123/status/${jobId}`)
        if (cancelled) return
        setStatus(data)
        if (data?.status === 'completed' || data?.status === 'failed' || data?.status === 'error') {
          clearInterval(interval)
          // Solo llamar onComplete UNA VEZ
          if (data?.status === 'completed' && typeof onCompleteRef.current === 'function' && !hasCalledComplete) {
            hasCalledComplete = true
            setCompletedCalled(true)
            onCompleteRef.current(data)
          }
        }
      } catch (e) {
        if (cancelled) return
        // Si es 404, el job ya no existe (expiró o se limpió)
        if (e?.response?.status === 404) {
          clearInterval(interval)
          setError('Job expirado. Por favor, obtén los datos nuevamente.')
          // Notificar al padre para que limpie el jobId
          if (typeof onJobNotFoundRef.current === 'function') {
            onJobNotFoundRef.current()
          }
        } else {
          setError(e?.message || 'Error consultando estado')
        }
      }
    }

    fetchStatus()
    interval = setInterval(fetchStatus, 1000) // Polling más frecuente para mejor feedback

    return () => { cancelled = true; clearInterval(interval) }
  }, [jobId])

  // Animación suave de las barras de progreso
  useEffect(() => {
    const total = status?.total || 0
    const fetched = status?.fetched || 0
    const attDl = status?.attachmentsDownloaded || 0
    const attTotal = status?.attachmentsTotal || 0
    const withAtt = status?.withAttachments || 0

    const targetRecordsPct = total > 0 ? Math.min(100, Math.round((fetched / total) * 100)) : 0
    const targetPhotosPct = attTotal > 0
      ? Math.min(100, Math.round((attDl / attTotal) * 100))
      : (withAtt > 0 ? Math.min(100, Math.round((attDl / withAtt) * 100)) : 0)

    // Animar hacia el valor objetivo
    const animateProgress = () => {
      setAnimatedRecordsPct(prev => {
        if (prev < targetRecordsPct) return Math.min(prev + 2, targetRecordsPct)
        return targetRecordsPct
      })
      setAnimatedPhotosPct(prev => {
        if (prev < targetPhotosPct) return Math.min(prev + 2, targetPhotosPct)
        return targetPhotosPct
      })
    }

    const animationInterval = setInterval(animateProgress, 30)
    return () => clearInterval(animationInterval)
  }, [status])

  if (!jobId) return null

  const total = status?.total || 0
  const fetched = status?.fetched || 0
  const withAtt = status?.withAttachments || 0
  const attDl = status?.attachmentsDownloaded || 0
  const attTotal = status?.attachmentsTotal || 0
  const fromCache = status?.fromCache || false

  const currentStatus = status?.status || 'pending'
  const statusInfo = STATUS_INFO[currentStatus] || STATUS_INFO.pending
  const StatusIcon = statusInfo.icon

  const isActive = !['completed', 'failed', 'error'].includes(currentStatus)
  const isCompleted = currentStatus === 'completed'
  const isError = currentStatus === 'failed' || currentStatus === 'error'

  // Colores según estado
  const getColorClasses = (color) => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20 pink:bg-green-50/90',
          border: 'border-green-200 dark:border-green-800 pink:border-green-300',
          icon: 'bg-green-500 dark:bg-green-600 pink:bg-green-500',
          text: 'text-green-800 dark:text-green-200 pink:text-green-800',
          subtext: 'text-green-600 dark:text-green-400 pink:text-green-600'
        }
      case 'red':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20 pink:bg-red-50/90',
          border: 'border-red-200 dark:border-red-800 pink:border-red-300',
          icon: 'bg-red-500 dark:bg-red-600 pink:bg-red-500',
          text: 'text-red-800 dark:text-red-200 pink:text-red-800',
          subtext: 'text-red-600 dark:text-red-400 pink:text-red-600'
        }
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50/90',
          border: 'border-blue-200 dark:border-blue-800 pink:border-pink-300',
          icon: 'bg-blue-500 dark:bg-blue-600 pink:bg-pink-500',
          text: 'text-blue-800 dark:text-blue-200 pink:text-pink-800',
          subtext: 'text-blue-600 dark:text-blue-400 pink:text-pink-600'
        }
    }
  }

  const colors = getColorClasses(statusInfo.color)

  return (
    <div className="space-y-4">
      {/* Header con estado actual */}
      <div className={`
        flex items-center gap-3 p-4 rounded-lg border transition-all duration-300
        ${colors.bg} ${colors.border}
      `}>
        <div className={`
          flex items-center justify-center w-10 h-10 rounded-full
          ${colors.icon}
        `}>
          <StatusIcon className={`w-5 h-5 text-white ${statusInfo.animate ? 'animate-spin' : ''}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${colors.text}`}>
            {status?.message || statusInfo.label}
          </p>
          
          {/* Información adicional */}
          {(total > 0 || attTotal > 0) && (
            <p className={`text-xs mt-0.5 ${colors.subtext}`}>
              {total > 0 && `${fetched}/${total} registros`}
              {total > 0 && attTotal > 0 && ' • '}
              {attTotal > 0 && `${attDl}/${attTotal} fotos`}
            </p>
          )}
        </div>

        {/* Badge de caché */}
        {fromCache && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-800/30 pink:bg-green-100 text-green-700 dark:text-green-300 pink:text-green-700 rounded-full">
            <Zap className="w-3 h-3" />
            Caché
          </span>
        )}
      </div>

      {/* Barras de progreso (solo si hay datos) */}
      {(total > 0 || attTotal > 0 || isActive) && (
        <div className="space-y-3">
          {/* Registros */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pink:text-pink-700">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Registros
              </span>
              <span className="font-medium">{fetched}/{total || '?'}</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-150 ease-out ${
                  animatedRecordsPct >= 100 
                    ? 'bg-green-500 dark:bg-green-600 pink:bg-green-500' 
                    : 'bg-blue-500 dark:bg-blue-600 pink:bg-pink-500'
                }`}
                style={{ width: `${animatedRecordsPct}%` }}
              />
            </div>
          </div>

          {/* Fotografías */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 pink:text-pink-700">
              <span className="flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5" />
                Fotografías
              </span>
              <span className="font-medium">{attDl}/{attTotal || withAtt || '?'}</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-150 ease-out ${
                  animatedPhotosPct >= 100 
                    ? 'bg-green-500 dark:bg-green-600 pink:bg-green-500' 
                    : 'bg-blue-500 dark:bg-blue-600 pink:bg-pink-500'
                }`}
                style={{ width: `${animatedPhotosPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error del job */}
      {status?.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 pink:bg-red-50 border border-red-200 dark:border-red-800 pink:border-red-200 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200 pink:text-red-800 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {status.error}
          </p>
        </div>
      )}
      
      {/* Error de polling */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}
