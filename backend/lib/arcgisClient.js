import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getQueryFieldNames, getAllFieldNames } from '../config/fieldMapping.js';
import configService from '../services/configService.js';

// Centralized HTTP client with sane defaults to avoid indefinite hangs
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS || '30000', 10);
const http = axios.create({ timeout: HTTP_TIMEOUT_MS });

// Env variables - leer dinámicamente para evitar problemas de orden de importación
function getEnvVar(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

/**
 * Obtiene la URL de Survey123 desde Supabase (o fallback a .env)
 * IMPORTANTE: Esta es la URL que usa toda la aplicación
 */
export async function getLayerUrl(layerId = 0) {
  try {
    // Intentar obtener configuración desde Supabase
    const config = await configService.getConfiguration();

    // Debug log
    console.log(`[getLayerUrl] layerId: ${layerId}, env.LAYER_URL: ${process.env.LAYER_URL}`);

    // Si hay una URL específica configurada para este layer, usarla
    if (layerId === 1 && config.survey123_layer1_url) return config.survey123_layer1_url;
    if (layerId === 2 && config.survey123_layer2_url) return config.survey123_layer2_url;
    if (layerId === 0 && config.survey123_url) return config.survey123_url;

    // Si no hay URL específica, usar la base (Layer 0) y modificar el ID
    const baseUrl = config.survey123_url || process.env.LAYER_URL;

    if (!baseUrl) {
      throw new Error('URL de ArcGIS no configurada');
    }

    // Si es la URL base (termina en /0), reemplazar el ID
    if (baseUrl.match(/\/\d+$/)) {
      return baseUrl.replace(/\/\d+$/, `/${layerId}`);
    }

    // Si no termina en número, asumir que es el MapServer y añadir el ID
    return `${baseUrl.replace(/\/$/, '')}/${layerId}`;
  } catch (error) {
    console.warn(`[arcgisClient] Error obteniendo URL para layer ${layerId}, usando fallback:`, error.message);
    // Fallback básico
    const baseUrl = process.env.LAYER_URL;
    if (!baseUrl || !baseUrl.trim()) {
      throw new Error('URL de Survey123 no configurada. Configure desde /configuration o en .env');
    }
    if (baseUrl.match(/\/\d+$/)) {
      return baseUrl.replace(/\/\d+$/, `/${layerId}`);
    }
    return `${baseUrl.trim()}/${layerId}`;
  }
}

const PORTAL_URL = getEnvVar('PORTAL_URL', 'https://www.arcgis.com');
const ARCGIS_USER = getEnvVar('ARCGIS_USER');
const ARCGIS_PASSWORD = getEnvVar('ARCGIS_PASSWORD');

// No hacer log aquí - se hará en server.js después de cargar .env

// Nuevo: valores distintos de otro_ca
async function queryDistinctOtroCA(search = '') {
  const fieldNames = getQueryFieldNames();
  const otroCAField = fieldNames.otroCA;
  const baseWhere = `${otroCAField} IS NOT NULL`;
  let where = baseWhere;
  if (search && search.trim()) {
    const s = search.replace(/'/g, "''");
    where = `${baseWhere} AND UPPER(${otroCAField}) LIKE UPPER('%${s}%')`;
  }
  const params = {
    f: 'json',
    where,
    outFields: otroCAField,
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: otroCAField
  };
  const url = await buildQueryUrl(params);
  const { data } = await http.get(url);
  if (data.error) throw new Error(data.error.message || 'Error en queryDistinctOtroCA');
  const features = data.features || [];
  const values = features
    .map(f => f.attributes?.[otroCAField])
    .filter(v => v !== null && v !== undefined)
    .map(v => String(v));
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

let cachedToken = null;
let tokenExpiresAt = 0; // epoch ms
let cachedLayerInfo = null;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  if (!ARCGIS_USER || !ARCGIS_PASSWORD) {
    // Intentar sin token para servicios públicos (solo log una vez)
    if (!getToken.warnedOnce) {
      console.warn('[arcgisClient] ⚠️  ARCGIS_USER/PASSWORD no configurados - usando acceso público');
      getToken.warnedOnce = true;
    }
    return null;
  }

  const url = `${PORTAL_URL}/sharing/rest/generateToken`;
  const params = new URLSearchParams();
  params.append('username', ARCGIS_USER);
  params.append('password', ARCGIS_PASSWORD);
  // Use referer-based authentication for ArcGIS Online services
  params.append('client', 'referer');
  params.append('referer', PORTAL_URL);
  params.append('f', 'json');
  params.append('expiration', '60'); // minutos

  try {
    const { data } = await http.post(url, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data && data.token) {
      cachedToken = data.token;
      // Use explicit expiration if provided, otherwise default to 55 min
      const expiresMs = data.expires ? data.expires : (Date.now() + 55 * 60 * 1000);
      tokenExpiresAt = expiresMs;
      console.log('[arcgisClient] ✅ Token generado exitosamente');
      return cachedToken;
    }

    // Log detailed error for debugging
    const errorMsg = data?.error?.message || data?.error?.details?.[0] || JSON.stringify(data);
    console.error('[arcgisClient] ❌ Error al generar token:', errorMsg);
    console.warn('[arcgisClient] ⚠️  Intentando acceso sin token...');
    return null; // Fallback para servicios públicos
  } catch (error) {
    console.error('[arcgisClient] ❌ Error inesperado al generar token:', error);
    return null;
  }
}

async function getLayerInfo(layerId = 0) {
  // Cache key now needs to include layerId
  const cacheKey = `layer_${layerId}`;
  if (cachedLayerInfo && cachedLayerInfo[cacheKey]) return cachedLayerInfo[cacheKey];

  const LAYER_URL = await getLayerUrl(layerId);
  if (!LAYER_URL) throw new Error('URL de Survey123 no configurada');

  const token = await getToken();
  // URL already includes layerId from getLayerUrl(layerId)
  const urlObj = new URL(LAYER_URL);
  urlObj.searchParams.append('f', 'json');
  if (token) {
    urlObj.searchParams.append('token', token);
  }
  const url = urlObj.toString();

  await logDebug(`Fetching layer info from: ${url}`);
  console.log(`[DEBUG] Fetching layer info from: ${url}`);
  const { data } = await http.get(url);

  if (data.error) {
    console.error(`[DEBUG] Error fetching layer info:`, data.error);
    await logDebug(`Error fetching layer info: ${JSON.stringify(data.error)}`);
  } else {
    console.log(`[DEBUG] Layer info fetched. Fields count: ${data.fields ? data.fields.length : 0}`);
    await logDebug(`Layer info fetched. Keys: ${Object.keys(data).join(', ')}`);
    if (!data.fields) {
      await logDebug(`WARNING: No fields property in response! Raw data start: ${JSON.stringify(data).substring(0, 200)}`);
    }
  }

  if (data && data.fields) {
    if (!cachedLayerInfo) cachedLayerInfo = {};
    cachedLayerInfo[cacheKey] = data;
  }
  return data;
}

async function buildQueryUrl(params, layerId = 0) {
  const LAYER_URL = await getLayerUrl(layerId);
  if (!LAYER_URL || LAYER_URL.trim() === '') {
    throw new Error('URL de Survey123 no configurada. Configure desde /configuration o en .env');
  }
  const token = await getToken();
  // LAYER_URL already includes the layer ID (e.g. .../0)
  const url = new URL(`${LAYER_URL}/query`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  if (token) {
    url.searchParams.append('token', token);
  }
  return url.toString();
}

async function queryDistinctSupervision(search = '') {
  const fieldNames = getQueryFieldNames();
  const supervisorField = fieldNames.nombreSupervisor;
  const baseWhere = `${supervisorField} IS NOT NULL`;
  let where = baseWhere;
  if (search && search.trim()) {
    // Case-insensitive LIKE
    const s = search.replace(/'/g, "''");
    where = `${baseWhere} AND UPPER(${supervisorField}) LIKE UPPER('%${s}%')`;
  }
  const params = {
    f: 'json',
    where,
    outFields: supervisorField,
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: supervisorField
  };
  const url = await buildQueryUrl(params, 0); // Layer 0
  const { data } = await http.get(url);
  if (data.error) throw new Error(data.error.message || 'Error en queryDistinctSupervision');
  const features = data.features || [];
  const values = features
    .map(f => f.attributes?.[supervisorField])
    .filter(v => v !== null && v !== undefined)
    .map(v => String(v));
  // unique + sorted
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

// Nuevo: valores distintos de codigo_accion
async function queryDistinctCodigoAccion(search = '') {
  const fieldNames = getQueryFieldNames();
  const codigoField = fieldNames.codigoAccion;
  const baseWhere = `${codigoField} IS NOT NULL`;
  let where = baseWhere;
  if (search && search.trim()) {
    const s = search.replace(/'/g, "''");
    where = `${baseWhere} AND UPPER(${codigoField}) LIKE UPPER('%${s}%')`;
  }
  const params = {
    f: 'json',
    where,
    outFields: codigoField,
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: codigoField
  };
  const url = await buildQueryUrl(params, 0); // Layer 0
  console.log('[queryDistinctCodigoAccion] Params:', JSON.stringify(params));
  console.log('[queryDistinctCodigoAccion] URL:', url);
  const { data } = await http.get(url);
  if (data.error) {
    console.error('[queryDistinctCodigoAccion] Error data:', JSON.stringify(data));
    throw new Error(data.error.message || 'Error en queryDistinctCodigoAccion');
  }
  const features = data.features || [];
  const values = features
    .map(f => f.attributes?.[codigoField])
    .filter(v => v !== null && v !== undefined)
    .map(v => String(v));
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function queryFeatures(layerId, params = {}) {
  const info = await getOidAndGlobalIdFields(layerId);
  const url = await getLayerUrl(layerId);
  const queryUrl = `${url}/query`;

  const queryParams = {
    f: 'json',
    outFields: '*',
    returnGeometry: false,
    where: '1=1',
    ...params
  };

  const token = await getToken();
  if (token) queryParams.token = token;

  await logDebug(`Querying Layer ${layerId}: ${JSON.stringify(queryParams)}`);

  try {
    const { data } = await http.get(queryUrl, { params: queryParams });

    if (data.error) {
      await logDebug(`Error querying Layer ${layerId}: ${JSON.stringify(data.error)}`);
      throw new Error(data.error.message);
    }

    const features = data.features || [];
    await logDebug(`Layer ${layerId} query returned ${features.length} features`);
    return features;
  } catch (error) {
    await logDebug(`Exception querying Layer ${layerId}: ${error.message}`);
    throw error;
  }
}

async function listAttachments(layerId, oid) {
  const urlBase = (await getLayerUrl(layerId)).replace(/\/$/, '');
  const token = await getToken();

  const url = `${urlBase}/${encodeURIComponent(oid)}/attachments?f=json` + (token ? `&token=${encodeURIComponent(token)}` : '');

  await logDebug(`Listing attachments for Layer ${layerId}, OID ${oid}: ${url}`);

  try {
    const { data } = await http.get(url);
    if (data.error) {
      await logDebug(`Error listing attachments: ${JSON.stringify(data.error)}`);
      throw new Error(data.error.message || 'Error al listar adjuntos');
    }
    return data.attachmentInfos || [];
  } catch (error) {
    await logDebug(`Exception listing attachments: ${error.message}`);
    return [];
  }
}

async function downloadAttachment(layerId, oid, attachmentId, destDir) {
  const urlBase = (await getLayerUrl(layerId)).replace(/\/$/, '');
  const token = await getToken();

  const url = `${urlBase}/${encodeURIComponent(oid)}/attachments/${encodeURIComponent(attachmentId)}` + (token ? `?token=${encodeURIComponent(token)}` : '');

  await logDebug(`Downloading attachment ${attachmentId} from Layer ${layerId}, OID ${oid}`);

  try {
    const res = await http.get(url, { responseType: 'stream' });
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // filename: try to read from headers, fallback
    const cd = res.headers['content-disposition'] || '';
    const match = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/);
    let filename = match?.[1] || match?.[2] || `${attachmentId}.jpg`; // Default extension if unknown

    // sanitize
    filename = filename.replace(/[/\\?%*:|"<>]/g, '_');
    const filePath = path.join(destDir, filename);

    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(filePath);
      res.data.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    return { filePath, filename };
  } catch (error) {
    await logDebug(`Error downloading attachment: ${error.message}`);
    throw error;
  }
}

async function logDebug(msg) {
  const logPath = path.join(process.cwd(), 'debug_arcgis.log');
  const time = new Date().toISOString();
  fs.appendFileSync(logPath, `[${time}] ${msg}\n`);
}

async function getOidAndGlobalIdFields(layerId = 0) {
  await logDebug(`getOidAndGlobalIdFields called for layer ${layerId}`);
  const info = await getLayerInfo(layerId);
  let oidField = info.objectIdField;
  let globalidField = null;
  const fields = Array.isArray(info.fields) ? info.fields : [];

  await logDebug(`Layer ${layerId} info OID field: ${oidField}`);
  await logDebug(`Layer ${layerId} fields count: ${fields.length}`);
  if (fields.length > 0) {
    await logDebug(`First 5 fields: ${JSON.stringify(fields.slice(0, 5).map(f => f.name))}`);
  }

  // Detect OID field if missing
  if (!oidField) {
    const oidCand = fields.find(f => f.type === 'esriFieldTypeOID');
    if (oidCand) {
      oidField = oidCand.name;
      await logDebug(`Found OID field by type: ${oidField}`);
    } else {
      // Fallback by name
      const oidNameCand = fields.find(f => f.name.toLowerCase() === 'objectid');
      if (oidNameCand) {
        oidField = oidNameCand.name;
        await logDebug(`Found OID field by name: ${oidField}`);
      }
    }
  }

  // Preferir tipo GlobalID
  for (const f of fields) {
    if (f.type === 'esriFieldTypeGlobalID') {
      globalidField = f.name;
      break;
    }
  }

  // Fallback 1: buscar nombre exacto 'globalid' (case-insensitive)
  if (!globalidField) {
    const cand = fields.find((f) => String(f.name || '').toLowerCase() === 'globalid');
    if (cand) globalidField = cand.name;
  }

  // Fallback 2: buscar usando field mapping (only for Layer 0 usually)
  if (!globalidField && layerId === 0) {
    const allGlobalIdNames = getAllFieldNames('globalId');
    await logDebug(`Searching GlobalID using mapping: ${JSON.stringify(allGlobalIdNames)}`);
    for (const name of allGlobalIdNames) {
      const nameLower = name.toLowerCase();
      const cand = fields.find((f) => String(f.name || '').toLowerCase() === nameLower);
      if (cand) {
        globalidField = cand.name;
        break;
      }
    }
  }

  await logDebug(`Detected OID: ${oidField}, GlobalID: ${globalidField}`);

  if (!oidField || !globalidField) {
    await logDebug(`Failed to detect OID/GlobalID. Fields available: ${JSON.stringify(fields.map(f => `${f.name} (${f.type})`))}`);
    throw new Error(`No se pudieron detectar campos OID/GlobalID para Layer ${layerId}`);
  }
  return { oidField, globalidField };
}

/**
 * Busca el nombre real de una columna en un array de headers (case-insensitive con includes)
 * Útil para cuando el nombre puede estar contenido en otro (ej: "supervisor" en "nombre_supervisor")
 * @param {string} fieldKey - Clave del campo en FIELD_MAPPING
 * @param {string[]} headers - Array de nombres de columnas del servicio
 * @returns {string|null} Nombre real de la columna o null si no se encuentra
 */
function findFieldInHeadersLoose(fieldKey, headers) {
  const mapping = FIELD_MAPPING[fieldKey];
  if (!mapping) return null;

  const headersLower = headers.map(h => String(h || '').toLowerCase());

  // Buscar primary (match exacto primero)
  const primaryLower = mapping.primary.toLowerCase();
  let index = headersLower.indexOf(primaryLower);
  if (index !== -1) return headers[index];

  // Buscar primary (contains)
  index = headersLower.findIndex(h => h.includes(primaryLower));
  if (index !== -1) return headers[index];

  // Buscar fallbacks (match exacto)
  for (const fallback of mapping.fallbacks) {
    const fallbackLower = fallback.toLowerCase();
    index = headersLower.indexOf(fallbackLower);
    if (index !== -1) return headers[index];
  }

  // Buscar fallbacks (contains)
  for (const fallback of mapping.fallbacks) {
    const fallbackLower = fallback.toLowerCase();
    index = headersLower.findIndex(h => h.includes(fallbackLower));
    if (index !== -1) return headers[index];
  }

  return null;
}

/**
   * Obtiene registros enriquecidos (Layer 0 + Table 1 + Table 2)
   * @param {string|object} whereOrOptions - WHERE clause string o objeto de opciones
   * @param {function} onLog - Callback para logging (opcional, legacy)
   * @param {function} onProgress - Callback para progreso (opcional, legacy)
   */
async function fetchEnrichedRecords(whereOrOptions = {}, onLog = null, onProgress = null) {
  // Soportar tanto string (WHERE clause) como objeto (options)
  let where = '1=1';
  let lastSyncDate = null;

  if (typeof whereOrOptions === 'string') {
    // Llamada con WHERE clause directamente (desde arcgisSync)
    where = whereOrOptions;
    await logDebug(`fetchEnrichedRecords called with WHERE: ${where}`);
  } else if (typeof whereOrOptions === 'object') {
    // Llamada con objeto de opciones (legacy)
    lastSyncDate = whereOrOptions.lastSyncDate;
    if (whereOrOptions.where) {
      where = whereOrOptions.where;
    } else if (lastSyncDate) {
      const dateStr = lastSyncDate.toISOString().split('T')[0]; // YYYY-MM-DD
      where = `LAST_EDITED_DATE >= '${dateStr}' OR CREATED_DATE >= '${dateStr}'`;
    }
    await logDebug(`fetchEnrichedRecords called with options: ${JSON.stringify(whereOrOptions)}`);
  }

  // 1. Fetch Layer 0 (Parents)
  await logDebug(`Fetching Layer 0 with WHERE: ${where}`);
  const parents = await queryFeatures(0, { where });
  
  // Notificar progreso si hay callback
  if (onProgress) {
    onProgress({ stage: 'fetching_layer0', count: parents.length });
  }
  await logDebug(`Fetched ${parents.length} parent records from Layer 0`);

  if (parents.length === 0) return [];

  // 2. Extract GlobalIDs
  const parentGlobalIds = parents.map(p => p.attributes.GLOBALID).filter(Boolean);
  await logDebug(`Parent GlobalIDs: ${parentGlobalIds.length}`);

  if (parentGlobalIds.length === 0) return parents.map(p => p.attributes);

  // 3. Fetch Layer 1 (Descriptions)
  const guidList = parentGlobalIds.map(id => `'${id}'`).join(',');
  const layer1Where = `GUID IN (${guidList})`;
  const layer1Records = await queryFeatures(1, { where: layer1Where });
  await logDebug(`Fetched ${layer1Records.length} records from Layer 1`);

  // 4. Fetch Layer 2 (Facts)
  const layer2Records = await queryFeatures(2, { where: layer1Where });
  await logDebug(`Fetched ${layer2Records.length} records from Layer 2`);

  // 5. Join Data
  const enriched = parents.map(parent => {
    const pid = parent.attributes.GLOBALID;

    // Find ALL related records
    const r1s = layer1Records.filter(r => r.attributes.GUID === pid);
    const r2s = layer2Records.filter(r => r.attributes.GUID === pid);

    // Helper to concatenate fields
    const joinFields = (records, fieldName) => {
      const values = records
        .map(r => r.attributes[fieldName])
        .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      return values.length > 0 ? values.join(' | ') : null;
    };

    // Concatenate specific fields for flat view
    const descrip1 = joinFields(r1s, 'DESCRIP_1');
    const guid1 = r1s.length > 0 ? r1s[0].attributes.GUID : null; // Keep one GUID for reference

    const hechoDetec1 = joinFields(r2s, 'HECHO_DETEC_1');
    const descrip2 = joinFields(r2s, 'DESCRIP_2');

    // Helper to get OID case-insensitively
    const getOid = (attrs) => attrs.OBJECTID || attrs.objectid || attrs.ObjectId || attrs.OID || attrs.oid;

    // Collect OIDs for photos
    const layer1Oids = r1s.map(r => getOid(r.attributes)).filter(id => id != null);
    const layer2Oids = r2s.map(r => getOid(r.attributes)).filter(id => id != null);

    return {
      ...parent.attributes,
      // Overwrite/Add flattened fields
      DESCRIP_1: descrip1,
      GUID: guid1,
      HECHO_DETEC_1: hechoDetec1,
      DESCRIP_2: descrip2,

      // Internal fields
      _layer1_oids: layer1Oids,
      _layer2_oids: layer2Oids,
      _layer0_oid: getOid(parent.attributes),

      // Keep raw arrays if needed for advanced processing later
      _related_layer1: r1s.map(r => r.attributes),
      _related_layer2: r2s.map(r => r.attributes)
    };
  });

  return enriched;
}

export {
  getToken,
  getLayerInfo,
  buildQueryUrl,
  queryDistinctSupervision,
  queryDistinctCodigoAccion,
  queryDistinctOtroCA,
  queryFeatures,
  listAttachments,
  downloadAttachment,
  getOidAndGlobalIdFields,
  fetchEnrichedRecords
};
