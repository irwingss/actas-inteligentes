import express from 'express';
import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import {
  queryFeatures,
  getOidAndGlobalIdFields,
  listAttachments,
  downloadAttachment,
  fetchEnrichedRecords,
  queryDistinctSupervision,
  queryDistinctCodigoAccion,
  queryDistinctOtroCA
} from '../lib/arcgisClient.js';
import { createJob, getJob, updateJob, addError, requestCancel } from '../lib/s123Jobs.js';
import { generateDocument } from '../documentGenerator.js';
import { FIELD_MAPPING, findFieldInHeaders, findFieldInHeadersLoose, getQueryFieldNames } from '../config/fieldMapping.js';
import { getLocalRecords, getLocalPhotos } from '../lib/arcgisSync.js';
import { authenticate, validateCAAccess, validateCAAccessBody, validateJobAccess, validateJobAccessBody } from '../middleware/auth.js';
import { parseDateToTimestamp } from '../lib/geminiTools.js';

const router = express.Router();

// Apply authentication to all s123 routes
router.use(authenticate);

// Max job runtime to prevent indefinite hangs (default: 30 minutes)
const JOB_MAX_MS = parseInt(process.env.JOB_MAX_MS || '1800000', 10);

// CSV helpers
function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function stripQuotes(s) {
  const t = String(s ?? '');
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function buildCSV(header, rows) {
  const esc = (v) => {
    const t = String(v ?? '');
    const needs = /[",\n]/.test(t);
    const body = t.replace(/"/g, '""');
    return needs ? `"${body}"` : body;
  };
  const head = header.map(esc).join(',');
  const body = rows.map((r) => header.map((h) => esc(r[h])).join(',')).join('\n');
  return [head, body].filter(Boolean).join('\n');
}

function parseDateLoose(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // Pure digits: treat as epoch (ms or seconds)
  if (/^\d+$/.test(t)) {
    let n = Number(t);
    if (n < 1e12) n *= 1000; // seconds -> ms
    const d = new Date(n);
    if (!isNaN(d.getTime())) return d;
  }
  // Try dd/mm/yyyy or dd-mm-yyyy with optional time HH:mm[:ss] (local time)
  let m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) {
    const dd = parseInt(m[1], 10);
    const MM = parseInt(m[2], 10) - 1;
    const yyyy = parseInt(m[3], 10);
    const hh = m[4] != null ? parseInt(m[4], 10) : 0;
    const mi = m[5] != null ? parseInt(m[5], 10) : 0;
    const ss = m[6] != null ? parseInt(m[6], 10) : 0;
    const d = new Date(yyyy, MM, dd, hh, mi, ss);
    if (!isNaN(d.getTime())) return d;
  }
  // Try yyyy-mm-dd or yyyy/mm/dd with optional time HH:mm[:ss] (local time)
  m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) {
    const yyyy = parseInt(m[1], 10);
    const MM = parseInt(m[2], 10) - 1;
    const dd = parseInt(m[3], 10);
    const hh = m[4] != null ? parseInt(m[4], 10) : 0;
    const mi = m[5] != null ? parseInt(m[5], 10) : 0;
    const ss = m[6] != null ? parseInt(m[6], 10) : 0;
    const d = new Date(yyyy, MM, dd, hh, mi, ss);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: Try native parser (handles full ISO strings like 2025-08-19T12:00:00Z)
  const d1 = new Date(t);
  if (!isNaN(d1.getTime())) return d1;
  return null;
}

// GET /api/s123/supervision-values?search=...
router.get('/supervision-values', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const values = await queryDistinctSupervision(search);
    res.json({ values });
  } catch (err) {
    console.error('[supervision-values] Error:', err);
    res.status(500).json({ error: 'Error al obtener valores de Supervision', details: err?.message });
  }
});

// GET /api/s123/tipo-de-reporte/:jobId -> unique tipo_de_reporte values from original CSV (Z)
router.get('/tipo-de-reporte/:jobId', validateJobAccess, async (req, res) => {
  try {
    const job = await getJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    if (!fs.existsSync(job.originalCsvPath)) return res.json({ options: [] });

    const csv = fs.readFileSync(job.originalCsvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return res.json({ options: [] });

    const header = parseCSVLine(lines[0]).map(stripQuotes);
    const headerLower = header.map((h) => String(h || '').toLowerCase());
    // Detect column: prefer exact 'tipo_de_reporte', then any header containing it
    let idx = headerLower.indexOf('tipo_de_reporte');
    if (idx === -1) idx = headerLower.findIndex((h) => h.includes('tipo_de_reporte'));
    if (idx === -1) return res.json({ options: [] });
    const key = header[idx];
    const set = new Set();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map(stripQuotes);
      const v = String(cols[idx] ?? '').trim();
      if (v) set.add(v);
    }
    const options = Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
    return res.json({ options, key });
  } catch (err) {
    console.error('[tipo-de-reporte] Error:', err);
    return res.status(500).json({ error: 'Error listando tipo_de_reporte' });
  }
});

// GET /api/s123/subcomponente/:jobId -> unique subcomponente values from original CSV (Z)
router.get('/subcomponente/:jobId', validateJobAccess, async (req, res) => {
  try {
    const job = await getJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    if (!fs.existsSync(job.originalCsvPath)) return res.json({ options: [] });

    const csv = fs.readFileSync(job.originalCsvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return res.json({ options: [] });

    const header = parseCSVLine(lines[0]).map(stripQuotes);
    const headerLower = header.map((h) => String(h || '').toLowerCase());
    // Detect column: prefer exact 'subcomponente', then any header containing it
    let idx = headerLower.indexOf('subcomponente');
    if (idx === -1) idx = headerLower.findIndex((h) => h.includes('subcomponente'));
    if (idx === -1) return res.json({ options: [] });
    const key = header[idx];
    const set = new Set();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map(stripQuotes);
      const v = String(cols[idx] ?? '').trim();
      if (v) set.add(v);
    }
    const options = Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
    return res.json({ options, key });
  } catch (err) {
    console.error('[subcomponente] Error:', err);
    return res.status(500).json({ error: 'Error listando subcomponente' });
  }
});

// GET /api/s123/supervisors/:jobId -> unique supervisor values from original CSV (Z)
router.get('/supervisors/:jobId', validateJobAccess, async (req, res) => {
  try {
    const job = await getJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    if (!fs.existsSync(job.originalCsvPath)) return res.json({ options: [] });

    const csv = fs.readFileSync(job.originalCsvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return res.json({ options: [] });

    const header = parseCSVLine(lines[0]).map(stripQuotes);
    const headerLower = header.map((h) => String(h || '').toLowerCase());
    // Detect supervisor column: prefer headers containing 'supervisor' (e.g., 'nombre_supervisor'),
    // then fallback to exact 'supervision'.
    const supIdx = (() => {
      let idx = headerLower.findIndex((h) => h.includes('supervisor'));
      if (idx !== -1) return idx;
      idx = headerLower.indexOf('supervision');
      if (idx !== -1) return idx;
      return -1;
    })();
    if (supIdx === -1) return res.json({ options: [] });

    const supKey = header[supIdx];
    const set = new Set();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map(stripQuotes);
      const v = String(cols[supIdx] ?? '').trim();
      if (v) set.add(v);
    }
    const options = Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
    return res.json({ options, key: supKey });
  } catch (err) {
    console.error('[supervisors] Error:', err);
    return res.status(500).json({ error: 'Error listando supervisores' });
  }
});

// GET /api/s123/codigo-accion-values?search=...
router.get('/codigo-accion-values', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const [valsCodigo, valsOtro] = await Promise.all([
      queryDistinctCodigoAccion(search),
      queryDistinctOtroCA(search)
    ]);
    const fieldNames = getQueryFieldNames();
    const items = [];
    const seen = new Set(); // de-dup by field+value
    for (const v of (valsCodigo || [])) {
      const key = `${fieldNames.codigoAccion}|${v}`;
      if (!seen.has(key)) { items.push({ value: v, field: fieldNames.codigoAccion }); seen.add(key); }
    }
    for (const v of (valsOtro || [])) {
      const key = `${fieldNames.otroCA}|${v}`;
      if (!seen.has(key)) { items.push({ value: v, field: fieldNames.otroCA }); seen.add(key); }
    }
    res.json({ values: items });
  } catch (err) {
    console.error('[codigo-accion-values] Error:', err);
    // Si el error es por configuración faltante, devolver un mensaje más específico
    if (err.message && err.message.includes('LAYER_URL')) {
      return res.status(503).json({
        error: 'Servicio no configurado',
        message: 'La conexión con ArcGIS no está configurada. Por favor, contacta al administrador.',
        details: err.message
      });
    }
    res.status(500).json({ error: 'Error al obtener valores de Codigo_accion/Otro_CA', details: err?.message });
  }
});

