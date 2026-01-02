-- ============================================
-- MIGRACIÓN: Agregar campos de tablas relacionadas
-- Versión: 002
-- Descripción: Agrega columnas para descripciones detalladas (Tabla 1) y hechos detectados (Tabla 2)
-- ============================================

ALTER TABLE arcgis_records ADD COLUMN descripcion_detallada TEXT;
ALTER TABLE arcgis_records ADD COLUMN hecho_detectado TEXT;
ALTER TABLE arcgis_records ADD COLUMN descripcion_hecho TEXT;
