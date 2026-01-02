-- ============================================
-- MIGRACIÓN: Agregar nuevos campos detectados
-- Versión: 004
-- Descripción: Agrega columnas para modalidad, actividad, instalación referencia, etc.
-- ============================================

ALTER TABLE arcgis_records ADD COLUMN modalidad TEXT;
ALTER TABLE arcgis_records ADD COLUMN actividad TEXT;
ALTER TABLE arcgis_records ADD COLUMN instalacion_referencia TEXT;
ALTER TABLE arcgis_records ADD COLUMN nom_pto_ppc TEXT;
ALTER TABLE arcgis_records ADD COLUMN num_pto_muestreo TEXT;
