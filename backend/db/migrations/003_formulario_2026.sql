-- ============================================
-- MIGRACIÓN: Preparación para Formulario 2026
-- Versión: 003
-- Descripción: Actualiza estructura de arcgis_records para soportar el nuevo formulario Survey123 2026
-- ============================================

-- ============================================
-- PASO 1: Agregar nuevos campos del formulario 2026
-- ============================================

-- Campos de datos generales (nuevos)
ALTER TABLE arcgis_records ADD COLUMN fecha_hora TEXT; -- Reemplaza fecha (incluye hora)
ALTER TABLE arcgis_records ADD COLUMN ca TEXT; -- Reemplaza codigo_accion (simplificado)
ALTER TABLE arcgis_records ADD COLUMN modalidad TEXT; -- Reemplaza tipo_de_reporte
ALTER TABLE arcgis_records ADD COLUMN actividad TEXT; -- Nuevo campo
ALTER TABLE arcgis_records ADD COLUMN supervisor TEXT; -- Reemplaza nombre_supervisor

-- Campos condicionales (nuevos)
ALTER TABLE arcgis_records ADD COLUMN instalacion_referencia TEXT;
ALTER TABLE arcgis_records ADD COLUMN nom_pto_ppc TEXT; -- Nombre punto PAF/PD/CP
ALTER TABLE arcgis_records ADD COLUMN num_pto_muestreo INTEGER; -- Número punto muestreo
ALTER TABLE arcgis_records ADD COLUMN nom_pto_muestreo TEXT; -- Nombre punto muestreo

-- Nota: datum ya existe en la tabla (línea 24 de 001_arcgis_sync.sql)
-- Nota: norte, este, zona, altitud ya existen

-- ============================================
-- PASO 2: Crear índices para nuevos campos
-- ============================================

CREATE INDEX IF NOT EXISTS idx_arcgis_fecha_hora ON arcgis_records(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_arcgis_ca ON arcgis_records(ca);
CREATE INDEX IF NOT EXISTS idx_arcgis_modalidad ON arcgis_records(modalidad);
CREATE INDEX IF NOT EXISTS idx_arcgis_actividad ON arcgis_records(actividad);
CREATE INDEX IF NOT EXISTS idx_arcgis_supervisor_2026 ON arcgis_records(supervisor);

-- Índice compuesto para búsquedas por CA (nuevo formato)
CREATE INDEX IF NOT EXISTS idx_arcgis_ca_composite 
  ON arcgis_records(ca, otro_ca, is_deleted);

-- ============================================
-- PASO 3: Crear tabla para hechos detectados y fotos (OPCIÓN A - Tablas Relacionadas)
-- ============================================
-- Esta tabla se usará si Survey123 implementa tablas relacionadas (repeats)

CREATE TABLE IF NOT EXISTS arcgis_hechos_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con registro principal
  record_id INTEGER NOT NULL,
  record_globalid TEXT NOT NULL, -- parentglobalid en Survey123
  
  -- Información de ArcGIS
  objectid INTEGER NOT NULL,
  
  -- Datos del hecho detectado
  hecho_detec TEXT NOT NULL, -- Tipo de hecho detectado
  orden INTEGER DEFAULT 1, -- Orden dentro del hecho
  
  -- Información de la fotografía
  foto_attachment_id INTEGER, -- ID del attachment en ArcGIS
  foto_filename TEXT,
  foto_local_path TEXT, -- Ruta local de la foto
  descrip TEXT, -- Descripción de la foto
  
  -- Metadatos
  creation_date TEXT,
  creator TEXT,
  edit_date TEXT,
  editor TEXT,
  
  -- Campos de sincronización local
  synced_at TEXT DEFAULT (datetime('now')),
  local_created_at TEXT DEFAULT (datetime('now')),
  local_updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  
  -- Checksum
  checksum TEXT,
  
  -- Foreign key
  FOREIGN KEY (record_id) REFERENCES arcgis_records(id) ON DELETE CASCADE
);

-- Índices para hechos_fotos
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_record_id ON arcgis_hechos_fotos(record_id);
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_globalid ON arcgis_hechos_fotos(record_globalid);
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_objectid ON arcgis_hechos_fotos(objectid);
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_hecho ON arcgis_hechos_fotos(hecho_detec);
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_is_deleted ON arcgis_hechos_fotos(is_deleted);

-- Índice compuesto para ordenamiento
CREATE INDEX IF NOT EXISTS idx_hechos_fotos_orden 
  ON arcgis_hechos_fotos(record_id, hecho_detec, orden);

-- Trigger para actualizar local_updated_at
CREATE TRIGGER IF NOT EXISTS update_hechos_fotos_timestamp 
AFTER UPDATE ON arcgis_hechos_fotos
WHEN NEW.is_deleted = 0
BEGIN
  UPDATE arcgis_hechos_fotos 
  SET local_updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- ============================================
