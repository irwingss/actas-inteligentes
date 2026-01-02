-- ============================================
-- MIGRACIÓN: Tabla de Muestreos Ambientales para Actas
-- Versión: 016
-- Descripción: Tabla para almacenar puntos de muestreo ambiental del acta
-- ============================================

CREATE TABLE IF NOT EXISTS actas_muestreos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relación con borrador
  acta_id INTEGER NOT NULL,
  
  -- Información del punto de muestreo
  numero INTEGER NOT NULL, -- N.° correlativo
  codigo_punto TEXT, -- Código del punto de muestreo
  nro_muestras TEXT, -- Número de muestras
  matriz TEXT, -- Matriz (efluentes, calidad_suelo, etc.)
  descripcion TEXT, -- Descripción del punto
  
  -- Coordenadas
  norte REAL,
  este REAL,
  altitud REAL,
  zona TEXT,
  
  -- Muestra dirimente
  muestra_dirimente TEXT DEFAULT 'No', -- 'Sí' / 'No'
  
  -- Referencia al registro original
  globalid_origen TEXT,
  
  -- Metadatos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (acta_id) REFERENCES actas_borradores(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actas_muestreos_acta_id ON actas_muestreos(acta_id);
CREATE INDEX IF NOT EXISTS idx_actas_muestreos_numero ON actas_muestreos(acta_id, numero);
CREATE INDEX IF NOT EXISTS idx_actas_muestreos_matriz ON actas_muestreos(acta_id, matriz);
CREATE INDEX IF NOT EXISTS idx_actas_muestreos_globalid ON actas_muestreos(globalid_origen);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS update_actas_muestreos_timestamp 
AFTER UPDATE ON actas_muestreos
BEGIN
  UPDATE actas_muestreos SET updated_at = datetime('now') WHERE id = NEW.id;
END;
