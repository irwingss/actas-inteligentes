-- ===========================================
-- Tabla: matrices_muestreo
-- Descripción: Tipos de matrices para muestreo ambiental
-- Sincronizable entre usuarios vía Supabase
-- ===========================================

-- Crear tabla de matrices de muestreo
create table if not exists public.matrices_muestreo (
  id text primary key, -- ID único basado en el nombre (ej: 'calidad_suelo')
  nombre text not null, -- Nombre display (ej: 'Calidad de Suelo')
  orden integer default 999, -- Orden de visualización
  is_active boolean default true, -- Si está activa
  created_by uuid references auth.users(id), -- Quién la creó
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices
create index if not exists idx_matrices_orden on matrices_muestreo(orden);
create index if not exists idx_matrices_active on matrices_muestreo(is_active);

-- Trigger para actualizar updated_at
create or replace function update_matrices_muestreo_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_matrices_muestreo_updated_at on matrices_muestreo;
create trigger trigger_matrices_muestreo_updated_at
  before update on matrices_muestreo
  for each row
  execute function update_matrices_muestreo_updated_at();

-- RLS: Habilitar Row Level Security
alter table matrices_muestreo enable row level security;

-- Política de lectura: todos los usuarios autenticados pueden ver matrices activas
create policy "Usuarios autenticados pueden ver matrices activas"
  on matrices_muestreo
  for select
  to authenticated
  using (is_active = true);

-- Política de lectura para superadmins: pueden ver todas (activas e inactivas)
create policy "Superadmins pueden ver todas las matrices"
  on matrices_muestreo
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'superadmin'
    )
  );

-- Política de inserción: solo superadmins
create policy "Solo superadmins pueden crear matrices"
  on matrices_muestreo
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'superadmin'
    )
  );

-- Política de actualización: solo superadmins
create policy "Solo superadmins pueden actualizar matrices"
  on matrices_muestreo
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'superadmin'
    )
  );

-- Política de eliminación: solo superadmins
create policy "Solo superadmins pueden eliminar matrices"
  on matrices_muestreo
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'superadmin'
    )
  );

-- Insertar matrices por defecto
insert into matrices_muestreo (id, nombre, orden, is_active) values
  ('efluentes', 'Efluentes', 1, true),
  ('calidad_suelo', 'Calidad de Suelo', 2, true),
  ('ruido_ambiental', 'Ruido Ambiental', 3, true),
  ('calidad_agua', 'Calidad de Agua', 4, true),
  ('calidad_aire', 'Calidad de Aire', 5, true)
on conflict (id) do nothing;

-- Comentarios
comment on table matrices_muestreo is 'Tipos de matrices para muestreo ambiental (Efluentes, Calidad de Suelo, etc.)';
comment on column matrices_muestreo.id is 'ID único basado en el nombre normalizado';
comment on column matrices_muestreo.nombre is 'Nombre visible para el usuario';
comment on column matrices_muestreo.orden is 'Orden de visualización en la lista';
comment on column matrices_muestreo.is_active is 'Si la matriz está disponible para uso';
