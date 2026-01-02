import * as client from './lib/arcgisClient.js';
console.log('Exports:', Object.keys(client));
if (client.fetchEnrichedRecords) {
    console.log('fetchEnrichedRecords is exported');
} else {
    console.error('fetchEnrichedRecords is MISSING');
}