// GET /api/s123/unique-values/:caCode/:field
// Obtiene valores únicos de un campo específico para un CA
router.get('/unique-values/:caCode/:field', validateCAAccess, async (req, res) => {
  try {
    const { caCode, field } = req.params;

    // Map strict fields to DB fields
    const fieldMap = {
      'SUPERVISOR': 'nombre_supervisor',
      'TIPO_COMPONENTE': 'tipo_componente',
      'COMPONENTE': 'componente',
      'INSTALACION_REFERENCIA': 'instalacion_referencia',
      'HECHO_DETECTADO': 'hecho_detectado',
      'TIPO_DE_REPORTE': 'tipo_de_reporte',
      'SUBCOMPONENTE': 'subcomponente',
      'ACTIVIDAD': 'actividad',
      // Legacy support
      'nombre_supervisor': 'nombre_supervisor',
      'supervisor': 'nombre_supervisor',
      'tipo_componente': 'tipo_componente',
      'componente': 'componente',
      'instalacion_referencia': 'instalacion_referencia',
      'hecho_detec': 'hecho_detectado',
      'hecho_detectado': 'hecho_detectado',
      'tipo_de_reporte': 'tipo_de_reporte',
      'subcomponente': 'subcomponente',
      'actividad': 'actividad'
    };

    const dbField = fieldMap[field] || fieldMap[String(field).toUpperCase()] || field;

    // Validar campo permitido (checking against DB field names)
    const allowedDbFields = [
      'nombre_supervisor',
      'tipo_componente',
      'componente',
      'instalacion_referencia',
      'hecho_detectado',
      'tipo_de_reporte',
      'subcomponente',
      'actividad'
    ];

    if (!allowedDbFields.includes(dbField)) {
      return res.status(400).json({
        error: 'Campo no permitido',
        allowedFields: Object.keys(fieldMap)
      });
    }

    // Obtener registros locales
    const records = getLocalRecords(caCode);

    if (!records || records.length === 0) {
      return res.json({ values: [] });
    }

    // Extraer valores únicos
    let uniqueValues;
    
    // Special case: hecho_detectado comes from multiple sources
    if (dbField === 'hecho_detectado') {
      const allHechos = [];
      records.forEach(r => {
        // 1. Try parsing _related_layer2 JSON
        if (r._related_layer2) {
          try {
            const layer2Data = typeof r._related_layer2 === 'string' 
              ? JSON.parse(r._related_layer2) 
              : r._related_layer2;
            if (Array.isArray(layer2Data)) {
              layer2Data.forEach(item => {
                const hecho = item.HECHO_DETEC_1 || item.hecho_detec_1 || item.HECHO_DETEC || item.hecho_detec;
                if (hecho && hecho.trim()) {
                  allHechos.push(hecho.trim());
                }
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        // 2. Check all possible direct field names
        const possibleFields = ['hecho_detectado', 'hecho_detec', 'hecho_detec_1', 'HECHO_DETEC_1', 'HECHO_DETEC'];
        possibleFields.forEach(field => {
          if (r[field] && r[field].trim()) {
            allHechos.push(r[field].trim());
          }
        });
      });
      // Reemplazar guiones bajos por espacios y eliminar duplicados
      uniqueValues = [...new Set(allHechos.map(h => h.replace(/_/g, ' ')))].sort();
      console.log('[unique-values] Hechos encontrados:', uniqueValues.length, uniqueValues.slice(0, 5));
    } else {
      uniqueValues = [...new Set(
        records
          .map(r => r[dbField])
          .filter(v => v !== null && v !== undefined && v !== '')
      )].sort();
    }

    res.json({ values: uniqueValues });
  } catch (error) {
    console.error('[unique-values] Error:', error);
    res.status(500).json({
      error: 'Error al obtener valores únicos',
      details: error.message
    });
  }
});

// GET /api/s123/photos-by-ca/:caCode?page=1&pageSize=12&supervisor=X&componente=Y
// Obtiene fotos paginadas de un CA con filtros opcionales
router.get('/photos-by-ca/:caCode', validateCAAccess, async (req, res) => {
  try {
    const { caCode } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 12;

    // Obtener registros locales
    let records = getLocalRecords(caCode);

    if (!records || records.length === 0) {
      return res.json({ groups: [], page, pageSize, total: 0, hasFilters: false });
    }

    // Filtro por globalid específico (para hechos)
    const globalidFilter = req.query.globalid;
    if (globalidFilter) {
      records = records.filter(r => r.globalid === globalidFilter);
    }

    // Aplicar filtros si existen
    const filters = {
      supervisor: req.query.supervisor,
      tipo_componente: req.query.tipo_componente,
      componente: req.query.componente,
      instalacion_referencia: req.query.instalacion_referencia,
      hecho_detec: req.query.hecho_detec,
      tipo_de_reporte: req.query.tipo_de_reporte,
      subcomponente: req.query.subcomponente,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };

    // Verificar si hay filtros activos
    const hasActiveFilters = Object.values(filters).some(v => v && (typeof v === 'string' ? v.trim() : v));

    // Filtrar registros
    Object.entries(filters).forEach(([key, value]) => {
      if (value && (typeof value === 'string' ? value.trim() : value)) {
        const fieldMap = {
          'supervisor': 'nombre_supervisor',
          'tipo_componente': 'tipo_componente',
          'componente': 'componente',
          'instalacion_referencia': 'instalacion_referencia',
          'hecho_detec': 'hecho_detec',
          'tipo_de_reporte': 'tipo_de_reporte',
          'subcomponente': 'subcomponente'
        };
        const dbField = fieldMap[key] || key;

        // Búsqueda flexible para supervisor (con espacios O guiones bajos)
        if (key === 'supervisor') {
          const withUnderscores = value.replace(/\s+/g, '_');
          const withSpaces = value.replace(/_/g, ' ');
          records = records.filter(r =>
            r[dbField] === value ||
            r[dbField] === withUnderscores ||
            r[dbField] === withSpaces
          );
        } else if (key === 'hecho_detec') {
          // Búsqueda de hecho detectado en múltiples campos posibles
          // El valor viene con espacios, pero en BD puede tener guiones bajos
          const valueWithUnderscores = value.replace(/\s+/g, '_');
          const valueWithSpaces = value.replace(/_/g, ' ');
          
          records = records.filter(r => {
            const possibleFields = ['hecho_detectado', 'hecho_detec', 'hecho_detec_1', 'HECHO_DETEC_1', 'HECHO_DETEC'];
            for (const field of possibleFields) {
              if (r[field]) {
                const fieldValue = r[field];
                if (fieldValue === value || fieldValue === valueWithUnderscores || fieldValue === valueWithSpaces) return true;
              }
            }
            // También buscar en _related_layer2
            if (r._related_layer2) {
              try {
                const layer2Data = typeof r._related_layer2 === 'string' 
                  ? JSON.parse(r._related_layer2) 
                  : r._related_layer2;
                if (Array.isArray(layer2Data)) {
                  return layer2Data.some(item => {
                    const hecho = item.HECHO_DETEC_1 || item.hecho_detec_1 || item.HECHO_DETEC || item.hecho_detec;
                    return hecho === value || hecho === valueWithUnderscores || hecho === valueWithSpaces;
                  });
                }
              } catch (e) {}
            }
            return false;
          });
        } else if (key === 'dateFrom') {
          // Parsear fecha y filtrar >= dateFrom
          const timestamp = parseDateToTimestamp(value);
          if (timestamp) {
            records = records.filter(r => r.fecha >= timestamp);
          }
        } else if (key === 'dateTo') {
          // Parsear fecha y filtrar <= dateTo (incluir todo el día)
          const timestamp = parseDateToTimestamp(value);
          if (timestamp) {
            records = records.filter(r => r.fecha <= (timestamp + 86400000));
          }
        } else {
          records = records.filter(r => r[dbField] === value);
        }
      }
    });

    // Obtener todas las fotos individuales (no agrupadas)
    const allPhotos = [];
    for (const record of records) {
      const photos = getLocalPhotos(record.globalid);
      if (photos && photos.length > 0) {
        // Obtener hecho detectado de múltiples fuentes
        let hechoDetec = record.hecho_detec_1 || record.hecho_detec || record.hecho_detectado || record.HECHO_DETEC_1 || record.HECHO_DETEC;
        // También intentar desde _related_layer2
        if (!hechoDetec && record._related_layer2) {
          try {
            const layer2 = typeof record._related_layer2 === 'string' ? JSON.parse(record._related_layer2) : record._related_layer2;
            if (Array.isArray(layer2) && layer2.length > 0) {
              hechoDetec = layer2[0].HECHO_DETEC_1 || layer2[0].hecho_detec_1 || layer2[0].HECHO_DETEC || layer2[0].hecho_detec;
            }
          } catch (e) {}
        }
        
        // Parsear raw_json para buscar descripciones
        let rawData = {};
        try {
          rawData = record.raw_json ? JSON.parse(record.raw_json) : {};
        } catch (e) {}
        
        // Agregar cada foto como elemento individual
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          
          // IMPORTANTE: Usar layer_id de la foto para determinar qué descripción usar
          // layer_id = 1 (Descripcion) → DESCRIP_1
          // layer_id = 2 (Hechos) → DESCRIP_2
          const layerId = photo.layer_id || 1;
          
          // Buscar descripción según el layer de la foto
          const descripcionKey = `descrip_${layerId}`;
          const descripcionKeyUpper = `DESCRIP_${layerId}`;
          const hechoDetecKey = `hecho_detec_${layerId}`;
          const hechoDetecKeyUpper = `HECHO_DETEC_${layerId}`;
          
          // Prioridad: columna directa > raw_json uppercase > raw_json lowercase
          const descripcionEspecifica = record[descripcionKey] || rawData[descripcionKeyUpper] || rawData[descripcionKey] || '';
          const hechoDetecEspecifico = record[hechoDetecKey] || rawData[hechoDetecKeyUpper] || rawData[hechoDetecKey] || '';
          
          allPhotos.push({
            gid: record.globalid,
            filename: photo.filename,
            layerId: layerId, // Layer de origen: 1=Descripcion, 2=Hechos
            // Descripción ESPECÍFICA de esta foto (no compartida)
            descripcion: descripcionEspecifica,
            hecho_detec_especifico: hechoDetecEspecifico,
            metadata: {
              componente: record.componente,
              supervisor: record.nombre_supervisor?.replace(/_/g, ' '),
              tipo_componente: record.tipo_componente,
              fecha: record.fecha,
              hecho_detec: hechoDetec?.replace(/_/g, ' '),
              instalacion_referencia: record.instalacion_referencia || ''
            }
          });
        }
      }
    }

    // Paginación
    const total = allPhotos.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedPhotos = allPhotos.slice(start, end);

    res.json({
      groups: paginatedPhotos,
      page,
      pageSize,
      total,
      hasFilters: hasActiveFilters,
      filteredRecordsCount: records.length
    });
  } catch (error) {
    console.error('[photos-by-ca] Error:', error);
    res.status(500).json({
      error: 'Error al obtener fotos',
      details: error.message
    });
  }
});

// GET /api/s123/photo-by-ca/:caCode/:gid/:filename?token=xxx
// Sirve una imagen específica desde el sistema de archivos local
// Acepta token en query param para permitir carga desde <img> tags
router.get('/photo-by-ca/:caCode/:gid/:filename', (req, res, next) => {
  // Si hay token en query param, moverlo al header ANTES de authenticate
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, validateCAAccess, async (req, res) => {
  try {
    const { caCode, gid, filename } = req.params;

    // Verificar que el registro pertenece al CA
    const records = getLocalRecords(caCode);
    const record = records?.find(r => r.globalid === gid);

    if (!record) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // Obtener la foto desde la base de datos
    const photos = getLocalPhotos(gid);
    const photo = photos?.find(p => p.filename === filename);

    if (!photo || !photo.local_path) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    // Determinar ruta completa del archivo
    let fullPath;
    if (path.isAbsolute(photo.local_path)) {
      // Ruta absoluta (nuevo formato desde storage/photos/)
      fullPath = photo.local_path;
    } else {
      // Ruta relativa (legacy desde uploads/)
      fullPath = path.join(process.cwd(), 'uploads', photo.local_path);
    }

    // Verificar que el archivo existe
    if (!fs.existsSync(fullPath)) {
      console.error('[photo-by-ca] Archivo no existe:', fullPath);
      return res.status(404).json({ error: 'Archivo de foto no encontrado' });
    }

    // Servir la imagen desde el disco
    const contentType = photo.content_type || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año
    res.sendFile(fullPath);
  } catch (error) {
    console.error('[photo-by-ca] Error:', error);
    res.status(500).json({
      error: 'Error al obtener foto',
      details: error.message
    });
  }
});

// POST /api/s123/fetch { supervision?, where? }
router.post('/fetch', async (req, res) => {
  try {
    const { codigoAccion, supervision, where: bodyWhere } = req.body || {};
    let where = bodyWhere;
    const fieldNames = getQueryFieldNames();

    if (codigoAccion && !where) {
      const safe = String(codigoAccion).replace(/'/g, "''");
      where = `${fieldNames.codigoAccion} = '${safe}'`;
    } else if (supervision && !where) {
      // Compatibilidad hacia atrás
      const safe = String(supervision).replace(/'/g, "''");
      where = `${fieldNames.nombreSupervisor} = '${safe}'`;
    }
    if (!where || !String(where).trim()) {
      return res.status(400).json({ error: 'Debe especificar "where" o "codigoAccion"' });
    }

    const job = await createJob(where, {
      userId: req.user.id,
      caCode: codigoAccion || null
    });
    res.json({ jobId: job.id });

    // Lanzar proceso en background
    setImmediate(async () => {
      try {
        await updateJob(job.id, { status: 'running' });

        // Helper to abort on user cancel or timeout
        const checkAbort = async () => {
          const j = await getJob(job.id, req.user.id);
          if (!j) throw new Error('__ABORT__ Job desaparecido');
          if (j.cancelRequested) throw new Error('__ABORT__ Cancelado por el usuario');
          if (Date.now() - j.createdAt > JOB_MAX_MS) throw new Error('__ABORT__ Tiempo máximo excedido');
        };

        await checkAbort();
        const { oidField, globalidField } = await getOidAndGlobalIdFields(0);

        // Determinar where efectivo con fallback (Tab 1):
        let effectiveWhere = where;
        // Check if where clause contains the primary CA field
        const caFieldRegex = new RegExp(`${fieldNames.codigoAccion}\\s*=`, 'i');
        if (codigoAccion && caFieldRegex.test(where)) {
          try {
            const probe = await queryFeatures(effectiveWhere, 0, 1, `${oidField} ASC`, 0);
            const found = Array.isArray(probe.features) && probe.features.length > 0;
            if (!found) {
              const safeCodigo = String(codigoAccion).replace(/'/g, "''");
              const altWhere = `${fieldNames.otroCA} = '${safeCodigo}'`;
              const probeAlt = await queryFeatures(altWhere, 0, 1, `${oidField} ASC`, 0);
              const foundAlt = Array.isArray(probeAlt.features) && probeAlt.features.length > 0;
              if (foundAlt) {
                effectiveWhere = altWhere;
              }
            }
          } catch (e) {
            // Si falla el probe, continuar con where original
          }
        }

        // 1. Fetch Enriched Records (Layer 0 + Tables 1 & 2)
        const allRecords = await fetchEnrichedRecords(effectiveWhere, checkAbort, async (progress) => {
          if (progress.stage === 'fetching_layer0') {
            await updateJob(job.id, { fetched: progress.count, total: progress.count }); // Estimate
          }
        });

        // NORMALIZE RECORDS: Map raw ArcGIS fields to DB snake_case fields
        // This removes duplicates (CA vs codigo_accion) and obsolete fields
        const dbMapping = {
          [FIELD_MAPPING.objectId.primary]: 'objectid',
          [FIELD_MAPPING.globalId.primary]: 'globalid',
          [FIELD_MAPPING.codigoAccion.primary]: 'codigo_accion',
          [FIELD_MAPPING.otroCA.primary]: 'otro_ca',
          [FIELD_MAPPING.fecha.primary]: 'fecha',
          [FIELD_MAPPING.norte.primary]: 'norte',
          [FIELD_MAPPING.este.primary]: 'este',
          [FIELD_MAPPING.zona.primary]: 'zona',
          [FIELD_MAPPING.altitud.primary]: 'altitud',
          [FIELD_MAPPING.componente.primary]: 'componente',
          [FIELD_MAPPING.tipoComponente.primary]: 'tipo_componente',
          [FIELD_MAPPING.nombreSupervisor.primary]: 'nombre_supervisor',
          [FIELD_MAPPING.modalidad.primary]: 'modalidad',
          [FIELD_MAPPING.actividad.primary]: 'actividad',
          [FIELD_MAPPING.instalacionReferencia.primary]: 'instalacion_referencia',
          [FIELD_MAPPING.nomPtoPpc.primary]: 'nom_pto_ppc',
          [FIELD_MAPPING.numPtoMuestreo.primary]: 'num_pto_muestreo',
          [FIELD_MAPPING.nomPtoMuestreo.primary]: 'nom_pto_muestreo',
          [FIELD_MAPPING.descrip1.primary]: 'descrip_1',
          [FIELD_MAPPING.hechoDetec1.primary]: 'hecho_detec_1',
          [FIELD_MAPPING.descrip2.primary]: 'descrip_2',
          [FIELD_MAPPING.guid.primary]: 'guid',
          [FIELD_MAPPING.createdUser.primary]: 'created_user',
          [FIELD_MAPPING.createdDate.primary]: 'created_date',
          [FIELD_MAPPING.lastEditedUser.primary]: 'last_edited_user',
          [FIELD_MAPPING.lastEditedDate.primary]: 'last_edited_date'
        };

        const normalizedRecords = allRecords.map(raw => {
          const norm = {};
          // Map known fields
          Object.entries(dbMapping).forEach(([rawKey, dbKey]) => {
            if (raw[rawKey] !== undefined) {
              norm[dbKey] = raw[rawKey];
            }
          });
          // Preserve internal fields needed for processing
          if (raw._layer1_oids) norm._layer1_oids = raw._layer1_oids;
          else if (raw._layer1_oid) norm._layer1_oids = [raw._layer1_oid]; // Fallback

          if (raw._layer0_oid) norm._layer0_oid = raw._layer0_oid;
          return norm;
        });

        await updateJob(job.id, { fetched: normalizedRecords.length, total: normalizedRecords.length });

        // Escribir CSV Z (original) y sincronizar A (filtrada) inicialmente
        // Compute all unique fields across all records to ensure new columns are included
        const allFieldsSet = new Set();
        normalizedRecords.forEach(r => Object.keys(r).forEach(k => allFieldsSet.add(k)));
        const fields = Array.from(allFieldsSet);

        const parser = new Parser({ fields });
        const csv = parser.parse(normalizedRecords);
        fs.writeFileSync(job.originalCsvPath, csv, 'utf8');
        fs.writeFileSync(job.csvPath, csv, 'utf8');

        // Paso 1: precomputar el total de fotos (attachmentsTotal) y recolectar listas por registro
        let withAttachments = 0;
        let attachmentsDownloaded = 0;
        let attachmentsTotal = 0;
        const attachmentsByRecord = [];

        for (const rec of allRecords) {
          await checkAbort();
          // Use _layer1_oids if available (for photos in Table 1), fallback to Layer 0 oid
          const oids = rec._layer1_oids || (rec._layer1_oid ? [rec._layer1_oid] : []) || (rec[oidField] ? [rec[oidField]] : []);
          const gid = rec[globalidField];
          if (oids.length === 0 || gid == null) continue;

          try {
            // Iterate all OIDs
            for (const oid of oids) {
              // Pass layerId=1 explicitly
              const list = await listAttachments(1, oid);
              if (!list || list.length === 0) continue;
              withAttachments++;
              attachmentsTotal += list.length;
              attachmentsByRecord.push({ oid, gid, list });
            }
          } catch (e) {
            await addError(job.id, `Listar adjuntos para ${gid} falló: ${e?.message}`);
          }
        }

        // Publicar totales antes de descargar para que el loader tenga denominador estable
        await updateJob(job.id, { withAttachments, attachmentsDownloaded, attachmentsTotal });

        // Paso 2: descargar efectivamente todos los adjuntos
        for (const item of attachmentsByRecord) {
          await checkAbort();
          const { oid, gid, list } = item;
          const dest = path.join(job.fotosDir, String(gid));
          for (const a of list) {
            try {
              await checkAbort();
              // Pass layerId=1 explicitly
              await downloadAttachment(1, oid, a.id, dest);
              attachmentsDownloaded++;
              // Actualizar progreso después de cada archivo descargado
              await updateJob(job.id, { withAttachments, attachmentsDownloaded, attachmentsTotal });
            } catch (e) {
              await addError(job.id, `Descarga adjunto ${oid}/${a.id} falló: ${e?.message}`);
            }
          }
        }

        await updateJob(job.id, { status: 'completed', total: allRecords.length, withAttachments, attachmentsDownloaded, attachmentsTotal });
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.startsWith('__ABORT__')) {
          await addError(job.id, msg.replace('__ABORT__', '').trim());
        } else {
          console.error('[fetch job] Error global:', e);
          await addError(job.id, e);
        }
        await updateJob(job.id, { status: 'error' });
      }
    });
  } catch (err) {
    console.error('[fetch] Error:', err);
    res.status(500).json({ error: 'Error al iniciar la obtención de datos', details: err?.message });
  }
});

// GET /api/s123/status/:jobId
router.get('/status/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  const { id, status, total, fetched, withAttachments, attachmentsDownloaded, attachmentsTotal, errors, cancelRequested, fromCache, caCode } = job;
  res.json({ id, status, total, fetched, withAttachments, attachmentsDownloaded, attachmentsTotal, errors, cancelRequested, fromCache, caCode });
});

// POST /api/s123/cancel/:jobId -> request cancellation of a running job
router.post('/cancel/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  requestCancel(job.id);
  return res.json({ ok: true, cancelRequested: true });
});

// GET /api/s123/preview/:jobId?page=1&pageSize=25
router.get('/preview/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.max(1, parseInt(req.query.pageSize || '25', 10));

  // 1. Try to get rich data from SQLite (for Accordion view)
  if (job.caCode) {
    let records = getLocalRecords(job.caCode);

    // Apply saved filters if they exist
    if (job.lastFilters) {
      console.log('[preview] Aplicando filtros guardados:', JSON.stringify(job.lastFilters));
      // Need to map records to a format compatible with filterRecords if necessary
      // filterRecords expects objects with keys matching the filter logic (snake_case mostly)
      // getLocalRecords returns snake_case objects directly from DB, so it should work.
      // However, getLocalRecords returns raw DB rows. filterRecords logic handles this.
      const { filtered } = filterRecords(records, job.lastFilters);
      records = filtered;
    }

    if (records && records.length > 0) {
      const total = records.length;
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, total);

      const pageRows = records.slice(start, end).map(r => {
        const parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
        const photos = getLocalPhotos(r.globalid); // Fetch photos for this record

        // Map DB fields to frontend expected fields (snake_case)
        return {
          objectid: r.objectid,
          globalid: r.globalid,
          codigo_accion: r.codigo_accion,
          otro_ca: r.otro_ca,
          fecha: r.fecha,
          norte: r.norte,
          este: r.este,
          zona: r.zona,
          altitud: r.altitud,
          componente: r.componente,
          tipo_componente: r.tipo_componente,
          nombre_supervisor: r.nombre_supervisor,
          modalidad: r.modalidad,
          actividad: r.actividad,
          instalacion_referencia: r.instalacion_referencia,
          nom_pto_ppc: r.nom_pto_ppc,
          num_pto_muestreo: r.num_pto_muestreo,
          nom_pto_muestreo: r.nom_pto_muestreo,
          descrip_1: r.descrip_1,
          hecho_detec_1: r.hecho_detec_1,
          descrip_2: r.descrip_2,
          guid: r.guid,
          created_user: r.created_user,
          created_date: r.created_date,
          last_edited_user: r.last_edited_user,
          last_edited_date: r.last_edited_date,

          // Include related arrays for Accordion
          _related_layer1: parsed._related_layer1 || [],
          _related_layer2: parsed._related_layer2 || [],
          _photos: photos || [] // Include photos
        };
      });

      // Get fields from first record
      const fields = pageRows.length > 0 ? Object.keys(pageRows[0]) : [];
      return res.json({ rows: pageRows, fields, page, pageSize, total });
    }
  }

  // 2. Fallback to CSV (Legacy/Custom WHERE)
  // Si el CSV aún no está listo, devolver 202 Accepted para evitar errores ruidosos en consola
  if (!fs.existsSync(job.csvPath)) {
    return res.status(202).json({ preparing: true, rows: [], fields: [], page, pageSize, total: 0 });
  }

  // Nota: Para preview simple, cargamos todo el CSV en memoria y devolvemos la página.
  // En etapas posteriores, migrar a lectura por streams para grandes volúmenes.
  const csv = fs.readFileSync(job.csvPath, 'utf8');
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return res.json({ rows: [], page, pageSize, total: 0 });

  const rawHeader = parseCSVLine(lines[0]);
  const header = rawHeader.map((h) => stripQuotes(h));
  const rowsArray = lines.slice(1).map((l) => parseCSVLine(l).map(stripQuotes));
  const total = rowsArray.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageRows = rowsArray.slice(start, end).map(cols => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = cols[idx]; });
    return obj;
  });
  res.json({ rows: pageRows, fields: header, page, pageSize, total });
});

