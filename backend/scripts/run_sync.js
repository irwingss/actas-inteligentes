import 'dotenv/config';

// Hardcode URL to bypass config issues for this script
// This must be set BEFORE importing modules that might use it
process.env.LAYER_URL = 'https://pifa.oefa.gob.pe/arcgis/rest/services/LOTEX/SERV_FOR_CHID_SUP_LOTEX/MapServer';

const CA = '0027-10-2025-102';

async function main() {
    // Dynamic import to ensure env var is set first
    const { syncRecords, initSyncTables } = await import('../lib/arcgisSync.js');

    console.log(`Initializing sync tables...`);
    await initSyncTables();

    console.log(`Starting sync for CA: ${CA}`);
    const result = await syncRecords(CA, { force: true, onProgress: (p) => console.log(p) });

    console.log('Sync Result:', result);
}

main().catch(console.error);
