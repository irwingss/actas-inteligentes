-- Migración: Cache local de configuración de IA
-- Esta tabla almacena la configuración de Gemini sincronizada desde Supabase
-- Se actualiza cada vez que el usuario inicia sesión

CREATE TABLE IF NOT EXISTS ai_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  gemini_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.5-flash',
  gemini_model_expert TEXT DEFAULT 'gemini-3-pro-preview',
  synced_at TEXT,
  synced_from TEXT DEFAULT 'supabase'
);

-- Insertar fila inicial si no existe
INSERT OR IGNORE INTO ai_config (id) VALUES (1);
