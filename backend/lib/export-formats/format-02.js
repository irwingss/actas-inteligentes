/**
 * Formato 02 - Tabla Levantamiento Topográfico
 * Implementación del formato de exportación "Tabla Levantamiento Topográfico"
 */
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, TableCell, VerticalAlign, HeightRule, Table, TableRow, WidthType, BorderStyle } from 'docx';
import { createDocument, createImageCell, createDescriptionCell, createImageTable, generateDocumentBuffer } from '../document-builder.js';

/**
 * Determina el tipo de estructura basado en el nombre del componente
 * @param {string} componente Nombre del componente
 * @returns {string} Tipo de estructura (Pozo o Manifold)
 */
function determinarTipoEstructura(componente) {
  const componenteUpper = (componente || '').toUpperCase();
  
  // Si contiene MN, MNF, MC, BAT -> Manifold
  if (componenteUpper.includes('MN') || componenteUpper.includes('MNF') || 
      componenteUpper.includes('MC') || componenteUpper.includes('BAT')) {
    return 'Manifold';
  }
  
  // Si contiene EA u otra cosa -> Pozo
  if (componenteUpper.includes('EA') || componenteUpper.length > 0) {
    return 'Pozo';
  }
  
  // Fallback por defecto
  return 'Pozo';
}

/**
 * Crea una celda de tabla con título de fotografía simplificado para el formato 02
 * @param {string} numeroFoto Número de la fotografía
 * @param {string} componente Nombre del componente
 * @returns {TableCell} Celda de tabla con el título simplificado
 */
function createSimplifiedTitleCell(numeroFoto, componente) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `Figura N° ${numeroFoto} - ${componente}`,
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
 * Genera el documento Word con el formato "Tabla Levantamiento Topográfico"
 * @param {Object} metadataObj Objeto con los metadatos extraídos del CSV
 * @param {Map} imageGroups Grupos de imágenes procesadas
 * @param {number} startNumber Número inicial para la numeración de fotos
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @returns {Document} Documento Word generado
 */
function generateFormat02(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, options = null) {
  console.log('Generando documento con formato 02 - Tabla Levantamiento Topográfico');
  
  // Crear el documento Word
  const doc = createDocument();
  
  let currentPhotoNumber = startNumber; // Inicializar contador de fotos
  let hasContent = false; // Bandera para verificar si se agregó contenido
  
  // Crear una sección única para todas las imágenes sin separar por componente
  const sectionChildren = [];
  
  // Recopilar todas las imágenes de todos los componentes en un solo array
  const allImages = [];
  for (const [locacion, groupImagePaths] of imageGroups.entries()) {
    // Añadir el componente a cada objeto de imagen para usarlo en el título
    groupImagePaths.forEach(img => {
      if (img && img.metadata) {
        // Asegurar que el componente esté disponible en los metadatos
        img.metadata.Componente = img.metadata.Componente || img.metadata.componente || img.metadata.Locacion || locacion;
        // Por compatibilidad, mantener Locacion si existen integraciones antiguas
        img.metadata.Locacion = img.metadata.Locacion || img.metadata.Componente || locacion;
      }
      allImages.push(img);
    });
    
    hasContent = true; // Establecer bandera a true ya que tenemos imágenes
  }
  
  console.log(`Procesando ${allImages.length} imágenes en formato continuo`);
  
  // Procesar todas las imágenes en lotes de hasta 6 para crear tablas
  for (let i = 0; i < allImages.length; i += 6) {
    const imagesInBatch = allImages.slice(i, i + 6);
    
    // Crear una tabla personalizada para el formato 02 (opcionalmente con opciones)
    const customTable = createCustomImageTable(imagesInBatch, currentPhotoNumber, photoPrefix, descriptionField, options);
    
    currentPhotoNumber = customTable.lastPhotoNumber; // Actualizar el contador de fotos
    sectionChildren.push(customTable.table);
    console.log(`Tabla creada para el lote que comienza en el índice ${i}`);
  }
  
  // Agregar la sección con todas las tablas al documento
  if (sectionChildren.length > 0) {
    doc.addSection({
      properties: {},
      children: sectionChildren,
    });
    console.log(`Sección única añadida al documento con ${sectionChildren.length} tablas`);
  }
  
  return { doc, hasContent };
}

