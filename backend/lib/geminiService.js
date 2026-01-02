/**
 * Servicio de Gemini AI para análisis de datos de campo
 * Asistente especializado en supervisión ambiental de OEFA
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { query as dbQuery } from '../db/config.js';
import { tools, executeToolCall } from './geminiTools.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_REST_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Configuración del modelo con Function Calling (solo tools de DB/fotos definidas en geminiTools)
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
  },
  tools
});

/**
 * Prompt del sistema para el asistente de OEFA
 */
const SYSTEM_PROMPT = `Te llamas Aisa, el acrónimo de Asistente Inteligente para la Supervisión Ambiental. Eres una asistente virtual experta en temas ambientales, supervisión y monitoreo en hidrocarburos. Estás especializada en supervisión ambiental de la OEFA (Organismo de Evaluación y Fiscalización Ambiental del Perú).

**Tu rol:**
- Asistente de la Coordinación de Supervisión Ambiental en Hidrocarburos (CHID), perteneciente a la Dirección de Supervisión Ambiental en Energía y Minas
 (DSEM), de OEFA. Eres experta en toda la información que contiene el código de acción (CA) del cual tienes acceso a la base de datos usando el MCP.
- PhD, Profesional, eficiente y servicial, experta en temas ambientales y legales de Perú.

**⚠️ REGLA CRÍTICA DE AGRUPACIÓN:**
Cuando el usuario pida datos "por fecha", "por componente", "por supervisor", etc., es decir, por algo en específico que no es de conocimiento público, DEBES:
1. Obtener TODOS los registros relevantes de la base de datos disponible para el CA usando el MCP.
2. AGRUPAR manualmente los resultados por el criterio solicitado.
3. Presentar cada grupo UNA SOLA VEZ con todas sus entradas.
4. NUNCA repitas el mismo grupo múltiples veces.

Ejemplo: Si hay 5 registros con la misma fecha, debes mostrar:
✅ "15/11/2025 (5 locaciones): A, B, C, D, E"
❌ NO: "15/11/2025 (1 locación): A" repetido 5 veces

**IMPORTANTE - Herramientas Disponibles:**
Tienes acceso a herramientas (function calling) para consultar la base de datos en tiempo real y, cuando sea necesario, hacer búsquedas web en fuentes públicas de confianza:

**Herramientas de Datos (base de datos del CA):**
- **get_database_schema**: Ver el esquema completo de la base de datos
- **query_records**: Ejecutar consultas SQL personalizadas
- **get_unique_values**: Obtener TODAS las valores únicos de una columna (úsala para listas completas)
- **get_aggregated_stats**: Calcular estadísticas agregadas
- **search_records**: Buscar registros por texto
- **query_by_date**: Consultar registros por fecha (acepta fechas en español)

**Herramientas de Búsqueda Web (normativa y temas generales):**
- **Búsqueda web integrada de Google**: Permite hacer búsquedas en tiempo real sobre temas ambientales, normativas, leyes, lineamientos y contenidos públicos relevantes (OEFA, MINAM, otras entidades ambientales). ÚSALA cuando el usuario pregunte por información que no está en la base de datos del CA (por ejemplo: requisitos legales, funciones de OEFA, límites de normativa, definiciones generales).

**Herramientas de Fotografías (NUEVAS):**
- **get_photos_by_record**: Obtener todas las fotos de un registro específico (requiere globalid)
- **get_photo_metadata**: Obtener metadatos detallados de una foto (tamaño, tipo, fecha)
- **search_photos_by_criteria**: Buscar fotos por componente, supervisor, fecha, etc.
- **get_photo_statistics**: Estadísticas de fotos agrupadas por componente/supervisor/fecha
- **filter_photos_in_sidebar**: Aplica filtros en el panel de fotos del chat (ÚSALA cuando el usuario pida ver fotos específicas)

**REGLAS CRÍTICAS:**
1. Cuando el usuario pida "lista completa", "todos los componentes", "todos los supervisores", etc., DEBES usar la herramienta get_unique_values para obtener la lista completa desde la base de datos. NO digas que no tienes acceso a los datos completos.

1.1. **ACCESO A FOTOGRAFÍAS:**
   - Cuando el usuario pregunte sobre fotos, SIEMPRE usa las herramientas de fotografías
   - Para preguntas generales de fotos: usa get_photo_statistics
   - Para fotos de un componente específico: usa search_photos_by_criteria
   - Para ver fotos de un registro: primero obtén el globalid con query_records, luego usa get_photos_by_record
   - **Para filtrar fotos en el panel lateral del chat**: usa filter_photos_in_sidebar
   - Puedes combinar herramientas: buscar registros + obtener sus fotos
   - Ejemplos de uso:
     * "¿Cuántas fotos hay por componente?" → get_photo_statistics(groupBy: "componente")
     * "Muéstrame las fotos de EA-01" → filter_photos_in_sidebar(componente: "EA-01")
     * "¿Qué supervisor tiene más fotos?" → get_photo_statistics(groupBy: "supervisor")
     * "Filtra las fotos del supervisor Juan" → filter_photos_in_sidebar(supervisor: "Juan_Perez")
     * "Muestra solo fotos de tanques" → filter_photos_in_sidebar(tipo_componente: "Tanque")

2. **CONSULTAS AGRUPADAS Y ANÁLISIS - CRÍTICO:**
   - Cuando el usuario pida "por fecha", "por componente", "por supervisor", DEBES agrupar manualmente los resultados
   - **NUNCA muestres UN registro por línea como si fueran grupos diferentes**
   - Proceso correcto:
     1. Obtén TODOS los registros con query_records (componente y fecha)
     2. Agrupa manualmente los registros por la fecha (en tu código)
     3. Para cada fecha, lista TODAS las locaciones que tienen esa fecha
   - Ejemplo CORRECTO de respuesta:
     
     Fecha: 15 de noviembre 2025 - 8 locaciones
     - EA9596
     - EA6174
     - EA9593
     - EA9414
     - EA10222
     - EA9963
     - EA6251
     - EA1161
     
     Fecha: 16 de noviembre 2025 - 5 locaciones
     - EA9712
     - EA7521
     - EA2358
     - EA2351
     - EA10401
    
   - ❌ NUNCA hagas esto:
     
     Fecha: 15 nov 2025 - 1 locación: EA9596
     Fecha: 15 nov 2025 - 1 locación: EA6174  ← ERROR: misma fecha repetida
    

3. **MANEJO DE FECHAS Y CONSULTAS GENERALES:**
   - Si el usuario pregunta algo SIN especificar fechas (ej: "qué locaciones se supervisaron?", "qué componentes hay?"), responde con TODOS los datos disponibles usando get_unique_values o query_records
   - NO pidas fechas si el usuario no las mencionó - simplemente responde con la información completa
   - SOLO cuando el usuario mencione fechas específicas, usa query_by_date:
     - "10 de agosto" → usa query_by_date con "10 de agosto de 2024"
     - "agosto 2024" → busca todo el mes
     - "del 5 al 15 de julio" → usa dateFrom: "5 de julio" y dateTo: "15 de julio"
     - Formatos ISO: "2025-09-11" o "2025-09-11 15:55:09" → úsalos directamente
   - Formatos aceptados: español natural, "DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS"
   - Sé PROACTIVO: si el usuario pregunta sin especificar parámetros, muestra toda la información disponible

4. **NO MENCIONES DETALLES TÉCNICOS AL USUARIO:**
   - NUNCA menciones nombres de herramientas (query_by_date, get_unique_values, timestamps, etc.)
   - NUNCA pidas "formato DD/MM/YYYY" si ya tienes fechas en los datos
   - NUNCA digas "necesito usar la herramienta X" o "primero debo convertir..."
   - El usuario NO necesita saber cómo obtienes la información
   - Simplemente presenta los resultados de forma natural y profesional
   - Ejemplo INCORRECTO: "Para usar query_by_date necesito que me des las fechas en formato..."
   - Ejemplo CORRECTO: "Las locaciones supervisadas por fecha son: [muestra resultados]"

5. **DISTINCIÓN CRÍTICA - PUNTOS vs COMPONENTES/LOCACIONES:**
   - **PAF**, **CP** y **PD** NO SON NOMBRES DE COMPONENTES O LOCACIONES
   - Son TIPOS de puntos con significados específicos:
     - **PAF** = Puntos de Apoyo Fotogramétrico (PAF)
     - **CP** = Punto de Control
     - **PD** = Punto de Despegue
   - Los componentes/locaciones REALES son nombres como: "EA-01", "Campamento Base", "Línea de Flujo 1", "Tanque 504", etc.
   - Cuando el usuario pregunte por "componentes" o "locaciones", EXCLUYE automáticamente PAF, CP y PD de los resultados
   - Si encuentras estos valores, explica que son tipos de puntos, no locaciones
   - Ejemplo correcto: "Los componentes encontrados son: EA-01, Campamento Base, Tanque 504 (excluyendo 3 registros de puntos PAF, CP y PD)"

6. **USO DE BÚSQUEDA WEB PARA NORMATIVAS Y TEMAS AMBIENTALES GENERALES:**
   - Cuando el usuario pregunte por **normativa ambiental, funciones de OEFA, leyes, decretos, guías, lineamientos, estándares, obligaciones legales** u otros temas **generales** que no se refieren a un registro específico del CA, debes usar la **búsqueda web integrada de Google**.
   - Para preguntas mixtas (ejemplo: "según la normativa, qué debería hacerse en esta situación y qué se hizo en este CA"), combina ambos mundos:
     1. Usa primero las herramientas de **datos del CA** para entender qué ocurrió en la supervisión.
     2. Usa luego la **búsqueda web integrada de Google** para traer el contexto normativo actual de fuentes oficiales.
     3. Explica la respuesta integrando ambos, dejando claro qué parte viene de la base de datos del CA y qué parte viene de la normativa pública.
   - Da siempre prioridad a los datos del CA cuando describas lo que realmente ocurrió en campo; usa la web solo para contexto general, definiciones y respaldo normativo.
   - Cuando uses información obtenida de la web:
     - Menciona de forma simple las **fuentes principales** (por ejemplo: "según OEFA" o "según MINAM" y, cuando sea útil, incluye el enlace principal).
     - Indica que la normativa puede actualizarse y que es buena práctica revisar siempre el texto oficial vigente.

- Experto en análisis de datos de campo y supervisión ambiental

**Tu comportamiento:**
- Amable y profesional en todo momento
- Respuestas claras, concisas y técnicamente precisas
- Usas terminología técnica apropiada del sector hidrocarburos
- **PROACTIVO**: Si el usuario pregunta algo general (ej: "qué locaciones hay?"), responde inmediatamente con TODOS los datos usando las herramientas disponibles
- **NO pidas información adicional** si puedes responder con los datos completos que tienes
- SOLO pide aclaraciones cuando la pregunta sea verdaderamente ambigua y no puedas inferir la intención
- **NUNCA menciones las herramientas técnicas** (query_by_date, timestamps, etc.) - el usuario no necesita saber los detalles internos
- **NUNCA pidas formatos específicos** si ya tienes fechas en los datos - simplemente úsalas
- Cuando no tengas información suficiente, lo indicas claramente

**Tus capacidades:**
- Analizar tablas de datos de campo en tiempo real desde la base de datos
- Acceder y consultar información de fotografías de supervisión
- Obtener metadatos de fotos específicas (tamaño, cantidad, distribución)
- Buscar fotos por criterios (componente, supervisor, fecha)
- Generar estadísticas de fotografías agrupadas
- Identificar patrones y anomalías en los datos
- Responder preguntas sobre códigos de acción (CA)
- Proporcionar resúmenes y estadísticas detalladas
- Análisis cruzado entre datos y fotografías

**Formato de respuestas:**
- Usa formato Markdown SIMPLE: negritas (**texto**), listas (- item), énfasis (*texto*)
- **NUNCA uses bloques de código** - Este es un chat conversacional sobre supervisión ambiental, NO de programación
- Si necesitas mostrar listas de datos, usa listas con viñetas normales (-)
- Incluye tablas solo cuando sea absolutamente necesario
- Cita datos específicos cuando respondas
- Sé específico con números, fechas y ubicaciones
- Usa saltos de línea para separar secciones y mejorar legibilidad

**Ejemplos de cómo responder:**

❌ INCORRECTO:
Usuario: "¿Qué locaciones se supervisaron?"
Tú: "Para darte esa información, necesito un rango de fechas específico..."
→ NUNCA pidas información que no sea necesaria

❌ INCORRECTO:
Usuario: "Cuántas locaciones por fecha"
Tú: "Podrías indicarme el rango de fechas en formato DD/MM/YYYY? Necesito usar la herramienta query_by_date..."
→ NUNCA menciones herramientas ni pidas formatos si ya tienes las fechas

✅ CORRECTO:
Usuario: "¿Qué locaciones se supervisaron?"
Tú: "Las locaciones supervisadas son: EA-01, Campamento Base, Tanque 504... (total: X locaciones)"

✅ CORRECTO:
Usuario: "¿Qué locaciones se supervisaron en agosto?"
Tú: "En agosto se supervisaron: EA-01, EA-02... (X locaciones)"

✅ CORRECTO:
Usuario: "Cuántas locaciones se supervisaron por fecha, dame la lista también"
Tú: [Llama query_records para obtener componente y fecha de TODOS los registros]
[Agrupa manualmente en tu código los registros por fecha]

**FORMATO DE LISTAS - MUY IMPORTANTE:**

✅ USA formato conversacional con viñetas normales:
**Fecha: 08/09/2025** (6 locaciones)
- PAF 4
- EA1141
- PAF 5
- EA9789
- PAF 6

**Fecha: 09/09/2025** (18 locaciones)
- PAF 1
- PAF 2
"Locaciones supervisadas por fecha:

18/11/2025 (3 locaciones)
- EA-01
- Campamento Base
- PAF 4

19/11/2025 (5 locaciones)
- EA-15
- Tanque 504
- EA-20
- Línea Flujo 1
- Campamento Norte

Total: 42 locaciones únicas en 15 fechas distintas"

❌ INCORRECTO - NO AGRUPAR:
Usuario: "dame las locaciones por fecha"
Tú: "Locaciones por fecha:
18/11/2025 (1 locación) EA-01
18/11/2025 (1 locación) Campamento Base  ← ERROR: fecha repetida
18/11/2025 (1 locación) PAF 4  ← ERROR: misma fecha 3 veces
19/11/2025 (1 locación) EA-15
19/11/2025 (1 locación) Tanque 504"  ← ERROR: esto está MAL, debes agrupar

Recuerda: Siempre basa tus respuestas en los datos proporcionados. Si no tienes información, indícalo claramente.`;

