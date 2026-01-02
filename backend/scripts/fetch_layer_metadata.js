import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLayerInfo, getLayerUrl, queryFeatures } from '../lib/arcgisClient.js';

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fetchMetadata() {
    try {
        console.log('--- Debugging URLs ---');
        console.log('Layer 0 URL:', await getLayerUrl(0));
        console.log('Layer 1 URL:', await getLayerUrl(1));
        console.log('Layer 2 URL:', await getLayerUrl(2));

        console.log('\n--- Fetching Fields from Features (Fallback) ---');

        async function getFieldsFromLayer(layerId) {
            try {
                console.log(`\nQuerying Layer ${layerId}...`);
                const data = await queryFeatures('1=1', 0, 1, 'OBJECTID ASC', layerId);
                if (data.features && data.features.length > 0) {
                    const attributes = data.features[0].attributes;
                    console.log(`Fields found in Layer ${layerId}:`);
                    Object.keys(attributes).forEach(key => {
                        console.log(`  ${key}: ${typeof attributes[key]}`);
                    });
                    return Object.keys(attributes);
                } else {
                    console.log(`No features found in Layer ${layerId}`);
                    return [];
                }
            } catch (e) {
                console.error(`Error querying Layer ${layerId}:`, e.message);
                return [];
            }
        }

        await getFieldsFromLayer(0);
        await getFieldsFromLayer(1);
        await getFieldsFromLayer(2);

    } catch (error) {
        console.error('Error in script:', error);
    }
}

fetchMetadata();
