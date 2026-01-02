/**
 * Módulo de Sincronización Inteligente para ArcGIS
 * 
 * Implementa caché local con sincronización bidireccional:
 * - Detecta cambios en registros (inserts, updates, deletes)
 * - Sincroniza fotografías automáticamente
 * - Mantiene versión local como espejo de la nube
 * - Optimiza velocidad usando caché cuando no hay cambios
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db, { query, run, get, ensureDb } from '../db/config.js';
import { getQueryFieldNames } from '../config/fieldMapping.js';
import { queryFeatures, getOidAndGlobalIdFields, listAttachments, downloadAttachment, fetchEnrichedRecords } from './arcgisClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// UTILIDADES
// ========================================

/**
 * Calcula checksum MD5 de un objeto para detectar cambios
 */
function calculateChecksum(data) {
  const str = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Calcula checksum MD5 de un archivo
 */
function calculateFileChecksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Extrae campos mapeados de un registro de ArcGIS
 */
/**
 * Extrae campos mapeados de un registro de ArcGIS
 */
function extractMappedFields(attributes) {
  const fieldNames = getQueryFieldNames();

  // Helper to safely get attribute by primary name
  const getAttr = (key) => attributes[fieldNames[key]] || attributes[key];

  return {
    // Layer 0 Fields
    objectid: getAttr('objectId'),
    globalid: getAttr('globalId'),
    codigo_accion: getAttr('codigoAccion'),
    otro_ca: getAttr('otroCA'),
    fecha: getAttr('fecha'),
    nombre_supervisor: getAttr('nombreSupervisor'),
    modalidad: getAttr('modalidad'),
    actividad: getAttr('actividad'),
    componente: getAttr('componente'),
    instalacion_referencia: getAttr('instalacionReferencia'),
    nom_pto_ppc: getAttr('nomPtoPpc'),
    num_pto_muestreo: getAttr('numPtoMuestreo'),
    norte: getAttr('norte'),
    este: getAttr('este'),
    zona: getAttr('zona'),
    altitud: getAttr('altitud'),
    tipo_componente: getAttr('tipoComponente'),
    nom_pto_muestreo: getAttr('nomPtoMuestreo'),

    // System Fields
    created_user: getAttr('createdUser'),
    created_date: getAttr('createdDate'),
    last_edited_user: getAttr('lastEditedUser'),
    last_edited_date: getAttr('lastEditedDate'),

    // Related Fields (Flattened)
    descrip_1: getAttr('descrip1'),
    hecho_detec_1: getAttr('hechoDetec1'),
    descrip_2: getAttr('descrip2'),
    guid: getAttr('guid')
  };
}

// ========================================
// GESTIÓN DE BASE DE DATOS
// ========================================

/**
 * Helper para ejecutar una migración y manejar errores.
 */
async function runMigration(migrationFile) {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const migrationPath = path.join(migrationsDir, migrationFile);
  if (fs.existsSync(migrationPath)) {
    try {
      const database = await ensureDb();
      const migration = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        // Attempt 1: Execute entire file at once (faster, atomic-ish)
        database.exec(migration);
      } catch (execError) {
        // Handle "duplicate column" errors for ALTER TABLE migrations
        // This allows re-running migrations that were partially applied or fail on first statement
        if (execError.message.includes('duplicate column name')) {
          console.log(`[arcgisSync] ⚠️  Detectada columna duplicada en ${migrationFile}, intentando ejecución sentencia por sentencia...`);
          
          // Split by semicolon, clean up, and execute individually
          const statements = migration
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
            
          for (const stmt of statements) {
            try {
              database.exec(stmt);
            } catch (stmtError) {
              if (stmtError.message.includes('duplicate column name')) {
                // Ignore, column already exists
                continue;
              }
              // Rethrow other errors (syntax, etc)
              throw stmtError;
            }
          }
        } else {
          // Rethrow if it's not a duplicate column error
          throw execError;
        }
      }
      
      saveDatabase(); // Ensure migration is saved to disk
      console.log(`[arcgisSync] ✅ Migración ejecutada: ${migrationFile}`);
    } catch (error) {
      // Ignorar error si la columna ya existe (para 002)
      if (error.message.includes('duplicate column name')) {
        console.log(`[arcgisSync] ℹ️  Migración ${migrationFile} ya aplicada (columnas existen)`);
      } else {
        console.error(`[arcgisSync] ❌ Error en migración ${migrationFile}:`, error.message);
        throw error; // Re-throw para detener la sincronización si la migración falla críticamente
      }
    }
  } else {
    console.warn('[arcgisSync] ⚠️  Archivo de migración no encontrado:', migrationPath);
  }
}

