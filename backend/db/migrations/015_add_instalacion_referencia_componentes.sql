-- Migración: Agregar instalacion_referencia y tipo_componente a actas_componentes
-- Fecha: 2024-12-08
-- Razón: Permitir agrupamiento por instalación de referencia en la tabla de componentes

-- Agregar columna instalacion_referencia
ALTER TABLE actas_componentes ADD COLUMN instalacion_referencia TEXT;

-- Agregar columna tipo_componente
ALTER TABLE actas_componentes ADD COLUMN tipo_componente TEXT;

-- Crear índice para búsquedas por instalación
CREATE INDEX IF NOT EXISTS idx_actas_componentes_instalacion ON actas_componentes(instalacion_referencia);
