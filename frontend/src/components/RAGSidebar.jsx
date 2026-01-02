/**
 * RAGSidebar - Panel lateral para gestión de documentos RAG (File Search)
 * Permite crear stores, subir documentos y activar búsqueda semántica
 */

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { 
  X, FileText, Upload, Trash2, Plus, Loader2, FolderOpen, 
  Database, CheckCircle2, AlertCircle, BookOpen, Sparkles
} from 'lucide-react';
import { useRAG } from '../hooks/useRAG';

export default function RAGSidebar({ onClose, onStoreSelected, ragActive, setRagActive }) {
  const {
    stores,
    selectedStore,
    documents,
    loading,
    uploading,
    error,
    createStore,
    deleteStore,
    selectStore,
    uploadFile,
    deleteDocument,
    formatFileSize,
    formatStoreName
  } = useRAG();

  const [showCreateStore, setShowCreateStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  /**
   * Crea un nuevo store
   */
  const handleCreateStore = async () => {
    if (!newStoreName.trim()) return;

    const toastId = toast.loading('Creando store...');
    
    try {
      const store = await createStore(newStoreName.trim());
      setNewStoreName('');
      setShowCreateStore(false);
      
      // Seleccionar el nuevo store automáticamente
      await selectStore(store);
      if (onStoreSelected) {
        onStoreSelected(store);
      }
      
      toast.success(`Store "${newStoreName.trim()}" creado`, { id: toastId });
    } catch (err) {
      console.error('Error creando store:', err);
      toast.error('Error al crear el store', { id: toastId });
    }
  };

  /**
   * Maneja la selección de un store
   */
  const handleSelectStore = async (store) => {
    await selectStore(store);
    if (onStoreSelected) {
      onStoreSelected(store);
    }
  };

  /**
   * Parsea errores de Gemini para mostrar mensajes amigables
   */
  const parseGeminiError = (error, filename) => {
    const errorMsg = error.response?.data?.error || error.message || 'Error desconocido';
    
    // Errores comunes de Gemini
    if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('Failed to count tokens')) {
      return {
        title: `Error procesando "${filename}"`,
        message: 'El servicio de Gemini no pudo procesar el archivo. Esto puede ocurrir con PDFs muy grandes o con contenido complejo (imágenes escaneadas). Intenta con un archivo más pequeño o reintenta más tarde.',
        type: 'gemini_unavailable'
      };
    }
    
    if (errorMsg.includes('413') || errorMsg.includes('too large')) {
      return {
        title: `Archivo muy grande`,
        message: `"${filename}" excede el límite permitido. Intenta comprimir el PDF o dividirlo en partes más pequeñas.`,
        type: 'file_too_large'
      };
    }
    
    if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('rate limit')) {
      return {
        title: `Límite de uso alcanzado`,
        message: 'Se ha alcanzado el límite de solicitudes. Por favor espera unos minutos antes de intentar nuevamente.',
        type: 'rate_limit'
      };
    }
    
    if (errorMsg.includes('unsupported') || errorMsg.includes('mime')) {
      return {
        title: `Formato no soportado`,
        message: `El formato de "${filename}" no es compatible. Usa PDF, DOCX, TXT, MD, CSV, JSON o HTML.`,
        type: 'unsupported_format'
      };
    }
    
    return {
      title: `Error subiendo archivo`,
      message: errorMsg,
      type: 'unknown'
    };
  };

  /**
   * Maneja el upload de archivos (drag & drop o input)
   */
  const handleFileUpload = async (files) => {
    if (!selectedStore) {
      toast.error('Primero selecciona o crea un store');
      return;
    }

    const fileList = Array.from(files);
    
    // Validar tamaño máximo (2GB por archivo, pero recomendar 50MB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    const recommendedSize = 50 * 1024 * 1024; // 50MB
    const oversizedFiles = fileList.filter(f => f.size > maxSize);
    const largeFiles = fileList.filter(f => f.size > recommendedSize && f.size <= maxSize);
    
    if (oversizedFiles.length > 0) {
      toast.error(
        `Archivos muy grandes (máx 2GB):\n${oversizedFiles.map(f => f.name).join(', ')}`,
        { duration: 6000 }
      );
      return;
    }
    
    if (largeFiles.length > 0) {
      toast((t) => (
        <div>
          <p className="font-medium mb-2">⚠️ Archivos grandes detectados</p>
          <p className="text-sm text-slate-300 mb-3">
            {largeFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)} MB)`).join(', ')}
          </p>
          <p className="text-xs text-slate-400 mb-3">Pueden tardar más en procesarse</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                toast.dismiss(t.id);
                processFiles(fileList);
              }}
              className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
            >
              Continuar
            </button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="px-3 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      ), { duration: Infinity });
      return;
    }

    await processFiles(fileList);
  };

  /**
   * Procesa y sube los archivos
   */
  const processFiles = async (fileList) => {
    let successCount = 0;
    let errorCount = 0;

    for (const file of fileList) {
      const toastId = toast.loading(`Subiendo ${file.name}...`);
      
      try {
        await uploadFile(file, selectedStore.name);
        toast.success(`"${file.name}" subido correctamente`, { id: toastId });
        successCount++;
      } catch (err) {
        console.error(`Error subiendo ${file.name}:`, err.response?.data || err);
        const parsedError = parseGeminiError(err, file.name);
        
        toast.error(
          <div>
            <p className="font-medium">{parsedError.title}</p>
            <p className="text-sm mt-1 opacity-90">{parsedError.message}</p>
          </div>,
          { id: toastId, duration: 8000 }
        );
        errorCount++;
      }
    }

    // Resumen si hay múltiples archivos
    if (fileList.length > 1) {
      if (errorCount === 0) {
        toast.success(`✅ ${successCount} archivos subidos correctamente`);
      } else if (successCount === 0) {
        toast.error(`❌ No se pudo subir ningún archivo`);
      } else {
        toast(`${successCount} subidos, ${errorCount} fallidos`, { icon: '⚠️' });
      }
    }
  };

  /**
   * Maneja drag & drop
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      e.dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  /**
   * Maneja el click en el input de archivos
   */
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
    // Reset input para permitir seleccionar el mismo archivo nuevamente
    e.target.value = '';
  };

  /**
   * Elimina un documento
   */
  const handleDeleteDocument = async (doc) => {
    toast((t) => (
      <div>
        <p className="font-medium mb-2">¿Eliminar documento?</p>
        <p className="text-sm text-slate-300 mb-3 truncate max-w-xs">{doc.displayName}</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              const deleteToastId = toast.loading('Eliminando...');
              try {
                await deleteDocument(doc.name);
                toast.success('Documento eliminado', { id: deleteToastId });
              } catch (err) {
                toast.error(`Error: ${err.message}`, { id: deleteToastId });
              }
            }}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Eliminar
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  /**
   * Elimina un store
   */
  const handleDeleteStore = async (store) => {
    // Usar toast con confirmación
    toast((t) => (
      <div>
        <p className="font-medium mb-2">¿Eliminar "{store.displayName}"?</p>
        <p className="text-sm text-slate-300 mb-3">Se eliminarán TODOS los documentos dentro de él.</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              const deleteToastId = toast.loading('Eliminando store...');
              try {
                await deleteStore(store.name);
                toast.success('Store eliminado', { id: deleteToastId });
              } catch (err) {
                toast.error(`Error: ${err.message}`, { id: deleteToastId });
              }
            }}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Eliminar
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  /**
   * Toggle RAG mode
   */
  const handleToggleRAG = () => {
    if (!selectedStore) {
      toast.error('Primero selecciona un store con documentos');
      return;
    }
    
    if (documents.length === 0) {
      toast.error('Este store no tiene documentos. Sube al menos uno primero.');
      return;
    }

    setRagActive(!ragActive);
    toast.success(ragActive ? 'Modo RAG desactivado' : 'Modo RAG activado', { icon: ragActive ? '🔴' : '🟢' });
  };

  return (
    <div className="w-full h-full bg-white dark:bg-slate-800 pink:bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pink:border-pink-200 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 pink:from-pink-50 pink:to-rose-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400 pink:text-[#ff0075]" />
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white pink:text-[#0f172a]">
                Documentos RAG
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                Búsqueda semántica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 pink:hover:bg-pink-100 transition-colors"
            title="Cerrar panel RAG"
          >
            <X className="w-4 h-4 text-slate-600 dark:text-slate-300 pink:text-[#ff0075]" />
          </button>
        </div>
      </div>

      {/* RAG Toggle */}
      {selectedStore && documents.length > 0 && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 pink:bg-pink-50 border-b border-purple-200 dark:border-purple-800 pink:border-pink-200">
          <button
            onClick={handleToggleRAG}
            className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
              ragActive 
                ? 'bg-purple-600 pink:bg-[#ff0075] text-white shadow-lg' 
                : 'bg-white dark:bg-slate-700 pink:bg-white border-2 border-purple-300 dark:border-purple-600 pink:border-pink-300 hover:bg-purple-50 dark:hover:bg-slate-600 pink:hover:bg-pink-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className={`w-5 h-5 ${ragActive ? 'animate-pulse' : ''}`} />
              <span className="font-medium">Modo RAG</span>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
              ragActive 
                ? 'bg-white/20' 
                : 'bg-purple-100 dark:bg-purple-800 pink:bg-pink-100 text-purple-700 dark:text-purple-200 pink:text-[#ff0075]'
            }`}>
              {ragActive ? 'ACTIVO' : 'INACTIVO'}
            </div>
          </button>
          {ragActive && (
            <p className="text-xs text-purple-700 dark:text-purple-300 pink:text-[#ff0075] mt-2 text-center">
              Las respuestas usarán búsqueda en documentos
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Store Selector */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
            Store de Documentos
          </label>
          <button
            onClick={() => setShowCreateStore(!showCreateStore)}
            className="text-xs text-purple-600 dark:text-purple-400 pink:text-[#ff0075] hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Nuevo
          </button>
        </div>

        {/* Create Store Form */}
        {showCreateStore && (
          <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/20 pink:bg-pink-50 rounded-lg">
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateStore()}
              placeholder="Nombre del store (ej: Normativas OEFA)"
              className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-[#0f172a] mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateStore}
                disabled={!newStoreName.trim() || loading}
                className="flex-1 px-3 py-1.5 bg-purple-600 pink:bg-[#ff0075] text-white rounded text-xs font-medium hover:bg-purple-700 pink:hover:bg-[#e6006a] disabled:opacity-50"
              >
                Crear
              </button>
              <button
                onClick={() => { setShowCreateStore(false); setNewStoreName(''); }}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-600 pink:bg-pink-100 text-slate-700 dark:text-slate-200 pink:text-[#0f172a] rounded text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-500 pink:hover:bg-pink-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Store List */}
        {loading && stores.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hay stores creados</p>
          </div>
        ) : (
          <select
            value={selectedStore?.name || ''}
            onChange={(e) => {
              const store = stores.find(s => s.name === e.target.value);
              handleSelectStore(store || null);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-white pink:text-[#0f172a]"
          >
            <option value="">Seleccionar store...</option>
            {stores.map((store) => (
              <option key={store.name} value={store.name}>
                {store.displayName || formatStoreName(store.name)}
              </option>
            ))}
          </select>
        )}

        {/* Delete Store Button */}
        {selectedStore && (
          <button
            onClick={() => handleDeleteStore(selectedStore)}
            disabled={loading}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 pink:bg-red-50 border border-red-200 dark:border-red-800 pink:border-red-200 text-red-600 dark:text-red-400 rounded text-xs hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Eliminar store
          </button>
        )}
      </div>

      {/* Upload Area */}
      {selectedStore && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 pink:border-pink-200">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.html,.xml"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all group ${
              dragActive
                ? 'border-purple-500 pink:border-[#ff0075] bg-purple-50 dark:bg-purple-900/40 pink:bg-pink-50'
                : 'border-slate-300 dark:border-slate-600 pink:border-pink-300 hover:border-purple-400 dark:hover:border-purple-500 pink:hover:border-[#ff0075] hover:bg-slate-50 dark:hover:bg-slate-750 pink:hover:bg-pink-50'
            }`}
          >
            {uploading ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500 pink:text-[#ff0075] mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a]">
                  Subiendo archivo...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Esto puede tardar unos segundos
                </p>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-8 h-8 text-purple-500 pink:text-[#ff0075] mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 pink:text-[#0f172a] dark:group-hover:text-black">
                  Arrastra archivos aquí
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  o haz clic para seleccionar
                </p>
                <div className="mt-3 px-2 py-2 bg-purple-50 dark:bg-purple-900/10 pink:bg-pink-50 rounded border border-purple-200 dark:border-purple-800 pink:border-pink-200">
                  <p className="text-[10px] text-purple-700 dark:text-purple-300 pink:text-[#ff0075] font-medium mb-1">
                    📄 Formatos soportados:
                  </p>
                  <p className="text-[9px] text-purple-600 dark:text-purple-400 pink:text-[#64748b] mb-2">
                    PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, JSON, HTML, XML
                  </p>
                  <p className="text-[10px] text-purple-700 dark:text-purple-300 pink:text-[#ff0075] font-medium mb-1">
                    📦 Límites por archivo:
                  </p>
                  <p className="text-[9px] text-purple-600 dark:text-purple-400 pink:text-[#64748b] mb-2">
                    Recomendado: 50MB para uploads rápidos
                  </p>
    
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents List */}
      {selectedStore && (
        <div className="flex-1 overflow-y-auto p-4 chat-scrollbar">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 pink:text-[#64748b]">
              Documentos ({documents.length})
            </h4>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500 pink:text-[#ff0075]" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 pink:text-pink-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                No hay documentos
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 pink:text-pink-400 mt-1">
                Sube archivos para comenzar
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.name}
                  className="flex items-start justify-between p-3 bg-slate-50 dark:bg-slate-800 pink:bg-pink-50 rounded-lg border border-slate-200 dark:border-slate-700 pink:border-pink-200 hover:border-purple-300 dark:hover:border-purple-600 pink:hover:border-[#ff0075] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-purple-500 pink:text-[#ff0075] flex-shrink-0" />
                      <span 
                        className="text-sm font-medium text-slate-900 dark:text-white pink:text-[#0f172a] truncate"
                        title={doc.displayName}
                      >
                        {doc.displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span>•</span>
                      <span>{doc.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc)}
                    className="ml-2 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 pink:hover:bg-red-100 rounded transition-colors"
                    title={`Eliminar "${doc.displayName}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Footer */}
      {!selectedStore && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900 pink:bg-pink-50 border-t border-slate-200 dark:border-slate-700 pink:border-pink-200">
          <div className="flex items-start gap-2">
            <Database className="w-4 h-4 text-purple-500 pink:text-[#ff0075] mt-0.5" />
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 pink:text-[#0f172a] mb-1">
                ¿Qué es RAG?
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 pink:text-[#64748b]">
                Sube documentos técnicos (normativas, manuales, guías) para que Aisa pueda buscar información específica y responder con mayor precisión.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
