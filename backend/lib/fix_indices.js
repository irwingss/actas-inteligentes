import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'actas_inteligentes.db');

console.log(`[FixIndices] Opening database: ${dbPath}`);
const db = new Database(dbPath);

try {
    console.log('[FixIndices] Dropping old unique index...');
    db.exec('DROP INDEX IF EXISTS idx_arcgis_photos_unique');

    console.log('[FixIndices] Creating new unique index with layer_id...');
    db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arcgis_photos_unique_layer 
    ON arcgis_photos(layer_id, objectid, attachment_id, is_deleted)
  `);

    console.log('[FixIndices] Verifying indices...');
    const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='arcgis_photos'").all();
    console.log('[FixIndices] Current indices on arcgis_photos:', indices.map(i => i.name));

    console.log('[FixIndices] ✅ Indices fixed successfully.');
} catch (error) {
    console.error('[FixIndices] ❌ Error fixing indices:', error.message);
} finally {
    db.close();
}
