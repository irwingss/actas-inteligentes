import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Determinar la ruta de la base de datos
const getDbPath = () => {
  if (process.env.NODE_ENV === 'production') {
    const appDataPath = process.env.APPDATA || process.env.HOME
    const dbDir = path.join(appDataPath, 'ActasInteligentes')
    
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    
    return path.join(dbDir, 'actas_inteligentes.db')
  }
  
  return path.join(__dirname, 'actas_inteligentes.db')
}

const dbPath = getDbPath()

// Inicializar sql.js y la base de datos
let db = null
let SQL = null
let initialized = false
let initPromise = null

const initDatabase = async () => {
  if (initialized) return db
  if (initPromise) return initPromise
  
  initPromise = (async () => {
    try {
      // Inicializar sql.js
      SQL = await initSqlJs()
      
      // Cargar base de datos existente o crear nueva
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath)
        db = new SQL.Database(fileBuffer)
        console.log(`📊 SQLite database loaded: ${dbPath}`)
      } else {
        db = new SQL.Database()
        console.log(`📊 SQLite database created: ${dbPath}`)
      }
      
      // Configuración de SQLite
      db.run('PRAGMA journal_mode = WAL')
      db.run('PRAGMA synchronous = NORMAL')
      db.run('PRAGMA cache_size = 10000')
      db.run('PRAGMA temp_store = MEMORY')
      db.run('PRAGMA foreign_keys = ON')
      
      initialized = true

      // DEBUG: List tables
      try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        if (tables.length > 0 && tables[0].values) {
          const tableNames = tables[0].values.map(v => v[0]);
          console.log('[db] 📋 Tables in DB:', tableNames.join(', '));
        } else {
          console.log('[db] ⚠️ No tables found in DB (new database?)');
        }
      } catch (e) {
        console.error('[db] ❌ Error listing tables:', e);
      }
      
      // Guardar periódicamente (cada 30 segundos)
      setInterval(() => {
        saveDatabase()
      }, 30000)
      
      // Guardar al cerrar
      process.on('exit', saveDatabase)
      process.on('SIGINT', () => {
        saveDatabase()
        process.exit()
      })
      process.on('SIGTERM', () => {
        saveDatabase()
        process.exit()
      })
      
      return db
    } catch (error) {
      console.error('Error initializing SQLite:', error)
      initPromise = null // Allow retry on failure
      initialized = false
      throw error
    }
  })()
  
  return initPromise
}

// Guardar base de datos a disco
const saveDatabase = () => {
  if (db && initialized) {
    try {
      const data = db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(dbPath, buffer)
    } catch (error) {
      console.error('Error saving database:', error)
    }
  }
}

// Asegurar que la DB está inicializada
const ensureDb = async () => {
  if (!initialized) {
    await initDatabase()
  }
  return db
}

// Función helper para queries SELECT (compatible con better-sqlite3)
export const query = async (sql, params = []) => {
  try {
    const database = await ensureDb()
    const stmt = database.prepare(sql)
    if (params.length > 0) {
      stmt.bind(params)
    }
    
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    
    return { rows, rowCount: rows.length }
  } catch (error) {
    console.error('Error en query:', error)
    throw error
  }
}

// Función para queries INSERT/UPDATE/DELETE
export const run = async (sql, params = []) => {
  try {
    const database = await ensureDb()
    
    if (params.length > 0) {
      database.run(sql, params)
    } else {
      database.run(sql)
    }
    
    // Obtener el último ID insertado y los cambios
    const lastIdResult = database.exec('SELECT last_insert_rowid() as id')
    const changesResult = database.exec('SELECT changes() as changes')
    
    const lastInsertRowid = lastIdResult[0]?.values[0]?.[0] || 0
    const changes = changesResult[0]?.values[0]?.[0] || 0
    
    // Guardar después de modificaciones
    saveDatabase()
    
    return {
      rows: [{ id: lastInsertRowid }],
      rowCount: changes,
      lastInsertRowid
    }
  } catch (error) {
    console.error('Error en run:', error)
    throw error
  }
}

