/**
 * Script para limpiar la base de datos SQLite local
 * Elimina todos los datos de registros, fotos y logs de sincronización
 * Mantiene la estructura de tablas intacta
 */

import db from '../db/config.js'

console.log('🧹 Iniciando limpieza de base de datos...\n')

try {
  // Desactivar foreign keys temporalmente para evitar problemas
  db.pragma('foreign_keys = OFF')
  
  // Tablas a limpiar (en orden para respetar foreign keys)
  const tablesToClean = [
    'arcgis_photos',
    'arcgis_records', 
    'arcgis_codigos',
    'arcgis_sync_log',
    'tabular_data',
    'photos',
    'sync_log'
  ]
  
  console.log('📊 Estado ANTES de limpiar:')
  for (const table of tablesToClean) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
      console.log(`   ${table}: ${count.count} registros`)
    } catch (e) {
      console.log(`   ${table}: tabla no existe o error`)
    }
  }
  
  console.log('\n🗑️  Eliminando datos...')
  
  for (const table of tablesToClean) {
    try {
      const result = db.prepare(`DELETE FROM ${table}`).run()
      console.log(`   ✅ ${table}: ${result.changes} registros eliminados`)
    } catch (e) {
      console.log(`   ⚠️  ${table}: ${e.message}`)
    }
  }
  
  // Resetear sync_config a valores iniciales
  console.log('\n🔄 Reseteando configuración de sincronización...')
  try {
    db.prepare(`UPDATE sync_config SET value = '' WHERE key = 'last_full_sync'`).run()
    db.prepare(`UPDATE sync_config SET value = 'never' WHERE key = 'last_sync_status'`).run()
    console.log('   ✅ sync_config reseteado')
  } catch (e) {
    console.log(`   ⚠️  sync_config: ${e.message}`)
  }
  
  // Reactivar foreign keys
  db.pragma('foreign_keys = ON')
  
  // Ejecutar VACUUM para liberar espacio
  console.log('\n🧹 Ejecutando VACUUM para liberar espacio...')
  db.exec('VACUUM')
  console.log('   ✅ VACUUM completado')
  
  console.log('\n📊 Estado DESPUÉS de limpiar:')
  for (const table of tablesToClean) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
      console.log(`   ${table}: ${count.count} registros`)
    } catch (e) {
      console.log(`   ${table}: tabla no existe`)
    }
  }
  
  console.log('\n✅ Base de datos limpiada exitosamente!')
  console.log('   Ahora puedes descargar datos frescos desde la aplicación.\n')
  
} catch (error) {
  console.error('❌ Error durante la limpieza:', error)
  process.exit(1)
}

process.exit(0)
