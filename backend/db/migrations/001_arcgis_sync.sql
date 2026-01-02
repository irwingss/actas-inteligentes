-- ============================================
-- MIGRACIÓN: Sistema de Caché ArcGIS con Sincronización
-- Versión: 001
-- Descripción: Tablas optimizadas para almacenar registros y fotos de ArcGIS
-- ============================================

-- Tabla principal para registros de ArcGIS
CREATE TABLE IF NOT EXISTS arcgis_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificadores únicos de ArcGIS
  objectid INTEGER NOT NULL,
  globalid TEXT NOT NULL UNIQUE,
  
  -- Códigos de identificación
  codigo_accion TEXT,
  otro_ca TEXT,
  
  -- Información geográfica y temporal
  fecha TEXT,
  norte REAL,
  este REAL,
  zona TEXT,
  datum TEXT,
  altitud REAL,
  
  -- Información del componente
  componente TEXT,
  tipo_componente TEXT,
  detalle_componente TEXT,
  numero_punto TEXT,
  
  -- Clasificación
  tipo_de_reporte TEXT,
  subcomponente TEXT,
  
  -- Personal
  nombre_supervisor TEXT,
  
  -- Observaciones
  descripcion TEXT,
  hallazgos TEXT,
  profundidad REAL,
  
  -- Descripciones de fotografías
  descripcion_f01 TEXT,
  descripcion_f02 TEXT,
  descripcion_f03 TEXT,
  descripcion_f04 TEXT,
  descripcion_f05 TEXT,
  descripcion_f06 TEXT,
  descripcion_f07 TEXT,
  descripcion_f08 TEXT,
  descripcion_f09 TEXT,
  descripcion_f10 TEXT,
  
  -- Metadatos de ArcGIS
  creation_date TEXT,
  creator TEXT,
  edit_date TEXT,
  editor TEXT,
  
  -- JSON completo para campos adicionales no mapeados
  raw_json TEXT NOT NULL,
  
  -- Campos de sincronización local
  synced_at TEXT DEFAULT (datetime('now')),
  local_created_at TEXT DEFAULT (datetime('now')),
  local_updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0, -- Soft delete para detectar eliminaciones
  
  -- Checksum para detección rápida de cambios
  checksum TEXT
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_arcgis_globalid ON arcgis_records(globalid);
CREATE INDEX IF NOT EXISTS idx_arcgis_objectid ON arcgis_records(objectid);
CREATE INDEX IF NOT EXISTS idx_arcgis_codigo_accion ON arcgis_records(codigo_accion);
CREATE INDEX IF NOT EXISTS idx_arcgis_otro_ca ON arcgis_records(otro_ca);
CREATE INDEX IF NOT EXISTS idx_arcgis_supervisor ON arcgis_records(nombre_supervisor);
CREATE INDEX IF NOT EXISTS idx_arcgis_tipo_reporte ON arcgis_records(tipo_de_reporte);
CREATE INDEX IF NOT EXISTS idx_arcgis_subcomponente ON arcgis_records(subcomponente);
CREATE INDEX IF NOT EXISTS idx_arcgis_fecha ON arcgis_records(fecha);
CREATE INDEX IF NOT EXISTS idx_arcgis_edit_date ON arcgis_records(edit_date);
CREATE INDEX IF NOT EXISTS idx_arcgis_is_deleted ON arcgis_records(is_deleted);
CREATE INDEX IF NOT EXISTS idx_arcgis_synced_at ON arcgis_records(synced_at);

-- Índice compuesto para búsquedas por código
CREATE INDEX IF NOT EXISTS idx_arcgis_codigo_composite 
  ON arcgis_records(codigo_accion, otro_ca, is_deleted);

-- Trigger para actualizar local_updated_at
CREATE TRIGGER IF NOT EXISTS update_arcgis_records_timestamp 
AFTER UPDATE ON arcgis_records
WHEN NEW.is_deleted = 0
BEGIN
  UPDATE arcgis_records 
  SET local_updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- ============================================
