-- ============================================
-- MIGRACIÓN: Sistema de autenticación Supabase
-- Fecha: 2025-01-16
-- Descripción: Elimina usuarios locales y añade user_id de Supabase
-- ============================================

-- 1. ELIMINAR tabla de usuarios locales (ya no se usa)
DROP TABLE IF EXISTS users;

-- 2. CREAR tabla de caché de datos por usuario
-- Esta tabla almacena información de sincronización de CAs por usuario
CREATE TABLE IF NOT EXISTS user_ca_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, -- UUID de Supabase
  ca_code TEXT NOT NULL, -- Código de acción
  record_count INTEGER DEFAULT 0,
  photo_count INTEGER DEFAULT 0,
  last_sync_at TEXT DEFAULT (datetime('now')),
  data_size_bytes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, ca_code)
);

CREATE INDEX IF NOT EXISTS idx_user_ca_cache_user ON user_ca_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ca_cache_ca ON user_ca_cache(ca_code);
CREATE INDEX IF NOT EXISTS idx_user_ca_cache_sync ON user_ca_cache(last_sync_at);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_user_ca_cache_timestamp 
AFTER UPDATE ON user_ca_cache
BEGIN
  UPDATE user_ca_cache SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 3. CREAR tabla de jobs de Survey123 (reemplaza el Map en memoria)
CREATE TABLE IF NOT EXISTS s123_jobs (
  id TEXT PRIMARY KEY, -- UUID del job
  user_id TEXT NOT NULL, -- UUID de Supabase
  ca_code TEXT, -- Código de acción asociado
  where_clause TEXT, -- Cláusula WHERE usada
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|error
  total INTEGER DEFAULT 0,
  fetched INTEGER DEFAULT 0,
  with_attachments INTEGER DEFAULT 0,
  attachments_downloaded INTEGER DEFAULT 0,
  job_dir TEXT NOT NULL, -- Ruta al directorio del job
  fotos_dir TEXT NOT NULL, -- Ruta al directorio de fotos
  original_csv_path TEXT,
  csv_path TEXT,
  preview_path TEXT,
  errors TEXT, -- JSON array de errores
  from_cache INTEGER DEFAULT 0, -- 0 o 1
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+24 hours'))
);

CREATE INDEX IF NOT EXISTS idx_s123_jobs_user ON s123_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_s123_jobs_ca ON s123_jobs(ca_code);
CREATE INDEX IF NOT EXISTS idx_s123_jobs_status ON s123_jobs(status);
CREATE INDEX IF NOT EXISTS idx_s123_jobs_expires ON s123_jobs(expires_at);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_s123_jobs_timestamp 
AFTER UPDATE ON s123_jobs
BEGIN
  UPDATE s123_jobs SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 4. ACTUALIZAR tablas existentes para añadir user_id

-- tabular_data: añadir user_id
ALTER TABLE tabular_data ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tabular_user_id ON tabular_data(user_id);

-- photos: añadir user_id
ALTER TABLE photos ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);

-- sync_log: añadir user_id
ALTER TABLE sync_log ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);

-- 5. CREAR tabla de sesiones de usuario (para tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email TEXT,
  full_name TEXT,
  role TEXT, -- user|admin|superadmin
  last_activity TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_activity ON user_sessions(last_activity);

-- 6. LIMPIAR datos huérfanos (sin user_id)
-- Nota: En producción, considera hacer backup antes de ejecutar esto
-- DELETE FROM tabular_data WHERE user_id IS NULL;
-- DELETE FROM photos WHERE user_id IS NULL;
-- DELETE FROM sync_log WHERE user_id IS NULL;

-- ============================================
-- NOTAS DE MIGRACIÓN:
-- ============================================
-- 1. Esta migración elimina la tabla 'users' local
-- 2. Todos los usuarios ahora se autentican vía Supabase
-- 3. Los datos se asocian con user_id (UUID de Supabase)
-- 4. Cada usuario solo puede ver/acceder a sus propios datos
-- 5. Los jobs tienen TTL de 24 horas y se limpian automáticamente
-- ============================================
