-- =====================================================
-- Migración: 010_acta_header_config.sql
-- Descripción: Añade campos de configuración para el 
--              encabezado del acta (decenio y año oficial)
-- Autor: Sistema
-- Fecha: 2024
-- =====================================================

-- Añadir campos para el encabezado del acta
ALTER TABLE app_configuration
ADD COLUMN IF NOT EXISTS acta_decenio text DEFAULT '«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»';

ALTER TABLE app_configuration
ADD COLUMN IF NOT EXISTS acta_anio text DEFAULT '«Año de la Recuperación y Consolidación de la Economía Peruana»';

-- Comentarios descriptivos
COMMENT ON COLUMN app_configuration.acta_decenio IS 'Texto del decenio oficial para el encabezado del acta';
COMMENT ON COLUMN app_configuration.acta_anio IS 'Texto del año oficial para el encabezado del acta';

-- =====================================================
-- Verificar la estructura actualizada
-- =====================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'app_configuration' 
-- AND column_name IN ('acta_decenio', 'acta_anio');
