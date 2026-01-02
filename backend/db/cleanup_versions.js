/**
 * Script para limpiar todas las versiones y reiniciar la numeración desde 1
 * 
 * Uso: node backend/db/cleanup_versions.js
 * 
 * ADVERTENCIA: Este script ELIMINA todas las versiones de contenido.
 * Los borradores y hechos NO se verán afectados.
 */

import pool from './config.js'

console.log('🗑️  Limpiando versiones de contenido...\n')

try {
  // Contar versiones actuales
  const countResult = pool.prepare('SELECT COUNT(*) as total FROM content_versions').get()
  console.log(`📊 Versiones encontradas: ${countResult.total}`)
  
  if (countResult.total === 0) {
    console.log('\n✅ No hay versiones para eliminar.')
    process.exit(0)
  }
  
  // Mostrar resumen por tipo
  const byType = pool.prepare(`
    SELECT version_type, COUNT(*) as count 
    FROM content_versions 
    GROUP BY version_type
  `).all()
  
  console.log('\n📋 Desglose por tipo:')
  byType.forEach(t => {
    const icon = t.version_type === 'ai_enhanced' ? '🤖' 
               : t.version_type === 'expert_environmental' ? '🌿'
               : t.version_type === 'expert_legal' ? '⚖️'
               : '✏️'
    console.log(`   ${icon} ${t.version_type}: ${t.count}`)
  })
  
  // Eliminar todas las versiones
  const deleteResult = pool.prepare('DELETE FROM content_versions').run()
  console.log(`\n🗑️  Eliminadas: ${deleteResult.changes} versiones`)
  
  // También limpiar sesiones de AI enhancement
  const sessionsResult = pool.prepare('DELETE FROM ai_enhancement_sessions').run()
  console.log(`🧹 Eliminadas: ${sessionsResult.changes} sesiones de AI enhancement`)
  
  console.log('\n✅ Limpieza completada. La próxima versión empezará desde 1.')
  
} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}
