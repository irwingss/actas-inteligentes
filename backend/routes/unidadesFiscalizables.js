import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db, { query, run, ensureDb } from '../db/config.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// Configurar multer para recibir archivos Excel
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for Excel
  fileFilter: (req, file, cb) => {
    const isExcel = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      || file.mimetype === 'application/vnd.ms-excel'
      || file.originalname.endsWith('.xlsx')
      || file.originalname.endsWith('.xls');
    if (isExcel) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
  }
});

// Mapeo de columnas del Excel (headers en fila 1, datos desde fila 2)
// Formato: header del Excel -> columna de la base de datos
const EXCEL_COLUMN_MAP = {
  'n': 'n',
  'admin_codigo': 'codigo_admin',
  'tipo_doc': 'tipo_doc',
  'ruc': 'ruc',
  'razon_social': 'razon_social',
  'dpto_razon_social': 'dpto_fiscal',
  'prov_razon_social': 'prov_fiscal',
  'dist_razon_social': 'dist_fiscal',
  'admin_direccion': 'direccion',
  'admin_estado': 'estad_admin',
  'codigo_antiguo': 'uf_codigo_antiguo',
  'unidad_fiscalizable': 'unidad_fiscalizable',
  'codigo_nuevo': 'uf_codigo_nuevo',
  'sector': 'sector',
  'subsector': 'subsector',
  'competencia': 'competencia',
  'actividad': 'actividad',
  'dpto_ejecucion': 'dpto_ejecucion',
  'prov_ejecucion': 'prov_ejecucion',
  'dist_ejecucion': 'dist_ejecucion',
  'estad_uf': 'estad_uf',
  'direccion_ref': 'direccion',
  // Alias adicionales por si acaso
  'unidad_fisca': 'unidad_fiscalizable',
  'dpto_ejecuci': 'dpto_ejecucion',
  'prov_ejecuci': 'prov_ejecucion', 
  'dist_ejecuci': 'dist_ejecucion',
};

// Inicializar tabla de unidades fiscalizables (local SQLite)
const initUFTable = async () => {
  const database = await ensureDb();
  
  // Verificar si la tabla existe y tiene todas las columnas necesarias
  try {
    const tableInfo = await new Promise((resolve, reject) => {
      const result = database.exec('PRAGMA table_info(unidades_fiscalizables)');
      resolve(result.length > 0 ? result[0].values : []);
    });
    
    const existingColumns = tableInfo.map(row => row[1]); // column name is at index 1
    const requiredColumns = ['tipo_doc', 'codigo_admin', 'dpto_fiscal', 'prov_fiscal', 'dist_fiscal', 'estad_admin', 'uf_codigo_antiguo', 'uf_codigo_nuevo'];
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (existingColumns.length > 0 && missingColumns.length > 0) {
      console.log('[UF] Tabla existente le faltan columnas:', missingColumns);
      console.log('[UF] Recreando tabla con todas las columnas...');
      database.run('DROP TABLE IF EXISTS unidades_fiscalizables');
    }
  } catch (err) {
    console.log('[UF] No se pudo verificar tabla existente, creando nueva...');
  }
  
  database.run(`
    CREATE TABLE IF NOT EXISTS unidades_fiscalizables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      n INTEGER,
      codigo_admin TEXT,
      tipo_doc TEXT,
      ruc TEXT,
      razon_social TEXT,
      dpto_fiscal TEXT,
      prov_fiscal TEXT,
      dist_fiscal TEXT,
      direccion TEXT,
      estad_admin TEXT,
      uf_codigo_antiguo TEXT,
      unidad_fiscalizable TEXT NOT NULL,
      uf_codigo_nuevo TEXT,
      sector TEXT,
      subsector TEXT,
      competencia TEXT,
      actividad TEXT,
      dpto_ejecucion TEXT,
      prov_ejecucion TEXT,
      dist_ejecucion TEXT,
      estad_uf TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_unidad ON unidades_fiscalizables(unidad_fiscalizable)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_razon_social ON unidades_fiscalizables(razon_social)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_ruc ON unidades_fiscalizables(ruc)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_codigo_nuevo ON unidades_fiscalizables(uf_codigo_nuevo)`);
  console.log('[UF] ✅ Tabla unidades_fiscalizables inicializada');
};

// Inicializar al cargar el módulo
initUFTable().catch(err => console.error('[UF] Error inicializando tabla:', err));

/**
 * Refrescar el schema cache de Supabase usando una query directa
 * Esto fuerza a PostgREST a recargar el schema
 */
