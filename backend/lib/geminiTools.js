/**
 * Herramientas (Function Calling) para Gemini
 * Permite a Gemini hacer consultas dinámicas a la base de datos
 */

import { query as dbQuery } from '../db/config.js';

/**
 * Definición de herramientas disponibles para Gemini
 */
export const tools = [
  {
    functionDeclarations: [
      {
        name: "get_database_schema",
        description: "Obtiene el esquema de la tabla arcgis_records_active con nombres de columnas y sus tipos de datos",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "query_records",
        description: "Ejecuta una consulta SQL para obtener registros específicos del código de acción. Útil para obtener datos detallados.",
        parameters: {
          type: "object",
          properties: {
            columns: {
              type: "array",
              items: { type: "string" },
              description: "Lista de columnas a seleccionar (ej: ['componente', 'fecha', 'nombre_supervisor']). Si está vacío, selecciona todas (*)"
            },
            where: {
              type: "string",
              description: "Cláusula WHERE adicional (opcional). No incluir 'WHERE', solo la condición (ej: 'componente LIKE \"%EA%\"')"
            },
            limit: {
              type: "number",
              description: "Límite de registros a retornar (default: 100, máximo: 1000)"
            }
          }
        }
      },
      {
        name: "get_unique_values",
        description: "Obtiene todos los valores únicos de una columna específica. Ideal para listas completas de componentes, supervisores, etc.",
        parameters: {
          type: "object",
          properties: {
            column: {
              type: "string",
              description: "Nombre exacto de la columna (ej: 'componente', 'nombre_supervisor', 'tipo_actividad')"
            }
          },
          required: ["column"]
        }
      },
      {
        name: "get_aggregated_stats",
        description: "Obtiene estadísticas agregadas (conteos, promedios, etc.) agrupadas por una columna",
        parameters: {
          type: "object",
          properties: {
            aggregation: {
              type: "string",
              enum: ["count", "sum", "avg", "min", "max"],
              description: "Tipo de agregación a realizar"
            },
            column: {
              type: "string",
              description: "Columna sobre la cual hacer la agregación (puede ser '*' para COUNT)"
            },
            groupBy: {
              type: "string",
              description: "Columna por la cual agrupar los resultados (opcional)"
            }
          },
          required: ["aggregation"]
        }
      },
      {
        name: "search_records",
        description: "Busca registros que contengan un texto específico en cualquier campo de texto",
        parameters: {
          type: "object",
          properties: {
            searchTerm: {
              type: "string",
              description: "Término de búsqueda"
            },
            columns: {
              type: "array",
              items: { type: "string" },
              description: "Columnas específicas donde buscar (opcional, si está vacío busca en campos de texto principales)"
            }
          },
          required: ["searchTerm"]
        }
      },
      {
        name: "query_by_date",
        description: "Consulta registros por fecha. IMPORTANTE: Las fechas en la base de datos están en formato Unix timestamp (milisegundos). Esta herramienta acepta fechas en español y las convierte automáticamente. Úsala SIEMPRE que el usuario mencione fechas específicas, rangos de fechas, o meses.",
        parameters: {
          type: "object",
          properties: {
            dateFrom: {
              type: "string",
              description: "Fecha de inicio en formato flexible: 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', o texto en español como '10 de agosto de 2024'. Si es solo mes/año como 'agosto 2024', se toma el día 1."
            },
            dateTo: {
              type: "string",
              description: "Fecha de fin (opcional). Mismo formato que dateFrom. Si solo se especifica un mes, se toma el último día de ese mes."
            },
            includeFields: {
              type: "array",
              items: { type: "string" },
              description: "Campos adicionales a incluir en la respuesta (opcional, default: fecha, componente, nombre_supervisor)"
            }
          },
          required: ["dateFrom"]
        }
      },
      {
        name: "get_photos_by_record",
        description: "Obtiene todas las fotografías asociadas a un registro específico usando su globalid. Retorna lista de fotos con nombres de archivo y metadatos.",
        parameters: {
          type: "object",
          properties: {
            globalid: {
              type: "string",
              description: "GlobalID del registro del cual obtener las fotos"
            }
          },
          required: ["globalid"]
        }
      },
      {
        name: "get_photo_metadata",
        description: "Obtiene metadatos detallados de una fotografía específica (tamaño, dimensiones, fecha de captura, etc.)",
        parameters: {
          type: "object",
          properties: {
            globalid: {
              type: "string",
              description: "GlobalID del registro"
            },
            filename: {
              type: "string",
              description: "Nombre del archivo de foto"
            }
          },
          required: ["globalid", "filename"]
        }
      },
      {
        name: "search_photos_by_criteria",
        description: "Busca fotografías que cumplan criterios específicos (por componente, supervisor, fecha, etc.). Útil para encontrar fotos de locaciones específicas.",
        parameters: {
          type: "object",
          properties: {
            componente: {
              type: "string",
              description: "Filtrar por componente/locación (opcional)"
            },
            supervisor: {
              type: "string",
              description: "Filtrar por supervisor (opcional)"
            },
            dateFrom: {
              type: "string",
              description: "Fecha desde (opcional, formato flexible)"
            },
            dateTo: {
              type: "string",
              description: "Fecha hasta (opcional, formato flexible)"
            },
            limit: {
              type: "number",
              description: "Límite de grupos de fotos a retornar (default: 50)"
            }
          }
        }
      },
      {
        name: "get_photo_statistics",
        description: "Obtiene estadísticas sobre las fotografías: total por componente, por supervisor, por fecha, distribución, etc.",
        parameters: {
          type: "object",
          properties: {
            groupBy: {
              type: "string",
              enum: ["componente", "supervisor", "fecha", "tipo_componente"],
              description: "Campo por el cual agrupar las estadísticas"
            }
          },
          required: ["groupBy"]
        }
      },
      {
        name: "filter_photos_in_sidebar",
        description: "Aplica filtros en el sidebar de fotografías del chat. Usa esta herramienta cuando el usuario pida ver fotos específicas por supervisor, componente, tipo, fecha, etc. Los filtros se aplicarán automáticamente en el panel de fotos.",
        parameters: {
          type: "object",
          properties: {
            supervisor: {
              type: "string",
              description: "Filtrar por supervisor específico (opcional). Usa el nombre exacto que aparece en la base de datos."
            },
            tipo_componente: {
              type: "string",
              description: "Filtrar por tipo de componente (opcional)"
            },
            componente: {
              type: "string",
              description: "Filtrar por componente/locación específica (opcional)"
            },
            subcomponente: {
              type: "string",
              description: "Filtrar por subcomponente (opcional)"
            },
            instalacion_referencia: {
              type: "string",
              description: "Filtrar por instalación de referencia (opcional)"
            },
            tipo_de_reporte: {
              type: "string",
              description: "Filtrar por tipo de reporte (opcional)"
            },
            hecho_detec: {
              type: "string",
              description: "Filtrar por hecho detectado (opcional)"
            },
            dateFrom: {
              type: "string",
              description: "Fecha desde (opcional). Formato flexible: 'DD/MM/YYYY', 'YYYY-MM-DD', o texto en español como '10 de agosto de 2024'"
            },
            dateTo: {
              type: "string",
              description: "Fecha hasta (opcional). Mismo formato que dateFrom"
            }
          }
        }
      }
    ]
  }
];