/**
 * Crea una tabla personalizada para el formato 02 con títulos simplificados
 * @param {Array} imageObjects Objetos de imagen con metadatos
 * @param {number} startNumber Índice inicial para la numeración
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @param {string} componente Nombre del componente para los títulos
 * @returns {Object} Objeto con la tabla y el último número usado
 */
function createCustomImageTable(imageObjects, startNumber, photoPrefix, descriptionField = 'Descripcion', options = null) {
  // Esta función es similar a createImageTable pero usa createSimplifiedTitleCell
  // en lugar de createTitleCell para simplificar los títulos
  
  let currentPhotoNumber = startNumber;
  const tableRows = [];
  
  // Determinar si tenemos un solo registro (caso especial para ancho de tabla)
  const hasSingleRecord = imageObjects.length === 1;
  
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
        // 1. FILA DE TÍTULOS - Simplificada para formato 02
        const imageMetadata = imageObj.metadata;
        const componenteActual = imageMetadata.Componente || imageMetadata.componente || imageMetadata.Locacion || 'desconocido';
        
        // Usar el título simplificado para formato 02
        const titleCell = createSimplifiedTitleCell(currentPhotoNumber, componenteActual);
        
        // Si es un caso impar, aplicar bordes estándar a la celda
        if (hasOddRecords) {
          titleCell.borders = standardBorders;
        }
        
        rowTitleCells.push(titleCell);
        currentPhotoNumber++;
        
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
        // Siempre usar la descripción automática. Para formato 03, permitir seleccionar si
        // se agregan (o no) los campos Descripcion y/o Hallazgos debajo en una nueva línea.
        const tipoComponente = imageObj.metadata.tipo_componente || imageObj.metadata.Tipo_componente || 'desconocido';
        const componente = imageObj.metadata.componente || imageObj.metadata.Componente || imageObj.metadata.Locacion || componenteActual || 'desconocido';
        const autoDescription = `Levantamiento topográfico del ${tipoComponente} ${componente}`;

        // Obtener campos Descripcion/Hallazgos en variantes de nombre/case
        const rawDescripcion = (imageObj.metadata.Descripcion || imageObj.metadata.descripcion || '').toString().trim();
        const rawHallazgo = (
          imageObj.metadata.Hallazgo ||
          imageObj.metadata.Hallazgos ||
          imageObj.metadata.hallazgo ||
          imageObj.metadata.hallazgos ||
          ''
        ).toString().trim();

        // Sanitizar para evitar dobles puntos al unir
        const clean = (s) => s.replace(/[\s.]+$/g, '').trim();
        const parts = [];
        // Para formato 02 (sin opciones), incluir ambos si existen.
        // Para formato 03 (con opciones), incluir solo lo indicado.
        const includeDescripcion = options && options.includeDescripcion !== undefined ? !!options.includeDescripcion : true;
        const includeHallazgo = options && options.includeHallazgo !== undefined ? !!options.includeHallazgo : true;
        if (includeDescripcion && rawDescripcion) parts.push(clean(rawDescripcion));
        if (includeHallazgo && rawHallazgo) parts.push(clean(rawHallazgo));
        const appended = parts.join('. ');

        // Para formato 02 (sin opciones) mantener auto; para formato 03 (con opciones)
        // podemos omitirlo pasando includeAuto = false
        const includeAuto = !(options && options.includeAuto === false);
        const lines = [];
        if (includeAuto) lines.push(autoDescription);
        if (appended) lines.push(appended);
        const description = lines.join('\n');

        const norte = imageObj.metadata.Norte || '';
        const este = imageObj.metadata.Este || '';
        const altitud = imageObj.metadata.Altitud || '';
        const zona = imageObj.metadata.Zona || '';
        // Redondear altitud igual que en formato 01 (entero sin decimales)
        const altitudRounded = altitud !== '' ? String(parseInt(altitud, 10)) : '';
        // Formatear Norte/Este con 3 decimales (incluye ceros a la derecha) como en formato 01
        const norteRounded = norte !== '' ? parseFloat(norte).toFixed(3) : '';
        const esteRounded = este !== '' ? parseFloat(este).toFixed(3) : '';

        const descCell = createDescriptionCell(description, norte, este, altitud, zona);
        
        // Si es un caso impar, aplicar bordes estándar a la celda
        if (hasOddRecords) {
          descCell.borders = standardBorders;
        }
        
        rowDescCells.push(descCell);
        
        // 4. FILA DE ENCABEZADOS DE COORDENADAS
        const meta = imageObj.metadata;
        const zonaNum = meta.Zona ? parseInt(meta.Zona, 10) : '';
        
        // Celda fusionada vertical para "Coordenadas UTM - WGS84" en 3 líneas
        const coordHeaderCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Coordenadas",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                }),
                new TextRun({
                  text: "UTM - WGS84",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                  break: 1,
                }),
                new TextRun({
                  text: `Zona ${zonaNum || zona || '18'}`,
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                  break: 1,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          rowSpan: 2, // Fusionar verticalmente con la fila de valores
          verticalAlign: VerticalAlign.CENTER,
        });
        
        // Si es un caso impar, aplicar bordes estándar a la celda
        if (hasOddRecords) {
          coordHeaderCell.borders = standardBorders;
        }
        
        // Celdas de encabezado para Norte, Este, Altitud
        const norteHeaderCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Norte",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        const esteHeaderCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Este",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        const altitudHeaderCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Altitud",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                }),
                new TextRun({
                  text: "(m.s.n.m.)",
                  bold: true,
                  size: 16, // 8pt
                  font: "Arial",
                  break: 1,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        // Si es un caso impar, aplicar bordes estándar a las celdas
        if (hasOddRecords) {
          norteHeaderCell.borders = standardBorders;
          esteHeaderCell.borders = standardBorders;
          altitudHeaderCell.borders = standardBorders;
        }
        
        rowCoordHeaderCells.push(coordHeaderCell, norteHeaderCell, esteHeaderCell, altitudHeaderCell);
        
        // 5. FILA DE VALORES DE COORDENADAS
        // Celda para Norte (ya tenemos la celda de Coordenadas fusionada verticalmente)
        const norteValueCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: norteRounded,
                  size: 16, // 8pt
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        const esteValueCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: esteRounded,
                  size: 16, // 8pt
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        const altitudValueCell = new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: altitudRounded,
                  size: 16, // 8pt
                  font: "Arial",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
        });
        
        // Si es un caso impar, aplicar bordes estándar a las celdas
        if (hasOddRecords) {
          norteValueCell.borders = standardBorders;
          esteValueCell.borders = standardBorders;
          altitudValueCell.borders = standardBorders;
        }
        
        // Agregar un placeholder vacío para la celda de coordenadas que ya está fusionada
        rowCoordValueCells.push(null, norteValueCell, esteValueCell, altitudValueCell);
      }
    }
    
    // Agregar las filas a la tabla
    if (rowTitleCells.length > 0) tableRows.push(new TableRow({ children: rowTitleCells }));
    if (rowImageCells.length > 0) tableRows.push(new TableRow({ children: rowImageCells }));
    if (rowDescCells.length > 0) tableRows.push(new TableRow({ children: rowDescCells }));
    if (rowCoordHeaderCells.length > 0) tableRows.push(new TableRow({ children: rowCoordHeaderCells }));
    if (rowCoordValueCells.length > 0) {
      // Filtrar los valores nulos (placeholders para celdas fusionadas)
      const filteredCoordValueCells = rowCoordValueCells.map((cell, index) => {
        // Si es un índice múltiplo de 4 (0, 4, 8, etc.) y el valor es nulo, es un placeholder
        if (index % 4 === 0 && cell === null) {
          return undefined; // Excluir de la fila
        }
        return cell;
      }).filter(cell => cell !== undefined);
      
      tableRows.push(new TableRow({ children: filteredCoordValueCells }));
    }
  }
  
  // Crear la tabla final
  const table = new Table({
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
  
  return {
    table,
    lastPhotoNumber: currentPhotoNumber
  };
}

export { 
  generateFormat02
 };
