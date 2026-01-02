import { fetchEnrichedRecords, getToken } from '../lib/arcgisClient.js';
import configService from '../services/configService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function verifyEnrichedData() {
    console.log('Starting verification of enriched data...');
    console.log('SUPABASE_URL present:', !!process.env.SUPABASE_URL);
    console.log('SUPABASE_KEY present:', !!process.env.SUPABASE_KEY);

    try {
        console.log('Fetching configuration...');
        const config = await configService.getConfiguration();
        console.log('Configuration loaded:', config ? 'YES' : 'NO');
        if (config) {
            console.log('Survey123 URL:', config.survey123_url);
        }

        // Fetch a small batch of records (e.g., 5) to inspect
        // We pass a dummy onProgress function
        console.log('Calling fetchEnrichedRecords...');
        const records = await fetchEnrichedRecords(
            (progress) => console.log(`Progress: ${progress.stage} - ${progress.count || ''}`),
            5
        );

        console.log(`Fetched ${records.length} records.`);

        if (records.length > 0) {
            const sample = records[0];
            console.log('Sample Record Keys:', Object.keys(sample));

            // Check for new fields
            const newFields = ['DESCRIP_1', 'HECHO_DETEC_1', 'DESCRIP_2', 'MODALIDAD', 'ACTIVIDAD', 'NOM_PTO_MUESTREO'];

            console.log('\n--- Checking New Fields in Sample Record ---');
            newFields.forEach(field => {
                console.log(`${field}: ${sample[field] !== undefined ? sample[field] : 'UNDEFINED'}`);
            });

            // Check if any record has these fields populated
            console.log('\n--- Scanning all records for populated new fields ---');
            const populatedCounts = {};
            newFields.forEach(f => populatedCounts[f] = 0);

            records.forEach(r => {
                newFields.forEach(f => {
                    if (r[f]) populatedCounts[f]++;
                });
            });

            console.table(populatedCounts);
        } else {
            console.warn('No records found to verify.');
        }

    } catch (error) {
        console.error('Error verifying data:', error);
    }
}

verifyEnrichedData();
