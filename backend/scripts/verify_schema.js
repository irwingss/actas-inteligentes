import db from '../db/config.js';

const info = db.pragma('table_info(arcgis_records)');
console.log('Columns in arcgis_records:');
info.forEach(col => console.log(col.name));
