/**
 * Endpoints optimizados con sistema de caché local
 * Endpoints duplicados de s123.js pero usando arcgisSync para caché inteligente
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';
import { authenticate } from '../middleware/auth.js';
import {
  getLocalCodigo,
  getLocalRecords,
  getLocalPhotos,
  needsSync,
  syncRecords
} from '../lib/arcgisSync.js';
import { createJob, getJob, updateJob } from '../lib/s123Jobs.js';
import { query } from '../db/config.js';

const router = express.Router();

console.log('[s123-cache] 🔧 Router de caché cargado');

// Middleware de autenticación (TODAS las rutas de abajo requieren autenticación)
// NOTA: El endpoint /photo-local está en s123.js (se carga primero)
router.use(authenticate);

// Middleware de logging para debugging
router.use((req, res, next) => {
  console.log(`[s123-cache] 📡 Request: ${req.method} ${req.url} | User: ${req.user.id}`);
  next();
});

/**
 * POST /api/s123/fetch-cached
 * Versión optimizada que usa caché local con sincronización inteligente
 * 
 * Flujo:
 * 1. Verifica si existe en caché local
 * 2. Si existe y está actualizado, devuelve inmediatamente (RÁPIDO)
 * 3. Si no existe o está desactualizado, sincroniza desde ArcGIS
 * 4. Devuelve datos desde caché local
 */
