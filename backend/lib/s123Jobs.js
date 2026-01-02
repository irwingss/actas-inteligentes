import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { query, run, get } from '../db/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow override of base directory via env var when running inside packaged Electron app.
// Fallback to project-relative path during development.
const DEFAULT_BASE_DIR = path.join(__dirname, '..', 'uploads', 's123');
const BASE_DIR = (process.env.S123_BASE_DIR && String(process.env.S123_BASE_DIR).trim())
  ? String(process.env.S123_BASE_DIR).trim()
  : DEFAULT_BASE_DIR;
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

// Caché en memoria para acceso rápido (se sincroniza con DB)
const jobs = new Map();

async function createJob(where, meta = {}) {
  const { userId, caCode } = meta;
  
  if (!userId) {
    throw new Error('userId is required to create a job');
  }
  
  const jobId = uuidv4();
  const jobDir = path.join(BASE_DIR, userId, jobId); // Organizar por usuario
  const fotosDir = path.join(jobDir, 'fotos');
  fs.mkdirSync(jobDir, { recursive: true });
  fs.mkdirSync(fotosDir, { recursive: true });

  const job = {
    id: jobId,
    userId,
    caCode: caCode || null,
    where,
    createdAt: Date.now(),
    status: 'pending', // pending|running|completed|error
    cancelRequested: false,
    total: 0,
    fetched: 0,
    withAttachments: 0,
    attachmentsDownloaded: 0,
    originalCsvPath: path.join(jobDir, 'data_z.csv'),
    csvPath: path.join(jobDir, 'data.csv'),
    previewPath: path.join(jobDir, 'preview.json'),
    jobDir,
    fotosDir,
    errors: [],
    fromCache: meta.fromCache || false,
  };
  
  // Guardar en DB
  try {
    await run(
      `INSERT INTO s123_jobs (
        id, user_id, ca_code, where_clause, status, 
        job_dir, fotos_dir, original_csv_path, csv_path, preview_path,
        errors, from_cache
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId, userId, job.caCode, where, job.status,
        jobDir, fotosDir, job.originalCsvPath, job.csvPath, job.previewPath,
        JSON.stringify([]), job.fromCache ? 1 : 0
      ]
    );
  } catch (error) {
    console.error('[s123Jobs] Error saving job to DB:', error);
    // Continuar con caché en memoria aunque falle la DB
  }
  
  // Guardar en caché de memoria
  jobs.set(jobId, job);
  return job;
}

async function getJob(jobId, userId = null) {
  // Intentar desde caché primero
  let job = jobs.get(jobId);
  
  // Si no está en caché, buscar en DB
  if (!job) {
    try {
      const result = await get(
        'SELECT * FROM s123_jobs WHERE id = ?' + (userId ? ' AND user_id = ?' : ''),
        userId ? [jobId, userId] : [jobId]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        job = {
          id: row.id,
          userId: row.user_id,
          caCode: row.ca_code,
          where: row.where_clause,
          status: row.status,
          cancelRequested: false,
          total: row.total || 0,
          fetched: row.fetched || 0,
          withAttachments: row.with_attachments || 0,
          attachmentsDownloaded: row.attachments_downloaded || 0,
          originalCsvPath: row.original_csv_path,
          csvPath: row.csv_path,
          previewPath: row.preview_path,
          jobDir: row.job_dir,
          fotosDir: row.fotos_dir,
          errors: JSON.parse(row.errors || '[]'),
          fromCache: row.from_cache === 1,
          createdAt: new Date(row.created_at).getTime(),
        };
        // Guardar en caché
        jobs.set(jobId, job);
      }
    } catch (error) {
      console.error('[s123Jobs] Error loading job from DB:', error);
    }
  }
  
  // Verificar permisos si se proporciona userId
  if (job && userId && job.userId !== userId) {
    return null; // Usuario no tiene acceso a este job
  }
  
  return job;
}

async function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, updates);
  
  // Actualizar en DB
  try {
    const fields = [];
    const values = [];
    
    if ('status' in updates) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if ('total' in updates) {
      fields.push('total = ?');
      values.push(updates.total);
    }
    if ('fetched' in updates) {
      fields.push('fetched = ?');
      values.push(updates.fetched);
    }
    if ('withAttachments' in updates) {
      fields.push('with_attachments = ?');
      values.push(updates.withAttachments);
    }
    if ('attachmentsDownloaded' in updates) {
      fields.push('attachments_downloaded = ?');
      values.push(updates.attachmentsDownloaded);
    }
    if ('errors' in updates) {
      fields.push('errors = ?');
      values.push(JSON.stringify(updates.errors));
    }
    if ('fromCache' in updates) {
      fields.push('from_cache = ?');
      values.push(updates.fromCache ? 1 : 0);
    }
    if ('csvPath' in updates) {
      fields.push('csv_path = ?');
      values.push(updates.csvPath);
    }
    if ('fotosDir' in updates) {
      fields.push('fotos_dir = ?');
      values.push(updates.fotosDir);
    }
    
    if (fields.length > 0) {
      values.push(jobId);
      await run(
        `UPDATE s123_jobs SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
  } catch (error) {
    console.error('[s123Jobs] Error updating job in DB:', error);
  }
  
  return job;
}

async function addError(jobId, err) {
  const job = jobs.get(jobId);
  if (!job) return null;
  const msg = typeof err === 'string' ? err : (err?.message || 'Error');
  job.errors.push(msg);
  
  // Actualizar en DB
  try {
    await run(
      'UPDATE s123_jobs SET errors = ? WHERE id = ?',
      [JSON.stringify(job.errors), jobId]
    );
  } catch (error) {
    console.error('[s123Jobs] Error updating errors in DB:', error);
  }
  
  return job;
}

function requestCancel(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.cancelRequested = true;
  return job;
}

// Limpieza de jobs expirados (>24h)
setInterval(async () => {
  try {
    // Obtener jobs expirados de la DB
    const expiredJobs = await query(
      "SELECT id, job_dir FROM s123_jobs WHERE datetime(expires_at) < datetime('now')"
    );
    
    for (const row of expiredJobs.rows) {
      // Eliminar carpeta del filesystem
      try {
        if (fs.existsSync(row.job_dir)) {
          fs.rmSync(row.job_dir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error(`[s123Jobs] Error deleting job dir ${row.job_dir}:`, err);
      }
      
      // Eliminar de caché en memoria
      jobs.delete(row.id);
    }
    
    // Eliminar de la DB
    if (expiredJobs.rows.length > 0) {
      await run("DELETE FROM s123_jobs WHERE datetime(expires_at) < datetime('now')");
      console.log(`[s123Jobs] Cleaned up ${expiredJobs.rows.length} expired jobs`);
    }
  } catch (error) {
    console.error('[s123Jobs] Error in cleanup interval:', error);
  }
}, 60 * 60 * 1000).unref();

export {
  createJob,
  getJob,
  updateJob,
  addError,
  requestCancel,
};
