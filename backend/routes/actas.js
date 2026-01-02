import express from 'express'
import pool, { query, run, get, ensureDb, prepare } from '../db/config.js'
import { authenticate } from '../middleware/auth.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getGeminiApiKey, getGeminiModel, getGeminiModelExpert } from '../services/aiConfigService.js'
import { enrichTextWithRAG, listFileSearchStores, createFileSearchStore, uploadFileToStore, listDocumentsInStore, deleteDocument } from '../lib/fileSearchService.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { marked } from 'marked'
import { generateActaWord } from '../lib/acta-generator/index.js'
import { getLocalPhotos } from '../lib/arcgisSync.js'
import { renderAnnotationsOnImage } from '../lib/annotation-renderer.js'

// Configurar multer para upload de PDFs del RAG
const ragUpload = multer({ 
  dest: 'uploads/rag-temp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos PDF, TXT o DOC'), false)
    }
  }
})

// SDK de Gemini - se inicializa lazy para usar config centralizada
let _genAI = null
let _genAI3 = null

async function getGenAI() {
  const apiKey = await getGeminiApiKey()
  if (!_genAI || _genAI._apiKey !== apiKey) {
    _genAI = new GoogleGenerativeAI(apiKey)
    _genAI._apiKey = apiKey
  }
  return _genAI
}

async function getGenAI3() {
  const apiKey = await getGeminiApiKey()
  if (!_genAI3 || _genAI3._apiKey !== apiKey) {
    _genAI3 = new GoogleGenAI({ apiKey })
    _genAI3._apiKey = apiKey
  }
  return _genAI3
}

const router = express.Router()

// ============================================
// MIGRACIÓN ASYNC: Agregar columnas faltantes
// ============================================
const runMigrations = async () => {
  try {
    const db = await ensureDb()
    
    // Migrar actas_hechos
    const tableInfoResult = db.exec("PRAGMA table_info(actas_hechos)")
    const existingColumns = tableInfoResult[0]?.values?.map(row => row[1]) || []
    
    const newColumns = [
      { name: 'nivel_riesgo', type: 'TEXT' },
      { name: 'justificacion_riesgo', type: 'TEXT' },
      { name: 'impacto_potencial', type: 'TEXT' },
      { name: 'medidas_mitigacion', type: 'TEXT' },
      { name: 'fotos_seleccionadas', type: 'TEXT' },
      { name: 'entorno_afectacion', type: 'TEXT' },
      { name: 'factor_cantidad', type: 'INTEGER' },
      { name: 'factor_peligrosidad', type: 'INTEGER' },
      { name: 'factor_extension', type: 'INTEGER' },
      { name: 'factor_personas_expuestas', type: 'INTEGER' },
      { name: 'factor_medio_afectado', type: 'INTEGER' },
      { name: 'probabilidad_ocurrencia', type: 'INTEGER' },
      { name: 'score_consecuencia', type: 'INTEGER' },
      { name: 'valor_consecuencia', type: 'INTEGER' },
      { name: 'valor_riesgo', type: 'INTEGER' },
      { name: 'tipo_incumplimiento', type: 'TEXT' },
      { name: 'texto_analisis_riesgo', type: 'TEXT' }
    ]
    
    for (const col of newColumns) {
      if (!existingColumns.includes(col.name)) {
        try {
          db.run(`ALTER TABLE actas_hechos ADD COLUMN ${col.name} ${col.type}`)
          console.log(`[actas] ✅ Columna ${col.name} agregada a actas_hechos`)
        } catch (e) { /* columna ya existe */ }
      }
    }
    
    // Migrar actas_componentes
    const compInfoResult = db.exec("PRAGMA table_info(actas_componentes)")
    const existingCompCols = compInfoResult[0]?.values?.map(row => row[1]) || []
    
    const newComponenteCols = [
      { name: 'tipo_componente', type: 'TEXT' },
      { name: 'instalacion_referencia', type: 'TEXT' },
      { name: 'es_marino', type: 'INTEGER DEFAULT 0' }
    ]
    
    for (const col of newComponenteCols) {
      if (!existingCompCols.includes(col.name)) {
        try {
          db.run(`ALTER TABLE actas_componentes ADD COLUMN ${col.name} ${col.type}`)
          console.log(`[actas] ✅ Columna ${col.name} agregada a actas_componentes`)
        } catch (e) { /* columna ya existe */ }
      }
    }
    
    // Crear índice
    try {
      db.run(`CREATE INDEX IF NOT EXISTS idx_actas_componentes_globalid_origen ON actas_componentes(acta_id, globalid_origen)`)
    } catch (e) { /* índice ya existe */ }
    
    console.log('[actas] ✅ Migraciones completadas')
  } catch (e) {
    console.warn('[actas] ⚠️  Error en migraciones:', e.message)
  }
}

// Ejecutar migraciones async
runMigrations().catch(console.error)

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const aiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.3, // Más conservador para documentos técnicos
    topP: 0.9,
    maxOutputTokens: 25000, // Aumentado para descripciones detalladas
  }
})

// Aplicar autenticación a todas las rutas
router.use(authenticate)

// ============================================
// BORRADORES DE ACTAS
// ============================================

/**
 * GET /api/actas/borradores
 * Obtener todos los borradores del usuario actual
 */