async function refreshSupabaseSchemaCache() {
  try {
    // Hacer una query simple para verificar que la tabla existe
    const { error } = await supabaseAdmin
      .from('unidades_fiscalizables')
      .select('id')
      .limit(1);
    
    if (error && error.message.includes('schema cache')) {
      console.log('[UF] Schema cache desactualizado, intentando NOTIFY...');
      // Usar RPC para notificar a PostgREST que recargue el schema
      const { error: rpcError } = await supabaseAdmin.rpc('pg_notify', {
        channel: 'pgrst',
        payload: 'reload schema'
      });
      
      if (rpcError) {
        console.log('[UF] NOTIFY falló (normal si no existe la función):', rpcError.message);
      }
      
      // Esperar un momento para que el cache se actualice
      await new Promise(resolve => setTimeout(resolve, 1000));
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[UF] Error verificando schema cache:', err.message);
    return false;
  }
}

/**
 * Parsear Excel y extraer registros
 * Formato esperado: headers en fila 1 (índice 0), datos desde fila 2 (índice 1)
 */
function parseExcelToRecords(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  if (rawData.length < 2) {
    throw new Error('El archivo Excel debe tener al menos 2 filas (encabezados y datos)');
  }
  
  // Headers en fila 1 (índice 0), datos desde fila 2 (índice 1)
  const headerRow = rawData[0];
  
  console.log('[UF] Headers encontrados:', headerRow?.filter(h => h).length);
  console.log('[UF] Primera fila de headers:', headerRow?.slice(0, 5));
  
  // Mapear índices de columnas
  const columnIndices = {};
  
  headerRow.forEach((header, idx) => {
    if (!header) return;
    const cleanHeader = String(header).trim();
    
    if (EXCEL_COLUMN_MAP[cleanHeader]) {
      columnIndices[EXCEL_COLUMN_MAP[cleanHeader]] = idx;
    }
  });
  
  console.log('[UF] Columnas mapeadas:', Object.keys(columnIndices));
  
  // Verificar columna requerida
  if (!columnIndices.hasOwnProperty('unidad_fiscalizable')) {
    throw new Error(`El Excel debe contener la columna "unidad_fiscalizable". Columnas encontradas: ${headerRow?.filter(h => h).join(', ')}`);
  }
  
  // Procesar datos desde fila 2 (índice 1)
  const records = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;
    
    const ufValue = row[columnIndices['unidad_fiscalizable']];
    if (!ufValue || !String(ufValue).trim()) continue;
    
    const record = {
      n: row[columnIndices['n']] ? parseInt(row[columnIndices['n']]) : null,
      codigo_admin: row[columnIndices['codigo_admin']] || null,
      tipo_doc: row[columnIndices['tipo_doc']] || null,
      ruc: row[columnIndices['ruc']] ? String(row[columnIndices['ruc']]).trim() : null,
      razon_social: row[columnIndices['razon_social']] || null,
      dpto_fiscal: row[columnIndices['dpto_fiscal']] || null,
      prov_fiscal: row[columnIndices['prov_fiscal']] || null,
      dist_fiscal: row[columnIndices['dist_fiscal']] || null,
      direccion: row[columnIndices['direccion']] || null,
      estad_admin: row[columnIndices['estad_admin']] || null,
      uf_codigo_antiguo: row[columnIndices['uf_codigo_antiguo']] || null,
      unidad_fiscalizable: String(ufValue).trim(),
      uf_codigo_nuevo: row[columnIndices['uf_codigo_nuevo']] || null,
      sector: row[columnIndices['sector']] || null,
      subsector: row[columnIndices['subsector']] || null,
      competencia: row[columnIndices['competencia']] || null,
      actividad: row[columnIndices['actividad']] || null,
      dpto_ejecucion: row[columnIndices['dpto_ejecucion']] || null,
      prov_ejecucion: row[columnIndices['prov_ejecucion']] || null,
      dist_ejecucion: row[columnIndices['dist_ejecucion']] || null,
      estad_uf: row[columnIndices['estad_uf']] || null,
    };
    records.push(record);
  }
  
  console.log('[UF] Registros parseados:', records.length);
  return records;
}