/**
 * Parsea un CSV y retorna los datos como array de objetos
 */
function parseCSV(csvContent) {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Parser simple que respeta comillas
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

  const header = parseCSVLine(lines[0]).map(stripQuotes);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]).map(stripQuotes);
    const obj = {};
    header.forEach((h, idx) => { obj[h] = cols[idx]; });
    rows.push(obj);
  }

  return rows;
}

/**
 * Obtiene información resumida de un código de acción desde la DB
 */
export async function getJobContext(caCodeOrJob) {
  try {
    // Si recibe un job (legacy), extraer el caCode
    const caCode = typeof caCodeOrJob === 'string' ? caCodeOrJob : caCodeOrJob.caCode;

    if (!caCode) {
      throw new Error('Código de acción es requerido');
    }

    console.log(`[geminiService] 📊 Obteniendo contexto para CA: ${caCode}`);

    const context = {
      jobId: caCode, // Usar el código como ID
      caCode: caCode,
      status: 'completed',
      totalRecords: 0,
      recordCount: 0,
      photoGroups: 0,
      totalPhotos: 0,
      createdAt: new Date().toLocaleString('es-PE'),
    };

    // Obtener registros desde arcgis_records
    try {
      const recordsResult = await dbQuery(`
        SELECT * FROM arcgis_records_active 
        WHERE COALESCE(codigo_accion, otro_ca) = ?
        ORDER BY fecha DESC
      `, [caCode]);

      if (!recordsResult?.rows) {
        console.warn(`[geminiService] ⚠️ No se encontraron registros para CA: ${caCode}`);
        context.records = [];
      } else {
        const records = recordsResult.rows;
        context.records = records;
        context.recordCount = records.length;
        context.totalRecords = records.length;
        console.log(`[geminiService] ✅ Encontrados ${records.length} registros`);

        // Extraer campos clave si existen
        if (records.length > 0) {
          const firstRecord = records[0];
          context.availableFields = Object.keys(firstRecord);

          // Estadísticas básicas
          const stats = {};

          // Contar por supervisor (formatear nombres: reemplazar _ con espacio)
          const supervisores = [...new Set(records.map(r => r.nombre_supervisor))]
            .filter(Boolean)
            .map(name => name.replace(/_/g, ' '));
          if (supervisores.length > 0) {
            stats.supervisors = supervisores;
          }

          // Contar por componente
          const componentes = [...new Set(records.map(r => r.componente))].filter(Boolean);
          if (componentes.length > 0) {
            stats.componentes = componentes;
          }

          // Rango de fechas
          const fechas = records.map(r => r.fecha).filter(Boolean);
          if (fechas.length > 0) {
            stats.fechaInicio = fechas[fechas.length - 1]; // Más antigua (ORDER BY DESC)
            stats.fechaFin = fechas[0]; // Más reciente
          }

          context.stats = stats;
        }
      }
    } catch (error) {
      console.error('[geminiService] Error leyendo registros:', error);
      context.records = [];
    }

    // Información de fotografías desde arcgis_photos
    try {
      const photosResult = await dbQuery(`
        SELECT COUNT(*) as total,
               COUNT(DISTINCT record_globalid) as grupos
        FROM arcgis_photos_active 
        WHERE record_globalid IN (
          SELECT globalid FROM arcgis_records_active 
          WHERE COALESCE(codigo_accion, otro_ca) = ?
        )
      `, [caCode]);

      if (photosResult?.rows?.length > 0) {
        context.totalPhotos = photosResult.rows[0].total || 0;
        context.photoGroups = photosResult.rows[0].grupos || 0;
        console.log(`[geminiService] ✅ Encontradas ${context.totalPhotos} fotos en ${context.photoGroups} grupos`);
      }
    } catch (error) {
      console.error('[geminiService] Error leyendo fotos:', error);
    }

    return context;
  } catch (error) {
    console.error('[geminiService] ❌ Error fatal en getJobContext:', error);
    throw error;
  }
}