/**
 * Inicializa las tablas de sincronización
 */
export async function initSyncTables() {
  // Ruta absoluta desde backend/lib/ hacia backend/db/migrations/
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  console.log(`[arcgisSync] 📂 Buscando migraciones en: ${migrationsDir}`);

  // Lista de migraciones a ejecutar en orden
  const migrations = [
    '001_arcgis_sync.sql',
    '002_add_related_fields.sql',
    '002_supabase_auth_migration.sql',
    '004_add_missing_fields.sql',
    '005_add_nom_pto_muestreo.sql',
    '006_add_layer_fields.sql',
    '009_add_layer_id_to_photos.sql',
    '009_descripcion_editada.sql',
    '016_actas_muestreos.sql'
  ];

  for (const migrationFile of migrations) {
    await runMigration(migrationFile);
  }
}

/**
 * Obtiene información de un código desde caché local
 */
export function getLocalCodigo(codigo) {
  try {
    const database = db
    if (!database) return null
    return database.prepare(`SELECT * FROM arcgis_codigos WHERE codigo = ? LIMIT 1`).get(codigo) || null
  } catch (e) {
    console.warn('[getLocalCodigo] Error:', e.message)
    return null
  }
}

/**
 * Obtiene registros locales de un código
 */
export function getLocalRecords(codigo) {
  console.log(`[getLocalRecords] 🔍 Buscando registros para código: "${codigo}"`);

  try {
    const database = db
    if (!database) return []
    
    // Buscar registros
    const results = database.prepare(`SELECT * FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0 ORDER BY edit_date DESC`).all(codigo, codigo)
    
    console.log(`[getLocalRecords] ✅ Registros encontrados: ${results.length}`);
    return results
  } catch (e) {
    console.warn('[getLocalRecords] Error:', e.message)
    return []
  }
}

/**
 * Obtiene fotografías locales de un registro
 */
export function getLocalPhotos(recordGlobalId) {
  try {
    const database = db
    if (!database) return []
    
    // 1. Try exact match first (fastest)
    let photos = database.prepare(`SELECT * FROM arcgis_photos WHERE record_globalid = ? AND is_deleted = 0 ORDER BY filename`).all(recordGlobalId)

    // 2. If no results, try case-insensitive match
    if (photos.length === 0) {
      photos = database.prepare(`SELECT * FROM arcgis_photos WHERE UPPER(record_globalid) = UPPER(?) AND is_deleted = 0 ORDER BY filename`).all(recordGlobalId)
    }

    // 3. If still no results, try ignoring braces
    if (photos.length === 0) {
      const cleanId = recordGlobalId.replace(/[{}]/g, '')
      photos = database.prepare(`SELECT * FROM arcgis_photos WHERE REPLACE(REPLACE(record_globalid, '{', ''), '}', '') LIKE ? AND is_deleted = 0 ORDER BY filename`).all(cleanId)
    }

    return photos
  } catch (e) {
    console.warn('[getLocalPhotos] Error:', e.message)
    return []
  }
}

/**
 * Verifica si necesita sincronización (compara EditDate)
 */
export function needsSync(codigo, thresholdMinutes = 5) {
  const localInfo = getLocalCodigo(codigo);

  // Si no existe localmente, necesita sincronización completa
  if (!localInfo) return { needsSync: true, reason: 'no_local_data' };

  // Si última sincronización fue hace más de X minutos, sincronizar
  const lastSync = new Date(localInfo.last_sync_at);
  const minutesSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60);

  if (minutesSinceSync > thresholdMinutes) {
    return {
      needsSync: true,
      reason: 'time_threshold',
      minutesSinceSync: Math.round(minutesSinceSync)
    };
  }

  return {
    needsSync: false,
    reason: 'recently_synced',
    minutesSinceSync: Math.round(minutesSinceSync)
  };
}

// ========================================
// SINCRONIZACIÓN DE REGISTROS
// ========================================