/**
 * GET /api/uf/search
 * Buscar unidades fiscalizables por texto
 * Query params: q (texto de búsqueda), limit (máx resultados)
 */
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, results: [], count: 0 });
    }

    const searchTerm = `%${q}%`;
    const results = await query(`
      SELECT DISTINCT
        id,
        unidad_fiscalizable,
        uf_codigo_nuevo,
        razon_social,
        ruc,
        codigo_admin,
        tipo_doc,
        dpto_fiscal,
        prov_fiscal,
        dist_fiscal,
        direccion,
        dpto_ejecucion,
        prov_ejecucion,
        dist_ejecucion,
        competencia,
        actividad,
        sector,
        subsector,
        estad_admin,
        estad_uf
      FROM unidades_fiscalizables
      WHERE unidad_fiscalizable LIKE ?
         OR razon_social LIKE ?
         OR ruc LIKE ?
         OR uf_codigo_nuevo LIKE ?
      ORDER BY unidad_fiscalizable
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit)]);

    res.json({
      success: true,
      results: results.rows,
      count: results.rows.length
    });
  } catch (error) {
    console.error('[UF] Error searching:', error);
    res.status(500).json({ error: 'Error al buscar unidades fiscalizables' });
  }
});

/**
 * GET /api/uf/stats
 * Obtener estadísticas de las unidades fiscalizables
 */
router.get('/stats/summary', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const countResult = await query('SELECT COUNT(*) as total FROM unidades_fiscalizables');
    const lastUpdate = await query('SELECT MAX(updated_at) as last_update FROM unidades_fiscalizables');
    
    res.json({
      success: true,
      stats: {
        total: countResult.rows[0]?.total || 0,
        lastUpdate: lastUpdate.rows[0]?.last_update || null
      }
    });
  } catch (error) {
    console.error('[UF] Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * POST /api/uf/upload
 * Subir un Excel para actualizar las unidades fiscalizables y sincronizar a Supabase
 * Solo superadmin
 */
router.post('/upload', authenticate, requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    console.log('[UF] Procesando archivo Excel:', req.file.originalname);
    
    // Parsear Excel
    const records = parseExcelToRecords(req.file.buffer);

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'El archivo Excel está vacío o tiene formato inválido' });
    }

    console.log(`[UF] Registros parseados: ${records.length}`);

    // 1. Intentar sincronizar a Supabase (no bloquear si falla)
    let supabaseInserted = 0;
    let supabaseError = null;
    
    try {
      console.log('[UF] Sincronizando a Supabase...');
      
      // Eliminar registros existentes en Supabase
      const { error: deleteError } = await supabaseAdmin
        .from('unidades_fiscalizables')
        .delete()
        .neq('id', 0); // Eliminar todos
      
      if (deleteError) {
        console.warn('[UF] Error eliminando datos de Supabase:', deleteError.message);
        // Si la tabla no existe, continuar sin Supabase
        if (deleteError.code === '42P01' || deleteError.message.includes('does not exist')) {
          throw new Error('Tabla no existe en Supabase. Ejecute la migración primero.');
        }
      }

      // Insertar en lotes de 500 para evitar límites
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabaseAdmin
          .from('unidades_fiscalizables')
          .insert(batch);
        
        if (insertError) {
          console.error('[UF] Error insertando lote en Supabase:', insertError);
          throw new Error(`Error al insertar en Supabase: ${insertError.message}`);
        }
        supabaseInserted += batch.length;
        console.log(`[UF] Supabase: ${supabaseInserted}/${records.length} registros insertados`);
      }

      // Registrar metadata de sincronización
      await supabaseAdmin
        .from('uf_sync_metadata')
        .insert({
          total_records: supabaseInserted,
          file_name: req.file.originalname,
          synced_by: req.user?.id || null
        });

      console.log('[UF] Supabase sincronizado correctamente');
    } catch (sbError) {
      supabaseError = sbError.message;
      console.warn('[UF] No se pudo sincronizar a Supabase:', sbError.message);
      console.log('[UF] Continuando con sincronización local...');
    }

    // 2. Ahora actualizar SQLite local
    const database = await ensureDb();
    database.run('BEGIN TRANSACTION');
    
    let localInserted = 0;
    try {
      database.run('DELETE FROM unidades_fiscalizables');
      
      for (const record of records) {
        database.run(`
          INSERT INTO unidades_fiscalizables (
            n, codigo_admin, tipo_doc, ruc, razon_social,
            dpto_fiscal, prov_fiscal, dist_fiscal, direccion, estad_admin,
            uf_codigo_antiguo, unidad_fiscalizable, uf_codigo_nuevo,
            sector, subsector, competencia, actividad,
            dpto_ejecucion, prov_ejecucion, dist_ejecucion, estad_uf
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.n, record.codigo_admin, record.tipo_doc,
          record.ruc, record.razon_social, record.dpto_fiscal,
          record.prov_fiscal, record.dist_fiscal, record.direccion,
          record.estad_admin, record.uf_codigo_antiguo,
          record.unidad_fiscalizable, record.uf_codigo_nuevo,
          record.sector, record.subsector, record.competencia,
          record.actividad, record.dpto_ejecucion, record.prov_ejecucion,
          record.dist_ejecucion, record.estad_uf
        ]);
        localInserted++;
      }
      
      database.run('COMMIT');
    } catch (txErr) {
      database.run('ROLLBACK');
      throw txErr;
    }

    const message = supabaseError 
      ? `Se importaron ${localInserted} unidades fiscalizables localmente. Supabase: ${supabaseError}`
      : `Se importaron ${localInserted} unidades fiscalizables y se sincronizaron a Supabase`;

    res.json({
      success: true,
      message,
      stats: {
        totalRecords: records.length,
        localInserted,
        supabaseInserted
      },
      supabaseError: supabaseError || null
    });
  } catch (error) {
    console.error('[UF] Error uploading Excel:', error);
    res.status(500).json({ 
      error: 'Error al procesar el archivo Excel',
      details: error.message 
    });
  }
});