// POST /api/s123/apply-filters { jobId, supervisors: string[], dateFrom, dateTo }
router.post('/apply-filters', validateJobAccessBody, async (req, res) => {
  try {
    console.log('[apply-filters] Body:', JSON.stringify(req.body));
    const { jobId, supervisor, supervisors, dateFrom, dateTo } = req.body || {};
    // Advanced filters payload
    const isAdvanced = req.body?.advanced === true || req.body?.advanced === 'true';
    const advancedFilters = Array.isArray(req.body?.advancedFilters) ? req.body.advancedFilters : [];
    // New fields: arrays of strings
    const tipoDeReporteList = Array.isArray(req.body?.tipoDeReporte)
      ? req.body.tipoDeReporte.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const subcomponenteList = Array.isArray(req.body?.subcomponente)
      ? req.body.subcomponente.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const componenteList = Array.isArray(req.body?.componente)
      ? req.body.componente.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const tipoComponenteList = Array.isArray(req.body?.tipoComponente)
      ? req.body.tipoComponente.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const actividadList = Array.isArray(req.body?.actividad)
      ? req.body.actividad.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const instalacionList = Array.isArray(req.body?.instalacionReferencia)
      ? req.body.instalacionReferencia.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const hechoList = Array.isArray(req.body?.hechoDetectado)
      ? req.body.hechoDetectado.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const descrip1List = Array.isArray(req.body?.descrip1)
      ? req.body.descrip1.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const job = await getJob(jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });

    // Save filters to job state for use in GET endpoints (preview, export)
    job.lastFilters = req.body;

    if (!fs.existsSync(job.originalCsvPath)) return res.status(400).json({ error: 'CSV original no disponible' });

    const csv = fs.readFileSync(job.originalCsvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) {
      fs.writeFileSync(job.csvPath, '', 'utf8');
      return res.json({ total: 0, filtered: 0 });
    }

    const headerRaw = parseCSVLine(lines[0]);
    const header = headerRaw.map(stripQuotes);
    const headerLower = header.map((h) => String(h || '').toLowerCase());
    const rows = lines.slice(1).map((l) => {
      const cols = parseCSVLine(l).map(stripQuotes);
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return obj;
    });

    // Identify columns using canonical names (logic moved to filterRecords, but we need keys for CSV export)
    // We let filterRecords handle the filtering
    const { filtered, stats } = filterRecords(rows, req.body);

    const outCsv = buildCSV(header, filtered);
    fs.writeFileSync(job.csvPath, outCsv, 'utf8');
    return res.json({ total: rows.length, filtered: filtered.length, ...stats });
  } catch (err) {
    console.error('[apply-filters] Error:', err);
    return res.status(500).json({ error: 'Error al aplicar filtros', details: err?.message });
  }
});

