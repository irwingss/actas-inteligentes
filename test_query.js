import { initDatabase, query } from './backend/db/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testCaStats() {
  try {
    console.log('Initializing DB...');
    await initDatabase();
    console.log('DB Initialized.');

    const sql = `
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

    console.log('Running query...');
    const result = await query(sql);
    console.log('Query Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Test Failed:', error);
  }
}

testCaStats();
