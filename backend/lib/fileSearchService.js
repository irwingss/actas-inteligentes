/**
 * Servicio de Gemini File Search para RAG (Retrieval Augmented Generation)
 * Gestiona stores de documentos y búsqueda semántica
 * NOTA: Usa API REST directa porque el SDK no soporta File Search Stores
 * 
 * La metadata de documentos se guarda en Supabase para compartir entre
 * todas las instalaciones de la app (Electron en diferentes computadoras)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ========================================
// FUNCIONES DE SUPABASE PARA METADATA RAG
// ========================================

/**
 * Guarda metadata de un documento RAG en Supabase
 */
async function saveDocumentMetadata(documentName, storeName, originalFilename, displayName, mimeType, sizeBytes, uploadedBy) {
  try {
    const { error } = await supabaseAdmin
      .from('rag_documents')
      .upsert({
        document_name: documentName,
        store_name: storeName,
        original_filename: originalFilename,
        display_name: displayName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        uploaded_by: uploadedBy
      }, { onConflict: 'document_name' });

    if (error) throw error;
    console.log(`[FileSearch] 💾 Metadata guardada en Supabase para: ${displayName}`);
  } catch (err) {
    console.error('[FileSearch] ❌ Error guardando metadata en Supabase:', err);
  }
}

/**
 * Obtiene metadata de documentos de un store desde Supabase
 */
async function getDocumentsMetadata(storeName) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rag_documents')
      .select('*')
      .eq('store_name', storeName);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[FileSearch] ❌ Error obteniendo metadata de Supabase:', err);
    return [];
  }
}

/**
 * Elimina metadata de un documento en Supabase
 */
async function deleteDocumentMetadata(documentName) {
  try {
    const { error } = await supabaseAdmin
      .from('rag_documents')
      .delete()
      .eq('document_name', documentName);

    if (error) throw error;
    console.log(`[FileSearch] 🗑️ Metadata eliminada de Supabase para: ${documentName}`);
  } catch (err) {
    console.error('[FileSearch] ❌ Error eliminando metadata de Supabase:', err);
  }
}

/**
 * Elimina metadata de todos los documentos de un store en Supabase
 */
async function deleteStoreMetadata(storeName) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rag_documents')
      .delete()
      .eq('store_name', storeName)
      .select();

    if (error) throw error;
    console.log(`[FileSearch] 🗑️ Metadata eliminada de Supabase para store: ${storeName} (${data?.length || 0} documentos)`);
  } catch (err) {
    console.error('[FileSearch] ❌ Error eliminando metadata del store en Supabase:', err);
  }
}

/**
 * Crea un nuevo File Search store
 * @param {string} displayName - Nombre descriptivo del store
 * @returns {Promise<object>} - Store creado
 */
