/**
 * ChatAI Window - Ventana emergente del chatbot
 * Versión flotante/modal del asistente AI
 */

import { useState, useEffect } from 'react';
import { X, Send, Maximize2, Minimize2, Sparkles, FileText, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useChatAI } from '../hooks/useChatAI';

export default function ChatAIWindow({ initialCaCode = null, onClose }) {
  const {
    messages,
    input,
    loading,
    context,
    selectedCA,
    availableCAs,
    loadingCAs,
    messagesEndRef,
    setInput,
    sendMessage,
    generateSummary,
    changeCA,
    loadAvailableCAs
  } = useChatAI(initialCaCode);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showCASelector, setShowCASelector] = useState(false);

  // El hook useChatAI ahora carga los CAs automáticamente cuando la sesión está lista

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCAChange = (caCode) => {
    changeCA(caCode);
    setShowCASelector(false);
  };

  return (
    <div 
      className={`fixed bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 z-50 ${
        isExpanded 
          ? 'inset-4' 
          : 'bottom-4 right-4 w-96 h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-primary-500 to-primary-600 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Asistente OEFA</h3>
            {selectedCA && (
              <p className="text-xs text-white/80">CA: {selectedCA}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title={isExpanded ? 'Minimizar' : 'Maximizar'}
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4 text-white" />
            ) : (
              <Maximize2 className="w-4 h-4 text-white" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Selector de CA */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <div className="relative">
          <button
            onClick={() => setShowCASelector(!showCASelector)}
            disabled={loadingCAs}
            className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:border-primary-500 transition-colors"
          >
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {selectedCA || 'Seleccionar CA...'}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCASelector ? 'rotate-180' : ''}`} />
          </button>

          {showCASelector && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
              {availableCAs.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  No hay CAs descargados disponibles
                </div>
              ) : (
                availableCAs.map((ca) => (
                  <button
                    key={ca.caCode}
                    onClick={() => handleCAChange(ca.caCode)}
                    className={`w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                      selectedCA === ca.caCode ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                      {ca.caCode}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {ca.total} registros • {ca.totalPhotos} fotos
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context Info */}
      {context && (
        <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-800">
          <div className="flex items-center gap-4 text-xs text-primary-700 dark:text-primary-300">
            <span>📊 {context.recordCount} registros</span>
            <span>📸 {context.totalPhotos} fotos</span>
            <span>📁 {context.photoGroups} grupos</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-white'
                  : msg.isError
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent"></div>
                  <span className="text-sm">{msg.content}</span>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
              <div className={`text-xs mt-2 ${msg.role === 'user' ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                {msg.timestamp?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {selectedCA && messages.length <= 1 && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={generateSummary}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">Generar Resumen Ejecutivo</span>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedCA ? "Escribe tu pregunta..." : "Selecciona un CA primero..."}
            disabled={loading || !selectedCA}
            className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 disabled:opacity-50"
            rows={2}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim() || !selectedCA}
            className="px-4 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