// POST /api/s123/filtered-records -> returns filtered records as JSON (for map visualization)
router.post('/filtered-records', validateJobAccessBody, async (req, res) => {
  try {
    console.log('[filtered-records] Body recibido:', JSON.stringify(req.body));
    const { jobId, supervisor, supervisors, dateFrom, dateTo } = req.body || {};
    console.log('[filtered-records] jobId extraído:', jobId);
    const isAdvanced = req.body?.advanced === true || req.body?.advanced === 'true';
    const advancedFilters = Array.isArray(req.body?.advancedFilters) ? req.body.advancedFilters : [];
    const tipoDeReporteList = Array.isArray(req.body?.tipoDeReporte)
      ? req.body.tipoDeReporte.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const subcomponenteList = Array.isArray(req.body?.subcomponente)
      ? req.body.subcomponente.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const job = await getJob(jobId, req.user.id);
    console.log('[filtered-records] Job encontrado:', job ? `${job.id} (fromCache: ${job.fromCache}, caCode: ${job.caCode})` : 'null');
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });

    let rows = [];
    let csvPath = job.originalCsvPath; // Default to original CSV path

    // Intentar leer desde SQLite si hay caCode (más robusto que confiar solo en fromCache)
    if (job.caCode) {
      console.log('[filtered-records] Intentando leer desde SQLite para CA:', job.caCode);
      const records = getLocalRecords(job.caCode);

      // Convertir registros a formato compatible
      // Convertir registros a formato compatible
      rows = records.map(r => {
        const parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
        const ret = {
          // Canonical fields only
          objectid: r.objectid,
          globalid: r.globalid,
          codigo_accion: r.codigo_accion,
          otro_ca: r.otro_ca,
          fecha_hora: r.fecha, // Map DB 'fecha' to canonical 'fecha_hora'
          nombre_supervisor: r.nombre_supervisor,
          componente: r.componente,
          tipo_componente: r.tipo_componente,
          actividad: r.actividad,
          instalacion_referencia: r.instalacion_referencia,
          hecho_detectado: r.hecho_detectado,
          tipo_de_reporte: r.tipo_de_reporte,
          subcomponente: r.subcomponente,

          // Additional fields
          norte: r.norte,
          este: r.este,
          zona: r.zona,
          altitud: r.altitud,
          nom_pto_muestreo: r.nom_pto_muestreo,
          num_pto_muestreo: r.numero_punto, // Map DB 'numero_punto' to canonical 'num_pto_muestreo'

          // Descriptions
          descrip_1: r.descrip_1,
          descrip_2: r.descrip_2,

          // System fields (hidden in UI but present in data)
          created_user: r.created_user,
          created_date: r.created_date,
          last_edited_user: r.last_edited_user,
          last_edited_date: r.last_edited_date,

          // Flattened JSON fields if needed, but prioritize DB columns
          // ...parsed REMOVED to avoid duplicates and old fields

          // Explicitly include related arrays for Master-Detail view
          _related_layer1: parsed._related_layer1 || [],
          _related_layer2: parsed._related_layer2 || [],

          // Include photos for map sidebar display
          _photos: getLocalPhotos(r.globalid)
        };
        // Remove raw_json and internal fields from final object
        delete ret.raw_json;
        delete ret._layer0_oid;
        delete ret._layer1_oid;
        delete ret._layer1_oids;
        delete ret.checksum;
        delete ret.synced_at;
        return ret;
      });
    }

    if (rows.length === 0) { // If no records from SQLite, try CSV
      if (!fs.existsSync(csvPath)) {
        // Si no existe el CSV y no hay registros en SQLite, asumimos que es una búsqueda sin resultados
        // en lugar de un error. Esto evita el bucle infinito en el frontend.
        console.log('[filtered-records] CSV no encontrado y sin registros en DB. Retornando lista vacía.');
        return res.json({ records: [], total: 0, filtered: 0 });
      }

      const csv = fs.readFileSync(csvPath, 'utf8');
      const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length === 0) {
        return res.json({ records: [] });
      }

      const headerRaw = parseCSVLine(lines[0]);
      const header = headerRaw.map(stripQuotes);
      rows = lines.slice(1).map((l) => {
        const cols = parseCSVLine(l).map(stripQuotes);
        const obj = {};
        header.forEach((h, i) => { obj[h] = cols[i]; });
        return obj;
      });
    }

    // APLICAR FILTROS (Shared Logic)
    const { filtered, stats } = filterRecords(rows, req.body);
    console.log(`[filtered-records] Total: ${rows.length}, Filtrados: ${filtered.length}`);

    return res.json({ records: filtered, total: rows.length, filtered: filtered.length });
  } catch (err) {
    console.error('[filtered-records] Error:', err);
    return res.status(500).json({ error: 'Error al obtener registros filtrados', details: err?.message });
  }
});

