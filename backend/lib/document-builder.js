/**
 * Módulo para la construcción de documentos Word
 */
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, AlignmentType, 
        ImageRun, BorderStyle, TextRun, VerticalAlign, HeadingLevel, HeightRule } from 'docx';
import { createEmptyCell } from '../utils.js';
// Carga opcional de image-size para leer dimensiones reales del buffer
let imageSize;
try {
  imageSize = require('image-size');
} catch (e) {
  imageSize = null; // Si no está instalado, se usará el ratio 16:9 por defecto
}

/**
 * Crea una celda de tabla con título de fotografía
 * @param {string} titulo Título de la fotografía
 * @param {number} correlativoGlobal Número de foto mostrado en "Figura N.° ..." (respeta startNumber)
 * @param {number} puntoSecuencial Contador secuencial del "Punto de muestreo" empezando en 1
 * @returns {TableCell} Celda de tabla con el título
 */
function createTitleCell(titulo, correlativoGlobal, puntoSecuencial) {
  // Usar el contador secuencial independiente del número inicial elegido por el usuario
  const numeroPunto = Number(puntoSecuencial) || 0;
  
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: titulo,
            bold: true,
            size: 16, // 8pt
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      // Párrafo separado para el punto de muestreo (en su propia línea)
      new Paragraph({
        children: [
          new TextRun({
            text: `(Punto de muestreo N° ${numeroPunto})`,
            bold: true,
            size: 16, // 8pt
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    columnSpan: 4,
    verticalAlign: VerticalAlign.CENTER,
    height: { value: 1.3, rule: HeightRule.ATLEAST }, // Altura mínima de 1.3 cm
  });
}

/**
 * Crea una celda de tabla con la imagen
 * @param {Buffer} imageBuffer Buffer de la imagen
 * @returns {TableCell} Celda de tabla con la imagen
 */
function createImageCell(imageBuffer) {
  try {
    // Calcular dimensiones: alto fijo y ancho en función del ratio real (fallback 16:9)
    const targetHeight = 165;
    let targetWidth = Math.round(targetHeight * 16 / 9);
    if (imageSize) {
      try {
        const dim = imageSize(imageBuffer);
        if (dim && dim.width && dim.height && dim.height > 0) {
          targetWidth = Math.round(targetHeight * (dim.width / dim.height));
        }
      } catch (_) {
        // Ignorar errores de lectura de dimensiones y mantener 16:9
      }
    }
    // Crear la celda con la imagen
    return new TableCell({
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: {
                // Mantener 165 de alto. El ancho se calcula según el ratio real (fallback 16:9)
                height: targetHeight,
                width: targetWidth,
                rotation: 0,
                flip: {
                  horizontal: false,
                  vertical: false,
                },
                // Mantener la proporción original de la imagen
                allowProportionsChange: false,
              },
            }),
          ],
          alignment: AlignmentType.CENTER, // Centrado horizontal
        }),
      ],
      columnSpan: 4,
      verticalAlign: VerticalAlign.CENTER, // Centrado vertical
    });
  } catch (error) {
    console.error('Error al crear celda de imagen:', error);
    // En caso de error, devolver una celda con mensaje de error
    return new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: 'Error al cargar la imagen',
              bold: true,
              color: 'FF0000',
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ],
      columnSpan: 4,
    });
  }
}

/**
 * Crea una celda de tabla con la descripción y coordenadas
 * @param {string} descripcion Descripción de la imagen
 * @param {string} norte Coordenada Norte
 * @param {string} este Coordenada Este
 * @param {string} altitud Altitud
 * @param {string} zona Zona UTM (opcional)
 * @returns {TableCell} Celda de tabla con la descripción y coordenadas
 */
