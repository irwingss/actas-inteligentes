import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function setupDatabase() {
  try {
    console.log('🔧 Iniciando configuración de la base de datos SQLite...')
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'init.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar el SQL (SQLite ejecuta múltiples statements)
    db.exec(sql)
    
    console.log('✅ Base de datos SQLite configurada exitosamente')
    console.log('📊 Tablas creadas:')
    console.log('   - users (con campos de sincronización)')
    console.log('   - tabular_data (para datos tabulados futuros)')
    console.log('   - photos (para fotografías futuras)')
    console.log('   - sync_log (log de sincronización)')
    console.log('   - sync_config (configuración de sync)')
    
    // Verificar que las tablas se crearon
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    console.log('\n📋 Tablas en la base de datos:', tables.map(t => t.name).join(', '))
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Error al configurar la base de datos:', error)
    process.exit(1)
  }
}

setupDatabase()
