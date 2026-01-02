-- ============================================
-- MIGRACIÓN: Agregar campo nom_pto_muestreo
-- Versión: 005
-- Descripción: Agrega columna para nom_pto_muestreo
-- ============================================

ALTER TABLE arcgis_records ADD COLUMN nom_pto_muestreo TEXT;
