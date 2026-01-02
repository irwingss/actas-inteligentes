import React from 'react'
import { 
  Search, 
  Database, 
  Cloud, 
  Image, 
  CheckCircle2, 
  Loader2,
  AlertCircle
} from 'lucide-react'

/**
 * Componente que muestra las etapas del proceso de carga de datos
 * con indicadores visuales claros para cada fase
 */

const STAGES = {
  idle: { icon: Search, label: 'Esperando', color: 'slate' },
  checking_cache: { icon: Database, label: 'Verificando caché local...', color: 'blue' },
  reading_cache: { icon: Database, label: 'Leyendo desde caché...', color: 'green' },
  syncing: { icon: Cloud, label: 'Sincronizando con ArcGIS...', color: 'blue' },
  downloading_records: { icon: Cloud, label: 'Descargando registros...', color: 'blue' },
  downloading_photos: { icon: Image, label: 'Descargando fotografías...', color: 'blue' },
  preparing: { icon: Database, label: 'Preparando datos...', color: 'blue' },
  running: { icon: Loader2, label: 'Procesando...', color: 'blue' },
  completed: { icon: CheckCircle2, label: 'Completado', color: 'green' },
  error: { icon: AlertCircle, label: 'Error', color: 'red' },
  failed: { icon: AlertCircle, label: 'Error', color: 'red' }
}

const STAGE_ORDER = [
  'checking_cache',
  'syncing',
  'downloading_records', 
  'downloading_photos',
  'preparing',
  'completed'
]

