-- ============================================
-- Migración Supabase: Tabla para metadata de documentos RAG
-- Los documentos RAG de Gemini son compartidos entre todas las instalaciones
-- Esta tabla almacena los nombres originales de los archivos
-- ============================================

-- Tabla para almacenar metadata de documentos RAG
create table if not exists rag_documents (
  id bigint generated always as identity primary key,
  -- Identificador del documento en Gemini (ej: fileSearchStores/abc123/documents/xyz789)
  document_name text not null unique,
  -- Nombre del store (ej: fileSearchStores/abc123)
  store_name text not null,
  -- Nombre original del archivo subido
  original_filename text not null,
  -- Nombre para mostrar (puede ser personalizado)
  display_name text not null,
  -- Tipo MIME del archivo
  mime_type text,
  -- Tamaño en bytes
  size_bytes bigint,
  -- Usuario que subió el archivo (UUID de auth.users)
  uploaded_by uuid references auth.users(id) on delete set null,
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Índices para búsqueda rápida
create index if not exists idx_rag_documents_store on rag_documents(store_name);
create index if not exists idx_rag_documents_uploaded_by on rag_documents(uploaded_by);

-- Trigger para actualizar updated_at
create or replace function update_rag_documents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_rag_documents_updated_at on rag_documents;
create trigger trigger_rag_documents_updated_at
  before update on rag_documents
  for each row
  execute function update_rag_documents_updated_at();

-- RLS: Todos los usuarios autenticados pueden leer
-- Solo el que subió o admins pueden eliminar
alter table rag_documents enable row level security;

-- Política de lectura: todos los usuarios autenticados pueden ver
create policy "Usuarios autenticados pueden ver documentos RAG"
  on rag_documents for select
  to authenticated
  using (true);

-- Política de inserción: usuarios autenticados pueden insertar
create policy "Usuarios autenticados pueden subir documentos RAG"
  on rag_documents for insert
  to authenticated
  with check (true);

-- Política de eliminación: solo el que subió o superadmins
create policy "Usuario puede eliminar sus propios documentos RAG"
  on rag_documents for delete
  to authenticated
  using (
    uploaded_by = auth.uid() 
    or exists (
      select 1 from profiles 
      where profiles.id = auth.uid() 
      and profiles.role = 'superadmin'
    )
  );

-- Comentarios
comment on table rag_documents is 'Metadata de documentos subidos a Gemini File Search RAG';
comment on column rag_documents.document_name is 'ID completo del documento en Gemini API';
comment on column rag_documents.store_name is 'ID del store en Gemini API';
comment on column rag_documents.original_filename is 'Nombre original del archivo subido por el usuario';
comment on column rag_documents.display_name is 'Nombre para mostrar en la UI';
