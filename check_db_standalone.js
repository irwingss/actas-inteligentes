import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDb() {
  try {
    const dbPath = path.join(__dirname, 'backend', 'db', 'actas_inteligentes.db');
    console.log(`Checking DB at: ${dbPath}`);
    
    if (!fs.existsSync(dbPath)) {
      console.error('DB file not found!');
      return;
    }

    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    
    // Check tables
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', JSON.stringify(tables, null, 2));

    // Try ca-stats query
    try {
      const statsQuery = `
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
      `;
      const res = db.exec(statsQuery);
      console.log('Stats Query Result:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('Stats Query Failed:', e);
    }
    
    // Check s123_jobs table
    try {
      const jobs = db.exec("SELECT * FROM s123_jobs LIMIT 5");
      console.log('Jobs:', JSON.stringify(jobs, null, 2));
    } catch (e) {
      console.error('Jobs Query Failed:', e);
    }

  } catch (err) {
    console.error('Fatal Error:', err);
  }
}

checkDb();
