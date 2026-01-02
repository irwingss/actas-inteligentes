import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function setupDatabase() {
  try {
    console.log('🔧 Iniciando configuración de la base de datos SQLite...')
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'init.sql')
    if (!fs.existsSync(sqlPath)) {
        console.warn('⚠️ No se encontró init.sql, saltando configuración inicial de tablas base.')
        return
    }
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar el SQL (SQLite ejecuta múltiples statements)
    // Aseguramos que la DB esté inicializada
    await db.exec(sql)
    
    console.log('✅ Base de datos SQLite configurada exitosamente (tablas base)')
    
    // Verificar tablas solo si se ejecuta directamente o en modo verbose
    // const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    // console.log('\n📋 Tablas en la base de datos:', tables.map(t => t.name).join(', '))
    
  } catch (error) {
    console.error('❌ Error al configurar la base de datos:', error)
    throw error // Propagar error para que quien lo llame sepa que falló
  }
}

// Ejecutar solo si se llama directamente desde node
if (process.argv[1] === __filename) {
    setupDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}