-- PASO 4: Agregar campo JSON para estructura multimedia (OPCIÓN B - Fallback)
-- ============================================
-- Este campo se usará si Survey123 NO implementa tablas relacionadas

ALTER TABLE arcgis_records ADD COLUMN hechos_json TEXT; -- JSON con array de hechos y fotos

-- ============================================
-- PASO 5: Campos geoespaciales (nuevos)
-- ============================================

ALTER TABLE arcgis_records ADD COLUMN geo_pregunta TEXT; -- Checkbox: Área/Longitud/Punto
ALTER TABLE arcgis_records ADD COLUMN geo_area_json TEXT; -- JSON con áreas estimadas
ALTER TABLE arcgis_records ADD COLUMN geo_longitud_json TEXT; -- JSON con longitudes estimadas
ALTER TABLE arcgis_records ADD COLUMN geo_punto_json TEXT; -- JSON con puntos capturados

-- ============================================
-- PASO 6: Vista para registros con formato 2026
-- ============================================

CREATE VIEW IF NOT EXISTS arcgis_records_2026 AS
SELECT 
  id,
  objectid,
  globalid,
  
  -- Campos nuevos (prioridad)
  COALESCE(ca, codigo_accion) as codigo_accion_final,
  COALESCE(supervisor, nombre_supervisor) as supervisor_final,
  COALESCE(fecha_hora, fecha) as fecha_final,
  COALESCE(modalidad, tipo_de_reporte) as modalidad_final,
  
  -- Localización
  norte,
  este,
  zona,
  datum,
  altitud,
  
  -- Componente
  tipo_componente,
  componente,
  
  -- Campos condicionales
  otro_ca,
  actividad,
  instalacion_referencia,
  nom_pto_ppc,
  num_pto_muestreo,
  nom_pto_muestreo,
  
  -- Multimedia
  hechos_json,
  
  -- Geoespacial
  geo_pregunta,
  geo_area_json,
  geo_longitud_json,
  geo_punto_json,
  
  -- Metadatos
  creation_date,
  creator,
  edit_date,
  editor,
  
  -- Sincronización
  synced_at,
  local_created_at,
  local_updated_at,
  is_deleted
  
FROM arcgis_records
WHERE is_deleted = 0;

-- ============================================
-- PASO 7: Vista para estadísticas de hechos detectados
-- ============================================

CREATE VIEW IF NOT EXISTS arcgis_hechos_stats AS
SELECT 
  hecho_detec,
  COUNT(*) as total_fotos,
  COUNT(DISTINCT record_globalid) as total_registros,
  MIN(creation_date) as primera_deteccion,
  MAX(edit_date) as ultima_actualizacion
FROM arcgis_hechos_fotos
WHERE is_deleted = 0
GROUP BY hecho_detec
ORDER BY total_fotos DESC;

-- ============================================
-- PASO 8: Función auxiliar para migrar datos antiguos a nuevo formato
-- ============================================
-- Esta vista ayuda a identificar registros que necesitan migración

CREATE VIEW IF NOT EXISTS arcgis_records_migration_status AS
SELECT 
  id,
  globalid,
  CASE 
    WHEN ca IS NOT NULL THEN 'migrado'
    WHEN codigo_accion IS NOT NULL THEN 'pendiente'
    ELSE 'sin_datos'
  END as migration_status,
  codigo_accion as old_codigo,
  ca as new_ca,
  nombre_supervisor as old_supervisor,
  supervisor as new_supervisor,
  fecha as old_fecha,
  fecha_hora as new_fecha_hora,
  tipo_de_reporte as old_tipo,
  modalidad as new_modalidad
FROM arcgis_records
WHERE is_deleted = 0;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================
-- 
-- 1. CAMPOS DEPRECADOS (mantener por compatibilidad):
--    - codigo_accion → usar 'ca'
--    - nombre_supervisor → usar 'supervisor'
--    - fecha → usar 'fecha_hora'
--    - tipo_de_reporte → usar 'modalidad'
--    - subcomponente → eliminado en 2026
--
-- 2. ESTRUCTURA MULTIMEDIA:
--    - OPCIÓN A (preferida): Usar tabla arcgis_hechos_fotos
--    - OPCIÓN B (fallback): Usar campo hechos_json
--    - OPCIÓN C (legacy): Usar descripcion_f01-f10 (ya existe)
--
-- 3. MIGRACIÓN DE DATOS:
--    - Los datos antiguos se mantienen en campos legacy
--    - La vista arcgis_records_2026 usa COALESCE para compatibilidad
--    - Cuando llegue 2026, ejecutar script de migración de datos
--
-- 4. PRÓXIMOS PASOS:
--    - Esperar confirmación de estructura multimedia de Survey123
--    - Actualizar backend para leer/escribir nuevos campos
--    - Crear script de migración de datos históricos
--    - Actualizar frontend para mostrar nuevos campos
--
-- ============================================
