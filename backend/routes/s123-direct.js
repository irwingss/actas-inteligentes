import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { getLocalRecords, getLocalPhotos, getLocalCodigo, updateDescripcionEditada, getDescripciones, getDescripcionesEditadas } from '../lib/arcgisSync.js';
import db, { query, run, get, ensureDb } from '../db/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

console.log('[s123-direct] 🆕 Router de endpoints directos (sin jobs) cargado');

/**
 * ENDPOINTS DIRECTOS - Sin dependencia de jobs
 * Acceso permanente a datos en SQLite usando código de acción
 */

// ENDPOINT ESPECIAL: Fotos con token en query param (debe ir ANTES de authenticate)
// GET /api/s123/direct/photo/:caCode/:gid/:filename?token=xxx
router.get('/photo/:caCode/:gid/:filename', (req, res, next) => {
  // Mover token del query param al header para que el middleware lo procese
  console.log('[s123-direct/photo] Query token presente:', !!req.query.token);

  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
    console.log('[s123-direct/photo] Token movido a header');
  }

  next();
}, authenticate, (req, res) => {
  try {
    const { caCode, gid } = req.params;
    // Decodificar el filename por si viene URL-encoded
    const filename = decodeURIComponent(req.params.filename);

    console.log('[s123-direct/photo] Sirviendo foto:', { caCode, gid, filename });

    // Obtener la foto desde la base de datos
    const photos = getLocalPhotos(gid);
    console.log('[s123-direct/photo] Fotos encontradas para gid:', photos?.length || 0);
    
    const photo = photos?.find(p => p.filename === filename);

    if (!photo || !photo.local_path) {
      console.log('[s123-direct/photo] ❌ Foto no encontrada');
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    // Construir ruta completa
    let fullPath;
    if (path.isAbsolute(photo.local_path)) {
      fullPath = photo.local_path;
    } else {
      fullPath = path.join(process.cwd(), 'uploads', photo.local_path);
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(fullPath)) {
      console.error('[s123-direct/photo] ❌ Archivo no existe:', fullPath);
      return res.status(404).json({ error: 'Archivo de foto no encontrado' });
    }

    console.log('[s123-direct/photo] ✅ Sirviendo foto desde:', fullPath);

    // Servir la imagen
    const contentType = photo.content_type || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.sendFile(fullPath);
  } catch (error) {
    console.error('[s123-direct/photo] Error:', error);
    res.status(500).json({
      error: 'Error al obtener foto',
      details: error.message
    });
  }
});

// Middleware de autenticación (TODAS las rutas de abajo requieren autenticación)
router.use(authenticate);

// Middleware de logging
router.use((req, res, next) => {
  console.log(`[s123-direct] 📡 ${req.method} ${req.path} | User: ${req.user.id}`);
  next();
});

/**
 * GET /api/s123/direct/records/:codigo
 * Obtiene todos los registros de un código de acción
 */
