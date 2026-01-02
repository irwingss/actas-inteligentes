-- ============================================
-- MIGRACIÓN: Sistema de Historial de Versiones de Contenido
-- Versión: 011
-- Descripción: Tablas para almacenar versiones de texto con AI enhancement
-- ============================================

-- ============================================
-- Tabla de versiones de contenido
-- Almacena cada versión de un campo de texto (obligación, descripción, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificación del contenido
  entity_type TEXT NOT NULL, -- 'hecho_obligacion', 'hecho_descripcion', 'hecho_titulo', etc.
  entity_id INTEGER NOT NULL, -- ID del hecho o entidad relacionada
  acta_id INTEGER NOT NULL, -- ID del borrador de acta
  field_name TEXT NOT NULL, -- Nombre del campo: 'obligacion_fiscalizable', 'descripcion_hecho', etc.
  
  -- Contenido
  content TEXT NOT NULL, -- El contenido HTML/texto de esta versión
  content_plain TEXT, -- Versión en texto plano para búsquedas
  
  -- Metadatos de la versión
  version_number INTEGER NOT NULL DEFAULT 1, -- Número de versión (1, 2, 3...)
  version_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'ai_enhanced', 'ai_rejected', 'auto_save'
  
  -- Info de AI Enhancement (si aplica)
  ai_model TEXT, -- 'gemini-2.5-flash', etc.
  ai_prompt_used TEXT, -- El prompt usado para generar esta versión
  ai_tokens_used INTEGER, -- Tokens consumidos
  
  -- Diff info (para versiones AI)
  previous_version_id INTEGER, -- ID de la versión anterior
  changes_summary TEXT, -- Resumen de cambios en JSON
  
  -- Usuario y timestamps
  created_by TEXT, -- Email del usuario
  created_at TEXT DEFAULT (datetime('now')),
  
  -- Estado
  is_current INTEGER DEFAULT 0, -- 1 si es la versión actual/activa
  is_accepted INTEGER DEFAULT 0, -- 1 si fue aceptada (para versiones AI)
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_version_id) REFERENCES content_versions(id) ON DELETE SET NULL
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_content_versions_entity ON content_versions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_acta ON content_versions(acta_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_field ON content_versions(field_name);
CREATE INDEX IF NOT EXISTS idx_content_versions_current ON content_versions(entity_type, entity_id, is_current);
CREATE INDEX IF NOT EXISTS idx_content_versions_type ON content_versions(version_type);
CREATE INDEX IF NOT EXISTS idx_content_versions_created ON content_versions(created_at DESC);

-- ============================================
-- Tabla de sesiones de AI Enhancement
-- Para tracking de uso y mejora del sistema
-- ============================================
CREATE TABLE IF NOT EXISTS ai_enhancement_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Contexto
  acta_id INTEGER NOT NULL,
  hecho_id INTEGER,
  field_name TEXT NOT NULL,
  
  -- Input/Output
  original_content TEXT NOT NULL,
  enhanced_content TEXT NOT NULL,
  
  -- Resultado
  was_accepted INTEGER DEFAULT 0, -- 1 si el usuario aceptó los cambios
  was_modified INTEGER DEFAULT 0, -- 1 si el usuario modificó después de aceptar
  rejection_reason TEXT, -- Si rechazó, por qué (opcional)
  
  -- Métricas
  ai_model TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  processing_time_ms INTEGER,
  
  -- Usuario y timestamps
  user_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT, -- Cuando el usuario aceptó o rechazó
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_acta ON ai_enhancement_sessions(acta_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_accepted ON ai_enhancement_sessions(was_accepted);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created ON ai_enhancement_sessions(created_at DESC);

-- ============================================
-- Vista para obtener la versión actual de cada campo
-- ============================================
CREATE VIEW IF NOT EXISTS current_content_versions AS
SELECT 
  cv.*,
  (SELECT COUNT(*) FROM content_versions cv2 
   WHERE cv2.entity_type = cv.entity_type 
   AND cv2.entity_id = cv.entity_id 
   AND cv2.field_name = cv.field_name) as total_versions
FROM content_versions cv
WHERE cv.is_current = 1;

-- ============================================
-- Vista para historial de versiones por hecho
-- ============================================
CREATE VIEW IF NOT EXISTS hecho_version_history AS
SELECT 
  cv.id,
  cv.entity_id as hecho_id,
  cv.field_name,
  cv.version_number,
  cv.version_type,
  cv.content,
  cv.ai_model,
  cv.is_current,
  cv.is_accepted,
  cv.created_by,
  cv.created_at,
  ah.titulo_hecho
FROM content_versions cv
JOIN actas_hechos ah ON cv.entity_id = ah.id
WHERE cv.entity_type LIKE 'hecho_%'
ORDER BY cv.entity_id, cv.field_name, cv.version_number DESC;