/**
 * Lógica compartida de filtrado
 * @param {Array} rows - Array de objetos a filtrar
 * @param {Object} filters - Body del request con los filtros
 */
function filterRecords(rows, filters) {
  const { supervisor, supervisors, dateFrom, dateTo } = filters || {};
  const isAdvanced = filters?.advanced === true || filters?.advanced === 'true';
  const advancedFilters = Array.isArray(filters?.advancedFilters) ? filters.advancedFilters : [];

  // Listas de filtros dinámicos
  const getList = (key) => Array.isArray(filters?.[key])
    ? filters[key].map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const componenteList = getList('componente');
  const tipoComponenteList = getList('tipoComponente');
  const actividadList = getList('actividad');
  const instalacionList = getList('instalacionReferencia');
  const hechoList = getList('hechoDetectado');
  const descrip1List = getList('descrip1');

  if (rows.length === 0) return { filtered: [], stats: {} };

  // Identificar columnas (keys) en el primer registro (o keys de todos si es inconsistente, pero asumimos consistencia)
  const keys = Object.keys(rows[0]);
  const keysLower = keys.map(k => k.toLowerCase());

  const findCol = (candidates) => {
    for (const c of candidates) {
      const idx = keysLower.indexOf(c.toLowerCase());
      if (idx !== -1) return keys[idx];
      const partialIdx = keysLower.findIndex(h => h.includes(c.toLowerCase()));
      if (partialIdx !== -1) return keys[partialIdx];
    }
    return null;
  };

  const supKey = findCol(['nombre_supervisor', 'supervisor', 'supervision']);
  const dateKey = findCol(['fecha_hora', 'fecha', 'date', 'created_date']);
  const componenteKey = findCol(['componente', 'locacion']);
  const tipoComponenteKey = findCol(['tipo_componente']);
  const actividadKey = findCol(['actividad']);
  const instalacionKey = findCol(['instalacion_referencia']);
  const hechoKey = findCol(['hecho_detectado', 'hecho_detec', 'hecho_detec_1']);
  const descrip1Key = findCol(['descrip_1', 'descripcion_1']);

  // console.log('[filterRecords] Keys identified:', { supKey, dateKey, componenteKey, tipoComponenteKey });

  const from = parseDateLoose(dateFrom);
  const to = parseDateLoose(dateTo);
  const supNeedle = typeof supervisor === 'string' && supervisor.trim() ? supervisor.trim().toLowerCase() : null;
  const supNeedles = Array.isArray(supervisors)
    ? supervisors.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
    : [];

  let filtered = rows;

  if (isAdvanced && advancedFilters.length > 0) {
    // Lógica avanzada (OR entre grupos, AND dentro de grupo)
    const parseHHMM = (s) => {
      if (!s) return null;
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
      if (!m) return null;
      let hh = parseInt(m[1], 10);
      let mm = parseInt(m[2], 10);
      if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
      return [hh, mm];
    };

    const groups = advancedFilters.map((g) => {
      const supLower = String(g?.supervisor || '').trim().toLowerCase();
      const ranges = Array.isArray(g?.ranges) ? g.ranges : [];
      const normRanges = [];
      for (const r of ranges) {
        const ds = String(r?.date || '').trim();
        const fromHM = parseHHMM(r?.from);
        const toHM = parseHHMM(r?.to);
        if (!ds) continue;
        const d = parseDateLoose(ds);
        if (!d) continue;
        let start, end;
        if (fromHM && toHM) {
          start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), fromHM[0], fromHM[1], 0, 0);
          end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), toHM[0], toHM[1], 59, 999);
        } else if (!r?.from && !r?.to) {
          start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
          end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        } else {
          continue;
        }
        if (start > end) continue;
        normRanges.push({ start, end });
      }
      return { supLower, ranges: normRanges };
    }).filter((g) => (g.supLower || '').length > 0 || g.ranges.length > 0);

    if (groups.length > 0) {
      filtered = rows.filter((r) => {
        if (!supKey && !dateKey) return false;
        const rowSup = supKey ? String(r[supKey] ?? '').toLowerCase() : '';
        const rowDate = dateKey ? parseDateLoose(r[dateKey]) : null;

        for (const g of groups) {
          // Check supervisor
          if (g.supLower && (!rowSup || !rowSup.includes(g.supLower))) continue;
          // Check ranges
          if (g.ranges.length === 0) return true; // Match if only supervisor specified
          if (!rowDate) continue;
          for (const w of g.ranges) {
            if (rowDate >= w.start && rowDate <= w.end) return true;
          }
        }
        return false;
      });
    }
  } else {
    // Lógica básica
    if (supKey) {
      if (supNeedles.length > 0) {
        filtered = filtered.filter((r) => {
          const v = String(r[supKey] ?? '').toLowerCase();
          return supNeedles.some((needle) => v.includes(needle));
        });
      } else if (supNeedle) {
        filtered = filtered.filter((r) => String(r[supKey] ?? '').toLowerCase().includes(supNeedle));
      }
    }

    if ((from || to) && dateKey) {
      filtered = filtered.filter((r) => {
        const d = parseDateLoose(r[dateKey]);
        if (!d) return false;
        if (from && d < from) return false;
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
        return true;
      });
    }
  }

  // Filtros dinámicos (AND)
  // normalizeForCompare: normaliza underscores a espacios para comparación consistente
  const normalizeForCompare = (str) => String(str ?? '').toLowerCase().replace(/_/g, ' ');
  
  const applyDynamicFilter = (key, list, normalize = false) => {
    if (key && list.length > 0) {
      filtered = filtered.filter((r) => {
        const v = normalize 
          ? normalizeForCompare(r[key])
          : String(r[key] ?? '').toLowerCase();
        return list.some((needle) => {
          const n = normalize ? normalizeForCompare(needle) : needle;
          return v.includes(n);
        });
      });
    }
  };

  applyDynamicFilter(componenteKey, componenteList);
  applyDynamicFilter(tipoComponenteKey, tipoComponenteList);
  applyDynamicFilter(actividadKey, actividadList);
  applyDynamicFilter(instalacionKey, instalacionList);
  // hecho_detectado necesita normalización porque unique-values reemplaza _ por espacios
  applyDynamicFilter(hechoKey, hechoList, true);
  applyDynamicFilter(descrip1Key, descrip1List);

  return { filtered, stats: { supKey, dateKey } };
}