router.get('/records/:codigo', (req, res) => {
  try {
    const codigo = req.params.codigo;
    console.log(`[s123-direct] 📡 GET /records/${codigo}`);

    const records = getLocalRecords(codigo);

    if (!records || records.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron registros',
        codigo,
        recordCount: 0
      });
    }

    // Convertir a formato JSON limpio
    const cleanRecords = records.map(r => {
      const parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
      return {
        objectid: r.objectid,
        globalid: r.globalid,
        codigo_accion: r.codigo_accion,
        otro_ca: r.otro_ca,
        fecha: r.fecha,
        norte: r.norte,
        este: r.este,
        zona: r.zona,
        zona: r.zona,
        altitud: r.altitud,
        componente: r.componente,
        tipo_componente: r.tipo_componente,
        nombre_supervisor: r.nombre_supervisor,
        descripcion: r.descripcion,
        hallazgos: r.hallazgos,
        profundidad: r.profundidad,
        descripcion_f01: r.descripcion_f01,
        descripcion_f02: r.descripcion_f02,
        descripcion_f03: r.descripcion_f03,
        descripcion_f04: r.descripcion_f04,
        descripcion_f05: r.descripcion_f05,
        descripcion_f06: r.descripcion_f06,
        descripcion_f07: r.descripcion_f07,
        descripcion_f08: r.descripcion_f08,
        descripcion_f09: r.descripcion_f09,
        descripcion_f10: r.descripcion_f10,
        CreationDate: r.creation_date,
        Creator: r.creator,
        EditDate: r.edit_date,
        Editor: r.editor,
        ...parsed // Campos adicionales del JSON
      };
    });

    res.json({
      codigo,
      recordCount: cleanRecords.length,
      records: cleanRecords
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo registros:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/records/:codigo/paginated?page=1&pageSize=25
 * Obtiene registros paginados
 */
router.get('/records/:codigo/paginated', (req, res) => {
  try {
    const codigo = req.params.codigo;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, parseInt(req.query.pageSize || '25', 10));

    console.log(`[s123-direct] 📡 GET /records/${codigo}/paginated?page=${page}&pageSize=${pageSize}`);

    const allRecords = getLocalRecords(codigo);

    if (!allRecords || allRecords.length === 0) {
      return res.json({
        codigo,
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        records: []
      });
    }

    const total = allRecords.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageRecords = allRecords.slice(start, end);

    // Convertir a JSON limpio
    const cleanRecords = pageRecords.map(r => {
      const parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
      return {
        objectid: r.objectid,
        globalid: r.globalid,
        codigo_accion: r.codigo_accion,
        otro_ca: r.otro_ca,
        fecha: r.fecha,
        norte: r.norte,
        este: r.este,
        zona: r.zona,
        zona: r.zona,
        altitud: r.altitud,
        componente: r.componente,
        tipo_componente: r.tipo_componente,
        nombre_supervisor: r.nombre_supervisor,
        descripcion: r.descripcion,
        hallazgos: r.hallazgos,
        profundidad: r.profundidad,
        descripcion_f01: r.descripcion_f01,
        descripcion_f02: r.descripcion_f02,
        descripcion_f03: r.descripcion_f03,
        descripcion_f04: r.descripcion_f04,
        descripcion_f05: r.descripcion_f05,
        descripcion_f06: r.descripcion_f06,
        descripcion_f07: r.descripcion_f07,
        descripcion_f08: r.descripcion_f08,
        descripcion_f09: r.descripcion_f09,
        descripcion_f10: r.descripcion_f10,
        CreationDate: r.creation_date,
        Creator: r.creator,
        EditDate: r.edit_date,
        Editor: r.editor,
        ...parsed
      };
    });

    res.json({
      codigo,
      page,
      pageSize,
      total,
      totalPages,
      records: cleanRecords
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo registros paginados:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/photos/:codigo/:globalId
 * Lista todas las fotos de un registro específico
 */
router.get('/photos/:codigo/:globalId', (req, res) => {
  try {
    const { codigo, globalId } = req.params;
    console.log(`[s123-direct] 📡 GET /photos/${codigo}/${globalId}`);
    console.log(`[s123-direct] 🔍 GlobalID received:`, {
      value: globalId,
      length: globalId.length,
      hasUppercase: /[A-Z]/.test(globalId),
      hasBraces: /[{}]/.test(globalId)
    });

    const photos = getLocalPhotos(globalId);
    console.log(`[s123-direct] 📊 Total photos found: ${photos.length}`);

    const activePhotos = photos.filter(p => p.is_deleted === 0);
    console.log(`[s123-direct] ✅ Active photos: ${activePhotos.length}`);

    // Ordenar alfabéticamente por filename
    activePhotos.sort((a, b) => a.filename.localeCompare(b.filename));

    const files = activePhotos.map(photo => ({
      name: photo.filename,
      url: `/api/s123/direct/photo/${codigo}/${globalId}/${encodeURIComponent(photo.filename)}`,
      size: photo.file_data ? photo.file_data.length : 0
    }));

    console.log(`[s123-direct] 📤 Returning ${files.length} file URLs`);

    res.json({
      codigo,
      globalId,
      count: files.length,
      files
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error listando fotos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/photo/:codigo/:globalId/:filename
 * Sirve una foto específica (URL PERMANENTE)
 */
router.get('/photo/:codigo/:globalId/:filename', (req, res) => {
  try {
    const { codigo, globalId, filename } = req.params;
    console.log(`[s123-direct] 📸 GET /photo/${codigo}/${globalId}/${filename}`);

    // Buscar la foto en SQLite
    const photos = getLocalPhotos(globalId);
    console.log(`[s123-direct] 📊 Fotos encontradas para globalId ${globalId}:`, photos.length);

    if (photos.length > 0) {
      console.log(`[s123-direct] 📋 Nombres de archivos:`, photos.map(p => p.filename));
    }

    const photo = photos.find(p => p.filename === filename && p.is_deleted === 0);

    if (!photo) {
      console.log(`[s123-direct] ❌ Foto no encontrada: ${filename}`);
      console.log(`[s123-direct] 🔍 Buscando con comparación case-insensitive...`);

      // Intentar búsqueda case-insensitive
      const photoInsensitive = photos.find(p =>
        p.filename.toLowerCase() === filename.toLowerCase() && p.is_deleted === 0
      );

      if (photoInsensitive) {
        console.log(`[s123-direct] ✅ Encontrada con case-insensitive: ${photoInsensitive.filename}`);
        return servePhotoFromDisk(photoInsensitive, filename, res, codigo, globalId);
      }

      return res.status(404).json({
        error: 'Foto no encontrada',
        requested: filename,
        available: photos.filter(p => p.is_deleted === 0).map(p => p.filename)
      });
    }

    // Las fotos están en disco (local_path), no en file_data
    servePhotoFromDisk(photo, filename, res, codigo, globalId);

  } catch (error) {
    console.error('[s123-direct] ❌ Error sirviendo foto:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper para servir la foto desde disco
function servePhotoFromDisk(photo, filename, res, codigo = '', globalId = '') {
  try {
    // Construir ruta usando process.cwd() (la que funciona)
    let absolutePath;
    if (path.isAbsolute(photo.local_path)) {
      absolutePath = photo.local_path;
    } else {
      absolutePath = path.join(process.cwd(), 'uploads', photo.local_path);
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(absolutePath)) {
      console.log(`[s123-direct] ❌ Archivo no encontrado: ${absolutePath}`);
      return res.status(404).json({
        error: 'Archivo no encontrado en disco',
        local_path: photo.local_path,
        expected_path: absolutePath
      });
    }

    // Determinar Content-Type
    const lower = filename.toLowerCase();
    let contentType = 'application/octet-stream';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (lower.endsWith('.png')) contentType = 'image/png';
    else if (lower.endsWith('.gif')) contentType = 'image/gif';
    else if (lower.endsWith('.webp')) contentType = 'image/webp';
    else if (lower.endsWith('.bmp')) contentType = 'image/bmp';
    else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) contentType = 'image/tiff';

    const fileSize = fs.statSync(absolutePath).size;

    // Headers para cache permanente
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 año
    res.setHeader('ETag', `"${codigo}-${globalId}-${filename}"`);
    res.setHeader('Content-Length', fileSize);

    console.log(`[s123-direct] ✅ Sirviendo foto desde disco: ${filename} (${fileSize} bytes)`);

    // Streamear el archivo
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error(`[s123-direct] ❌ Error leyendo archivo:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error leyendo archivo' });
      }
    });

  } catch (error) {
    console.error(`[s123-direct] ❌ Error en servePhotoFromDisk:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}

/**
 * GET /api/s123/direct/test/:globalId
 * Endpoint de prueba para debugging
 */
router.get('/test/:globalId', (req, res) => {
  try {
    const { globalId } = req.params;
    console.log(`[s123-direct] 🧪 TEST /test/${globalId}`);

    const photos = getLocalPhotos(globalId);

    res.json({
      globalId,
      totalPhotos: photos.length,
      activePhotos: photos.filter(p => p.is_deleted === 0).length,
      photos: photos.map(p => {
        let absolutePath;
        if (path.isAbsolute(p.local_path)) {
          absolutePath = p.local_path;
        } else {
          absolutePath = path.join(process.cwd(), 'uploads', p.local_path);
        }
        const fileExists = fs.existsSync(absolutePath);
        const fileSize = fileExists ? fs.statSync(absolutePath).size : 0;

        return {
          filename: p.filename,
          is_deleted: p.is_deleted,
          local_path: p.local_path,
          file_exists: fileExists,
          file_size: fileSize,
          absolute_path: absolutePath
        };
      })
    });
  } catch (error) {
    console.error('[s123-direct] ❌ Error en test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/info/:codigo
 * Obtiene información general del código (metadata)
 */
router.get('/info/:codigo', (req, res) => {
  try {
    const codigo = req.params.codigo;
    console.log(`[s123-direct] 📡 GET /info/${codigo}`);

    const info = getLocalCodigo(codigo);

    if (!info) {
      return res.status(404).json({
        error: 'Código no encontrado en caché',
        codigo
      });
    }

    const records = getLocalRecords(codigo);

    // Contar fotos totales
    let totalPhotos = 0;
    for (const record of records) {
      const photos = getLocalPhotos(record.globalid);
      totalPhotos += photos.filter(p => p.is_deleted === 0).length;
    }

    res.json({
      codigo,
      recordCount: info.record_count,
      photoCount: totalPhotos,
      lastSync: info.last_sync,
      syncedAt: info.synced_at,
      exists: true
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/modalidad/:codigo
 * Obtiene la modalidad más frecuente de un código de acción
 * Retorna 'A' para suelos empetrolados, 'B' para regulares/especiales
 */
router.get('/modalidad/:codigo', (req, res) => {
  try {
    const codigo = req.params.codigo;
    console.log(`[s123-direct] 📡 GET /modalidad/${codigo}`);

    const records = getLocalRecords(codigo);

    if (!records || records.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron registros',
        codigo,
        modalidad: null
      });
    }

    // Contar frecuencia de cada modalidad
    const modalidadCount = {};
    for (const record of records) {
      // Buscar modalidad en el registro o en raw_json
      let modalidad = record.modalidad;
      if (!modalidad && record.raw_json) {
        try {
          const parsed = JSON.parse(record.raw_json);
          modalidad = parsed.modalidad || parsed.Modalidad || parsed.tipo_de_reporte || parsed.Tipo_de_reporte;
        } catch (e) {
          // Ignorar error de parsing
        }
      }
      
      if (modalidad) {
        const normalizedModalidad = String(modalidad).toUpperCase().trim();
        modalidadCount[normalizedModalidad] = (modalidadCount[normalizedModalidad] || 0) + 1;
      }
    }

    // Encontrar la modalidad más frecuente
    let mostFrequent = null;
    let maxCount = 0;
    for (const [mod, count] of Object.entries(modalidadCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = mod;
      }
    }

    // Normalizar a 'A' o 'B'
    // 'A' = Suelos empetrolados
    // 'B' = Regulares/Especiales
    let normalizedModalidad = 'B'; // Default
    if (mostFrequent) {
      if (mostFrequent.startsWith('A') || mostFrequent.includes('SUELO') || mostFrequent.includes('EMPETROLADO')) {
        normalizedModalidad = 'A';
      }
    }

    console.log(`[s123-direct] ✅ Modalidad detectada para ${codigo}: ${normalizedModalidad} (${mostFrequent}, ${maxCount}/${records.length} registros)`);

    res.json({
      codigo,
      modalidad: normalizedModalidad,
      rawModalidad: mostFrequent,
      count: maxCount,
      totalRecords: records.length,
      distribution: modalidadCount
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo modalidad:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// ENDPOINTS DE EDICIÓN DE DESCRIPCIONES
// Ahora usa tabla photo_descriptions con photo_id único (globalid_filename)
// Cada foto tiene su propia descripción independiente
// ========================================

/**
 * PUT /api/s123/direct/descripcion/:photoId
 * Actualiza la descripción editada de una foto individual
 * photoId formato: globalid_filename (ej: "abc123_foto_1.jpg")
 * Body: { campo: 'descrip_1', valor: string | null }
 */
router.put('/descripcion/:photoId', authenticate, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { campo, valor } = req.body;

    console.log(`[s123-direct] ✏️ PUT /descripcion/${photoId}`, { campo, valor: valor?.substring(0, 50) + '...' });

    const underscoreIndex = photoId.indexOf('_');
    if (underscoreIndex === -1) {
      return res.status(400).json({ error: 'Formato de photoId inválido. Esperado: globalid_filename' });
    }
    
    const globalid = photoId.substring(0, underscoreIndex);
    const filename = photoId.substring(underscoreIndex + 1);

    const database = await ensureDb();
    try {
      database.run(`CREATE TABLE IF NOT EXISTS photo_descriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL UNIQUE, globalid TEXT NOT NULL, filename TEXT NOT NULL, descripcion_editada TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch (tableErr) {}

    if (valor === null || valor === undefined) {
      await run('DELETE FROM photo_descriptions WHERE photo_id = ?', [photoId]);
    } else {
      await run(`INSERT INTO photo_descriptions (photo_id, globalid, filename, descripcion_editada) VALUES (?, ?, ?, ?) ON CONFLICT(photo_id) DO UPDATE SET descripcion_editada = excluded.descripcion_editada, updated_at = CURRENT_TIMESTAMP`, [photoId, globalid, filename, valor]);
    }

    console.log(`[s123-direct] ✅ Descripción guardada para foto ${photoId}`);
    res.json({ success: true, message: 'Descripción actualizada', photoId, globalid, filename, hasEdit: !!valor });

  } catch (error) {
    console.error('[s123-direct] ❌ Error actualizando descripción:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/descripcion/:photoId
 * Obtiene la descripción editada de una foto individual
 */
router.get('/descripcion/:photoId', authenticate, async (req, res) => {
  try {
    const { photoId } = req.params;
    console.log(`[s123-direct] 📖 GET /descripcion/${photoId}`);

    const database = await ensureDb();
    try {
      database.run(`CREATE TABLE IF NOT EXISTS photo_descriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL UNIQUE, globalid TEXT NOT NULL, filename TEXT NOT NULL, descripcion_editada TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch (tableErr) {}

    const result = await get('SELECT descripcion_editada FROM photo_descriptions WHERE photo_id = ?', [photoId]);
    const record = result.rows[0];

    res.json({ success: true, photoId, descripcion_editada: record?.descripcion_editada || null });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo descripción:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/descripciones-por-fotos
 * Obtiene todas las descripciones editadas para una lista de photoIds
 * Query: photoIds=id1,id2,id3
 */
router.get('/descripciones-por-fotos', authenticate, async (req, res) => {
  try {
    const { photoIds } = req.query;
    if (!photoIds) return res.json({ success: true, descripciones: {} });

    const ids = photoIds.split(',').map(id => id.trim()).filter(Boolean);
    console.log(`[s123-direct] 📖 GET /descripciones-por-fotos - ${ids.length} fotos`);

    const database = await ensureDb();
    try {
      database.run(`CREATE TABLE IF NOT EXISTS photo_descriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL UNIQUE, globalid TEXT NOT NULL, filename TEXT NOT NULL, descripcion_editada TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch (tableErr) {}

    const descripciones = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const result = await query(`SELECT photo_id, descripcion_editada FROM photo_descriptions WHERE photo_id IN (${placeholders})`, ids);
      result.rows.forEach(r => {
        if (r.descripcion_editada) descripciones[r.photo_id] = r.descripcion_editada;
      });
    }

    res.json({ success: true, count: Object.keys(descripciones).length, descripciones });
  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo descripciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/s123/direct/metadata/:globalid
 * Actualiza metadata editada de un registro (componente, instalacion_referencia)
 * Body: { componente?: string, instalacion_referencia?: string }
 * 
 * NOTA: Estas ediciones son LOCALES para corregir errores de tipeo en campo.
 * La IA usará estos valores corregidos para generar descripciones.
 */
router.put('/metadata/:globalid', authenticate, async (req, res) => {
  try {
    const { globalid } = req.params;
    const { componente, instalacion_referencia } = req.body;
    console.log(`[s123-direct] ✏️ PUT /metadata/${globalid}`, { componente, instalacion_referencia });

    const updateFields = [];
    const updateValues = [];
    if (componente !== undefined) { updateFields.push('componente = ?'); updateValues.push(componente); }
    if (instalacion_referencia !== undefined) { updateFields.push('instalacion_referencia = ?'); updateValues.push(instalacion_referencia); }
    
    if (updateFields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
    
    updateValues.push(globalid, globalid);
    const result = await run(`UPDATE arcgis_records SET ${updateFields.join(', ')} WHERE globalid = ? OR UPPER(globalid) = UPPER(?)`, updateValues);
    
    console.log(`[s123-direct] 📝 UPDATE result: ${result.rowCount} filas afectadas para globalid=${globalid}`);
    
    if (result.rowCount === 0) {
      const existingResult = await get(`SELECT globalid, componente, instalacion_referencia FROM arcgis_records WHERE UPPER(globalid) = UPPER(?)`, [globalid]);
      if (existingResult.rows[0]) {
        console.log(`[s123-direct] ⚠️ Registro encontrado pero no actualizado:`, existingResult.rows[0].globalid);
      } else {
        console.log(`[s123-direct] ❌ Registro NO encontrado con globalid=${globalid}`);
      }
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    res.json({ success: true, message: 'Metadata actualizada localmente', globalid, updated: { componente, instalacion_referencia } });
  } catch (error) {
    console.error('[s123-direct] ❌ Error actualizando metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/descripciones/:globalid
 * Obtiene las descripciones (original y editada) de un registro
 */
router.get('/descripciones/:globalid', authenticate, (req, res) => {
  try {
    const { globalid } = req.params;
    
    console.log(`[s123-direct] 📖 GET /descripciones/${globalid}`);

    const descripciones = getDescripciones(globalid);

    if (!descripciones) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    res.json({
      success: true,
      ...descripciones
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo descripciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/descripciones-editadas/:codigo
 * Obtiene todas las descripciones editadas de un código de acción
 */
router.get('/descripciones-editadas/:codigo', authenticate, (req, res) => {
  try {
    const { codigo } = req.params;
    
    console.log(`[s123-direct] 📖 GET /descripciones-editadas/${codigo}`);

    const editadas = getDescripcionesEditadas(codigo);

    res.json({
      success: true,
      codigo,
      count: editadas.length,
      registros: editadas
    });

  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo descripciones editadas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// ANOTACIONES DE FOTOS (Óvalos/Círculos)
// Ahora usa tabla photo_annotations con photo_id único (globalid_filename)
// Cada foto tiene sus propias anotaciones independientes
// ========================================

/**
 * PUT /api/s123/direct/anotaciones/:photoId
 * Guarda o actualiza las anotaciones de una foto individual
 * photoId formato: globalid_filename (ej: "abc123_foto_1.jpg")
 * Body: { anotaciones: string (JSON) }
 */
router.put('/anotaciones/:photoId', authenticate, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { anotaciones } = req.body;
    console.log(`[s123-direct] ✏️ PUT /anotaciones/${photoId}`);

    const underscoreIndex = photoId.indexOf('_');
    if (underscoreIndex === -1) {
      return res.status(400).json({ error: 'Formato de photoId inválido. Esperado: globalid_filename' });
    }
    
    const globalid = photoId.substring(0, underscoreIndex);
    const filename = photoId.substring(underscoreIndex + 1);

    const database = await ensureDb();
    try {
      database.run(`CREATE TABLE IF NOT EXISTS photo_annotations (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL UNIQUE, globalid TEXT NOT NULL, filename TEXT NOT NULL, annotations TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch (tableErr) {}

    await run(`INSERT INTO photo_annotations (photo_id, globalid, filename, annotations) VALUES (?, ?, ?, ?) ON CONFLICT(photo_id) DO UPDATE SET annotations = excluded.annotations, updated_at = CURRENT_TIMESTAMP`, [photoId, globalid, filename, anotaciones]);

    console.log(`[s123-direct] ✅ Anotaciones guardadas para foto ${photoId}`);
    res.json({ success: true, photoId, globalid, filename });
  } catch (error) {
    console.error('[s123-direct] ❌ Error guardando anotaciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/direct/anotaciones/:photoId
 * Obtiene las anotaciones de una foto individual
 * photoId formato: globalid_filename (ej: "abc123_foto_1.jpg")
 */
router.get('/anotaciones/:photoId', authenticate, async (req, res) => {
  try {
    const { photoId } = req.params;
    console.log(`[s123-direct] 📖 GET /anotaciones/${photoId}`);

    const database = await ensureDb();
    try {
      database.run(`CREATE TABLE IF NOT EXISTS photo_annotations (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL UNIQUE, globalid TEXT NOT NULL, filename TEXT NOT NULL, annotations TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    } catch (tableErr) {}

    const result = await get(`SELECT annotations FROM photo_annotations WHERE photo_id = ?`, [photoId]);
    const record = result.rows[0];

    if (!record) {
      const underscoreIndex = photoId.indexOf('_');
      if (underscoreIndex !== -1) {
        const globalid = photoId.substring(0, underscoreIndex);
        const legacyResult = await get(`SELECT photo_annotations FROM arcgis_records WHERE globalid = ?`, [globalid]);
        const legacyRecord = legacyResult.rows[0];
        
        if (legacyRecord?.photo_annotations) {
          console.log(`[s123-direct] 📖 Usando anotaciones legacy para ${photoId}`);
          return res.json({ success: true, photoId, anotaciones: legacyRecord.photo_annotations, legacy: true });
        }
      }
      return res.json({ success: true, photoId, anotaciones: '[]' });
    }

    res.json({ success: true, photoId, anotaciones: record.annotations || '[]' });
  } catch (error) {
    console.error('[s123-direct] ❌ Error obteniendo anotaciones:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
