/**
 * Módulo centralizado para rutas de archivos
 * Resuelve el problema de process.cwd() en Electron empaquetado
 * 
 * En desarrollo: usa rutas relativas al proyecto
 * En producción (Electron): usa APPDATA/ActasInteligentes
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Obtiene la ruta base para almacenamiento de datos
 * - En desarrollo: backend/
 * - En producción: APPDATA/ActasInteligentes/
 */
export function getBaseStoragePath() {
  if (process.env.NODE_ENV === 'production') {
    const appDataPath = process.env.APPDATA || process.env.HOME || '';
    const storagePath = path.join(appDataPath, 'ActasInteligentes');
    
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    
    return storagePath;
  }
  
  // En desarrollo, usar el directorio backend/
  return path.join(__dirname, '..');
}

/**
 * Obtiene la ruta al directorio de uploads
 * - En desarrollo: backend/uploads/
 * - En producción: APPDATA/ActasInteligentes/uploads/
 */
export function getUploadsPath() {
  const basePath = getBaseStoragePath();
  const uploadsPath = path.join(basePath, 'uploads');
  
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  
  return uploadsPath;
}

/**
 * Obtiene la ruta al directorio de jobs
 * - En desarrollo: backend/uploads/jobs/
 * - En producción: APPDATA/ActasInteligentes/uploads/jobs/
 */
export function getJobsPath() {
  const uploadsPath = getUploadsPath();
  const jobsPath = path.join(uploadsPath, 'jobs');
  
  if (!fs.existsSync(jobsPath)) {
    fs.mkdirSync(jobsPath, { recursive: true });
  }
  
  return jobsPath;
}

/**
 * Obtiene la ruta al directorio de storage (fotos sincronizadas)
 * - En desarrollo: backend/storage/
 * - En producción: APPDATA/ActasInteligentes/storage/
 */
export function getStoragePath() {
  const basePath = getBaseStoragePath();
  const storagePath = path.join(basePath, 'storage');
  
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  
  return storagePath;
}

/**
 * Resuelve una ruta relativa de foto a una ruta absoluta
 * Maneja tanto rutas absolutas como relativas (legacy)
 * 
 * @param {string} localPath - Ruta almacenada en DB (puede ser absoluta o relativa)
 * @returns {string} Ruta absoluta al archivo
 */
export function resolvePhotoPath(localPath) {
  if (!localPath) return null;
  
  // Si ya es absoluta, devolverla tal cual
  if (path.isAbsolute(localPath)) {
    return localPath;
  }
  
  // Ruta relativa - resolver desde uploads/
  return path.join(getUploadsPath(), localPath);
}

/**
 * Obtiene la ruta para un job específico
 * @param {string} jobId - ID del job
 * @returns {string} Ruta absoluta al directorio del job
 */
export function getJobPath(jobId) {
  const jobsPath = getJobsPath();
  const jobPath = path.join(jobsPath, jobId);
  
  if (!fs.existsSync(jobPath)) {
    fs.mkdirSync(jobPath, { recursive: true });
  }
  
  return jobPath;
}

// Log inicial para debugging
console.log('[paths] 📂 Base storage path:', getBaseStoragePath());
console.log('[paths] 📂 Uploads path:', getUploadsPath());
console.log('[paths] 📂 NODE_ENV:', process.env.NODE_ENV);

export default {
  getBaseStoragePath,
  getUploadsPath,
  getJobsPath,
  getStoragePath,
  resolvePhotoPath,
  getJobPath
};