function createDescriptionCell(descripcion, norte, este, altitud, zona) {
  const text = (descripcion || '').toString();
  // Soporte explícito para saltos de línea: convertir "\n" en saltos dentro del run
  const lines = text.split(/\r?\n/);
  const runs = [];
  lines.forEach((line, idx) => {
    // Agregar un salto de línea antes de todas las líneas excepto la primera
    if (idx > 0) {
      runs.push(new TextRun({ break: 1 }));
    }
    runs.push(new TextRun({
      text: line,
      size: 16, // 8pt
      font: "Arial",
    }));
  });

  return new TableCell({
    children: [
      new Paragraph({
        children: runs.length ? runs : [new TextRun({ text: '', size: 16, font: 'Arial' })],
        alignment: AlignmentType.CENTER, // Centrado horizontal
      }),
    ],
    columnSpan: 4,
    verticalAlign: VerticalAlign.CENTER, // Centrado vertical
    height: { value: 0.5, rule: HeightRule.ATLEAST }, // Altura mínima de 0.5 cm
  });
}

/**
 * Crea una tabla para un conjunto de imágenes
 * @param {Array} imageObjects Objetos de imagen con metadatos
 * @param {number} startNumber Índice inicial para la numeración de fotografías
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @param {string|function} descriptionField Campo de descripción a usar o función resolvedora por foto
 * @param {number} pointStartNumber Número de inicio para el contador de Puntos de muestreo (secuencial, típico 1)
 * @returns {Object} Objeto con la tabla y los últimos números usados
 */