// GET /api/s123/raw-excel/:jobId -> download full raw table as real XLSX
router.get('/raw-excel/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  if (!fs.existsSync(job.originalCsvPath)) return res.status(400).json({ error: 'CSV no disponible aún' });

  const csv = fs.readFileSync(job.originalCsvPath, 'utf8');
  const lines = csv.split(/\r?\n/).filter(line => line.length > 0);

  const parseCSVLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const stripQuotes = (s) => {
    const t = String(s ?? '');
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
    return t;
  };

  // Helper to format dates
  const formatDate = (val) => {
    if (!val) return '';
    // If it's a number (timestamp)
    if (typeof val === 'number' || !isNaN(Number(val))) {
      const d = new Date(Number(val));
      if (isNaN(d.getTime())) return val;
      return d.toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return val;
  };

  // Build AOA (Array of Arrays) for SheetJS
  let aoa = [];
  if (lines.length > 0) {
    const header = parseCSVLine(lines[0]).map((h) => stripQuotes(h));
    aoa.push(header);

    // Identify date columns
    const dateCols = ['fecha', 'created_date', 'last_edited_date', 'CreationDate', 'EditDate'];
    const dateIndices = header.map((h, i) => dateCols.includes(h) ? i : -1).filter(i => i !== -1);

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]).map(stripQuotes);
      // Format dates
      dateIndices.forEach(idx => {
        if (row[idx]) row[idx] = formatDate(row[idx]);
      });
      aoa.push(row);
    }
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');

  // Write to buffer as .xlsx
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tabla_cruda.xlsx"');
  return res.send(buf);
});

// GET /api/s123/filtered-excel/:jobId -> download filtered table (A) as real XLSX (Multi-row format)
router.get('/filtered-excel/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  if (!fs.existsSync(job.csvPath)) return res.status(400).json({ error: 'CSV filtrado no disponible aún' });

  // Read filtered CSV (which currently has flattened/concatenated data, but we need the raw structure to do this right)
  // Actually, the CSV might not have the array data if it was flattened. 
  // We should rely on the SQLite cache or re-fetch if possible, but for now let's try to reconstruct or use the raw_json if available.
  // WAIT: The user wants the Excel to have multiple rows. The current CSV is flat.
  // If we rely on `job.csvPath`, we only have the flat data.
  // We need to fetch the full enriched data again or use the local DB records which have `raw_json`.

  try {
    let records = [];
    if (job.caCode) {
      // Best source: SQLite records which have the full structure in raw_json (if we saved it)
      // Actually, `arcgisSync.js` saves `raw_json`. Let's use that.
      const localRecords = getLocalRecords(job.caCode);

      // Apply saved filters if they exist
      let filteredLocal = localRecords;
      if (job.lastFilters) {
        console.log('[filtered-excel] Aplicando filtros guardados');
        const { filtered } = filterRecords(localRecords, job.lastFilters);
        filteredLocal = filtered;
      }

      records = filteredLocal.map(r => {
        try { return JSON.parse(r.raw_json); } catch { return {}; }
      });
    } else {
      // Fallback: Read CSV (this will lack the related arrays if they weren't saved to CSV)
      // This might be a limitation if we don't have the arrays.
      // However, in the previous step we updated `fetchEnrichedRecords` to include `_related_layer1` etc.
      // But `s123.js` normalizedRecords might have stripped them or stringified them?
      // Let's check `normalizedRecords` in the `fetch` endpoint. 
      // It seems we didn't explicitly save the arrays to the CSV columns in the previous `s123.js` code, 
      // we only saved the flattened fields.
      // SO: We must rely on `getLocalRecords` (SQLite) which stores `raw_json`.
      // If `job.caCode` is missing (e.g. custom WHERE), we might be in trouble if we didn't save `raw_json` for those?
      // But `fetch` saves to `arcgis_records` now? No, `fetch` in `s123.js` writes to CSV.
      // `arcgisSync.js` writes to DB.
      // If the user used "Obtener datos" (fetch), it goes through `s123.js`.
      // `s123.js` `fetch` endpoint calls `fetchEnrichedRecords` and then writes to CSV.
      // It DOES NOT write to SQLite unless `arcgisSync` is used.
      // BUT `DataVisualizationPage` uses `/api/s123/fetch-cached` which uses `syncRecords` (SQLite).
      // So `job.caCode` should be present for the main workflow.

      if (!job.caCode) {
        // If it's a raw fetch (custom WHERE), we might need to re-read the original CSV 
        // and hope it has the data, or accept we can't do multi-row easily without the arrays.
        // For now, let's assume the standard workflow (CA Code).
        const csv = fs.readFileSync(job.csvPath, 'utf8');
        // ... parse CSV ...
        // This fallback is weak for multi-row. Let's focus on the SQLite path.
      }
    }

    // If we have no records from DB, try to parse CSV but it will be flat.
    if (records.length === 0 && fs.existsSync(job.csvPath)) {
      const csv = fs.readFileSync(job.csvPath, 'utf8');
      const lines = csv.split(/\r?\n/).filter(l => l.length > 0);
      // ... basic parsing ...
      // If we only have flat data, we can't do multi-row expansion. 
      // We'll just export the flat file but clean columns.
    }

    // Build Multi-row AOA
    let aoa = [];

    // Define headers
    // Parent columns
    const parentCols = [
      'FECHA_HORA', 'SUPERVISOR', 'CA', 'OTRO_CA', 'MODALIDAD', 'ACTIVIDAD',
      'COMPONENTE', 'TIPO_COMPONENTE', 'INSTALACION_REFERENCIA',
      'NOM_PTO_PPC', 'NUM_PTO_MUESTREO', 'NORTE', 'ESTE', 'ZONA', 'ALTITUD'
    ];
    // Child columns (Layer 1 - Descriptions)
    const child1Cols = ['DESCRIP_1', 'GUID'];
    // Child columns (Layer 2 - Facts)
    const child2Cols = ['HECHO_DETEC_1', 'DESCRIP_2'];

    const allHeaders = [...parentCols, ...child1Cols, ...child2Cols];
    aoa.push(allHeaders);

    for (const rec of records) {
      // Get related arrays
      const r1 = Array.isArray(rec._related_layer1) ? rec._related_layer1 : [];
      const r2 = Array.isArray(rec._related_layer2) ? rec._related_layer2 : [];

      const maxRows = Math.max(1, r1.length, r2.length);

      for (let i = 0; i < maxRows; i++) {
        const row = [];

        // Parent Data: Only in the first row (i===0)
        if (i === 0) {
          parentCols.forEach(col => row.push(rec[col] || ''));
        } else {
          parentCols.forEach(() => row.push('')); // Empty for subsequent rows
        }

        // Child 1 Data
        if (i < r1.length) {
          child1Cols.forEach(col => row.push(r1[i][col] || ''));
        } else {
          child1Cols.forEach(() => row.push(''));
        }

        // Child 2 Data
        if (i < r2.length) {
          child2Cols.forEach(col => row.push(r2[i][col] || ''));
        } else {
          child2Cols.forEach(() => row.push(''));
        }

        aoa.push(row);
      }
    }

    // If records was empty (fallback to CSV flat), we need to handle that?
    // Let's assume for this task we are using the cached/synced data which is the standard.
    // If records is empty, we might return an empty excel or the flat one.
    if (records.length === 0) {
      // Fallback to flat CSV read if DB failed
      const csv = fs.readFileSync(job.csvPath, 'utf8');
      const lines = csv.split(/\r?\n/).filter(l => l.length > 0);
      if (lines.length > 0) {
        const h = parseCSVLine(lines[0]).map(stripQuotes);
        aoa = [h];
        for (let i = 1; i < lines.length; i++) aoa.push(parseCSVLine(lines[i]).map(stripQuotes));
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="tabla_filtrada.xlsx"');
    return res.send(buf);

  } catch (err) {
    console.error('[filtered-excel] Error:', err);
    res.status(500).json({ error: 'Error generando Excel', details: err.message });
  }
});

// ========================================
// HELPERS PARA SERVIR FOTOS DESDE SQLITE
// ========================================

function handlePhotosFromCache(job, page, pageSize, res) {
  try {
    // Leer CSV para obtener globalids
    if (!job.csvPath || !fs.existsSync(job.csvPath)) {
      return res.json({ groups: [], page: 1, pageSize: 30, total: 0 });
    }

    const csv = fs.readFileSync(job.csvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) {
      return res.json({ groups: [], page: 1, pageSize: 30, total: 0 });
    }

    const rawHeader = parseCSVLine(lines[0]);
    const header = rawHeader.map((h) => stripQuotes(h));
    const gidKey = header.find((h) => h && h.toLowerCase() === 'globalid');

    if (!gidKey) {
      return res.json({ groups: [], page: 1, pageSize: 30, total: 0 });
    }

    // Construir rowsByGid para metadata
    const rowsByGid = new Map();
    const globalids = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map((v) => stripQuotes(v));
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      const gval = obj[gidKey];
      if (gval != null) {
        const gidLower = String(gval).toLowerCase();
        rowsByGid.set(gidLower, obj);
        globalids.push(gval);
      }
    }

    // Paginación
    const total = globalids.length;
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageGlobalids = globalids.slice(start, end);

    // Construir grupos desde SQLite
    const isImage = (file) => /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file);

    const groups = pageGlobalids.map((gid) => {
      const photos = getLocalPhotos(gid);
      const activePhotos = photos.filter(p => p.is_deleted === 0 && isImage(p.filename));
      const first = activePhotos[0]?.filename || null;
      const meta = rowsByGid.get(String(gid).toLowerCase()) || null;

      return {
        globalid: gid,
        count: activePhotos.length,
        first,
        firstUrl: first ? `/api/s123/photo/${job.id}/${encodeURIComponent(gid)}/${encodeURIComponent(first)}` : null,
        meta,
      };
    });

    res.json({ groups, page, pageSize, total });
  } catch (error) {
    console.error('[handlePhotosFromCache] Error:', error);
    res.status(500).json({ error: 'Error leyendo fotos desde caché' });
  }
}

