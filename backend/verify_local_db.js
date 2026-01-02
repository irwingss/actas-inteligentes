import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'db', 'actas_inteligentes.db');
console.log('Checking database at:', dbPath);

try {
    const db = new Database(dbPath, { fileMustExist: false });

    // Check if table exists
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='arcgis_records'").get();
    if (!table) {
        console.log('Table arcgis_records does NOT exist.');
    } else {
        console.log('Table arcgis_records exists.');
        // Check columns
        const columns = db.prepare("PRAGMA table_info(arcgis_records)").all();
        const colNames = columns.map(c => c.name);
        console.log('Columns:', colNames);

        const missing = ['descripcion_detallada', 'hecho_detectado', 'descripcion_hecho'].filter(c => !colNames.includes(c));

        if (missing.length === 0) {
            console.log('SUCCESS: All new columns are present.');
        } else {
            console.log('FAILURE: Missing columns:', missing);
        }
    }
    db.close();
} catch (err) {
    console.error('Error checking DB:', err);
}
