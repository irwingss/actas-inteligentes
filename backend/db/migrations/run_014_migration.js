/**
 * Script para ejecutar la migración 014: Anotaciones por foto individual
 * Ejecutar con: node db/migrations/run_014_migration.js
 */

import db from '../config.js';

console.log('🚀 Ejecutando migración 014: Anotaciones por foto individual...\n');

try {
  // 1. Crear tabla photo_annotations
  console.log('📋 Creando tabla photo_annotations...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id TEXT NOT NULL UNIQUE,
      globalid TEXT NOT NULL,
      filename TEXT NOT NULL,
      annotations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Tabla photo_annotations creada/verificada');
  
  // 2. Crear índices
  console.log('📋 Creando índices...');
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_annotations_photo_id ON photo_annotations(photo_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_annotations_globalid ON photo_annotations(globalid)`);
    console.log('✅ Índices creados/verificados');
  } catch (err) {
    console.log('⚠️ Índices ya existen o error:', err.message);
  }
  
  // 3. Crear trigger para updated_at
  console.log('📋 Creando trigger para updated_at...');
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS photo_annotations_updated_at
      AFTER UPDATE ON photo_annotations
      FOR EACH ROW
      BEGIN
        UPDATE photo_annotations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    console.log('✅ Trigger creado/verificado');
  } catch (err) {
    console.log('⚠️ Trigger ya existe o error:', err.message);
  }
  
  // 4. Migrar datos legacy (solo si hay datos en arcgis_records.photo_annotations)
  console.log('📋 Migrando datos legacy...');
  try {
    const legacyCount = db.prepare(`
      SELECT COUNT(*) as count FROM arcgis_records 
      WHERE photo_annotations IS NOT NULL 
        AND photo_annotations != '' 
        AND photo_annotations != '[]'
    `).get();
    
    if (legacyCount.count > 0) {
      db.exec(`
        INSERT OR IGNORE INTO photo_annotations (photo_id, globalid, filename, annotations)
        SELECT 
          globalid || '_foto_1',
          globalid,
          'foto_1',
          photo_annotations
        FROM arcgis_records 
        WHERE photo_annotations IS NOT NULL 
          AND photo_annotations != '' 
          AND photo_annotations != '[]'
      `);
      console.log(`✅ ${legacyCount.count} registros legacy encontrados para migración`);
    } else {
      console.log('ℹ️ No hay datos legacy para migrar');
    }
  } catch (err) {
    console.log('⚠️ Error migrando datos legacy:', err.message);
  }
  
  // 5. Verificar la tabla
  const tableInfo = db.prepare(`PRAGMA table_info(photo_annotations)`).all();
  console.log('\n📊 Estructura de photo_annotations:');
  tableInfo.forEach(col => {
    console.log(`   - ${col.name}: ${col.type || 'TEXT'}`);
  });
  
  // 6. Contar registros
  const count = db.prepare('SELECT COUNT(*) as count FROM photo_annotations').get();
  console.log(`\n📈 Total registros en photo_annotations: ${count.count}`);
  
  console.log('\n✅ Migración 014 completada exitosamente!');
  
} catch (error) {
  console.error('❌ Error en migración:', error);
  process.exit(1);
}
