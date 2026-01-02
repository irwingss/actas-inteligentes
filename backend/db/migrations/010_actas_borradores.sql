-- ============================================
-- MIGRACIÓN: Sistema de Borradores de Actas
-- Versión: 010
-- Descripción: Tablas para almacenar borradores de actas localmente
-- ============================================

-- ============================================
-- Tabla principal de borradores de actas
-- ============================================
CREATE TABLE IF NOT EXISTS actas_borradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificación del acta
  codigo_accion TEXT NOT NULL, -- CA asociado
  tipo_acta TEXT NOT NULL DEFAULT 'regular', -- 'regular', 'especial', 'suelos_empetrolados'
  expediente TEXT, -- Número de expediente
  
  -- Información General (Sección 1)
  nombre_administrado TEXT,
  ruc TEXT,
  unidad_fiscalizable TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  direccion_referencia TEXT,
  actividad_desarrollada TEXT,
  etapa TEXT,
  tipo_supervision TEXT,
  orientativa TEXT, -- 'Sí' / 'No'
  estado TEXT,
  fecha_hora_inicio TEXT,
  fecha_hora_cierre TEXT,
  
  -- Equipos GPS (JSON array de objetos {codigo, marca, sistema})
  equipos_gps_json TEXT DEFAULT '[]',
  
  -- Metadatos de creación
  modalidad TEXT, -- 'A' o 'B' (de la data de campo)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT, -- Email del usuario
  
  -- Estado del borrador
  status TEXT DEFAULT 'draft', -- 'draft', 'in_progress', 'completed', 'exported'
  last_section_edited TEXT, -- Última sección editada
  completion_percentage INTEGER DEFAULT 0
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_borradores_ca ON actas_borradores(codigo_accion);
CREATE INDEX IF NOT EXISTS idx_actas_borradores_status ON actas_borradores(status);
CREATE INDEX IF NOT EXISTS idx_actas_borradores_created_at ON actas_borradores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actas_borradores_created_by ON actas_borradores(created_by);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_borradores_timestamp 
AFTER UPDATE ON actas_borradores
BEGIN
  UPDATE actas_borradores SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de hechos verificados del acta
-- ============================================
CREATE TABLE IF NOT EXISTS actas_hechos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con borrador
  acta_id INTEGER NOT NULL,
  
  -- Identificación del hecho
  numero_hecho INTEGER NOT NULL, -- Orden correlativo (1, 2, 3...)
  titulo_hecho TEXT, -- Título personalizado del hecho
  hecho_detec_original TEXT, -- HECHO_DETEC_1 original de la data
  
  -- Campos del hecho
  presunto_incumplimiento TEXT, -- 'sí', 'no', 'no aplica', 'por determinar'
  subsanado TEXT, -- 'sí', 'no', 'no aplica'
  
  -- Obligación (texto libre para que el usuario añada)
  obligacion TEXT,
  
  -- Descripción (generada desde DESCRIP_1 o DESCRIP_2 según modalidad)
  descripcion TEXT,
  descripcion_original TEXT, -- Descripción original de la data
  
  -- Requerimiento de subsanación
  requerimiento_subsanacion TEXT,
  
  -- Información para análisis de riesgo (futuro)
  info_analisis_riesgo TEXT,
  
  -- Metadatos
  globalid_origen TEXT, -- GlobalID del registro de donde viene el hecho
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- Estado
  is_completed INTEGER DEFAULT 0,
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_hechos_acta_id ON actas_hechos(acta_id);
CREATE INDEX IF NOT EXISTS idx_actas_hechos_numero ON actas_hechos(acta_id, numero_hecho);
CREATE INDEX IF NOT EXISTS idx_actas_hechos_globalid ON actas_hechos(globalid_origen);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_hechos_timestamp 
AFTER UPDATE ON actas_hechos
BEGIN
  UPDATE actas_hechos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de medios probatorios (fotos del hecho)