/**
 * Ejecuta una herramienta llamada por Gemini
 */
export async function executeToolCall(toolName, args, caCode) {
  console.log(`[geminiTools] 🔧 Ejecutando herramienta: ${toolName}`, args);

  try {
    switch (toolName) {
      case "get_database_schema":
        return await getDatabaseSchema(caCode);
      
      case "query_records":
        return await queryRecords(caCode, args.columns, args.where, args.limit);
      
      case "get_unique_values":
        return await getUniqueValues(caCode, args.column);
      
      case "get_aggregated_stats":
        return await getAggregatedStats(caCode, args.aggregation, args.column, args.groupBy);
      
      case "search_records":
        return await searchRecords(caCode, args.searchTerm, args.columns);
      
      case "query_by_date":
        return await queryByDate(caCode, args.dateFrom, args.dateTo, args.includeFields);
      
      case "get_photos_by_record":
        return await getPhotosByRecord(caCode, args.globalid);
      
      case "get_photo_metadata":
        return await getPhotoMetadata(caCode, args.globalid, args.filename);
      
      case "search_photos_by_criteria":
        return await searchPhotosByCriteria(caCode, args);
      
      case "get_photo_statistics":
        return await getPhotoStatistics(caCode, args.groupBy);
      
      case "filter_photos_in_sidebar":
        return await filterPhotosInSidebar(caCode, args);
      
      default:
        throw new Error(`Herramienta desconocida: ${toolName}`);
    }
  } catch (error) {
    console.error(`[geminiTools] ❌ Error ejecutando ${toolName}:`, error);
    return {
      error: true,
      message: error.message
    };
  }
}

