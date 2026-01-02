import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryFeatures } from '../lib/arcgisClient.js';

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fetchAllFields() {
    try {
        console.log('--- Fetching All Fields ---');

        async function getFields(layerId) {
            try {
                console.log(`\nQuerying Layer ${layerId}...`);
                // Fetch 1 record to see attributes
                const data = await queryFeatures('1=1', 0, 1, 'OBJECTID ASC', layerId);

                if (data.features && data.features.length > 0) {
                    const attributes = data.features[0].attributes;
                    console.log(`\n=== FIELDS LAYER ${layerId} ===`);
                    Object.keys(attributes).forEach(key => {
                        console.log(`${key}`);
                    });
                    return Object.keys(attributes);
                } else {
                    console.log(`No features found in Layer ${layerId} to extract fields from.`);
                    return [];
                }
            } catch (e) {
                console.error(`Error querying Layer ${layerId}:`, e.message);
                return [];
            }
        }

        await getFields(0);
        await getFields(1);
        await getFields(2);

    } catch (error) {
        console.error('Error in script:', error);
    }
}

fetchAllFields();