// Función para obtener un solo registro
export const get = async (sql, params = []) => {
  try {
    const database = await ensureDb()
    const stmt = database.prepare(sql)
    if (params.length > 0) {
      stmt.bind(params)
    }
    
    let row = null
    if (stmt.step()) {
      row = stmt.getAsObject()
    }
    stmt.free()
    
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
  } catch (error) {
    console.error('Error en get:', error)
    throw error
  }
}

// Función para transacciones
export const transaction = (fn) => {
  return async (...args) => {
    const database = await ensureDb()
    try {
      database.run('BEGIN TRANSACTION')
      const result = await fn(...args)
      database.run('COMMIT')
      saveDatabase()
      return result
    } catch (error) {
      database.run('ROLLBACK')
      throw error
    }
  }
}

// Función para cerrar la base de datos
export const close = () => {
  if (db) {
    saveDatabase()
    db.close()
    db = null
    initialized = false
  }
}

// Función de preparación síncrona para compatibilidad
// (sql.js usa prepare diferente a better-sqlite3)
export const prepare = async (sql) => {
  const database = await ensureDb()
  return {
    all: (...params) => {
      const stmt = database.prepare(sql)
      if (params.length > 0) {
        stmt.bind(params)
      }
      const rows = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
      return rows
    },
    run: (...params) => {
      if (params.length > 0) {
        database.run(sql, params)
      } else {
        database.run(sql)
      }
      saveDatabase()
      const lastIdResult = database.exec('SELECT last_insert_rowid() as id')
      const changesResult = database.exec('SELECT changes() as changes')
      return {
        lastInsertRowid: lastIdResult[0]?.values[0]?.[0] || 0,
        changes: changesResult[0]?.values[0]?.[0] || 0
      }
    },
    get: (...params) => {
      const stmt = database.prepare(sql)
      if (params.length > 0) {
        stmt.bind(params)
      }
      let row = null
      if (stmt.step()) {
        row = stmt.getAsObject()
      }
      stmt.free()
      return row
    }
  }
}

// Inicializar al importar
initDatabase().catch(console.error)

// Objeto de compatibilidad con better-sqlite3
const dbProxy = {
  prepare: (sql) => {
    // Versión síncrona que espera a que db esté listo
    if (!db) {
      throw new Error('Database not initialized. Use async methods or wait for initialization.')
    }
    return {
      all: (...params) => {
        const stmt = db.prepare(sql)
        if (params.length > 0) {
          stmt.bind(params)
        }
        const rows = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows
      },
      run: (...params) => {
        if (params.length > 0) {
          db.run(sql, params)
        } else {
          db.run(sql)
        }
        saveDatabase()
        const lastIdResult = db.exec('SELECT last_insert_rowid() as id')
        const changesResult = db.exec('SELECT changes() as changes')
        return {
          lastInsertRowid: lastIdResult[0]?.values[0]?.[0] || 0,
          changes: changesResult[0]?.values[0]?.[0] || 0
        }
      },
      get: (...params) => {
        const stmt = db.prepare(sql)
        if (params.length > 0) {
          stmt.bind(params)
        }
        let row = null
        if (stmt.step()) {
          row = stmt.getAsObject()
        }
        stmt.free()
        return row
      }
    }
  },
  pragma: (pragma) => {
    if (db) {
      db.run(`PRAGMA ${pragma}`)
    }
  },
  exec: (sql) => {
    if (db) {
      db.exec(sql)
      saveDatabase()
    }
  },
  transaction: (fn) => {
    return (...args) => {
      if (!db) {
        throw new Error('Database not initialized')
      }
      try {
        db.run('BEGIN TRANSACTION')
        const result = fn(...args)
        db.run('COMMIT')
        saveDatabase()
        return result
      } catch (error) {
        db.run('ROLLBACK')
        throw error
      }
    }
  },
  close: () => close()
}

// Exportar el proxy como default para compatibilidad
export default dbProxy

// Exportar función de inicialización para uso explícito
export { initDatabase, ensureDb, saveDatabase }
