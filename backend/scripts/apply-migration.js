/**
 * Script para aplicar la migración de caché ArcGIS manualmente
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Aplicando migración de caché ArcGIS...');

try {
  // Leer archivo de migración
  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '001_arcgis_sync.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Archivo de migración no encontrado:', migrationPath);
    process.exit(1);
  }
  
  const migration = fs.readFileSync(migrationPath, 'utf8');
  console.log(`📄 Migración cargada desde: ${migrationPath}`);
  
  // Ejecutar migración
  db.exec(migration);
  
  console.log('✅ Migración aplicada exitosamente');
  
  // Verificar tablas creadas
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name LIKE 'arcgis_%'
    ORDER BY name
  `).all();
  
  console.log('\n📋 Tablas creadas:');
  tables.forEach(t => console.log(`  - ${t.name}`));
  
  console.log('\n🎉 Sistema de caché listo para usar');
  
} catch (error) {
  console.error('❌ Error aplicando migración:', error);
  process.exit(1);
}