-- Tabla para fotografías de ArcGIS
-- ============================================
CREATE TABLE IF NOT EXISTS arcgis_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con registro
  record_id INTEGER NOT NULL,
  record_globalid TEXT NOT NULL,
  
  -- Información de ArcGIS
  attachment_id INTEGER NOT NULL,
  objectid INTEGER NOT NULL,
  
  -- Información del archivo
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER,
  
  -- Almacenamiento local
  local_path TEXT NOT NULL UNIQUE, -- Ruta relativa desde uploads/
  local_size INTEGER,
  
  -- Metadata opcional
  keywords TEXT,
  exif_data TEXT, -- JSON con datos EXIF si existen
  
  -- Campos de sincronización
  synced_at TEXT DEFAULT (datetime('now')),
  local_created_at TEXT DEFAULT (datetime('now')),
  local_updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  
  -- Checksum para verificar integridad
  checksum TEXT,
  
  -- Foreign key
  FOREIGN KEY (record_id) REFERENCES arcgis_records(id) ON DELETE CASCADE
);

-- Índices para fotografías
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_record_id ON arcgis_photos(record_id);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_globalid ON arcgis_photos(record_globalid);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_attachment_id ON arcgis_photos(attachment_id);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_objectid ON arcgis_photos(objectid);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_filename ON arcgis_photos(filename);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_is_deleted ON arcgis_photos(is_deleted);
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_synced_at ON arcgis_photos(synced_at);

-- Índice compuesto para evitar duplicados
-- COMENTADO: Este índice causa conflictos con datos de múltiples capas (ver migración 009)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_arcgis_photos_unique 
--   ON arcgis_photos(objectid, attachment_id, is_deleted);

-- Trigger para actualizar local_updated_at
CREATE TRIGGER IF NOT EXISTS update_arcgis_photos_timestamp 
AFTER UPDATE ON arcgis_photos
WHEN NEW.is_deleted = 0
BEGIN
  UPDATE arcgis_photos 
  SET local_updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de códigos de acción (para búsquedas rápidas)
-- ============================================
CREATE TABLE IF NOT EXISTS arcgis_codigos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL, -- 'codigo_accion' o 'otro_ca'
  record_count INTEGER DEFAULT 0,
  last_sync_at TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_arcgis_codigos_codigo ON arcgis_codigos(codigo);
CREATE INDEX IF NOT EXISTS idx_arcgis_codigos_tipo ON arcgis_codigos(tipo);
CREATE INDEX IF NOT EXISTS idx_arcgis_codigos_last_sync ON arcgis_codigos(last_sync_at);

-- ============================================
-- Tabla de log de sincronización
-- ============================================
CREATE TABLE IF NOT EXISTS arcgis_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'full', 'incremental', 'force'
  
  -- Estadísticas
  records_before INTEGER DEFAULT 0,
  records_after INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  
  photos_before INTEGER DEFAULT 0,
  photos_after INTEGER DEFAULT 0,
  photos_inserted INTEGER DEFAULT 0,
  photos_deleted INTEGER DEFAULT 0,
  
  -- Tiempos
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'error'
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_arcgis_sync_log_codigo ON arcgis_sync_log(codigo);
CREATE INDEX IF NOT EXISTS idx_arcgis_sync_log_started ON arcgis_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_arcgis_sync_log_status ON arcgis_sync_log(status);

-- ============================================
-- Vista para registros activos (no eliminados)
-- ============================================
CREATE VIEW IF NOT EXISTS arcgis_records_active AS
SELECT * FROM arcgis_records WHERE is_deleted = 0;

-- ============================================
-- Vista para fotografías activas
-- ============================================
CREATE VIEW IF NOT EXISTS arcgis_photos_active AS
SELECT * FROM arcgis_photos WHERE is_deleted = 0;

-- ============================================
-- Vista con estadísticas por código
-- ============================================
CREATE VIEW IF NOT EXISTS arcgis_stats_by_codigo AS
SELECT 
  COALESCE(codigo_accion, otro_ca) as codigo,
  CASE 
    WHEN codigo_accion IS NOT NULL THEN 'codigo_accion'
    ELSE 'otro_ca'
  END as tipo,
  COUNT(*) as total_registros,
  COUNT(CASE WHEN is_deleted = 0 THEN 1 END) as registros_activos,
  MAX(edit_date) as ultima_edicion,
  MAX(synced_at) as ultima_sincronizacion
FROM arcgis_records
WHERE codigo_accion IS NOT NULL OR otro_ca IS NOT NULL
GROUP BY codigo, tipo;
