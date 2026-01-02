/**
 * Script para agregar la columna photo_annotations a arcgis_records
 * Ejecutar con: node db/add_photo_annotations.js
 */

import db from './config.js'

const TABLE_NAME = 'arcgis_records'

console.log('📊 SQLite database:', db.name || 'local file')
console.log(`🔄 Verificando tabla ${TABLE_NAME}...`)

try {
  // Verificar si la tabla existe
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(TABLE_NAME)
  
  if (!tableExists) {
    throw new Error(`La tabla ${TABLE_NAME} no existe en esta base de datos`)
  }

  // Verificar si la columna ya existe
  const tableInfo = db.prepare(`PRAGMA table_info(${TABLE_NAME})`).all()
  const columnExists = tableInfo.some(col => col.name === 'photo_annotations')
  
  if (columnExists) {
    console.log('✅ La columna photo_annotations ya existe')
  } else {
    // Agregar la columna
    db.exec(`ALTER TABLE ${TABLE_NAME} ADD COLUMN photo_annotations TEXT`)
    console.log('✅ Columna photo_annotations agregada exitosamente')
  }
  
  // Crear índice si no existe
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_arcgis_records_annotations 
    ON ${TABLE_NAME}(photo_annotations) 
    WHERE photo_annotations IS NOT NULL
  `)
  console.log('✅ Índice verificado')
  
  // Verificar la estructura final
  const columns = db.prepare(`PRAGMA table_info(${TABLE_NAME})`).all()
  const annotationsCol = columns.find(c => c.name === 'photo_annotations')
  
  if (annotationsCol) {
    console.log('\n📊 Columna photo_annotations:')
    console.log(`   - Tipo: ${annotationsCol.type || 'TEXT'}`)
    console.log(`   - Posición (cid): ${annotationsCol.cid}`)
  }
  
  console.log('\n🎉 Migración completada!')
  
} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}
