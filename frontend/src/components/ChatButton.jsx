/**
 * Botón flotante para abrir el ChatAI
 */

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ChatAI from './ChatAI';

export default function ChatButton({ jobId, caCode, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!jobId || !caCode) return null;

  return (
    <>
      {/* Botón flotante */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          className="fixed bottom-6 right-6 z-30 p-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          title="Abrir Asistente AI"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Asistente AI - Analiza tus datos
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
          </div>
        </button>
      )}

      {/* Chat Modal */}
      {isOpen && (
        <ChatAI
          jobId={jobId}
          caCode={caCode}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