function handlePhotosGidFromCache(job, gid, res) {
  try {
    const photos = getLocalPhotos(gid);
    const isImage = (file) => /(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file);
    const parseIndex = (name) => {
      const m = /foto\s*([0-9]{1,2})/i.exec(name);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    };

    const files = photos
      .filter(p => p.is_deleted === 0 && isImage(p.filename))
      .map(p => ({
        name: p.filename,
        url: `/api/s123/photo/${job.id}/${encodeURIComponent(gid)}/${encodeURIComponent(p.filename)}`,
        index: parseIndex(p.filename),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ gid, files });
  } catch (error) {
    console.error('[handlePhotosGidFromCache] Error:', error);
    res.status(500).json({ error: 'Error leyendo fotos desde caché' });
  }
}

function handlePhotoFromCache(job, gid, filename, res) {
  try {
    const photos = getLocalPhotos(gid);
    const photo = photos.find(p => p.filename === filename && p.is_deleted === 0);

    if (!photo || !photo.file_data) {
      return res.status(404).json({ error: 'Foto no encontrada en caché' });
    }

    // Content-Type por extensión
    const lower = filename.toLowerCase();
    let contentType = 'application/octet-stream';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (lower.endsWith('.png')) contentType = 'image/png';
    else if (lower.endsWith('.gif')) contentType = 'image/gif';
    else if (lower.endsWith('.webp')) contentType = 'image/webp';
    else if (lower.endsWith('.bmp')) contentType = 'image/bmp';
    else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) contentType = 'image/tiff';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 año
    res.send(photo.file_data);
  } catch (error) {
    console.error('[handlePhotoFromCache] Error:', error);
    res.status(500).json({ error: 'Error sirviendo foto desde caché' });
  }
}

// ========================================
// ENDPOINTS DE FOTOS
// ========================================

// GET /api/s123/photos/:jobId?page=1&pageSize=30
router.get('/photos/:jobId', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.max(1, parseInt(req.query.pageSize || '30', 10));

  // Si el job viene de caché SQLite, leer desde allí
  if (job.fromCache) {
    return handlePhotosFromCache(job, page, pageSize, res);
  }

  // Lógica original: leer desde filesystem
  const fotosRoot = job.fotosDir;
  if (!fs.existsSync(fotosRoot)) return res.json({ groups: [], page: 1, pageSize: 30, total: 0 });

  // Listar subcarpetas (cada una corresponde a un globalid)
  let dirs = fs.readdirSync(fotosRoot)
    .filter((name) => {
      const p = path.join(fotosRoot, name);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    })
    .sort();

  // Si hay A (csvPath) con filas, filtrar dirs a los que estén presentes en A
  try {
    if (job.csvPath && fs.existsSync(job.csvPath)) {
      const csv = fs.readFileSync(job.csvPath, 'utf8');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      if (lines.length > 1) {
        const rawHeader = parseCSVLine(lines[0]);
        const header = rawHeader.map((h) => stripQuotes(h));
        const gidKey = header.find((h) => h && h.toLowerCase() === 'globalid');
        if (gidKey) {
          const allowed = new Set(
            lines.slice(1).map((l) => {
              const cols = parseCSVLine(l).map(stripQuotes);
              const obj = {};
              header.forEach((h, idx) => { obj[h] = cols[idx]; });
              return String(obj[gidKey] ?? '').toLowerCase();
            })
          );
          if (allowed.size > 0) {
            dirs = dirs.filter((d) => allowed.has(String(d).toLowerCase()));
          }
        }
      }
    }
  } catch (_) { /* ignore filtering errors */ }

  const total = dirs.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageDirs = dirs.slice(start, end);

  const isImage = (file) => /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file);

  // Intentar leer CSV para enriquecer con metadatos por globalid
  let rowsByGid = new Map();
  try {
    if (job.csvPath && fs.existsSync(job.csvPath)) {
      const csv = fs.readFileSync(job.csvPath, 'utf8');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      if (lines.length > 1) {
        // Parser sencillo que respeta comillas
        const parseCSVLine = (line) => {
          const out = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
              else { inQuotes = !inQuotes; }
            } else if (ch === ',' && !inQuotes) {
              out.push(cur);
              cur = '';
            } else {
              cur += ch;
            }
          }
          out.push(cur);
          return out;
        };
        const stripQuotes = (s) => {
          const t = String(s ?? '');
          if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
          return t;
        };

        const rawHeader = parseCSVLine(lines[0]);
        const header = rawHeader.map((h) => stripQuotes(h));
        // Buscar columna globalid de forma case-insensitive
        const gidKey = header.find((h) => h && h.toLowerCase() === 'globalid');
        if (gidKey) {
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]).map((v) => stripQuotes(v));
            const obj = {};
            header.forEach((h, idx) => { obj[h] = cols[idx]; });
            const gval = obj[gidKey];
            if (gval != null) rowsByGid.set(String(gval).toLowerCase(), obj);
          }
        }
      }
    }
  } catch (e) {
    // Si falla la lectura del CSV, continuamos sin meta
    // console.warn('[photos route] No se pudo leer CSV para meta:', e?.message);
  }

  const groups = pageDirs.map((gid) => {
    const dir = path.join(fotosRoot, gid);
    const files = fs
      .readdirSync(dir)
      .filter((f) => fs.statSync(path.join(dir, f)).isFile() && isImage(f))
      .sort();
    const first = files[0] || null;
    const meta = rowsByGid.get(String(gid).toLowerCase()) || null;
    return {
      globalid: gid,
      count: files.length,
      first,
      firstUrl: first ? `/api/s123/photo/${job.id}/${encodeURIComponent(gid)}/${encodeURIComponent(first)}` : null,
      meta,
    };
  });

  res.json({ groups, page, pageSize, total });
});

// GET /api/s123/photos/:jobId/:gid -> list files for a specific globalid
router.get('/photos/:jobId/:gid', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  const gid = String(req.params.gid);

  // Si el job viene de caché SQLite, leer desde allí
  if (job.fromCache) {
    return handlePhotosGidFromCache(job, gid, res);
  }

  // Lógica original: leer desde filesystem
  const dir = path.join(job.fotosDir, gid);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.json({ gid, files: [] });
  }

  const isImage = (file) => /(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file);
  const parseIndex = (name) => {
    // Extract number after 'Foto' e.g. 'Foto1-xxx.jpg' => 1
    const m = /foto\s*([0-9]{1,2})/i.exec(name);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  };

  const files = fs
    .readdirSync(dir)
    .filter((f) => {
      const p = path.join(dir, f);
      return fs.existsSync(p) && fs.statSync(p).isFile() && isImage(f);
    })
    .sort()
    .map((name) => ({
      name,
      url: `/api/s123/photo/${job.id}/${encodeURIComponent(gid)}/${encodeURIComponent(name)}`,
      index: parseIndex(name),
    }));

  res.json({ gid, files });
});

// GET /api/s123/photo/:jobId/:gid/:filename
router.get('/photo/:jobId/:gid/:filename', validateJobAccess, async (req, res) => {
  const job = await getJob(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
  const gid = String(req.params.gid);
  const filename = String(req.params.filename);

  // Si el job viene de caché SQLite, servir desde allí
  if (job.fromCache) {
    return handlePhotoFromCache(job, gid, filename, res);
  }

  // Lógica original: leer desde filesystem
  const filePath = path.join(job.fotosDir, gid, filename);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(job.fotosDir + path.sep))) {
    return res.status(400).json({ error: 'Ruta inválida' });
  }
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  // Content-Type simple por extensión
  const lower = filename.toLowerCase();
  let contentType = 'application/octet-stream';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg';
  else if (lower.endsWith('.png')) contentType = 'image/png';
  else if (lower.endsWith('.gif')) contentType = 'image/gif';
  else if (lower.endsWith('.webp')) contentType = 'image/webp';
  else if (lower.endsWith('.bmp')) contentType = 'image/bmp';
  else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) contentType = 'image/tiff';

  res.setHeader('Content-Type', contentType);
  fs.createReadStream(normalized).pipe(res);
});

