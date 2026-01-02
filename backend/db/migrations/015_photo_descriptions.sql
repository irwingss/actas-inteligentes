-- Migración: Descripciones por foto individual (photo_id = globalid_filename)
-- Esta tabla permite que cada foto tenga su propia descripción independiente
-- En lugar de compartir descripciones por registro (globalid)

-- Crear tabla para descripciones por foto individual
CREATE TABLE IF NOT EXISTS photo_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL UNIQUE,  -- formato: globalid_filename
    globalid TEXT NOT NULL,          -- referencia al registro padre
    filename TEXT NOT NULL,          -- nombre del archivo de la foto
    descripcion_editada TEXT,        -- descripción editada por el usuario
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_photo_descriptions_photo_id ON photo_descriptions(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_descriptions_globalid ON photo_descriptions(globalid);
