import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Script para limpiar archivos .meta.json antiguos
 * y convertirlos a .meta
 */

const geojsonDir = path.join(__dirname, '../../frontend/public/geojson')

console.log('[cleanup] 🧹 Limpiando archivos de metadata antiguos...')
console.log('[cleanup] 📁 Directorio:', geojsonDir)

if (!fs.existsSync(geojsonDir)) {
  console.log('[cleanup] ❌ Directorio no encontrado')
  process.exit(1)
}

const files = fs.readdirSync(geojsonDir)
let cleaned = 0

files.forEach(file => {
  // Encontrar archivos .meta.json
  if (file.endsWith('.meta.json')) {
    const oldPath = path.join(geojsonDir, file)
    const baseName = file.replace('.meta.json', '')
    const newPath = path.join(geojsonDir, `${baseName}.meta`)
    
    try {
      // Renombrar de .meta.json a .meta
      fs.renameSync(oldPath, newPath)
      console.log(`[cleanup] ✅ Convertido: ${file} → ${baseName}.meta`)
      cleaned++
    } catch (err) {
      console.error(`[cleanup] ❌ Error procesando ${file}:`, err.message)
    }
  }
})

console.log(`\n[cleanup] 🎉 Limpieza completada: ${cleaned} archivo(s) procesado(s)`)
