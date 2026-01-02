import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Image as ImageIcon, X, Database, Sparkles, ChevronDown, Bot, Minus, Plus, BookOpen, Search, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useChatAI } from '../hooks/useChatAI';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import PhotoSidebar from '../components/PhotoSidebar';
import RAGSidebar from '../components/RAGSidebar';

const MAX_PHOTOS_PER_MESSAGE = 10;

const TEXT_SIZES = [
  { input: 'text-xs', message: 'text-xs', timestamp: 'text-[9px]' },
  { input: 'text-sm', message: 'text-sm', timestamp: 'text-[10px]' },
  { input: 'text-base', message: 'text-base', timestamp: 'text-xs' },
  { input: 'text-lg', message: 'text-lg', timestamp: 'text-sm' },
  { input: 'text-xl', message: 'text-xl', timestamp: 'text-base' }
];

export default function ChatAIPage() {
  const { profile, session } = useAuth();
  const [textSize, setTextSize] = useState(1);
  const [showPhotoSidebar, setShowPhotoSidebar] = useState(false);
  const [showRAGSidebar, setShowRAGSidebar] = useState(false);
  const [showCASelector, setShowCASelector] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [attachedPhotos, setAttachedPhotos] = useState([]);
  const attachedPhotosRef = useRef([]); // Ref para evitar stale closure en handleDrop
  const [isDragging, setIsDragging] = useState(false);
  const [photoFilters, setPhotoFilters] = useState(null);
  const [caSearchQuery, setCaSearchQuery] = useState('');
  const caDropdownRef = useRef(null);
  
  // Mantener el ref sincronizado con el estado
  useEffect(() => {
    attachedPhotosRef.current = attachedPhotos;
  }, [attachedPhotos]);

  const handleGeminiAction = (action) => {
    if (action.action === 'filter_sidebar_photos') {
      setPhotoFilters(action.filters);
      if (!showPhotoSidebar) setShowPhotoSidebar(true);
    }
  };

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
    sendMessageWithPhotos,
    changeCA,
    loadAvailableCAs,
    mode,
    setMode,
    ragActive,
    setRagActive,
    selectedRAGStore,
    setSelectedRAGStore
  } = useChatAI(null, handleGeminiAction);

  // El hook useChatAI ahora carga los CAs automáticamente cuando la sesión está lista
  
  useEffect(() => {
    document.documentElement.classList.add('overflow-hidden');
    return () => document.documentElement.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    if (selectedCA) setShowPhotoSidebar(true);
  }, [selectedCA]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (caDropdownRef.current && !caDropdownRef.current.contains(event.target)) {
        setShowCASelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar CAs según búsqueda
  const filteredCAs = availableCAs.filter(ca => {
    const codigo = ca.caCode || ca;
    return String(codigo).toLowerCase().includes(caSearchQuery.toLowerCase());
  });

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      attachedPhotos.length > 0 ? handleSendWithPhotos() : sendMessage();
    }
  };

  const handleSendWithPhotos = async () => {
    if (!input.trim() && attachedPhotos.length === 0) return;
    const photosToSend = attachedPhotos.map(p => ({ gid: p.gid, filename: p.filename || p.files?.[0] }));
    const messageText = input.trim() || '¿Qué puedes decirme sobre estas fotografías?';
    const photosData = attachedPhotos.map(p => ({ gid: p.gid, filename: p.filename || p.files?.[0], metadata: p.metadata }));
    setAttachedPhotos([]);
    await sendMessageWithPhotos(photosToSend, messageText, photosData);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation(); // Evitar conflicto con Tauri
    setIsDragging(false);
    const photoData = e.dataTransfer.getData('application/json');
    if (!photoData) return;
    
    try {
      const photo = JSON.parse(photoData);
      console.log('[ChatAI] 📥 Drop recibido:', { gid: photo.gid, filename: photo.filename, files: photo.files });
      
      // Usar el ref para obtener el valor actualizado (evita stale closure)
      const currentPhotos = attachedPhotosRef.current;
      
      if (currentPhotos.length >= MAX_PHOTOS_PER_MESSAGE) {
        alert(`⚠️ Máximo ${MAX_PHOTOS_PER_MESSAGE} fotos por mensaje`);
        return;
      }
      // Obtener el identificador único de la foto (soporta ambos formatos: filename o files[])
      const newPhotoId = photo.filename || photo.files?.[0];
      console.log('[ChatAI] 🔍 Buscando duplicado:', { newPhotoId, gid: photo.gid });
      console.log('[ChatAI] 📋 Fotos actuales:', currentPhotos.map(p => ({ gid: p.gid, id: p.filename || p.files?.[0] })));
      
      const isDuplicate = currentPhotos.some(p => {
        const existingPhotoId = p.filename || p.files?.[0];
        const match = p.gid === photo.gid && existingPhotoId === newPhotoId;
        if (match) console.log('[ChatAI] ⚠️ Duplicado encontrado:', { existingPhotoId, newPhotoId });
        return match;
      });
      
      if (!isDuplicate) {
        console.log('[ChatAI] ✅ Añadiendo foto');
        setAttachedPhotos(prev => [...prev, photo]);
      } else {
        console.log('[ChatAI] ❌ Foto ya existe, no se añade');
      }
    } catch (err) {
      console.error('Error al procesar foto:', err);
    }
  };

  const getUserInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ');
      return names.length > 1 ? `${names[0][0]}${names[names.length - 1][0]}` : names[0][0];
    }
    return profile?.email?.[0]?.toUpperCase() || 'U';
  };

  const currentSize = TEXT_SIZES[textSize];

  return (
    <div className="fixed top-[88px] left-0 right-0 bottom-0 bg-slate-50 dark:bg-slate-950 pink:bg-gradient-to-br pink:from-[#fbb2d4] pink:to-[#ffdaeb] flex">
      {/* Main Chat Area */}
      <div 
        className="flex-1 flex flex-col overflow-hidden"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
        onDragLeave={(e) => { e.stopPropagation(); setIsDragging(false); }}
        onDrop={handleDrop}
      >
        {/* Header Interno */}
        <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 pink:border-pink-200 bg-white dark:bg-slate-900 pink:bg-white/95 px-6 py-4 z-10">
          <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto">
            {/* Left: Logo & CA Selector */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 pink:from-[#ff0075] pink:to-[#ff6eb4] flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">Aisa</h1>
                  <p className="text-xs text-slate-500 pink:text-[#64748b]">Asistente IA</p>
                </div>
              </div>

              {/* CA Selector con búsqueda */}
              <div className="relative" ref={caDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCASelector(!showCASelector)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 min-w-[200px] bg-slate-100 dark:bg-slate-800 pink:bg-white hover:bg-slate-200 dark:hover:bg-slate-700 pink:hover:bg-pink-100 rounded-lg transition-colors border border-transparent dark:border-slate-600 pink:border-pink-300"
                >
                  {loadingCAs ? (
                    <span className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando...
                    </span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-[#ff0075]" />
                        <span className={`text-sm font-medium ${selectedCA ? 'text-slate-900 dark:text-white pink:text-[#0f172a]' : 'text-slate-400'}`}>
                          {selectedCA || 'Seleccionar CA...'}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-500 pink:text-[#ff0075] transition-transform ${showCASelector ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>

                {/* Dropdown */}
                {showCASelector && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-600 pink:border-pink-300 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
                    {/* Búsqueda */}
                    <div className="p-2 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={caSearchQuery}
                          onChange={(e) => setCaSearchQuery(e.target.value)}
                          placeholder="Buscar CA..."
                          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 pink:border-pink-200 rounded-lg bg-slate-50 dark:bg-slate-700 pink:bg-pink-50 text-slate-900 dark:text-white pink:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    {/* Lista de CAs */}
                    <div className="overflow-y-auto max-h-72">
                      {filteredCAs.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                          {availableCAs.length === 0 
                            ? 'No hay CAs disponibles. Sincroniza datos primero.'
                            : 'No se encontraron resultados'
                          }
                        </div>
                      ) : (
                        filteredCAs.map((ca, idx) => {
                          const codigo = ca.caCode || ca;
                          const registros = ca.total;
                          const fotos = ca.totalPhotos;
                          const isSelected = selectedCA === codigo;
                          
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                changeCA(codigo);
                                setShowCASelector(false);
                                setCaSearchQuery('');
                              }}
                              className={`
                                w-full flex items-center justify-between px-4 py-3 text-left transition-colors border-b border-slate-100 dark:border-slate-700 pink:border-pink-100 last:border-0
                                ${isSelected 
                                  ? 'bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-100 text-blue-700 dark:text-blue-300 pink:text-pink-700' 
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 pink:hover:bg-pink-50 text-slate-700 dark:text-slate-300 pink:text-slate-700'
                                }
                              `}
                            >
                              <div>
                                <div className="font-medium text-sm">{codigo}</div>
                                {(registros !== undefined || fotos !== undefined) && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b] mt-0.5">
                                    {registros !== undefined && `${registros} registros`}
                                    {registros !== undefined && fotos !== undefined && ' • '}
                                    {fotos !== undefined && `${fotos} fotos`}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <div className="w-2 h-2 rounded-full bg-blue-500 pink:bg-pink-500" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
              {/* Text Size */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 pink:bg-white pink:border pink:border-pink-300 rounded-lg">
                <button onClick={() => setTextSize(Math.max(0, textSize - 1))} disabled={textSize === 0} className="text-slate-600 dark:text-slate-400 pink:text-[#ff0075] disabled:opacity-50">
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className={`w-1 h-3 rounded-full ${i <= textSize ? 'bg-blue-500 pink:bg-[#ff0075]' : 'bg-slate-300 pink:bg-pink-200'}`} />
                  ))}
                </div>
                <button onClick={() => setTextSize(Math.min(4, textSize + 1))} disabled={textSize === 4} className="text-slate-600 dark:text-slate-400 pink:text-[#ff0075] disabled:opacity-50">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Clear, Photos & RAG */}
              {selectedCA && (
                <>
                  {messages.length > 1 && (
                    <button onClick={() => setShowClearDialog(true)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 rounded-lg">
                      <Trash2 className="w-5 h-5 text-slate-600 dark:text-slate-400 pink:text-[#ff0075]" />
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (!showPhotoSidebar) setShowRAGSidebar(false); // Cerrar RAG si abrimos fotos
                      setShowPhotoSidebar(!showPhotoSidebar);
                    }}
                    className={`p-2 rounded-lg ${showPhotoSidebar ? 'bg-blue-500 pink:bg-[#ff0075] text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 pink:text-[#ff0075]'}`}
                    title="Fotografías"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      if (!showRAGSidebar) setShowPhotoSidebar(false); // Cerrar fotos si abrimos RAG
                      setShowRAGSidebar(!showRAGSidebar);
                    }}
                    className={`p-2 rounded-lg ${showRAGSidebar ? 'bg-purple-500 pink:bg-[#ff0075] text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 pink:hover:bg-pink-100 pink:text-[#ff0075]'}`}
                    title="Documentos RAG"
                  >
                    <BookOpen className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Context Bar */}
          {context && (
            <div className="flex items-center gap-4 max-w-6xl mx-auto mt-3 px-4 py-2 bg-slate-100 dark:bg-slate-800 pink:bg-white pink:border pink:border-pink-200 rounded-lg text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">{selectedCA}</span>
              <span className="text-slate-500 pink:text-pink-400">•</span>
              <span className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">{context.recordCount} registros</span>
              <span className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">{context.totalPhotos} fotos</span>
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {!selectedCA ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 pink:from-[#ff0075] pink:to-[#ff6eb4] flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a] mb-3">¡Hola! Soy Aisa</h2>
                <p className="text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                  Selecciona un código de acción para comenzar
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 pink:from-[#ff0075] pink:to-[#ff6eb4] flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  )}
                  
                  <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-500 pink:bg-[#ff0075] text-white'
                      : 'bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-200'
                  }`}>
                    {msg.hasPhotos && msg.attachedPhotos && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {msg.attachedPhotos.map((photo, i) => (
                          <img
                            key={i}
                            src={`/api/s123/direct/photo/${selectedCA}/${photo.gid}/${photo.filename}?token=${session?.access_token}`}
                            alt="Foto"
                            className="w-full h-20 object-cover rounded-lg"
                          />
                        ))}
                      </div>
                    )}
                    
                    <div className={`${currentSize.message} ${msg.role === 'assistant' ? 'text-slate-900 dark:text-slate-100 pink:text-[#0f172a]' : ''}`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    
                    <div className={`${currentSize.timestamp} mt-2 ${msg.role === 'user' ? 'text-white/70' : 'text-slate-500 pink:text-[#64748b]'}`}>
                      {msg.timestamp?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-slate-700 dark:bg-slate-600 pink:bg-[#ff0075] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {getUserInitials()}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Loader mientras la AI responde */}
              {loading && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 pink:from-[#ff0075] pink:to-[#ff6eb4] flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-200 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500 pink:bg-[#ff0075] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 pink:bg-[#ff0075] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 pink:bg-[#ff0075] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
                        Aisa está analizando...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        {selectedCA && (
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 pink:border-pink-200 bg-white dark:bg-slate-900 pink:bg-white/95 px-6 py-4">
            {/* Attached Photos */}
            {attachedPhotos.length > 0 && (
              <div className="max-w-4xl mx-auto mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
                    {attachedPhotos.length} foto(s) adjunta(s)
                  </span>
                  <span className="text-xs text-slate-500 pink:text-[#64748b]">Máx: {MAX_PHOTOS_PER_MESSAGE}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {attachedPhotos.map((photo, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={`/api/s123/direct/photo/${selectedCA}/${photo.gid}/${photo.filename || photo.files?.[0]}?token=${session?.access_token}`}
                        alt="Adjunto"
                        className="w-20 h-20 object-cover rounded-lg border-2 border-slate-200 dark:border-slate-700 pink:border-pink-300"
                      />
                      <button
                        onClick={() => setAttachedPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="max-w-4xl mx-auto">
              {/* Mode Switch */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setMode('ca')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'ca' ? 'bg-blue-500 pink:bg-[#ff0075] text-white' : 'bg-slate-100 dark:bg-slate-800 pink:bg-white pink:border pink:border-pink-300 text-slate-700 dark:text-slate-300 pink:text-[#0f172a]'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Datos CA
                </button>
                <button
                  onClick={() => setMode('normativa')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'normativa' ? 'bg-blue-500 pink:bg-[#ff0075] text-white' : 'bg-slate-100 dark:bg-slate-800 pink:bg-white pink:border pink:border-pink-300 text-slate-700 dark:text-slate-300 pink:text-[#0f172a]'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Internet
                </button>
              </div>

              {/* Input */}
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={mode === 'normativa' ? 'Pregunta sobre normativas...' : 'Escribe tu pregunta...'}
                  disabled={loading}
                  className={`flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 pink:bg-white border border-slate-200 dark:border-slate-700 pink:border-pink-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 pink:focus:ring-[#ff0075] text-slate-900 dark:text-white pink:text-[#0f172a] placeholder:text-slate-400 pink:placeholder:text-pink-300 ${currentSize.input}`}
                  rows={2}
                />
                <button
                  onClick={attachedPhotos.length > 0 ? handleSendWithPhotos : sendMessage}
                  disabled={loading || (!input.trim() && attachedPhotos.length === 0)}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 pink:bg-[#ff0075] pink:hover:bg-[#e6006a] text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/20 pink:bg-[#ff0075]/20 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-white dark:bg-slate-800 pink:bg-white px-8 py-6 rounded-2xl shadow-2xl">
              <ImageIcon className="w-16 h-16 text-blue-500 pink:text-[#ff0075] mx-auto mb-3" />
              <p className="text-xl font-bold text-slate-900 dark:text-white pink:text-[#0f172a]">Suelta la foto aquí</p>
            </div>
          </div>
        )}
      </div>

      {/* Photo Sidebar - Empuja el contenido */}
      <div 
        className={`flex-shrink-0 border-l border-slate-200 dark:border-slate-800 pink:border-pink-200 bg-white dark:bg-slate-900 pink:bg-white/95 transition-all duration-300 overflow-hidden ${
          showPhotoSidebar && selectedCA && !showRAGSidebar ? 'w-[420px]' : 'w-0'
        }`}
      >
        {selectedCA && showPhotoSidebar && !showRAGSidebar && (
          <div className="w-[420px] h-full">
            <PhotoSidebar
              caCode={selectedCA}
              initialFilters={photoFilters}
              onClose={() => setShowPhotoSidebar(false)}
              onPhotoSelect={(photo) => console.log('Foto:', photo)}
              onAnalyzePhotos={(photos) => setAttachedPhotos(photos)}
            />
          </div>
        )}
      </div>

      {/* RAG Sidebar - Empuja el contenido */}
      <div 
        className={`flex-shrink-0 border-l border-slate-200 dark:border-slate-800 pink:border-pink-200 bg-white dark:bg-slate-900 pink:bg-white/95 transition-all duration-300 overflow-hidden ${
          showRAGSidebar && !showPhotoSidebar ? 'w-[420px]' : 'w-0'
        }`}
      >
        {showRAGSidebar && !showPhotoSidebar && (
          <div className="w-[420px] h-full">
            <RAGSidebar
              onClose={() => setShowRAGSidebar(false)}
              onStoreSelected={(store) => setSelectedRAGStore(store)}
              ragActive={ragActive}
              setRagActive={setRagActive}
            />
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        onConfirm={() => { if (selectedCA) changeCA(selectedCA); }}
        title="¿Limpiar conversación?"
        message="Se borrará todo el historial de mensajes."
        confirmText="Sí, limpiar"
        cancelText="Cancelar"
        type="warning"
      />
    </div>
  );
}
