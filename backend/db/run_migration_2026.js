/**
 * Script para ejecutar la migración del formulario 2026
 * 
 * Uso:
 *   node db/run_migration_2026.js
 * 
 * Este script:
 * 1. Lee la migración 003_formulario_2026.sql
 * 2. La ejecuta en la base de datos SQLite
 * 3. Verifica que los cambios se aplicaron correctamente
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta a la base de datos
const DB_PATH = path.join(__dirname, 'actas_inteligentes.db');
const MIGRATION_PATH = path.join(__dirname, 'migrations', '003_formulario_2026.sql');

console.log('🚀 Iniciando migración para Formulario 2026...\n');

// Verificar que existe la base de datos
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Error: No se encontró la base de datos en:', DB_PATH);
  console.error('   Ejecuta primero: npm run init-db');
  process.exit(1);
}

// Verificar que existe el archivo de migración
if (!fs.existsSync(MIGRATION_PATH)) {
  console.error('❌ Error: No se encontró el archivo de migración en:', MIGRATION_PATH);
  process.exit(1);
}

try {
  // Abrir conexión a la base de datos
  console.log('📊 Conectando a la base de datos...');
  const db = new Database(DB_PATH);
  
  // Habilitar foreign keys
  db.pragma('foreign_keys = ON');
  
  // Leer el archivo de migración
  console.log('📄 Leyendo archivo de migración...');
  const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
  
  // Dividir en statements individuales (separados por ;)
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`📝 Encontrados ${statements.length} statements SQL\n`);
  
  // Ejecutar cada statement
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // Extraer tipo de statement
    const type = statement.split(/\s+/)[0].toUpperCase();
    
    try {
      db.exec(statement + ';');
      successCount++;
      
      // Mostrar progreso cada 10 statements
      if ((i + 1) % 10 === 0) {
        console.log(`✓ Procesados ${i + 1}/${statements.length} statements...`);
      }
    } catch (error) {
      // Si el error es "duplicate column name" o "already exists", es OK (ya migrado)
      if (
        error.message.includes('duplicate column name') ||
        error.message.includes('already exists')
      ) {
        skipCount++;
      } else {
        errorCount++;
        console.error(`\n❌ Error en statement ${i + 1} (${type}):`);
        console.error(`   ${error.message}`);
        console.error(`   Statement: ${statement.substring(0, 100)}...`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Resumen de la migración:');
  console.log('='.repeat(60));
  console.log(`✅ Exitosos:  ${successCount}`);
  console.log(`⏭️  Omitidos:  ${skipCount} (ya existían)`);
  console.log(`❌ Errores:   ${errorCount}`);
  console.log('='.repeat(60) + '\n');
  
  // Verificar que las nuevas columnas existen
  console.log('🔍 Verificando nuevas columnas...\n');
  
  const tableInfo = db.pragma('table_info(arcgis_records)');
  const columnNames = tableInfo.map(col => col.name);
  
  const expectedColumns = [
    'fecha_hora',
    'ca',
    'modalidad',
    'actividad',
    'supervisor',
    'instalacion_referencia',
    'nom_pto_ppc',
    'num_pto_muestreo',
    'nom_pto_muestreo',
    'hechos_json',
    'geo_pregunta',
    'geo_area_json',
    'geo_longitud_json',
    'geo_punto_json'
  ];
  
  let allColumnsExist = true;
  
  for (const col of expectedColumns) {
    if (columnNames.includes(col)) {
      console.log(`✅ Columna '${col}' existe`);
    } else {
      console.log(`❌ Columna '${col}' NO existe`);
      allColumnsExist = false;
    }
  }
  
  // Verificar que la nueva tabla existe
  console.log('\n🔍 Verificando nueva tabla...\n');
  
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='arcgis_hechos_fotos'").all();
  
  if (tables.length > 0) {
    console.log('✅ Tabla arcgis_hechos_fotos creada correctamente');
    
    // Mostrar estructura de la tabla
    const hechosTableInfo = db.pragma('table_info(arcgis_hechos_fotos)');
    console.log(`   Columnas: ${hechosTableInfo.length}`);
  } else {
    console.log('❌ Tabla arcgis_hechos_fotos NO fue creada');
    allColumnsExist = false;
  }
  
  // Verificar vistas
  console.log('\n🔍 Verificando vistas...\n');
  
  const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'arcgis_%2026%'").all();
  
  for (const view of views) {
    console.log(`✅ Vista '${view.name}' creada`);
  }
  
  // Cerrar conexión
  db.close();
  
  console.log('\n' + '='.repeat(60));
  if (allColumnsExist && errorCount === 0) {
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('='.repeat(60));
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Actualizar backend para usar nuevos campos');
    console.log('   2. Actualizar frontend para mostrar nuevos campos');
    console.log('   3. Cuando llegue 2026, migrar datos históricos');
    console.log('   4. Esperar confirmación de estructura multimedia de Survey123\n');
  } else {
    console.log('⚠️  MIGRACIÓN COMPLETADA CON ADVERTENCIAS');
    console.log('='.repeat(60));
    console.log('\n   Revisa los errores arriba y ejecuta de nuevo si es necesario.\n');
  }
  
} catch (error) {
  console.error('\n❌ Error fatal durante la migración:');
  console.error(error);
  process.exit(1);
}
