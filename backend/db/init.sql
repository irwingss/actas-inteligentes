-- ============================================
-- ACTAS INTELIGENTES - SQLite Schema
-- Diseñado para sincronización incremental
-- ============================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT,
  is_active INTEGER DEFAULT 1,
  -- Campos para sincronización futura
  sync_status TEXT DEFAULT 'local', -- 'local', 'synced', 'pending'
  last_sync_at TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_correo ON users(correo);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status);

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de datos tabulados (para sincronización futura)
-- ============================================
CREATE TABLE IF NOT EXISTS tabular_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id TEXT UNIQUE, -- ID del servidor remoto
  data_type TEXT NOT NULL, -- 'ca', 'acta', 'reporte', etc.
  data_json TEXT NOT NULL, -- JSON con los datos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  -- Campos de sincronización
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'error'
  last_sync_at TEXT,
  remote_updated_at TEXT, -- Timestamp del servidor para comparación
  checksum TEXT -- Hash para detectar cambios
);

CREATE INDEX IF NOT EXISTS idx_tabular_remote_id ON tabular_data(remote_id);
CREATE INDEX IF NOT EXISTS idx_tabular_data_type ON tabular_data(data_type);
CREATE INDEX IF NOT EXISTS idx_tabular_sync_status ON tabular_data(sync_status);
CREATE INDEX IF NOT EXISTS idx_tabular_remote_updated ON tabular_data(remote_updated_at);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_tabular_timestamp 
AFTER UPDATE ON tabular_data
BEGIN
  UPDATE tabular_data SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de fotografías (para sincronización futura)
-- ============================================
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id TEXT UNIQUE, -- ID del servidor remoto
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Ruta local del archivo
  file_size INTEGER, -- Tamaño en bytes
  mime_type TEXT,
  related_data_id INTEGER, -- FK a tabular_data
  metadata_json TEXT, -- JSON con metadatos (coordenadas, fecha, etc.)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  -- Campos de sincronización
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'downloading', 'synced', 'error'
  last_sync_at TEXT,
  remote_updated_at TEXT,
  checksum TEXT, -- Hash del archivo para verificar integridad
  download_url TEXT, -- URL temporal de descarga
  FOREIGN KEY (related_data_id) REFERENCES tabular_data(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_remote_id ON photos(remote_id);
CREATE INDEX IF NOT EXISTS idx_photos_related_data ON photos(related_data_id);
CREATE INDEX IF NOT EXISTS idx_photos_sync_status ON photos(sync_status);
CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename);
CREATE INDEX IF NOT EXISTS idx_photos_remote_updated ON photos(remote_updated_at);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_photos_timestamp 
AFTER UPDATE ON photos
BEGIN
  UPDATE photos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de sincronización (log de operaciones)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL, -- 'fetch', 'upload', 'delete'
  entity_type TEXT NOT NULL, -- 'user', 'tabular_data', 'photo'
  entity_id INTEGER,
  status TEXT NOT NULL, -- 'success', 'error', 'pending'
  error_message TEXT,
  records_affected INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at DESC);

-- ============================================
-- Tabla de configuración de sincronización
-- ============================================
CREATE TABLE IF NOT EXISTS sync_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Valores iniciales
INSERT OR IGNORE INTO sync_config (key, value) VALUES 
  ('last_full_sync', ''),
  ('api_endpoint', ''),
  ('sync_interval_minutes', '30'),
  ('auto_sync_enabled', '0'),
  ('last_sync_status', 'never');

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_sync_config_timestamp 
AFTER UPDATE ON sync_config
BEGIN
  UPDATE sync_config SET updated_at = datetime('now') WHERE key = NEW.key;
END;