router.get('/borradores', async (req, res) => {
  try {
    const userEmail = req.user?.email || 'local'
    
    const result = await query(`
      SELECT * FROM actas_borradores_resumen 
      WHERE created_by = ? OR created_by IS NULL
      ORDER BY updated_at DESC
    `, [userEmail])
    
    res.json({ success: true, borradores: result.rows })
  } catch (error) {
    console.error('[actas] Error obteniendo borradores:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/borradores/:id
 * Obtener un borrador específico con todos sus datos
 */
router.get('/borradores/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    // Obtener borrador principal
    const borradorResult = await get(`SELECT * FROM actas_borradores WHERE id = ?`, [id])
    const borrador = borradorResult.rows[0]
    
    if (!borrador) {
      return res.status(404).json({ success: false, error: 'Borrador no encontrado' })
    }

    const codigoAccion = borrador.codigo_accion
    
    // Obtener hechos
    const hechosResult = await query(`
      SELECT * FROM actas_hechos 
      WHERE acta_id = ? 
      ORDER BY numero_hecho ASC
    `, [id])
    
    // Obtener medios probatorios por hecho
    const mediosResult = await query(`
      SELECT * FROM actas_medios_probatorios 
      WHERE acta_id = ? 
      ORDER BY hecho_id, numero_foto ASC
    `, [id])
    
    // Obtener componentes
    const componentesResult = await query(`
      SELECT * FROM actas_componentes 
      WHERE acta_id = ? 
      ORDER BY numero ASC
    `, [id])
    
    // Obtener anexos
    const anexosResult = await query(`
      SELECT * FROM actas_anexos 
      WHERE acta_id = ? 
      ORDER BY numero ASC
    `, [id])
    
    // Parsear equipos GPS
    borrador.equipos_gps = JSON.parse(borrador.equipos_gps_json || '[]')
    
    res.json({
      success: true,
      borrador,
      hechos: hechosResult.rows,
      mediosProbatorios: mediosResult.rows,
      componentes: componentesResult.rows,
      anexos: anexosResult.rows
    })
  } catch (error) {
    console.error('[actas] Error obteniendo borrador:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/borradores
 * Crear un nuevo borrador de acta
 */
router.post('/borradores', async (req, res) => {
  try {
    const userEmail = req.user?.email || 'local'
    const { codigo_accion, tipo_acta, modalidad } = req.body
    
    if (!codigo_accion) {
      return res.status(400).json({ success: false, error: 'codigo_accion es requerido' })
    }
    
    const result = await run(`
      INSERT INTO actas_borradores (codigo_accion, tipo_acta, modalidad, created_by)
      VALUES (?, ?, ?, ?)
    `, [codigo_accion, tipo_acta || 'regular', modalidad || 'B', userEmail])
    
    const borradorResult = await get(`SELECT * FROM actas_borradores WHERE id = ?`, [result.lastInsertRowid])
    
    res.json({ success: true, borrador: borradorResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error creando borrador:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/borradores/:id
 * Actualizar información general del borrador
 */
router.put('/borradores/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      expediente,
      nombre_administrado,
      ruc,
      unidad_fiscalizable,
      departamento,
      provincia,
      distrito,
      direccion_referencia,
      actividad_desarrollada,
      etapa,
      tipo_supervision,
      orientativa,
      estado,
      fecha_hora_inicio,
      fecha_hora_cierre,
      equipos_gps,
      status,
      last_section_edited,
      completion_percentage
    } = req.body
    
    const equipos_gps_json = equipos_gps ? JSON.stringify(equipos_gps) : null
    
    await run(`
      UPDATE actas_borradores SET
        expediente = COALESCE(?, expediente),
        nombre_administrado = COALESCE(?, nombre_administrado),
        ruc = COALESCE(?, ruc),
        unidad_fiscalizable = COALESCE(?, unidad_fiscalizable),
        departamento = COALESCE(?, departamento),
        provincia = COALESCE(?, provincia),
        distrito = COALESCE(?, distrito),
        direccion_referencia = COALESCE(?, direccion_referencia),
        actividad_desarrollada = COALESCE(?, actividad_desarrollada),
        etapa = COALESCE(?, etapa),
        tipo_supervision = COALESCE(?, tipo_supervision),
        orientativa = COALESCE(?, orientativa),
        estado = COALESCE(?, estado),
        fecha_hora_inicio = COALESCE(?, fecha_hora_inicio),
        fecha_hora_cierre = COALESCE(?, fecha_hora_cierre),
        equipos_gps_json = COALESCE(?, equipos_gps_json),
        status = COALESCE(?, status),
        last_section_edited = COALESCE(?, last_section_edited),
        completion_percentage = COALESCE(?, completion_percentage)
      WHERE id = ?
    `, [
      expediente,
      nombre_administrado,
      ruc,
      unidad_fiscalizable,
      departamento,
      provincia,
      distrito,
      direccion_referencia,
      actividad_desarrollada,
      etapa,
      tipo_supervision,
      orientativa,
      estado,
      fecha_hora_inicio,
      fecha_hora_cierre,
      equipos_gps_json,
      status,
      last_section_edited,
      completion_percentage,
      id
    ])
    
    const borradorResult = await get(`SELECT * FROM actas_borradores WHERE id = ?`, [id])
    
    res.json({ success: true, borrador: borradorResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error actualizando borrador:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/borradores/:id
 * Eliminar un borrador
 */
router.delete('/borradores/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    await run(`DELETE FROM actas_borradores WHERE id = ?`, [id])
    
    res.json({ success: true, message: 'Borrador eliminado' })
  } catch (error) {
    console.error('[actas] Error eliminando borrador:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================
// HECHOS VERIFICADOS
// ============================================

/**
 * GET /api/actas/:actaId/hechos
 * Obtener todos los hechos de un acta
 */
router.get('/:actaId/hechos', async (req, res) => {
  try {
    const { actaId } = req.params
    
    const result = await query(`
      SELECT * FROM actas_hechos 
      WHERE acta_id = ? 
      ORDER BY numero_hecho ASC
    `, [actaId])
    
    res.json({ success: true, hechos: result.rows })
  } catch (error) {
    console.error('[actas] Error obteniendo hechos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/hechos
 * Crear un nuevo hecho
 */
router.post('/:actaId/hechos', async (req, res) => {
  try {
    const { actaId } = req.params
    const {
      titulo_hecho,
      hecho_detec_original,
      presunto_incumplimiento,
      subsanado,
      obligacion,
      obligacion_fiscalizable,
      descripcion,
      descripcion_hecho,
      descripcion_original,
      requerimiento_subsanacion,
      info_analisis_riesgo,
      globalid_origen,
      nivel_riesgo,
      justificacion_riesgo,
      impacto_potencial,
      medidas_mitigacion,
      fotos_seleccionadas,
      entorno_afectacion,
      factor_cantidad,
      factor_peligrosidad,
      factor_extension,
      factor_personas_expuestas,
      factor_medio_afectado,
      probabilidad_ocurrencia,
      score_consecuencia,
      valor_consecuencia,
      valor_riesgo,
      tipo_incumplimiento,
      texto_analisis_riesgo
    } = req.body
    
    const obligacionFinal = obligacion_fiscalizable || obligacion
    const descripcionFinal = descripcion_hecho || descripcion
    
    const maxResult = await get(`SELECT COALESCE(MAX(numero_hecho), 0) as max FROM actas_hechos WHERE acta_id = ?`, [actaId])
    const numero_hecho = (maxResult.rows[0]?.max || 0) + 1
    
    const result = await run(`
      INSERT INTO actas_hechos (
        acta_id, numero_hecho, titulo_hecho, hecho_detec_original,
        presunto_incumplimiento, subsanado, obligacion, descripcion,
        descripcion_original, requerimiento_subsanacion, info_analisis_riesgo,
        globalid_origen, nivel_riesgo, justificacion_riesgo, impacto_potencial,
        medidas_mitigacion, fotos_seleccionadas,
        entorno_afectacion, factor_cantidad, factor_peligrosidad, factor_extension,
        factor_personas_expuestas, factor_medio_afectado, probabilidad_ocurrencia,
        score_consecuencia, valor_consecuencia, valor_riesgo, tipo_incumplimiento,
        texto_analisis_riesgo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      actaId, numero_hecho, titulo_hecho, hecho_detec_original,
      presunto_incumplimiento, subsanado, obligacionFinal, descripcionFinal,
      descripcion_original, requerimiento_subsanacion, info_analisis_riesgo,
      globalid_origen, nivel_riesgo, justificacion_riesgo, impacto_potencial,
      medidas_mitigacion, fotos_seleccionadas,
      entorno_afectacion, factor_cantidad, factor_peligrosidad, factor_extension,
      factor_personas_expuestas, factor_medio_afectado, probabilidad_ocurrencia,
      score_consecuencia, valor_consecuencia, valor_riesgo, tipo_incumplimiento,
      texto_analisis_riesgo
    ])
    
    const hechoResult = await get(`SELECT * FROM actas_hechos WHERE id = ?`, [result.lastInsertRowid])
    
    res.json({ success: true, hecho: hechoResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error creando hecho:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/hechos/:hechoId
 * Actualizar un hecho
 */
router.put('/:actaId/hechos/:hechoId', async (req, res) => {
  try {
    const { hechoId } = req.params
    const {
      numero_hecho, titulo_hecho, presunto_incumplimiento, subsanado,
      obligacion, obligacion_fiscalizable, descripcion, descripcion_hecho,
      requerimiento_subsanacion, info_analisis_riesgo, is_completed,
      nivel_riesgo, justificacion_riesgo, impacto_potencial, medidas_mitigacion,
      fotos_seleccionadas, entorno_afectacion, factor_cantidad, factor_peligrosidad,
      factor_extension, factor_personas_expuestas, factor_medio_afectado,
      probabilidad_ocurrencia, score_consecuencia, valor_consecuencia,
      valor_riesgo, tipo_incumplimiento, texto_analisis_riesgo
    } = req.body
    
    const obligacionFinal = obligacion_fiscalizable || obligacion
    const descripcionFinal = descripcion_hecho || descripcion
    
    // Helper: SQLite no acepta undefined, solo null
    const toNull = (v) => v === undefined ? null : v
    
    await run(`
      UPDATE actas_hechos SET
        numero_hecho = COALESCE(?, numero_hecho),
        titulo_hecho = COALESCE(?, titulo_hecho),
        presunto_incumplimiento = COALESCE(?, presunto_incumplimiento),
        subsanado = COALESCE(?, subsanado),
        obligacion = COALESCE(?, obligacion),
        descripcion = COALESCE(?, descripcion),
        requerimiento_subsanacion = COALESCE(?, requerimiento_subsanacion),
        info_analisis_riesgo = COALESCE(?, info_analisis_riesgo),
        is_completed = COALESCE(?, is_completed),
        nivel_riesgo = COALESCE(?, nivel_riesgo),
        justificacion_riesgo = COALESCE(?, justificacion_riesgo),
        impacto_potencial = COALESCE(?, impacto_potencial),
        medidas_mitigacion = COALESCE(?, medidas_mitigacion),
        fotos_seleccionadas = COALESCE(?, fotos_seleccionadas),
        entorno_afectacion = COALESCE(?, entorno_afectacion),
        factor_cantidad = COALESCE(?, factor_cantidad),
        factor_peligrosidad = COALESCE(?, factor_peligrosidad),
        factor_extension = COALESCE(?, factor_extension),
        factor_personas_expuestas = COALESCE(?, factor_personas_expuestas),
        factor_medio_afectado = COALESCE(?, factor_medio_afectado),
        probabilidad_ocurrencia = COALESCE(?, probabilidad_ocurrencia),
        score_consecuencia = COALESCE(?, score_consecuencia),
        valor_consecuencia = COALESCE(?, valor_consecuencia),
        valor_riesgo = COALESCE(?, valor_riesgo),
        tipo_incumplimiento = COALESCE(?, tipo_incumplimiento),
        texto_analisis_riesgo = COALESCE(?, texto_analisis_riesgo)
      WHERE id = ?
    `, [
      toNull(numero_hecho), toNull(titulo_hecho), toNull(presunto_incumplimiento), toNull(subsanado),
      toNull(obligacionFinal), toNull(descripcionFinal), toNull(requerimiento_subsanacion), toNull(info_analisis_riesgo),
      toNull(is_completed), toNull(nivel_riesgo), toNull(justificacion_riesgo), toNull(impacto_potencial),
      toNull(medidas_mitigacion), toNull(fotos_seleccionadas), toNull(entorno_afectacion), toNull(factor_cantidad),
      toNull(factor_peligrosidad), toNull(factor_extension), toNull(factor_personas_expuestas), toNull(factor_medio_afectado),
      toNull(probabilidad_ocurrencia), toNull(score_consecuencia), toNull(valor_consecuencia), toNull(valor_riesgo),
      toNull(tipo_incumplimiento), toNull(texto_analisis_riesgo), hechoId
    ])
    
    const hechoResult = await get(`SELECT * FROM actas_hechos WHERE id = ?`, [hechoId])
    
    res.json({ success: true, hecho: hechoResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error actualizando hecho:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/hechos/reorder
 * Reordenar hechos (drag & drop)
 */
router.put('/:actaId/hechos/reorder', async (req, res) => {
  try {
    const { actaId } = req.params
    const { orden } = req.body
    
    if (!Array.isArray(orden)) {
      return res.status(400).json({ success: false, error: 'orden debe ser un array' })
    }
    
    const db = await ensureDb()
    db.run('BEGIN TRANSACTION')
    try {
      for (let i = 0; i < orden.length; i++) {
        db.run(`UPDATE actas_hechos SET numero_hecho = ? WHERE id = ? AND acta_id = ?`, [i + 1, orden[i], actaId])
      }
      db.run('COMMIT')
    } catch (e) {
      db.run('ROLLBACK')
      throw e
    }
    
    const result = await query(`SELECT * FROM actas_hechos WHERE acta_id = ? ORDER BY numero_hecho ASC`, [actaId])
    
    res.json({ success: true, hechos: result.rows })
  } catch (error) {
    console.error('[actas] Error reordenando hechos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/:actaId/hechos/:hechoId
 * Eliminar un hecho
 */
router.delete('/:actaId/hechos/:hechoId', async (req, res) => {
  try {
    const { actaId, hechoId } = req.params
    
    await run(`DELETE FROM actas_hechos WHERE id = ? AND acta_id = ?`, [hechoId, actaId])
    
    // Renumerar hechos restantes
    const hechosResult = await query(`SELECT id FROM actas_hechos WHERE acta_id = ? ORDER BY numero_hecho ASC`, [actaId])
    
    const db = await ensureDb()
    for (let i = 0; i < hechosResult.rows.length; i++) {
      db.run(`UPDATE actas_hechos SET numero_hecho = ? WHERE id = ?`, [i + 1, hechosResult.rows[i].id])
    }
    
    res.json({ success: true, message: 'Hecho eliminado' })
  } catch (error) {
    console.error('[actas] Error eliminando hecho:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================
// MEDIOS PROBATORIOS (FOTOS)
// ============================================

/**
 * GET /api/actas/:actaId/hechos/:hechoId/medios
 * Obtener medios probatorios de un hecho
 */
router.get('/:actaId/hechos/:hechoId/medios', async (req, res) => {
  try {
    const { hechoId } = req.params
    
    const result = await query(`
      SELECT mp.*, ap.local_path as photo_path_full
      FROM actas_medios_probatorios mp
      LEFT JOIN arcgis_photos ap ON mp.photo_id = ap.id
      WHERE mp.hecho_id = ?
      ORDER BY mp.numero_foto ASC
    `, [hechoId])
    
    res.json({ success: true, medios: result.rows })
  } catch (error) {
    console.error('[actas] Error obteniendo medios:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/hechos/:hechoId/medios
 * Agregar un medio probatorio (foto) a un hecho
 */
router.post('/:actaId/hechos/:hechoId/medios', async (req, res) => {
  try {
    const { actaId, hechoId } = req.params
    const {
      titulo_foto, subtitulo_foto, descripcion, descripcion_original,
      este, norte, altitud, zona, datum,
      photo_id, photo_globalid, photo_filename, photo_local_path
    } = req.body
    
    const maxResult = await get(`SELECT COALESCE(MAX(numero_foto), 0) as max FROM actas_medios_probatorios WHERE hecho_id = ?`, [hechoId])
    const numero_foto = (maxResult.rows[0]?.max || 0) + 1
    
    const result = await run(`
      INSERT INTO actas_medios_probatorios (
        hecho_id, acta_id, numero_foto, titulo_foto, subtitulo_foto,
        descripcion, descripcion_original, este, norte, altitud, zona, datum,
        photo_id, photo_globalid, photo_filename, photo_local_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      hechoId, actaId, numero_foto, titulo_foto, subtitulo_foto,
      descripcion, descripcion_original, este, norte, altitud, zona, datum || 'WGS 84',
      photo_id, photo_globalid, photo_filename, photo_local_path
    ])
    
    const medioResult = await get(`SELECT * FROM actas_medios_probatorios WHERE id = ?`, [result.lastInsertRowid])
    
    res.json({ success: true, medio: medioResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error agregando medio probatorio:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/hechos/:hechoId/medios/:medioId
 * Actualizar un medio probatorio
 */
router.put('/:actaId/hechos/:hechoId/medios/:medioId', async (req, res) => {
  try {
    const { medioId } = req.params
    const { titulo_foto, subtitulo_foto, descripcion, este, norte, altitud, zona, datum } = req.body
    
    await run(`
      UPDATE actas_medios_probatorios SET
        titulo_foto = COALESCE(?, titulo_foto),
        subtitulo_foto = COALESCE(?, subtitulo_foto),
        descripcion = COALESCE(?, descripcion),
        este = COALESCE(?, este),
        norte = COALESCE(?, norte),
        altitud = COALESCE(?, altitud),
        zona = COALESCE(?, zona),
        datum = COALESCE(?, datum)
      WHERE id = ?
    `, [titulo_foto, subtitulo_foto, descripcion, este, norte, altitud, zona, datum, medioId])
    
    const medioResult = await get(`SELECT * FROM actas_medios_probatorios WHERE id = ?`, [medioId])
    
    res.json({ success: true, medio: medioResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error actualizando medio:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/:actaId/hechos/:hechoId/medios/:medioId
 * Eliminar un medio probatorio
 */
router.delete('/:actaId/hechos/:hechoId/medios/:medioId', async (req, res) => {
  try {
    const { hechoId, medioId } = req.params
    
    await run(`DELETE FROM actas_medios_probatorios WHERE id = ?`, [medioId])
    
    // Renumerar fotos restantes
    const mediosResult = await query(`SELECT id FROM actas_medios_probatorios WHERE hecho_id = ? ORDER BY numero_foto ASC`, [hechoId])
    
    const db = await ensureDb()
    for (let i = 0; i < mediosResult.rows.length; i++) {
      db.run(`UPDATE actas_medios_probatorios SET numero_foto = ? WHERE id = ?`, [i + 1, mediosResult.rows[i].id])
    }
    
    res.json({ success: true, message: 'Medio probatorio eliminado' })
  } catch (error) {
    console.error('[actas] Error eliminando medio:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================
// OBTENER HECHOS DISPONIBLES DE LA DATA
// ============================================

/**
 * Helper: Normalizar y deduplicar valores de hecho de Survey123
 * Maneja:
 * - Underscores: "J._Falta_de_mantenimiento." -> "J. Falta de mantenimiento."
 * - Duplicados por pipe: "D. Algo. | D. Algo." -> "D. Algo."
 * - Duplicados concatenados: "J. Texto.J. Texto." -> "J. Texto."
 */
const deduplicateHechoValue = (valor) => {
  if (!valor || typeof valor !== 'string') return valor
  
  // 1. Reemplazar underscores por espacios
  let cleaned = valor.replace(/_/g, ' ')
  
  // 2. Normalizar espacios múltiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  // 3. Detectar y remover duplicación concatenada (el hecho aparece dos veces seguidas)
  // Patrón: "X. Texto.X. Texto." -> "X. Texto."
  const halfLength = Math.floor(cleaned.length / 2)
  const firstHalf = cleaned.substring(0, halfLength).trim()
  const secondHalf = cleaned.substring(halfLength).trim()
  
  if (firstHalf === secondHalf && firstHalf.length > 0) {
    cleaned = firstHalf
  }
  
  // 4. Dividir por | y limpiar cada parte (para duplicados separados por pipe)
  const partes = cleaned.split('|').map(p => p.trim()).filter(p => p)
  
  // Obtener valores únicos (ignorando diferencias menores de espacios/puntuación)
  const uniquePartes = []
  const seen = new Set()
  
  for (const parte of partes) {
    // Normalizar para comparación (minúsculas, sin espacios extras, sin puntos finales)
    const normalized = parte.toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '').trim()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      uniquePartes.push(parte)
    }
  }
  
  // 5. Asegurar que termine con punto
  let result = uniquePartes.length === 1 ? uniquePartes[0] : uniquePartes.join(' | ')
  if (result && !result.endsWith('.')) {
    result += '.'
  }
  
  return result
}

/**
 * GET /api/actas/hechos-disponibles/:codigoAccion
 * Obtener los hechos detectados disponibles de un CA
 * 
 * Lógica:
 * 1. Si hay hechos en tabla 2 (HECHO_DETEC_*): usar esos con descripciones (DESCRIP_2) y fotos de tabla 2
 * 2. Si NO hay hechos en tabla 2: formular hecho único con info de tablas 0 y 1
 */
router.get('/hechos-disponibles/:codigoAccion', async (req, res) => {
  try {
    const { codigoAccion } = req.params
    
    const registrosResult = await query(`
      SELECT globalid, componente, tipo_componente, instalacion_referencia, subcomponente,
        tipo_de_reporte as modalidad, nombre_supervisor, fecha, descrip_1, hecho_detec_1, descrip_2, raw_json
      FROM arcgis_records 
      WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0
    `, [codigoAccion, codigoAccion])
    const registros = registrosResult.rows
    
    const fotosCountMap = {}
    try {
      const fotosResult = await query(`
        SELECT record_globalid, COUNT(*) as count 
        FROM arcgis_photos 
        WHERE record_globalid IN (SELECT globalid FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0)
          AND is_deleted = 0
        GROUP BY record_globalid
      `, [codigoAccion, codigoAccion])
      fotosResult.rows.forEach(fc => {
        fotosCountMap[fc.record_globalid] = fc.count
      })
    } catch (e) {
      console.warn('[actas] No se pudo obtener conteo de fotos:', e.message)
    }
    
    const hechosDisponibles = []
    let tieneHechosTabla2 = false
    
    // Primera pasada: detectar si hay hechos en tabla 2
    registros.forEach(reg => {
      try {
        const rawData = JSON.parse(reg.raw_json || '{}')
        
        // Buscar campos HECHO_DETEC_* (vienen de tabla 2)
        Object.keys(rawData).forEach(key => {
          const keyLower = key.toLowerCase()
          if (keyLower.startsWith('hecho_detec') && rawData[key]) {
            tieneHechosTabla2 = true
          }
        })
        
        // También verificar el campo mapeado hecho_detec_1
        if (reg.hecho_detec_1) {
          tieneHechosTabla2 = true
        }
      } catch (e) {
        // Ignorar errores de parsing
      }
    })
    
    // Segunda pasada: extraer hechos según el caso
    registros.forEach(reg => {
      try {
        const rawData = JSON.parse(reg.raw_json || '{}')
        
        if (tieneHechosTabla2) {
          // CASO 1: Hay hechos en tabla 2 - usar esos
          // Buscar campos HECHO_DETEC_* del raw_json
          Object.keys(rawData).forEach(key => {
            const keyLower = key.toLowerCase()
            if (keyLower.startsWith('hecho_detec') && rawData[key]) {
              // Extraer número del campo (ej: HECHO_DETEC_1 -> 1)
              const numMatch = key.match(/(\d+)$/)
              const num = numMatch ? numMatch[1] : '1'
              
              // Descripción viene de DESCRIP_2 o DESCRIP_{num} de tabla 2
              const descripcion = rawData[`DESCRIP_${num}`] || rawData['DESCRIP_2'] || reg.descrip_2 || ''
              
              hechosDisponibles.push({
                globalid: reg.globalid,
                componente: reg.componente,
                tipo_componente: reg.tipo_componente,
                instalacion_referencia: reg.instalacion_referencia,
                subcomponente: reg.subcomponente,
                modalidad: reg.modalidad,
                campo: key,
                valor: deduplicateHechoValue(rawData[key]),
                descripcion: descripcion,
                fuente: 'tabla2', // Indica que viene de tabla 2
                tieneHechosTabla2: true,
                cantidadFotos: fotosCountMap[reg.globalid] || 0
              })
            }
          })
          
          // También verificar el campo mapeado hecho_detec_1
          const hechoDetec1Clean = deduplicateHechoValue(reg.hecho_detec_1)
          if (hechoDetec1Clean && !hechosDisponibles.some(h => h.globalid === reg.globalid && h.valor === hechoDetec1Clean)) {
            hechosDisponibles.push({
              globalid: reg.globalid,
              componente: reg.componente,
              tipo_componente: reg.tipo_componente,
              instalacion_referencia: reg.instalacion_referencia,
              subcomponente: reg.subcomponente,
              modalidad: reg.modalidad,
              campo: 'hecho_detec_1',
              valor: hechoDetec1Clean,
              descripcion: reg.descrip_2 || rawData['DESCRIP_2'] || '',
              fuente: 'tabla2',
              tieneHechosTabla2: true,
              cantidadFotos: fotosCountMap[reg.globalid] || 0
            })
          }
        } else {
          // CASO 2: NO hay hechos en tabla 2 - formular hecho único con info de tablas 0 y 1
          // Crear un hecho genérico basado en el componente/tipo_componente
          const descripcion = reg.descrip_1 || rawData['DESCRIP_1'] || rawData['descripcion'] || ''
          
          // Solo agregar si tiene componente o descripción
          if (reg.componente || descripcion) {
            // Generar título del hecho basado en el tipo de componente
            let tituloHecho = ''
            if (reg.tipo_componente && reg.componente) {
              tituloHecho = `Verificación de ${reg.tipo_componente}: ${reg.componente}`
            } else if (reg.componente) {
              tituloHecho = `Verificación de componente: ${reg.componente}`
            } else if (reg.tipo_componente) {
              tituloHecho = `Verificación de ${reg.tipo_componente}`
            } else {
              tituloHecho = 'Verificación de campo'
            }
            
            hechosDisponibles.push({
              globalid: reg.globalid,
              componente: reg.componente,
              tipo_componente: reg.tipo_componente,
              instalacion_referencia: reg.instalacion_referencia,
              subcomponente: reg.subcomponente,
              modalidad: reg.modalidad,
              campo: 'hecho_generado',
              valor: tituloHecho,
              descripcion: descripcion,
              fuente: 'tabla0_1', // Indica que viene de tablas 0 y 1
              cantidadFotos: fotosCountMap[reg.globalid] || 0,
              tieneHechosTabla2: false
            })
          }
        }
      } catch (e) {
        console.error('[actas] Error procesando registro:', e)
      }
    })
    
    // Filtrar S._Otros_Aspectos - esos van a la sección 6, no a hechos
    const hechosReales = hechosDisponibles.filter(h => 
      !h.valor || !h.valor.includes('S._Otros_Aspectos')
    )
    
    res.json({ 
      success: true, 
      hechos: hechosReales,
      tieneHechosTabla2: tieneHechosTabla2,
      totalRegistros: registros.length
    })
  } catch (error) {
    console.error('[actas] Error obteniendo hechos disponibles:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/otros-aspectos-disponibles/:codigoAccion
 * Obtener registros con S._Otros_Aspectos de un CA para la Sección 6
 * Estos NO son hechos, van directo a "Otros Aspectos"
 */
router.get('/otros-aspectos-disponibles/:codigoAccion', async (req, res) => {
  try {
    const { codigoAccion } = req.params
    
    const registrosResult = await query(`
      SELECT globalid, componente, tipo_componente, instalacion_referencia, subcomponente,
        tipo_de_reporte as modalidad, nombre_supervisor, fecha, descrip_1, hecho_detec_1, descrip_2, raw_json
      FROM arcgis_records 
      WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0
    `, [codigoAccion, codigoAccion])
    const registros = registrosResult.rows
    
    const fotosCountMap = {}
    try {
      const fotosResult = await query(`
        SELECT record_globalid, COUNT(*) as count 
        FROM arcgis_photos 
        WHERE record_globalid IN (SELECT globalid FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0)
          AND is_deleted = 0
        GROUP BY record_globalid
      `, [codigoAccion, codigoAccion])
      fotosResult.rows.forEach(fc => {
        fotosCountMap[fc.record_globalid] = fc.count
      })
    } catch (e) {
      console.warn('[actas] No se pudo obtener conteo de fotos:', e.message)
    }
    
    const otrosAspectos = []
    
    // Buscar solo registros con S._Otros_Aspectos
    registros.forEach(reg => {
      try {
        const rawData = JSON.parse(reg.raw_json || '{}')
        
        // Buscar campos HECHO_DETEC_* que contengan S._Otros_Aspectos
        Object.keys(rawData).forEach(key => {
          const keyLower = key.toLowerCase()
          if (keyLower.startsWith('hecho_detec') && rawData[key]) {
            const valor = rawData[key]
            if (valor.includes('S._Otros_Aspectos')) {
              // Extraer número del campo
              const numMatch = key.match(/(\d+)$/)
              const num = numMatch ? numMatch[1] : '1'
              
              // Descripción
              const descripcion = rawData[`DESCRIP_${num}`] || rawData['DESCRIP_2'] || reg.descrip_2 || ''
              
              otrosAspectos.push({
                globalid: reg.globalid,
                componente: reg.componente,
                tipo_componente: reg.tipo_componente,
                instalacion_referencia: reg.instalacion_referencia,
                subcomponente: reg.subcomponente,
                modalidad: reg.modalidad,
                supervisor: reg.nombre_supervisor,
                fecha: reg.fecha,
                campo: key,
                valor: deduplicateHechoValue(valor),
                descripcion: descripcion,
                cantidadFotos: fotosCountMap[reg.globalid] || 0
              })
            }
          }
        })
        
        // También verificar el campo mapeado hecho_detec_1
        if (reg.hecho_detec_1 && reg.hecho_detec_1.includes('S._Otros_Aspectos')) {
          const yaExiste = otrosAspectos.some(oa => oa.globalid === reg.globalid)
          if (!yaExiste) {
            otrosAspectos.push({
              globalid: reg.globalid,
              componente: reg.componente,
              tipo_componente: reg.tipo_componente,
              instalacion_referencia: reg.instalacion_referencia,
              subcomponente: reg.subcomponente,
              modalidad: reg.modalidad,
              supervisor: reg.nombre_supervisor,
              fecha: reg.fecha,
              campo: 'hecho_detec_1',
              valor: deduplicateHechoValue(reg.hecho_detec_1),
              descripcion: reg.descrip_2 || rawData['DESCRIP_2'] || '',
              cantidadFotos: fotosCountMap[reg.globalid] || 0
            })
          }
        }
      } catch (e) {
        console.error('[actas] Error procesando registro para otros aspectos:', e)
      }
    })
    
    res.json({ 
      success: true, 
      otrosAspectos: otrosAspectos,
      totalRegistros: otrosAspectos.length
    })
  } catch (error) {
    console.error('[actas] Error obteniendo otros aspectos disponibles:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/fotos-disponibles/:codigoAccion
 * Obtener las fotos disponibles de un CA para medios probatorios
 */
router.get('/fotos-disponibles/:codigoAccion', async (req, res) => {
  try {
    const { codigoAccion } = req.params
    const { globalid } = req.query
    
    let sqlQuery = `
      SELECT ap.id, ap.record_globalid, ap.filename, ap.local_path, ap.layer_id,
        ar.componente, ar.tipo_componente, ar.instalacion_referencia, ar.subcomponente,
        ar.norte, ar.este, ar.altitud, ar.zona, ar.datum, ar.raw_json
      FROM arcgis_photos ap
      JOIN arcgis_records ar ON ap.record_id = ar.id
      WHERE (ar.codigo_accion = ? OR ar.otro_ca = ?) AND ap.is_deleted = 0 AND ar.is_deleted = 0
    `
    
    const params = [codigoAccion, codigoAccion]
    
    if (globalid) {
      sqlQuery += ` AND ap.record_globalid = ?`
      params.push(globalid)
    }
    
    sqlQuery += ` ORDER BY ar.componente, ap.filename`
    
    const fotosResult = await query(sqlQuery, params)
    const fotos = fotosResult.rows
    
    // Enriquecer con descripciones del raw_json basadas en el LAYER_ID de la foto
    // layer_id = 1 (Descripcion) → DESCRIP_1
    // layer_id = 2 (Hechos) → DESCRIP_2
    const fotosEnriquecidas = fotos.map(foto => {
      try {
        const rawData = JSON.parse(foto.raw_json || '{}')
        
        // IMPORTANTE: Usar layer_id de la foto para determinar qué descripción usar
        const layerId = foto.layer_id || 1
        
        // Buscar descripción según el layer de la foto
        const descripKey = `DESCRIP_${layerId}`
        const descripKeyLower = `descrip_${layerId}`
        const hechoKey = `HECHO_DETEC_${layerId}`
        const hechoKeyLower = `hecho_detec_${layerId}`
        
        // Obtener descripción específica de esta foto
        let descripcion = rawData[descripKey] || rawData[descripKeyLower] || ''
        let hechoDetec = rawData[hechoKey] || rawData[hechoKeyLower] || ''
        
        return {
          ...foto,
          descripcion,
          descripcion_original: descripcion, // Guardar original para revertir
          hecho_detec: hechoDetec,
          layerId, // Incluir el layer para debugging
          raw_json: undefined // No enviar el JSON completo
        }
      } catch (e) {
        return { ...foto, descripcion: '', hecho_detec: '', layerId: 1, raw_json: undefined }
      }
    })
    
    res.json({ success: true, fotos: fotosEnriquecidas })
  } catch (error) {
    console.error('[actas] Error obteniendo fotos disponibles:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================
// AI ENHANCEMENT - Mejora de textos con IA
// ============================================

/**
 * POST /api/actas/ai-enhance
 * Mejorar un texto usando Gemini AI para documentos técnicos OEFA
 */
router.post('/ai-enhance', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { 
      content, 
      fieldType, // 'obligacion', 'descripcion', 'titulo', etc.
      context = {}, // Contexto adicional (hecho, componente, etc.)
      actaId,
      hechoId 
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'El contenido debe tener al menos 10 caracteres' 
      })
    }
    
    console.log(`[actas/ai-enhance] Usuario ${userEmail} - Campo: ${fieldType} - Longitud: ${content.length}`)
    
    // Detectar si el contenido tiene múltiples componentes separados por <hr>
    const hasMultipleComponents = content.includes('<hr') || content.includes('<HR')
    let enhancedContent
    
    if (hasMultipleComponents && fieldType === 'descripcion') {
      // Procesar cada componente por separado para preservar la estructura
      console.log(`[actas/ai-enhance] 📦 Detectados múltiples componentes, procesando por separado...`)
      
      // Separar por <hr> (cualquier variante)
      const components = content.split(/<hr[^>]*>/gi).filter(c => c.trim())
      const enhancedComponents = []
      
      for (let i = 0; i < components.length; i++) {
        const componentContent = components[i].trim()
        if (!componentContent) continue
        
        // Construir prompt para este componente individual
        const componentPrompt = buildEnhancementPrompt(componentContent, fieldType, context)
        
        try {
          const result = await aiModel.generateContent(componentPrompt)
          const response = await result.response
          let enhancedComponent = response.text()
            .replace(/```html\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim()
          
          // Si no tiene tags HTML, convertir de Markdown a HTML
          const hasHtml = /<[a-z][\s\S]*>/i.test(enhancedComponent)
          if (!hasHtml) {
            enhancedComponent = marked.parse(enhancedComponent)
          }
          
          // Extraer el título del componente del contenido original
          const titleMatch = componentContent.match(/<p[^>]*>\s*<strong[^>]*>\s*<u[^>]*>([^<]+)<\/u>\s*<\/strong>\s*<\/p>/i)
            || componentContent.match(/<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<\/p>/i)
            || componentContent.match(/<strong[^>]*>\s*<u[^>]*>([^<]+)<\/u>\s*<\/strong>/i)
          
          // Verificar si el componente mejorado ya tiene el título
          const enhancedHasTitle = enhancedComponent.includes('<strong><u>') 
            || enhancedComponent.includes('<strong><u ')
          
          // Si hay título en el original pero no en el mejorado, agregarlo
          if (titleMatch && !enhancedHasTitle) {
            const titleName = titleMatch[1].trim()
            const componentTitle = `<p><strong><u>${titleName}</u></strong></p>\n\n`
            enhancedComponent = componentTitle + enhancedComponent
          }
          
          enhancedComponents.push(enhancedComponent)
          console.log(`[actas/ai-enhance] ✓ Componente ${i + 1}/${components.length} procesado`)
        } catch (compError) {
          console.warn(`[actas/ai-enhance] ⚠️ Error en componente ${i + 1}, usando original:`, compError.message)
          enhancedComponents.push(componentContent)
        }
      }
      
      // Re-ensamblar con separadores <hr>
      enhancedContent = enhancedComponents.join('\n<hr style="margin: 1.5em 0; border: none; border-top: 1px solid #ccc;">\n')
      console.log(`[actas/ai-enhance] 📦 Re-ensamblados ${enhancedComponents.length} componentes`)
      
    } else {
      // Procesamiento normal (sin múltiples componentes)
      const prompt = buildEnhancementPrompt(content, fieldType, context)
      
      const result = await aiModel.generateContent(prompt)
      const response = await result.response
      enhancedContent = response.text()
        .replace(/```html\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim()
      
      // Si no tiene tags HTML, convertir de Markdown a HTML (excepto para foto_descripcion)
      if (fieldType !== 'foto_descripcion') {
        const hasHtml = /<[a-z][\s\S]*>/i.test(enhancedContent)
        if (!hasHtml) {
          enhancedContent = marked.parse(enhancedContent)
        }
      }
    }
    
    // Para foto_descripcion, siempre limpiar HTML y devolver texto plano
    if (fieldType === 'foto_descripcion') {
      enhancedContent = enhancedContent
        .replace(/<[^>]+>/g, '') // Eliminar tags HTML
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n') // Normalizar saltos de línea
        .trim()
    }
    
    // Calcular tokens usados (aproximación)
    const tokensInput = Math.ceil(content.length / 4)
    const tokensOutput = Math.ceil(enhancedContent.length / 4)
    const processingTime = Date.now() - startTime
    
    // Guardar sesión de enhancement
    try {
      await run(`
        INSERT INTO ai_enhancement_sessions 
        (acta_id, hecho_id, field_name, original_content, enhanced_content, 
         ai_model, tokens_input, tokens_output, processing_time_ms, user_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [actaId || null, hechoId || null, fieldType, content, enhancedContent,
        'gemini-2.5-flash', tokensInput, tokensOutput, processingTime, userEmail])
    } catch (dbError) {
      console.warn('[actas/ai-enhance] No se pudo guardar sesión:', dbError.message)
    }
    
    console.log(`[actas/ai-enhance] ✅ Completado en ${processingTime}ms`)
    
    res.json({
      success: true,
      original: content,
      enhanced: enhancedContent,
      stats: {
        tokensInput,
        tokensOutput,
        processingTimeMs: processingTime
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-enhance] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error al procesar con IA: ' + error.message 
    })
  }
})

/**
 * POST /api/actas/ai-expert-review
 * Revisión por experto (ambiental o legal) con búsqueda web y citas
 */
router.post('/ai-expert-review', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { 
      content,
      fieldType,
      expertType, // 'environmental' | 'legal'
      context = {},
      actaId,
      hechoId
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'El contenido debe tener al menos 10 caracteres' 
      })
    }
    
    if (!['environmental', 'legal'].includes(expertType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tipo de experto inválido. Use "environmental" o "legal"' 
      })
    }
    
    const expertName = expertType === 'environmental' ? 'Experto Ambiental' : 'Experto Legal'
    console.log(`[actas/ai-expert-review] Usuario ${userEmail} - ${expertName}`)
    
    // Usar modelo con búsqueda web habilitada
    const searchModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
      tools: [{ googleSearch: {} }]
    })
    
    // Detectar si el contenido tiene múltiples componentes separados por <hr>
    const hasMultipleComponents = content.includes('<hr') || content.includes('<HR')
    let expertReview
    
    if (hasMultipleComponents && fieldType === 'descripcion') {
      // Procesar cada componente por separado para preservar la estructura en el texto sugerido
      console.log(`[actas/ai-expert-review] 📦 Detectados múltiples componentes, procesando por separado...`)
      
      const components = content.split(/<hr[^>]*>/gi).filter(c => c.trim())
      const allReviews = []
      const allSuggestedTexts = []
      
      for (let i = 0; i < components.length; i++) {
        const componentContent = components[i].trim()
        if (!componentContent) continue
        
        const componentPrompt = buildExpertPrompt(componentContent, fieldType, expertType, context)
        
        try {
          const result = await searchModel.generateContent(componentPrompt)
          const response = await result.response
          let componentReview = response.text()
            .replace(/```html\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim()
          
          const hasHtml = /<[a-z][\s\S]*>/i.test(componentReview)
          if (!hasHtml) {
            componentReview = marked.parse(componentReview)
          }
          
          // Extraer el texto sugerido del blockquote
          const blockquoteMatch = componentReview.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i)
          const suggestedText = blockquoteMatch ? blockquoteMatch[1].trim() : componentContent
          
          // Guardar la primera revisión completa (con análisis) y todos los textos sugeridos
          if (i === 0) {
            allReviews.push(componentReview)
          }
          allSuggestedTexts.push(suggestedText)
          
          console.log(`[actas/ai-expert-review] ✓ Componente ${i + 1}/${components.length} procesado`)
        } catch (compError) {
          console.warn(`[actas/ai-expert-review] ⚠️ Error en componente ${i + 1}:`, compError.message)
          allSuggestedTexts.push(componentContent)
        }
      }
      
      // Re-ensamblar: usar la primera revisión pero reemplazar el blockquote con todos los textos combinados
      const combinedSuggestedText = allSuggestedTexts.join('\n<hr style="margin: 1.5em 0; border: none; border-top: 1px solid #ccc;">\n')
      
      if (allReviews.length > 0) {
        // Reemplazar el blockquote original con el combinado
        expertReview = allReviews[0].replace(
          /<blockquote[^>]*>[\s\S]*?<\/blockquote>/i,
          `<blockquote>${combinedSuggestedText}</blockquote>`
        )
      } else {
        expertReview = `<blockquote>${combinedSuggestedText}</blockquote>`
      }
      
      console.log(`[actas/ai-expert-review] 📦 Re-ensamblados ${allSuggestedTexts.length} componentes en texto sugerido`)
      
    } else {
      // Procesamiento normal (sin múltiples componentes)
      const prompt = buildExpertPrompt(content, fieldType, expertType, context)
      
      const result = await searchModel.generateContent(prompt)
      const response = await result.response
      expertReview = response.text()
        .replace(/```html\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim()
      
      const hasHtml = /<[a-z][\s\S]*>/i.test(expertReview)
      if (!hasHtml) {
        expertReview = marked.parse(expertReview)
      }
    }
    
    const processingTime = Date.now() - startTime
    
    // Guardar sesión de revisión
    try {
      await run(`
        INSERT INTO ai_enhancement_sessions 
        (acta_id, hecho_id, field_name, original_content, enhanced_content, 
         ai_model, tokens_input, tokens_output, processing_time_ms, user_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        actaId || null,
        hechoId || null,
        `${fieldType}_${expertType}`,
        content,
        expertReview,
        `gemini-2.5-flash-${expertType}`,
        Math.ceil(prompt.length / 4),
        Math.ceil(expertReview.length / 4),
        processingTime,
        userEmail
      ])
    } catch (dbError) {
      console.warn('[actas/ai-expert-review] No se pudo guardar sesión:', dbError.message)
    }
    
    console.log(`[actas/ai-expert-review] ${expertName} completado en ${processingTime}ms`)
    
    res.json({
      success: true,
      expertType,
      expertName,
      review: expertReview,
      stats: {
        processingTimeMs: processingTime
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-expert-review] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error en revisión de experto: ' + error.message 
    })
  }
})

// ============================================
// Schema Zod para respuesta estructurada de expertos
// ============================================
const expertReviewSchema = z.object({
  analisisPreliminar: z.string().describe("Evaluación inicial técnica o legal del texto"),
  
  marcoNormativo: z.array(z.object({
    norma: z.string().describe("Nombre completo de la norma"),
    articulo: z.string().describe("Artículo, numeral o inciso específico"),
    citaTextual: z.string().optional().describe("Cita textual del dispositivo legal"),
    relevancia: z.string().describe("Por qué es relevante para este caso")
  })).describe("Marco normativo aplicable"),
  
  observaciones: z.array(z.object({
    aspecto: z.string().describe("Aspecto técnico o legal observado"),
    recomendacion: z.string().describe("Recomendación de mejora"),
    prioridad: z.enum(["alta", "media", "baja"]).describe("Nivel de prioridad")
  })).describe("Observaciones y recomendaciones"),
  
  textoSugerido: z.string().describe("Texto mejorado listo para usar en el acta, sin comillas"),
  
  fuentes: z.array(z.object({
    titulo: z.string().describe("Título del documento o norma"),
    url: z.string().describe("URL verificable de fuente oficial"),
    seccion: z.string().optional().describe("Sección específica citada")
  })).describe("Fuentes consultadas con URLs verificables"),
  
  confianza: z.enum(["alta", "media", "baja"]).describe("Nivel de confianza en la revisión"),
  requiereRevisionHumana: z.boolean().describe("Si requiere revisión humana adicional")
})

// JSON Schema para el paso 2 (sin zod-to-json-schema porque usamos el SDK nuevo)
const expertReviewJsonSchema = {
  type: "object",
  properties: {
    analisisPreliminar: { type: "string", description: "Evaluación inicial técnica o legal del texto" },
    marcoNormativo: {
      type: "array",
      items: {
        type: "object",
        properties: {
          norma: { type: "string", description: "Nombre completo de la norma" },
          articulo: { type: "string", description: "Artículo, numeral o inciso específico" },
          citaTextual: { type: "string", description: "Cita textual del dispositivo legal" },
          relevancia: { type: "string", description: "Por qué es relevante para este caso" }
        },
        required: ["norma", "articulo", "relevancia"]
      },
      description: "Marco normativo aplicable"
    },
    observaciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          aspecto: { type: "string", description: "Aspecto técnico o legal observado" },
          recomendacion: { type: "string", description: "Recomendación de mejora" },
          prioridad: { type: "string", enum: ["alta", "media", "baja"], description: "Nivel de prioridad" }
        },
        required: ["aspecto", "recomendacion", "prioridad"]
      },
      description: "Observaciones y recomendaciones"
    },
    textoSugerido: { type: "string", description: "Texto mejorado listo para usar en el acta, sin comillas" },
    fuentes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título del documento o norma" },
          url: { type: "string", description: "URL verificable de fuente oficial" },
          seccion: { type: "string", description: "Sección específica citada" }
        },
        required: ["titulo", "url"]
      },
      description: "Fuentes consultadas con URLs verificables"
    },
    confianza: { type: "string", enum: ["alta", "media", "baja"], description: "Nivel de confianza en la revisión" },
    requiereRevisionHumana: { type: "boolean", description: "Si requiere revisión humana adicional" }
  },
  required: ["analisisPreliminar", "marcoNormativo", "observaciones", "textoSugerido", "fuentes", "confianza", "requiereRevisionHumana"]
}

// ============================================
// ESTRATEGIA 1 PASO: Para OBLIGACIONES
// Usa Google Search y devuelve respuesta completa (texto enriquecido)
// Sin structured output - más natural y enfocado en normativa
// ============================================
async function reviewObligacionWithSearch(content, expertType) {
  const expertModel = await getGeminiModelExpert()
  
  const expert = expertType === 'environmental' 
    ? {
        name: 'Ingeniero Ambiental Senior',
        specialty: 'Fiscalización ambiental de hidrocarburos en Perú',
        searchFocus: 'normativa OEFA, MINAM, ECA, LMP, D.S., Resoluciones Ministeriales'
      }
    : {
        name: 'Abogado Especialista en Derecho Ambiental',
        specialty: 'Procedimiento Administrativo Sancionador (PAS) de OEFA',
        searchFocus: 'tipificación infracciones OEFA, TUO Ley 27444, Ley SINEFA, TFA, RPAS'
      }
  
  const prompt = `Eres un ${expert.name} con PhD y más de 25 años de experiencia en ${expert.specialty}.

**TAREA:** Revisar y mejorar una OBLIGACIÓN FISCALIZABLE para un acta de supervisión ambiental de OEFA.

**INSTRUCCIONES:**
1. USA googleSearch para buscar normativa peruana VIGENTE
2. Enfócate en: ${expert.searchFocus}
3. Busca en dominios oficiales: gob.pe, oefa.gob.pe, minam.gob.pe, spij.minjus.gob.pe

**OBLIGACIÓN A REVISAR:**
${stripHtml(content)}

**TU RESPUESTA DEBE TENER ESTA ESTRUCTURA EXACTA:**

## ANÁLISIS PRELIMINAR
[Tu evaluación técnica/legal del texto actual]

## MARCO NORMATIVO APLICABLE
[Lista de normas encontradas con artículos específicos y citas textuales relevantes]

## OBSERVACIONES Y RECOMENDACIONES
[Lista priorizada de mejoras sugeridas]

## TEXTO SUGERIDO
[IMPORTANTE: Escribe SOLO párrafos continuos de texto, SIN títulos, SIN encabezados, SIN "Obligación fiscalizable:", SIN markdown. El texto debe estar LISTO para copiar directamente al acta. Debe ser técnicamente preciso y normativamente fundamentado. NO uses viñetas ni listas - solo redacción fluida en párrafos.]

## FUENTES CONSULTADAS
[URLs oficiales de las normas citadas]

Proporciona una revisión profesional de nivel senior.`

  console.log('[ai-expert-obligacion] Iniciando revisión con Google Search (1 paso)...')
  
  const response = await (await getGenAI3()).models.generateContent({
    model: expertModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      maxOutputTokens: 8192
    }
  })
  
  const responseText = typeof response.text === 'function' ? response.text() : response.text
  console.log('[ai-expert-obligacion] ✅ Respuesta recibida:', responseText?.substring(0, 200) + '...')
  
  // Parsear el texto estructurado a un objeto JSON para el frontend
  return parseObligacionResponse(responseText)
}

/**
 * Parsear respuesta de texto estructurado a JSON
 * Extrae las secciones del markdown y las convierte a objeto
 */
function parseObligacionResponse(text) {
  const sections = {
    analisisPreliminar: '',
    marcoNormativo: [],
    observaciones: [],
    textoSugerido: '',
    fuentes: [],
    confianza: 'media',
    requiereRevisionHumana: true
  }
  
  try {
    // Extraer secciones por headers ##
    const analisisMatch = text.match(/##\s*AN[ÁA]LISIS PRELIMINAR\s*\n([\s\S]*?)(?=##|$)/i)
    if (analisisMatch) sections.analisisPreliminar = analisisMatch[1].trim()
    
    const marcoMatch = text.match(/##\s*MARCO NORMATIVO[^\n]*\n([\s\S]*?)(?=##|$)/i)
    if (marcoMatch) {
      const marcoText = marcoMatch[1].trim()
      // Extraer items de la lista
      const items = marcoText.split(/\n[-•*]\s+/).filter(i => i.trim())
      sections.marcoNormativo = items.slice(0, 5).map(item => ({
        norma: item.split(/[:\-–]/)[0]?.trim() || item.substring(0, 100),
        articulo: item.match(/[Aa]rt[íi]culo\s+[\d\.]+/)?.[0] || '',
        citaTextual: item.match(/"([^"]+)"/)?.[1] || '',
        relevancia: item.substring(0, 200)
      }))
    }
    
    const obsMatch = text.match(/##\s*OBSERVACIONES[^\n]*\n([\s\S]*?)(?=##|$)/i)
    if (obsMatch) {
      const obsText = obsMatch[1].trim()
      const items = obsText.split(/\n[-•*\d\.]\s+/).filter(i => i.trim())
      sections.observaciones = items.slice(0, 5).map((item, idx) => ({
        aspecto: item.split(/[:\-–]/)[0]?.trim() || `Observación ${idx + 1}`,
        recomendacion: item.trim(),
        prioridad: idx === 0 ? 'alta' : idx === 1 ? 'media' : 'baja'
      }))
    }
    
    const textoMatch = text.match(/##\s*TEXTO SUGERIDO\s*\n([\s\S]*?)(?=##|$)/i)
    if (textoMatch) sections.textoSugerido = textoMatch[1].trim()
    
    const fuentesMatch = text.match(/##\s*FUENTES[^\n]*\n([\s\S]*?)(?=##|$)/i)
    if (fuentesMatch) {
      const fuentesText = fuentesMatch[1].trim()
      const urls = fuentesText.match(/https?:\/\/[^\s\)]+/g) || []
      sections.fuentes = urls.slice(0, 5).map(url => ({
        titulo: url.includes('oefa') ? 'Portal OEFA' : 
                url.includes('minam') ? 'Portal MINAM' : 
                url.includes('gob.pe') ? 'Portal del Estado Peruano' : 'Fuente oficial',
        url: url,
        seccion: ''
      }))
    }
    
    // Si no se pudo extraer texto sugerido, usar todo el contenido
    if (!sections.textoSugerido && text.length > 100) {
      sections.textoSugerido = text
    }
    
    // Evaluar confianza basándose en fuentes encontradas
    if (sections.fuentes.length >= 3 && sections.marcoNormativo.length >= 2) {
      sections.confianza = 'alta'
      sections.requiereRevisionHumana = false
    } else if (sections.fuentes.length >= 1) {
      sections.confianza = 'media'
    }
    
  } catch (parseError) {
    console.warn('[parseObligacionResponse] Error parseando:', parseError.message)
    // Fallback: retornar el texto completo como sugerido
    sections.textoSugerido = text
    sections.analisisPreliminar = 'Respuesta generada correctamente pero no se pudo estructurar automáticamente.'
  }
  
  return sections
}

// ============================================
// ESTRATEGIA 2 PASOS: Para DESCRIPCIONES
// Paso 1: Google Search para contexto normativo
// Paso 2: Structured output para JSON con metadata de fotos
// ============================================

// ============================================
// PASO 1: Experto Investigador con Google Search
// Busca normativa en la web y devuelve texto (NO JSON)
// ============================================
async function fetchExpertContextFromWeb(content, fieldType, expertType, context) {
  const expertModel = await getGeminiModelExpert()
  
  const expert = expertType === 'environmental' 
    ? {
        name: 'Ingeniero Ambiental Senior',
        specialty: 'Fiscalización ambiental de hidrocarburos en Perú',
        searchFocus: 'normativa OEFA, MINAM, ECA, LMP, protocolos de fiscalización ambiental'
      }
    : {
        name: 'Abogado Especialista en Derecho Ambiental',
        specialty: 'Procedimiento Administrativo Sancionador (PAS) de OEFA',
        searchFocus: 'tipificación infracciones, TUO Ley 27444, Ley OEFA, TFA, jurisprudencia'
      }
  
  // Contexto de fotos si está disponible
  let fotosContext = ''
  if (context.fotos && context.fotos.length > 0) {
    fotosContext = `\n\n**FOTOS DEL HECHO (${context.fotos.length}):**\n`
    context.fotos.forEach((foto, i) => {
      fotosContext += `${i + 1}. ${foto.descripcion || foto.descripcionEditada || 'Sin descripción'}\n`
      if (foto.componente) fotosContext += `   - Componente: ${foto.componente}\n`
      if (foto.tipo_componente) fotosContext += `   - Tipo: ${foto.tipo_componente}\n`
    })
  }
  
  const componenteInfo = context.componente ? `\n**COMPONENTE:** ${context.componente}` : ''
  const hechoInfo = context.hechoDetec ? `\n**HECHO DETECTADO:** ${context.hechoDetec}` : ''
  
  const prompt = `Eres un ${expert.name} experto investigador con más de 25 años de experiencia en ${expert.specialty}.

**INSTRUCCIONES:**
1. USA googleSearch para buscar normativa peruana VIGENTE relevante
2. Enfócate en: ${expert.searchFocus}
3. Busca en dominios oficiales: gob.pe, oefa.gob.pe, minam.gob.pe, spij.minjus.gob.pe
4. Devuelve un RESUMEN ESTRUCTURADO en texto (NO JSON)

**TU RESPUESTA DEBE INCLUIR:**
- Normas aplicables encontradas (nombre completo, artículos específicos)
- Citas textuales relevantes de las normas
- URLs de las fuentes oficiales consultadas
- Análisis técnico/legal preliminar
- Observaciones y recomendaciones
- Texto sugerido mejorado para el acta (SOLO PÁRRAFOS, sin títulos ni encabezados)

**CONTEXTO DEL CASO:**
- Tipo de campo: ${fieldType === 'obligacion' ? 'Obligación fiscalizable' : 'Descripción de hecho'}${componenteInfo}${hechoInfo}${fotosContext}

**TEXTO A ANALIZAR:**
${stripHtml(content)}

Proporciona tu investigación detallada con todas las fuentes encontradas.`

  console.log('[ai-expert-step1] Iniciando búsqueda web con Google Search...')
  
  // PASO 1: Usar tools (googleSearch) SIN responseMimeType
  const response = await (await getGenAI3()).models.generateContent({
    model: expertModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      // ❌ NO usar responseMimeType aquí - incompatible con tools
      temperature: 0.2,
      maxOutputTokens: 8192
    }
  })
  
  const contextText = typeof response.text === 'function' ? response.text() : response.text
  console.log('[ai-expert-step1] ✅ Contexto investigado:', contextText?.substring(0, 300) + '...')
  
  return contextText
}

// ============================================
// PASO 2: Experto Estructurador con JSON Schema
// Toma el contexto investigado y devuelve JSON estructurado
// ============================================
async function structureExpertReview(content, contextInvestigado, fieldType, expertType) {
  const expertModel = await getGeminiModelExpert()
  
  const expert = expertType === 'environmental' 
    ? 'Ingeniero Ambiental Senior especializado en fiscalización OEFA'
    : 'Abogado Especialista en Derecho Ambiental y PAS OEFA'
    
  const prompt = `Eres un ${expert} que debe estructurar una revisión profesional en formato JSON.

**CONTEXTO INVESTIGADO (normativa y análisis previo):**
${contextInvestigado}

**TEXTO ORIGINAL A MEJORAR:**
${stripHtml(content)}

**TIPO DE CAMPO:** ${fieldType === 'obligacion' ? 'Obligación fiscalizable' : 'Descripción de hecho'}

**INSTRUCCIONES CRÍTICAS:**
1. Usa la información del contexto investigado para estructurar tu respuesta
2. El campo "textoSugerido" debe contener SOLO PÁRRAFOS de texto fluido:
   - SIN títulos ni encabezados (nada de "Descripción:", "Obligación:", etc.)
   - SIN markdown (**, *, ##, etc.)
   - SIN viñetas ni listas
   - SOLO redacción continua en párrafos, lista para copiar al acta
3. Las fuentes deben tener URLs reales de la investigación previa
4. Responde ÚNICAMENTE con el JSON, sin texto adicional antes o después

Devuelve el JSON con esta estructura exacta:
{
  "analisisPreliminar": "Evaluación inicial técnica o legal (texto plano)",
  "marcoNormativo": [
    {
      "norma": "Nombre completo de la norma",
      "articulo": "Artículo específico",
      "citaTextual": "Cita textual opcional",
      "relevancia": "Por qué es relevante (texto plano)"
    }
  ],
  "observaciones": [
    {
      "aspecto": "Aspecto observado (texto plano)",
      "recomendacion": "Recomendación de mejora (texto plano)",
      "prioridad": "alta|media|baja"
    }
  ],
  "textoSugerido": "SOLO PÁRRAFOS de texto fluido sin títulos ni markdown - listo para el acta",
  "fuentes": [
    {
      "titulo": "Título del documento",
      "url": "https://...",
      "seccion": "Sección citada (opcional)"
    }
  ],
  "confianza": "alta|media|baja",
  "requiereRevisionHumana": true|false
}`

  console.log('[ai-expert-step2] Estructurando respuesta en JSON...')
  
  // PASO 2: Usar responseMimeType SIN tools
  const response = await (await getGenAI3()).models.generateContent({
    model: expertModel,
    contents: prompt,
    config: {
      // ❌ NO usar tools aquí - incompatible con responseMimeType
      responseMimeType: "application/json",
      responseSchema: expertReviewJsonSchema,
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  })
  
  const jsonText = typeof response.text === 'function' ? response.text() : response.text
  console.log('[ai-expert-step2] ✅ JSON estructurado recibido')
  
  return jsonText
}

/**
 * POST /api/actas/ai-expert-structured
 * Revisión por experto usando estrategia de 2 PASOS:
 * - Paso 1: Investigador con Google Search (sin JSON)
 * - Paso 2: Estructurador con JSON Schema (sin tools)
 * Esto evita la limitación de Gemini que no permite tools + responseMimeType juntos
 */
router.post('/ai-expert-structured', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { 
      content,
      fieldType,
      expertType,
      context = {},
      actaId,
      hechoId
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'El contenido debe tener al menos 10 caracteres' 
      })
    }
    
    if (!['environmental', 'legal'].includes(expertType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tipo de experto inválido. Use "environmental" o "legal"' 
      })
    }
    
    const expertName = expertType === 'environmental' ? 'Experto Ambiental' : 'Experto Legal'
    const expertModel = await getGeminiModelExpert()
    console.log(`[actas/ai-expert-structured] Usuario ${userEmail} - ${expertName} (${expertModel})`)
    
    let expertReview
    let strategy
    
    // ============================================
    // ELEGIR ESTRATEGIA SEGÚN TIPO DE CAMPO
    // ============================================
    if (fieldType === 'obligacion') {
      // ============================================
      // OBLIGACIÓN: 1 PASO con Google Search
      // Enfocado en normativa, sin metadata de fotos
      // ============================================
      console.log(`[ai-expert-structured] Estrategia: 1 paso con Google Search (OBLIGACIÓN)`)
      strategy = '1-step (search only)'
      
      try {
        expertReview = await reviewObligacionWithSearch(content, expertType)
      } catch (searchError) {
        console.error('[ai-expert-structured] Error en búsqueda:', searchError.message)
        throw new Error(`Error consultando experto: ${searchError.message}`)
      }
      
    } else {
      // ============================================
      // DESCRIPCIÓN: 2 PASOS (search → structured)
      // Incluye metadata de fotos, análisis detallado
      // ============================================
      
      // Detectar si hay múltiples componentes separados por <hr>
      const hasMultipleComponents = content.includes('<hr') || content.includes('<HR')
      
      if (hasMultipleComponents) {
        // ============================================
        // MÚLTIPLES COMPONENTES: Procesar cada uno por separado
        // ============================================
        console.log(`[ai-expert-structured] 📦 Detectados múltiples componentes, procesando por separado...`)
        strategy = '2-step (per-component)'
        
        const components = content.split(/<hr[^>]*>/gi).filter(c => c.trim())
        const allTextosSugeridos = []
        let firstReview = null
        
        for (let i = 0; i < components.length; i++) {
          const componentContent = components[i].trim()
          if (!componentContent) continue
          
          console.log(`[ai-expert-structured] 📦 Procesando componente ${i + 1}/${components.length}...`)
          
          try {
            // PASO 1: Búsqueda web para este componente
            const step1Start = Date.now()
            let contextInvestigado
            try {
              contextInvestigado = await fetchExpertContextFromWeb(componentContent, fieldType, expertType, context)
              console.log(`[ai-expert-structured] ✓ Componente ${i + 1} Paso 1 en ${Date.now() - step1Start}ms`)
            } catch (step1Error) {
              console.warn(`[ai-expert-structured] ⚠️ Componente ${i + 1} Paso 1 error:`, step1Error.message)
              contextInvestigado = `[No se pudo realizar búsqueda web]\n\nAnaliza basándote en tu conocimiento.`
            }
            
            // PASO 2: Estructurar para este componente
            const step2Start = Date.now()
            let jsonResponse
            try {
              jsonResponse = await structureExpertReview(componentContent, contextInvestigado, fieldType, expertType)
              console.log(`[ai-expert-structured] ✓ Componente ${i + 1} Paso 2 en ${Date.now() - step2Start}ms`)
            } catch (step2Error) {
              console.warn(`[ai-expert-structured] ⚠️ Componente ${i + 1} Paso 2 error:`, step2Error.message)
              allTextosSugeridos.push(componentContent)
              continue
            }
            
            // Parsear respuesta
            try {
              const componentReview = expertReviewSchema.parse(JSON.parse(jsonResponse))
              
              // Guardar la primera revisión completa (con análisis, marco, etc.)
              if (i === 0) {
                firstReview = componentReview
              }
              
              // Extraer el título del componente del contenido original
              // Formato: <p><strong><u>Nombre</u></strong></p> o variantes
              const titleMatch = componentContent.match(/<p[^>]*>\s*<strong[^>]*>\s*<u[^>]*>([^<]+)<\/u>\s*<\/strong>\s*<\/p>/i)
                || componentContent.match(/<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<\/p>/i)
                || componentContent.match(/<strong[^>]*>\s*<u[^>]*>([^<]+)<\/u>\s*<\/strong>/i)
              
              let componentTitle = ''
              if (titleMatch) {
                const titleName = titleMatch[1].trim()
                componentTitle = `<p><strong><u>${titleName}</u></strong></p>\n\n`
              }
              
              // Guardar el texto sugerido de este componente CON el título
              if (componentReview.textoSugerido) {
                // Verificar si el texto sugerido ya tiene el título
                const suggestedHasTitle = componentReview.textoSugerido.includes('<strong><u>') 
                  || componentReview.textoSugerido.includes('<strong><u ')
                
                if (suggestedHasTitle) {
                  allTextosSugeridos.push(componentReview.textoSugerido)
                } else {
                  allTextosSugeridos.push(componentTitle + componentReview.textoSugerido)
                }
              } else {
                allTextosSugeridos.push(componentContent)
              }
              
            } catch (parseError) {
              console.warn(`[ai-expert-structured] ⚠️ Componente ${i + 1} parse error:`, parseError.message)
              allTextosSugeridos.push(componentContent)
            }
            
          } catch (compError) {
            console.warn(`[ai-expert-structured] ⚠️ Error en componente ${i + 1}:`, compError.message)
            allTextosSugeridos.push(componentContent)
          }
        }
        
        // Combinar textos sugeridos con separadores <hr>
        const combinedTextoSugerido = allTextosSugeridos.join('\n<hr style="margin: 1.5em 0; border: none; border-top: 1px solid #ccc;">\n')
        
        // Usar la primera revisión pero con el texto combinado
        if (firstReview) {
          expertReview = {
            ...firstReview,
            textoSugerido: combinedTextoSugerido
          }
        } else {
          // Fallback si no hay ninguna revisión válida
          expertReview = {
            evaluacionTecnica: 'No se pudo procesar la evaluación.',
            marcoNormativo: [],
            observaciones: [],
            textoSugerido: combinedTextoSugerido,
            referencias: []
          }
        }
        
        console.log(`[ai-expert-structured] 📦 Re-ensamblados ${allTextosSugeridos.length} componentes`)
        
      } else {
        // ============================================
        // UN SOLO COMPONENTE: Procesamiento normal
        // ============================================
        console.log(`[ai-expert-structured] Estrategia: 2 pasos (DESCRIPCIÓN con fotos/contexto)`)
        strategy = '2-step (search → structure)'
        
        // PASO 1: Investigador con Google Search
        const step1Start = Date.now()
        let contextInvestigado
        try {
          contextInvestigado = await fetchExpertContextFromWeb(content, fieldType, expertType, context)
          console.log(`[ai-expert-structured] Paso 1 completado en ${Date.now() - step1Start}ms`)
        } catch (step1Error) {
          console.error('[ai-expert-structured] Error en Paso 1 (búsqueda web):', step1Error.message)
          contextInvestigado = `[No se pudo realizar búsqueda web: ${step1Error.message}]\n\nAnaliza el texto basándote en tu conocimiento de normativa ambiental peruana.`
        }
        
        // PASO 2: Estructurador con JSON Schema
        const step2Start = Date.now()
        let jsonResponse
        try {
          jsonResponse = await structureExpertReview(content, contextInvestigado, fieldType, expertType)
          console.log(`[ai-expert-structured] Paso 2 completado en ${Date.now() - step2Start}ms`)
        } catch (step2Error) {
          console.error('[ai-expert-structured] Error en Paso 2 (estructuración):', step2Error.message)
          throw new Error(`Error estructurando respuesta: ${step2Error.message}`)
        }
        
        // Parsear y validar respuesta JSON
        try {
          expertReview = JSON.parse(jsonResponse)
          expertReview = expertReviewSchema.parse(expertReview)
        } catch (parseError) {
          console.error('[ai-expert-structured] Error parseando/validando JSON:', parseError)
          console.log('[ai-expert-structured] JSON raw:', jsonResponse?.substring(0, 500))
          return res.status(500).json({
            success: false,
            error: 'Error procesando respuesta de IA: JSON inválido',
            rawResponse: jsonResponse?.substring(0, 300)
          })
        }
      }
    }
    
    const processingTime = Date.now() - startTime
    
    // Guardar sesión
    try {
      await run(`
        INSERT INTO ai_enhancement_sessions 
        (acta_id, hecho_id, field_name, original_content, enhanced_content, 
         ai_model, tokens_input, tokens_output, processing_time_ms, user_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        actaId || null,
        hechoId || null,
        `${fieldType}_${expertType}_${strategy.replace(/[^a-z0-9]/gi, '_')}`,
        content,
        JSON.stringify(expertReview),
        `${expertModel} (${strategy})`,
        Math.ceil(content.length / 4),
        Math.ceil(JSON.stringify(expertReview).length / 4),
        processingTime,
        userEmail
      ])
    } catch (dbError) {
      console.warn('[ai-expert-structured] No se pudo guardar sesión:', dbError.message)
    }
    
    console.log(`[ai-expert-structured] ✅ ${expertName} completado en ${processingTime}ms (${strategy})`)
    
    res.json({
      success: true,
      expertType,
      expertName,
      review: expertReview,
      stats: {
        processingTimeMs: processingTime,
        strategy
      }
    })
    
  } catch (error) {
    console.error('[ai-expert-structured] Error completo:', error)
    console.error('[ai-expert-structured] Stack:', error.stack)
    res.status(500).json({ 
      success: false, 
      error: 'Error en revisión estructurada: ' + error.message,
      details: error.toString()
    })
  }
})

/**
 * Construir prompt para revisión estructurada
 */
function buildStructuredExpertPrompt(content, fieldType, expertType, context) {
  const expert = expertType === 'environmental' 
    ? {
        name: 'Ingeniero Ambiental Senior',
        specialty: 'Fiscalización ambiental de hidrocarburos',
        focus: 'Precisión técnica, terminología EPA/ISO, valores ECA/LMP, protocolos MINAM/OEFA'
      }
    : {
        name: 'Abogado Especialista en Derecho Ambiental',
        specialty: 'Procedimiento Administrativo Sancionador (PAS) de OEFA',
        focus: 'Fundamentación normativa, tipicidad, jurisprudencia TFA, citación de artículos'
      }
  
  // Contexto de fotos si está disponible
  let fotosContext = ''
  if (context.fotos && context.fotos.length > 0) {
    fotosContext = `\n\n**FOTOS DEL HECHO (${context.fotos.length}):**\n`
    context.fotos.forEach((foto, i) => {
      fotosContext += `${i + 1}. ${foto.descripcion || foto.descripcionEditada || 'Sin descripción'}\n`
      if (foto.componente) fotosContext += `   - Componente: ${foto.componente}\n`
      if (foto.tipo_componente) fotosContext += `   - Tipo: ${foto.tipo_componente}\n`
    })
  }
  
  const componenteInfo = context.componente ? `\n**COMPONENTE:** ${context.componente}` : ''
  const hechoInfo = context.hechoDetec ? `\n**HECHO DETECTADO:** ${context.hechoDetec}` : ''
  
  return `Eres un ${expert.name} con PhD y más de 25 años de experiencia en ${expert.specialty}.

**TU ENFOQUE:** ${expert.focus}

**INSTRUCCIONES:**
1. Revisa el texto para un acta de supervisión ambiental de OEFA
2. Busca en internet normativa vigente peruana (gob.pe, oefa.gob.pe, minam.gob.pe)
3. Proporciona análisis profesional de nivel senior
4. El texto sugerido debe estar LISTO para usar, sin comillas envolventes

**CONTEXTO:**
- Tipo de campo: ${fieldType === 'obligacion' ? 'Obligación fiscalizable' : 'Descripción de hecho'}${componenteInfo}${hechoInfo}${fotosContext}

**TEXTO A REVISAR:**
${stripHtml(content)}

Proporciona tu revisión profesional con fuentes verificables.`
}

/**
 * POST /api/actas/ai-generate-description
 * Generar descripción del hecho basándose en las fotos seleccionadas
 */
router.post('/ai-generate-description', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { fotos, context = {} } = req.body
    const userEmail = req.user?.email || 'local'
    
    if (!fotos || fotos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requieren fotos con descripciones para generar el texto' 
      })
    }
    
    console.log(`[actas/ai-generate-description] Generando descripción con ${fotos.length} fotos`)
    
    // Construir prompt para generación de descripción
    const prompt = buildDescriptionGeneratorPrompt(fotos, context)
    
    // Llamar a Gemini
    const result = await aiModel.generateContent(prompt)
    const response = await result.response
    const rawDescription = response.text()
    
    // Detectar si la respuesta ya es HTML o es Markdown
    const isHtml = rawDescription.includes('<p>') || rawDescription.includes('<strong>') || rawDescription.includes('<ul>')
    
    let htmlDescription
    
    if (isHtml) {
      // Ya es HTML, solo limpiar
      htmlDescription = rawDescription
        .replace(/```html\n?/g, '') // Remover bloques de código HTML
        .replace(/```\n?/g, '')
        .trim()
    } else {
      // Es Markdown, convertir a HTML
      marked.setOptions({
        breaks: true,
        gfm: true
      })
      htmlDescription = marked.parse(rawDescription)
    }
    
    // Post-procesar el HTML para mejorar compatibilidad con el editor
    htmlDescription = htmlDescription
      .replace(/<hr\s*\/?>/g, '<hr style="margin: 1em 0; border: none; border-top: 1px solid #ccc;">')
      .replace(/<p>\s*<\/p>/g, '') // Eliminar párrafos vacíos
      .replace(/\n{3,}/g, '\n\n') // Reducir saltos de línea excesivos
    
    const processingTime = Date.now() - startTime
    console.log(`[actas/ai-generate-description] ✅ Completado en ${processingTime}ms (formato: ${isHtml ? 'HTML' : 'Markdown'})`)
    
    res.json({
      success: true,
      description: htmlDescription,
      descriptionRaw: rawDescription, // También enviar el raw por si se necesita
      stats: {
        photosUsed: fotos.length,
        processingTimeMs: processingTime,
        formatDetected: isHtml ? 'html' : 'markdown'
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-generate-description] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error al generar descripción: ' + error.message 
    })
  }
})

/**
 * POST /api/actas/ai-generate-otros-aspectos
 * Generar descripción de Otros Aspectos (Sección 6) basándose en las fotos seleccionadas
 */
router.post('/ai-generate-otros-aspectos', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { fotos, context = {} } = req.body
    
    if (!fotos || fotos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requieren fotos con descripciones para generar el texto' 
      })
    }
    
    console.log(`[actas/ai-generate-otros-aspectos] Generando descripción con ${fotos.length} fotos`)
    
    // Construir prompt para generación de descripción de otros aspectos
    const prompt = buildOtrosAspectosPrompt(fotos, context)
    
    // Llamar a Gemini
    const result = await aiModel.generateContent(prompt)
    const response = await result.response
    const rawDescription = response.text()
    
    // Detectar si la respuesta ya es HTML o es Markdown
    const isHtml = rawDescription.includes('<p>') || rawDescription.includes('<strong>') || rawDescription.includes('<ul>')
    
    let htmlDescription
    
    if (isHtml) {
      htmlDescription = rawDescription
        .replace(/```html\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
    } else {
      marked.setOptions({
        breaks: true,
        gfm: true
      })
      htmlDescription = marked.parse(rawDescription)
    }
    
    htmlDescription = htmlDescription
      .replace(/<hr\s*\/?>/g, '<hr style="margin: 1em 0; border: none; border-top: 1px solid #ccc;">')
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/\n{3,}/g, '\n\n')
    
    const processingTime = Date.now() - startTime
    console.log(`[actas/ai-generate-otros-aspectos] ✅ Completado en ${processingTime}ms`)
    
    res.json({
      success: true,
      description: htmlDescription,
      stats: {
        photosUsed: fotos.length,
        processingTimeMs: processingTime
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-generate-otros-aspectos] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error al generar descripción: ' + error.message 
    })
  }
})

/**
 * Construir prompt para generación de descripción de Otros Aspectos (Sección 6)
 * Agrupa por instalación de referencia, similar a hechos pero sin obligaciones ni riesgo
 */
function buildOtrosAspectosPrompt(fotos, context) {
  const { codigoAccion, instalaciones = [] } = context
  
  // Agrupar fotos por instalación de referencia
  const normalizeText = (text) => {
    if (!text) return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
  }
  
  const capitalizeText = (text) => {
    if (!text) return ''
    return text.trim().split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  
  const fotosPorInstalacion = {}
  
  fotos.forEach((foto, idx) => {
    const instalacionRefRaw = foto.instalacion_referencia?.trim() || 'Otros'
    const nombreComponenteRaw = foto.componente || foto.tipo_componente || 'Componente sin identificar'
    const tipoComponenteRaw = foto.tipo_componente || 'Sin tipo'
    
    const instalacionKey = normalizeText(instalacionRefRaw)
    const componenteKey = normalizeText(nombreComponenteRaw)
    const tipoKey = normalizeText(tipoComponenteRaw)
    
    const instalacionRef = instalacionRefRaw === 'Otros' ? 'Otros' : capitalizeText(instalacionRefRaw)
    const nombreComponente = capitalizeText(nombreComponenteRaw)
    const tipoComponente = capitalizeText(tipoComponenteRaw)
    
    if (!fotosPorInstalacion[instalacionKey]) {
      fotosPorInstalacion[instalacionKey] = {
        nombre: instalacionRef,
        componentes: {},
        fotos: []
      }
    }
    
    const compKey = `${tipoKey}|${componenteKey}`
    if (!fotosPorInstalacion[instalacionKey].componentes[compKey]) {
      fotosPorInstalacion[instalacionKey].componentes[compKey] = {
        nombre: nombreComponente,
        tipo: tipoComponente,
        fotos: []
      }
    }
    
    fotosPorInstalacion[instalacionKey].componentes[compKey].fotos.push({
      index: idx + 1,
      filename: foto.filename,
      descripcion: foto.descripcion || ''
    })
    
    fotosPorInstalacion[instalacionKey].fotos.push({
      index: idx + 1,
      filename: foto.filename,
      descripcion: foto.descripcion || '',
      componente: nombreComponente,
      tipo_componente: tipoComponente
    })
  })
  
  // Formatear información
  const instalacionesAgrupadas = Object.values(fotosPorInstalacion).map(inst => {
    let info = `\n### INSTALACIÓN DE REFERENCIA: ${inst.nombre}`
    
    const componentesOrdenados = Object.values(inst.componentes)
      .sort((a, b) => (a.tipo || '').localeCompare(b.tipo || ''))
    
    info += `\n- Cantidad de componentes: ${componentesOrdenados.length}`
    info += `\n- Cantidad total de fotografías: ${inst.fotos.length}`
    
    info += `\n\n**Componentes de esta instalación:**`
    componentesOrdenados.forEach((comp, idx) => {
      info += `\n  ${idx + 1}. ${comp.tipo}: ${comp.nombre} (${comp.fotos.length} fotos)`
    })
    
    info += `\n\n**Descripciones de fotografías:**`
    componentesOrdenados.forEach(comp => {
      info += `\n\n  **${comp.tipo} - ${comp.nombre}:**`
      comp.fotos.forEach(foto => {
        info += `\n    - Foto ${foto.index}: ${foto.descripcion || '[Sin descripción]'}`
      })
    })
    
    return info
  }).join('\n\n---\n')
  
  const cantidadInstalaciones = Object.keys(fotosPorInstalacion).length
  const cantidadComponentesTotal = Object.values(fotosPorInstalacion)
    .reduce((sum, inst) => sum + Object.keys(inst.componentes).length, 0)

  return `Eres un REDACTOR TÉCNICO SENIOR especializado en actas de supervisión ambiental de OEFA.

Tu tarea es GENERAR una descripción para la **SECCIÓN 6: OTROS ASPECTOS** de un acta de supervisión.

**IMPORTANTE:** Esta sección documenta aspectos observados durante la supervisión que NO constituyen hechos verificados ni incumplimientos, pero que son relevantes de registrar. Son observaciones complementarias.

**EVIDENCIA FOTOGRÁFICA AGRUPADA POR INSTALACIÓN DE REFERENCIA (${cantidadInstalaciones} instalaciones, ${cantidadComponentesTotal} componentes, ${fotos.length} fotos):**
${instalacionesAgrupadas}

**INSTRUCCIONES:**

1. **TONO Y ESTILO:**
   - Objetivo, descriptivo e informativo
   - NO se trata de incumplimientos, son observaciones generales
   - Tono neutro, sin juicios de valor sobre cumplimiento

2. **ESTRUCTURA POR INSTALACIÓN:**
   - Genera una sección para CADA instalación de referencia
   - Subtítulo en negrita para cada instalación
   - Párrafo(s) describiendo las observaciones

3. **CONTENIDO:**
   - Describir las condiciones observadas de forma objetiva
   - Mencionar los componentes verificados
   - Incluir aspectos relevantes del estado de las instalaciones
   - NO mencionar obligaciones ni potenciales incumplimientos

4. **FORMATO DE SALIDA (HTML):**
   - Subtítulos: <p><strong><u>Nombre de la Instalación</u></strong></p>
   - Párrafos: <p>texto</p>
   - Separador entre instalaciones: <hr>
   - NO incluir listas de fotografías (el sistema las añade automáticamente)

**EJEMPLO:**

<p><strong><u>Batería Rincón</u></strong></p>

<p>Durante la verificación en campo de la Batería Rincón se observaron las condiciones generales de operación de los componentes. Los tanques de almacenamiento se encontraban debidamente identificados y con señalización visible. Las áreas de contención mostraban adecuado mantenimiento.</p>

<hr>

<p><strong><u>Planta de Tratamiento</u></strong></p>

<p>Se verificó el estado general de la Planta de Tratamiento, observándose que los equipos de proceso se encontraban operativos. Las estructuras de confinamiento presentaban condiciones normales de operación.</p>

**GENERA LA DESCRIPCIÓN PARA OTROS ASPECTOS EN HTML (sin preámbulos, directo al contenido):**`
}

/**
 * Construir prompt para generación de descripción de hecho
 * VERSIÓN 3.0: Genera descripciones AGRUPADAS POR INSTALACIÓN DE REFERENCIA
 * Cada instalación agrupa múltiples componentes ordenados por tipo_componente
 * Basado en análisis de actas reales de expertos humanos (Acta Exp 100-2025)
 */
function buildDescriptionGeneratorPrompt(fotos, context) {
  const { 
    hechoDetec, 
    tituloHecho,
    descripcionOriginal,
    obligacion,
    componentes, 
    modalidad, 
    codigoAccion,
    presuntoIncumplimiento,
    subsanado
  } = context
  
  // ==================== AGRUPAR FOTOS POR INSTALACIÓN DE REFERENCIA ====================
  // VERSIÓN 3.0: Las actas se organizan por INSTALACIÓN DE REFERENCIA
  // Cada instalación agrupa varios componentes con sus fotos
  
  // IMPORTANTE: Función para normalizar texto (case-insensitive, sin espacios extra)
  // Esto evita que "Planta de residuos" y "Planta de Residuos" se traten como distintos
  const normalizeText = (text) => {
    if (!text) return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
  }
  
  // Función para capitalizar texto para display
  const capitalizeText = (text) => {
    if (!text) return ''
    return text.trim().split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  
  const fotosPorInstalacion = {}
  
  fotos.forEach((foto, idx) => {
    // La instalación de referencia es el agrupador principal
    // IMPORTANTE: Si instalacion_referencia está vacío, usar "Otros" (NO el componente)
    const instalacionRefRaw = foto.instalacion_referencia?.trim() || 'Otros'
    const nombreComponenteRaw = foto.componente || foto.locacion || foto.tipo_componente || 'Componente sin identificar'
    const tipoComponenteRaw = foto.tipo_componente || 'Sin tipo'
    
    // Claves normalizadas para agrupamiento (case-insensitive)
    const instalacionKey = normalizeText(instalacionRefRaw)
    const componenteKey = normalizeText(nombreComponenteRaw)
    const tipoKey = normalizeText(tipoComponenteRaw)
    
    // Nombres para display (capitalizados consistentemente)
    const instalacionRef = instalacionRefRaw === 'Otros' ? 'Otros' : capitalizeText(instalacionRefRaw)
    const nombreComponente = capitalizeText(nombreComponenteRaw)
    const tipoComponente = capitalizeText(tipoComponenteRaw)
    
    if (!fotosPorInstalacion[instalacionKey]) {
      fotosPorInstalacion[instalacionKey] = {
        nombre: instalacionRef, // Display name capitalizado
        coordenadas: foto.coordenadas || (foto.x && foto.y ? `${foto.x}, ${foto.y}` : ''),
        componentes: {}, // Map de componentes dentro de esta instalación
        fotos: []
      }
    }
    
    // Agregar componente al map de componentes de esta instalación (usando clave normalizada)
    const compKey = `${tipoKey}|${componenteKey}`
    if (!fotosPorInstalacion[instalacionKey].componentes[compKey]) {
      fotosPorInstalacion[instalacionKey].componentes[compKey] = {
        nombre: nombreComponente,
        tipo: tipoComponente,
        coordenadas: foto.coordenadas || (foto.x && foto.y ? `${foto.x}, ${foto.y}` : ''),
        fotos: []
      }
    }
    
    // Agregar foto al componente específico
    fotosPorInstalacion[instalacionKey].componentes[compKey].fotos.push({
      index: idx + 1,
      filename: foto.filename,
      descripcion: foto.descripcion || '',
      fecha: foto.fecha || '',
      supervisor: foto.supervisor || '',
      hecho_detec: foto.hecho_detec || '',
      subcomponente: foto.subcomponente || ''
    })
    
    // También mantener lista plana de fotos para la instalación
    fotosPorInstalacion[instalacionKey].fotos.push({
      index: idx + 1,
      filename: foto.filename,
      descripcion: foto.descripcion || '',
      componente: nombreComponente,
      tipo_componente: tipoComponente
    })
  })
  
  // Formatear la información agrupada por INSTALACIÓN DE REFERENCIA
  const instalacionesAgrupadas = Object.values(fotosPorInstalacion).map(inst => {
    let info = `\n### INSTALACIÓN DE REFERENCIA: ${inst.nombre}`
    if (inst.coordenadas) info += `\n- Coordenadas UTM: ${inst.coordenadas}`
    
    // Obtener lista de componentes ordenados por tipo_componente
    const componentesOrdenados = Object.values(inst.componentes)
      .sort((a, b) => {
        // Ordenar por tipo_componente primero, luego por nombre
        const tipoCompare = (a.tipo || '').localeCompare(b.tipo || '')
        if (tipoCompare !== 0) return tipoCompare
        return (a.nombre || '').localeCompare(b.nombre || '')
      })
    
    info += `\n- Cantidad de componentes: ${componentesOrdenados.length}`
    info += `\n- Cantidad total de fotografías: ${inst.fotos.length}`
    
    // Listar componentes ordenados por tipo
    info += `\n\n**Componentes de esta instalación (ordenados por tipo):**`
    componentesOrdenados.forEach((comp, idx) => {
      info += `\n  ${idx + 1}. ${comp.tipo}: ${comp.nombre} (${comp.fotos.length} fotos)`
    })
    
    // Descripciones de fotos agrupadas por componente
    info += `\n\n**Descripciones de fotografías por componente:**`
    componentesOrdenados.forEach(comp => {
      info += `\n\n  **${comp.tipo} - ${comp.nombre}:**`
      comp.fotos.forEach(foto => {
        info += `\n    - Foto ${foto.index}: ${foto.descripcion || '[Sin descripción]'}`
        if (foto.subcomponente) info += ` (Subcomponente: ${foto.subcomponente})`
      })
    })
    
    return info
  }).join('\n\n---\n')
  
  // Construir secciones de contexto
  const componentesInfo = componentes?.length > 0 
    ? `- **Componentes supervisados:** ${componentes.join(', ')}`
    : ''
  
  const tituloCortoInfo = hechoDetec 
    ? `- **Título del hecho (corto):** ${hechoDetec}`
    : ''
    
  const tituloLargoInfo = tituloHecho 
    ? `- **Título del hecho (largo):** ${tituloHecho}`
    : ''
    
  const descripcionOriginalInfo = descripcionOriginal 
    ? `- **Descripción original del CA:** ${descripcionOriginal}`
    : ''
    
  const obligacionInfo = obligacion 
    ? `\n**OBLIGACIÓN FISCALIZABLE YA REDACTADA:**\n${stripHtml(obligacion)}`
    : ''
    
  const estadoInfo = presuntoIncumplimiento 
    ? `- **Presunto incumplimiento:** ${presuntoIncumplimiento}${subsanado ? ` | Subsanado: ${subsanado}` : ''}`
    : ''
    
  const cantidadInstalaciones = Object.keys(fotosPorInstalacion).length
  const cantidadComponentesTotal = Object.values(fotosPorInstalacion)
    .reduce((sum, inst) => sum + Object.keys(inst.componentes).length, 0)

  return `Eres un REDACTOR TÉCNICO SENIOR especializado en actas de supervisión ambiental de OEFA para el sector hidrocarburos.

Tu tarea es GENERAR una descripción ANALÍTICA de un hecho verificado, **ORGANIZADA POR INSTALACIÓN DE REFERENCIA**.

**IMPORTANTE:** Las actas de OEFA se estructuran por INSTALACIÓN DE REFERENCIA. Cada instalación agrupa varios componentes evaluados. La estructura debe ser:
1. Subtítulo de la instalación de referencia (en negrita y subrayado)
2. Descripción narrativa de lo observado en esa instalación

**NOTA:** NO incluyas frases de cierre sobre Figuras NI listas de componentes. El sistema las añadirá automáticamente al exportar.

**CONTEXTO (SOLO PARA TU ANÁLISIS INTERNO - NO REPETIR EN EL TEXTO):**
${tituloCortoInfo}
${tituloLargoInfo}
${componentesInfo}
${estadoInfo}
${descripcionOriginalInfo}
${obligacionInfo}

**EVIDENCIA FOTOGRÁFICA AGRUPADA POR INSTALACIÓN DE REFERENCIA (${cantidadInstalaciones} instalaciones, ${cantidadComponentesTotal} componentes, ${fotos.length} fotos):**
${instalacionesAgrupadas}

**INSTRUCCIONES CRÍTICAS:**

1. **ESTRUCTURA POR INSTALACIÓN DE REFERENCIA (OBLIGATORIO):**
   - Genera una sección para CADA instalación de referencia identificada
   - Cada sección debe tener:
     a) Subtítulo de la instalación en negrita y subrayado
     b) Párrafo(s) describiendo lo observado en esa instalación (sintetizando la información de todos sus componentes)
   - **NO incluyas frases sobre Figuras NI listas de componentes** - el sistema las añade automáticamente al exportar
   
2. **CONTENIDO POR INSTALACIÓN:**
   - Nombre exacto de la instalación de referencia
   - Ubicación geográfica con coordenadas UTM (si disponibles)
   - Descripción narrativa que SINTETIZA las observaciones de todos los componentes de esa instalación

3. **ESTILO:**
   - Técnico-legal, preciso y objetivo
   - Tono imparcial, pasado, tercera persona
   - SIN redundancias ni preámbulos innecesarios
   - NO mencionar código de acción ni nombres de archivos de fotos
   - NO incluir preámbulos como "A continuación se presenta..."

4. **FORMATO DE SALIDA (HTML):**
   - IMPORTANTE: Genera HTML válido, NO Markdown
   - Subtítulos de instalación: <p><strong><u>Nombre de la Instalación de Referencia</u></strong></p>
   - Párrafos: <p>texto</p>
   - Separador entre instalaciones: <hr>
   - Notas al pie si hay referencias: <sup>[1]</sup>
   - **NO incluyas listas de componentes ni frases sobre fotografías** - el sistema las genera automáticamente

**EJEMPLO DE ESTRUCTURA CORRECTA (HTML):**

<p><strong><u>Batería Rincón</u></strong></p>

<p>Durante la acción de supervisión a la Batería Rincón, ubicada en las coordenadas UTM WGS 84 Zona 17 [X]E, [Y]N, se observó [HALLAZGO PRINCIPAL]. [Descripción detallada sintetizando las observaciones de todos los componentes de esta instalación].</p>

<hr>

<p><strong><u>Planta de Tratamiento Norte</u></strong></p>

<p>Se realizó la verificación en campo de la Planta de Tratamiento Norte, ubicada en [UBICACIÓN], donde se constató que [HALLAZGO]. [Descripción detallada].</p>

<hr>

[Continuar con cada instalación de referencia...]

**GENERA LA DESCRIPCIÓN EN HTML ORGANIZADA POR INSTALACIÓN DE REFERENCIA (sin preámbulos, sin listas de componentes, directo al contenido):**`
}

/**
 * Construir prompt para revisión de experto
 */
function buildExpertPrompt(content, fieldType, expertType, context) {
  const expertProfiles = {
    environmental: {
      name: 'Ingeniero Ambiental Senior',
      role: `Eres un INGENIERO AMBIENTAL SENIOR con PhD en Ciencias Ambientales y más de 25 años de experiencia en:

**ESPECIALIZACIÓN TÉCNICA:**
- Evaluación de Impacto Ambiental (EIA) en proyectos de hidrocarburos upstream y downstream
- Caracterización y remediación de suelos contaminados con hidrocarburos (TPH, BTEX, PAHs)
- Diseño e implementación de sistemas de monitoreo ambiental continuo
- Gestión integral de residuos peligrosos según normativa RESPEL
- Modelamiento de dispersión de contaminantes en matrices ambientales
- Auditorías ambientales ISO 14001 y sistemas de gestión ambiental
- Análisis de riesgo ambiental y salud humana (RBCA, ASTM E1739)

**EXPERIENCIA INSTITUCIONAL:**
- Ex-especialista técnico de la Dirección de Supervisión de OEFA
- Perito ambiental acreditado ante el Poder Judicial
- Consultor senior para EIAs de proyectos energéticos`,
      focus: `**ENFOQUE DE REVISIÓN TÉCNICA:**

1. **PRECISIÓN TERMINOLÓGICA:**
   - Verificar nomenclatura técnica según estándares internacionales (EPA, ASTM, ISO)
   - Corregir unidades de medida y parámetros analíticos
   - Validar metodologías de muestreo y análisis referenciadas

2. **RIGUROSIDAD CIENTÍFICA:**
   - Evaluar coherencia con principios de química ambiental y ecotoxicología
   - Verificar valores de referencia (ECA, LMP) y su correcta aplicación
   - Identificar vacíos técnicos en la descripción del impacto

3. **TRAZABILIDAD TÉCNICA:**
   - Asegurar que cada afirmación técnica tenga sustento verificable
   - Proponer parámetros adicionales de monitoreo si corresponde
   - Sugerir protocolos específicos aplicables`,
      sources: `**MARCO TÉCNICO-NORMATIVO A CONSULTAR:**

*Estándares de Calidad Ambiental (ECA):*
- D.S. N° 011-2017-MINAM: ECA para Suelo (Anexo I: parámetros orgánicos e inorgánicos)
- D.S. N° 004-2017-MINAM: ECA para Agua (Categorías 1, 3 y 4)
- D.S. N° 003-2017-MINAM: ECA para Aire

*Límites Máximos Permisibles (LMP):*
- D.S. N° 037-2008-PCM: LMP para efluentes de hidrocarburos
- D.S. N° 014-2010-MINAM: LMP para emisiones de hidrocarburos

*Protocolos y Guías Técnicas:*
- R.M. N° 085-2014-MINAM: Guía de muestreo de suelos
- Protocolo Nacional de Monitoreo de Calidad de Agua
- Guía para Remediación de Sitios Contaminados (MINAM)
- EPA Method 8015/8260/8270 para análisis de hidrocarburos

*Documentos OEFA:*
- Guías de supervisión ambiental por subsector
- Metodología de evaluación de daño ambiental
- Criterios técnicos para determinación de infracciones`
    },
    legal: {
      name: 'Abogado Especialista en Derecho Ambiental',
      role: `Eres un ABOGADO ESPECIALISTA EN DERECHO AMBIENTAL con Maestría en Derecho Administrativo y Regulatorio, con más de 20 años de experiencia en:

**ESPECIALIZACIÓN JURÍDICA:**
- Procedimiento Administrativo Sancionador (PAS) ambiental
- Derecho regulatorio del sector energético e hidrocarburos
- Litigios ante el Tribunal de Fiscalización Ambiental (TFA)
- Responsabilidad ambiental civil, administrativa y penal
- Instrumentos de Gestión Ambiental (EIA, DIA, PAMA, PAC)
- Derecho comparado ambiental (OCDE, Convenios internacionales)

**EXPERIENCIA INSTITUCIONAL:**
- Ex-asesor legal de la Presidencia del Consejo Directivo de OEFA
- Árbitro en controversias ambientales
- Docente universitario de Derecho Ambiental
- Autor de publicaciones especializadas en fiscalización ambiental`,
      focus: `**ENFOQUE DE REVISIÓN LEGAL (NIVEL HARVARD):**

1. **FUNDAMENTACIÓN NORMATIVA EXHAUSTIVA:**
   - Citar artículos, numerales, incisos y literales específicos
   - Establecer la jerarquía normativa aplicable
   - Identificar normas derogadas vs. vigentes
   - Aplicar principios de interpretación jurídica

2. **ANÁLISIS DE TIPICIDAD:**
   - Verificar subsunción del hecho en el tipo infractor
   - Identificar elementos objetivos y subjetivos de la infracción
   - Evaluar agravantes y atenuantes aplicables
   - Considerar causales de exclusión de responsabilidad

3. **JURISPRUDENCIA Y PRECEDENTES:**
   - Citar resoluciones del TFA aplicables al caso
   - Referenciar precedentes vinculantes de OEFA
   - Incluir criterios interpretativos consolidados

4. **FORMATO DE CITACIÓN ACADÉMICA:**
   - Usar formato: "Artículo X, numeral Y, inciso Z) del [Norma]"
   - Incluir fecha de publicación y vigencia
   - Referenciar modificatorias si aplican`,
      sources: `**MARCO JURÍDICO APLICABLE (con articulado específico):**

*Ley General del Ambiente - Ley N° 28611:*
- Art. 30°: De los planes de descontaminación
- Art. 31°: Del Estándar de Calidad Ambiental
- Art. 32°: Del Límite Máximo Permisible
- Art. 74°: De la responsabilidad general
- Art. 142°-144°: De la responsabilidad por daño ambiental

*Ley del SINEFA - Ley N° 29325 (mod. Ley N° 30011):*
- Art. 11°: Funciones generales del OEFA
- Art. 17°: Infracciones administrativas
- Art. 19°: Medidas administrativas
- Art. 20°-A: Medidas correctivas
- Art. 21°: Régimen de incentivos

*Reglamento del PAS de OEFA - D.S. N° 019-2019-MINAM:*
- Art. 4°: Principios del procedimiento
- Art. 14°: Inicio del procedimiento
- Art. 16°: Tipificación de infracciones
- Art. 25°: Determinación de la sanción
- Art. 34°: Medidas cautelares

*Reglamento de Supervisión - Res. N° 006-2019-OEFA/CD:*
- Art. 6°: Tipos de supervisión
- Art. 11°: Acta de supervisión
- Art. 15°: Medios probatorios

*Tipificación de Infracciones - Res. N° 042-2023-OEFA/CD:*
- Anexo I: Infracciones en hidrocarburos
- Escala de sanciones y criterios de graduación

*Jurisprudencia del TFA:*
- Precedentes vinculantes sobre carga de la prueba
- Criterios sobre responsabilidad objetiva
- Resoluciones sobre proporcionalidad de sanciones`
    }
  }

  const expert = expertProfiles[expertType]
  const fieldContext = {
    obligacion: 'una OBLIGACIÓN FISCALIZABLE para un acta de supervisión ambiental de OEFA',
    descripcion: 'la DESCRIPCIÓN DE UN HECHO VERIFICADO durante una supervisión ambiental de OEFA'
  }

  const componenteInfo = context.componente ? `\n**COMPONENTE SUPERVISADO:** ${context.componente}` : ''
  const hechoInfo = context.hechoDetec ? `\n**HECHO DETECTADO:** ${context.hechoDetec}` : ''

  const formatInstructions = expertType === 'legal' 
    ? `**FORMATO DE RESPUESTA (HTML) - ESTILO ACADÉMICO-LEGAL:**

<div class="expert-review">
  <h4>⚖️ Dictamen del ${expert.name}</h4>
  
  <div class="assessment">
    <h5>I. Análisis Preliminar</h5>
    <p>[Evaluación de la solidez jurídica del texto. Identificar fortalezas y debilidades en la fundamentación normativa.]</p>
  </div>
  
  <div class="legal-framework">
    <h5>II. Marco Normativo Aplicable</h5>
    <p>[Identificar el marco legal específico con citación completa de artículos, numerales e incisos]</p>
    <ul>
      <li><strong>[Norma]:</strong> Artículo X, numeral Y, inciso Z) - "[Cita textual del dispositivo]"</li>
    </ul>
  </div>
  
  <div class="suggestions">
    <h5>III. Observaciones y Recomendaciones</h5>
    <ul>
      <li><strong>[Aspecto jurídico]:</strong> [Recomendación específica con fundamento legal]</li>
    </ul>
  </div>
  
  <div class="jurisprudence">
    <h5>IV. Jurisprudencia Relevante</h5>
    <ul>
      <li><strong>[Resolución TFA/OEFA]:</strong> [Criterio aplicable al caso]</li>
    </ul>
  </div>
  
  <div class="recommended-text">
    <h5>V. Texto Sugerido con Fundamentación Legal</h5>
    <blockquote>[IMPORTANTE: Genera aquí el texto mejorado en HTML válido. Usa <p> para párrafos, <strong><u>Nombre</u></strong> para subtítulos de componentes, <ul><li> para listas. Mantén la estructura del original (componentes, descripciones, etc.). NO uses comillas ni Markdown.]</blockquote>
  </div>
  
  <div class="sources">
    <h5>📚 Referencias Normativas y Bibliográficas</h5>
    <ul>
      <li><a href="[URL]" target="_blank">[Norma o documento]</a> - [Artículos específicos citados]</li>
    </ul>
  </div>
</div>`
    : `**FORMATO DE RESPUESTA (HTML) - ESTILO TÉCNICO-CIENTÍFICO:**

<div class="expert-review">
  <h4>🔬 Informe Técnico del ${expert.name}</h4>
  
  <div class="assessment">
    <h5>I. Evaluación Técnica</h5>
    <p>[Análisis de la precisión técnica del texto. Verificar terminología, parámetros y metodologías.]</p>
  </div>
  
  <div class="technical-framework">
    <h5>II. Marco Técnico-Normativo</h5>
    <p>[Identificar estándares aplicables: ECA, LMP, protocolos de monitoreo]</p>
    <ul>
      <li><strong>[Parámetro/Estándar]:</strong> [Valor de referencia y norma que lo establece]</li>
    </ul>
  </div>
  
  <div class="suggestions">
    <h5>III. Observaciones Técnicas</h5>
    <ul>
      <li><strong>[Aspecto técnico]:</strong> [Corrección o mejora sugerida con fundamento científico]</li>
    </ul>
  </div>
  
  <div class="methodology">
    <h5>IV. Consideraciones Metodológicas</h5>
    <p>[Protocolos de muestreo, análisis o evaluación aplicables]</p>
  </div>
  
  <div class="recommended-text">
    <h5>V. Texto Técnico Sugerido</h5>
    <blockquote>[IMPORTANTE: Genera aquí el texto mejorado en HTML válido. Usa <p> para párrafos, <strong><u>Nombre</u></strong> para subtítulos de componentes, <ul><li> para listas. Mantén la estructura del original (componentes, descripciones, etc.). NO uses comillas ni Markdown.]</blockquote>
  </div>
  
  <div class="sources">
    <h5>📚 Referencias Técnicas y Normativas</h5>
    <ul>
      <li><a href="[URL]" target="_blank">[Documento técnico o norma]</a> - [Sección específica relevante]</li>
    </ul>
  </div>
</div>`

  return `${expert.role}

${expert.focus}

${expert.sources}

**INSTRUCCIONES CRÍTICAS:**
1. Revisa el texto del usuario que está redactando ${fieldContext[fieldType] || 'un documento técnico'}
2. Proporciona sugerencias de mejora ESPECÍFICAS, FUNDAMENTADAS y de ALTO NIVEL PROFESIONAL
3. SIEMPRE cita tus fuentes con enlaces verificables a portales oficiales
4. El nivel de detalle debe ser el de un profesional senior presentando ante un tribunal o comité técnico

${formatInstructions}

**REGLAS ESTRICTAS:**
- NO inventes información ni cites normas inexistentes
- SIEMPRE incluye artículos, numerales e incisos específicos cuando cites normativa
- Los enlaces deben ser a fuentes oficiales verificables (gob.pe, oefa.gob.pe, minam.gob.pe)
- Si no encuentras una fuente específica, indícalo claramente
- El texto sugerido debe ser de calidad profesional, listo para usar en un documento oficial
- NUNCA ENVUELVAS el texto sugerido en comillas (" o ") - el texto debe ir directamente dentro del <blockquote>

**CRÍTICO - PRESERVAR ESTRUCTURA HTML:**
- El texto original viene en HTML con MÚLTIPLES COMPONENTES separados
- CADA componente tiene un subtítulo: <p><strong><u>Nombre del Componente</u></strong></p>
- Los componentes están SEPARADOS por <hr>
- DEBES mantener EXACTAMENTE esta estructura en el texto sugerido
- NO unifiques todo en un solo párrafo - mantén la separación por componente
- El texto sugerido DEBE usar: <p>, <strong>, <u>, <ul>, <li>, <hr>
${componenteInfo}
${hechoInfo}

**TEXTO ORIGINAL (HTML - PRESERVAR ESTRUCTURA):**
${content}

**PROPORCIONA TU REVISIÓN PROFESIONAL COMO ${expert.name.toUpperCase()}:**`
}

/**
 * Construir prompt especializado para mejora de texto OEFA
 */
function buildEnhancementPrompt(content, fieldType, context) {
  const baseInstructions = `Eres un experto redactor técnico-legal especializado en documentos de fiscalización ambiental de la OEFA (Organismo de Evaluación y Fiscalización Ambiental del Perú).

Tu tarea es mejorar el siguiente texto para un acta de supervisión ambiental, siguiendo estas directrices:

**REGLAS DE REDACCIÓN CRÍTICAS:**
1. Usa lenguaje técnico-legal preciso pero comprensible
2. Mantén un tono objetivo e imparcial (sin juicios de valor)
3. Sé específico y concreto, evita generalidades
4. Usa terminología del sector hidrocarburos y ambiental de Perú
5. Estructura la información de forma lógica y clara
6. Evita redundancias innecesarias PERO mantén TODA la información sustancial
7. Mantén la extensión razonable (ni muy corto ni excesivamente largo)
8. Usa formato HTML simple (párrafos <p>, listas <ul>/<ol>, negritas <strong>, cursivas <em>)
9. NO inventes datos, fechas, nombres o referencias que no estén en el texto original
10. **PRESERVA ABSOLUTAMENTE TODA la información factual del texto original** - NO elimines:
    - Nombres de componentes, equipos o instalaciones
    - Códigos identificadores (TK-101, EA-01, etc.)
    - Coordenadas UTM o ubicaciones geográficas
    - Fechas, horarios o plazos
    - Valores numéricos, mediciones o cantidades
    - Referencias normativas o legales
    - Nombres de supervisores, empresas o responsables
    - Descripciones de hallazgos o evidencias
    - Cualquier detalle que tenga relevancia técnica o legal
11. Tu objetivo es MEJORAR la redacción, NO resumir ni simplificar el contenido
12. Si el texto original tiene información técnica detallada, MANTENLA COMPLETA

**FORMATO DE SALIDA:**
- Devuelve SOLO el texto mejorado en HTML
- NO incluyas explicaciones, comentarios ni metadatos
- NO uses markdown, solo HTML

**CRÍTICO - PRESERVAR ESTRUCTURA:**
- Si el texto tiene MÚLTIPLES COMPONENTES separados, MANTÉN esa separación
- Los subtítulos de componentes usan: <p><strong><u>Nombre</u></strong></p>
- Los componentes están SEPARADOS por <hr>
- NO unifiques todo en un solo párrafo
- PRESERVA: subtítulos, separadores <hr>, listas <ul><li>, párrafos <p>`

  const fieldInstructions = {
    obligacion: `
**CONTEXTO: OBLIGACIÓN FISCALIZABLE**
Este campo describe la obligación ambiental que se está verificando o que se presume incumplida.

**ESTRUCTURA RECOMENDADA:**
1. Referencia normativa específica (Ley, D.S., R.M., etc.)
2. Artículo y/o numeral aplicable
3. Descripción de la obligación
4. Si aplica, referencia al IGA (EIA, DIA, PAMA, etc.)

**EJEMPLO DE BUENA REDACCIÓN:**
"De conformidad con el artículo 5 del Decreto Supremo N° 039-2014-EM, Reglamento para la Protección Ambiental en las Actividades de Hidrocarburos, el titular está obligado a implementar medidas de prevención y control de derrames en todas las instalaciones de almacenamiento de hidrocarburos."`,

    descripcion: `
**CONTEXTO: DESCRIPCIÓN DEL HECHO VERIFICADO**
Este campo describe objetivamente lo observado durante la supervisión.

**ESTRUCTURA RECOMENDADA:**
1. Ubicación específica (componente, coordenadas si aplica)
2. Descripción objetiva de lo observado
3. Estado o condición encontrada
4. Evidencia o medio probatorio (referencia a fotografías)

**EJEMPLO DE BUENA REDACCIÓN:**
"Durante la inspección del tanque de almacenamiento TK-101, ubicado en las coordenadas UTM WGS84 Zona 18S: Este 456789, Norte 9123456, se verificó la presencia de manchas de hidrocarburo en el área de contención secundaria, con un área aproximada de 2 m². Se observó que el sistema de drenaje del cubeto se encontraba obstruido con sedimentos."`,

    titulo: `
**CONTEXTO: TÍTULO DEL HECHO VERIFICADO**
Este campo es el título descriptivo del hecho que aparecerá en el acta.

**CARACTERÍSTICAS:**
- Conciso pero descriptivo (máximo 2 líneas)
- Debe identificar claramente el hecho
- Usar sustantivos y verbos en infinitivo o participio
- NO incluir juicios de valor

**EJEMPLO DE BUENA REDACCIÓN:**
"Presencia de suelo con hidrocarburos en el área de contención del tanque TK-101"`,

    requerimiento: `
**CONTEXTO: REQUERIMIENTO DE SUBSANACIÓN**
Este campo describe las acciones que el administrado debe realizar para subsanar el hallazgo.

**ESTRUCTURA RECOMENDADA:**
1. Acción específica requerida
2. Plazo (si aplica)
3. Referencia a la obligación incumplida
4. Medio de verificación del cumplimiento`,

    requerimiento_subsanacion: `
**CONTEXTO: REQUERIMIENTO DE SUBSANACIÓN**
Este campo describe las acciones que el administrado debe realizar para subsanar el hallazgo, o indica que no aplica.

**ESTRUCTURA RECOMENDADA:**
1. Si aplica:
   - Acción específica requerida al administrado
   - Plazo para la subsanación (días hábiles o calendario)
   - Referencia a la obligación incumplida
   - Medio de verificación del cumplimiento
2. Si no aplica:
   - Indicar "No aplica" seguido de la justificación
   - Mencionar que el administrado puede presentar información adicional

**TEXTO GENÉRICO CUANDO NO APLICA:**
"No aplica; sin embargo, el administrado puede presentar información sobre los componentes analizados en el presente hecho que considere pertinentes."

**EJEMPLO DE REQUERIMIENTO:**
"Se requiere al administrado presentar, en un plazo de quince (15) días hábiles, el plan de remediación del área afectada, incluyendo cronograma de actividades y metas de remediación de acuerdo a los ECA para suelo vigentes."`,

    foto_descripcion: `
**CONTEXTO: DESCRIPCIÓN DE FOTOGRAFÍA (MEDIO PROBATORIO)**
Este campo describe objetivamente lo que se observa en una fotografía tomada durante la supervisión ambiental.

**CARACTERÍSTICAS CRÍTICAS:**
- Descripción visual objetiva de lo capturado en la imagen
- Identificación clara del componente, instalación o área fotografiada
- Estado o condición observada en el momento de la toma
- Elementos relevantes visibles (equipos, estructuras, condiciones ambientales)
- NO incluir interpretaciones o juicios de valor
- Texto breve pero suficientemente descriptivo (2-4 oraciones)

**ESTRUCTURA RECOMENDADA:**
1. Identificación del elemento fotografiado (qué se ve)
2. Ubicación o contexto espacial (dónde está)
3. Estado o condición observable (cómo se ve)
4. Detalles relevantes visibles (elementos adicionales importantes)

**FORMATO DE SALIDA:**
- Texto plano SIN formato HTML
- NO usar listas, solo párrafos continuos
- Lenguaje técnico preciso pero comprensible

**EJEMPLO DE BUENA DESCRIPCIÓN:**
"En la imagen se observa el tanque de almacenamiento TK-101, el cual presenta manchas de coloración oscura en su superficie exterior, consistentes con residuos de hidrocarburos. Se aprecia que el área de contención secundaria (cubeto) muestra acumulación de agua con presencia de iridiscencia, indicativa de posible contaminación por hidrocarburos."`
  }

  const contextInfo = context.componente ? `\n**COMPONENTE:** ${context.componente}` : ''
  const hechoInfo = context.hechoDetec || context.hecho_detec ? `\n**HECHO DETECTADO:** ${context.hechoDetec || context.hecho_detec}` : ''
  const tipoComponenteInfo = context.tipo_componente ? `\n**TIPO DE COMPONENTE:** ${context.tipo_componente}` : ''
  const supervisorInfo = context.supervisor ? `\n**SUPERVISOR:** ${context.supervisor}` : ''
  
  return `${baseInstructions}

${fieldInstructions[fieldType] || ''}
${contextInfo}
${tipoComponenteInfo}
${hechoInfo}
${supervisorInfo}

**TEXTO A MEJORAR:**
${content}

**TEXTO MEJORADO (solo HTML):**`
}

// ============================================
// HISTORIAL DE VERSIONES
// ============================================
/**
 * POST /api/actas/versions
 * Guardar una nueva versión de contenido
 */
router.post('/versions', async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      actaId,
      fieldName,
      content,
      versionType = 'manual',
      aiModel: model,
      aiPrompt,
      aiTokens,
      previousVersionId
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    
    // Obtener número de versión
    const lastVersionResult = await query(`
      SELECT MAX(version_number) as max_version 
      FROM content_versions 
      WHERE entity_type = ? AND entity_id = ? AND field_name = ?
    `, [entityType, entityId, fieldName])
    
    const versionNumber = (lastVersionResult.rows[0]?.max_version || 0) + 1
    
    // Desmarcar versión actual anterior
    await run(`
      UPDATE content_versions 
      SET is_current = 0 
      WHERE entity_type = ? AND entity_id = ? AND field_name = ?
    `, [entityType, entityId, fieldName])
    
    // Insertar nueva versión
    const result = await run(`
      INSERT INTO content_versions 
      (entity_type, entity_id, acta_id, field_name, content, content_plain,
       version_number, version_type, ai_model, ai_prompt_used, ai_tokens_used,
       previous_version_id, created_by, is_current)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      entityType,
      entityId,
      actaId,
      fieldName,
      content,
      stripHtml(content),
      versionNumber,
      versionType,
      model || null,
      aiPrompt || null,
      aiTokens || null,
      previousVersionId || null,
      userEmail
    ])
    
    res.json({
      success: true,
      version: {
        id: result.lastInsertRowid,
        versionNumber,
        versionType,
        createdAt: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('[actas/versions] Error guardando versión:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/versions/:entityType/:entityId/:fieldName
 * Obtener historial de versiones de un campo
 */
router.get('/versions/:entityType/:entityId/:fieldName', async (req, res) => {
  try {
    const { entityType, entityId, fieldName } = req.params
    
    const versionsResult = await query(`
      SELECT 
        id, version_number, version_type, content, 
        ai_model, is_current, is_accepted, created_by, created_at
      FROM content_versions
      WHERE entity_type = ? AND entity_id = ? AND field_name = ?
      ORDER BY version_number DESC
    `, [entityType, entityId, fieldName])
    
    res.json({ success: true, versions: versionsResult.rows })
    
  } catch (error) {
    console.error('[actas/versions] Error obteniendo versiones:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/versions/:id/accept
 * Aceptar una versión AI y marcarla como actual
 */
router.put('/versions/:id/accept', async (req, res) => {
  try {
    const { id } = req.params
    
    // Obtener la versión
    const versionResult = await get(`SELECT * FROM content_versions WHERE id = ?`, [id])
    const version = versionResult.rows[0]
    
    if (!version) {
      return res.status(404).json({ success: false, error: 'Versión no encontrada' })
    }
    
    // Desmarcar otras versiones como actuales
    await run(`
      UPDATE content_versions 
      SET is_current = 0 
      WHERE entity_type = ? AND entity_id = ? AND field_name = ?
    `, [version.entity_type, version.entity_id, version.field_name])
    
    // Marcar esta versión como aceptada y actual
    await run(`
      UPDATE content_versions 
      SET is_current = 1, is_accepted = 1 
      WHERE id = ?
    `, [id])
    
    // Actualizar sesión de AI si existe
    await run(`
      UPDATE ai_enhancement_sessions 
      SET was_accepted = 1, decided_at = datetime('now')
      WHERE enhanced_content = ? AND was_accepted = 0
    `, [version.content])
    
    res.json({ success: true, message: 'Versión aceptada' })
    
  } catch (error) {
    console.error('[actas/versions] Error aceptando versión:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/versions/:id/restore
 * Restaurar una versión anterior como actual
 */
router.put('/versions/:id/restore', async (req, res) => {
  try {
    const { id } = req.params
    
    const versionResult = await get(`SELECT * FROM content_versions WHERE id = ?`, [id])
    const version = versionResult.rows[0]
    
    if (!version) {
      return res.status(404).json({ success: false, error: 'Versión no encontrada' })
    }
    
    // Desmarcar otras versiones
    await run(`
      UPDATE content_versions 
      SET is_current = 0 
      WHERE entity_type = ? AND entity_id = ? AND field_name = ?
    `, [version.entity_type, version.entity_id, version.field_name])
    
    // Marcar esta versión como actual
    await run(`UPDATE content_versions SET is_current = 1 WHERE id = ?`, [id])
    
    res.json({ 
      success: true, 
      message: 'Versión restaurada',
      content: version.content
    })
    
  } catch (error) {
    console.error('[actas/versions] Error restaurando versión:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/versions/all/:entityType/:entityId/:fieldName
 * Eliminar TODAS las versiones de un campo (excepto la actual) sin reiniciar numeración
 */
router.delete('/versions/all/:entityType/:entityId/:fieldName', async (req, res) => {
  try {
    const { entityType, entityId, fieldName } = req.params
    const { resetNumbering } = req.query // Si es true, reinicia la numeración
    
    // Obtener la versión actual si existe
    const currentVersionResult = await get(`
      SELECT * FROM content_versions 
      WHERE entity_type = ? AND entity_id = ? AND field_name = ? AND is_current = 1
    `, [entityType, entityId, fieldName])
    const currentVersion = currentVersionResult.rows[0]
    
    if (resetNumbering === 'true') {
      // Eliminar TODAS las versiones (incluyendo la actual)
      const result = await run(`
        DELETE FROM content_versions 
        WHERE entity_type = ? AND entity_id = ? AND field_name = ?
      `, [entityType, entityId, fieldName])
      
      console.log(`[actas/versions] Eliminadas ${result.changes} versiones con reinicio de numeración`)
      
      res.json({ 
        success: true, 
        message: `${result.changes} versiones eliminadas. La numeración se reiniciará desde 1.`,
        deletedCount: result.changes
      })
    } else {
      // Eliminar solo versiones NO actuales (mantener la actual)
      const result = await run(`
        DELETE FROM content_versions 
        WHERE entity_type = ? AND entity_id = ? AND field_name = ? AND is_current = 0
      `, [entityType, entityId, fieldName])
      
      console.log(`[actas/versions] Eliminadas ${result.changes} versiones (manteniendo actual)`)
      
      res.json({ 
        success: true, 
        message: `${result.changes} versiones antiguas eliminadas. La versión actual se mantiene.`,
        deletedCount: result.changes,
        keptCurrentVersion: !!currentVersion
      })
    }
    
  } catch (error) {
    console.error('[actas/versions] Error eliminando versiones:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/versions/:id
 * Eliminar una versión específica
 */
router.delete('/versions/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const versionResult = await get(`SELECT * FROM content_versions WHERE id = ?`, [id])
    const version = versionResult.rows[0]
    
    if (!version) {
      return res.status(404).json({ success: false, error: 'Versión no encontrada' })
    }
    
    // No permitir eliminar la versión actual
    if (version.is_current) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar la versión actual. Restaure otra versión primero.' 
      })
    }
    
    // Eliminar la versión
    await run(`DELETE FROM content_versions WHERE id = ?`, [id])
    
    console.log(`[actas/versions] Versión ${id} eliminada`)
    
    res.json({ 
      success: true, 
      message: 'Versión eliminada correctamente'
    })
    
  } catch (error) {
    console.error('[actas/versions] Error eliminando versión:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Helper: Eliminar HTML de un texto
 */
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================
// EXPERTO RAG - Enriquecimiento con documentos
// ============================================

/**
 * GET /api/actas/rag-stores
 * Lista stores disponibles para RAG, separando los del CA actual de los globales
 */
router.get('/rag-stores', async (req, res) => {
  try {
    const { caCode } = req.query
    
    const result = await listFileSearchStores()
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        error: result.error || 'Error listando stores' 
      })
    }
    
    // Separar stores del CA actual vs otros
    const caStores = []
    const globalStores = []
    
    for (const store of result.stores) {
      const displayName = store.displayName || ''
      
      // Detectar si es un store de CA
      // Patrones: "CA-001-2024", "CA001-2024", "CA-XXXX", etc.
      const isCAStore = /^CA[-_]?\d{2,4}[-_]?\d{4}/i.test(displayName)
      
      // Si es el CA actual
      if (caCode && displayName.toUpperCase().includes(caCode.toUpperCase())) {
        caStores.unshift({ ...store, isCurrentCA: true })
      } else if (isCAStore) {
        caStores.push({ ...store, isCurrentCA: false })
      } else {
        globalStores.push(store)
      }
    }
    
    res.json({
      success: true,
      caStores,
      globalStores,
      currentCA: caCode || null
    })
    
  } catch (error) {
    console.error('[actas/rag-stores] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/rag-store-for-ca
 * Obtiene o crea un store para un CA específico
 */
router.post('/rag-store-for-ca', async (req, res) => {
  try {
    const { caCode } = req.body
    
    if (!caCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere código de CA' 
      })
    }
    
    // Normalizar nombre del store
    const storeDisplayName = `CA-${caCode.toUpperCase()}`
    
    // Buscar si ya existe
    const existingStores = await listFileSearchStores()
    
    if (existingStores.success) {
      const existingStore = existingStores.stores.find(
        s => s.displayName?.toUpperCase() === storeDisplayName.toUpperCase()
      )
      
      if (existingStore) {
        console.log(`[actas/rag-store-for-ca] Store encontrado para CA ${caCode}: ${existingStore.name}`)
        return res.json({
          success: true,
          store: existingStore,
          created: false
        })
      }
    }
    
    // No existe, crear nuevo store
    console.log(`[actas/rag-store-for-ca] Creando store para CA ${caCode}...`)
    const createResult = await createFileSearchStore(storeDisplayName)
    
    if (!createResult.success) {
      return res.status(500).json({
        success: false,
        error: createResult.error || 'Error creando store'
      })
    }
    
    console.log(`[actas/rag-store-for-ca] ✅ Store creado: ${createResult.store.name}`)
    
    res.json({
      success: true,
      store: createResult.store,
      created: true
    })
    
  } catch (error) {
    console.error('[actas/rag-store-for-ca] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/rag-store-documents/:storeName
 * Lista documentos de un store
 */
router.get('/rag-store-documents/:storeName(*)', async (req, res) => {
  try {
    const { storeName } = req.params
    
    const result = await listDocumentsInStore(storeName)
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Error listando documentos'
      })
    }
    
    res.json({
      success: true,
      documents: result.documents
    })
    
  } catch (error) {
    console.error('[actas/rag-store-documents] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/rag-upload
 * Sube un documento a un store RAG
 */
router.post('/rag-upload', ragUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó archivo'
      })
    }
    
    const { storeName, displayName } = req.body
    
    if (!storeName) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({
        success: false,
        error: 'Se requiere storeName'
      })
    }
    
    const fileDisplayName = displayName || req.file.originalname
    
    console.log(`[actas/rag-upload] Subiendo: ${fileDisplayName} (${req.file.size} bytes) a ${storeName}`)
    
    const result = await uploadFileToStore(
      req.file.path,
      storeName,
      fileDisplayName,
      req.user?.email || 'local'
    )
    
    // Limpiar archivo temporal
    try {
      fs.unlinkSync(req.file.path)
    } catch (err) {
      console.warn('[actas/rag-upload] No se pudo eliminar archivo temporal:', err)
    }
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Error subiendo archivo'
      })
    }
    
    console.log(`[actas/rag-upload] ✅ Archivo subido exitosamente`)
    
    res.json({
      success: true,
      message: 'Archivo subido exitosamente',
      documentName: result.documentName
    })
    
  } catch (error) {
    // Limpiar archivo si hay error
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path) } catch (e) {}
    }
    console.error('[actas/rag-upload] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/rag-document/:documentName
 * Elimina un documento de un store
 */
router.delete('/rag-document/:documentName(*)', async (req, res) => {
  try {
    const { documentName } = req.params
    
    const result = await deleteDocument(documentName)
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Error eliminando documento'
      })
    }
    
    res.json({
      success: true,
      message: 'Documento eliminado'
    })
    
  } catch (error) {
    console.error('[actas/rag-document] Error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/ai-expert-rag
 * Enriquece texto usando RAG (File Search) con documentos
 */
router.post('/ai-expert-rag', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const { 
      content,
      fieldType,
      storeName,
      customInstruction,
      actaId,
      hechoId
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    
    // Validaciones
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'El contenido debe tener al menos 10 caracteres' 
      })
    }
    
    if (!storeName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Debe seleccionar un store de documentos' 
      })
    }
    
    if (!customInstruction || customInstruction.trim().length < 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Debe proporcionar una instrucción (mínimo 5 caracteres)' 
      })
    }
    
    console.log(`[actas/ai-expert-rag] Usuario ${userEmail} - Store: ${storeName}`)
    console.log(`[actas/ai-expert-rag] Instrucción: ${customInstruction.substring(0, 100)}...`)
    
    // Detectar si el contenido tiene múltiples componentes separados por <hr>
    const hasMultipleComponents = content.includes('<hr') || content.includes('<HR')
    let enrichedText
    
    if (hasMultipleComponents && fieldType === 'descripcion') {
      // Procesar cada componente por separado para preservar la estructura
      console.log(`[actas/ai-expert-rag] 📦 Detectados múltiples componentes, procesando por separado...`)
      
      const components = content.split(/<hr[^>]*>/gi).filter(c => c.trim())
      const enrichedComponents = []
      
      for (let i = 0; i < components.length; i++) {
        const componentContent = components[i].trim()
        if (!componentContent) continue
        
        try {
          const result = await enrichTextWithRAG(
            stripHtml(componentContent),
            customInstruction,
            storeName,
            fieldType
          )
          
          if (result.success) {
            let enrichedComponent = result.enrichedText
              .replace(/```html\n?/gi, '')
              .replace(/```\n?/g, '')
              .trim()
            
            const hasHtml = /<[a-z][\s\S]*>/i.test(enrichedComponent)
            if (!hasHtml) {
              enrichedComponent = marked.parse(enrichedComponent)
            }
            
            enrichedComponents.push(enrichedComponent)
          } else {
            enrichedComponents.push(componentContent)
          }
          
          console.log(`[actas/ai-expert-rag] ✓ Componente ${i + 1}/${components.length} procesado`)
        } catch (compError) {
          console.warn(`[actas/ai-expert-rag] ⚠️ Error en componente ${i + 1}:`, compError.message)
          enrichedComponents.push(componentContent)
        }
      }
      
      // Re-ensamblar con separadores <hr>
      enrichedText = enrichedComponents.join('\n<hr style="margin: 1.5em 0; border: none; border-top: 1px solid #ccc;">\n')
      console.log(`[actas/ai-expert-rag] 📦 Re-ensamblados ${enrichedComponents.length} componentes`)
      
    } else {
      // Procesamiento normal (sin múltiples componentes)
      const result = await enrichTextWithRAG(
        stripHtml(content),
        customInstruction,
        storeName,
        fieldType
      )
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || 'Error en el enriquecimiento RAG',
          blockedReason: result.blockedReason || null
        })
      }
      
      enrichedText = result.enrichedText
        .replace(/```html\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim()
      
      const hasHtml = /<[a-z][\s\S]*>/i.test(enrichedText)
      if (!hasHtml) {
        enrichedText = marked.parse(enrichedText)
      }
    }
    
    const processingTime = Date.now() - startTime
    console.log(`[actas/ai-expert-rag] ✅ Completado en ${processingTime}ms`)
    
    res.json({
      success: true,
      enrichedText: enrichedText,
      stats: {
        processingTimeMs: processingTime,
        storeName
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-expert-rag] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error al enriquecer con RAG: ' + error.message 
    })
  }
})

/**
 * POST /api/actas/ai-generate-risk-analysis
 * Generar campos de análisis de riesgo con Gemini (justificación, impacto, medidas)
 */
router.post('/ai-generate-risk-analysis', async (req, res) => {
  const startTime = Date.now()
  
  try {
    const {
      // Contexto del hecho
      obligacion,
      descripcionHecho,
      tituloHecho,
      // Datos del análisis de riesgo (Anexo 4 OEFA)
      entornoAfectacion,
      factorCantidad,
      factorPeligrosidad,
      factorExtension,
      factorPersonasExpuestas,
      factorMedioAfectado,
      probabilidadOcurrencia,
      // Valores calculados
      scoreConsecuencia,
      valorConsecuencia,
      valorRiesgo,
      nivelRiesgo,
      tipoIncumplimiento
    } = req.body
    
    const userEmail = req.user?.email || 'local'
    console.log(`[actas/ai-generate-risk-analysis] Usuario: ${userEmail}`)
    
    // Construir prompt para Gemini
    const prompt = `Eres un experto en fiscalización ambiental del OEFA (Organismo de Evaluación y Fiscalización Ambiental) de Perú. 

Tu tarea es generar 3 textos técnicos basados en el análisis de riesgo ambiental realizado según la metodología del Anexo 4 del Reglamento de Supervisión del OEFA.

## CONTEXTO DEL HECHO VERIFICADO

**Título del hecho:** ${tituloHecho || 'No especificado'}

**Obligación fiscalizable incumplida:**
${obligacion || 'No especificada'}

**Descripción del hecho verificado:**
${descripcionHecho || 'No especificada'}

## ANÁLISIS DE RIESGO REALIZADO (METODOLOGÍA ANEXO 4 OEFA)

**Entorno afectado:** ${entornoAfectacion === 'HUMANO' ? 'Entorno Humano (salud, seguridad, bienes de personas)' : 'Entorno Natural (flora, fauna, suelo, agua, aire)'}

### Factores de Consecuencia:
- **Cantidad (Cuadro 2/6):** ${factorCantidad} de 4 ${getFactorDescription('cantidad', factorCantidad)}
- **Peligrosidad (Cuadro 3/7):** ${factorPeligrosidad} de 4 ${getFactorDescription('peligrosidad', factorPeligrosidad)} (×2 en fórmula)
- **Extensión (Cuadro 4/8):** ${factorExtension} de 4 ${getFactorDescription('extension', factorExtension)}
${entornoAfectacion === 'HUMANO' 
  ? `- **Personas Potencialmente Expuestas (Cuadro 5):** ${factorPersonasExpuestas} de 4 ${getFactorDescription('personas', factorPersonasExpuestas)}`
  : `- **Medio Potencialmente Afectado (Cuadro 9):** ${factorMedioAfectado} de 4 ${getFactorDescription('medio', factorMedioAfectado)}`
}

### Probabilidad de Ocurrencia (Cuadro 1):
- **Valor:** ${probabilidadOcurrencia} de 5 ${getFactorDescription('probabilidad', probabilidadOcurrencia)}

### Resultados del Cálculo:
- **Puntuación de Consecuencia:** ${scoreConsecuencia} (rango 5-20)
- **Gravedad de Consecuencia:** ${valorConsecuencia} de 5 (${getCondicionConsecuenciaText(valorConsecuencia)})
- **Fórmula aplicada:** ${factorCantidad} + 2×${factorPeligrosidad} + ${factorExtension} + ${entornoAfectacion === 'HUMANO' ? factorPersonasExpuestas : factorMedioAfectado} = ${scoreConsecuencia}
- **Valor de Riesgo:** ${probabilidadOcurrencia} × ${valorConsecuencia} = ${valorRiesgo} (rango 1-25)
- **Nivel de Riesgo:** ${nivelRiesgo?.toUpperCase()} (Cuadro 12)
- **Tipo de Incumplimiento sugerido:** ${tipoIncumplimiento}

## TAREA

Genera 3 textos TÉCNICOS, PUNTUALES y ESPECÍFICOS. Sé DIRECTO y CONCISO. Usa terminología del sector ambiental peruano (OEFA, MINAM, LMP, ECA).

### 1. JUSTIFICACIÓN DEL ANÁLISIS DE RIESGO (80-120 palabras)
Redacta de forma técnica y directa:
- Fundamento del entorno afectado elegido
- Sustento técnico de cada factor asignado (cantidad, peligrosidad, extensión, factor específico)
- Justificación de la probabilidad
- Conclusión del nivel de riesgo

### 2. IMPACTO POTENCIAL (80-120 palabras)
Describe de forma técnica y específica:
- Impactos directos sobre el componente ambiental afectado
- Consecuencias a corto y mediano plazo
- Receptores afectados (ecosistema, población, recursos)
- Grado de reversibilidad

### 3. MEDIDAS DE MITIGACIÓN SUGERIDAS (80-120 palabras)
Proporciona acciones técnicas específicas:
- Medidas inmediatas de contención
- Acciones de remediación o restauración
- Medidas preventivas
- Monitoreo requerido

## ESTILO REQUERIDO
- Lenguaje técnico-legal del sector ambiental peruano
- Oraciones cortas y directas
- Sin frases de relleno ni introducciones innecesarias
- Mencionar normativa cuando sea pertinente (D.S., R.M., etc.)
- Usar términos específicos: "componente ambiental", "receptor sensible", "área de influencia", "medida correctiva"

## FORMATO DE RESPUESTA

Responde EXACTAMENTE en este formato JSON (sin markdown, solo JSON puro):
{
  "justificacion": "texto aquí...",
  "impactoPotencial": "texto aquí...",
  "medidasMitigacion": "texto aquí..."
}

NO uses viñetas ni listas. Solo párrafos técnicos y fluidos. Máximo 120 palabras por campo.`

    // Llamar a Gemini
    const result = await aiModel.generateContent(prompt)
    const response = await result.response
    let generatedText = response.text()
    
    // Limpiar respuesta de markdown si viene envuelta
    generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    // Parsear JSON
    let parsedResult
    try {
      parsedResult = JSON.parse(generatedText)
    } catch (parseError) {
      console.error('[actas/ai-generate-risk-analysis] Error parseando JSON:', parseError)
      // Intentar extraer los campos manualmente si el JSON está mal formado
      const justMatch = generatedText.match(/"justificacion"\s*:\s*"([^"]+)"/s)
      const impactoMatch = generatedText.match(/"impactoPotencial"\s*:\s*"([^"]+)"/s)
      const medidasMatch = generatedText.match(/"medidasMitigacion"\s*:\s*"([^"]+)"/s)
      
      if (justMatch || impactoMatch || medidasMatch) {
        parsedResult = {
          justificacion: justMatch ? justMatch[1] : '',
          impactoPotencial: impactoMatch ? impactoMatch[1] : '',
          medidasMitigacion: medidasMatch ? medidasMatch[1] : ''
        }
      } else {
        throw new Error('No se pudo parsear la respuesta de Gemini')
      }
    }
    
    const processingTime = Date.now() - startTime
    console.log(`[actas/ai-generate-risk-analysis] ✅ Completado en ${processingTime}ms`)
    
    res.json({
      success: true,
      ...parsedResult,
      stats: {
        processingTimeMs: processingTime
      }
    })
    
  } catch (error) {
    console.error('[actas/ai-generate-risk-analysis] Error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Error al generar análisis de riesgo: ' + error.message 
    })
  }
})

// ============================================
// COMPONENTES SUPERVISADOS (Sección 3 - Tabla de componentes)
// ============================================

/**
 * GET /api/actas/:actaId/componentes
 * Obtener todos los componentes de un acta
 */
router.get('/:actaId/componentes', async (req, res) => {
  try {
    const { actaId } = req.params
    
    const result = await query(`SELECT * FROM actas_componentes WHERE acta_id = ? ORDER BY numero ASC`, [actaId])
    
    res.json({ success: true, componentes: result.rows })
  } catch (error) {
    console.error('[actas] Error obteniendo componentes:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/componentes
 * Crear un nuevo componente
 */
router.post('/:actaId/componentes', async (req, res) => {
  try {
    const { actaId } = req.params
    const { componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, globalid_origen } = req.body
    
    if (!componente) {
      return res.status(400).json({ success: false, error: 'componente es requerido' })
    }
    
    const maxResult = await get(`SELECT COALESCE(MAX(numero), 0) as max FROM actas_componentes WHERE acta_id = ?`, [actaId])
    const numero = (maxResult.rows[0]?.max || 0) + 1
    
    const result = await run(`
      INSERT INTO actas_componentes (acta_id, numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, globalid_origen, es_marino)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [actaId, numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, globalid_origen, req.body.es_marino ? 1 : 0])
    
    const newResult = await get(`SELECT * FROM actas_componentes WHERE id = ?`, [result.lastInsertRowid])
    
    res.json({ success: true, componente: newResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error creando componente:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/componentes/bulk
 * Crear múltiples componentes de una vez (para carga inicial desde caData)
 */
router.post('/:actaId/componentes/bulk', async (req, res) => {
  try {
    const { actaId } = req.params
    const { componentes } = req.body
    
    if (!Array.isArray(componentes) || componentes.length === 0) {
      return res.status(400).json({ success: false, error: 'componentes debe ser un array no vacío' })
    }
    
    const database = await ensureDb()
    database.run('BEGIN TRANSACTION')
    
    let insertedCount = 0
    try {
      for (let i = 0; i < componentes.length; i++) {
        const comp = componentes[i]
        database.run(`
          INSERT INTO actas_componentes (acta_id, numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, globalid_origen, es_marino)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [actaId, comp.numero || i + 1, comp.componente, comp.tipo_componente, comp.instalacion_referencia, comp.norte, comp.este, comp.zona, comp.altitud, comp.descripcion, comp.globalid_origen, comp.es_marino ? 1 : 0])
        insertedCount++
      }
      database.run('COMMIT')
    } catch (txErr) {
      database.run('ROLLBACK')
      throw txErr
    }
    
    const newResult = await query(`SELECT * FROM actas_componentes WHERE acta_id = ? ORDER BY numero ASC`, [actaId])
    
    res.json({ success: true, componentes: newResult.rows, count: insertedCount })
  } catch (error) {
    console.error('[actas] Error creando componentes en bulk:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/componentes/:componenteId
 * Actualizar un componente
 */
router.put('/:actaId/componentes/:componenteId', async (req, res) => {
  try {
    const { componenteId } = req.params
    const { numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, es_marino } = req.body
    
    await run(`
      UPDATE actas_componentes SET
        numero = COALESCE(?, numero), componente = COALESCE(?, componente),
        tipo_componente = COALESCE(?, tipo_componente), instalacion_referencia = COALESCE(?, instalacion_referencia),
        norte = COALESCE(?, norte), este = COALESCE(?, este), zona = COALESCE(?, zona),
        altitud = COALESCE(?, altitud), descripcion = COALESCE(?, descripcion), es_marino = COALESCE(?, es_marino)
      WHERE id = ?
    `, [numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, descripcion, es_marino !== undefined ? (es_marino ? 1 : 0) : null, componenteId])
    
    const updatedResult = await get(`SELECT * FROM actas_componentes WHERE id = ?`, [componenteId])
    
    res.json({ success: true, componente: updatedResult.rows[0] })
  } catch (error) {
    console.error('[actas] Error actualizando componente:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/:actaId/componentes/:componenteId
 * Eliminar un componente
 */
router.delete('/:actaId/componentes/:componenteId', async (req, res) => {
  try {
    const { actaId, componenteId } = req.params
    
    await run(`DELETE FROM actas_componentes WHERE id = ? AND acta_id = ?`, [componenteId, actaId])
    
    const componentesResult = await query(`SELECT id FROM actas_componentes WHERE acta_id = ? ORDER BY numero ASC`, [actaId])
    
    const database = await ensureDb()
    for (let i = 0; i < componentesResult.rows.length; i++) {
      database.run(`UPDATE actas_componentes SET numero = ? WHERE id = ?`, [i + 1, componentesResult.rows[i].id])
    }
    
    res.json({ success: true, message: 'Componente eliminado' })
  } catch (error) {
    console.error('[actas] Error eliminando componente:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/componentes/sync-from-photo
 * Sincroniza ediciones de foto con actas_componentes
 * Si existe un componente con el globalid_origen, lo actualiza
 * Si no existe, crea uno nuevo
 * Body: { globalid, componente, tipo_componente, instalacion_referencia, descripcion, norte, este, altitud }
 */
router.put('/:actaId/componentes/sync-from-photo', authenticate, async (req, res) => {
  try {
    const { actaId } = req.params
    const { globalid, componente, tipo_componente, instalacion_referencia, descripcion, norte, este, altitud } = req.body
    
    if (!globalid) {
      return res.status(400).json({ success: false, error: 'globalid es requerido' })
    }
    
    console.log(`[actas] 🔄 Sync componente desde foto: actaId=${actaId}, globalid=${globalid}`)
    
    const existingResult = await get(`SELECT * FROM actas_componentes WHERE acta_id = ? AND globalid_origen = ?`, [actaId, globalid])
    const existingComponente = existingResult.rows[0]
    
    if (existingComponente) {
      await run(`
        UPDATE actas_componentes SET componente = COALESCE(?, componente), tipo_componente = COALESCE(?, tipo_componente),
          instalacion_referencia = COALESCE(?, instalacion_referencia), descripcion = COALESCE(?, descripcion),
          norte = COALESCE(?, norte), este = COALESCE(?, este), altitud = COALESCE(?, altitud)
        WHERE id = ?
      `, [componente, tipo_componente, instalacion_referencia, descripcion, norte, este, altitud, existingComponente.id])
      
      const updatedResult = await get(`SELECT * FROM actas_componentes WHERE id = ?`, [existingComponente.id])
      console.log(`[actas] ✅ Componente actualizado: id=${existingComponente.id}`)
      res.json({ success: true, componente: updatedResult.rows[0], action: 'updated' })
    } else {
      const maxResult = await get(`SELECT MAX(numero) as max FROM actas_componentes WHERE acta_id = ?`, [actaId])
      const numero = (maxResult.rows[0]?.max || 0) + 1
      
      const result = await run(`
        INSERT INTO actas_componentes (acta_id, numero, componente, tipo_componente, instalacion_referencia, norte, este, altitud, descripcion, globalid_origen, es_marino)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [actaId, numero, componente, tipo_componente, instalacion_referencia, norte, este, altitud, descripcion, globalid])
      
      const newResult = await get(`SELECT * FROM actas_componentes WHERE id = ?`, [result.lastInsertRowid])
      console.log(`[actas] ✅ Componente creado: id=${result.lastInsertRowid}`)
      res.json({ success: true, componente: newResult.rows[0], action: 'created' })
    }
  } catch (error) {
    console.error('[actas] Error sincronizando componente desde foto:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/:actaId/componentes/by-globalid/:globalid
 * Obtener componente editado por globalid_origen
 * Usado para cargar ediciones previas al abrir una foto
 */
router.get('/:actaId/componentes/by-globalid/:globalid', authenticate, async (req, res) => {
  try {
    const { actaId, globalid } = req.params
    
    const result = await get(`SELECT * FROM actas_componentes WHERE acta_id = ? AND globalid_origen = ?`, [actaId, globalid])
    const componente = result.rows[0]
    
    if (componente) {
      res.json({ success: true, componente, found: true })
    } else {
      res.json({ success: true, componente: null, found: false })
    }
  } catch (error) {
    console.error('[actas] Error buscando componente por globalid:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/:actaId/componentes
 * Eliminar TODOS los componentes de un acta (para recarga)
 */
router.delete('/:actaId/componentes', async (req, res) => {
  try {
    const { actaId } = req.params
    
    const result = await run(`DELETE FROM actas_componentes WHERE acta_id = ?`, [actaId])
    
    res.json({ success: true, message: 'Todos los componentes eliminados', count: result.rowCount })
  } catch (error) {
    console.error('[actas] Error eliminando todos los componentes:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/componentes/sync-from-hechos
 * Sincroniza automáticamente los componentes desde las fotos seleccionadas en los hechos completados
 * Extrae componentes únicos de arcgis_records basándose en los globalids de fotos_seleccionadas
 */
router.post('/:actaId/componentes/sync-from-hechos', async (req, res) => {
  try {
    const { actaId } = req.params
    
    console.log(`[actas] 🔄 Sincronizando componentes desde hechos para acta ${actaId}`)
    
    // 1. Obtener todos los hechos completados del borrador
    const hechosResult = await query(`SELECT id, fotos_seleccionadas FROM actas_hechos WHERE acta_id = ? AND is_completed = 1`, [actaId])
    const hechos = hechosResult.rows
    
    // 2. Extraer todos los globalids de las fotos seleccionadas
    const globalidsSet = new Set()
    hechos.forEach(hecho => {
      if (hecho.fotos_seleccionadas) {
        try {
          const fotos = JSON.parse(hecho.fotos_seleccionadas)
          fotos.forEach(f => {
            if (f.globalid) globalidsSet.add(f.globalid)
          })
        } catch (e) {
          console.warn(`[actas] Error parsing fotos_seleccionadas para hecho ${hecho.id}`)
        }
      }
    })
    
    const globalids = Array.from(globalidsSet)
    console.log(`[actas] 📊 Encontrados ${globalids.length} globalids únicos en fotos seleccionadas`)
    
    if (globalids.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No hay fotos seleccionadas en los hechos', 
        componentes: [],
        count: 0 
      })
    }
    
    // 3. Obtener datos actualizados de arcgis_records para esos globalids
    const placeholders = globalids.map(() => '?').join(',')
    const registrosResult = await query(`SELECT globalid, componente, tipo_componente, instalacion_referencia, norte, este, altitud, zona FROM arcgis_records WHERE globalid IN (${placeholders}) AND is_deleted = 0 AND componente IS NOT NULL AND componente != ''`, globalids)
    const registros = registrosResult.rows
    
    console.log(`[actas] 📊 Encontrados ${registros.length} registros con componentes en arcgis_records`)
    
    // 4. Agrupar componentes únicos (por componente + instalación)
    const componentesMap = new Map()
    registros.forEach(reg => {
      const key = `${(reg.componente || '').toLowerCase()}|${(reg.instalacion_referencia || '').toLowerCase()}`
      if (!componentesMap.has(key)) {
        componentesMap.set(key, {
          componente: reg.componente,
          tipo_componente: reg.tipo_componente,
          instalacion_referencia: reg.instalacion_referencia,
          norte: reg.norte,
          este: reg.este,
          altitud: reg.altitud,
          zona: reg.zona,
          globalid_origen: reg.globalid
        })
      }
    })
    
    const componentesUnicos = Array.from(componentesMap.values())
    console.log(`[actas] 📊 ${componentesUnicos.length} componentes únicos a sincronizar`)
    
    // 5. Sincronizar con actas_componentes
    const database = await ensureDb()
    const maxResult = await get(`SELECT MAX(numero) as max FROM actas_componentes WHERE acta_id = ?`, [actaId])
    let numero = (maxResult.rows[0]?.max || 0) + 1
    
    for (const comp of componentesUnicos) {
      const updateResult = await run(`UPDATE actas_componentes SET componente = ?, tipo_componente = ?, instalacion_referencia = ?, norte = ?, este = ?, zona = ?, altitud = ? WHERE acta_id = ? AND globalid_origen = ?`,
        [comp.componente, comp.tipo_componente, comp.instalacion_referencia, comp.norte, comp.este, comp.zona, comp.altitud, actaId, comp.globalid_origen])
      
      if (updateResult.rowCount === 0) {
        await run(`INSERT INTO actas_componentes (acta_id, numero, componente, tipo_componente, instalacion_referencia, norte, este, zona, altitud, globalid_origen, es_marino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [actaId, numero++, comp.componente, comp.tipo_componente, comp.instalacion_referencia, comp.norte, comp.este, comp.zona, comp.altitud, comp.globalid_origen])
      }
    }
    
    // 6. Obtener componentes actualizados
    const componentesResult = await query(`SELECT * FROM actas_componentes WHERE acta_id = ? ORDER BY numero ASC`, [actaId])
    const componentesActualizados = componentesResult.rows
    
    console.log(`[actas] ✅ Sincronización completada: ${componentesActualizados.length} componentes`)
    
    res.json({ 
      success: true, 
      message: `${componentesUnicos.length} componentes sincronizados desde hechos`,
      componentes: componentesActualizados,
      count: componentesActualizados.length
    })
  } catch (error) {
    console.error('[actas] Error sincronizando componentes desde hechos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/componentes-disponibles/:codigoAccion
 * Obtener los componentes disponibles de un CA desde los datos sincronizados
 * Incluye descripciones de fotos de tabla 1/2
 * 
 * VERSIÓN 2.0: Agrupa por INSTALACIÓN DE REFERENCIA
 * Dentro de cada instalación, los componentes se ordenan por tipo_componente
 */
router.get('/componentes-disponibles/:codigoAccion', async (req, res) => {
  try {
    const { codigoAccion } = req.params
    
    // Función para normalizar texto (case-insensitive)
    const normalizeText = (text) => {
      if (!text) return ''
      return text.trim().toLowerCase().replace(/\s+/g, ' ')
    }
    
    // Función para capitalizar texto para display
    const capitalizeText = (text) => {
      if (!text) return ''
      return text.trim().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    }
    
    // Obtener registros del CA con datos de componentes
    const registrosResult = await query(`
      SELECT globalid, componente, tipo_componente, instalacion_referencia, norte, este, altitud, zona, descrip_1, descrip_2, actividad, raw_json
      FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0 AND (actividad LIKE 'F.%' OR actividad LIKE 'F_%')
      ORDER BY instalacion_referencia, tipo_componente, componente
    `, [codigoAccion, codigoAccion])
    const registros = registrosResult.rows
    
    // Agrupar por instalación de referencia -> componente
    // Usamos claves normalizadas para evitar duplicados por diferencias de mayúsculas
    const instalacionesMap = new Map()
    
    registros.forEach(reg => {
      if (!reg.componente) return
      
      // Normalizar para agrupamiento
      // IMPORTANTE: Si instalacion_referencia está vacío, usar "Otros" (NO el componente)
      const instalacionRaw = reg.instalacion_referencia?.trim() || 'Otros'
      const instalacionKey = normalizeText(instalacionRaw)
      const instalacionDisplay = instalacionRaw === 'Otros' ? 'Otros' : capitalizeText(instalacionRaw)
      
      const componenteRaw = reg.componente
      const componenteKey = normalizeText(componenteRaw)
      const componenteDisplay = capitalizeText(componenteRaw)
      
      const tipoRaw = reg.tipo_componente || 'Sin tipo'
      const tipoKey = normalizeText(tipoRaw)
      const tipoDisplay = capitalizeText(tipoRaw)
      
      // Crear entrada de instalación si no existe
      if (!instalacionesMap.has(instalacionKey)) {
        instalacionesMap.set(instalacionKey, {
          instalacion_referencia: instalacionDisplay,
          componentes: new Map()
        })
      }
      
      const instalacion = instalacionesMap.get(instalacionKey)
      const compKey = `${tipoKey}|${componenteKey}`
      
      // Crear entrada de componente si no existe
      if (!instalacion.componentes.has(compKey)) {
        instalacion.componentes.set(compKey, {
          componente: componenteDisplay,
          tipo_componente: tipoDisplay,
          norte: reg.norte,
          este: reg.este,
          altitud: reg.altitud,
          zona: reg.zona,
          descripciones: [],
          globalids: []
        })
      }
      
      const comp = instalacion.componentes.get(compKey)
      comp.globalids.push(reg.globalid)
      
      // Recopilar descripciones de tabla 1 y 2
      try {
        const rawData = JSON.parse(reg.raw_json || '{}')
        
        // Descripciones de tabla 1 (DESCRIP_1, descrip_1)
        const desc1 = rawData['DESCRIP_1'] || rawData['descrip_1'] || reg.descrip_1
        if (desc1 && !comp.descripciones.includes(desc1)) {
          comp.descripciones.push(desc1)
        }
        
        // Descripciones de tabla 2 (DESCRIP_2, descrip_2, y numeradas)
        const desc2 = rawData['DESCRIP_2'] || rawData['descrip_2'] || reg.descrip_2
        if (desc2 && !comp.descripciones.includes(desc2)) {
          comp.descripciones.push(desc2)
        }
        
        // Buscar descripciones numeradas (DESCRIP_1, DESCRIP_2, etc. del raw_json)
        for (let i = 1; i <= 10; i++) {
          const descKey = `DESCRIP_${i}`
          const descValue = rawData[descKey]
          if (descValue && !comp.descripciones.includes(descValue)) {
            comp.descripciones.push(descValue)
          }
        }
      } catch (e) {
        // Ignorar errores de parsing
      }
    })
    
    // Convertir a array estructurado por instalación
    const instalaciones = Array.from(instalacionesMap.values()).map(inst => {
      // Ordenar componentes por tipo_componente, luego por nombre
      const componentesOrdenados = Array.from(inst.componentes.values())
        .sort((a, b) => {
          const tipoCompare = (a.tipo_componente || '').localeCompare(b.tipo_componente || '')
          if (tipoCompare !== 0) return tipoCompare
          return (a.componente || '').localeCompare(b.componente || '')
        })
        .map(comp => ({
          componente: comp.componente,
          tipo_componente: comp.tipo_componente,
          norte: comp.norte,
          este: comp.este,
          altitud: comp.altitud,
          zona: comp.zona,
          descripcion: comp.descripciones.filter(d => d).join('\n'),
          globalid_origen: comp.globalids[0],
          cantidadRegistros: comp.globalids.length
        }))
      
      return {
        instalacion_referencia: inst.instalacion_referencia,
        componentes: componentesOrdenados
      }
    })
    
    // También crear lista plana para compatibilidad
    const componentesPlanos = instalaciones.flatMap(inst => 
      inst.componentes.map(comp => ({
        ...comp,
        instalacion_referencia: inst.instalacion_referencia
      }))
    )
    
    // Numerar componentes secuencialmente
    let numero = 1
    componentesPlanos.forEach(comp => {
      comp.numero = numero++
    })
    
    res.json({ 
      success: true, 
      // Formato agrupado por instalación
      instalaciones,
      // Formato plano para compatibilidad (incluye numero y instalacion)
      componentes: componentesPlanos,
      totalInstalaciones: instalaciones.length,
      totalComponentes: componentesPlanos.length,
      totalRegistros: registros.length
    })
  } catch (error) {
    console.error('[actas] Error obteniendo componentes disponibles:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/actas/muestreo-disponibles/:codigoAccion
 * Obtener los puntos de muestreo disponibles de un CA desde los datos sincronizados
 * Solo registros con actividad = 'G._Muestreo' (o similares)
 */
router.get('/muestreo-disponibles/:codigoAccion', async (req, res) => {
  try {
    const { codigoAccion } = req.params
    
    // Obtener registros del CA con datos de muestreo
    const registrosResult = await query(`
      SELECT globalid, componente, tipo_componente, nom_pto_muestreo, num_pto_muestreo, norte, este, altitud, zona, descrip_1, descrip_2, actividad, raw_json
      FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0 AND (actividad LIKE 'G.%' OR actividad LIKE 'G_%')
      ORDER BY nom_pto_muestreo, num_pto_muestreo
    `, [codigoAccion, codigoAccion])
    const registros = registrosResult.rows
    
    // Agrupar por punto de muestreo y recopilar información
    const muestreosMap = new Map()
    
    registros.forEach(reg => {
      // Usar nom_pto_muestreo o componente como identificador
      const nombreMuestreo = reg.nom_pto_muestreo || reg.componente || `Muestreo ${reg.num_pto_muestreo || 'Sin ID'}`
      
      if (!muestreosMap.has(nombreMuestreo)) {
        muestreosMap.set(nombreMuestreo, {
          nombre: nombreMuestreo,
          numero: reg.num_pto_muestreo,
          componente: reg.componente,
          tipo_componente: reg.tipo_componente,
          norte: reg.norte,
          este: reg.este,
          altitud: reg.altitud,
          zona: reg.zona,
          descripciones: [],
          globalids: []
        })
      }
      
      const muestreo = muestreosMap.get(nombreMuestreo)
      muestreo.globalids.push(reg.globalid)
      
      // Recopilar descripciones
      try {
        const rawData = JSON.parse(reg.raw_json || '{}')
        const desc1 = rawData['DESCRIP_1'] || rawData['descrip_1'] || reg.descrip_1
        if (desc1 && !muestreo.descripciones.includes(desc1)) {
          muestreo.descripciones.push(desc1)
        }
        const desc2 = rawData['DESCRIP_2'] || rawData['descrip_2'] || reg.descrip_2
        if (desc2 && !muestreo.descripciones.includes(desc2)) {
          muestreo.descripciones.push(desc2)
        }
      } catch (e) {
        // Ignorar errores de parsing
      }
    })
    
    // Convertir a array y formatear
    const muestreos = Array.from(muestreosMap.values()).map((m, index) => ({
      numero: index + 1,
      nombre_punto: m.nombre,
      numero_punto: m.numero,
      componente: m.componente,
      tipo_componente: m.tipo_componente,
      norte: m.norte,
      este: m.este,
      altitud: m.altitud,
      zona: m.zona,
      descripcion: m.descripciones.filter(d => d).join('\n'),
      globalid_origen: m.globalids[0],
      cantidadRegistros: m.globalids.length
    }))
    
    res.json({ 
      success: true, 
      muestreos,
      totalMuestreos: muestreos.length,
      totalRegistros: registros.length
    })
  } catch (error) {
    console.error('[actas] Error obteniendo muestreos disponibles:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================
// ENDPOINTS DE MUESTREOS AMBIENTALES
// ============================================

/**
 * GET /api/actas/:actaId/muestreos
 * Obtener todos los muestreos de un borrador de acta
 */
router.get('/:actaId/muestreos', async (req, res) => {
  try {
    const { actaId } = req.params
    
    const muestreosResult = await query(`SELECT * FROM actas_muestreos WHERE acta_id = ? ORDER BY matriz, numero ASC`, [actaId])
    
    res.json({ success: true, muestreos: muestreosResult.rows })
  } catch (error) {
    console.error('[actas] Error obteniendo muestreos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/muestreos/sync-from-datos
 * Sincroniza automáticamente los muestreos desde arcgis_records (actividad G._Muestreo)
 */
router.post('/:actaId/muestreos/sync-from-datos', async (req, res) => {
  try {
    const { actaId } = req.params
    
    console.log(`[actas] 🔄 Sincronizando muestreos desde datos para acta ${actaId}`)
    
    // 1. Obtener el código de acción del borrador
    const borradorResult = await get(`SELECT codigo_accion FROM actas_borradores WHERE id = ?`, [actaId])
    const borrador = borradorResult.rows[0]
    
    if (!borrador) {
      return res.status(404).json({ success: false, error: 'Borrador no encontrado' })
    }
    
    const codigoAccion = borrador.codigo_accion
    
    // 2. Obtener registros de muestreo del CA desde arcgis_records
    const registrosResult = await query(`
      SELECT globalid, componente, tipo_componente, nom_pto_muestreo, num_pto_muestreo, norte, este, altitud, zona, descrip_1, descrip_2, raw_json
      FROM arcgis_records WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0 AND (actividad LIKE 'G.%' OR actividad LIKE 'G_%')
      ORDER BY nom_pto_muestreo, num_pto_muestreo
    `, [codigoAccion, codigoAccion])
    const registros = registrosResult.rows
    
    console.log(`[actas] 📊 Encontrados ${registros.length} registros de muestreo en arcgis_records`)
    
    if (registros.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No hay registros de muestreo en este CA',
        muestreos: [],
        count: 0 
      })
    }
    
    // 3. Agrupar por punto de muestreo único
    const muestreosMap = new Map()
    
    registros.forEach(reg => {
      const nombreMuestreo = reg.nom_pto_muestreo || reg.componente || `Muestreo ${reg.num_pto_muestreo || 'Sin ID'}`
      const key = nombreMuestreo.toLowerCase().trim()
      
      if (!muestreosMap.has(key)) {
        let descripcion = ''
        try {
          const rawData = JSON.parse(reg.raw_json || '{}')
          descripcion = rawData['DESCRIP_1'] || rawData['descrip_1'] || reg.descrip_1 || ''
        } catch (e) {
          descripcion = reg.descrip_1 || ''
        }
        
        muestreosMap.set(key, {
          codigo_punto: nombreMuestreo,
          norte: reg.norte,
          este: reg.este,
          altitud: reg.altitud,
          zona: reg.zona,
          descripcion: descripcion,
          globalid_origen: reg.globalid
        })
      }
    })
    
    const muestreosUnicos = Array.from(muestreosMap.values())
    console.log(`[actas] 📊 ${muestreosUnicos.length} puntos de muestreo únicos a sincronizar`)
    
    // 4. Sincronizar con actas_muestreos (update or insert)
    const database = await ensureDb()
    const maxResult = await get(`SELECT MAX(numero) as max FROM actas_muestreos WHERE acta_id = ?`, [actaId])
    let numero = (maxResult.rows[0]?.max || 0) + 1
    
    for (const m of muestreosUnicos) {
      // Intentar actualizar primero
      const updateResult = await run(`UPDATE actas_muestreos SET codigo_punto = ?, norte = ?, este = ?, altitud = ?, descripcion = COALESCE(descripcion, ?) WHERE acta_id = ? AND globalid_origen = ?`,
        [m.codigo_punto, m.norte, m.este, m.altitud, m.descripcion, actaId, m.globalid_origen])
      
      // Si no actualizó ninguna fila, insertar
      if (updateResult.rowCount === 0) {
        await run(`INSERT INTO actas_muestreos (acta_id, numero, codigo_punto, nro_muestras, matriz, descripcion, norte, este, altitud, muestra_dirimente, globalid_origen) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, 'No', ?)`,
          [actaId, numero++, m.codigo_punto, m.descripcion, m.norte, m.este, m.altitud, m.globalid_origen])
      }
    }
    
    // 5. Obtener muestreos actualizados
    const muestreosResult = await query(`SELECT * FROM actas_muestreos WHERE acta_id = ? ORDER BY matriz, numero ASC`, [actaId])
    const muestreosActualizados = muestreosResult.rows
    
    console.log(`[actas] ✅ Sincronización completada: ${muestreosActualizados.length} muestreos`)
    
    res.json({ 
      success: true, 
      message: `${muestreosUnicos.length} muestreos sincronizados desde datos`,
      muestreos: muestreosActualizados,
      count: muestreosActualizados.length
    })
  } catch (error) {
    console.error('[actas] Error sincronizando muestreos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/actas/:actaId/muestreos
 * Crear un nuevo muestreo
 */
router.post('/:actaId/muestreos', async (req, res) => {
  try {
    const { actaId } = req.params
    const { codigo_punto, nro_muestras, matriz, descripcion, norte, este, altitud, muestra_dirimente } = req.body
    
    // Obtener el máximo número actual
    const maxResult = await get(`SELECT MAX(numero) as max FROM actas_muestreos WHERE acta_id = ?`, [actaId])
    const numero = (maxResult.rows[0]?.max || 0) + 1
    
    const result = await run(`
      INSERT INTO actas_muestreos (
        acta_id, numero, codigo_punto, nro_muestras, matriz, descripcion,
        norte, este, altitud, muestra_dirimente
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      actaId, numero, codigo_punto || '', nro_muestras || '', matriz || '',
      descripcion || '', norte || null, este || null, altitud || null,
      muestra_dirimente || 'No'
    ])
    
    const muestreoResult = await get(`SELECT * FROM actas_muestreos WHERE id = ?`, [result.lastInsertRowid])
    const muestreo = muestreoResult.rows[0]
    
    res.json({ success: true, muestreo })
  } catch (error) {
    console.error('[actas] Error creando muestreo:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/actas/:actaId/muestreos/:muestreoId
 * Actualizar un muestreo existente
 */
router.put('/:actaId/muestreos/:muestreoId', async (req, res) => {
  try {
    const { actaId, muestreoId } = req.params
    const updates = req.body
    
    // Construir query dinámicamente
    const allowedFields = ['codigo_punto', 'nro_muestras', 'matriz', 'descripcion', 'norte', 'este', 'altitud', 'muestra_dirimente']
    const setClause = []
    const values = []
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`)
        values.push(value)
      }
    }
    
    if (setClause.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay campos válidos para actualizar' })
    }
    
    values.push(actaId, muestreoId)
    
    await run(`UPDATE actas_muestreos SET ${setClause.join(', ')} WHERE acta_id = ? AND id = ?`, values)
    
    const muestreoResult = await get(`SELECT * FROM actas_muestreos WHERE id = ?`, [muestreoId])
    const muestreo = muestreoResult.rows[0]
    
    res.json({ success: true, muestreo })
  } catch (error) {
    console.error('[actas] Error actualizando muestreo:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/actas/:actaId/muestreos/:muestreoId
 * Eliminar un muestreo
 */
router.delete('/:actaId/muestreos/:muestreoId', async (req, res) => {
  try {
    const { actaId, muestreoId } = req.params
    
    await run(`DELETE FROM actas_muestreos WHERE acta_id = ? AND id = ?`, [actaId, muestreoId])
    
    // Renumerar los muestreos restantes
    const muestreosResult = await query(`SELECT id FROM actas_muestreos WHERE acta_id = ? ORDER BY numero ASC`, [actaId])
    const muestreos = muestreosResult.rows
    
    for (let i = 0; i < muestreos.length; i++) {
      await run(`UPDATE actas_muestreos SET numero = ? WHERE id = ?`, [i + 1, muestreos[i].id])
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('[actas] Error eliminando muestreo:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Helpers para descripciones de factores
function getFactorDescription(tipo, valor) {
  const descripciones = {
    cantidad: {
      1: '(Menor: <1 Tn, <5 m³, <10% exceso)',
      2: '(Bajo: 1-2 Tn, 5-10 m³, 10-50% exceso)',
      3: '(Medio: 2-5 Tn, 10-50 m³, 50-100% exceso)',
      4: '(Alto: >5 Tn, >50 m³, ≥100% exceso)'
    },
    peligrosidad: {
      1: '(No peligrosa: daños leves y reversibles)',
      2: '(Poco peligrosa: combustible, reversible)',
      3: '(Peligrosa: explosiva, inflamable, corrosiva)',
      4: '(Muy peligrosa: tóxica, efectos irreversibles)'
    },
    extension: {
      1: '(Puntual: radio ≤0.1 km, <500 m²)',
      2: '(Poco extenso: radio ≤0.5 km, 500-1000 m²)',
      3: '(Extenso: radio ≤1 km, 1000-10000 m²)',
      4: '(Muy extenso: radio >1 km, >10000 m²)'
    },
    personas: {
      1: '(Muy bajo: <5 personas)',
      2: '(Bajo: 5-49 personas)',
      3: '(Alto: 50-100 personas)',
      4: '(Muy alto: >100 personas)'
    },
    medio: {
      1: '(Industrial)',
      2: '(Agrícola)',
      3: '(Fuera de ANP)',
      4: '(ANP, zona amortiguamiento, ecosistema frágil)'
    },
    probabilidad: {
      1: '(Poco probable: >1 año)',
      2: '(Posible: dentro de 1 año)',
      3: '(Probable: dentro de 1 mes)',
      4: '(Altamente probable: dentro de 1 semana)',
      5: '(Muy probable: continuo/diario)'
    }
  }
  return descripciones[tipo]?.[valor] || ''
}

function getCondicionConsecuenciaText(valor) {
  const condiciones = {
    5: 'Crítica',
    4: 'Grave',
    3: 'Moderada',
    2: 'Leve',
    1: 'No relevante'
  }
  return condiciones[valor] || '-'
}

// ============================================
// GENERACIÓN DE ACTA EN WORD
// ============================================

/**
 * POST /api/actas/borradores/:id/generate-word
 * Genera el documento Word del acta
 * Body puede contener: 
 *   - muestreos: [] - datos de muestreo desde localStorage del frontend
 *   - otrosAspectos: { descripcion, fotos } - datos de otros aspectos para Sección 6
 *   - requerimientos: [] - datos de requerimiento de información para Tabla 7
 *   - cantidadFirmasAdministrado: number - cantidad de espacios para firma del personal del administrado
 *   - equipoSupervisor: [] - datos del equipo supervisor para sección de firmas
 */
router.post('/borradores/:id/generate-word', async (req, res) => {
  try {
    const { id } = req.params
    const { 
      muestreos = [], 
      otrosAspectos = {}, 
      requerimientos = {},
      cantidadFirmasAdministrado = 2,
      equipoSupervisor = [],
      cantidadFirmasOtrosParticipantes = 2,
      supervisoresNoPresentes = []
    } = req.body || {}
    
    // Obtener borrador completo
    const borradorResult = await get(`SELECT * FROM actas_borradores WHERE id = ?`, [id])
    const borrador = borradorResult.rows[0]
    
    if (!borrador) {
      return res.status(404).json({ success: false, error: 'Borrador no encontrado' })
    }
    
    // Obtener hechos del borrador (solo los completados)
    const hechosRawResult = await query(`
      SELECT * FROM actas_hechos 
      WHERE acta_id = ? AND is_completed = 1
      ORDER BY numero_hecho ASC
    `, [id])
    const hechosRaw = hechosRawResult.rows
    
    // Normalizar nombres de hechos para el Word (limpiar underscores, duplicados)
    const hechos = hechosRaw.map(h => ({
      ...h,
      hecho_detec_original: deduplicateHechoValue(h.hecho_detec_original),
      titulo_hecho: h.titulo_hecho || deduplicateHechoValue(h.hecho_detec_original)
    }))
    
    // Obtener componentes del borrador desde actas_componentes (fuente de verdad)
    // La tabla actas_componentes se sincroniza con las ediciones de fotos
    const componentesResult = await query(`
      SELECT * FROM actas_componentes 
      WHERE acta_id = ? 
      ORDER BY numero ASC
    `, [id])
    const componentes = componentesResult.rows
    
    // Agregar componentes al borrador
    borrador.componentes = componentes
    console.log(`[actas] Cargados ${componentes.length} componentes para el acta`)
    
    // Agregar muestreos al borrador
    // Fuente de verdad: actas_muestreos (SQLite). El frontend puede enviar muestreos,
    // pero si llega vacío, los cargamos desde BD para evitar que el Word salga sin datos.
    let muestreosFinal = Array.isArray(muestreos) ? muestreos : []
    if (muestreosFinal.length === 0) {
      try {
        const muestreosResult = await query(`
          SELECT * FROM actas_muestreos
          WHERE acta_id = ?
          ORDER BY matriz, numero ASC
        `, [id])
        muestreosFinal = muestreosResult.rows
      } catch (muErr) {
        console.warn('[actas] ⚠️ No se pudieron cargar muestreos desde BD:', muErr.message)
        muestreosFinal = []
      }
    }

    if (muestreosFinal.length === 0 && borrador.codigo_accion) {
      const codigoAccion = borrador.codigo_accion
      try {
        const registrosMuestreoResult = await query(`
          SELECT globalid, componente, tipo_componente, nom_pto_muestreo, num_pto_muestreo,
            norte, este, altitud, zona, descrip_1, descrip_2, raw_json
          FROM arcgis_records 
          WHERE (codigo_accion = ? OR otro_ca = ?) AND is_deleted = 0
            AND (actividad LIKE 'G.%' OR actividad LIKE 'G_%')
          ORDER BY nom_pto_muestreo, num_pto_muestreo
        `, [codigoAccion, codigoAccion])
        const registrosMuestreo = registrosMuestreoResult.rows

        if (registrosMuestreo.length > 0) {
          const muestreosMap = new Map()
          registrosMuestreo.forEach(reg => {
            const nombreMuestreo = reg.nom_pto_muestreo || reg.componente || `Muestreo ${reg.num_pto_muestreo || 'Sin ID'}`
            const key = String(nombreMuestreo).toLowerCase().trim()
            if (!muestreosMap.has(key)) {
              let descripcion = ''
              try {
                const rawData = JSON.parse(reg.raw_json || '{}')
                const desc1 = rawData['DESCRIP_1'] || rawData['descrip_1'] || reg.descrip_1
                const desc2 = rawData['DESCRIP_2'] || rawData['descrip_2'] || reg.descrip_2
                descripcion = [desc1, desc2].filter(Boolean).join('\n')
              } catch (_) {
                descripcion = [reg.descrip_1, reg.descrip_2].filter(Boolean).join('\n')
              }
              muestreosMap.set(key, {
                codigo_punto: nombreMuestreo, norte: reg.norte, este: reg.este,
                altitud: reg.altitud, zona: reg.zona, descripcion, globalid_origen: reg.globalid,
              })
            }
          })

          const muestreosUnicos = Array.from(muestreosMap.values())
          const db = await ensureDb()
          const maxNumeroResult = await get(`SELECT MAX(numero) as max FROM actas_muestreos WHERE acta_id = ?`, [id])
          let numero = (maxNumeroResult.rows[0]?.max || 0) + 1

          for (const m of muestreosUnicos) {
            db.run(`UPDATE actas_muestreos SET codigo_punto = ?, norte = ?, este = ?, altitud = ?, descripcion = COALESCE(descripcion, ?) WHERE acta_id = ? AND globalid_origen = ?`,
              [m.codigo_punto, m.norte, m.este, m.altitud, m.descripcion, id, m.globalid_origen])
            const changesResult = db.exec('SELECT changes() as changes')
            const changes = changesResult[0]?.values[0]?.[0] || 0
            if (changes === 0) {
              db.run(`INSERT INTO actas_muestreos (acta_id, numero, codigo_punto, nro_muestras, matriz, descripcion, norte, este, altitud, muestra_dirimente, globalid_origen) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, 'No', ?)`,
                [id, numero++, m.codigo_punto, m.descripcion, m.norte, m.este, m.altitud, m.globalid_origen])
            }
          }

          try {
            const muestreosFinalResult = await query(`SELECT * FROM actas_muestreos WHERE acta_id = ? ORDER BY matriz, numero ASC`, [id])
            muestreosFinal = muestreosFinalResult.rows
          } catch (_) {}
        }
      } catch (syncErr) {
        console.warn('[actas] ⚠️ No se pudieron sincronizar muestreos desde datos:', syncErr.message)
      }
    }
    borrador.muestreos = muestreosFinal
    console.log(`[actas] Cargados ${muestreosFinal.length} muestreos para el acta`)
    
    // Agregar otros aspectos al borrador (enviados desde el frontend)
    // Cargar imageBuffer para las fotos de otros aspectos
    if (otrosAspectos.fotos && otrosAspectos.fotos.length > 0) {
      const fotosConImagenes = []
      
      for (const fotoRef of otrosAspectos.fotos) {
        const gid = fotoRef.globalid || fotoRef.gid || fotoRef.record_globalid
        if (gid) {
          const photos = getLocalPhotos(gid)
          const photoRecord = photos?.find(p => p.filename === fotoRef.filename)
          
          // Obtener datos del registro padre
          const parentRecordResult = await get(`
            SELECT este, norte, altitud, componente, tipo_componente, instalacion_referencia 
            FROM arcgis_records 
            WHERE globalid = ? OR UPPER(globalid) = UPPER(?)
          `, [gid, gid])
          const parentRecord = parentRecordResult.rows[0]
          
          const coordenadas = {
            este: parentRecord?.este || fotoRef.este || '',
            norte: parentRecord?.norte || fotoRef.norte || '',
            altitud: parentRecord?.altitud || fotoRef.altitud || ''
          }
          
          const componenteActualizado = parentRecord?.componente || fotoRef.componente || 'Vista general'
          
          if (photoRecord && photoRecord.local_path) {
            try {
              const imagePath = photoRecord.local_path
              if (fs.existsSync(imagePath)) {
                let imageBuffer = fs.readFileSync(imagePath)
                
                // Obtener anotaciones si existen
                const photoId = `${gid}_${fotoRef.filename}`
                let annotations = null
                
                try {
                  const annotationRecordResult = await get(`
                    SELECT annotations FROM photo_annotations 
                    WHERE photo_id = ?
                  `, [photoId])
                  const annotationRecord = annotationRecordResult.rows[0]
                  
                  if (annotationRecord?.annotations) {
                    annotations = JSON.parse(annotationRecord.annotations)
                  }
                } catch (annErr) {
                  // Tabla no existe o error
                }
                
                // SIEMPRE aplicar rotación EXIF y renderizar anotaciones si existen
                try {
                  imageBuffer = await renderAnnotationsOnImage(imageBuffer, annotations || [])
                } catch (annError) {
                  console.warn(`[actas] ⚠️ Error procesando foto otros aspectos:`, annError.message)
                }
                
                fotosConImagenes.push({
                  ...fotoRef,
                  ...coordenadas,
                  componente: componenteActualizado,
                  imageBuffer,
                  descripcion: fotoRef.descripcion || fotoRef.descripcionEditada || ''
                })
                console.log(`[actas] ✅ Foto otros aspectos cargada: ${fotoRef.filename}`)
              } else {
                console.warn(`[actas] ⚠️ Archivo no existe (otros aspectos): ${imagePath}`)
                fotosConImagenes.push({ ...fotoRef, ...coordenadas, componente: componenteActualizado, imageBuffer: null })
              }
            } catch (readError) {
              console.warn(`[actas] ⚠️ Error leyendo foto otros aspectos ${fotoRef.filename}:`, readError.message)
              fotosConImagenes.push({ ...fotoRef, ...coordenadas, componente: componenteActualizado, imageBuffer: null })
            }
          } else {
            console.warn(`[actas] ⚠️ No se encontró registro para foto otros aspectos: gid=${gid}, filename=${fotoRef.filename}`)
            fotosConImagenes.push({ ...fotoRef, ...coordenadas, componente: componenteActualizado, imageBuffer: null })
          }
        }
      }
      
      otrosAspectos.fotos = fotosConImagenes
      console.log(`[actas] Cargadas ${fotosConImagenes.filter(f => f.imageBuffer).length}/${fotosConImagenes.length} fotos para otros aspectos`)
    }
    
    borrador.otrosAspectos = otrosAspectos
    if (otrosAspectos.descripcion || otrosAspectos.fotos?.length > 0) {
      console.log(`[actas] Otros aspectos: ${otrosAspectos.fotos?.length || 0} fotos, descripción: ${otrosAspectos.descripcion ? 'Sí' : 'No'}`)
    }
    
    // Agregar requerimientos de información al borrador (enviados desde el frontend)
    // Convertir objeto {numero_hecho: {descripcion, plazo}} a array para el generador
    const requerimientosArray = Object.entries(requerimientos)
      .filter(([_, req]) => req.descripcion?.trim()) // Solo incluir si tiene descripción
      .map(([numeroStr, req]) => ({
        numero_hecho: parseInt(numeroStr, 10),
        descripcion: req.descripcion,
        plazo: req.plazo || ''
      }))
      .sort((a, b) => a.numero_hecho - b.numero_hecho)
    
    borrador.requerimientos = requerimientosArray
    if (requerimientosArray.length > 0) {
      console.log(`[actas] Requerimientos de información: ${requerimientosArray.length} items`)
    }
    
    // Agregar cantidad de firmas del administrado al borrador
    borrador.cantidadFirmasAdministrado = cantidadFirmasAdministrado
    console.log(`[actas] Cantidad de firmas del administrado: ${cantidadFirmasAdministrado}`)
    
    // Agregar equipo supervisor al borrador para sección de firmas
    borrador.equipoSupervisor = equipoSupervisor
    if (equipoSupervisor.length > 0) {
      console.log(`[actas] Equipo supervisor para firmas: ${equipoSupervisor.length} miembros`)
    }

    // Agregar equipo supervisor no presente durante la firma del acta
    borrador.supervisoresNoPresentes = Array.isArray(supervisoresNoPresentes)
      ? supervisoresNoPresentes
      : []
    if (borrador.supervisoresNoPresentes.length > 0) {
      console.log(`[actas] Supervisores no presentes: ${borrador.supervisoresNoPresentes.length}`)
    }
    
    // Agregar cantidad de firmas de otros participantes al borrador
    borrador.cantidadFirmasOtrosParticipantes = cantidadFirmasOtrosParticipantes
    console.log(`[actas] Cantidad de firmas otros participantes: ${cantidadFirmasOtrosParticipantes}`)
    
    // Cargar imágenes de fotos seleccionadas para cada hecho
    for (const hecho of hechos) {
      if (hecho.fotos_seleccionadas) {
        try {
          const fotosSeleccionadas = JSON.parse(hecho.fotos_seleccionadas)
          const fotosConImagenes = []
          
          for (const fotoRef of fotosSeleccionadas) {
            // Obtener la imagen desde SQLite usando globalid
            const gid = fotoRef.globalid || fotoRef.gid
            if (gid) {
              const photos = getLocalPhotos(gid)
              const photoRecord = photos?.find(p => p.filename === fotoRef.filename)
              
              // Obtener datos actualizados del registro padre (incluyendo componente editado)
              const parentResult = await get(`
                SELECT este, norte, altitud, componente, tipo_componente, instalacion_referencia 
                FROM arcgis_records 
                WHERE globalid = ? OR UPPER(globalid) = UPPER(?)
              `, [gid, gid])
              const parentRecord = parentResult.rows[0]
              
              const coordenadas = {
                este: parentRecord?.este || '',
                norte: parentRecord?.norte || '',
                altitud: parentRecord?.altitud || ''
              }
              
              // Usar componente actualizado de arcgis_records (puede haber sido editado)
              const componenteActualizado = parentRecord?.componente || fotoRef.componente
              const tipoComponenteActualizado = parentRecord?.tipo_componente || fotoRef.tipo_componente
              const instalacionActualizada = parentRecord?.instalacion_referencia || fotoRef.instalacion_referencia
              
              if (photoRecord && photoRecord.local_path) {
                // Leer la imagen desde el sistema de archivos
                try {
                  const imagePath = photoRecord.local_path
                  if (fs.existsSync(imagePath)) {
                    let imageBuffer = fs.readFileSync(imagePath)
                    
                    // Obtener anotaciones de la foto si existen
                    // Primero buscar en la nueva tabla photo_annotations (por photoId único)
                    const photoId = `${gid}_${fotoRef.filename}`
                    let annotations = null
                    
                    // Intentar buscar en la nueva tabla photo_annotations
                    try {
                      const newAnnotationResult = await get(`
                        SELECT annotations FROM photo_annotations 
                        WHERE photo_id = ?
                      `, [photoId])
                      const newAnnotationRecord = newAnnotationResult.rows[0]
                      
                      if (newAnnotationRecord?.annotations) {
                        annotations = JSON.parse(newAnnotationRecord.annotations)
                        console.log(`[actas] 🎨 Usando anotaciones nuevas para foto ${fotoRef.filename}`)
                      }
                    } catch (newTableErr) {
                      // Tabla nueva no existe, continuar con fallback
                    }
                    
                    // Fallback: buscar en tabla legacy (arcgis_records.photo_annotations)
                    if (!annotations || annotations.length === 0) {
                      const legacyAnnotationResult = await get(`
                        SELECT photo_annotations FROM arcgis_records 
                        WHERE globalid = ? OR UPPER(globalid) = UPPER(?)
                      `, [gid, gid])
                      const legacyAnnotationRecord = legacyAnnotationResult.rows[0]
                      
                      if (legacyAnnotationRecord?.photo_annotations) {
                        try {
                          annotations = JSON.parse(legacyAnnotationRecord.photo_annotations)
                          console.log(`[actas] 🎨 Usando anotaciones legacy para foto ${fotoRef.filename}`)
                        } catch (parseErr) {
                          // Ignorar error de parsing
                        }
                      }
                    }
                    
                    // SIEMPRE aplicar rotación EXIF y renderizar anotaciones si existen
                    // renderAnnotationsOnImage aplica rotate() según EXIF para mantener orientación correcta
                    try {
                      if (annotations && annotations.length > 0) {
                        console.log(`[actas] 🎨 Renderizando ${annotations.length} anotaciones para foto ${fotoRef.filename}`)
                      }
                      imageBuffer = await renderAnnotationsOnImage(imageBuffer, annotations || [])
                    } catch (annError) {
                      console.warn(`[actas] ⚠️ Error procesando foto:`, annError.message)
                    }
                    
                    fotosConImagenes.push({
                      ...fotoRef,
                      ...coordenadas,
                      componente: componenteActualizado,
                      tipo_componente: tipoComponenteActualizado,
                      instalacion_referencia: instalacionActualizada,
                      imageBuffer,
                      descripcion: fotoRef.descripcion || fotoRef.descripcionEditada || componenteActualizado
                    })
                    console.log(`[actas] ✅ Foto cargada: ${fotoRef.filename} - componente: ${componenteActualizado}`)
                  } else {
                    console.warn(`[actas] ⚠️ Archivo no existe: ${imagePath}`)
                    fotosConImagenes.push({
                      ...fotoRef,
                      ...coordenadas,
                      componente: componenteActualizado,
                      tipo_componente: tipoComponenteActualizado,
                      instalacion_referencia: instalacionActualizada,
                      imageBuffer: null,
                      descripcion: fotoRef.descripcion || fotoRef.descripcionEditada || componenteActualizado
                    })
                  }
                } catch (readError) {
                  console.warn(`[actas] ⚠️ Error leyendo foto ${fotoRef.filename}:`, readError.message)
                  fotosConImagenes.push({
                    ...fotoRef,
                    ...coordenadas,
                    componente: componenteActualizado,
                    tipo_componente: tipoComponenteActualizado,
                    instalacion_referencia: instalacionActualizada,
                    imageBuffer: null,
                    descripcion: fotoRef.descripcion || fotoRef.descripcionEditada || componenteActualizado
                  })
                }
              } else {
                // Si no hay registro de foto, incluir sin buffer
                console.warn(`[actas] ⚠️ No se encontró registro para foto: gid=${gid}, filename=${fotoRef.filename}`)
                fotosConImagenes.push({
                  ...fotoRef,
                  ...coordenadas,
                  componente: componenteActualizado,
                  tipo_componente: tipoComponenteActualizado,
                  instalacion_referencia: instalacionActualizada,
                  imageBuffer: null,
                  descripcion: fotoRef.descripcion || fotoRef.descripcionEditada || componenteActualizado
                })
              }
            }
          }
          
          hecho.fotos = fotosConImagenes
          console.log(`[actas] Cargadas ${fotosConImagenes.filter(f => f.imageBuffer).length}/${fotosConImagenes.length} fotos para hecho ${hecho.id}`)
        } catch (parseError) {
          console.warn(`[actas] Error parseando fotos_seleccionadas del hecho ${hecho.id}:`, parseError.message)
          hecho.fotos = []
        }
      } else {
        hecho.fotos = []
      }
    }
    
    // Agregar hechos al borrador
    borrador.hechos = hechos
    
    // Generar documento Word
    const buffer = await generateActaWord(borrador)
    
    // Preparar nombre del archivo
    const codigoAccion = (borrador.codigo_accion || 'acta').replace(/[^a-zA-Z0-9-_]/g, '_')
    const filename = `Acta_Supervision_${codigoAccion}.docx`
    
    // Enviar archivo
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
    
  } catch (error) {
    console.error('[actas] Error generando Word:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
