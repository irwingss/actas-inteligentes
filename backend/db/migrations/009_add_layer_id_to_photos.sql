-- ============================================
-- MIGRACIÓN: Agregar layer_id a arcgis_photos
-- Versión: 009
-- Descripción: Permite distinguir fotos de diferentes capas para evitar colisiones de OID
-- ============================================

-- 1. Agregar columna layer_id (default 1 para compatibilidad con datos existentes)
ALTER TABLE arcgis_photos ADD COLUMN layer_id INTEGER DEFAULT 1;

-- 2. Eliminar índice único anterior (que causaba colisiones entre capas)
DROP INDEX IF EXISTS idx_arcgis_photos_unique;

-- 3. Crear nuevo índice único incluyendo layer_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_arcgis_photos_unique_layer 
  ON arcgis_photos(layer_id, objectid, attachment_id, is_deleted);

-- 4. Crear índice para búsquedas por layer
CREATE INDEX IF NOT EXISTS idx_arcgis_photos_layer_id ON arcgis_photos(layer_id);
