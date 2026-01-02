-- Migración: Anotaciones por foto individual (photo_id = globalid_filename)
-- Esta tabla permite que cada foto tenga sus propias anotaciones independientes
-- En lugar de compartir anotaciones por registro (globalid)

-- Crear tabla para anotaciones por foto individual
CREATE TABLE IF NOT EXISTS photo_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL UNIQUE,  -- formato: globalid_filename (ej: "abc123_foto_1.jpg")
    globalid TEXT NOT NULL,          -- referencia al registro padre
    filename TEXT NOT NULL,          -- nombre del archivo de la foto
    annotations TEXT,                -- JSON con las anotaciones
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_photo_annotations_photo_id ON photo_annotations(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_annotations_globalid ON photo_annotations(globalid);

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER IF NOT EXISTS photo_annotations_updated_at
AFTER UPDATE ON photo_annotations
FOR EACH ROW
BEGIN
    UPDATE photo_annotations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Migrar datos existentes de arcgis_records.photo_annotations a la nueva tabla
-- Solo para registros que tengan anotaciones
INSERT OR IGNORE INTO photo_annotations (photo_id, globalid, filename, annotations)
SELECT 
    globalid || '_foto_1',  -- Asumimos foto_1 para datos legacy
    globalid,
    'foto_1',
    photo_annotations
FROM arcgis_records 
WHERE photo_annotations IS NOT NULL 
  AND photo_annotations != '' 
  AND photo_annotations != '[]';