/**
 * Obtiene el esquema de la base de datos
 */
async function getDatabaseSchema(caCode) {
  const result = await dbQuery(`PRAGMA table_info(arcgis_records_active)`);
  
  const schema = result.rows.map(col => ({
    name: col.name,
    type: col.type,
    notNull: col.notnull === 1,
    defaultValue: col.dflt_value
  }));

  console.log(`[geminiTools] ✅ Esquema obtenido: ${schema.length} columnas`);
  
  return {
    table: "arcgis_records_active",
    columns: schema,
    totalColumns: schema.length
  };
}

/**
 * Consulta registros con filtros específicos
 */
async function queryRecords(caCode, columns = [], where = null, limit = 100) {
  // Validar límite
  const safeLimit = Math.min(Math.max(1, limit || 100), 1000);
  
  // Construir SELECT
  const selectColumns = columns && columns.length > 0 ? columns.join(', ') : '*';
  
  // Construir WHERE
  let whereClause = `COALESCE(codigo_accion, otro_ca) = ?`;
  const params = [caCode];
  
  if (where && where.trim()) {
    whereClause += ` AND (${where})`;
  }
  
  const sql = `
    SELECT ${selectColumns}
    FROM arcgis_records_active
    WHERE ${whereClause}
    ORDER BY fecha DESC
    LIMIT ${safeLimit}
  `;
  
  console.log(`[geminiTools] 📊 Ejecutando query:`, sql);
  
  const result = await dbQuery(sql, params);
  
  // Formatear registros (nombres de supervisores y fechas)
  const formattedRecords = result.rows.map(formatRecord);
  
  console.log(`[geminiTools] ✅ Query ejecutada: ${formattedRecords.length} registros`);
  
  return {
    records: formattedRecords,
    count: formattedRecords.length,
    limit: safeLimit
  };
}

/**
 * Obtiene valores únicos de una columna
 */
async function getUniqueValues(caCode, column) {
  if (!column) {
    throw new Error('Columna es requerida');
  }

  // Validar que la columna existe (prevenir SQL injection)
  const schemaResult = await dbQuery(`PRAGMA table_info(arcgis_records_active)`);
  const validColumns = schemaResult.rows.map(col => col.name);
  
  if (!validColumns.includes(column)) {
    throw new Error(`Columna '${column}' no existe en la tabla`);
  }

  const sql = `
    SELECT DISTINCT ${column}
    FROM arcgis_records_active
    WHERE COALESCE(codigo_accion, otro_ca) = ?
      AND ${column} IS NOT NULL
      AND ${column} != ''
    ORDER BY ${column}
  `;
  
  const result = await dbQuery(sql, [caCode]);
  let values = result.rows.map(row => row[column]);
  
  // Si es nombre_supervisor, formatear los nombres
  if (column === 'nombre_supervisor') {
    values = values.map(formatSupervisorName);
  }
  
  console.log(`[geminiTools] ✅ Valores únicos de '${column}': ${values.length} valores`);
  
  return {
    column: column,
    values: values,
    count: values.length
  };
}

/**
 * Obtiene estadísticas agregadas
 */
async function getAggregatedStats(caCode, aggregation, column = '*', groupBy = null) {
  const validAggregations = ['count', 'sum', 'avg', 'min', 'max'];
  
  if (!validAggregations.includes(aggregation.toLowerCase())) {
    throw new Error(`Agregación inválida: ${aggregation}`);
  }

  const aggFunc = aggregation.toUpperCase();
  const aggColumn = column === '*' ? '*' : column;
  
  let sql;
  if (groupBy) {
    sql = `
      SELECT ${groupBy}, ${aggFunc}(${aggColumn}) as value
      FROM arcgis_records_active
      WHERE COALESCE(codigo_accion, otro_ca) = ?
      GROUP BY ${groupBy}
      ORDER BY value DESC
    `;
  } else {
    sql = `
      SELECT ${aggFunc}(${aggColumn}) as value
      FROM arcgis_records_active
      WHERE COALESCE(codigo_accion, otro_ca) = ?
    `;
  }
  
  const result = await dbQuery(sql, [caCode]);
  
  console.log(`[geminiTools] ✅ Estadísticas calculadas: ${result.rows.length} resultados`);
  
  return {
    aggregation: aggregation,
    column: column,
    groupBy: groupBy,
    results: result.rows
  };
}

/**
 * Busca registros por texto
 */