export function LoadingStages({ 
  currentStage = 'idle', 
  message = '', 
  progress = null,
  fromCache = false,
  recordCount = 0,
  photoCount = 0,
  className = ''
}) {
  const stageInfo = STAGES[currentStage] || STAGES.idle
  const Icon = stageInfo.icon
  const isActive = currentStage !== 'idle' && currentStage !== 'completed' && currentStage !== 'error' && currentStage !== 'failed'
  const isCompleted = currentStage === 'completed'
  const isError = currentStage === 'error' || currentStage === 'failed'

  // Determinar qué etapas mostrar basado en si es desde caché o no
  const stagesToShow = fromCache 
    ? ['checking_cache', 'reading_cache', 'preparing', 'completed']
    : ['checking_cache', 'syncing', 'downloading_photos', 'preparing', 'completed']

  const currentStageIndex = stagesToShow.indexOf(currentStage)

  const getStageStatus = (stage, index) => {
    if (isError) return 'error'
    if (stage === currentStage) return 'active'
    if (currentStageIndex > index || isCompleted) return 'completed'
    return 'pending'
  }

  const getStageStyles = (status) => {
    switch (status) {
      case 'completed':
        return {
          circle: 'bg-green-500 dark:bg-green-600 pink:bg-green-500 text-white',
          line: 'bg-green-500 dark:bg-green-600 pink:bg-green-500',
          text: 'text-green-700 dark:text-green-400 pink:text-green-700'
        }
      case 'active':
        return {
          circle: 'bg-blue-500 dark:bg-blue-600 pink:bg-pink-500 text-white animate-pulse',
          line: 'bg-slate-200 dark:bg-slate-700 pink:bg-pink-200',
          text: 'text-blue-700 dark:text-blue-400 pink:text-pink-700 font-medium'
        }
      case 'error':
        return {
          circle: 'bg-red-500 dark:bg-red-600 pink:bg-red-500 text-white',
          line: 'bg-red-200 dark:bg-red-900 pink:bg-red-200',
          text: 'text-red-700 dark:text-red-400 pink:text-red-700'
        }
      default:
        return {
          circle: 'bg-slate-200 dark:bg-slate-700 pink:bg-pink-100 text-slate-400 dark:text-slate-500 pink:text-pink-400',
          line: 'bg-slate-200 dark:bg-slate-700 pink:bg-pink-200',
          text: 'text-slate-400 dark:text-slate-500 pink:text-pink-400'
        }
    }
  }

  if (currentStage === 'idle') return null

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header con estado actual */}
      <div className={`
        flex items-center gap-3 p-4 rounded-lg border transition-all duration-300
        ${isCompleted 
          ? 'bg-green-50 dark:bg-green-900/20 pink:bg-green-50/90 border-green-200 dark:border-green-800 pink:border-green-300' 
          : isError
            ? 'bg-red-50 dark:bg-red-900/20 pink:bg-red-50/90 border-red-200 dark:border-red-800 pink:border-red-300'
            : 'bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50/90 border-blue-200 dark:border-blue-800 pink:border-pink-300'
        }
      `}>
        <div className={`
          flex items-center justify-center w-10 h-10 rounded-full
          ${isCompleted 
            ? 'bg-green-500 dark:bg-green-600 pink:bg-green-500' 
            : isError
              ? 'bg-red-500 dark:bg-red-600 pink:bg-red-500'
              : 'bg-blue-500 dark:bg-blue-600 pink:bg-pink-500'
          }
        `}>
          <Icon className={`w-5 h-5 text-white ${isActive ? 'animate-spin' : ''}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`
            font-medium text-sm
            ${isCompleted 
              ? 'text-green-800 dark:text-green-200 pink:text-green-800' 
              : isError
                ? 'text-red-800 dark:text-red-200 pink:text-red-800'
                : 'text-blue-800 dark:text-blue-200 pink:text-pink-800'
            }
          `}>
            {message || stageInfo.label}
          </p>
          
          {/* Información adicional */}
          {(recordCount > 0 || photoCount > 0) && (
            <p className={`
              text-xs mt-0.5
              ${isCompleted 
                ? 'text-green-600 dark:text-green-400 pink:text-green-600' 
                : 'text-blue-600 dark:text-blue-400 pink:text-pink-600'
              }
            `}>
              {recordCount > 0 && `${recordCount} registros`}
              {recordCount > 0 && photoCount > 0 && ' • '}
              {photoCount > 0 && `${photoCount} fotografías`}
              {fromCache && ' • Desde caché'}
            </p>
          )}
        </div>

        {/* Badge de caché */}
        {fromCache && isCompleted && (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-800/30 pink:bg-green-100 text-green-700 dark:text-green-300 pink:text-green-700 rounded-full">
            ⚡ Caché
          </span>
        )}
      </div>

      {/* Timeline de etapas (solo si está activo) */}
      {isActive && (
        <div className="flex items-center justify-between px-2">
          {stagesToShow.map((stage, index) => {
            const status = getStageStatus(stage, index)
            const styles = getStageStyles(status)
            const StageIcon = STAGES[stage]?.icon || Database
            const isLast = index === stagesToShow.length - 1

            return (
              <React.Fragment key={stage}>
                {/* Círculo de etapa */}
                <div className="flex flex-col items-center">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                    ${styles.circle}
                  `}>
                    {status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : status === 'active' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <StageIcon className="w-4 h-4" />
                    )}
                  </div>
                  <span className={`text-[10px] mt-1 text-center max-w-[60px] leading-tight ${styles.text}`}>
                    {STAGES[stage]?.label.replace('...', '').split(' ')[0]}
                  </span>
                </div>

                {/* Línea conectora */}
                {!isLast && (
                  <div className={`
                    flex-1 h-0.5 mx-1 transition-all duration-300
                    ${status === 'completed' ? styles.line : 'bg-slate-200 dark:bg-slate-700 pink:bg-pink-200'}
                  `} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Barra de progreso detallada */}
      {progress !== null && isActive && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 pink:text-pink-600">
            <span>Progreso</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 dark:bg-blue-600 pink:bg-pink-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Skeleton loader para mostrar mientras se verifica el caché
 */
export function CacheCheckSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-100 dark:bg-slate-800 pink:bg-pink-100/50">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 pink:bg-pink-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-slate-700 pink:bg-pink-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

export default LoadingStages