// POST /api/s123/generate { jobId, startNumber, outputFilename, photoPrefix, exportFormat, photoPosition, descriptionField, selectedByGid }
router.post('/generate', validateJobAccessBody, async (req, res) => {
  try {
    const { jobId, startNumber, outputFilename, photoPrefix, exportFormat, photoPosition, descriptionField, selectedByGid, selectedManyByGid } = req.body || {};
    const job = await getJob(jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });
    if (!fs.existsSync(job.csvPath)) return res.status(400).json({ error: 'CSV no disponible' });

    const csvData = fs.readFileSync(job.csvPath, 'utf8');
    // Opciones para formatos 02 y 03
    const rawFmt03Desc = req.body?.format03IncludeDescripcion;
    const rawFmt03Hall = req.body?.format03IncludeHallazgo;
    const rawFmt02Desc = req.body?.format02IncludeDescripcion;
    const rawFmt02Hall = req.body?.format02IncludeHallazgo;

    const ef = String(exportFormat || '01');
    const formatOptions = ef === '03'
      ? {
        includeDescripcion: rawFmt03Desc === undefined ? true : (rawFmt03Desc === 'true' || rawFmt03Desc === true),
        includeHallazgo: rawFmt03Hall === undefined ? true : (rawFmt03Hall === 'true' || rawFmt03Hall === true),
        includeAuto: false,
      }
      : (ef === '02'
        ? {
          includeDescripcion: rawFmt02Desc === undefined ? true : (rawFmt02Desc === 'true' || rawFmt02Desc === true),
          includeHallazgo: rawFmt02Hall === undefined ? true : (rawFmt02Hall === 'true' || rawFmt02Hall === true),
          // includeAuto por defecto true para 02 (se omite para dejar default)
        }
        : null);

    // Opciones específicas para Formato 01: sustituciones desde Excel/JSON
    const booly = (v, defVal = false) => v === true || v === 'true' ? true : v === false || v === 'false' ? false : defVal;
    let format01Options = {};

    // 01.a) Sustitución por punto (coords/descripcion) usando mapa key->campos
    const rawMap = req.body?.format01SubstitutionMap ?? req.body?.substitutionMap ?? null;
    if (rawMap && (typeof rawMap === 'object' || typeof rawMap === 'string')) {
      let parsedMap = null;
      if (typeof rawMap === 'string') {
        try { parsedMap = JSON.parse(rawMap); } catch (_) { parsedMap = null; }
      } else {
        parsedMap = rawMap;
      }
      const replaceCoords = booly(req.body?.format01ReplaceCoords ?? req.body?.replaceCoords, false);
      const replaceDescription = booly(req.body?.format01ReplaceDescription ?? req.body?.replaceDescription, false);
      if (parsedMap && typeof parsedMap === 'object') {
        format01Options.map = parsedMap;
        format01Options.replaceCoords = replaceCoords;
        format01Options.replaceDescription = replaceDescription;
      }
    }

    // 01.b) Sustitución de ALTITUD por LOCACION
    const rawAltMap = req.body?.format01AltitudeByLocationMap ?? null;
    let parsedAltMap = null;
    if (rawAltMap && (typeof rawAltMap === 'object' || typeof rawAltMap === 'string')) {
      if (typeof rawAltMap === 'string') {
        try { parsedAltMap = JSON.parse(rawAltMap); } catch (_) { parsedAltMap = null; }
      } else {
        parsedAltMap = rawAltMap;
      }
    }
    const replaceAltitudeByLocation = booly(req.body?.format01ReplaceAltitudeByLocation ?? req.body?.replaceAltitudeByLocation, false);
    if (parsedAltMap && typeof parsedAltMap === 'object') {
      format01Options.altitudeByLocationMap = parsedAltMap;
      format01Options.replaceAltitudeByLocation = replaceAltitudeByLocation === true;
    }

    // Normalizar: si no hay ninguna opción cargada, dejar como null para evitar ruido aguas abajo
    if (Object.keys(format01Options).length === 0) {
      format01Options = null;
    }

    const buffer = await generateDocument(
      csvData,
      job.fotosDir,
      Number(startNumber) || 1,
      String(outputFilename || 'documento_generado'),
      String(photoPrefix || ''),
      String(exportFormat || '01'),
      Number(photoPosition) || 1,
      String(descriptionField || 'Descripcion'),
      selectedByGid && typeof selectedByGid === 'object' ? selectedByGid : null,
      selectedManyByGid && typeof selectedManyByGid === 'object' ? selectedManyByGid : null,
      formatOptions,
      ef === '01' ? format01Options : null
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(outputFilename || 'documento_generado').replace(/\"/g, '')}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[generate] Error:', err);
    res.status(500).json({ error: 'Error al generar el documento', details: err?.message });
  }
});

// POST /api/s123/photos-zip { jobId, order?: string[] }
// Genera un ZIP con fotografías con estructura de carpetas según jerarquía solicitada
// y renombra archivos como: [componente]-[numero_punto]-NNN-fecha.<ext>
router.post('/photos-zip', validateJobAccessBody, async (req, res) => {
  try {
    const { jobId } = req.body || {};
    let order = Array.isArray(req.body?.order) ? req.body.order.map((s) => String(s).toLowerCase()) : [];
    const job = await getJob(jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado o acceso denegado' });

    // Validar CSV filtrado
    if (!job.csvPath || !fs.existsSync(job.csvPath)) {
      return res.status(400).json({ error: 'CSV filtrado no disponible. Aplique filtros primero.' });
    }

    // Leer CSV (A) para obtener filas y mapear por globalid
    const csv = fs.readFileSync(job.csvPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'CSV filtrado vacío.' });
    }

    const rawHeader = parseCSVLine(lines[0]);
    const header = rawHeader.map((h) => stripQuotes(h));
    const headerLower = header.map((h) => String(h || '').toLowerCase());

    const findKey = (candidates, contains) => {
      // candidates: array of exact-case-insensitive names to try
      for (const name of candidates || []) {
        const idx = headerLower.indexOf(String(name).toLowerCase());
        if (idx !== -1) return header[idx];
      }
      if (contains) {
        const idx = headerLower.findIndex((h) => h.includes(String(contains).toLowerCase()));
        if (idx !== -1) return header[idx];
      }
      return null;
    };

    const keyGlobalId = findKey(['globalid']);
    if (!keyGlobalId) return res.status(400).json({ error: 'No se encontró la columna GlobalID en CSV.' });
    const keyComponente = findKey(['componente'], 'locacion') || findKey(['locacion']);
    const keyNumeroPunto = findKey(['num_pto_muestreo', 'numero_punto']) || header[headerLower.findIndex((h) => h.includes('numero') && h.includes('punto'))] || null;
    const keyFecha = findKey(['fecha_hora', 'fecha', 'date']) || header[headerLower.findIndex((h) => h.includes('fecha'))] || null;
    const keySupervisor = findKey(['nombre_supervisor'], 'supervisor') || findKey(['supervision']);
    const keyTipoReporte = findKey(['tipo_de_reporte']) || header[headerLower.findIndex((h) => h.includes('tipo_de_reporte'))] || null;
    const keySubcomponente = findKey(['subcomponente']) || header[headerLower.findIndex((h) => h.includes('subcomponente'))] || null;
    const keyActividad = findKey(['actividad']);
    const keyHecho = findKey(['hecho_detectado', 'hecho_detec', 'hecho_detec_1']);

    // Orden de carpetas por defecto si no se especifica o está vacía
    const allowed = ['componente', 'fecha', 'nombre_supervisor', 'tipo_de_reporte', 'subcomponente', 'actividad', 'hecho_detec_1'];
    order = order.filter((f) => allowed.includes(f));
    if (order.length === 0) order = ['componente', 'fecha', 'nombre_supervisor'];

    // Construir mapa gid -> fila
    const rowsByGid = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map((v) => stripQuotes(v));
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      const gid = String(obj[keyGlobalId] ?? '').trim();
      if (gid) rowsByGid.set(gid.toLowerCase(), obj);
    }

    // Listar carpetas de fotos por gid pero filtradas por CSV
    const fotosRoot = job.fotosDir;
    if (!fs.existsSync(fotosRoot)) return res.status(400).json({ error: 'No hay carpeta de fotos para este job.' });
    const isImage = (file) => /(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file);
    const parseIndex = (name) => {
      const m = /foto\s*([0-9]{1,3})/i.exec(name);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    };

    const gids = fs.readdirSync(fotosRoot)
      .filter((name) => {
        const p = path.join(fotosRoot, name);
        return fs.existsSync(p) && fs.statSync(p).isDirectory();
      })
      .filter((name) => rowsByGid.has(String(name).toLowerCase()))
      .sort();

    const sanitize = (s) => String(s || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .trim() || 'NA';

    const fmtDate = (v) => {
      const d = parseDateLoose(v);
      if (!d) return 'NA';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const zip = new AdmZip();

    for (const gid of gids) {
      const row = rowsByGid.get(String(gid).toLowerCase()) || {};
      const valComponente = keyComponente ? row[keyComponente] : '';
      const valFecha = keyFecha ? row[keyFecha] : '';
      const valSupervisor = keySupervisor ? row[keySupervisor] : '';
      const valNumeroPunto = keyNumeroPunto ? row[keyNumeroPunto] : '';
      const valTipoReporte = keyTipoReporte ? row[keyTipoReporte] : '';
      const valSubcomponente = keySubcomponente ? row[keySubcomponente] : '';
      const valActividad = keyActividad ? row[keyActividad] : '';
      const valHecho = keyHecho ? row[keyHecho] : '';

      const values = {
        componente: sanitize(valComponente),
        fecha: fmtDate(valFecha),
        nombre_supervisor: sanitize(valSupervisor),
        tipo_de_reporte: sanitize(valTipoReporte),
        subcomponente: sanitize(valSubcomponente),
        actividad: sanitize(valActividad),
        hecho_detec_1: sanitize(valHecho),
      };

      const dirInsideZip = order.map((f) => values[f] || 'NA').join('/');

      const srcDir = path.join(fotosRoot, gid);
      const files = fs.readdirSync(srcDir)
        .filter((f) => {
          const p = path.join(srcDir, f);
          return fs.existsSync(p) && fs.statSync(p).isFile() && isImage(f);
        })
        .sort((a, b) => {
          // Natural sort by index if present, then by name
          const ia = parseIndex(a); const ib = parseIndex(b);
          if (ia != null && ib != null && ia !== ib) return ia - ib;
          if (ia != null && ib == null) return -1;
          if (ia == null && ib != null) return 1;
          return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
        });

      let seq = 1;
      for (const fname of files) {
        const abs = path.join(srcDir, fname);
        const ext = path.extname(fname) || '.jpeg';
        const numero = String(seq).padStart(3, '0');
        const baseName = `${sanitize(valComponente)}-${sanitize(valNumeroPunto)}-${numero}-${fmtDate(valFecha)}${ext.toLowerCase()}`;
        // Añadir archivo con ruta interna (carpetas jerárquicas)
        zip.addLocalFile(abs, dirInsideZip, baseName);
        seq++;
      }
    }

    const buffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="fotografias.zip"');
    return res.send(buffer);
  } catch (err) {
    console.error('[photos-zip] Error:', err);
    return res.status(500).json({ error: 'Error al generar ZIP de fotografías', details: err?.message });
  }
});

export default router;
