-- Disable foreign keys during migration
PRAGMA foreign_keys = OFF;

-- 1. Create new table
CREATE TABLE arcgis_records_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  objectid INTEGER NOT NULL,
  globalid TEXT NOT NULL UNIQUE,
  codigo_accion TEXT,
  otro_ca TEXT,
  fecha TEXT,
  norte REAL,
  este REAL,
  zona TEXT,
  datum TEXT,
  altitud REAL,
  componente TEXT,
  tipo_componente TEXT,
  nombre_supervisor TEXT,
  modalidad TEXT,
  actividad TEXT,
  instalacion_referencia TEXT,
  nom_pto_ppc TEXT,
  num_pto_muestreo TEXT,
  nom_pto_muestreo TEXT,
  descrip_1 TEXT,
  hecho_detec_1 TEXT,
  descrip_2 TEXT,
  guid TEXT,
  created_user TEXT,
  created_date TEXT,
  last_edited_user TEXT,
  last_edited_date TEXT,
  raw_json TEXT NOT NULL,
  synced_at TEXT DEFAULT (datetime('now')),
  local_created_at TEXT DEFAULT (datetime('now')),
  local_updated_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0,
  checksum TEXT
);

-- 2. Copy data
INSERT INTO arcgis_records_new (
  id, objectid, globalid, codigo_accion, otro_ca, fecha, norte, este, zona, datum, altitud,
  componente, tipo_componente, nombre_supervisor, modalidad, actividad, instalacion_referencia,
  nom_pto_ppc, num_pto_muestreo, nom_pto_muestreo, descrip_1, hecho_detec_1, descrip_2, guid,
  created_user, created_date, last_edited_user, last_edited_date, raw_json, synced_at,
  local_created_at, local_updated_at, is_deleted, checksum
)
SELECT
  id, objectid, globalid, codigo_accion, otro_ca, fecha, norte, este, zona, datum, altitud,
  componente, tipo_componente, nombre_supervisor, modalidad, actividad, instalacion_referencia,
  nom_pto_ppc, num_pto_muestreo, nom_pto_muestreo, descrip_1, hecho_detec_1, descrip_2, guid,
  created_user, created_date, last_edited_user, last_edited_date, raw_json, synced_at,
  local_created_at, local_updated_at, is_deleted, checksum
FROM arcgis_records;

-- 3. Drop old table
DROP TABLE arcgis_records;

-- 4. Rename new table
ALTER TABLE arcgis_records_new RENAME TO arcgis_records;

-- 5. Recreate Indices
CREATE INDEX idx_arcgis_globalid ON arcgis_records(globalid);
CREATE INDEX idx_arcgis_objectid ON arcgis_records(objectid);
CREATE INDEX idx_arcgis_codigo_accion ON arcgis_records(codigo_accion);
CREATE INDEX idx_arcgis_otro_ca ON arcgis_records(otro_ca);
CREATE INDEX idx_arcgis_supervisor ON arcgis_records(nombre_supervisor);
CREATE INDEX idx_arcgis_fecha ON arcgis_records(fecha);
CREATE INDEX idx_arcgis_is_deleted ON arcgis_records(is_deleted);
CREATE INDEX idx_arcgis_synced_at ON arcgis_records(synced_at);
CREATE INDEX idx_arcgis_codigo_composite ON arcgis_records(codigo_accion, otro_ca, is_deleted);

-- 6. Recreate Trigger
CREATE TRIGGER update_arcgis_records_timestamp 
AFTER UPDATE ON arcgis_records
WHEN NEW.is_deleted = 0
BEGIN
  UPDATE arcgis_records 
  SET local_updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