export async function createFileSearchStore(displayName) {
  try {
    console.log(`[FileSearch] 📦 Creando store: ${displayName}`);
    
    const response = await axios.post(
      `${GEMINI_API_BASE}/fileSearchStores`,
      {
        displayName: displayName
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    const store = response.data;
    console.log(`[FileSearch] ✅ Store creado: ${store.name}`);
    
    return {
      success: true,
      store: {
        name: store.name,
        displayName: store.displayName || displayName,
        createTime: store.createTime,
        updateTime: store.updateTime
      }
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error creando store:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Lista todos los File Search stores
 * @returns {Promise<object>} - Lista de stores
 */
export async function listFileSearchStores() {
  try {
    console.log('[FileSearch] 📋 Listando stores...');
    
    const response = await axios.get(
      `${GEMINI_API_BASE}/fileSearchStores`,
      {
        headers: {
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    const stores = (response.data.fileSearchStores || []).map(store => ({
      name: store.name,
      displayName: store.displayName,
      createTime: store.createTime,
      updateTime: store.updateTime
    }));

    console.log(`[FileSearch] ✅ Encontrados ${stores.length} stores`);
    
    return {
      success: true,
      stores
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error listando stores:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      stores: []
    };
  }
}

/**
 * Obtiene un File Search store específico
 * @param {string} storeName - Nombre del store (ej: "fileSearchStores/abc123")
 * @returns {Promise<object>} - Store encontrado
 */
export async function getFileSearchStore(storeName) {
  try {
    console.log(`[FileSearch] 🔍 Obteniendo store: ${storeName}`);
    
    const response = await axios.get(
      `${GEMINI_API_BASE}/${storeName}`,
      {
        headers: {
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    const store = response.data;
    console.log(`[FileSearch] ✅ Store obtenido: ${store.displayName || store.name}`);

    return {
      success: true,
      store: {
        name: store.name,
        displayName: store.displayName,
        createTime: store.createTime,
        updateTime: store.updateTime
      }
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error obteniendo store:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Elimina un File Search store
 * También elimina toda la metadata de documentos de Supabase
 * @param {string} storeName - Nombre del store
 * @param {boolean} force - Forzar eliminación aunque tenga documentos
 * @returns {Promise<object>} - Resultado de la operación
 */
export async function deleteFileSearchStore(storeName, force = true) {
  try {
    console.log(`[FileSearch] 🗑️ Eliminando store: ${storeName}`);
    
    // 1. Eliminar store de Gemini
    await axios.delete(
      `${GEMINI_API_BASE}/${storeName}?force=${force}`,
      {
        headers: {
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    // 2. Eliminar toda la metadata de documentos del store en Supabase
    await deleteStoreMetadata(storeName);

    console.log(`[FileSearch] ✅ Store eliminado: ${storeName}`);
    
    return {
      success: true,
      message: 'Store eliminado exitosamente'
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error eliminando store:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Sube un archivo a un File Search store
 * @param {string} filePath - Ruta del archivo en el servidor
 * @param {string} fileSearchStoreName - Nombre del store destino
 * @param {string} displayName - Nombre descriptivo del archivo
 * @param {object} options - Opciones adicionales
 * @param {string} options.mimeType - Tipo MIME del archivo
 * @param {number} options.sizeBytes - Tamaño del archivo en bytes
 * @param {string} options.uploadedBy - UUID del usuario que sube el archivo
 * @returns {Promise<object>} - Resultado de la operación
 */
export async function uploadFileToStore(filePath, fileSearchStoreName, displayName, options = {}) {
  const { mimeType, sizeBytes, uploadedBy } = options;
  
  try {
    console.log(`[FileSearch] 📤 Subiendo archivo: ${displayName} al store ${fileSearchStoreName}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Archivo no encontrado');
    }

    // Usa el método de 2 pasos: subir a Files API y luego importar
    // Esto ha demostrado ser más estable que el upload directo al store

    // Paso 1: Subir a Files API con displayName
    const form = new FormData();
    
    // Parte 1: Metadata (solo displayName según la API de Gemini)
    const metadata = {
      file: {
        displayName: displayName
      }
    };
    form.append('metadata', JSON.stringify(metadata), { contentType: 'application/json' });

    // Parte 2: Contenido del archivo
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: 'application/pdf', // O detectar dinámicamente
    });

    const uploadResponse = await axios.post(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-Goog-Upload-Protocol': 'multipart',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const uploadedFile = uploadResponse.data.file;
    console.log(`[FileSearch] ✅ Archivo subido a Files API: ${uploadedFile.name}`);
    console.log(`[FileSearch] 📝 DisplayName: "${uploadedFile.displayName}" (original: "${displayName}")`);

    // Paso 2: Importar el archivo al store
    // El displayName se hereda automáticamente del Files API
    const importPayload = {
      file_name: uploadedFile.name
    };

    console.log('[FileSearch] 🔍 Importando con payload:', JSON.stringify(importPayload, null, 2));

    const importResponse = await axios.post(
      `${GEMINI_API_BASE}/${fileSearchStoreName}:importFile?key=${GEMINI_API_KEY}`,
      importPayload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const operation = importResponse.data;
    console.log(`[FileSearch] ⏳ Importando al store (operación: ${operation.name})...`);

    // Paso 3: Polling para esperar que la operación termine
    let operationStatus = operation;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutos de espera máxima

    while (!operationStatus.done && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
      
      const statusResponse = await axios.get(
        `${GEMINI_API_BASE}/${operation.name}?key=${GEMINI_API_KEY}`
      );
      
      operationStatus = statusResponse.data;
      attempts++;
      console.log(`[FileSearch] ⏳ Estado de la operación (${attempts * 5}s): ${operationStatus.done ? 'Completado' : 'En progreso'}`);
    }

    if (!operationStatus.done) {
      throw new Error('Tiempo de espera agotado para la importación del archivo.');
    }

    if (operationStatus.error) {
      throw new Error(`Error en la operación de importación: ${operationStatus.error.message}`);
    }

    console.log('[FileSearch] ✅ Archivo importado y procesado exitosamente.');
    console.log(`[FileSearch] 📋 DisplayName final: "${displayName}"`);

    // Paso 4: Guardar metadata en Supabase para que todas las instalaciones vean el nombre correcto
    // Necesitamos obtener el nombre del documento creado
    // El operationStatus.response debería contener info del documento
    let documentName = null;
    if (operationStatus.response?.document?.name) {
      documentName = operationStatus.response.document.name;
    } else {
      // Si no viene en la respuesta, intentamos obtenerlo listando los documentos
      console.log('[FileSearch] 🔍 Buscando documento recién creado...');
      const docsResponse = await axios.get(
        `${GEMINI_API_BASE}/${fileSearchStoreName}/documents?key=${GEMINI_API_KEY}`
      );
      const docs = docsResponse.data.documents || [];
      // El más reciente debería ser el que acabamos de crear
      if (docs.length > 0) {
        // Ordenar por createTime descendente y tomar el primero
        docs.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
        documentName = docs[0].name;
      }
    }

    if (documentName) {
      await saveDocumentMetadata(
        documentName,
        fileSearchStoreName,
        displayName, // original_filename
        displayName, // display_name
        mimeType,
        sizeBytes,
        uploadedBy
      );
    } else {
      console.warn('[FileSearch] ⚠️ No se pudo determinar el nombre del documento para guardar metadata');
    }

    return {
      success: true,
      message: 'Archivo subido e indexado exitosamente.',
      operation: operationStatus,
      documentName
    };

  } catch (error) {
    console.error('[FileSearch] ❌ Error subiendo archivo:', error.response?.data || error.message);
    if (error.response) {
      console.error('[FileSearch] 🔍 DEBUG - Error status:', error.response.status);
      console.error('[FileSearch] 🔍 DEBUG - Error data:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
    };
  }
}


/**
 * Lista los documentos de un File Search store
 * Combina datos de Gemini API con metadata de Supabase para mostrar nombres originales
 * @param {string} fileSearchStoreName - Nombre del store
 * @returns {Promise<object>} - Lista de documentos
 */
export async function listDocumentsInStore(fileSearchStoreName) {
  try {
    console.log(`[FileSearch] 📄 Listando documentos del store: ${fileSearchStoreName}`);
    
    // 1. Obtener documentos de Gemini API
    const response = await axios.get(
      `${GEMINI_API_BASE}/${fileSearchStoreName}/documents?key=${GEMINI_API_KEY}`
    );

    // 2. Obtener metadata de Supabase
    const metadataList = await getDocumentsMetadata(fileSearchStoreName);
    const metadataMap = new Map(metadataList.map(m => [m.document_name, m]));

    // 3. Combinar datos
    const documents = (response.data.documents || []).map(doc => {
      const metadata = metadataMap.get(doc.name);
      
      // Priorizar: metadata de Supabase > displayName de Gemini > ID del documento
      const finalDisplayName = metadata?.display_name || doc.displayName || doc.name.split('/').pop() || 'documento';
      
      console.log(`[FileSearch] 📝 Documento ID: ${doc.name.split('/').pop()}`);
      console.log(`[FileSearch]    → DisplayName: "${finalDisplayName}" (desde ${metadata ? 'Supabase' : 'Gemini'})`);
      
      return {
        name: doc.name,
        displayName: finalDisplayName,
        originalFilename: metadata?.original_filename || finalDisplayName,
        createTime: doc.createTime,
        updateTime: doc.updateTime,
        mimeType: metadata?.mime_type || doc.mimeType,
        sizeBytes: metadata?.size_bytes || doc.sizeBytes,
        uploadedBy: metadata?.uploaded_by
      };
    });

    console.log(`[FileSearch] ✅ Encontrados ${documents.length} documentos`);
    
    return {
      success: true,
      documents
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error listando documentos:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      documents: []
    };
  }
}

/**
 * Elimina un documento de un File Search store
 * También elimina la metadata de Supabase
 * @param {string} documentName - Nombre completo del documento
 * @returns {Promise<object>} - Resultado de la operación
 */
export async function deleteDocument(documentName) {
  try {
    console.log(`[FileSearch] 🗑️ Eliminando documento: ${documentName}`);
    
    // 1. Eliminar de Gemini
    await axios.delete(
      `${GEMINI_API_BASE}/${documentName}?force=true&key=${GEMINI_API_KEY}`
    );

    // 2. Eliminar metadata de Supabase
    await deleteDocumentMetadata(documentName);

    console.log(`[FileSearch] ✅ Documento eliminado: ${documentName}`);
    
    return {
      success: true,
      message: 'Documento eliminado exitosamente'
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error eliminando documento:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Enriquece un texto usando RAG para buscar información en documentos
 * Diseñado para el Experto RAG en el sistema de actas
 * @param {string} currentText - Texto actual a enriquecer (obligación o descripción)
 * @param {string} customInstruction - Instrucción del usuario sobre qué hacer
 * @param {string} fileSearchStoreName - Store a usar para búsqueda
 * @param {string} fieldType - 'obligacion' o 'descripcion'
 * @returns {Promise<object>} - Texto enriquecido
 */
export async function enrichTextWithRAG(currentText, customInstruction, fileSearchStoreName, fieldType = 'descripcion') {
  try {
    console.log(`[FileSearch] 🎯 Enriqueciendo texto con RAG - Store: ${fileSearchStoreName}`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    });

    const fieldLabel = fieldType === 'obligacion' ? 'OBLIGACIÓN FISCALIZABLE' : 'DESCRIPCIÓN DEL HECHO';
    
    const systemPrompt = `Eres un EXPERTO TÉCNICO especializado en enriquecer textos de actas de supervisión ambiental de OEFA.

**TU TAREA:**
Tienes acceso a documentos técnicos mediante búsqueda semántica. El usuario te proporciona:
1. Un texto actual (${fieldLabel}) que necesita ser enriquecido
2. Una instrucción específica sobre qué información buscar o cómo mejorar el texto

**INSTRUCCIONES CRÍTICAS:**
1. USA fileSearch para buscar en los documentos la información que el usuario solicita
2. INTEGRA la información encontrada de forma natural en el texto existente
3. MANTÉN la estructura y estilo técnico-legal del texto original
4. CITA las fuentes cuando sea relevante: "Según [nombre del documento]..."
5. Si NO encuentras información relevante, indica qué buscaste y qué no se encontró
6. NUNCA inventes información - solo usa lo que encuentres en los documentos
7. **IMPORTANTE: PARAFRASEA siempre la información encontrada. NO copies textualmente artículos o párrafos extensos de la normativa. Resume y adapta el contenido al contexto del texto.**

**FORMATO DE RESPUESTA (HTML):**
- Devuelve SOLO el texto enriquecido en formato HTML válido
- Usa tags HTML: <p>, <strong>, <u>, <ul>, <li>, <hr>
- Sin explicaciones adicionales, solo el HTML del texto mejorado

**CRÍTICO - PRESERVAR ESTRUCTURA:**
- Si el texto tiene MÚLTIPLES COMPONENTES separados, MANTÉN esa separación
- Los subtítulos de componentes usan: <p><strong><u>Nombre</u></strong></p>
- Los componentes están SEPARADOS por <hr>
- NO unifiques todo en un solo párrafo
- Si no puedes enriquecer el texto, devuelve el original con una nota al final`;

    const userPrompt = `**TEXTO ACTUAL (${fieldLabel}):**
${currentText}

**INSTRUCCIÓN DEL USUARIO:**
${customInstruction}

**ACCIÓN:**
Busca en los documentos disponibles la información solicitada y enriquece el texto. Devuelve el texto mejorado.`;

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }]
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Buscaré en los documentos y enriqueceré el texto según tus instrucciones.' }]
        }
      ],
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName]
          }
        }
      ]
    });

    const result = await chat.sendMessage(userPrompt);
    const response = result.response;
    const enrichedText = response.text();

    console.log(`[FileSearch] ✅ Texto enriquecido con RAG (${enrichedText.length} caracteres)`);

    return {
      success: true,
      enrichedText,
      tokensUsed: {
        prompt: response.usageMetadata?.promptTokenCount || 0,
        completion: response.usageMetadata?.candidatesTokenCount || 0,
        total: response.usageMetadata?.totalTokenCount || 0
      }
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error enriqueciendo texto con RAG:', error);
    
    // Detectar error de RECITATION (contenido bloqueado por reproducir texto protegido)
    const isRecitationError = error.message?.includes('RECITATION') || 
                              error.response?.candidates?.[0]?.finishReason === 'RECITATION';
    
    if (isRecitationError) {
      console.log('[FileSearch] ⚠️ Respuesta bloqueada por RECITATION - el modelo intentó citar texto protegido');
      return {
        success: false,
        error: 'No se pudo enriquecer el texto porque la normativa contiene contenido protegido. Intenta con una instrucción más específica que pida un resumen o paráfrasis en lugar de citas textuales.',
        enrichedText: currentText,
        blockedReason: 'RECITATION'
      };
    }
    
    return {
      success: false,
      error: error.message,
      enrichedText: currentText // Devolver el original si falla
    };
  }
}

/**
 * Genera una respuesta usando File Search RAG
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} fileSearchStoreName - Store a usar para búsqueda
 * @param {object} jobContext - Contexto del CA (opcional)
 * @param {Array} conversationHistory - Historial de conversación
 * @returns {Promise<object>} - Respuesta de Gemini
 */
export async function generateRAGResponse(userMessage, fileSearchStoreName, jobContext = null, conversationHistory = []) {
  try {
    console.log(`[FileSearch] 🤖 Generando respuesta RAG con store: ${fileSearchStoreName}`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    });

    // Construir contexto adicional si hay jobContext
    let systemContext = `Eres Aisa, un asistente experto en supervisión ambiental de OEFA. Tu principal habilidad es analizar documentos técnicos para responder preguntas con precisión.

**Instrucciones de Búsqueda y Respuesta (RAG):**

1.  **Prioriza la Precisión:** Tu objetivo es encontrar la respuesta más precisa en los documentos. Si encuentras una coincidencia exacta para la consulta del usuario, responde directamente con esa información.

2.  **Maneja Coincidencias Parciales o Relacionadas:** Si no encuentras una coincidencia exacta, pero sí información relacionada o parcial, preséntala de forma útil. Por ejemplo: "No encontré una mención exacta de 'ABC', pero los documentos sí mencionan 'XYZ', que está relacionado. La información es la siguiente...".

3.  **Sé Honesto si no hay Nada:** Solo si no encuentras NINGUNA información relevante (ni exacta ni relacionada) en los documentos, debes indicar claramente: "No encontré información sobre este tema en los documentos disponibles".

4.  **Cita tus Fuentes:** Siempre que sea posible, indica de qué parte del documento extrajiste la información.

5.  **Usa el Contexto Adicional:** Si se proporciona contexto de un CA (Código de Acción), úsalo para complementar tu respuesta, pero tu prioridad es la información de los documentos RAG.

6.  **IMPORTANTE - PARAFRASEA:** Siempre resume y parafrasea la información de los documentos. NO copies textualmente artículos completos o párrafos extensos de la normativa. Adapta el contenido para responder la pregunta del usuario.`;

    if (jobContext) {
      systemContext += `\n\n**CONTEXTO DEL CA ACTUAL:**\n- Código: ${jobContext.caCode}\n- Registros: ${jobContext.recordCount}\n- Fotos: ${jobContext.totalPhotos}`;
    }

    // Construir historial
    const history = conversationHistory
      .filter(msg => msg && msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content.trim() }]
      }));

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemContext }]
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Estoy lista para buscar en los documentos y ayudarte con tu consulta.' }]
        },
        ...history
      ],
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName]
          }
        }
      ]
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    const text = response.text();

    console.log(`[FileSearch] ✅ Respuesta RAG generada`);

    return {
      success: true,
      message: text,
      tokensUsed: {
        prompt: response.usageMetadata?.promptTokenCount || 0,
        completion: response.usageMetadata?.candidatesTokenCount || 0,
        total: response.usageMetadata?.totalTokenCount || 0
      }
    };
  } catch (error) {
    console.error('[FileSearch] ❌ Error generando respuesta RAG:', error);
    
    // Detectar error de RECITATION
    const isRecitationError = error.message?.includes('RECITATION') || 
                              error.response?.candidates?.[0]?.finishReason === 'RECITATION';
    
    if (isRecitationError) {
      console.log('[FileSearch] ⚠️ Respuesta bloqueada por RECITATION');
      return {
        success: false,
        error: 'La respuesta fue bloqueada porque contenía texto protegido. Por favor, reformula tu pregunta pidiendo un resumen o explicación en lugar de citas textuales.',
        message: 'No puedo citar textualmente ese contenido de la normativa. ¿Podrías reformular tu pregunta pidiendo un resumen o explicación?',
        blockedReason: 'RECITATION'
      };
    }
    
    return {
      success: false,
      error: error.message,
      message: 'Lo siento, ocurrió un error al procesar tu consulta con los documentos.'
    };
  }
}