/**
 * GET /api/uf/download
 * Descargar las unidades fiscalizables como Excel
 * Solo superadmin
 */
router.get('/download', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Obtener datos de Supabase
    const { data, error } = await supabaseAdmin
      .from('unidades_fiscalizables')
      .select('*')
      .order('n', { ascending: true });
    
    if (error) {
      throw new Error(`Error obteniendo datos de Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No hay datos para descargar' });
    }

    // Crear Excel con el mismo formato que se sube (snake_case headers)
    const workbook = XLSX.utils.book_new();
    
    // Usar los mismos headers snake_case del formato de subida
    const excelData = data.map(row => ({
      'n': row.n,
      'admin_codigo': row.codigo_admin,
      'tipo_doc': row.tipo_doc,
      'ruc': row.ruc,
      'razon_social': row.razon_social,
      'dpto_razon_social': row.dpto_fiscal,
      'prov_razon_social': row.prov_fiscal,
      'dist_razon_social': row.dist_fiscal,
      'admin_direccion': row.direccion,
      'admin_estado': row.estad_admin,
      'codigo_antiguo': row.uf_codigo_antiguo,
      'unidad_fiscalizable': row.unidad_fiscalizable,
      'codigo_nuevo': row.uf_codigo_nuevo,
      'sector': row.sector,
      'subsector': row.subsector,
      'competencia': row.competencia,
      'actividad': row.actividad,
      'dpto_ejecucion': row.dpto_ejecucion,
      'prov_ejecucion': row.prov_ejecucion,
      'dist_ejecucion': row.dist_ejecucion,
      'estad_uf': row.estad_uf,
      'direccion_ref': row.direccion
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Unidades_Fiscalizables');
    
    // Generar buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Unidades_Fiscalizables_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    console.error('[UF] Error downloading Excel:', error);
    res.status(500).json({ error: 'Error al generar el archivo Excel', details: error.message });
  }
});

/**
 * POST /api/uf/sync-from-supabase
 * Sincronizar datos desde Supabase hacia SQLite local
 * Usado al abrir la app para tener datos actualizados
 */
router.post('/sync-from-supabase', authenticate, async (req, res) => {
  try {
    console.log('[UF] Sincronizando desde Supabase a local...');
    
    // Verificar/refrescar schema cache primero
    const cacheOk = await refreshSupabaseSchemaCache();
    if (!cacheOk) {
      console.log('[UF] Schema cache puede estar desactualizado, reintentando...');
    }
    
    // Obtener datos de Supabase
    const { data, error, count } = await supabaseAdmin
      .from('unidades_fiscalizables')
      .select('*', { count: 'exact' });
    
    if (error) {
      // Si el error es de schema cache, dar mensaje más claro
      if (error.message.includes('schema cache')) {
        throw new Error(`La tabla unidades_fiscalizables no está en el cache de Supabase. Por favor, espera unos minutos y vuelve a intentar, o verifica que la migración se haya ejecutado correctamente en Supabase.`);
      }
      throw new Error(`Error obteniendo datos de Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No hay datos en Supabase para sincronizar',
        stats: { synced: 0 }
      });
    }

    // Actualizar SQLite local
    const database = await ensureDb();
    database.run('BEGIN TRANSACTION');
    
    let syncedCount = 0;
    try {
      database.run('DELETE FROM unidades_fiscalizables');
      
      for (const record of data) {
        database.run(`
          INSERT INTO unidades_fiscalizables (
            n, codigo_admin, tipo_doc, ruc, razon_social,
            dpto_fiscal, prov_fiscal, dist_fiscal, direccion, estad_admin,
            uf_codigo_antiguo, unidad_fiscalizable, uf_codigo_nuevo,
            sector, subsector, competencia, actividad,
            dpto_ejecucion, prov_ejecucion, dist_ejecucion, estad_uf
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.n, record.codigo_admin, record.tipo_doc,
          record.ruc, record.razon_social, record.dpto_fiscal,
          record.prov_fiscal, record.dist_fiscal, record.direccion,
          record.estad_admin, record.uf_codigo_antiguo,
          record.unidad_fiscalizable, record.uf_codigo_nuevo,
          record.sector, record.subsector, record.competencia,
          record.actividad, record.dpto_ejecucion, record.prov_ejecucion,
          record.dist_ejecucion, record.estad_uf
        ]);
        syncedCount++;
      }
      
      database.run('COMMIT');
    } catch (txErr) {
      database.run('ROLLBACK');
      throw txErr;
    }

    console.log(`[UF] Sincronizados ${syncedCount} registros desde Supabase`);

    res.json({
      success: true,
      message: `Se sincronizaron ${syncedCount} unidades fiscalizables`,
      stats: { synced: syncedCount }
    });
  } catch (error) {
    console.error('[UF] Error syncing from Supabase:', error);
    res.status(500).json({ 
      error: 'Error al sincronizar desde Supabase',
      details: error.message 
    });
  }
});

/**
 * GET /api/uf/sync-status
 * Obtener el estado de sincronización (metadata de Supabase)
 */
router.get('/sync-status', authenticate, async (req, res) => {
  try {
    // Obtener conteo local primero (siempre disponible)
    let localTotal = 0;
    try {
      const localCount = await query('SELECT COUNT(*) as total FROM unidades_fiscalizables');
      localTotal = localCount.rows[0]?.total || 0;
    } catch (localErr) {
      console.warn('[UF] Error obteniendo conteo local:', localErr.message);
    }

    // Obtener conteo de Supabase
    let supabaseTotal = 0;
    let metadata = null;
    
    try {
      // Usar select con count para obtener el total de registros
      const { data: countData, count, error: countError } = await supabaseAdmin
        .from('unidades_fiscalizables')
        .select('id', { count: 'exact', head: true });
      
      console.log('[UF] Supabase count response:', { count, countData, error: countError?.message });
      
      if (!countError && count !== null) {
        supabaseTotal = count;
      } else if (countError) {
        console.warn('[UF] Error obteniendo conteo Supabase:', countError.message);
      }

      // Obtener metadata de sincronización
      const { data: metaData, error: metaError } = await supabaseAdmin
        .from('uf_sync_metadata')
        .select('*')
        .order('last_sync_at', { ascending: false })
        .limit(1);
      
      if (!metaError && metaData && metaData.length > 0) {
        metadata = metaData[0];
      }
    } catch (sbErr) {
      console.warn('[UF] Error conectando a Supabase:', sbErr.message);
    }

    console.log('[UF] Sync status - Local:', localTotal, 'Supabase:', supabaseTotal);

    res.json({
      success: true,
      status: {
        local: {
          total: localTotal
        },
        supabase: {
          total: supabaseTotal,
          lastSync: metadata?.last_sync_at || null,
          lastFile: metadata?.file_name || null
        },
        needsSync: localTotal !== supabaseTotal
      }
    });
  } catch (error) {
    console.error('[UF] Error getting sync status:', error);
    res.status(500).json({ error: 'Error al obtener estado de sincronización' });
  }
});

/**
 * DELETE /api/uf/all
 * Eliminar todas las unidades fiscalizables (local y Supabase)
 * Solo superadmin
 */
router.delete('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Eliminar de Supabase
    const { error: supabaseError } = await supabaseAdmin
      .from('unidades_fiscalizables')
      .delete()
      .neq('id', 0);
    
    if (supabaseError) {
      console.error('[UF] Error eliminando de Supabase:', supabaseError);
    }

    // Eliminar local
    const result = await run('DELETE FROM unidades_fiscalizables');
    
    res.json({
      success: true,
      message: 'Se eliminaron todos los registros de local y Supabase'
    });
  } catch (error) {
    console.error('[UF] Error deleting all:', error);
    res.status(500).json({ error: 'Error al eliminar unidades fiscalizables' });
  }
});

/**
 * GET /api/uf/:id
 * Obtener una unidad fiscalizable por ID
 * IMPORTANTE: Esta ruta debe estar al final para no capturar rutas como /download, /sync-status
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT *
      FROM unidades_fiscalizables
      WHERE id = ?
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unidad fiscalizable no encontrada' });
    }

    res.json({
      success: true,
      uf: result.rows[0]
    });
  } catch (error) {
    console.error('[UF] Error getting UF:', error);
    res.status(500).json({ error: 'Error al obtener unidad fiscalizable' });
  }
});

export default router;
