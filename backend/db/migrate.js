import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigration(migrationFile) {
  try {
    console.log(`\n🔄 Ejecutando migración: ${migrationFile}`)
    
    const sqlPath = path.join(__dirname, 'migrations', migrationFile)
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`❌ Archivo de migración no encontrado: ${sqlPath}`)
      return false
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar la migración en una transacción
    const transaction = db.transaction(() => {
      db.exec(sql)
    })
    
    transaction()
    
    console.log(`✅ Migración completada: ${migrationFile}`)
    return true
  } catch (error) {
    console.error(`❌ Error en migración ${migrationFile}:`, error)
    return false
  }
}

async function migrate() {
  try {
    console.log('🚀 Iniciando proceso de migración...\n')
    
    // Listar todas las migraciones
    const migrationsDir = path.join(__dirname, 'migrations')
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
    
    console.log(`📋 Migraciones encontradas: ${files.length}`)
    files.forEach(f => console.log(`   - ${f}`))
    
    // Ejecutar cada migración
    for (const file of files) {
      const success = await runMigration(file)
      if (!success) {
        console.error('\n❌ Proceso de migración detenido debido a errores')
        process.exit(1)
      }
    }
    
    // Verificar tablas finales
    console.log('\n📊 Verificando estructura de la base de datos...')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    console.log('\n✅ Tablas en la base de datos:')
    tables.forEach(t => console.log(`   - ${t.name}`))
    
    console.log('\n🎉 Migración completada exitosamente!')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error en el proceso de migración:', error)
    process.exit(1)
  }
}

migrate()
