-- Migración 013: Agregar columna para anotaciones de fotos
-- Permite almacenar óvalos/círculos dibujados sobre las fotos
-- Las anotaciones se guardan como JSON: [{cx, cy, rx, ry, strokeColor, strokeWidth, id}]

-- Tabla destino: arcgis_records (registros principales de Survey123)

-- Verificar que la tabla exista
SELECT 1 FROM sqlite_master WHERE type='table' AND name='arcgis_records';

-- Agregar columna photo_annotations si aún no existe
ALTER TABLE arcgis_records ADD COLUMN photo_annotations TEXT;

-- Índice parcial para registros que tengan anotaciones
CREATE INDEX IF NOT EXISTS idx_arcgis_records_annotations 
ON arcgis_records(photo_annotations) 
WHERE photo_annotations IS NOT NULL;
