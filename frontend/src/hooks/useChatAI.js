/**
 * Hook personalizado para la lógica del ChatBot AI
 * Compartido entre ChatAIPage y ChatAIWindow
 */

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function useChatAI(initialCaCode = null, onAction = null, initialMode = 'ca') {
  const { session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null);
  const [selectedCA, setSelectedCA] = useState(initialCaCode);
  const [availableCAs, setAvailableCAs] = useState([]);
  const [loadingCAs, setLoadingCAs] = useState(false);
  const [mode, setMode] = useState(initialMode || 'ca'); // 'ca' | 'normativa' (búsqueda en internet para normativas/leyes/OEFA/MINAM)
  const [ragActive, setRagActive] = useState(false); // RAG mode activo/inactivo
  const [selectedRAGStore, setSelectedRAGStore] = useState(null); // Store seleccionado para RAG
  const messagesEndRef = useRef(null);

  // Auto-scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cargar CAs disponibles
  const loadAvailableCAs = async () => {
    // Verificar que hay sesión antes de continuar
    if (!session?.access_token) {
      console.warn('[useChatAI] ⚠️ No hay sesión activa, no se pueden cargar CAs');
      setAvailableCAs([]);
      setLoadingCAs(false);
      return;
    }

    try {
      setLoadingCAs(true);
      console.log('[useChatAI] 🔍 Cargando CAs disponibles...');

      // 1. Obtener CAs asignados al usuario
      const casResponse = await axios.get('/api/auth/accessible-cas', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const accessibleCAs = casResponse.data.cas || [];
      const hasAllAccess = casResponse.data.all_access || false;
      console.log('[useChatAI] 📋 Permisos:', { hasAllAccess, accessibleCAsCount: accessibleCAs.length });

      // 2. Obtener estadísticas de CAs descargados
      const statsResponse = await axios.get('/api/s123/ca-stats', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const caStats = statsResponse.data.stats || [];
      console.log('[useChatAI] 📊 CAs descargados:', caStats.length, caStats);

      // 3. Crear mapa de CAs descargados
      const downloadedCAs = {};
      caStats.forEach(stat => {
        if (stat.codigo && stat.registros_activos > 0) {
          downloadedCAs[stat.codigo] = {
            caCode: stat.codigo,
            total: stat.registros_activos,
            totalPhotos: stat.total_fotos || 0,
            lastSync: stat.ultima_sincronizacion
          };
        }
      });

      // 4. Combinar información
      let combinedCAs;
      
      if (hasAllAccess) {
        // Admin/SuperAdmin: mostrar TODOS los CAs descargados
        combinedCAs = Object.values(downloadedCAs);
      } else {
        // Usuario regular: solo CAs asignados Y descargados
        combinedCAs = accessibleCAs
          .filter(ca => downloadedCAs[ca.ca_code])
          .map(ca => ({
            ...downloadedCAs[ca.ca_code],
            assignedAt: ca.created_at
          }));
      }

      // Ordenar por última sincronización
      combinedCAs.sort((a, b) => 
        new Date(b.lastSync) - new Date(a.lastSync)
      );

      console.log('[useChatAI] ✅ CAs combinados:', combinedCAs.length, combinedCAs.map(c => c.caCode));
      setAvailableCAs(combinedCAs);
    } catch (err) {
      console.error('[useChatAI] ❌ Error cargando CAs:', err?.response?.data || err.message || err);
    } finally {
      setLoadingCAs(false);
    }
  };

  // Cargar CAs automáticamente cuando la sesión esté disponible
  useEffect(() => {
    if (session?.access_token) {
      loadAvailableCAs();
    }
  }, [session?.access_token]);

  // Cargar contexto del CA seleccionado
  const loadContext = async (caCode) => {
    if (!caCode) return;

    try {
      const response = await axios.get(`/api/chat/context/${caCode}`, {
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

  // Inicializar chat cuando se selecciona un CA
  useEffect(() => {
    if (selectedCA) {
      loadContext(selectedCA);
      
      // Mensaje de bienvenida solo si no hay mensajes previos
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: `¡Hola! Soy Aisa de OEFA, tu Asistente Inteligente para la Supervisión Ambiental. Te ayudo a analizar la información del código de acción **${selectedCA}**.

Puedo apoyarte con:
- 📊 Consultas y análisis de la data capturada  
- 📸 Filtrado y revisión de fotografías  
- 📈 Estadísticas y resúmenes  
- 🔍 Búsqueda de información específica  
- 🌐 Búsquedas en internet para complementar el análisis  
- 📂 Extracción de información desde archivos personalizados que cargues  

¿En qué puedo asistirte hoy?`,
          timestamp: new Date()
        }]);
      }
    }
  }, [selectedCA]);

  // Enviar mensaje
  const sendMessage = async () => {
    if (!input.trim()) return;

    // En modo CA se requiere un CA seleccionado; en normativa no.
    // En modo RAG se requiere selectedRAGStore
    if (mode === 'ca' && !selectedCA && !ragActive) return;
    if (ragActive && !selectedRAGStore) {
      alert('⚠️ Primero selecciona un store de documentos RAG');
      return;
    }

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      let response;

      if (ragActive && selectedRAGStore) {
        // Modo RAG: búsqueda semántica en documentos
        console.log('[useChatAI] 📚 Enviando mensaje RAG con store:', selectedRAGStore.name);
        response = await axios.post('/api/chat/rag', {
          message: userMessage.content,
          fileSearchStoreName: selectedRAGStore.name,
          caCode: selectedCA || null, // Opcional: contexto del CA
          history
        }, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
      } else if (mode === 'normativa') {
        // Modo "Buscar en internet": búsqueda web para normativas/leyes/OEFA/MINAM
        response = await axios.post('/api/chat/normativa', {
          message: userMessage.content,
          history
        }, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
      } else {
        // Modo CA: comportamiento existente
        response = await axios.post('/api/chat/message', {
          caCode: selectedCA,
          message: userMessage.content,
          history
        }, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
      }

      console.log('[useChatAI] Respuesta del backend:', response.data);

      if (response.data.success) {
        console.log('[useChatAI] Mensaje recibido:', response.data.message);
        const assistantMessage = {
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Emitir acciones al componente padre (ej: filtrar fotos en sidebar)
        if (response.data.actions && response.data.actions.length > 0 && onAction) {
          console.log('[useChatAI] 📦 Procesando acciones:', response.data.actions);
          response.data.actions.forEach(action => {
            onAction(action);
          });
        }
      } else {
        console.error('[useChatAI] Respuesta sin success:', response.data);
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
    }
  };

  // Generar resumen ejecutivo
  const generateSummary = async () => {
    if (!selectedCA) return;

    const loadingMessage = {
      role: 'assistant',
      content: '📊 Generando resumen ejecutivo del código de acción...',
      timestamp: new Date(),
      isLoading: true
    };
    
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await axios.post('/api/chat/summary', { caCode: selectedCA }, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data.success) {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: response.data.message,
            timestamp: new Date()
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
    }
  };

  // Enviar mensaje con fotos adjuntas
  const sendMessageWithPhotos = async (photosToSend, messageText = '', attachedPhotosData = []) => {
    // En modo CA se requiere selectedCA; en modo normativa también (para acceder a las fotos)
    if (!selectedCA) return;
    if (!photosToSend || photosToSend.length === 0) return;

    // Asegurar que siempre haya un mensaje
    const finalMessage = messageText.trim() || '¿Qué puedes decirme sobre estas fotografías?';

    const userMessage = {
      role: 'user',
      content: finalMessage,
      timestamp: new Date(),
      hasPhotos: true,
      photoCount: photosToSend.length,
      attachedPhotos: attachedPhotosData // Incluir datos completos de las fotos para mostrar thumbnails
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      console.log('[useChatAI] 📤 Enviando mensaje con fotos:', {
        mode,
        caCode: selectedCA,
        message: finalMessage,
        photosCount: photosToSend.length,
        photos: photosToSend
      });

      let response;

      if (mode === 'normativa') {
        // Modo "Buscar en internet": enviar fotos + búsqueda web para normativas/leyes/OEFA
        response = await axios.post('/api/chat/normativa', {
          caCode: selectedCA,
          message: finalMessage,
          photos: photosToSend,
          history
        }, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
      } else {
        // Modo CA: endpoint específico para fotos con herramientas de DB
        response = await axios.post('/api/chat/message-with-photos', {
          caCode: selectedCA,
          message: finalMessage,
          photos: photosToSend,
          history
        }, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`
          }
        });
      }

      console.log('[useChatAI] Respuesta con fotos del backend:', response.data);

      if (response.data.success) {
        console.log(`[useChatAI] ✅ ${response.data.photosAnalyzed} foto(s) analizadas`);
        const assistantMessage = {
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Emitir acciones al componente padre si existen
        if (response.data.actions && response.data.actions.length > 0 && onAction) {
          response.data.actions.forEach(action => {
            onAction(action);
          });
        }
      } else {
        console.error('[useChatAI] Respuesta sin success:', response.data);
      }
    } catch (error) {
      console.error('Error enviando mensaje con fotos:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Lo siento, ocurrió un error al procesar tu mensaje con fotografías. Por favor, intenta nuevamente.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Cambiar CA seleccionado
  const changeCA = (caCode) => {
    setSelectedCA(caCode);
    setMessages([]);
    setContext(null);
  };

  return {
    // Estado
    messages,
    input,
    loading,
    context,
    selectedCA,
    availableCAs,
    loadingCAs,
    messagesEndRef,
    mode,
    ragActive,
    selectedRAGStore,
    
    // Acciones
    setInput,
    setMode,
    setRagActive,
    setSelectedRAGStore,
    sendMessage,
    sendMessageWithPhotos,
    generateSummary,
    changeCA,
    loadAvailableCAs,
    scrollToBottom
  };
}
