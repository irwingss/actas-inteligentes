/**
 * ChatAI - Asistente de Supervisión Ambiental con Gemini
 * Analiza datos de campo y fotografías de códigos de acción
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, FileText, Camera, Sparkles, X, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';

export default function ChatAI({ jobId, caCode, onClose }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Usar caCode o jobId (legacy)
  const codigo = caCode || jobId;

  // Auto-scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cargar contexto del CA al montar
  useEffect(() => {
    loadContext();
    // Mensaje de bienvenida
    setMessages([{
      role: 'assistant',
      content: `¡Hola! Soy AISA tu asistente inteligente para la supervisión ambiental de la CHID-DSEM en el OEFA. Estoy aquí para ayudarte a analizar los datos del código de acción **${codigo}**.\n\nPuedo ayudarte con:\n- 📊 Análisis de datos de campo\n- 📸 Revisión de fotografías\n- 📈 Estadísticas y resúmenes\n- 🔍 Búsqueda de información específica\n\n¿En qué puedo asistirte?`,
      timestamp: new Date()
    }]);
  }, [codigo]);

  const loadContext = async () => {
    try {
      const response = await axios.get(`/api/chat/context/${codigo}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });
      if (response.data.success) {
        setContext(response.data.context);
      }
    } catch (error) {
      console.error('Error cargando contexto:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Construir historial para el API
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await axios.post('/api/chat/message', {
        caCode: codigo,
        message: userMessage.content,
        history
      }, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        const assistantMessage = {
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date(),
          tokensUsed: response.data.tokensUsed
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const generateSummary = async () => {
    setLoading(true);
    
    const loadingMessage = {
      role: 'assistant',
      content: '📊 Generando resumen ejecutivo del código de acción...',
      timestamp: new Date(),
      isLoading: true
    };
    
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await axios.post('/api/chat/summary', { caCode: codigo }, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        // Reemplazar mensaje de carga con el resumen
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: response.data.summary,
            timestamp: new Date(),
            tokensUsed: response.data.tokensUsed,
            isSummary: true
          };
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Error generando resumen:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: 'assistant',
          content: 'Lo siento, ocurrió un error al generar el resumen.',
          timestamp: new Date(),
          isError: true
        };
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    if (messages.length <= 1) return; // Solo hay mensaje de bienvenida
    
    if (window.confirm('¿Estás seguro de que deseas borrar toda la conversación actual?')) {
      // Reiniciar con solo el mensaje de bienvenida
      setMessages([{
        role: 'assistant',
        content: `¡Hola! Soy Aisa, tu asistente inteligente para la supervisión ambiental. Estoy aquí para ayudarte a analizar los datos del código de acción **${codigo}**.\n\nPuedo ayudarte con:\n- 📊 Análisis de datos de campo\n- 📸 Revisión de fotografías\n- 📈 Estadísticas y resúmenes\n- 🔍 Búsqueda de información específica\n\n¿En qué puedo asistirte?`,
        timestamp: new Date()
      }]);
      setInput('');
    }
  };

  const suggestedQuestions = [
    '¿Cuántos registros hay en total?',
    '¿Qué supervisores participaron?',
    '¿Cuáles son los componentes más frecuentes?',
    'Muestra un resumen de las fechas',
    '¿Hay algún patrón en los datos?'
  ];

  return (
    <div className={`fixed bg-white dark:bg-slate-800 shadow-2xl rounded-lg flex flex-col transition-all duration-300 ${
      isExpanded 
        ? 'inset-4 z-50' 
        : 'bottom-4 right-4 w-96 h-[600px] z-40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Asistente OEFA</h3>
            <p className="text-xs text-blue-100">CA: {caCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearConversation}
            disabled={messages.length <= 1 || loading}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Limpiar conversación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title={isExpanded ? 'Minimizar' : 'Maximizar'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Info */}
      {context && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {context.recordCount} registros
            </span>
            <span className="flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {context.totalPhotos} fotos
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            
            <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
              <div className={`rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.isError
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
              }`}>
                {message.isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{message.content}</span>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              
              {message.tokensUsed && (
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 px-2">
                  {message.tokensUsed.total} tokens
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-slate-100 dark:from-blue-900/20 dark:to-slate-700 rounded-lg px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Analizando datos...</span>
                  <span className="text-xs opacity-75">Gemini está procesando tu consulta</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length === 1 && !loading && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Preguntas sugeridas:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => setInput(question)}
                className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-full transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <button
          onClick={generateSummary}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">Generar Resumen Ejecutivo</span>
        </button>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escribe tu pregunta..."
            disabled={loading}
            rows={2}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[48px]"
            title={loading ? "Enviando..." : "Enviar mensaje"}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Presiona Enter para enviar, Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}
