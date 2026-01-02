-- Migración 009: Agregar columnas para descripciones editadas por el usuario
-- Las descripciones editadas se preservan aunque se resincronice la data

-- Agregar columna para descripción 1 editada
ALTER TABLE arcgis_records ADD COLUMN descrip_1_editada TEXT;

-- Agregar columna para descripción 2 editada  
ALTER TABLE arcgis_records ADD COLUMN descrip_2_editada TEXT;

-- Agregar columna para hecho detectado editado
ALTER TABLE arcgis_records ADD COLUMN hecho_detec_1_editado TEXT;

-- Timestamp de última edición del usuario
ALTER TABLE arcgis_records ADD COLUMN user_edited_at TEXT;