async function searchRecords(caCode, searchTerm, columns = []) {
  if (!searchTerm || !searchTerm.trim()) {
    throw new Error('Término de búsqueda es requerido');
  }

  const searchPattern = `%${searchTerm}%`;
  
  // Si no se especifican columnas, buscar en campos de texto principales
  const defaultSearchColumns = [
    'componente',
    'nombre_supervisor',
    'tipo_actividad',
    'observaciones',
    'descripcion'
  ];
  
  const searchColumns = columns && columns.length > 0 ? columns : defaultSearchColumns;
  
  // Construir condiciones OR para cada columna
  const searchConditions = searchColumns.map(col => `${col} LIKE ?`).join(' OR ');
  const searchParams = searchColumns.map(() => searchPattern);
  
  const sql = `
    SELECT *
    FROM arcgis_records_active
    WHERE COALESCE(codigo_accion, otro_ca) = ?
      AND (${searchConditions})
    ORDER BY fecha DESC
    LIMIT 100
  `;
  
  const result = await dbQuery(sql, [caCode, ...searchParams]);
  
  // Formatear registros (nombres de supervisores y fechas)
  const formattedRecords = result.rows.map(formatRecord);
  
  console.log(`[geminiTools] ✅ Búsqueda completada: ${formattedRecords.length} registros encontrados`);
  
  return {
    searchTerm: searchTerm,
    searchedColumns: searchColumns,
    records: formattedRecords,
    count: formattedRecords.length
  };
}

/**
 * Normaliza una fecha en español/varios formatos a timestamp Unix (milisegundos)
 */
