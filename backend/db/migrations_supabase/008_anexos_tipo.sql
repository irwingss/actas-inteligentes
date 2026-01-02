-- =============================================
-- Migración 008: Añadir campo 'tipo' a anexos
-- =============================================
-- Descripción: Añade el campo 'tipo' (físico/virtual) a la tabla acta_anexos_templates
-- según el formato de tabla de anexos del acta.

-- Añadir columna 'tipo' con valor por defecto 'físico'
alter table acta_anexos_templates 
add column if not exists tipo text default 'físico' not null;

-- Añadir constraint para valores permitidos
alter table acta_anexos_templates
add constraint acta_anexos_templates_tipo_check 
check (tipo in ('físico', 'virtual'));

-- Comentario descriptivo
comment on column acta_anexos_templates.tipo is 'Tipo de anexo: físico o virtual';
