import { getToken } from '../lib/arcgisClient.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testSyncLogic() {
    let survey123_url = process.env.LAYER_URL;
    if (survey123_url) survey123_url = survey123_url.trim();

    console.log('Testing with URL:', survey123_url);
    console.log('URL length:', survey123_url ? survey123_url.length : 0);
    if (survey123_url) {
        console.log('Last char code:', survey123_url.charCodeAt(survey123_url.length - 1));
    }

    const token = await getToken();

    const fetchLayerFields = async (url, layerName) => {
        try {
            let queryUrl = `${url}/query?where=1%3D1&returnGeometry=false&outFields=*&f=json&resultRecordCount=1`;
            if (token) {
                queryUrl += `&token=${encodeURIComponent(token)}`;
            }
            console.log(`Consultando ${layerName}:`, url);
            const response = await fetch(queryUrl);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return (data.fields || []).map(field => ({
                name: field.name,
                layer: layerName
            }));
        } catch (e) {
            console.warn(`Error fetching ${layerName}:`, e.message);
            return [];
        }
    };

    let baseUrl = survey123_url;
    if (baseUrl.match(/\/\d+$/)) {
        baseUrl = baseUrl.replace(/\/\d+$/, '');
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const url0 = `${baseUrl}/0`;
    const url1 = `${baseUrl}/1`;
    const url2 = `${baseUrl}/2`;

    console.log('URL 0:', url0);
    console.log('URL 1:', url1);
    console.log('URL 2:', url2);

    const [fields0, fields1, fields2] = await Promise.all([
        fetchLayerFields(url0, 'Layer 0'),
        fetchLayerFields(url1, 'Layer 1'),
        fetchLayerFields(url2, 'Layer 2')
    ]);

    console.log(`Campos encontrados: L0=${fields0.length}, L1=${fields1.length}, L2=${fields2.length}`);

    const allFieldsMap = new Map();
    const addFields = (fields) => {
        fields.forEach(f => {
            if (!allFieldsMap.has(f.name)) {
                allFieldsMap.set(f.name, f);
            }
        });
    };

    addFields(fields0);
    addFields(fields1);
    addFields(fields2);

    const columns = Array.from(allFieldsMap.values());
    console.log('Total combined columns:', columns.length);

    // Check for specific fields
    const checkField = (name) => {
        const found = columns.find(c => c.name === name);
        console.log(`Field '${name}' found? ${found ? 'YES (' + found.layer + ')' : 'NO'}`);
    };

    checkField('modalidad');
    checkField('actividad');
    checkField('nom_pto_muestreo');
    checkField('DESCRIP_1');
    checkField('HECHO_DETEC_1');
}

testSyncLogic();
