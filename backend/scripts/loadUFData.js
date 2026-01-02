/**
 * Script para cargar datos iniciales de Unidades Fiscalizables
 * Ejecutar: node scripts/loadUFData.js
 */

import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import db from '../db/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al archivo CSV
const csvPath = path.join(__dirname, '../../docs/Tabla_datos_UF.csv');

async function loadUFData() {
  console.log('📂 Cargando datos de UF desde:', csvPath);
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Archivo no encontrado:', csvPath);
    process.exit(1);
  }

  // Leer archivo con encoding Latin-1 (Windows-1252)
  const rawBuffer = fs.readFileSync(csvPath);
  const csvContent = iconv.decode(rawBuffer, 'win1252');
  
  // Parsear CSV
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
  } catch (e) {
    // Intentar con coma
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ',',
      relaxColumnCount: true,
      trim: true,
      relax_quotes: true
    });
  }

  console.log(`📊 Registros encontrados: ${records.length}`);
  
  if (records.length === 0) {
    console.error('❌ No se encontraron registros en el CSV');
    process.exit(1);
  }

  // Mostrar columnas encontradas
  console.log('📋 Columnas:', Object.keys(records[0]).join(', '));

  // Crear tabla si no existe
  db.exec(`
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
    
    CREATE INDEX IF NOT EXISTS idx_uf_unidad ON unidades_fiscalizables(unidad_fiscalizable);
    CREATE INDEX IF NOT EXISTS idx_uf_razon_social ON unidades_fiscalizables(razon_social);
    CREATE INDEX IF NOT EXISTS idx_uf_ruc ON unidades_fiscalizables(ruc);
  `);

  // Limpiar datos existentes
  db.exec('DELETE FROM unidades_fiscalizables');
  console.log('🧹 Tabla limpiada');

  // Insertar datos
  const insertStmt = db.prepare(`
    INSERT INTO unidades_fiscalizables (
      n, codigo_admin, tipo, ruc, razon_social,
      dpto_fiscal, prov_fiscal, dist_fiscal, direccion, estad_admin,
      uf_codigo_antiguo, unidad_fiscalizable, uf_codigo_nuevo,
      sector, subsector, competencia, actividad,
      dpto_ejecucion, prov_ejecucion, dist_ejecucion, estad_uf, direccion_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  const insertMany = db.transaction((items) => {
    for (const record of items) {
      if (!record.unidad_fiscalizable || !record.unidad_fiscalizable.trim()) {
        skipped++;
        continue;
      }
      
      insertStmt.run(
        record.n || null,
        record.codigo_admin || null,
        record.tipo || null,
        record.ruc || null,
        record.razon_social || null,
        record.dpto_fiscal || null,
        record.prov_fiscal || null,
        record.dist_fiscal || null,
        record.direccion || null,
        record.estad_admin || null,
        record.uf_codigo_antiguo || null,
        record.unidad_fiscalizable.trim(),
        record.uf_codigo_nuevo || null,
        record.sector || null,
        record.subsector || null,
        record.competencia || null,
        record.actividad || null,
        record.dpto_ejecucion || null,
        record.prov_ejecucion || null,
        record.dist_ejecucion || null,
        record.estad_uf || null,
        record.direccion_ref || null
      );
      inserted++;
    }
  });

  insertMany(records);

  console.log(`✅ Insertados: ${inserted} registros`);
  console.log(`⏭️  Saltados: ${skipped} registros (sin unidad_fiscalizable)`);
  console.log('🎉 Carga completada');
  
  // Mostrar muestra
  const sample = db.prepare('SELECT unidad_fiscalizable, razon_social, ruc FROM unidades_fiscalizables LIMIT 5').all();
  console.log('\n📌 Muestra de datos:');
  sample.forEach((row, i) => {
    console.log(`  ${i+1}. ${row.unidad_fiscalizable} - ${row.razon_social} (${row.ruc})`);
  });

  process.exit(0);
}

loadUFData().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
