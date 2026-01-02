-- Migración: Agregar campos adicionales a actas_hechos
-- Estos campos son usados por el formulario del frontend

-- Agregar columnas si no existen
ALTER TABLE actas_hechos ADD COLUMN nivel_riesgo TEXT;
ALTER TABLE actas_hechos ADD COLUMN justificacion_riesgo TEXT;
ALTER TABLE actas_hechos ADD COLUMN impacto_potencial TEXT;
ALTER TABLE actas_hechos ADD COLUMN medidas_mitigacion TEXT;
ALTER TABLE actas_hechos ADD COLUMN fotos_seleccionadas TEXT;
