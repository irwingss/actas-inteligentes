import axios from 'axios';

const LAYER_URL = 'https://pifa.oefa.gob.pe/arcgis/rest/services/LOTEX/SERV_FOR_CHID_SUP_LOTEX/MapServer';
const CA = '0027-10-2025-102';

// Known GlobalIDs from previous inspection
const GLOBAL_ID_L0 = '{F055833F-8503-4B3C-A2D4-01216F4DABA5}';
// We need to find OIDs for attachments usually, but let's check queryAttachments first if supported, 
// or the standard /{layerId}/{oid}/attachments endpoint.
// First we need the ObjectIDs for these GlobalIDs.

async function inspectAttachments() {
    console.log(`Inspecting attachments for CA: ${CA}`);
    console.log(`Service URL: ${LAYER_URL}`);

    try {
        // 1. Get ObjectIDs for the known GlobalIDs
        // Layer 0
        const l0Res = await axios.get(`${LAYER_URL}/0/query`, {
            params: {
                where: `GLOBALID = '${GLOBAL_ID_L0}'`,
                outFields: 'OBJECTID,GLOBALID',
                f: 'json'
            }
        });

        if (!l0Res.data.features?.length) {
            console.log('No record found in Layer 0');
            return;
        }

        const oid0 = l0Res.data.features[0].attributes.OBJECTID;
        console.log(`Layer 0: OID=${oid0}, GlobalID=${GLOBAL_ID_L0}`);
        await checkAttachments(0, oid0);

        // Layer 1 (Related)
        const l1Res = await axios.get(`${LAYER_URL}/1/query`, {
            params: {
                where: `GUID = '${GLOBAL_ID_L0}'`,
                outFields: 'OBJECTID,GLOBALID',
                f: 'json'
            }
        });

        console.log(`Layer 1: Found ${l1Res.data.features?.length || 0} related records`);
        for (const feat of l1Res.data.features || []) {
            await checkAttachments(1, feat.attributes.OBJECTID);
        }

        // Layer 2 (Related)
        const l2Res = await axios.get(`${LAYER_URL}/2/query`, {
            params: {
                where: `GUID = '${GLOBAL_ID_L0}'`,
                outFields: 'OBJECTID,GLOBALID',
                f: 'json'
            }
        });

        console.log(`Layer 2: Found ${l2Res.data.features?.length || 0} related records`);
        for (const feat of l2Res.data.features || []) {
            await checkAttachments(2, feat.attributes.OBJECTID);
        }

    } catch (error) {
        console.error('Error inspecting attachments:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

async function checkAttachments(layerId, oid) {
    const url = `${LAYER_URL}/${layerId}/${oid}/attachments?f=json`;
    console.log(`Checking attachments: ${url}`);

    try {
        const res = await axios.get(url);
        if (res.data && res.data.attachmentInfos) {
            const count = res.data.attachmentInfos.length;
            console.log(`   -> Found ${count} attachments`);
            res.data.attachmentInfos.forEach(att => {
                console.log(`      - ID: ${att.id}, Name: ${att.name}, Type: ${att.contentType}, Size: ${att.size}`);
                console.log(`        URL: ${LAYER_URL}/${layerId}/${oid}/attachments/${att.id}`);
            });
        } else {
            console.log(`   -> No attachmentInfos found (or not supported)`);
        }
    } catch (error) {
        console.log(`   -> Error checking attachments: ${error.message}`);
    }
}

inspectAttachments();