/**
 * Sincroniza registros de un código de acción
 */
export async function syncRecords(codigo, options = {}) {
  const startTime = Date.now();
  const { force = false, onProgress = null } = options;

  console.log(`[arcgisSync] 🔄 Iniciando sincronización de: ${codigo}`);

  // Asegurar que la base de datos esté inicializada
  const database = await ensureDb();

  // Crear log de sincronización
  database.run(`INSERT INTO arcgis_sync_log (codigo, operation, status) VALUES (?, ?, 'running')`, [codigo, force ? 'force' : 'incremental']);
  const logIdResult = database.exec('SELECT last_insert_rowid() as id');
  const logId = logIdResult[0]?.values[0]?.[0] || 0;

  try {
    // 1. Obtener datos locales actuales
    const localRecords = getLocalRecords(codigo);
    const localByGlobalId = new Map(localRecords.map(r => [r.globalid, r]));

    const stats = {
      records_before: localRecords.length,
      records_inserted: 0,
      records_updated: 0,
      records_deleted: 0,
      photos_inserted: 0,
      photos_deleted: 0,
      photos_processed: 0
    };

    if (onProgress) onProgress({ stage: 'fetching_remote', progress: 0 });

    // 2. Obtener datos remotos de ArcGIS
    console.log(`[arcgisSync] 📡 Descargando registros de ArcGIS para código: ${codigo}`);
    const fieldNames = getQueryFieldNames();
    const where = `${fieldNames.codigoAccion} = '${codigo.replace(/'/g, "''")}'`;

    let remoteRecords;
    try {
      // Usar fetchEnrichedRecords para obtener datos de todas las capas
      remoteRecords = await fetchEnrichedRecords(where, () => { }, (progress) => {
        if (onProgress && progress.stage === 'fetching_layer0') {
          onProgress({ stage: 'processing', progress: 10, total: progress.count });
        }
      });
    } catch (error) {
      // Intentar con otro_ca si codigo_accion falla
      const whereAlt = `${fieldNames.otroCA} = '${codigo.replace(/'/g, "''")}'`;
      try {
        remoteRecords = await fetchEnrichedRecords(whereAlt, () => { }, (progress) => {
          if (onProgress && progress.stage === 'fetching_layer0') {
            onProgress({ stage: 'processing', progress: 10, total: progress.count });
          }
        });
      } catch (e) {
        remoteRecords = [];
        console.error('[arcgisSync] Error fetching remote records:', e);
      }
    }

    // const remoteRecords = remoteData.features || []; // Removed as fetchEnrichedRecords returns array directly
    console.log(`[arcgisSync] 📥 Registros remotos encontrados: ${remoteRecords.length}`);

    if (remoteRecords.length === 0) {
      console.log(`[arcgisSync] ⚠️  ADVERTENCIA: No se encontraron registros en ArcGIS para el código: ${codigo}`);
      console.log(`[arcgisSync] ⚠️  WHERE clause usado: ${where}`);
    }

    if (onProgress) onProgress({ stage: 'processing', progress: 10, total: remoteRecords.length });

    // 3. Procesar cada registro remoto
    const remoteGlobalIds = new Set();
    const { oidField, globalidField } = await getOidAndGlobalIdFields();

    console.log(`[arcgisSync] 🔄 Procesando ${remoteRecords.length} registros remotos...`);

    for (let i = 0; i < remoteRecords.length; i++) {
      const remoteRecord = remoteRecords[i];
      const attrs = remoteRecord; // fetchEnrichedRecords returns attributes directly

      const globalid = attrs[globalidField];
      const objectid = attrs[oidField];

      console.log(`[arcgisSync] 📝 Procesando registro ${i + 1}/${remoteRecords.length}: GlobalID=${globalid}, ObjectID=${objectid}`);

      if (!globalid) {
        console.warn(`[arcgisSync] ⚠️  Registro sin GlobalID, skip: objectid=${objectid}`);
        continue;
      }

      remoteGlobalIds.add(globalid);

      // Extraer campos mapeados
      const mapped = extractMappedFields(attrs);
      console.log(`[arcgisSync] 📋 Campos mapeados para ${globalid}:`, {
        codigo_accion: mapped.codigo_accion,
        otro_ca: mapped.otro_ca,
        componente: mapped.componente,
        nombre_supervisor: mapped.nombre_supervisor
      });

      const rawJson = JSON.stringify(attrs);
      const checksum = calculateChecksum(attrs);

      let localRecord = localByGlobalId.get(globalid);

      // Si no está en el mapa local (del CA actual), verificar si existe en DB bajo otro CA
      if (!localRecord) {
        localRecord = database.prepare('SELECT * FROM arcgis_records WHERE globalid = ?').get(globalid)
      }

      if (!localRecord) {
        // INSERT: Registro nuevo
        console.log(`[arcgisSync] 💾 Intentando INSERT para ${globalid} (nuevo registro)`);

        try {
          database.run(`
            INSERT INTO arcgis_records (
              objectid, globalid, codigo_accion, otro_ca, fecha,
              norte, este, zona, datum, altitud,
              componente, tipo_componente, detalle_componente, numero_punto,
              tipo_de_reporte, subcomponente, nombre_supervisor,
              descripcion, hallazgos, profundidad,
              descripcion_f01, descripcion_f02, descripcion_f03, descripcion_f04, descripcion_f05,
              descripcion_f06, descripcion_f07, descripcion_f08, descripcion_f09, descripcion_f10,
              creation_date, creator, edit_date, editor,
              raw_json, checksum, synced_at,
              descripcion_detallada, hecho_detectado, descripcion_hecho,
              modalidad, actividad, instalacion_referencia, nom_pto_ppc, num_pto_muestreo, nom_pto_muestreo,
              descrip_1, hecho_detec_1, descrip_2, guid, created_user, created_date, last_edited_user, last_edited_date
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
              ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?
            )
          `, [
            mapped.objectid, mapped.globalid, mapped.codigo_accion, mapped.otro_ca, mapped.fecha,
            mapped.norte, mapped.este, mapped.zona, mapped.datum, mapped.altitud,
            mapped.componente, mapped.tipo_componente, mapped.detalle_componente, mapped.numero_punto,
            mapped.tipo_de_reporte, mapped.subcomponente, mapped.nombre_supervisor,
            mapped.descripcion, mapped.hallazgos, mapped.profundidad,
            mapped.descripcion_f01, mapped.descripcion_f02, mapped.descripcion_f03, mapped.descripcion_f04, mapped.descripcion_f05,
            mapped.descripcion_f06, mapped.descripcion_f07, mapped.descripcion_f08, mapped.descripcion_f09, mapped.descripcion_f10,
            mapped.creation_date, mapped.creator, mapped.edit_date, mapped.editor,
            rawJson, checksum,
            mapped.descripcion_detallada, mapped.hecho_detectado, mapped.descripcion_hecho,
            mapped.modalidad, mapped.actividad, mapped.instalacion_referencia, mapped.nom_pto_ppc, mapped.num_pto_muestreo, mapped.nom_pto_muestreo,
            mapped.descrip_1, mapped.hecho_detec_1, mapped.descrip_2, mapped.guid, mapped.created_user, mapped.created_date, mapped.last_edited_user, mapped.last_edited_date
          ]);

          stats.records_inserted++;
          console.log(`[arcgisSync] ➕ ✅ Nuevo registro insertado: ${globalid}`);
        } catch (insertError) {
          console.error(`[arcgisSync] ❌ Error insertando registro ${globalid}:`, insertError);
          console.error(`[arcgisSync] ❌ Datos del registro:`, mapped);
          throw insertError; // Re-throw para que se capture arriba
        }

      } else if (localRecord.checksum !== checksum || localRecord.is_deleted === 1) {
        // UPDATE: Registro modificado o reactivado
        if (localRecord.is_deleted === 1) {
          console.log(`[arcgisSync] ♻️  Reactivando registro eliminado: ${globalid}`);
        }

        database.run(`
          UPDATE arcgis_records SET
            objectid = ?, codigo_accion = ?, otro_ca = ?, fecha = ?,
            norte = ?, este = ?, zona = ?, datum = ?, altitud = ?,
            componente = ?, tipo_componente = ?, detalle_componente = ?, numero_punto = ?,
            tipo_de_reporte = ?, subcomponente = ?, nombre_supervisor = ?,
            descripcion = ?, hallazgos = ?, profundidad = ?,
            descripcion_f01 = ?, descripcion_f02 = ?, descripcion_f03 = ?, descripcion_f04 = ?, descripcion_f05 = ?,
            descripcion_f06 = ?, descripcion_f07 = ?, descripcion_f08 = ?, descripcion_f09 = ?, descripcion_f10 = ?,
            creation_date = ?, creator = ?, edit_date = ?, editor = ?,
            raw_json = ?, checksum = ?, synced_at = datetime('now'), is_deleted = 0,
            descripcion_detallada = ?, hecho_detectado = ?, descripcion_hecho = ?,
            modalidad = ?, actividad = ?, instalacion_referencia = ?, nom_pto_ppc = ?, num_pto_muestreo = ?, nom_pto_muestreo = ?,
            descrip_1 = ?, hecho_detec_1 = ?, descrip_2 = ?, guid = ?, created_user = ?, created_date = ?, last_edited_user = ?, last_edited_date = ?
          WHERE globalid = ?
        `, [
          mapped.objectid, mapped.codigo_accion, mapped.otro_ca, mapped.fecha,
          mapped.norte, mapped.este, mapped.zona, mapped.datum, mapped.altitud,
          mapped.componente, mapped.tipo_componente, mapped.detalle_componente, mapped.numero_punto,
          mapped.tipo_de_reporte, mapped.subcomponente, mapped.nombre_supervisor,
          mapped.descripcion, mapped.hallazgos, mapped.profundidad,
          mapped.descripcion_f01, mapped.descripcion_f02, mapped.descripcion_f03, mapped.descripcion_f04, mapped.descripcion_f05,
          mapped.descripcion_f06, mapped.descripcion_f07, mapped.descripcion_f08, mapped.descripcion_f09, mapped.descripcion_f10,
          mapped.creation_date, mapped.creator, mapped.edit_date, mapped.editor,
          rawJson, checksum,
          mapped.descripcion_detallada, mapped.hecho_detectado, mapped.descripcion_hecho,
          mapped.modalidad, mapped.actividad, mapped.instalacion_referencia, mapped.nom_pto_ppc, mapped.num_pto_muestreo, mapped.nom_pto_muestreo,
          mapped.descrip_1, mapped.hecho_detec_1, mapped.descrip_2, mapped.guid, mapped.created_user, mapped.created_date, mapped.last_edited_user, mapped.last_edited_date,
          globalid
        ]);

        stats.records_updated++;
        console.log(`[arcgisSync] 🔄 Registro actualizado/reactivado: ${globalid}`);
      }

      // ---------------------------------------------------------
      // Sincronización de FOTOS (Layer 1 y Layer 2 Attachments)
      // ---------------------------------------------------------
      // Support both single OID (legacy) and array of OIDs (new)
      const layer1Oids = attrs._layer1_oids || (attrs._layer1_oid ? [attrs._layer1_oid] : []);
      const layer2Oids = attrs._layer2_oids || [];

      // Sync Layer 1 Photos
      if (layer1Oids.length > 0) {
        try {
          for (const oid of layer1Oids) {
            await syncPhotosForRecord(database, 1, oid, globalid);
          }
          stats.photos_processed += layer1Oids.length;
        } catch (err) {
          console.error(`[arcgisSync] ❌ Error syncing Layer 1 photos for ${globalid}:`, err);
          stats.errors++;
        }
      }

      // Sync Layer 2 Photos
      if (layer2Oids.length > 0) {
        try {
          for (const oid of layer2Oids) {
            await syncPhotosForRecord(database, 2, oid, globalid);
          }
          stats.photos_processed += layer2Oids.length;
        } catch (err) {
          console.error(`[arcgisSync] ❌ Error syncing Layer 2 photos for ${globalid}:`, err);
          stats.errors++;
        }
      }

      if (onProgress && i % 5 === 0) {
        onProgress({
          stage: 'processing',
          progress: 10 + Math.floor((i / remoteRecords.length) * 60),
          current: i,
          total: remoteRecords.length
        });
      }
    }

    // 4. Marcar como eliminados los registros que ya no existen remotamente
    for (const localRecord of localRecords) {
      if (!remoteGlobalIds.has(localRecord.globalid)) {
        database.run(`UPDATE arcgis_records SET is_deleted = 1, synced_at = datetime('now') WHERE globalid = ?`, [localRecord.globalid]);
        stats.records_deleted++;
        console.log(`[arcgisSync] 🗑️  Registro eliminado: ${localRecord.globalid}`);
      }
    }

    if (onProgress) onProgress({ stage: 'syncing_photos', progress: 70 });

    // 5. Sincronizar fotografías (ya manejado en el bucle principal)
    // const photoStats = await syncPhotosForCode(codigo, { onProgress });
    // stats.photos_inserted = photoStats.inserted;
    // stats.photos_deleted = photoStats.deleted;

    // 6. Actualizar tabla de códigos
    console.log(`[arcgisSync] 💾 Guardando código en tabla arcgis_codigos: ${codigo}`);
    const tipocodigo = remoteRecords[0]?.[fieldNames.codigoAccion] ? 'codigo_accion' : 'otro_ca';
    database.run(`INSERT INTO arcgis_codigos (codigo, tipo, record_count, last_sync_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(codigo) DO UPDATE SET record_count = excluded.record_count, last_sync_at = excluded.last_sync_at, synced_at = datetime('now')`, [codigo, tipocodigo, remoteRecords.length]);
    console.log(`[arcgisSync] ✅ Código guardado en arcgis_codigos:`, { codigo, tipo: tipocodigo, count: remoteRecords.length });

    // 7. Actualizar log de sincronización
    const duration = Date.now() - startTime;
    stats.records_after = getLocalRecords(codigo).length;

    database.run(`
      UPDATE arcgis_sync_log SET
        status = 'completed', records_before = ?, records_after = ?,
        records_inserted = ?, records_updated = ?, records_deleted = ?,
        photos_inserted = ?, photos_deleted = ?,
        completed_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `, [stats.records_before, stats.records_after, stats.records_inserted, stats.records_updated, stats.records_deleted, stats.photos_inserted, stats.photos_deleted, duration, logId]);

    if (onProgress) onProgress({ stage: 'completed', progress: 100 });

    console.log(`[arcgisSync] ✅ Sincronización completada en ${duration}ms`);
    console.log(`[arcgisSync] 📊 Estadísticas:`, stats);

    return {
      success: true,
      stats,
      duration,
      logId
    };

  } catch (error) {
    // Actualizar log con error
    try {
      database.run(`UPDATE arcgis_sync_log SET status = 'error', error_message = ?, completed_at = datetime('now') WHERE id = ?`, [error.message, logId]);
    } catch (e) {
      console.error('[arcgisSync] Error updating log:', e.message);
    }

    console.error(`[arcgisSync] ❌ Error en sincronización:`, error);

    return {
      success: false,
      error: error.message,
      logId
    };
  }
}

