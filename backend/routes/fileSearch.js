/**
 * Rutas para gestión de Gemini File Search (RAG)
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import {
  createFileSearchStore,
  listFileSearchStores,
  getFileSearchStore,
  deleteFileSearchStore,
  uploadFileToStore,
  listDocumentsInStore,
  deleteDocument
} from '../lib/fileSearchService.js';

const router = express.Router();

// Configurar multer para upload de archivos
const upload = multer({
  dest: 'uploads/file-search/',
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB máximo (según límites de Gemini)
  },
  fileFilter: (req, file, cb) => {
    // Tipos de archivo permitidos (según la documentación de Gemini)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'text/html',
      'application/xml'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  }
});

// Asegurar que el directorio de uploads existe
const uploadDir = 'uploads/file-search';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * GET /api/file-search/stores
 * Lista todos los File Search stores
 */
router.get('/stores', authenticate, async (req, res) => {
  try {
    const result = await listFileSearchStores();
    
    if (result.success) {
      res.json({
        success: true,
        stores: result.stores
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[API FileSearch] Error listando stores:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar stores'
    });
  }
});

/**
 * POST /api/file-search/stores
 * Crea un nuevo File Search store
 * Body: { displayName: string }
 */
router.post('/stores', authenticate, async (req, res) => {
  try {
    const { displayName } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'displayName es requerido'
      });
    }

    const result = await createFileSearchStore(displayName.trim());
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[API FileSearch] Error creando store:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear store'
    });
  }
});

/**
 * GET /api/file-search/stores/:storeName
 * Obtiene un store específico
 */
router.get('/stores/:storeName', authenticate, async (req, res) => {
  try {
    const { storeName } = req.params;
    
    // El storeName viene URL-encoded y Express lo decodifica automáticamente
    const fullStoreName = storeName;

    const result = await getFileSearchStore(fullStoreName);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[API FileSearch] Error obteniendo store:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener store'
    });
  }
});

/**
 * DELETE /api/file-search/stores/:storeName
 * Elimina un File Search store
 */
router.delete('/stores/:storeName', authenticate, async (req, res) => {
  try {
    const { storeName } = req.params;
    
    const fullStoreName = storeName;

    const result = await deleteFileSearchStore(fullStoreName);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[API FileSearch] Error eliminando store:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar store'
    });
  }
});

/**
 * POST /api/file-search/upload
 * Sube un archivo a un File Search store
 * Multipart: file, fileSearchStoreName, displayName
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó ningún archivo'
      });
    }

    const { fileSearchStoreName, displayName } = req.body;

    if (!fileSearchStoreName) {
      // Limpiar archivo temporal
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'fileSearchStoreName es requerido'
      });
    }

    const fullStoreName = fileSearchStoreName.startsWith('fileSearchStores/') 
      ? fileSearchStoreName 
      : `fileSearchStores/${fileSearchStoreName.replace('fileSearchStores-', '')}`;

    const fileDisplayName = displayName || req.file.originalname;

    console.log(`[API FileSearch] Subiendo archivo: ${fileDisplayName} (${req.file.size} bytes)`);
    console.log(`[API FileSearch] Usuario: ${req.user?.id}`);

    // Usar método estándar de 2 pasos (Files API + importFile)
    // Este método SÍ indexa correctamente el contenido
    console.log('[API FileSearch] Usando método estándar (Files API + importFile)');
    const result = await uploadFileToStore(
      req.file.path,
      fullStoreName,
      fileDisplayName,
      {
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: req.user?.id // UUID del usuario autenticado
      }
    );

    // Limpiar archivo temporal después de subir
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.warn('[API FileSearch] No se pudo eliminar archivo temporal:', err);
    }

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        operation: result.operation
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.warn('[API FileSearch] No se pudo eliminar archivo temporal:', err);
      }
    }

    console.error('[API FileSearch] Error subiendo archivo:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al subir archivo'
    });
  }
});

/**
 * GET /api/file-search/stores/:storeName/documents
 * Lista documentos de un store
 */
router.get('/stores/:storeName/documents', authenticate, async (req, res) => {
  try {
    const { storeName } = req.params;
    
    const fullStoreName = storeName;

    const result = await listDocumentsInStore(fullStoreName);
    
    if (result.success) {
      res.json({
        success: true,
        documents: result.documents
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[API FileSearch] Error listando documentos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar documentos'
    });
  }
});

/**
 * DELETE /api/file-search/documents/:documentId
 * Elimina un documento
 * El documentId debe incluir el storeName (ej: fileSearchStores-abc123-documents-xyz789)
 */
router.delete('/documents/:documentId', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // El documentId viene directamente del frontend y ya tiene el formato correcto
    // (ej: fileSearchStores/store-123/documents/doc-456)
    const fullDocumentName = documentId;

    const result = await deleteDocument(fullDocumentName);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[API FileSearch] Error eliminando documento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar documento'
    });
  }
});

export default router;
