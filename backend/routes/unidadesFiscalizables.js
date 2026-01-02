import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import db, { query, run, ensureDb } from '../db/config.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Configurar multer para recibir archivos CSV
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV'));
    }
  }
});

// Inicializar tabla de unidades fiscalizables
const initUFTable = async () => {
  const database = await ensureDb();
  database.run(`
    CREATE TABLE IF NOT EXISTS unidades_fiscalizables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      n INTEGER,
      codigo_admin TEXT,
      tipo TEXT,
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
      direccion_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_unidad ON unidades_fiscalizables(unidad_fiscalizable)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_razon_social ON unidades_fiscalizables(razon_social)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_uf_ruc ON unidades_fiscalizables(ruc)`);
  console.log('[UF] ✅ Tabla unidades_fiscalizables inicializada');
};

// Inicializar al cargar el módulo
initUFTable().catch(err => console.error('[UF] Error inicializando tabla:', err));

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
        razon_social,
        ruc,
        dpto_ejecucion,
        prov_ejecucion,
        dist_ejecucion,
        direccion_ref,
        competencia
      FROM unidades_fiscalizables
      WHERE unidad_fiscalizable LIKE ?
         OR razon_social LIKE ?
         OR ruc LIKE ?
      ORDER BY unidad_fiscalizable
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, parseInt(limit)]);

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
 * GET /api/uf/:id
 * Obtener una unidad fiscalizable por ID
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
 * Subir un CSV para actualizar las unidades fiscalizables
 * Solo superadmin
 */
router.post('/upload', authenticate, requireSuperAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    // Detectar encoding y parsear CSV
    // Intentar primero con UTF-8, luego con Windows-1252
    let csvContent;
    try {
      csvContent = req.file.buffer.toString('utf-8');
      // Verificar si hay caracteres corruptos (indica encoding incorrecto)
      if (csvContent.includes('�')) {
        csvContent = iconv.decode(req.file.buffer, 'win1252');
      }
    } catch (e) {
      csvContent = iconv.decode(req.file.buffer, 'win1252');
    }
    
    // Intentar parsear el CSV
    let records;
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        relaxColumnCount: true,
        trim: true,
        relax_quotes: true
      });
    } catch (parseError) {
      // Intentar con coma como delimitador
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ',',
        relaxColumnCount: true,
        trim: true,
        relax_quotes: true
      });
    }

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'El archivo CSV está vacío o tiene formato inválido' });
    }

    // Verificar que tenga la columna unidad_fiscalizable
    const firstRecord = records[0];
    if (!firstRecord.hasOwnProperty('unidad_fiscalizable')) {
      return res.status(400).json({ 
        error: 'El CSV debe contener la columna "unidad_fiscalizable"',
        columnsFound: Object.keys(firstRecord)
      });
    }

    // Reemplazar todos los datos usando transacción manual
    const database = await ensureDb();
    database.run('BEGIN TRANSACTION');
    
    let insertedCount = 0;
    try {
      // Limpiar tabla existente
      database.run('DELETE FROM unidades_fiscalizables');
      
      for (const record of records) {
        if (!record.unidad_fiscalizable || !record.unidad_fiscalizable.trim()) {
          continue;
        }
        
        database.run(`
          INSERT INTO unidades_fiscalizables (
            n, codigo_admin, tipo, ruc, razon_social,
            dpto_fiscal, prov_fiscal, dist_fiscal, direccion, estad_admin,
            uf_codigo_antiguo, unidad_fiscalizable, uf_codigo_nuevo,
            sector, subsector, competencia, actividad,
            dpto_ejecucion, prov_ejecucion, dist_ejecucion, estad_uf, direccion_ref
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.n || null, record.codigo_admin || null, record.tipo || null,
          record.ruc || null, record.razon_social || null, record.dpto_fiscal || null,
          record.prov_fiscal || null, record.dist_fiscal || null, record.direccion || null,
          record.estad_admin || null, record.uf_codigo_antiguo || null,
          record.unidad_fiscalizable.trim(), record.uf_codigo_nuevo || null,
          record.sector || null, record.subsector || null, record.competencia || null,
          record.actividad || null, record.dpto_ejecucion || null, record.prov_ejecucion || null,
          record.dist_ejecucion || null, record.estad_uf || null, record.direccion_ref || null
        ]);
        insertedCount++;
      }
      
      database.run('COMMIT');
    } catch (txErr) {
      database.run('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Se importaron ${insertedCount} unidades fiscalizables`,
      stats: {
        totalRecords: records.length,
        imported: insertedCount,
        skipped: records.length - insertedCount
      }
    });
  } catch (error) {
    console.error('[UF] Error uploading CSV:', error);
    res.status(500).json({ 
      error: 'Error al procesar el archivo CSV',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/uf/all
 * Eliminar todas las unidades fiscalizables
 * Solo superadmin
 */
router.delete('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await run('DELETE FROM unidades_fiscalizables');
    
    res.json({
      success: true,
      message: `Se eliminaron ${result.rowCount} registros`
    });
  } catch (error) {
    console.error('[UF] Error deleting all:', error);
    res.status(500).json({ error: 'Error al eliminar unidades fiscalizables' });
  }
});

export default router;
