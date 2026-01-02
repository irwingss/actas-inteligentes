import db from '../db/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLocalRecords } from '../lib/arcgisSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CA = '0027-10-2025-102';

console.log(`Querying local DB for CA: ${CA}`);

const records = getLocalRecords(CA);

if (records.length === 0) {
    console.log('No local records found.');
} else {
    console.log(`Found ${records.length} records.`);
    const outputPath = path.join(__dirname, '../../local_record_output.json');
    fs.writeFileSync(outputPath, JSON.stringify(records[0], null, 2));
    console.log(`Record written to ${outputPath}`);
}
