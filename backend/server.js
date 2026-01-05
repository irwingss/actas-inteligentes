import dotenv from 'dotenv'; // Trigger restart
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Importar módulo de paths para rutas centralizadas
import { getUploadsPath, getBaseStoragePath } from './lib/paths.js'

// IMPORTANTE: Cargar variables de entorno PRIMERO
// Buscar .env en el directorio del server.js (backend/)
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });
console.log('[server] 📁 Cargando .env desde:', envPath);
console.log('[server] 🔑 Supabase configurado:', !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY);

// Configuración por defecto de ArcGIS (si no está en .env)
if (!process.env.LAYER_URL) {
  process.env.LAYER_URL = 'https://services5.arcgis.com/jQsv3VqjMgcZI7Fe/ArcGIS/rest/services/survey123_7a3aa01282e2448f81523b345ae910a8_results/FeatureServer/0';
  console.log('[server] ℹ️  Usando LAYER_URL por defecto');
}

if (!process.env.PORTAL_URL) {
  process.env.PORTAL_URL = 'https://www.arcgis.com';
}

console.log('[server] ✅ Configuración ArcGIS cargada');
console.log('[server] 📍 LAYER_URL:', process.env.LAYER_URL);

// Importar inicializador de DB primero y esperar
import { initDatabase, get } from './db/config.js'
import { setupDatabase } from './db/setup.js'

