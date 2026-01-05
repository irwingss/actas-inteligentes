-- Migration: Create unidades_fiscalizables table in Supabase
-- This table stores the master data for Unidades Fiscalizables
-- Synced by superadmin from Excel, downloaded by users to local SQLite

CREATE TABLE IF NOT EXISTS public.unidades_fiscalizables (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  n INTEGER,
  codigo_admin TEXT,
  tipo_doc TEXT,
  ruc TEXT,
  razon_social TEXT,
  dpto_fiscal TEXT,
  prov_fiscal TEXT,
  dist_fiscal TEXT,
  direccion TEXT,
  estad_admin TEXT,
  uf_codigo_antiguo TEXT,
  unidad_fiscalizable TEXT NOT NULL,
  uf_codigo_nuevo TEXT,
  sector TEXT,
  subsector TEXT,
  competencia TEXT,
  actividad TEXT,
  dpto_ejecucion TEXT,
  prov_ejecucion TEXT,
  dist_ejecucion TEXT,
  estad_uf TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_uf_unidad_fiscalizable ON public.unidades_fiscalizables(unidad_fiscalizable);
CREATE INDEX IF NOT EXISTS idx_uf_razon_social ON public.unidades_fiscalizables(razon_social);
CREATE INDEX IF NOT EXISTS idx_uf_ruc ON public.unidades_fiscalizables(ruc);
CREATE INDEX IF NOT EXISTS idx_uf_codigo_nuevo ON public.unidades_fiscalizables(uf_codigo_nuevo);

-- RLS Policies
ALTER TABLE public.unidades_fiscalizables ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Users can read unidades_fiscalizables"
  ON public.unidades_fiscalizables
  FOR SELECT
  TO authenticated
  USING (true);

-- Only superadmin can insert/update/delete (enforced via service role in backend)
-- Service role bypasses RLS

-- Table for tracking sync metadata
CREATE TABLE IF NOT EXISTS public.uf_sync_metadata (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  total_records INTEGER NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  synced_by UUID REFERENCES auth.users(id),
  file_name TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

-- RLS for sync metadata
ALTER TABLE public.uf_sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read uf_sync_metadata"
  ON public.uf_sync_metadata
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.unidades_fiscalizables IS 'Master data of Unidades Fiscalizables synced from Excel by superadmin';
COMMENT ON TABLE public.uf_sync_metadata IS 'Metadata tracking for UF synchronization';