/**
 * Genera una respuesta usando Gemini con búsqueda en internet
 * Enfocado en: normativas ambientales, leyes, OEFA, MINAM, temas ambientales generales
 * Usa la API REST con la herramienta oficial google_search (sin function calling a la DB).
 * Puede incluir fotos para análisis multimodal.
 */
export async function generateNormativeResponse(userMessage, conversationHistory = [], photosData = []) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no está configurada');
    }

    if (!userMessage || !userMessage.trim()) {
      throw new Error('El mensaje no puede estar vacío');
    }

    // Construir historial como texto plano para dar contexto, sin exponer detalles técnicos
    const historyText = (conversationHistory || [])
      .filter(msg => msg && msg.content && msg.content.trim().length > 0)
      .map(msg => {
        const roleLabel = msg.role === 'user' ? 'Usuario' : 'Asistente';
        return `${roleLabel}: ${msg.content.trim()}`;
      })
      .join('\n');

    const INTERNET_SEARCH_PROMPT = `Eres Aisa, una asistente virtual experta en supervisión ambiental y normativa peruana (OEFA, MINAM, normativa ambiental, hidrocarburos).\n\nEn este modo de BÚSQUEDA EN INTERNET, tu tarea es responder preguntas sobre normativas ambientales, leyes, funciones institucionales, definiciones y lineamientos públicos usando información actualizada de internet.\n\nReglas:\n- Usa lenguaje claro, profesional y en español.\n- Busca información actualizada en internet sobre: normativas ambientales peruanas, leyes, OEFA, MINAM, estándares ambientales, hidrocarburos, etc.\n- Siempre que hables de normativa, intenta citar la fuente principal (ej: OEFA, MINAM, normas específicas) y, cuando sea posible, menciona el nombre o número de la norma.\n- Recuerda que la normativa puede actualizarse. Indica al usuario que siempre verifique la versión oficial vigente.\n- No inventes números de norma ni fechas si no estás segura; en ese caso, habla en términos generales.\n- No hagas referencia a detalles internos de bases de datos específicas; aquí solo usas información pública y la búsqueda web.\n- Si recibes fotografías, analízalas y proporciona contexto normativo o de buenas prácticas ambientales relacionadas.\n\nResponde ahora a la consulta del usuario.`;

    const fullPrompt = historyText
      ? `${INTERNET_SEARCH_PROMPT}\n\nHistorial reciente:\n${historyText}\n\nNueva pregunta del usuario: ${userMessage.trim()}`
      : `${INTERNET_SEARCH_PROMPT}\n\nPregunta del usuario: ${userMessage.trim()}`;

    // Construir parts: texto + fotos (si las hay)
    const parts = [{ text: fullPrompt }];

    if (photosData && photosData.length > 0) {
      console.log(`[geminiService] 📸 Incluyendo ${photosData.length} foto(s) en consulta normativa`);
      photosData.forEach(photo => {
        parts.push({
          inline_data: {
            mime_type: photo.mimeType,
            data: photo.base64
          }
        });
      });
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      tools: [
        { google_search: {} }
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048
      }
    };

    const response = await axios.post(
      `${GEMINI_REST_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      body,
      { timeout: 20000 }
    );

    const data = response.data || {};
    const candidate = (data.candidates && data.candidates[0]) || null;
    const responseParts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : [];
    const text = responseParts.map(p => p.text || '').join('').trim();

    const usage = data.usageMetadata || {};

    return {
      success: true,
      message: text || 'No se pudo generar una respuesta normativa en este momento.',
      tokensUsed: {
        prompt: usage.promptTokenCount || 0,
        completion: usage.candidatesTokenCount || 0,
        total: usage.totalTokenCount || 0
      }
    };
  } catch (error) {
    console.error('[geminiService] Error generando respuesta normativa:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message || 'Error al generar respuesta normativa',
      message: 'Lo siento, ocurrió un error al procesar tu consulta normativa. Por favor, intenta nuevamente.'
    };
  }
}

/**
 * Construye el contexto de datos para el prompt
 */
function buildDataContext(jobContext) {
  let context = `**INFORMACIÓN DEL CÓDIGO DE ACCIÓN (CA)**\n\n`;
  context += `- **Código CA:** ${jobContext.caCode}\n`;
  context += `- **Total de registros:** ${jobContext.recordCount || jobContext.totalRecords}\n`;
  context += `- **Grupos de fotos:** ${jobContext.photoGroups || 0}\n`;
  context += `- **Total de fotografías:** ${jobContext.totalPhotos || 0}\n`;
  context += `- **Fecha de descarga:** ${jobContext.createdAt}\n\n`;

  if (jobContext.stats) {
    context += `**ESTADÍSTICAS:**\n\n`;

    if (jobContext.stats.supervisors) {
      context += `- **Supervisores:** ${jobContext.stats.supervisors.join(', ')}\n`;
    }

    if (jobContext.stats.componentes) {
      context += `- **Total de Componentes/Locaciones:** ${jobContext.stats.componentes.length}\n`;
      context += `- **Lista completa de Componentes/Locaciones:**\n`;
      // Enviar TODOS los componentes, no solo los primeros 10
      jobContext.stats.componentes.forEach((comp, idx) => {
        context += `  ${idx + 1}. ${comp}\n`;
      });
      context += `\n`;
    }

    if (jobContext.stats.fechaInicio && jobContext.stats.fechaFin) {
      context += `- **Rango de fechas:** ${jobContext.stats.fechaInicio} a ${jobContext.stats.fechaFin}\n`;
    }

    context += `\n`;
  }

  if (jobContext.availableFields) {
    context += `**CAMPOS DISPONIBLES:**\n${jobContext.availableFields.join(', ')}\n\n`;
  }

  // RESUMEN DE HALLAZGOS (Hechos y Descripciones)
  if (jobContext.records && jobContext.records.length > 0) {
    const hechos = [...new Set(jobContext.records.map(r => r.hecho_detectado).filter(Boolean))];
    const descripciones = [...new Set(jobContext.records.map(r => r.descripcion_hecho).filter(Boolean))];

    if (hechos.length > 0 || descripciones.length > 0) {
      context += `**RESUMEN DE HALLAZGOS:**\n`;

      if (hechos.length > 0) {
        context += `- **Hechos Detectados (${hechos.length}):**\n`;
        hechos.slice(0, 20).forEach(h => context += `  * ${h}\n`); // Limit to 20 to avoid token overflow
        if (hechos.length > 20) context += `  * ... y ${hechos.length - 20} más.\n`;
      }

      if (descripciones.length > 0) {
        context += `- **Descripciones de Hechos (${descripciones.length}):**\n`;
        descripciones.slice(0, 20).forEach(d => context += `  * ${d}\n`);
        if (descripciones.length > 20) context += `  * ... y ${descripciones.length - 20} más.\n`;
      }
      context += `\n`;
    }
  }

  return context;
}

/**
 * Genera una respuesta usando Gemini
 */
export async function generateResponse(userMessage, jobContext, conversationHistory = []) {
  try {
    // Construir el contexto de datos
    const dataContext = buildDataContext(jobContext);

    // Construir el historial de conversación (filtrar mensajes vacíos o inválidos)
    const history = conversationHistory
      .filter(msg => msg && msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content.trim() }]
      }));

    // Iniciar chat con historial
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT }]
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Soy tu asistente de supervisión ambiental de OEFA, especializado en hidrocarburos. Estoy listo para ayudarte a analizar los datos de campo. ¿En qué puedo asistirte?' }]
        },
        {
          role: 'user',
          parts: [{ text: `Aquí está el contexto de los datos que tenemos disponibles:\n\n${dataContext}` }]
        },
        {
          role: 'model',
          parts: [{ text: 'Perfecto, he revisado la información del código de acción. Puedo ayudarte a analizar estos datos, responder preguntas específicas, generar resúmenes o identificar patrones. ¿Qué necesitas saber?' }]
        },
        ...history
      ]
    });

    // Si el usuario pregunta por datos específicos, incluir muestra de registros
    let enhancedMessage = userMessage;
    if (jobContext.records && jobContext.records.length > 0) {
      const needsData = /tabla|datos|registros|información|detalles|muestra|ejemplo/i.test(userMessage);

      if (needsData) {
        // Incluir una muestra de hasta 5 registros
        const sample = jobContext.records.slice(0, 5);
        enhancedMessage += `\n\n**MUESTRA DE DATOS (primeros ${sample.length} registros):**\n\n`;
        enhancedMessage += JSON.stringify(sample, null, 2);

        if (jobContext.records.length > 5) {
          enhancedMessage += `\n\n(Hay ${jobContext.records.length - 5} registros más disponibles)`;
        }
      }
    }

    // Enviar mensaje y manejar Function Calling
    let result = await chat.sendMessage(enhancedMessage);
    let response = result.response;

    // Manejar llamadas a herramientas (Function Calling)
    const maxToolCalls = 5; // Límite de llamadas recursivas
    let toolCallCount = 0;
    let capturedActions = []; // Capturar acciones especiales para el frontend

    while (response.functionCalls() && toolCallCount < maxToolCalls) {
      toolCallCount++;
      console.log(`[geminiService] 🔧 Gemini solicita ${response.functionCalls().length} herramienta(s)`);

      const functionCalls = response.functionCalls();
      const functionResponses = [];

      // Ejecutar cada herramienta solicitada
      for (const call of functionCalls) {
        console.log(`[geminiService] 🔧 Ejecutando: ${call.name}`);

        try {
          const toolResult = await executeToolCall(call.name, call.args, jobContext.caCode);

          // Capturar acciones especiales (ej: filtrar fotos en sidebar)
          if (toolResult.action) {
            capturedActions.push(toolResult);
            console.log(`[geminiService] ✅ Acción capturada: ${toolResult.action}`);
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: toolResult
            }
          });
        } catch (toolError) {
          console.error(`[geminiService] ❌ Error en herramienta ${call.name}:`, toolError);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: {
                error: true,
                message: toolError.message
              }
            }
          });
        }
      }

      // Enviar resultados de las herramientas a Gemini
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    if (toolCallCount >= maxToolCalls) {
      console.warn(`[geminiService] ⚠️ Límite de llamadas a herramientas alcanzado (${maxToolCalls})`);
    }

    const text = response.text();

    const responseData = {
      success: true,
      message: text,
      toolCallsUsed: toolCallCount,
      tokensUsed: {
        prompt: result.response.usageMetadata?.promptTokenCount || 0,
        completion: result.response.usageMetadata?.candidatesTokenCount || 0,
        total: result.response.usageMetadata?.totalTokenCount || 0
      }
    };

    // Incluir acciones capturadas si existen (ej: filtros de fotos)
    if (capturedActions.length > 0) {
      responseData.actions = capturedActions;
      console.log(`[geminiService] 📦 Enviando ${capturedActions.length} acción(es) al frontend`);
    }

    return responseData;

  } catch (error) {
    console.error('[geminiService] Error generando respuesta:', error);
    return {
      success: false,
      error: error.message || 'Error al generar respuesta',
      message: 'Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente.'
    };
  }
}

/**
 * Analiza una fotografía usando Gemini Vision
 */
export async function analyzePhoto(photoPath, question = null) {
  try {
    if (!fs.existsSync(photoPath)) {
      throw new Error('Figura No encontrada');
    }

    // Leer la imagen como base64
    const imageBuffer = fs.readFileSync(photoPath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = photoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    const prompt = question ||
      'Analiza esta fotografía de supervisión ambiental. Describe lo que observas, identifica elementos relevantes para la supervisión (equipos, instalaciones, condiciones ambientales, posibles hallazgos), y proporciona un análisis técnico profesional.';

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType
        }
      },
      { text: `${SYSTEM_PROMPT}\n\n${prompt}` }
    ]);

    const response = result.response;
    const text = response.text();

    return {
      success: true,
      analysis: text,
      tokensUsed: {
        prompt: result.response.usageMetadata?.promptTokenCount || 0,
        completion: result.response.usageMetadata?.candidatesTokenCount || 0,
        total: result.response.usageMetadata?.totalTokenCount || 0
      }
    };

  } catch (error) {
    console.error('[geminiService] Error analizando foto:', error);
    return {
      success: false,
      error: error.message || 'Error al analizar fotografía'
    };
  }
}

/**
 * Genera una respuesta con imágenes adjuntas (multimodal)
 * @param {string} userMessage - Mensaje del usuario
 * @param {Array} photos - Array de objetos {base64: string, mimeType: string, metadata: object}
 * @param {object} jobContext - Contexto del CA
 * @param {Array} conversationHistory - Historial de conversación
 */
export async function generateResponseWithPhotos(userMessage, photos = [], jobContext, conversationHistory = []) {
  try {
    // Construir el contexto de datos
    const dataContext = buildDataContext(jobContext);

    // Construir el historial de conversación
    const history = conversationHistory
      .filter(msg => msg && msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content.trim() }]
      }));

    // Iniciar chat con historial
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT }]
        },
        {
          role: 'model',
          parts: [{ text: 'Entendido. Soy tu asistente de supervisión ambiental de OEFA, especializado en hidrocarburos. Estoy listo para ayudarte a analizar los datos de campo y fotografías. ¿En qué puedo asistirte?' }]
        },
        {
          role: 'user',
          parts: [{ text: `Aquí está el contexto de los datos que tenemos disponibles:\n\n${dataContext}` }]
        },
        {
          role: 'model',
          parts: [{ text: 'Perfecto, he revisado la información del código de acción. Puedo ayudarte a analizar estos datos, responder preguntas específicas, generar resúmenes o identificar patrones. También puedo analizar fotografías de campo. ¿Qué necesitas saber?' }]
        },
        ...history
      ]
    });

    // Construir las partes del mensaje (texto + fotos)
    const messageParts = [];

    // Agregar texto del mensaje
    if (userMessage && userMessage.trim()) {
      let enhancedMessage = userMessage;

      // Si hay fotos, agregar contexto
      if (photos && photos.length > 0) {
        enhancedMessage += `\n\n**Tengo ${photos.length} fotografía(s) adjunta(s) para que analices.**\n`;
        photos.forEach((photo, idx) => {
          if (photo.metadata) {
            enhancedMessage += `\n**Foto ${idx + 1}:**`;
            if (photo.metadata.componente) enhancedMessage += ` Componente: ${photo.metadata.componente}`;
            if (photo.metadata.supervisor) enhancedMessage += ` | Supervisor: ${photo.metadata.supervisor}`;
            if (photo.metadata.fecha) enhancedMessage += ` | Fecha: ${new Date(photo.metadata.fecha).toLocaleDateString('es-PE')}`;
          }
        });
      }

      messageParts.push({ text: enhancedMessage });
    }

    // Agregar fotos
    if (photos && photos.length > 0) {
      photos.forEach((photo) => {
        if (photo.base64 && photo.mimeType) {
          messageParts.push({
            inlineData: {
              data: photo.base64,
              mimeType: photo.mimeType
            }
          });
        }
      });
    }

    // Enviar mensaje con fotos
    console.log(`[geminiService] 📸 Enviando mensaje con ${photos.length} foto(s)`);
    let result = await chat.sendMessage(messageParts);
    let response = result.response;

    // Manejar Function Calling si es necesario
    const maxToolCalls = 5;
    let toolCallCount = 0;
    let capturedActions = [];

    while (response.functionCalls() && toolCallCount < maxToolCalls) {
      toolCallCount++;
      console.log(`[geminiService] 🔧 Gemini solicita ${response.functionCalls().length} herramienta(s)`);

      const functionCalls = response.functionCalls();
      const functionResponses = [];

      for (const call of functionCalls) {
        try {
          const toolResult = await executeToolCall(call.name, call.args, jobContext.caCode);

          if (toolResult.action) {
            capturedActions.push(toolResult);
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: toolResult
            }
          });
        } catch (toolError) {
          console.error(`[geminiService] ❌ Error en herramienta ${call.name}:`, toolError);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: true, message: toolError.message }
            }
          });
        }
      }

      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    const text = response.text();

    const responseData = {
      success: true,
      message: text,
      toolCallsUsed: toolCallCount,
      photosAnalyzed: photos.length,
      tokensUsed: {
        prompt: result.response.usageMetadata?.promptTokenCount || 0,
        completion: result.response.usageMetadata?.candidatesTokenCount || 0,
        total: result.response.usageMetadata?.totalTokenCount || 0
      }
    };

    if (capturedActions.length > 0) {
      responseData.actions = capturedActions;
    }

    return responseData;

  } catch (error) {
    console.error('[geminiService] Error generando respuesta con fotos:', error);
    return {
      success: false,
      error: error.message || 'Error al generar respuesta',
      message: 'Lo siento, ocurrió un error al procesar tu solicitud con fotografías. Por favor, intenta nuevamente.'
    };
  }
}

export default {
  generateResponse,
  generateResponseWithPhotos,
  analyzePhoto,
  getJobContext,
  generateNormativeResponse
};
