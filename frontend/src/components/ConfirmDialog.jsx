/**
 * ConfirmDialog - Modal de confirmación con estilo de 3 modos
 */

import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = '¿Estás seguro?',
  message = '¿Deseas continuar con esta acción?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning' // 'warning', 'danger', 'info'
}) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const typeStyles = {
    warning: {
      icon: 'text-yellow-500 dark:text-yellow-400 pink:text-yellow-600',
      iconBg: 'bg-yellow-100 dark:bg-yellow-900/30 pink:bg-yellow-200',
      confirmBtn: 'bg-yellow-500 hover:bg-yellow-600 pink:bg-yellow-600 pink:hover:bg-yellow-700 text-white'
    },
    danger: {
      icon: 'text-red-500 dark:text-red-400 pink:text-red-600',
      iconBg: 'bg-red-100 dark:bg-red-900/30 pink:bg-red-200',
      confirmBtn: 'bg-red-500 hover:bg-red-600 pink:bg-red-600 pink:hover:bg-red-700 text-white'
    },
    info: {
      icon: 'text-blue-500 dark:text-blue-400 pink:text-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30 pink:bg-blue-200',
      confirmBtn: 'bg-blue-500 hover:bg-blue-600 pink:bg-blue-600 pink:hover:bg-blue-700 text-white'
    }
  };

  const styles = typeStyles[type] || typeStyles.warning;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70 pink:bg-pink-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 pink:bg-gradient-to-br pink:from-pink-50 pink:to-rose-50 rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-scale-in border border-slate-200 dark:border-slate-700 pink:border-pink-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-200 transition-colors"
          title="Cerrar"
        >
          <X className="w-4 h-4 text-slate-400 dark:text-slate-500 pink:text-pink-600" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mb-4`}>
            <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-slate-900 dark:text-white pink:text-pink-900 mb-2">
            {title}
          </h3>

          {/* Message */}
          <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-6">
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 pink:border-pink-400 text-slate-700 dark:text-slate-300 pink:text-pink-900 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors shadow-md ${styles.confirmBtn}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