// Función principal async para inicializar todo
const startServer = async () => {
  // Esperar a que la base de datos esté lista
  console.log('[server] ⏳ Inicializando base de datos...')
  await initDatabase()
  
  // Asegurar que las tablas base existan
  console.log('[server] ⏳ Verificando esquema base...')
  await setupDatabase()
  
  console.log('[server] ✅ Base de datos lista')

  // Ahora importar las rutas que dependen de la DB
  const { default: s123Router } = await import('./routes/s123.js')
  const { default: s123CacheRouter } = await import('./routes/s123-cache.js')
  const { default: s123DirectRouter } = await import('./routes/s123-direct.js')
  const { default: geojsonRouter } = await import('./routes/geojson.js')
  const { default: authRouter } = await import('./routes/auth.js')
  const { default: adminRouter } = await import('./routes/admin.js')
  const { default: chatRouter } = await import('./routes/chat.js')
  const { default: configurationRouter } = await import('./routes/configuration.js')
  const { default: fileSearchRouter } = await import('./routes/fileSearch.js')
  const { default: actasRouter } = await import('./routes/actas.js')
  const { default: aiConfigRouter } = await import('./routes/aiConfig.js')
  const { default: anexosRouter } = await import('./routes/anexos.js')
  const { default: matricesRouter } = await import('./routes/matrices.js')
  const { default: unidadesFiscalizablesRouter } = await import('./routes/unidadesFiscalizables.js')
  const { default: supervisorTeamRouter } = await import('./routes/supervisorTeam.js')
  const { default: requerimientosRouter } = await import('./routes/requerimientos.js')
  const { initSyncTables } = await import('./lib/arcgisSync.js')
  const { initAIConfigTable } = await import('./services/aiConfigService.js')
  const { default: pool } = await import('./db/config.js')

  // Inicializar tablas de sincronización
  try {
    await initSyncTables()
    console.log('[server] ✅ Sistema de caché ArcGIS inicializado')
  } catch (error) {
    console.error('[server] ❌ Error inicializando sistema de caché:', error)
  }

  // Inicializar tabla de configuración AI
  try {
    await initAIConfigTable()
    console.log('[server] ✅ Sistema de configuración AI inicializado')
  } catch (error) {
    console.error('[server] ❌ Error inicializando config AI:', error)
  }

  const app = express()
  const PORT = process.env.PORT || 3000

  // Middleware
  app.use(cors())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Servir archivos estáticos para uploads/jobs
  // Usar ruta centralizada que funciona tanto en dev como en producción
  const uploadsPath = getUploadsPath();
  console.log('[server] 📂 Sirviendo uploads desde:', uploadsPath);
  app.use('/uploads', express.static(uploadsPath))

  // Servir archivos GeoJSON estáticos
  app.use('/geojson', express.static(path.join(__dirname, '../frontend/public/geojson')))

  // Deep Link Redirect para Supabase Auth
  // Cuando Supabase redirige a localhost:3000/#access_token=...
  // Servimos una página que redirige al protocolo de la app
  app.get('/', (req, res) => {
    // Servir página HTML que detecta tokens en el hash y redirige al deep link
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirigiendo a Actas Inteligentes...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #f1f5f9;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.05);
      border-radius: 1rem;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(34, 197, 94, 0.3);
      border-top-color: #22c55e;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    p { margin: 0; opacity: 0.7; }
    .error { color: #f87171; margin-top: 1rem; }
    .manual-link {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #22c55e;
      color: white;
      text-decoration: none;
      border-radius: 0.5rem;
      font-weight: 600;
      display: none;
    }
    .manual-link:hover { background: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Redirigiendo a Actas Inteligentes</h1>
    <p id="status">Procesando autenticación...</p>
    <p id="error" class="error"></p>
    <a id="manual-link" class="manual-link" href="#">Abrir aplicación manualmente</a>
  </div>
  <script>
    (function() {
      const hash = window.location.hash;
      
      if (hash && hash.includes('access_token')) {
        // Construir deep link con el hash
        const deepLink = 'actas-inteligentes://reset-password' + hash;
        
        document.getElementById('status').textContent = 'Abriendo aplicación...';
        
        // Mostrar link manual por si el redirect automático no funciona
        const manualLink = document.getElementById('manual-link');
        manualLink.href = deepLink;
        
        // Intentar abrir el deep link
        window.location.href = deepLink;
        
        // Después de 2 segundos, mostrar opción manual
        setTimeout(function() {
          manualLink.style.display = 'inline-block';
          document.getElementById('status').textContent = 'Si la aplicación no se abrió automáticamente:';
        }, 2000);
        
        // Después de 5 segundos, mostrar instrucciones adicionales
        setTimeout(function() {
          document.getElementById('error').textContent = 
            'Si sigues viendo esta página, asegúrate de tener Actas Inteligentes instalada.';
        }, 5000);
      } else {
        document.getElementById('status').textContent = 'API de Actas Inteligentes';
        document.querySelector('.spinner').style.display = 'none';
      }
    })();
  </script>
</body>
</html>
    `);
  });

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      // Verificar conexión a la base de datos SQLite
      const result = await get('SELECT 1 as test')
      res.json({
        status: 'ok',
        message: 'Actas Inteligentes API is running',
        database: 'SQLite connected',
        dbTest: result.rows[0],
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  // Rutas públicas (no requieren autenticación)
  app.use('/api/auth', authRouter) // 🔐 Autenticación
  app.use('/api/admin', adminRouter) // 👑 Panel de administración

  // Rutas protegidas con autenticación
  app.use('/api/configuration', configurationRouter) // ⚙️ Configuración global de la app
  app.use('/api/s123/direct', s123DirectRouter) // 🆕 Endpoints directos (sin jobs) - URLs permanentes
  app.use('/api/s123', s123CacheRouter) // ⚠️ IMPORTANTE: Cache router PRIMERO
  app.use('/api/s123', s123Router) // Legacy router después
  app.use('/api/geojson', geojsonRouter) // 🗺️ Gestión de capas GeoJSON
  app.use('/api/chat', chatRouter) // 🤖 ChatAI con Gemini
  app.use('/api/file-search', fileSearchRouter) // 📚 File Search RAG para documentos
  app.use('/api/actas', actasRouter) // 📝 Borradores de actas
  app.use('/api/ai-config', aiConfigRouter) // 🤖 Configuración centralizada de IA
  app.use('/api/anexos', anexosRouter) // 📎 Gestión de anexos de actas
  app.use('/api/matrices-muestreo', matricesRouter) // 🧪 Matrices de muestreo ambiental
  app.use('/api/uf', unidadesFiscalizablesRouter) // 🏭 Unidades Fiscalizables
  app.use('/api/supervisor-team', supervisorTeamRouter) // 👥 Equipo Supervisor
  app.use('/api/requerimientos', requerimientosRouter) // 📋 Templates de requerimientos

  // Error handling
  app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({
      error: 'Something went wrong!',
      message: err.message
    })
  })
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
    console.log(`🤖 ChatAI ready: http://localhost:${PORT}/api/chat`)
  })
}

// Iniciar servidor
startServer().catch(error => {
  console.error('[server] ❌ Error fatal al iniciar:', error)
  process.exit(1)
})