export function parseDateToTimestamp(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Fecha inválida');
  }

  // Mapa de meses en español
  const mesesES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };

  dateStr = dateStr.toLowerCase().trim();

  // Patrón: "10 de agosto de 2024" o "10 agosto 2024"
  const spanishPattern = /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/;
  let match = dateStr.match(spanishPattern);
  
  if (match) {
    const dia = parseInt(match[1]);
    const mesNombre = match[2];
    const anio = parseInt(match[3]);
    const mes = mesesES[mesNombre];
    
    if (!mes) {
      throw new Error(`Mes no reconocido: ${mesNombre}`);
    }
    
    // Crear fecha en zona horaria de Perú (UTC-5)
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón: "agosto 2024" (solo mes y año) - retorna primer día del mes
  const monthYearPattern = /(\w+)\s+(\d{4})/;
  match = dateStr.match(monthYearPattern);
  
  if (match) {
    const mesNombre = match[1];
    const anio = parseInt(match[2]);
    const mes = mesesES[mesNombre];
    
    if (!mes) {
      throw new Error(`Mes no reconocido: ${mesNombre}`);
    }
    
    const date = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón: DD/MM/YYYY o DD-MM-YYYY
  const dmyPattern = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;
  match = dateStr.match(dmyPattern);
  
  if (match) {
    const dia = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const anio = parseInt(match[3]);
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón ISO con hora: YYYY-MM-DD HH:MM:SS
  const isoWithTimePattern = /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/;
  match = dateStr.match(isoWithTimePattern);
  
  if (match) {
    const anio = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const dia = parseInt(match[3]);
    const hora = parseInt(match[4]);
    const minuto = parseInt(match[5]);
    const segundo = parseInt(match[6]);
    const date = new Date(anio, mes - 1, dia, hora, minuto, segundo, 0);
    return date.getTime();
  }

  // Patrón ISO solo fecha: YYYY-MM-DD
  const isoPattern = /(\d{4})-(\d{1,2})-(\d{1,2})/;
  match = dateStr.match(isoPattern);
  
  if (match) {
    const anio = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const dia = parseInt(match[3]);
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  // Intentar parseo directo (fallback)
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`No se pudo interpretar la fecha: ${dateStr}`);
  }
  
  return date.getTime();
}

/**
 * Obtiene el último día de un mes
 */
function getEndOfMonth(year, month) {
  // month es 1-indexed (1 = enero, 12 = diciembre)
  const date = new Date(year, month, 0); // Día 0 del mes siguiente = último día del mes actual
  return date.getTime();
}

/**
 * Convierte timestamp Unix a formato legible
 */
function timestampToReadable(timestamp) {
  const date = new Date(parseFloat(timestamp));
  if (isNaN(date.getTime())) return timestamp;
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const anio = date.getFullYear();
  
  return `${dia}/${mes}/${anio}`;
}

/**
 * Formatea nombres de supervisores reemplazando guiones bajos por espacios
 */
function formatSupervisorName(name) {
  if (!name || typeof name !== 'string') return name;
  return name.replace(/_/g, ' ');
}

/**
 * Formatea un registro reemplazando campos específicos
 */
function formatRecord(record) {
  if (!record || typeof record !== 'object') return record;
  
  const formatted = { ...record };
  
  // Formatear nombre_supervisor si existe
  if (formatted.nombre_supervisor) {
    formatted.nombre_supervisor = formatSupervisorName(formatted.nombre_supervisor);
  }
  
  // Formatear fecha si existe (agregar versión legible)
  if (formatted.fecha) {
    formatted.fecha_legible = timestampToReadable(formatted.fecha);
  }
  
  return formatted;
}

/**
 * Consulta registros por fecha con normalización automática
 */
async function queryByDate(caCode, dateFrom, dateTo = null, includeFields = []) {
  if (!dateFrom) {
    throw new Error('Fecha de inicio es requerida');
  }

  // Parsear fecha de inicio
  let timestampFrom;
  try {
    timestampFrom = parseDateToTimestamp(dateFrom);
    console.log(`[geminiTools] 📅 Fecha desde: ${dateFrom} → ${timestampFrom} (${timestampToReadable(timestampFrom)})`);
  } catch (error) {
    throw new Error(`Error parseando fecha de inicio: ${error.message}`);
  }

  // Parsear fecha de fin (si existe)
  let timestampTo = null;
  if (dateTo) {
    try {
      timestampTo = parseDateToTimestamp(dateTo);
      
      // Si solo se especificó un mes (ej: "agosto 2024"), ajustar al último día
      if (/^\w+\s+\d{4}$/.test(dateTo.toLowerCase().trim())) {
        const date = new Date(timestampTo);
        timestampTo = getEndOfMonth(date.getFullYear(), date.getMonth() + 1);
      } else {
        // Ajustar al final del día (23:59:59.999)
        timestampTo += (24 * 60 * 60 * 1000) - 1;
      }
      
      console.log(`[geminiTools] 📅 Fecha hasta: ${dateTo} → ${timestampTo} (${timestampToReadable(timestampTo)})`);
    } catch (error) {
      throw new Error(`Error parseando fecha de fin: ${error.message}`);
    }
  } else {
    // Si no hay fecha fin, buscar todo el día de dateFrom
    timestampTo = timestampFrom + (24 * 60 * 60 * 1000) - 1;
  }

  // Construir SELECT
  const defaultFields = ['fecha', 'componente', 'nombre_supervisor'];
  const fields = includeFields && includeFields.length > 0 
    ? ['globalid', ...includeFields] 
    : ['globalid', ...defaultFields];
  
  const selectColumns = fields.join(', ');
  
  // Construir WHERE
  const whereClause = `
    COALESCE(codigo_accion, otro_ca) = ?
    AND CAST(fecha AS REAL) >= ?
    AND CAST(fecha AS REAL) <= ?
  `;
  
  const sql = `
    SELECT ${selectColumns}
    FROM arcgis_records_active
    WHERE ${whereClause}
    ORDER BY CAST(fecha AS REAL) ASC
    LIMIT 1000
  `;
  
  console.log(`[geminiTools] 📊 Consultando registros entre timestamps:`, timestampFrom, timestampTo);
  
  const result = await dbQuery(sql, [caCode, timestampFrom, timestampTo]);
  
  // Formatear registros (fechas y nombres de supervisores)
  const records = result.rows.map(formatRecord);
  
  console.log(`[geminiTools] ✅ Consulta por fecha completada: ${records.length} registros`);
  
  return {
    dateFrom: dateFrom,
    dateTo: dateTo || dateFrom,
    timestampFrom: timestampFrom,
    timestampTo: timestampTo,
    records: records,
    count: records.length,
    note: "Los timestamps en 'fecha' son Unix timestamps en milisegundos. Se agregó 'fecha_legible' en formato DD/MM/YYYY. Los nombres de supervisores están formateados (sin guiones bajos)."
  };
}

/**
 * Obtiene todas las fotos de un registro específico
 */
async function getPhotosByRecord(caCode, globalid) {
  if (!globalid) {
    throw new Error('GlobalID es requerido');
  }

  // Primero verificar que el registro pertenece al CA
  const recordCheck = await dbQuery(`
    SELECT globalid, componente, nombre_supervisor, fecha
    FROM arcgis_records_active
    WHERE globalid = ? AND COALESCE(codigo_accion, otro_ca) = ?
  `, [globalid, caCode]);

  if (!recordCheck.rows || recordCheck.rows.length === 0) {
    throw new Error(`Registro con globalid ${globalid} no encontrado en el CA ${caCode}`);
  }

  const record = formatRecord(recordCheck.rows[0]);

  // Obtener fotos del registro
  const sql = `
    SELECT 
      id,
      filename,
      content_type,
      size,
      created_at
    FROM arcgis_photos_active
    WHERE record_globalid = ?
    ORDER BY filename
  `;

  const result = await dbQuery(sql, [globalid]);
  const photos = result.rows || [];

  console.log(`[geminiTools] ✅ Fotos obtenidas: ${photos.length} fotos para globalid ${globalid}`);

  return {
    globalid: globalid,
    record: {
      componente: record.componente,
      supervisor: record.nombre_supervisor,
      fecha: record.fecha_legible
    },
    photos: photos.map(p => ({
      filename: p.filename,
      contentType: p.content_type,
      size: p.size,
      sizeKB: Math.round(p.size / 1024),
      createdAt: p.created_at
    })),
    count: photos.length
  };
}

/**
 * Obtiene metadatos detallados de una foto específica
 */
async function getPhotoMetadata(caCode, globalid, filename) {
  if (!globalid || !filename) {
    throw new Error('GlobalID y filename son requeridos');
  }

  // Verificar que el registro pertenece al CA
  const recordCheck = await dbQuery(`
    SELECT globalid, componente, nombre_supervisor, fecha
    FROM arcgis_records_active
    WHERE globalid = ? AND COALESCE(codigo_accion, otro_ca) = ?
  `, [globalid, caCode]);

  if (!recordCheck.rows || recordCheck.rows.length === 0) {
    throw new Error(`Registro no encontrado o no pertenece al CA ${caCode}`);
  }

  const record = formatRecord(recordCheck.rows[0]);

  // Obtener metadatos de la foto
  const sql = `
    SELECT *
    FROM arcgis_photos_active
    WHERE record_globalid = ? AND filename = ?
  `;

  const result = await dbQuery(sql, [globalid, filename]);

  if (!result.rows || result.rows.length === 0) {
    throw new Error(`Foto ${filename} no encontrada para el registro ${globalid}`);
  }

  const photo = result.rows[0];

  console.log(`[geminiTools] ✅ Metadatos de foto obtenidos: ${filename}`);

  return {
    photo: {
      filename: photo.filename,
      contentType: photo.content_type,
      size: photo.size,
      sizeKB: Math.round(photo.size / 1024),
      sizeMB: (photo.size / (1024 * 1024)).toFixed(2),
      createdAt: photo.created_at
    },
    record: {
      globalid: globalid,
      componente: record.componente,
      supervisor: record.nombre_supervisor,
      fecha: record.fecha_legible
    },
    note: "Esta foto pertenece al registro indicado. Puedes usar la herramienta de análisis de fotos para obtener información visual."
  };
}

/**
 * Busca fotos por criterios específicos
 */
async function searchPhotosByCriteria(caCode, criteria) {
  const { componente, supervisor, dateFrom, dateTo, limit = 50 } = criteria;
  const safeLimit = Math.min(Math.max(1, limit), 200);

  // Construir WHERE dinámicamente
  let whereConditions = [`COALESCE(r.codigo_accion, r.otro_ca) = ?`];
  const params = [caCode];

  if (componente) {
    whereConditions.push(`r.componente LIKE ?`);
    params.push(`%${componente}%`);
  }

  if (supervisor) {
    whereConditions.push(`r.nombre_supervisor LIKE ?`);
    params.push(`%${supervisor}%`);
  }

  // Manejo de fechas
  if (dateFrom) {
    try {
      const timestampFrom = parseDateToTimestamp(dateFrom);
      whereConditions.push(`CAST(r.fecha AS REAL) >= ?`);
      params.push(timestampFrom);

      if (dateTo) {
        let timestampTo = parseDateToTimestamp(dateTo);
        timestampTo += (24 * 60 * 60 * 1000) - 1; // Fin del día
        whereConditions.push(`CAST(r.fecha AS REAL) <= ?`);
        params.push(timestampTo);
      }
    } catch (dateError) {
      console.warn(`[geminiTools] ⚠️ Error parseando fechas:`, dateError.message);
    }
  }

  const whereClause = whereConditions.join(' AND ');

  const sql = `
    SELECT 
      r.globalid,
      r.componente,
      r.nombre_supervisor,
      r.fecha,
      COUNT(p.id) as photo_count
    FROM arcgis_records_active r
    INNER JOIN arcgis_photos_active p ON p.record_globalid = r.globalid
    WHERE ${whereClause}
    GROUP BY r.globalid
    ORDER BY r.fecha DESC
    LIMIT ${safeLimit}
  `;

  console.log(`[geminiTools] 📊 Buscando fotos con criterios:`, criteria);

  const result = await dbQuery(sql, params);
  const groups = (result.rows || []).map(formatRecord);

  console.log(`[geminiTools] ✅ Búsqueda de fotos completada: ${groups.length} grupos encontrados`);

  return {
    criteria: criteria,
    groups: groups.map(g => ({
      globalid: g.globalid,
      componente: g.componente,
      supervisor: g.nombre_supervisor,
      fecha: g.fecha_legible,
      photoCount: g.photo_count
    })),
    count: groups.length,
    totalPhotos: groups.reduce((sum, g) => sum + (g.photo_count || 0), 0),
    note: "Usa get_photos_by_record con el globalid para obtener la lista de fotos de cada grupo."
  };
}

/**
 * Obtiene estadísticas de fotografías agrupadas
 */
async function getPhotoStatistics(caCode, groupBy) {
  const validGroupBy = ['componente', 'supervisor', 'fecha', 'tipo_componente'];
  
  if (!validGroupBy.includes(groupBy)) {
    throw new Error(`groupBy debe ser uno de: ${validGroupBy.join(', ')}`);
  }

  // Mapeo de campos
  const fieldMap = {
    'supervisor': 'nombre_supervisor',
    'componente': 'componente',
    'fecha': 'fecha',
    'tipo_componente': 'tipo_componente'
  };

  const dbField = fieldMap[groupBy];

  let sql;
  if (groupBy === 'fecha') {
    // Para fechas, agrupar por día
    sql = `
      SELECT 
        r.fecha,
        COUNT(DISTINCT r.globalid) as record_count,
        COUNT(p.id) as photo_count
      FROM arcgis_records_active r
      LEFT JOIN arcgis_photos_active p ON p.record_globalid = r.globalid
      WHERE COALESCE(r.codigo_accion, r.otro_ca) = ?
      GROUP BY r.fecha
      ORDER BY r.fecha DESC
    `;
  } else {
    sql = `
      SELECT 
        r.${dbField} as group_value,
        COUNT(DISTINCT r.globalid) as record_count,
        COUNT(p.id) as photo_count
      FROM arcgis_records_active r
      LEFT JOIN arcgis_photos_active p ON p.record_globalid = r.globalid
      WHERE COALESCE(r.codigo_accion, r.otro_ca) = ?
        AND r.${dbField} IS NOT NULL
        AND r.${dbField} != ''
      GROUP BY r.${dbField}
      ORDER BY photo_count DESC
    `;
  }

  const result = await dbQuery(sql, [caCode]);
  let stats = result.rows || [];

  // Formatear resultados
  if (groupBy === 'fecha') {
    stats = stats.map(s => ({
      fecha: timestampToReadable(s.fecha),
      recordCount: s.record_count,
      photoCount: s.photo_count,
      avgPhotosPerRecord: (s.photo_count / s.record_count).toFixed(1)
    }));
  } else if (groupBy === 'supervisor') {
    stats = stats.map(s => ({
      supervisor: formatSupervisorName(s.group_value),
      recordCount: s.record_count,
      photoCount: s.photo_count,
      avgPhotosPerRecord: (s.photo_count / s.record_count).toFixed(1)
    }));
  } else {
    stats = stats.map(s => ({
      [groupBy]: s.group_value,
      recordCount: s.record_count,
      photoCount: s.photo_count,
      avgPhotosPerRecord: (s.photo_count / s.record_count).toFixed(1)
    }));
  }

  const totalPhotos = stats.reduce((sum, s) => sum + (s.photoCount || 0), 0);
  const totalRecords = stats.reduce((sum, s) => sum + (s.recordCount || 0), 0);

  console.log(`[geminiTools] ✅ Estadísticas de fotos por ${groupBy}: ${stats.length} grupos`);

  return {
    groupBy: groupBy,
    statistics: stats,
    summary: {
      totalGroups: stats.length,
      totalRecords: totalRecords,
      totalPhotos: totalPhotos,
      avgPhotosPerRecord: totalRecords > 0 ? (totalPhotos / totalRecords).toFixed(1) : 0
    }
  };
}

/**
 * Aplica filtros en el sidebar de fotografías
 * Esta herramienta retorna los filtros que deben aplicarse en el frontend
 */
async function filterPhotosInSidebar(caCode, filters) {
  console.log(`[geminiTools] 🔍 Aplicando filtros en sidebar de fotos:`, filters);
  
  // Normalizar filtros para que coincidan con el formato de la BD
  const normalizedFilters = { ...filters };
  
  // Preparar variantes del supervisor para búsqueda flexible
  let supervisorVariants = [];
  if (normalizedFilters.supervisor) {
    const original = normalizedFilters.supervisor;
    const withUnderscores = original.replace(/\s+/g, '_');
    const withSpaces = original.replace(/_/g, ' ');
    
    // Agregar variantes únicas
    supervisorVariants = [...new Set([original, withUnderscores, withSpaces])];
    console.log(`[geminiTools] 📝 Supervisor con variantes: ${supervisorVariants.join(' | ')}`);
    
    // Usar la versión con guiones bajos para el frontend
    normalizedFilters.supervisor = withUnderscores;
  }
  
  // Contar fotos que coinciden con los filtros
  let whereClause = 'COALESCE(r.codigo_accion, r.otro_ca) = ?';
  const params = [caCode];
  
  // Búsqueda flexible de supervisor (con espacios O guiones bajos)
  if (supervisorVariants.length > 0) {
    const supervisorConditions = supervisorVariants.map(() => 'r.nombre_supervisor = ?').join(' OR ');
    whereClause += ` AND (${supervisorConditions})`;
    params.push(...supervisorVariants);
  }
  if (normalizedFilters.tipo_componente) {
    whereClause += ' AND r.tipo_componente = ?';
    params.push(normalizedFilters.tipo_componente);
  }
  if (normalizedFilters.componente) {
    whereClause += ' AND r.componente = ?';
    params.push(normalizedFilters.componente);
  }
  if (normalizedFilters.subcomponente) {
    whereClause += ' AND r.subcomponente = ?';
    params.push(normalizedFilters.subcomponente);
  }
  if (normalizedFilters.instalacion_referencia) {
    whereClause += ' AND r.instalacion_referencia = ?';
    params.push(normalizedFilters.instalacion_referencia);
  }
  if (normalizedFilters.tipo_de_reporte) {
    whereClause += ' AND r.tipo_de_reporte = ?';
    params.push(normalizedFilters.tipo_de_reporte);
  }
  if (normalizedFilters.hecho_detec) {
    whereClause += ' AND r.hecho_detec = ?';
    params.push(normalizedFilters.hecho_detec);
  }
  
  // Filtro de fechas (usando parseDateToTimestamp para formato flexible)
  if (filters.dateFrom) {
    const fromTimestamp = parseDateToTimestamp(filters.dateFrom);
    if (fromTimestamp) {
      whereClause += ' AND r.fecha >= ?';
      params.push(fromTimestamp);
      normalizedFilters.dateFrom = filters.dateFrom;
      console.log(`[geminiTools] 📅 Fecha desde: ${filters.dateFrom} → ${fromTimestamp}`);
    }
  }
  if (filters.dateTo) {
    const toTimestamp = parseDateToTimestamp(filters.dateTo);
    if (toTimestamp) {
      // Agregar 24 horas para incluir todo el día
      whereClause += ' AND r.fecha <= ?';
      params.push(toTimestamp + 86400000);
      normalizedFilters.dateTo = filters.dateTo;
      console.log(`[geminiTools] 📅 Fecha hasta: ${filters.dateTo} → ${toTimestamp}`);
    }
  }
  
  const countSql = `
    SELECT COUNT(DISTINCT r.globalid) as record_count,
           COUNT(p.id) as photo_count
    FROM arcgis_records_active r
    LEFT JOIN arcgis_photos_active p ON p.record_globalid = r.globalid
    WHERE ${whereClause}
  `;
  
  const result = await dbQuery(countSql, params);
  const matchCount = result.rows[0] || { record_count: 0, photo_count: 0 };
  
  console.log(`[geminiTools] ✅ Filtros aplicados: ${matchCount.photo_count} fotos en ${matchCount.record_count} registros`);
  
  return {
    action: 'filter_sidebar_photos',
    filters: normalizedFilters, // Usar filtros normalizados (con guiones bajos)
    matchCount: {
      records: matchCount.record_count,
      photos: matchCount.photo_count
    },
    message: `He aplicado los filtros en el sidebar de fotografías. Se encontraron ${matchCount.photo_count} fotos en ${matchCount.record_count} registros que coinciden con los criterios.`
  };
}
