import React from 'react'
import { AlertTriangle, X, Trash2 } from 'lucide-react'

/**
 * Modal de confirmación para eliminar capas
 */
export function DeleteLayerConfirm({ layer, onConfirm, onCancel, isDeleting = false }) {
  if (!layer) return null
  
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Eliminar Capa
            </h2>
          </div>
          
          {!isDeleting && (
            <button
              onClick={onCancel}
              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          )}
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            ¿Estás seguro que deseas eliminar la capa <strong>"{layer.name}"</strong>?
          </p>
          
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-semibold mb-1">Esta acción no se puede deshacer</p>
                <p>El archivo se eliminará permanentemente del sistema.</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Eliminando...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Eliminar Capa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
