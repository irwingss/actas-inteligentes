-- ============================================
-- Migración Supabase: Anexos personalizados por CA
-- Permite a los usuarios agregar anexos manuales específicos
-- para cada acta (CA), sin modificar los templates globales
-- ============================================

-- Tabla para almacenar anexos personalizados por CA
create table if not exists acta_anexos_custom (
  id bigint generated always as identity primary key,
  -- Código de acción al que pertenece este anexo
  codigo_accion text not null,
  -- Texto del anexo personalizado
  texto text not null,
  -- Orden para mostrar (menor = primero)
  orden int default 0,
  -- Usuario que lo creó
  created_by uuid not null references auth.users(id) on delete cascade,
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Índices para búsqueda rápida
create index if not exists idx_acta_anexos_custom_ca on acta_anexos_custom(codigo_accion);
create index if not exists idx_acta_anexos_custom_created_by on acta_anexos_custom(created_by);

-- Trigger para actualizar updated_at
create or replace function update_acta_anexos_custom_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_acta_anexos_custom_updated_at on acta_anexos_custom;
create trigger trigger_acta_anexos_custom_updated_at
  before update on acta_anexos_custom
  for each row
  execute function update_acta_anexos_custom_updated_at();

-- RLS: Habilitar Row Level Security
alter table acta_anexos_custom enable row level security;

-- Política de lectura: usuarios autenticados pueden ver anexos de CAs que tienen acceso
-- (para simplificar, todos los autenticados pueden leer - el backend filtra por permisos)
create policy "Usuarios autenticados pueden ver anexos personalizados"
  on acta_anexos_custom for select
  to authenticated
  using (true);

-- Política de inserción: usuarios autenticados pueden crear anexos
create policy "Usuarios autenticados pueden crear anexos personalizados"
  on acta_anexos_custom for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Política de actualización: solo el creador puede editar
create policy "Usuario puede editar sus propios anexos personalizados"
  on acta_anexos_custom for update
  to authenticated
  using (auth.uid() = created_by);

-- Política de eliminación: el creador o superadmins pueden eliminar
create policy "Usuario puede eliminar sus propios anexos personalizados"
  on acta_anexos_custom for delete
  to authenticated
  using (
    auth.uid() = created_by
    or exists (
      select 1 from profiles 
      where profiles.id = auth.uid() 
      and profiles.role = 'superadmin'
    )
  );

-- Comentarios
comment on table acta_anexos_custom is 'Anexos personalizados creados por usuarios para CAs específicos';
comment on column acta_anexos_custom.codigo_accion is 'Código de acción (CA) al que pertenece el anexo';
comment on column acta_anexos_custom.texto is 'Texto del anexo personalizado';
comment on column acta_anexos_custom.orden is 'Orden de visualización (menor = primero)';
comment on column acta_anexos_custom.created_by is 'UUID del usuario que creó el anexo';
