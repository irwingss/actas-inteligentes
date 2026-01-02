/**
 * Hook personalizado para gestionar File Search RAG
 * Manejo de stores, documentos y uploads
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function useRAG() {
  const { session } = useAuth();
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Carga la lista de stores disponibles
   */
  const loadStores = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get('/api/file-search/stores', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        setStores(response.data.stores || []);
        console.log(`[useRAG] ✅ Cargados ${response.data.stores?.length || 0} stores`);
      }
    } catch (err) {
      console.error('[useRAG] Error cargando stores:', err);
      setError(err.response?.data?.error || 'Error al cargar stores');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Crea un nuevo store
   */
  const createStore = async (displayName) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('/api/file-search/stores', 
        { displayName },
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        }
      );

      if (response.data.success) {
        console.log(`[useRAG] ✅ Store creado: ${displayName}`);
        await loadStores(); // Recargar lista
        return response.data.store;
      }
    } catch (err) {
      console.error('[useRAG] Error creando store:', err);
      setError(err.response?.data?.error || 'Error al crear store');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Elimina un store
   */
  const deleteStore = async (storeName) => {
    try {
      setLoading(true);
      setError(null);

      const encodedStoreName = encodeURIComponent(storeName);
      const response = await axios.delete(`/api/file-search/stores/${encodedStoreName}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        console.log(`[useRAG] ✅ Store eliminado: ${storeName}`);
        
        // Si el store eliminado era el seleccionado, deseleccionarlo
        if (selectedStore?.name === storeName) {
          setSelectedStore(null);
          setDocuments([]);
        }
        
        await loadStores(); // Recargar lista
        return true;
      }
    } catch (err) {
      console.error('[useRAG] Error eliminando store:', err);
      setError(err.response?.data?.error || 'Error al eliminar store');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Carga los documentos de un store
   */
  const loadDocuments = async (storeName) => {
    try {
      setLoading(true);
      setError(null);

      const encodedStoreName = encodeURIComponent(storeName);
      const response = await axios.get(`/api/file-search/stores/${encodedStoreName}/documents`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        setDocuments(response.data.documents || []);
        console.log(`[useRAG] ✅ Cargados ${response.data.documents?.length || 0} documentos`);
      }
    } catch (err) {
      console.error('[useRAG] Error cargando documentos:', err);
      setError(err.response?.data?.error || 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sube un archivo a un store
   */
  const uploadFile = async (file, storeName) => {
    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileSearchStoreName', storeName);
      // El backend ahora usa el nombre original del archivo como displayName por defecto
      formData.append('displayName', file.name);

      console.log(`[useRAG] 📤 Subiendo archivo: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

      const response = await axios.post('/api/file-search/upload', formData, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`[useRAG] 📊 Progreso: ${percentCompleted}%`);
        }
      });

      if (response.data.success) {
        console.log(`[useRAG] ✅ Archivo subido exitosamente, esperando propagación...`);
        
        // Esperar un momento antes de recargar para dar tiempo a la API a propagar el displayName.
        setTimeout(() => {
          if (selectedStore?.name === storeName) {
            loadDocuments(storeName);
          }
        }, 250); // 250ms de delay
        
        return response.data;
      }
    } catch (err) {
      console.error('[useRAG] Error subiendo archivo:', err);
      const errorMsg = err.response?.data?.error || 'Error al subir archivo';
      setError(errorMsg);
      throw err; // Relanzar el error original para un manejo más detallado
    } finally {
      setUploading(false);
    }
  };

  /**
   * Elimina un documento
   */
  const deleteDocument = async (documentName) => {
    try {
      setLoading(true);
      setError(null);

      const encodedDocumentName = encodeURIComponent(documentName);
      const response = await axios.delete(`/api/file-search/documents/${encodedDocumentName}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        console.log(`[useRAG] ✅ Documento eliminado: ${documentName}`);
        
        // Recargar documentos
        if (selectedStore) {
          await loadDocuments(selectedStore.name);
        }
        
        return true;
      }
    } catch (err) {
      console.error('[useRAG] Error eliminando documento:', err);
      setError(err.response?.data?.error || 'Error al eliminar documento');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Selecciona un store y carga sus documentos
   */
  const selectStore = async (store) => {
    setSelectedStore(store);
    if (store) {
      await loadDocuments(store.name);
    } else {
      setDocuments([]);
    }
  };

  /**
   * Formatea el tamaño del archivo
   */
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  /**
   * Formatea el nombre del store (extrae el ID)
   */
  const formatStoreName = (name) => {
    if (!name) return '';
    // De: fileSearchStores/abc123 => abc123
    const parts = name.split('/');
    return parts[parts.length - 1];
  };

  // Cargar stores al montar
  useEffect(() => {
    if (session?.access_token) {
      loadStores();
    }
  }, [session?.access_token]);

  return {
    // Estado
    stores,
    selectedStore,
    documents,
    loading,
    uploading,
    error,
    
    // Acciones
    loadStores,
    createStore,
    deleteStore,
    selectStore,
    loadDocuments,
    uploadFile,
    deleteDocument,
    
    // Utilidades
    formatFileSize,
    formatStoreName
  };
}