router.post('/fetch-cached', async (req, res) => {
  console.log(`[s123-cache] 🚀 POST /fetch-cached llamado`);
  console.log(`[s123-cache] 📦 Body recibido:`, req.body);

  try {
    const { codigoAccion, where, force = false } = req.body || {};

    // Si hay WHERE clause, usar el endpoint antiguo (no soportado por caché aún)
    if (where) {
      return res.status(501).json({
        error: 'WHERE clause no soportado en caché',
        message: 'Use /api/s123/fetch para queries con WHERE personalizado'
      });
    }

    if (!codigoAccion) {
      console.error('[s123-cache] ❌ Código de acción no proporcionado');
      console.error('[s123-cache] ❌ Payload recibido:', req.body);
      return res.status(400).json({ error: 'codigoAccion es requerido' });
    }

    console.log(`[s123-cache] 📥 Solicitud de datos para: ${codigoAccion}, force: ${force}, userId: ${req.user.id}`);

    // Crear job para tracking (asociado al usuario)
    const job = await createJob(codigoAccion, {
      userId: req.user.id,
      caCode: codigoAccion,
      fromCache: false
    });

    // Responder inmediatamente con el job ID
    res.json({
      message: 'Proceso iniciado',
      jobId: job.id,
      cached: false // Se actualizará en el job
    });

    // Procesar en background
    (async () => {
      try {
        await updateJob(job.id, {
          status: 'checking_cache',
          message: 'Verificando caché local...'
        });

        // 1. Verificar si necesita sincronización
        const localInfo = getLocalCodigo(codigoAccion);
        const syncCheck = needsSync(codigoAccion);

        let fromCache = false;
        let syncResult = null;

        if (!force && !syncCheck.needsSync && localInfo) {
          // RÁPIDO: Usar caché local
          console.log(`[s123-cache] ⚡ Usando caché local (${syncCheck.reason})`);
          fromCache = true;

          await updateJob(job.id, {
            status: 'reading_cache',
            message: 'Leyendo desde caché local...'
          });

        } else {
          // SINCRONIZAR: Actualizar desde ArcGIS
          const reason = force ? 'forzado por usuario' : syncCheck.reason;
          console.log(`[s123-cache] 🔄 Sincronizando desde ArcGIS (${reason})`);

          await updateJob(job.id, {
            status: 'syncing',
            message: 'Sincronizando con ArcGIS...'
          });

          // Sincronizar con progreso
          syncResult = await syncRecords(codigoAccion, {
            force,
            onProgress: async (progress) => {
              await updateJob(job.id, {
                status: 'syncing',
                message: `Sincronizando: ${progress.stage}`,
                progress: progress.progress
              });
            }
          });

          if (!syncResult.success) {
            throw new Error(syncResult.error);
          }
        }

        // 2. Leer datos desde caché local
        await updateJob(job.id, {
          status: 'preparing',
          message: 'Preparando datos...'
        });

        const records = getLocalRecords(codigoAccion);

        if (records.length === 0) {
          console.log(`[s123-cache] ⚠️  No se encontraron registros para: ${codigoAccion}`);
          console.log(`[s123-cache] ⚠️  Esto puede significar:`);
          console.log(`[s123-cache]    - El código no existe en ArcGIS`);
          console.log(`[s123-cache]    - El código está mal escrito`);
          console.log(`[s123-cache]    - Los registros fueron eliminados`);

          await updateJob(job.id, {
            status: 'completed',
            message: `No se encontraron registros para el código ${codigoAccion}`,
            error: `El código "${codigoAccion}" no tiene datos en ArcGIS. Verifica que el código sea correcto.`,
            recordCount: 0,
            photoCount: 0,
            total: 0,
            fetched: 0,
            withAttachments: 0
          });
          return;
        }

        // 3. Convertir registros a formato CSV
        const csvRows = records.map(r => {
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
            datum: r.datum,
            altitud: r.altitud,
            componente: r.componente,
            tipo_componente: r.tipo_componente,
            detalle_componente: r.detalle_componente,
            numero_punto: r.numero_punto,
            tipo_de_reporte: r.tipo_de_reporte,
            subcomponente: r.subcomponente,
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
            ...parsed // Incluir campos adicionales del JSON original
          };
        });

        // 4. Generar CSV
        const parser = new Parser();
        const csvData = parser.parse(csvRows);

        const jobDir = path.join(process.cwd(), 'uploads', 'jobs', job.id);
        if (!fs.existsSync(jobDir)) {
          fs.mkdirSync(jobDir, { recursive: true });
        }

        const csvPath = path.join(jobDir, 'data.csv');
        const originalCsvPath = path.join(jobDir, 'data_original.csv');
        fs.writeFileSync(csvPath, csvData, 'utf8');
        fs.writeFileSync(originalCsvPath, csvData, 'utf8');

        // 5. Crear directorio de fotos y asegurar que TODAS existan físicamente
        const fotosDir = path.join(jobDir, 'fotos');
        if (!fs.existsSync(fotosDir)) {
          fs.mkdirSync(fotosDir, { recursive: true });
        }

        let totalPhotos = 0;
        let photosDownloaded = 0;
        let photosCopied = 0;

        for (const record of records) {
          const photos = getLocalPhotos(record.globalid);
          const activePhotos = photos.filter(p => p.is_deleted === 0);

          if (activePhotos.length > 0) {
            // Crear subdirectorio por globalid en el job
            const gidDir = path.join(fotosDir, record.globalid);
            if (!fs.existsSync(gidDir)) {
              fs.mkdirSync(gidDir, { recursive: true });
            }

            // Procesar cada foto: verificar existencia, descargar si falta, copiar/linkear
            for (const photo of activePhotos) {
              try {
                let sourcePath;
                if (path.isAbsolute(photo.local_path)) {
                  sourcePath = photo.local_path;
                } else {
                  sourcePath = path.join(process.cwd(), 'uploads', photo.local_path);
                }
                const destPath = path.join(gidDir, photo.filename);

                console.log(`[s123-cache] 📸 Procesando foto: ${photo.filename} (OID: ${record.objectid})`);
                console.log(`[s123-cache]    Source: ${sourcePath}`);
                console.log(`[s123-cache]    Dest: ${destPath}`);

                // VERIFICAR si el archivo fuente existe
                if (!fs.existsSync(sourcePath)) {
                  // ⚠️ Foto registrada en BD pero archivo no existe - DESCARGAR AHORA
                  console.log(`[s123-cache] ⚠️ Archivo fuente no existe. Intentando descargar...`);

                  try {
                    const { downloadAttachment } = await import('../lib/arcgisClient.js');
                    // Usar directorio de caché persistente
                    const cacheDir = path.dirname(sourcePath); // Use the directory of the source path

                    if (!fs.existsSync(cacheDir)) {
                      fs.mkdirSync(cacheDir, { recursive: true });
                    }

                    // Descargar directamente al caché (sourcePath)
                    // Pass layerId=1 explicitly
                    await downloadAttachment(1, record.objectid, photo.attachment_id, cacheDir);

                    // Verificar si se descargó correctamente
                    // downloadAttachment guarda con el nombre del archivo, que debería coincidir con photo.filename o ser renombrado
                    // Pero downloadAttachment usa el nombre del header. 
                    // Vamos a intentar copiar desde cacheDir a destPath si existe algo.

                    // Check if sourcePath exists now
                    if (fs.existsSync(sourcePath)) {
                      console.log(`[s123-cache] ✅ Descarga exitosa a sourcePath.`);
                      fs.copyFileSync(sourcePath, destPath);
                      photosDownloaded++;
                      photosCopied++;
                      totalPhotos++;
                    } else {
                      console.error(`[s123-cache] ❌ Descarga falló o nombre de archivo no coincide. Esperado: ${sourcePath}`);
                      // Try to find what was downloaded in cacheDir
                      const filesInCache = fs.readdirSync(cacheDir);
                      console.log(`[s123-cache]    Archivos en ${cacheDir}: ${filesInCache.join(', ')}`);
                    }

                  } catch (downloadErr) {
                    console.error(`[s123-cache] ❌ Error descargando foto faltante ${photo.filename}:`, downloadErr.message);
                  }
                } else {
                  // Archivo existe - copiar/linkear
                  try {
                    fs.copyFileSync(sourcePath, destPath); // Prefer copy over link for stability in zip
                    photosCopied++;
                    console.log(`[s123-cache] ✅ Copiado exitoso.`);
                  } catch (copyErr) {
                    console.error(`[s123-cache] ❌ Error copiando: ${copyErr.message}`);
                  }
                  totalPhotos++;
                }
              } catch (photoErr) {
                console.error(`[s123-cache] ❌ Error procesando foto ${photo.filename}:`, photoErr.message);
              }
            }
          }
        }

        console.log(`[s123-cache] 📸 Fotos procesadas: ${totalPhotos} total (${photosDownloaded} descargadas, ${photosCopied} copiadas/linkeadas)`);

        // 6. Progreso granular para mejor feedback visual
        // Usamos pasos más pequeños para que las barras se vean animándose suavemente
        const progressSteps = fromCache ? 8 : 5; // Más pasos si es desde caché (es más rápido)
        const stepDelay = fromCache ? 80 : 150; // Delay más corto si es desde caché
        
        for (let step = 1; step <= progressSteps; step++) {
          const recordProgress = Math.min(records.length, Math.floor((records.length * step) / progressSteps));
          const photoProgress = Math.min(totalPhotos, Math.floor((totalPhotos * step) / progressSteps));
          
          // Determinar mensaje según el progreso
          let message = 'Procesando...';
          let status = 'running';
          
          if (step <= progressSteps * 0.3) {
            message = fromCache ? 'Leyendo registros desde caché...' : 'Descargando registros...';
            status = fromCache ? 'reading_cache' : 'syncing';
          } else if (step <= progressSteps * 0.7) {
            message = fromCache ? 'Cargando fotografías...' : 'Descargando fotografías...';
            status = 'running';
          } else {
            message = 'Preparando datos...';
            status = 'preparing';
          }
          
          await updateJob(job.id, {
            status,
            message,
            total: records.length,
            fetched: recordProgress,
            withAttachments: records.length,
            attachmentsTotal: totalPhotos,
            attachmentsDownloaded: photoProgress,
            fromCache
          });
          
          await new Promise(resolve => setTimeout(resolve, stepDelay));
        }

        // 7. Actualizar job como completado
        await updateJob(job.id, {
          status: 'completed',
          message: fromCache ? 'Datos obtenidos desde caché local' : 'Sincronización completada',
          csvPath,
          originalCsvPath, // ✅ Add originalCsvPath
          fotosDir, // ✅ CRÍTICO: Agregar directorio de fotos para que el ZIP funcione
          recordCount: records.length,
          photoCount: totalPhotos,
          fromCache,
          syncStats: syncResult ? syncResult.stats : null
        });

        console.log(`[s123-cache] ✅ Job ${job.id} completado - ${records.length} registros, ${totalPhotos} fotos`);

      } catch (error) {
        console.error(`[s123-cache] ❌ Error en job ${job.id}:`, error);
        await updateJob(job.id, {
          status: 'error',
          message: 'Error al obtener datos',
          error: error.message
        });
      }
    })();

  } catch (error) {
    console.error('[s123-cache] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/cache-info/:codigo
 * Obtiene información sobre el estado de caché de un código
 */
router.get('/cache-info/:codigo', (req, res) => {
  try {
    const codigo = req.params.codigo;
    console.log(`[s123-cache] 🔍 Verificando caché para código: ${codigo}`);

    const localInfo = getLocalCodigo(codigo);
    console.log('[s123-cache] localInfo:', localInfo ? `✅ Encontrado (${localInfo.record_count} registros)` : '❌ No encontrado');

    const syncCheck = needsSync(codigo);

    if (!localInfo) {
      console.log('[s123-cache] ❌ No hay datos en caché para:', codigo);
      return res.json({
        exists: false,
        needsSync: true,
        reason: 'no_local_data'
      });
    }

    const records = getLocalRecords(codigo);
    let totalPhotos = 0;
    for (const record of records) {
      const photos = getLocalPhotos(record.globalid);
      totalPhotos += photos.length;
    }

    console.log(`[s123-cache] ✅ Caché disponible: ${records.length} registros, ${totalPhotos} fotos`);

    res.json({
      exists: true,
      needsSync: syncCheck.needsSync,
      reason: syncCheck.reason,
      info: {
        codigo: localInfo.codigo,
        tipo: localInfo.tipo,
        recordCount: localInfo.record_count,
        totalPhotos,
        lastSync: localInfo.last_sync_at,
        syncedAt: localInfo.synced_at
      }
    });

  } catch (error) {
    console.error('[s123-cache] ❌ Error obteniendo info de caché:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/photos-cached/:jobId
 * Obtiene fotos desde caché local para un job
 */
router.get('/photos-cached/:jobId', async (req, res) => {
  try {
    // Verificar permisos: solo el dueño del job puede acceder
    const job = await getJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });

    const codigo = job.codigoAccion || job.supervision;
    if (!codigo) {
      return res.status(400).json({ error: 'No se pudo determinar el código' });
    }

    const records = getLocalRecords(codigo);
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '30', 10);

    // Agrupar fotos por globalid
    const groups = [];
    for (const record of records) {
      const photos = getLocalPhotos(record.globalid);
      if (photos.length > 0) {
        const firstPhoto = photos[0];
        groups.push({
          globalid: record.globalid,
          count: photos.length,
          first: firstPhoto.filename,
          firstUrl: `/uploads/${firstPhoto.local_path}`,
          meta: {
            componente: record.componente,
            numero_punto: record.numero_punto,
            fecha: record.fecha,
            tipo_de_reporte: record.tipo_de_reporte
          }
        });
      }
    }

    // Paginar
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedGroups = groups.slice(start, end);

    res.json({
      groups: paginatedGroups,
      page,
      pageSize,
      total: groups.length
    });

  } catch (error) {
    console.error('[s123-cache] ❌ Error obteniendo fotos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/s123/ca-stats
 * Obtiene estadísticas de todos los CAs descargados en el caché local
 * Usado por el ChatAI y NuevaActaPage para mostrar CAs disponibles
 */
router.get('/ca-stats', async (req, res) => {
  try {
    // Consulta directa a la tabla arcgis_records (más confiable)
    const result = await query(`
      SELECT 
        COALESCE(codigo_accion, otro_ca) as codigo,
        CASE 
          WHEN codigo_accion IS NOT NULL THEN 'codigo_accion'
          ELSE 'otro_ca'
        END as tipo,
        COUNT(*) as registros_activos,
        MAX(edit_date) as ultima_edicion,
        MAX(synced_at) as ultima_sincronizacion
      FROM arcgis_records
      WHERE (codigo_accion IS NOT NULL OR otro_ca IS NOT NULL)
        AND is_deleted = 0
      GROUP BY COALESCE(codigo_accion, otro_ca)
      HAVING COUNT(*) > 0
      ORDER BY ultima_sincronizacion DESC
    `);

    console.log('[s123-cache] 📊 CAs encontrados:', result.rows?.length || 0);

    res.json({
      success: true,
      stats: result.rows || []
    });

  } catch (error) {
    // Si la tabla no existe, retornar array vacío (no es un error crítico)
    if (error.message?.includes('no such table')) {
      console.log('[s123-cache] ⚠️ Tabla arcgis_records no existe aún');
      return res.json({
        success: true,
        stats: []
      });
    }
    
    console.error('[s123-cache] ❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      details: error.message,
      stack: error.stack // Include stack for debugging
    });
  }
});

export default router;
