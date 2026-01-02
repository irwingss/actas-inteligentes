/**
 * Rutas del ChatAI - Asistente de supervisión ambiental con Gemini
 */

import express from 'express';
import path from 'path';
import { authenticate, validateCAAccess, validateCAAccessBody } from '../middleware/auth.js';
import { getJob } from '../lib/s123Jobs.js';
import { getLocalRecords, getLocalPhotos } from '../lib/arcgisSync.js';
import { generateResponse, generateResponseWithPhotos, analyzePhoto, getJobContext, generateNormativeResponse } from '../lib/geminiService.js';
import { generateRAGResponse } from '../lib/fileSearchService.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authenticate);

console.log('[chat] 🤖 Router de ChatAI cargado');

/**
 * POST /api/chat/message
 * Envía un mensaje al asistente AI
 * 
 * Body:
 * - caCode: Código de acción (o jobId legacy)
 * - message: Mensaje del usuario
 * - history: Array de mensajes previos (opcional)
 */
router.post('/message', validateCAAccessBody, async (req, res) => {
  try {
    const { jobId, caCode, message, history = [] } = req.body;
    
    // Soportar tanto caCode como jobId (legacy)
    const codigo = caCode || jobId;

    if (!codigo) {
      return res.status(400).json({ error: 'caCode es requerido' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    console.log(`[chat] 💬 Usuario ${req.user.id} - CA ${codigo}: "${message.substring(0, 50)}..."`);

    // Obtener contexto del CA desde la DB
    let jobContext;
    try {
      jobContext = await getJobContext(codigo);
      console.log(`[chat] ✅ Contexto obtenido: ${jobContext.recordCount} registros`);
    } catch (contextError) {
      console.error('[chat] ❌ Error obteniendo contexto:', contextError);
      return res.status(500).json({ 
        error: 'Error al obtener contexto del CA',
        details: contextError.message 
      });
    }

    // Generar respuesta con Gemini
    const result = await generateResponse(message, jobContext, history);

    if (!result.success) {
      console.error('[chat] ❌ Error en generateResponse:', result.error);
      return res.status(500).json({ 
        error: 'Error al generar respuesta',
        details: result.error 
      });
    }

    const responseData = {
      success: true,
      message: result.message,
      tokensUsed: result.tokensUsed,
      jobContext: {
        caCode: jobContext.caCode,
        recordCount: jobContext.recordCount || jobContext.totalRecords,
        photoGroups: jobContext.photoGroups,
        totalPhotos: jobContext.totalPhotos
      }
    };
    
    // Incluir acciones capturadas (ej: filtrar fotos en sidebar)
    if (result.actions) {
      responseData.actions = result.actions;
      console.log(`[chat] 📦 Enviando ${result.actions.length} acción(es) al frontend`);
    }
    
    res.json(responseData);

  } catch (error) {
    console.error('[chat] Error en /message:', error);
    res.status(500).json({ 
      error: 'Error al procesar el mensaje',
      details: error.message 
    });
  }
});

/**
 * POST /api/chat/normativa
 * Envía un mensaje al asistente AI en modo "Buscar en internet"
 * Enfocado en: normativas ambientales, leyes, OEFA, MINAM, temas ambientales generales
 * No requiere caCode (excepto si se envían fotos), usa búsqueda web integrada de Gemini.
 * Puede incluir fotos para análisis multimodal.
 * 
 * Body:
 * - message: Mensaje del usuario
 * - history: Array de mensajes previos (opcional)
 * - photos: Array de objetos {gid, filename} (opcional)
 * - caCode: Código de acción (solo si se envían fotos)
 */
router.post('/normativa', async (req, res) => {
  try {
    const { message, history = [], photos = [], caCode } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    console.log(`[chat] 🔍 (Búsqueda Internet) Usuario ${req.user.id}: "${message.substring(0, 80)}..." ${photos.length > 0 ? `con ${photos.length} foto(s)` : ''}`);

    // Si hay fotos, procesarlas igual que en message-with-photos
    let photosData = [];
    if (photos.length > 0 && caCode) {
      const records = getLocalRecords(caCode);
      
      for (const photoRef of photos) {
        try {
          const record = records.find(r => r.globalid === photoRef.gid);
          const photoRecords = getLocalPhotos(photoRef.gid);
          const photoRecord = photoRecords?.find(p => p.filename === photoRef.filename);
          
          if (photoRecord && photoRecord.local_path) {
            // Soportar rutas absolutas (nuevo) y relativas (legacy)
            let fullPath;
            if (path.isAbsolute(photoRecord.local_path)) {
              fullPath = photoRecord.local_path;
            } else {
              const uploadsDir = path.join(process.cwd(), 'uploads');
              fullPath = path.join(uploadsDir, photoRecord.local_path);
            }
            
            const fs = await import('fs/promises');
            const fileBuffer = await fs.readFile(fullPath);
            const base64 = fileBuffer.toString('base64');
            const mimeType = photoRef.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            
            // IMPORTANTE: Usar layer_id de la foto para determinar qué descripción usar
            // layer_id = 1 (Descripcion) → DESCRIP_1
            // layer_id = 2 (Hechos) → DESCRIP_2
            const layerId = photoRecord.layer_id || 1;
            
            // Parsear raw_json para buscar descripciones si no están en campos directos
            let rawData = {};
            try {
              rawData = record?.raw_json ? JSON.parse(record.raw_json) : {};
            } catch (e) {}
            
            // Obtener descripción específica según el layer de la foto
            const descripcionKey = `descrip_${layerId}`;
            const descripcionKeyUpper = `DESCRIP_${layerId}`;
            const hechoDetecKey = `hecho_detec_${layerId}`;
            const hechoDetecKeyUpper = `HECHO_DETEC_${layerId}`;
            
            const descripcionEspecifica = record?.[descripcionKey] || rawData[descripcionKeyUpper] || rawData[descripcionKey] || '';
            const hechoDetecEspecifico = record?.[hechoDetecKey] || rawData[hechoDetecKeyUpper] || rawData[hechoDetecKey] || '';
            
            photosData.push({
              base64,
              mimeType,
              metadata: record ? {
                componente: record.componente,
                supervisor: record.nombre_supervisor?.replace(/_/g, ' '),
                tipo_componente: record.tipo_componente,
                fecha: record.fecha,
                descripcion: descripcionEspecifica,
                hecho_detec: hechoDetecEspecifico,
                layerId
              } : {}
            });
          }
        } catch (photoError) {
          console.error(`[chat] ⚠️ Error obteniendo foto ${photoRef.filename}:`, photoError);
        }
      }
    }

    const result = await generateNormativeResponse(message, history, photosData);

    if (!result.success) {
      console.error('[chat] ❌ Error en generateNormativeResponse:', result.error);
      return res.status(500).json({
        error: 'Error al generar respuesta normativa',
        details: result.error
      });
    }

    res.json({
      success: true,
      message: result.message,
      tokensUsed: result.tokensUsed,
      photosAnalyzed: photosData.length
    });

  } catch (error) {
    console.error('[chat] Error en /normativa:', error);
    res.status(500).json({
      error: 'Error al procesar el mensaje normativo',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/rag
 * Envía un mensaje usando RAG (Retrieval Augmented Generation) con File Search
 * 
 * Body:
 * - message: Mensaje del usuario
 * - fileSearchStoreName: Nombre del File Search store a usar
 * - caCode: Código de acción (opcional, para contexto adicional)
 * - history: Array de mensajes previos (opcional)
 */
router.post('/rag', async (req, res) => {
  try {
    const { message, fileSearchStoreName, caCode, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    if (!fileSearchStoreName) {
      return res.status(400).json({ error: 'fileSearchStoreName es requerido' });
    }

    console.log(`[chat] 📚 (RAG) Usuario ${req.user.id}: "${message.substring(0, 80)}..." con store ${fileSearchStoreName}`);

    // Obtener contexto del CA si se proporciona (opcional)
    let jobContext = null;
    if (caCode) {
      try {
        jobContext = await getJobContext(caCode);
        console.log(`[chat] ✅ Contexto CA obtenido: ${jobContext.recordCount} registros`);
      } catch (contextError) {
        console.warn('[chat] ⚠️ No se pudo obtener contexto del CA:', contextError.message);
      }
    }

    const result = await generateRAGResponse(message, fileSearchStoreName, jobContext, history);

    if (!result.success) {
      console.error('[chat] ❌ Error en generateRAGResponse:', result.error);
      return res.status(500).json({
        error: 'Error al generar respuesta RAG',
        details: result.error
      });
    }

    res.json({
      success: true,
      message: result.message,
      tokensUsed: result.tokensUsed,
      storeName: fileSearchStoreName
    });

  } catch (error) {
    console.error('[chat] Error en /rag:', error);
    res.status(500).json({
      error: 'Error al procesar el mensaje RAG',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/message-with-photos
 * Envía un mensaje con fotografías adjuntas para análisis multimodal
 * 
 * Body:
 * - caCode: Código de acción
 * - message: Mensaje del usuario
 * - photos: Array de objetos {gid, filename} para obtener desde DB
 * - history: Array de mensajes previos (opcional)
 */
router.post('/message-with-photos', validateCAAccessBody, async (req, res) => {
  try {
    const { caCode, message, photos = [], history = [] } = req.body;

    console.log('[chat] 📥 Request recibido:', {
      caCode,
      message: message?.substring(0, 50),
      photosCount: photos?.length,
      photosStructure: photos?.[0]
    });

    if (!caCode) {
      console.log('[chat] ❌ Error: caCode faltante');
      return res.status(400).json({ error: 'caCode es requerido' });
    }

    if (!message || !message.trim()) {
      console.log('[chat] ❌ Error: mensaje vacío');
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    if (!photos || photos.length === 0) {
      console.log('[chat] ❌ Error: no hay fotos');
      return res.status(400).json({ error: 'Debe incluir al menos una fotografía' });
    }

    console.log(`[chat] 📸 Usuario ${req.user.id} - CA ${caCode}: "${message.substring(0, 50)}..." con ${photos.length} foto(s)`);

    // Obtener contexto del CA
    let jobContext;
    try {
      jobContext = getJobContext(caCode);
      console.log(`[chat] ✅ Contexto obtenido: ${jobContext.recordCount} registros`);
    } catch (contextError) {
      console.error('[chat] ❌ Error obteniendo contexto:', contextError);
      return res.status(500).json({ 
        error: 'Error al obtener contexto del CA',
        details: contextError.message 
      });
    }

    // Obtener fotos desde archivos locales como base64
    const records = getLocalRecords(caCode);
    
    console.log('[chat] 📦 Fotos recibidas del frontend:', JSON.stringify(photos, null, 2));
    
    const photosData = [];
    for (const photoRef of photos) {
      try {
        console.log('[chat] 🔍 Procesando foto:', { gid: photoRef.gid, filename: photoRef.filename });
        
        // Buscar el registro para obtener metadata
        const record = records.find(r => r.globalid === photoRef.gid);
        const photoRecords = getLocalPhotos(photoRef.gid);
        
        console.log('[chat] 📸 Registros de fotos encontrados:', photoRecords?.length || 0);
        
        const photoRecord = photoRecords?.find(p => p.filename === photoRef.filename);
        
        if (photoRecord && photoRecord.local_path) {
          console.log('[chat] 📂 Ruta local:', photoRecord.local_path);
          
          // Soportar rutas absolutas (nuevo) y relativas (legacy)
          let fullPath;
          if (path.isAbsolute(photoRecord.local_path)) {
            fullPath = photoRecord.local_path;
          } else {
            const uploadsDir = path.join(process.cwd(), 'uploads');
            fullPath = path.join(uploadsDir, photoRecord.local_path);
          }
          
          console.log('[chat] 📁 Ruta completa:', fullPath);
          
          // Leer archivo desde disco
          const fs = await import('fs/promises');
          const fileBuffer = await fs.readFile(fullPath);
          
          console.log('[chat] 📏 Tamaño del archivo:', fileBuffer.length, 'bytes');
          
          // Convertir a base64
          const base64 = fileBuffer.toString('base64');
          const mimeType = photoRef.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          
          console.log('[chat] ✅ Foto convertida a base64, tamaño:', base64.length, 'chars');
          
          // IMPORTANTE: Usar layer_id de la foto para determinar qué descripción usar
          // layer_id = 1 (Descripcion) → DESCRIP_1
          // layer_id = 2 (Hechos) → DESCRIP_2
          const layerId = photoRecord.layer_id || 1;
          
          // Parsear raw_json para buscar descripciones si no están en campos directos
          let rawData = {};
          try {
            rawData = record?.raw_json ? JSON.parse(record.raw_json) : {};
          } catch (e) {}
          
          // Obtener descripción específica según el layer de la foto
          const descripcionKey = `descrip_${layerId}`;
          const descripcionKeyUpper = `DESCRIP_${layerId}`;
          const hechoDetecKey = `hecho_detec_${layerId}`;
          const hechoDetecKeyUpper = `HECHO_DETEC_${layerId}`;
          
          const descripcionEspecifica = record?.[descripcionKey] || rawData[descripcionKeyUpper] || rawData[descripcionKey] || '';
          const hechoDetecEspecifico = record?.[hechoDetecKey] || rawData[hechoDetecKeyUpper] || rawData[hechoDetecKey] || '';
          
          photosData.push({
            base64,
            mimeType,
            metadata: record ? {
              componente: record.componente,
              supervisor: record.nombre_supervisor?.replace(/_/g, ' '),
              tipo_componente: record.tipo_componente,
              fecha: record.fecha,
              descripcion: descripcionEspecifica,
              hecho_detec: hechoDetecEspecifico,
              layerId
            } : {}
          });
        } else {
          console.log('[chat] ❌ No se encontró el registro de foto o no tiene local_path');
          console.log('[chat] 📋 Registro encontrado:', photoRecord);
        }
      } catch (photoError) {
        console.error(`[chat] ⚠️ Error obteniendo foto ${photoRef.filename}:`, photoError);
        console.error('[chat] Stack:', photoError.stack);
      }
    }

    if (photosData.length === 0 && photos.length > 0) {
      return res.status(400).json({ error: 'No se pudieron cargar las fotografías solicitadas' });
    }

    console.log(`[chat] 📸 ${photosData.length} foto(s) cargadas exitosamente`);

    // Generar respuesta con Gemini Vision
    const result = await generateResponseWithPhotos(message, photosData, jobContext, history);

    if (!result.success) {
      console.error('[chat] ❌ Error en generateResponseWithPhotos:', result.error);
      return res.status(500).json({ 
        error: 'Error al generar respuesta',
        details: result.error 
      });
    }

    const responseData = {
      success: true,
      message: result.message,
      photosAnalyzed: photosData.length,
      tokensUsed: result.tokensUsed,
      jobContext: {
        caCode: jobContext.caCode,
        recordCount: jobContext.recordCount || jobContext.totalRecords,
        photoGroups: jobContext.photoGroups,
        totalPhotos: jobContext.totalPhotos
      }
    };
    
    if (result.actions) {
      responseData.actions = result.actions;
    }
    
    res.json(responseData);

  } catch (error) {
    console.error('[chat] Error en /message-with-photos:', error);
    res.status(500).json({ 
      error: 'Error al procesar el mensaje con fotografías',
      details: error.message 
    });
  }
});

/**
 * POST /api/chat/analyze-photo
 * Analiza una fotografía específica
 * 
 * Body:
 * - jobId: ID del job
 * - globalId: GlobalID del registro
 * - filename: Nombre del archivo de foto
 * - question: Pregunta específica sobre la foto (opcional)
 */
router.post('/analyze-photo', validateCAAccessBody, async (req, res) => {
  try {
    const { jobId, globalId, filename, question } = req.body;

    if (!jobId || !globalId || !filename) {
      return res.status(400).json({ 
        error: 'jobId, globalId y filename son requeridos' 
      });
    }

    // Verificar que el job existe y pertenece al usuario
    const job = await getJob(jobId, req.user.id);
    if (!job) {
      return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    }

    // Construir ruta de la foto
    const photoPath = path.join(job.fotosDir, globalId, filename);

    console.log(`[chat] 📸 Analizando foto: ${photoPath}`);

    // Analizar foto con Gemini Vision
    const result = await analyzePhoto(photoPath, question);

    if (!result.success) {
      return res.status(500).json({ 
        error: 'Error al analizar fotografía',
        details: result.error 
      });
    }

    res.json({
      success: true,
      analysis: result.analysis,
      tokensUsed: result.tokensUsed,
      photo: {
        globalId,
        filename
      }
    });

  } catch (error) {
    console.error('[chat] Error en /analyze-photo:', error);
    res.status(500).json({ 
      error: 'Error al analizar fotografía',
      details: error.message 
    });
  }
});

/**
 * GET /api/chat/context/:caCode
 * Obtiene el contexto de datos disponible para un CA
 */
router.get('/context/:caCode', validateCAAccess, async (req, res) => {
  try {
    const { caCode } = req.params;

    // Obtener contexto desde la DB
    const context = await getJobContext(caCode);

    res.json({
      success: true,
      context: {
        jobId: context.jobId,
        caCode: context.caCode,
        status: context.status,
        recordCount: context.recordCount || context.totalRecords,
        photoGroups: context.photoGroups || 0,
        totalPhotos: context.totalPhotos || 0,
        createdAt: context.createdAt,
        availableFields: context.availableFields || [],
        stats: context.stats || {}
      }
    });

  } catch (error) {
    console.error('[chat] Error en /context:', error);
    res.status(500).json({ 
      error: 'Error al obtener contexto',
      details: error.message 
    });
  }
});

/**
 * POST /api/chat/summary
 * Genera un resumen automático del CA
 */
router.post('/summary', validateCAAccessBody, async (req, res) => {
  try {
    const { jobId, caCode } = req.body;
    
    // Soportar tanto caCode como jobId (legacy)
    const codigo = caCode || jobId;

    if (!codigo) {
      return res.status(400).json({ error: 'caCode es requerido' });
    }

    console.log(`[chat] 📊 Generando resumen para CA ${codigo}`);

    // Obtener contexto desde la DB
    let jobContext;
    try {
      jobContext = await getJobContext(codigo);
      console.log(`[chat] ✅ Contexto obtenido para resumen: ${jobContext.recordCount} registros`);
    } catch (contextError) {
      console.error('[chat] ❌ Error obteniendo contexto para resumen:', contextError);
      return res.status(500).json({ 
        error: 'Error al obtener contexto del CA',
        details: contextError.message 
      });
    }

    // Generar resumen automático
    const summaryPrompt = `Por favor, genera un resumen ejecutivo completo de este código de acción. Incluye:

1. **Información General**: Código CA, fechas, supervisores involucrados
2. **Estadísticas Clave**: Total de registros, componentes supervisados, fotografías
3. **Análisis de Datos**: Patrones identificados, distribución por componente/locación
4. **Observaciones Relevantes**: Cualquier hallazgo o patrón notable en los datos
5. **Recomendaciones**: Sugerencias para el análisis o seguimiento

Usa formato Markdown profesional y sé específico con los números.`;

    const result = await generateResponse(summaryPrompt, jobContext, []);

    if (!result.success) {
      console.error('[chat] ❌ Error en generateResponse para resumen:', result.error);
      return res.status(500).json({ 
        error: 'Error al generar resumen',
        details: result.error 
      });
    }

    console.log(`[chat] ✅ Resumen generado exitosamente (${result.tokensUsed?.total || 0} tokens)`);

    res.json({
      success: true,
      message: result.message, // Cambiar 'summary' a 'message' para consistencia
      summary: result.message, // Mantener 'summary' por compatibilidad
      tokensUsed: result.tokensUsed,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[chat] Error en /summary:', error);
    res.status(500).json({ 
      error: 'Error al generar resumen',
      details: error.message 
    });
  }
});

export default router;