-- ============================================
CREATE TABLE IF NOT EXISTS actas_medios_probatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con hecho
  hecho_id INTEGER NOT NULL,
  acta_id INTEGER NOT NULL, -- Denormalizado para queries rápidos
  
  -- Información de la foto
  numero_foto INTEGER NOT NULL, -- Orden (1, 2, 3...)
  titulo_foto TEXT, -- Ej: "Figura N.° 1"
  subtitulo_foto TEXT, -- Ej: "Cancha de Tratamiento N° 3"
  
  -- Descripción (editable por el usuario)
  descripcion TEXT,
  descripcion_original TEXT, -- Descripción original de la foto
  
  -- Coordenadas
  este REAL,
  norte REAL,
  altitud REAL,
  zona TEXT,
  datum TEXT DEFAULT 'WGS 84',
  
  -- Referencia a la foto en arcgis_photos
  photo_id INTEGER, -- FK a arcgis_photos.id
  photo_globalid TEXT, -- GlobalID del registro padre
  photo_filename TEXT,
  photo_local_path TEXT,
  
  -- Metadatos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (hecho_id) REFERENCES actas_hechos(id) ON DELETE CASCADE,
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES arcgis_photos(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_medios_hecho_id ON actas_medios_probatorios(hecho_id);
CREATE INDEX IF NOT EXISTS idx_actas_medios_acta_id ON actas_medios_probatorios(acta_id);
CREATE INDEX IF NOT EXISTS idx_actas_medios_numero ON actas_medios_probatorios(hecho_id, numero_foto);
CREATE INDEX IF NOT EXISTS idx_actas_medios_photo_id ON actas_medios_probatorios(photo_id);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_medios_timestamp 
AFTER UPDATE ON actas_medios_probatorios
BEGIN
  UPDATE actas_medios_probatorios SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de componentes supervisados (Sección 3)
-- ============================================
CREATE TABLE IF NOT EXISTS actas_componentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con borrador
  acta_id INTEGER NOT NULL,
  
  -- Información del componente
  numero INTEGER NOT NULL, -- N.°
  componente TEXT NOT NULL, -- Nombre del componente
  norte REAL,
  este REAL,
  zona TEXT,
  altitud REAL,
  descripcion TEXT, -- Descripción del componente
  
  -- Referencia al registro original
  globalid_origen TEXT,
  
  -- Metadatos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_componentes_acta_id ON actas_componentes(acta_id);
CREATE INDEX IF NOT EXISTS idx_actas_componentes_numero ON actas_componentes(acta_id, numero);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_componentes_timestamp 
AFTER UPDATE ON actas_componentes
BEGIN
  UPDATE actas_componentes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Tabla de anexos (Sección 8)
-- ============================================
CREATE TABLE IF NOT EXISTS actas_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con borrador
  acta_id INTEGER NOT NULL,
  
  -- Información del anexo
  numero INTEGER NOT NULL, -- N.°
  descripcion TEXT NOT NULL,
  tipo TEXT, -- Tipo de anexo
  folios TEXT, -- Número de folios
  
  -- Metadatos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_anexos_acta_id ON actas_anexos(acta_id);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_anexos_timestamp 
AFTER UPDATE ON actas_anexos
BEGIN
  UPDATE actas_anexos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- Vista para resumen de borradores
-- ============================================
CREATE VIEW IF NOT EXISTS actas_borradores_resumen AS
SELECT 
  ab.id,
  ab.codigo_accion,
  ab.tipo_acta,
  ab.expediente,
  ab.nombre_administrado,
  ab.status,
  ab.completion_percentage,
  ab.created_at,
  ab.updated_at,
  ab.created_by,
  COUNT(DISTINCT ah.id) as total_hechos,
  COUNT(DISTINCT amp.id) as total_fotos,
  COUNT(DISTINCT ac.id) as total_componentes
FROM actas_borradores ab
LEFT JOIN actas_hechos ah ON ab.id = ah.acta_id
LEFT JOIN actas_medios_probatorios amp ON ab.id = amp.acta_id
LEFT JOIN actas_componentes ac ON ab.id = ac.acta_id
GROUP BY ab.id;
