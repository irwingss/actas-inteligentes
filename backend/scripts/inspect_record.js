import axios from 'axios';

const BASE_URL = 'https://pifa.oefa.gob.pe/arcgis/rest/services/LOTEX/SERV_FOR_CHID_SUP_LOTEX/MapServer';
const CA = '0027-10-2025-102';

async function queryLayer(layerId, where) {
    const url = `${BASE_URL}/${layerId}/query`;
    const params = new URLSearchParams({
        f: 'json',
        where: where,
        outFields: '*',
        returnGeometry: 'false'
    });

    try {
        const response = await axios.get(`${url}?${params.toString()}`);
        if (response.data.error) {
            throw new Error(response.data.error.message);
        }
        return response.data.features || [];
    } catch (error) {
        console.error(`Error querying layer ${layerId}:`, error.message);
        return [];
    }
}

async function main() {
    console.log(`Inspecting CA: ${CA}`);

    // 1. Query Layer 0
    console.log('\n--- Layer 0 (Points) ---');
    // Use exact field names from service definition
    const where0 = `CA = '${CA}' OR OTRO_CA = '${CA}'`;
    const features0 = await queryLayer(0, where0);

    if (features0.length === 0) {
        console.log('No records found in Layer 0');
        return;
    }

    const feature0 = features0[0];
    console.log(JSON.stringify(feature0.attributes, null, 2));

    const globalId = feature0.attributes.GLOBALID || feature0.attributes.GlobalID;
    console.log(`\nGlobalID: ${globalId}`);

    if (!globalId) {
        console.log('No GlobalID found, cannot query related tables.');
        return;
    }

    // 2. Query Layer 1
    console.log('\n--- Layer 1 (Descripcion) ---');
    const where1 = `GUID = '${globalId}'`;
    const features1 = await queryLayer(1, where1);
    if (features1.length > 0) {
        features1.forEach(f => {
            console.log(JSON.stringify(f.attributes, null, 2));
        });
    } else {
        console.log('No related records in Layer 1');
    }

    // 3. Query Layer 2
    console.log('\n--- Layer 2 (Hechos) ---');
    const where2 = `GUID = '${globalId}'`;
    const features2 = await queryLayer(2, where2);
    if (features2.length > 0) {
        features2.forEach(f => {
            console.log(JSON.stringify(f.attributes, null, 2));
        });
    } else {
        console.log('No related records in Layer 2');
    }
}

main().catch(console.error);