function createImageTable(imageObjects, startNumber, photoPrefix, descriptionField = 'Descripcion', pointStartNumber = 1, substitutionOptions = null) {
  let currentPhotoNumber = startNumber;
  let currentPointNumber = pointStartNumber;
  const tableRows = [];
  // Métricas de sustitución por lote
  const substitutionMetrics = {
    totalPoints: 0,
    matched: 0,
    unmatched: 0,
    replacedCoords: 0,
    replacedDescription: 0,
    replacedAltitude: 0,
    missingData: 0,
  };
  
  // Determinar si tenemos un solo registro (caso especial para ancho de tabla)
  const hasSingleRecord = imageObjects.length === 1;
  
  // Crear un mapa para rastrear el orden de los registros por locación
  const locacionCounters = {};
  
  // Primera pasada para inicializar los contadores por locación
  imageObjects.forEach(imageObj => {
    if (imageObj && imageObj.metadata) {
      const locacion = imageObj.metadata.Componente || imageObj.metadata.componente || imageObj.metadata.Locacion || 'desconocida';
      if (!locacionCounters[locacion]) {
        locacionCounters[locacion] = 0;
      }
    }
  });
  
  // Calculamos cuántas filas necesitamos (cada fila visual tiene 2 registros, excepto si es un solo registro)
  const imagesInBatch = Math.min(6, imageObjects.length);
  const rowsNeeded = Math.ceil(imagesInBatch / 2);
  
  // Determinar si tenemos un número impar de registros mayor a 1
  const hasOddRecords = imageObjects.length > 1 && imageObjects.length % 2 !== 0;
  
  // Procesamos cada fila visual (cada fila contiene hasta 2 registros horizontalmente)
  for (let rowIndex = 0; rowIndex < rowsNeeded; rowIndex++) {
    // Arrays para cada tipo de fila en la tabla
    const rowTitleCells = [];
    const rowImageCells = [];
    const rowDescCells = [];
    const rowCoordHeaderCells = [];
    const rowCoordValueCells = [];
    
    // Definir bordes estándar para celdas con contenido
    const standardBorders = {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
    };
    
    // Procesamos cada columna (1 o 2 registros por fila)
    // Si es un solo registro, solo procesamos una columna
    const columnsToProcess = hasSingleRecord ? 1 : 2;
    
    for (let colIndex = 0; colIndex < columnsToProcess; colIndex++) {
      const imageIndex = rowIndex * 2 + colIndex;
      const imageObj = imageIndex < imageObjects.length ? imageObjects[imageIndex] : null;
      
      if (imageObj) {
        // 1. FILA DE TÍTULOS
        const imageMetadata = imageObj.metadata;
        const componente = imageMetadata.Componente || imageMetadata.componente || imageMetadata.Locacion || 'desconocida';
        // Tomar el número del punto desde el metadato numero_punto (con variantes comunes)
        const numeroPuntoMeta = imageMetadata.numero_punto ?? imageMetadata.Numero_punto ?? imageMetadata.NumeroPunto ?? imageMetadata.numeroPunto ?? imageMetadata.Numero_Punto ?? imageMetadata.numero ?? imageMetadata.Numero ?? '';
        // Regla: agregar "PZ" solo si el componente NO inicia con estos prefijos
        const compStr = String(componente || '').trim();
        const compUpper = compStr.toUpperCase();
        const skipPZPrefixes = ['MNF', 'MC', 'QDA', 'BAT', 'BA'];
        const addPZ = !skipPZPrefixes.some(prefix => compUpper.startsWith(prefix));
        const nombrePuntoCalculado = `${photoPrefix || 'L-X,6'},${addPZ ? 'PZ' : ''}${compStr}${numeroPuntoMeta ? `-${numeroPuntoMeta}` : ''}`;
        const titulo = `Figura N° ${currentPhotoNumber}: ${nombrePuntoCalculado}`;
        // Resolver sustitución exacta por nombre de punto si se proporcionó
        let subsRec = null;
        if (substitutionOptions && substitutionOptions.map && typeof substitutionOptions.map === 'object') {
          const key = String(nombrePuntoCalculado).trim();
          substitutionMetrics.totalPoints++;
          if (Object.prototype.hasOwnProperty.call(substitutionOptions.map, key)) {
            subsRec = substitutionOptions.map[key];
            substitutionMetrics.matched++;
          } else {
            substitutionMetrics.unmatched++;
          }
        }
        
        // Pasar el correlativo global y el punto secuencial (independiente del startNumber)
        const titleCell = createTitleCell(titulo, currentPhotoNumber, currentPointNumber);
        
        // Si es un caso impar, aplicar bordes estándar a la celda
        if (hasOddRecords) {
          titleCell.borders = standardBorders;
        }
        
        rowTitleCells.push(titleCell);
        currentPhotoNumber++;
        currentPointNumber++;
        
        // 2. FILA DE IMÁGENES
        let imageCell;
        if (imageObj.imageBuffer) {
          imageCell = createImageCell(imageObj.imageBuffer);
        } else {
          imageCell = new TableCell({ 
            children: [new Paragraph({
              text: 'Imagen no encontrada',
              alignment: AlignmentType.CENTER
            })], 
            columnSpan: 4,
            verticalAlign: VerticalAlign.CENTER
          });
        }
        
        // Si es un caso impar, aplicar bordes estándar a la celda
        if (hasOddRecords) {
          imageCell.borders = standardBorders;
        }
        
        rowImageCells.push(imageCell);
        
        // 3. FILA DE DESCRIPCIONES
        let description = '';
        if (typeof descriptionField === 'function') {
          try {
            description = descriptionField(imageObj, imageIndex) || '';
          } catch (_) {
            description = '';
          }
        } else {
          description = imageObj.metadata[descriptionField] || '';
        }
        // Aplicar sustitución de descripción si corresponde
        if (subsRec && substitutionOptions && substitutionOptions.replaceDescription === true) {
          const dist = subsRec?.DISTANCIAS;
          if (dist != null && String(dist).trim().length > 0) {
            description = String(dist);
            substitutionMetrics.replacedDescription++;
          } else {
            substitutionMetrics.missingData++;
          }
        }
        const descriptionCell = createDescriptionCell(
          description,
          imageObj.metadata.Norte,
          imageObj.metadata.Este,
          imageObj.metadata.Altitud,
          imageObj.metadata.Zona
        );
        rowDescCells.push(descriptionCell);
        
        // 4 y 5. FILAS DE COORDENADAS
        const meta = imageObj.metadata;
        const zonaNum = meta.Zona ? parseInt(meta.Zona, 10) : '';
        
        // Celda fusionada verticalmente para información UTM
        rowCoordHeaderCells.push(new TableCell({
          children: [new Paragraph({
            children: [
              new TextRun({ text: "Coordenadas", bold: true, size: 16, font: "Arial" }),
              new TextRun({ text: "UTM - WGS84", bold: true, break: 1, size: 16, font: "Arial" }),
              new TextRun({ text: `Zona ${zonaNum || ''}`, bold: true, break: 1, size: 16, font: "Arial" }),
            ],
            alignment: AlignmentType.CENTER
          })],
          rowSpan: 2,
          verticalAlign: VerticalAlign.CENTER,
        }));
        
        // Celdas de encabezado con centrado vertical y horizontal
        rowCoordHeaderCells.push(new TableCell({ 
          children: [new Paragraph({ children: [new TextRun({ text: 'Norte', bold: true, size: 16, font: "Arial" })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER
        }));
        rowCoordHeaderCells.push(new TableCell({ 
          children: [new Paragraph({ children: [new TextRun({ text: 'Este', bold: true, size: 16, font: "Arial" })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER
        }));
        rowCoordHeaderCells.push(new TableCell({ 
          children: [new Paragraph({ 
            children: [
              new TextRun({ text: 'Altitud', bold: true, size: 16, font: "Arial" }),
              new TextRun({ text: '(m.s.n.m.)', bold: true, size: 16, font: "Arial", break: 1 })
            ], 
            alignment: AlignmentType.CENTER 
          })],
          verticalAlign: VerticalAlign.CENTER
        }));
        
        // Celdas de valores con centrado vertical y horizontal
        // Valores efectivos de coordenadas (permiten sustitución)
        let norteVal = meta.Norte;
        let esteVal = meta.Este;
        // Valor efectivo de altitud (permite sustitución por locación)
        let altitudVal = meta.Altitud;
        if (subsRec && substitutionOptions && substitutionOptions.replaceCoords === true) {
          const n = subsRec?.NORTE;
          const e = subsRec?.ESTE;
          if (n != null && String(n).trim().length > 0) {
            norteVal = n;
          } else {
            substitutionMetrics.missingData++;
          }
          if (e != null && String(e).trim().length > 0) {
            esteVal = e;
          } else {
            substitutionMetrics.missingData++;
          }
          if ((n != null && String(n).trim().length > 0) || (e != null && String(e).trim().length > 0)) {
            substitutionMetrics.replacedCoords++;
          }
        }
        // Reemplazo de altitud por locación si está habilitado
        if (substitutionOptions && substitutionOptions.replaceAltitudeByLocation === true && substitutionOptions.altitudeByLocationMap && typeof substitutionOptions.altitudeByLocationMap === 'object') {
          const compStr = String(componente || '').trim();
          const normalizeLoc = (s) => String(s || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[_-]/g, '');
          const locNorm = normalizeLoc(compStr);
          let foundAlt = undefined;
          // 1) Búsqueda exacta por clave
          if (Object.prototype.hasOwnProperty.call(substitutionOptions.altitudeByLocationMap, compStr)) {
            foundAlt = substitutionOptions.altitudeByLocationMap[compStr];
          }
          // 2) Búsqueda case-insensitive directa
          if (foundAlt === undefined) {
            for (const [k, v] of Object.entries(substitutionOptions.altitudeByLocationMap)) {
              if (String(k || '').toLowerCase() === compStr.toLowerCase()) { foundAlt = v; break; }
            }
          }
          // 3) Búsqueda normalizada (ignorar espacios, guiones y underscores)
          if (foundAlt === undefined) {
            for (const [k, v] of Object.entries(substitutionOptions.altitudeByLocationMap)) {
              if (normalizeLoc(k) === locNorm) { foundAlt = v; break; }
            }
          }
          if (foundAlt != null && String(foundAlt).trim().length > 0) {
            altitudVal = String(foundAlt).trim();
            substitutionMetrics.replacedAltitude++;
          } else {
            substitutionMetrics.missingData++;
          }
        }
        const norteRounded = norteVal != null && String(norteVal).trim().length > 0 ? parseFloat(norteVal).toFixed(3) : '';
        const esteRounded = esteVal != null && String(esteVal).trim().length > 0 ? parseFloat(esteVal).toFixed(3) : '';
        const parsedAltitud = altitudVal != null && String(altitudVal).trim().length > 0 ? Number(altitudVal) : null;
        const altitudRounded = parsedAltitud != null && Number.isFinite(parsedAltitud) ? Math.round(parsedAltitud) : '';
        
        rowCoordValueCells.push(new TableCell({ 
          children: [new Paragraph({ children: [new TextRun({ text: norteRounded, size: 16, font: "Arial" })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER
        }));
        rowCoordValueCells.push(new TableCell({ 
          children: [new Paragraph({ children: [new TextRun({ text: esteRounded, size: 16, font: "Arial" })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER
        }));
        rowCoordValueCells.push(new TableCell({ 
          children: [new Paragraph({ children: [new TextRun({ text: String(altitudRounded), size: 16, font: "Arial" })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER
        }));
      } else if (!hasSingleRecord) {
        // Solo añadir celdas vacías si no es un registro único
        // Para casos impares, hacemos las celdas vacías completamente invisibles
        if (hasOddRecords) {
          // Crear celdas completamente invisibles para casos impares
          // con bordes transparentes para que no se vean en el documento
          const makeInvisibleCell = () => new TableCell({
            children: [new Paragraph({ text: '' })],
            columnSpan: 4,
            borders: {
              top: { style: BorderStyle.NONE, color: "ffffff" },
              bottom: { style: BorderStyle.NONE, color: "ffffff" },
              left: { style: BorderStyle.NONE, color: "ffffff" },
              right: { style: BorderStyle.NONE, color: "ffffff" }
            },
            width: { size: 0, type: WidthType.DXA }, // Ancho mínimo posible
            shading: { fill: "ffffff", color: "ffffff" },
            verticalAlign: VerticalAlign.CENTER
          });

          // Importante: no reutilizar la misma instancia de TableCell en múltiples posiciones
          rowTitleCells.push(makeInvisibleCell());
          rowImageCells.push(makeInvisibleCell());
          rowDescCells.push(makeInvisibleCell());
          rowCoordHeaderCells.push(makeInvisibleCell());
          rowCoordValueCells.push(makeInvisibleCell());
        } else {
          // Para casos pares, usar el método normal
          rowTitleCells.push(createEmptyTableCell(4));
          rowImageCells.push(createEmptyTableCell(4));
          rowDescCells.push(createEmptyTableCell(4));
          rowCoordHeaderCells.push(createEmptyTableCell(4));
          rowCoordValueCells.push(createEmptyTableCell(4));
        }
      }
    }
    
    // Añadir todas las filas a la tabla con alturas mínimas especificadas
    // Fila de títulos - altura mínima de 1 cm ya establecida en las celdas
    tableRows.push(new TableRow({ 
      children: rowTitleCells,
      height: { value: 1.3, rule: HeightRule.ATLEAST } // Altura mínima de 1 cm
    }));
    
    // Fila de imágenes - sin altura mínima específica para permitir que las imágenes determinen la altura
    tableRows.push(new TableRow({ 
      children: rowImageCells
    }));
    
    // Fila de descripciones - altura mínima de 0.5 cm
    tableRows.push(new TableRow({ 
      children: rowDescCells,
      height: { value: 0.5, rule: HeightRule.ATLEAST } // Altura mínima de 0.5 cm
    }));
    
    // Filas de coordenadas - sin altura mínima específica
    tableRows.push(new TableRow({ children: rowCoordHeaderCells }));
    tableRows.push(new TableRow({ children: rowCoordValueCells }));
  }

  // Crear la tabla con el ancho apropiado según el número de registros
  let table;
  
  if (hasSingleRecord) {
    // Para un solo registro, creamos una tabla con 4 columnas que ocupe el 50% del ancho
    table = new Table({
      rows: tableRows,
      width: { size: 50, type: WidthType.PERCENTAGE },
      // Con un solo registro, solo necesitamos 4 columnas (25% cada una = 100% de la mitad)
      columnWidths: [25, 25, 25, 25],
      alignment: AlignmentType.LEFT, // Alinear a la izquierda
      borders: {
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
      }
    });
  } else if (hasOddRecords) {
    // Mantener 8 columnas también en casos impares para evitar discrepancias de grid
    // que pueden provocar cuelgues en el Packer al generar el DOCX.
    table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5],
      borders: {
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
      }
    });
  } else {
    // Para múltiples registros pares, usamos la tabla normal de 8 columnas
    table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      // Definir anchos fijos para cada columna
      columnWidths: [12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5], // 8 columnas en total
      borders: {
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
      }
    });
  }
  
  return {
    table,
    lastPhotoNumber: currentPhotoNumber,
    lastPointNumber: currentPointNumber,
    substitutionMetrics
  };
}

/**
 * Crea una celda de tabla vacía optimizada para ser invisible en el documento final
 * y mantener el ancho de columna incluso en casos impares
 * @param {number} columnSpan Número de columnas que abarca
 * @returns {TableCell} Celda de tabla vacía e invisible que mantiene el ancho
 */
function createEmptyTableCell(columnSpan = 1) {
  return new TableCell({ 
    children: [
      // Usar un espacio no rompible con ancho cero para forzar que la celda mantenga su estructura
      // pero sea invisible visualmente
      new Paragraph({ 
        text: '\u00A0', // Espacio no rompible
        spacing: { before: 0, after: 0 },
        alignment: AlignmentType.CENTER,
        style: {
          size: 1, // Tamaño mínimo
          color: "ffffff" // Color blanco para hacerlo invisible
        }
      })
    ], 
    columnSpan,
    width: { size: 50 / columnSpan, type: WidthType.PERCENTAGE }, // Forzar ancho proporcional
    borders: { 
      top: { style: BorderStyle.NONE }, 
      bottom: { style: BorderStyle.NONE }, 
      left: { style: BorderStyle.NONE }, 
      right: { style: BorderStyle.NONE } 
    },
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    shading: { fill: "ffffff", color: "ffffff" }, // Color blanco para asegurar transparencia visual
    verticalAlign: VerticalAlign.CENTER
  });
}

/**
 * Crea un documento Word con las secciones proporcionadas
 * @returns {Document} Documento Word
 */
function createDocument() {
  return new Document({
    creator: "Windsurf",
    description: "Reporte de inspección",
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 16, // 8pt
          },
        },
      },
    },
    sections: [],
  });
}

/**
 * Genera un buffer a partir de un documento Word
 * @param {Document} doc Documento Word
 * @returns {Promise<Buffer>} Buffer con el documento Word
 */
async function generateDocumentBuffer(doc) {
  try {
    console.time('[DOCX] Packer.toBuffer');
  } catch (_) { /* noop */ }
  const buffer = await Packer.toBuffer(doc);
  try {
    console.timeEnd('[DOCX] Packer.toBuffer');
  } catch (_) { /* noop */ }
  return buffer;
}

export { 
  createTitleCell,
  createImageCell,
  createDescriptionCell,
  createImageTable,
  createEmptyTableCell,
  createDocument,
  generateDocumentBuffer
 };