/**
 * Sincroniza fotos para un registro específico (desde Layer 1)
 */
/**
 * Sincroniza fotos para un registro específico (desde Layer 1 o 2)
 */
async function syncPhotosForRecord(database, layerId, recordOid, parentGlobalId) {
  // 1. Listar adjuntos del Layer especificado
  const attachments = await listAttachments(layerId, recordOid);

  if (!attachments || attachments.length === 0) return;

  const photosDir = path.join(__dirname, '../storage/photos');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }

  for (const att of attachments) {
    // 2. Verificar si ya existe en DB (por layer_id, attachment_id y objectid)
    const existing = database.prepare('SELECT id, record_globalid FROM arcgis_photos WHERE layer_id = ? AND attachment_id = ? AND objectid = ?').get(layerId, att.id, recordOid)

    if (existing) {
      // Ya existe. Verificamos si el parentGlobalId coincide.
      if (existing.record_globalid !== parentGlobalId) {
        console.log(`[arcgisSync] ⚠️  Actualizando parentGlobalId para foto ${att.id} (Layer ${layerId}): ${existing.record_globalid} -> ${parentGlobalId}`);
        database.run('UPDATE arcgis_photos SET record_globalid = ?, synced_at = datetime(\'now\') WHERE id = ?', [parentGlobalId, existing.id]);
      }
      continue;
    }

    // 3. Descargar foto
    console.log(`[arcgisSync] 📸 Descargando foto (Layer ${layerId}): ${att.name} (ID: ${att.id})`);
    try {
      const { filePath, filename } = await downloadAttachment(layerId, recordOid, att.id, photosDir);

      // 4. Insertar en DB
      // Necesitamos record_id. Lo buscamos.
      const recordRow = database.prepare('SELECT id FROM arcgis_records WHERE globalid = ?').get(parentGlobalId)
      const recordId = recordRow?.id || 0

      database.run(`
        INSERT INTO arcgis_photos (
          record_id, record_globalid, layer_id, attachment_id, objectid,
          filename, local_path, content_type, file_size, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [recordId, parentGlobalId, layerId, att.id, recordOid, filename, filePath, att.contentType, att.size]);

    } catch (error) {
      console.error(`[arcgisSync] ❌ Error descargando foto ${att.id}:`, error.message);
    }
  }
}

// ========================================
// EDICIÓN DE DESCRIPCIONES
// ========================================

/**
 * Actualiza la descripción editada de un registro
 * @param {string} globalid - GlobalID del registro
 * @param {string} campo - Campo a editar: 'descrip_1', 'descrip_2', 'hecho_detec_1'
 * @param {string} valorEditado - Nuevo valor editado (null para borrar edición)
 */
export function updateDescripcionEditada(globalid, campo, valorEditado) {
  const camposPermitidos = ['descrip_1', 'descrip_2', 'hecho_detec_1'];
  
  if (!camposPermitidos.includes(campo)) {
    throw new Error(`Campo no permitido: ${campo}. Campos válidos: ${camposPermitidos.join(', ')}`);
  }
  
  const columnaEditada = `${campo}_editada`;
  if (campo === 'hecho_detec_1') {
    // hecho_detec_1 -> hecho_detec_1_editado (sin 'a' final)
  }
  const columna = campo === 'hecho_detec_1' ? 'hecho_detec_1_editado' : `${campo}_editada`;
  
  console.log(`[arcgisSync] ✏️ Actualizando ${columna} para globalid ${globalid}`);
  
  try {
    const database = db
    if (!database) throw new Error('Database not initialized')
    
    database.run(`UPDATE arcgis_records SET ${columna} = ?, user_edited_at = datetime('now'), local_updated_at = datetime('now') WHERE globalid = ?`, [valorEditado, globalid])
    const changesResult = database.exec('SELECT changes() as changes')
    const changes = changesResult[0]?.values[0]?.[0] || 0
    
    if (changes === 0) {
      throw new Error(`Registro no encontrado: ${globalid}`);
    }
    
    console.log(`[arcgisSync] ✅ Descripción actualizada correctamente`);
    return { changes }
  } catch (e) {
    console.error('[arcgisSync] Error actualizando descripción:', e.message)
    throw e
  }
}

/**
 * Obtiene las descripciones (original y editada) de un registro
 * @param {string} globalid - GlobalID del registro
 */
export function getDescripciones(globalid) {
  try {
    const database = db
    if (!database) return null
    return database.prepare(`SELECT globalid, descrip_1, descrip_1_editada, descrip_2, descrip_2_editada, hecho_detec_1, hecho_detec_1_editado, user_edited_at FROM arcgis_records WHERE globalid = ?`).get(globalid) || null
  } catch (e) {
    console.warn('[getDescripciones] Error:', e.message)
    return null
  }
}

/**
 * Obtiene todas las descripciones editadas de un código de acción
 * @param {string} codigo - Código de acción
 */
export function getDescripcionesEditadas(codigo) {
  try {
    const database = db
    if (!database) return []
    return database.prepare(`SELECT globalid, descrip_1, descrip_1_editada, descrip_2, descrip_2_editada, hecho_detec_1, hecho_detec_1_editado, user_edited_at FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0 AND (descrip_1_editada IS NOT NULL OR descrip_2_editada IS NOT NULL OR hecho_detec_1_editado IS NOT NULL)`).all(codigo, codigo)
  } catch (e) {
    console.warn('[getDescripcionesEditadas] Error:', e.message)
    return []
  }
}

// ========================================
// EXPORTACIONES
// ========================================

export default {
  initSyncTables,
  getLocalCodigo,
  getLocalRecords,
  getLocalPhotos,
  needsSync,
  syncRecords,
  updateDescripcionEditada,
  getDescripciones,
  getDescripcionesEditadas
};
