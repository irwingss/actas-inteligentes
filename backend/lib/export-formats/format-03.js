/**
 * Formato 03 - Tabla Informes Lotes Selva
 * Implementación del formato de exportación "Tabla Informes Lotes Selva"
 */
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, TableCell, VerticalAlign, HeightRule, Table, TableRow, WidthType, BorderStyle } from 'docx';
import { createDocument, createImageCell, createEmptyTableCell, generateDocumentBuffer } from '../document-builder.js';

/**
 * Crea una celda de tabla con título de fotografía para el formato 03
 * @param {string} numeroFoto Número de la fotografía
 * @returns {TableCell} Celda de tabla con el título
 */
function createFormat03TitleCell(numeroFoto) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `Figura N° ${numeroFoto}`,
            bold: true,
            size: 16, // 8pt
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    columnSpan: 4, // Fusionar las 4 columnas
    verticalAlign: VerticalAlign.CENTER,
    height: { value: 0.8, rule: HeightRule.ATLEAST }, // Altura mínima
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
    }
  });
}

/**
 * Crea una celda con texto para la descripción en el formato 03
 * @param {string} descripcion Texto de descripción
 * @returns {TableCell} Celda con la descripción formateada como lista
 */
function createFormat03DescriptionCell(descripcion) {
  // Crear los elementos de la lista con viñetas
  const children = [];
  
  // Si no hay descripción, devolver una celda vacía
  if (!descripcion) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: '', size: 16, font: "Arial" })],
        alignment: AlignmentType.LEFT
      })],
      verticalAlign: VerticalAlign.TOP,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
      }
    });
  }
  
  // Intentar dividir la descripción por puntos o líneas
  let items = [];
  
  // Primero intentar dividir por puntos (•)
  if (descripcion.includes('•')) {
    items = descripcion.split('•').filter(item => item.trim().length > 0);
  } 
  // Luego intentar dividir por guiones (-)
  else if (descripcion.includes('-')) {
    items = descripcion.split('-').filter(item => item.trim().length > 0);
  }
  // Luego intentar dividir por saltos de línea
  else if (descripcion.includes('\n')) {
    items = descripcion.split('\n').filter(item => item.trim().length > 0);
  }
  // Si no hay separadores, usar la descripción completa como un solo ítem
  else {
    items = [descripcion];
  }
  
  // Crear un párrafo para cada ítem
  items.forEach(texto => {
    // Agregar viñeta y texto
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "• ",
            bold: true,
            size: 16, // 8pt
            font: "Arial",
          }),
          new TextRun({
            text: texto.trim(),
            size: 16, // 8pt
            font: "Arial",
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 100 }, // Espacio después de cada párrafo
      })
    );
  });
  
  return new TableCell({
    children: children,
    verticalAlign: VerticalAlign.TOP,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
    }
  });
}

/**
 * Crea una celda con el texto "Coordenadas UTM - WGS84" y la zona
 * @param {string} zona Zona UTM
 * @returns {TableCell} Celda con el texto de coordenadas
 */
function createCoordinatesHeaderCell(zona) {
  return new TableCell({
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
            text: `Zona ${zona || '18'}`,
            bold: true,
            size: 16, // 8pt
            font: "Arial",
            break: 1,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    columnSpan: 3, // Fusionar las columnas 2, 3 y 4
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
    }
  });
}

/**
 * Crea una tabla para el formato 03 con estructura de 4 columnas
 * @param {Object} imageObject Objeto de imagen con metadatos
 * @param {number} photoNumber Número de la fotografía
 * @returns {Table} Tabla con el formato 03
 */
function createFormat03Table(imageObject, photoNumber) {
  console.log('Creando tabla formato 03 para foto ' + photoNumber);
  // Crear filas para la tabla
  const tableRows = [];
  
  // Fila 1: Título de la fotografía (fusiona las 4 columnas)
  const titleRow = new TableRow({
    children: [createFormat03TitleCell(photoNumber)],
  });
  tableRows.push(titleRow);
  
  // Obtener los metadatos
  const meta = imageObject && imageObject.metadata ? imageObject.metadata : {};
  const descripcion = meta.Descripcion || '';
  const norte = meta.Norte || '';
  const este = meta.Este || '';
  const altitud = meta.Altitud || '';
  // Redondear altitud igual que en formato 01 (entero sin decimales)
  const altitudRounded = altitud !== '' ? String(parseInt(altitud, 10)) : '';
  // Formatear Norte/Este con 3 decimales (incluye ceros a la derecha) como en formato 01
  const norteRounded = norte !== '' ? parseFloat(norte).toFixed(3) : '';
  const esteRounded = este !== '' ? parseFloat(este).toFixed(3) : '';
  const zonaNum = meta.Zona ? parseInt(meta.Zona, 10) : '';
  const zona = zonaNum ? `${zonaNum}` : '18';
  
  // Creamos la celda de descripción que abarcará todas las filas restantes en la columna 1
  const descriptionCell = createFormat03DescriptionCell(descripcion);
  // La celda abarca 4 filas: la de la imagen, la de coordenadas UTM, la de encabezados y la de valores
  descriptionCell.rowSpan = 4;
  
  // Fila 2: Descripción (columna 1) e imagen (columnas 2-4 fusionadas)
  let imageCell;
  if (imageObject && imageObject.buffer) {
    imageCell = createImageCell(imageObject.buffer);
  } else if (imageObject && imageObject.imageBuffer) {
    // Usar imageBuffer si buffer no está disponible (como en otros formatos)
    imageCell = createImageCell(imageObject.imageBuffer);
  } else {
    imageCell = new TableCell({ 
      children: [new Paragraph({
        text: 'Imagen no encontrada',
        alignment: AlignmentType.CENTER
      })], 
      columnSpan: 3,
      verticalAlign: VerticalAlign.CENTER
    });
  }
  imageCell.columnSpan = 3; // Fusionar las columnas 2, 3 y 4 para la imagen
  
  // Fila 2: Descripción (columna 1) e imagen (columnas 2-4)
  const contentRow = new TableRow({
    children: [descriptionCell, imageCell],
  });
  tableRows.push(contentRow);
  
  // Fila 3: Coordenadas UTM - WGS84 (columnas 2-4 fusionadas)
  const coordsHeaderRow = new TableRow({
    children: [
      // No incluimos la celda de descripción aquí porque ya está fusionada verticalmente
      createCoordinatesHeaderCell(zona)
    ],
  });
  tableRows.push(coordsHeaderRow);
  
  // Fila 4: Encabezados de coordenadas (Este, Norte, Altitud)
  const coordLabelsRow = new TableRow({
    children: [
      // No incluimos la celda de descripción aquí porque ya está fusionada verticalmente
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
    ],
  });
  tableRows.push(coordLabelsRow);
  
  // Fila 5: Valores de coordenadas (Este, Norte, Altitud)
  const coordValuesRow = new TableRow({
    children: [
      // No incluimos la celda de descripción aquí porque ya está fusionada verticalmente
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
      new TableCell({
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
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
      }),
    ],
  });
  tableRows.push(coordValuesRow);
  
  // Crear la tabla final
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Definir anchos para las 4 columnas
    columnWidths: [40, 20, 20, 20], // 40% para descripción, 20% para cada columna de coordenadas
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

/**
 * Genera el documento Word con el formato "Tabla Informes Lotes Selva"
 * @param {Object} metadataObj Objeto con los metadatos extraídos del CSV
 * @param {Map} imageGroups Grupos de imágenes procesadas
 * @param {number} startNumber Número inicial para la numeración de fotos
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @returns {Document} Documento Word generado
 */
function generateFormat03(metadataObj, imageGroups, startNumber, photoPrefix) {
  console.log('Generando documento con formato 03 - Tabla Informes Lotes Selva');
  
  // Crear el documento Word
  const doc = createDocument();
  
  let currentPhotoNumber = startNumber; // Inicializar contador de fotos
  let hasContent = false; // Bandera para verificar si se agregó contenido
  
  // Iterar por cada grupo ('Locación')
  for (const [locacion, groupImagePaths] of imageGroups.entries()) {
    hasContent = true; // Establecer bandera a true ya que estamos procesando un grupo
    
    console.log(`Generando sección para locación: ${locacion} con ${groupImagePaths.length} imágenes`);
    
    // Crear párrafo de título para el grupo
    const titleParagraph = new Paragraph({
      children: [
        new TextRun({
          text: `LOCACIÓN ${locacion.toUpperCase()}`,
          bold: true,
          size: 16, // 8pt
          font: "Arial",
        }),
      ],
      alignment: AlignmentType.LEFT,
    });
    
    // Añadir un párrafo vacío para crear espacio entre el título y la tabla
    const emptyParagraph = new Paragraph({
      children: [new TextRun({ text: '' })],
      spacing: { after: 200 } // Espacio adicional después del párrafo
    });
    
    const sectionChildren = [titleParagraph, emptyParagraph]; // Comenzar sección con un título y espacio
    
    // Generar tablas para cada imagen en este grupo (una imagen por tabla)
    for (let i = 0; i < groupImagePaths.length; i++) {
      const imageObject = groupImagePaths[i];
      const table = createFormat03Table(imageObject, currentPhotoNumber);
      
      currentPhotoNumber++; // Incrementar el contador de fotos
      sectionChildren.push(table);
      
      // Añadir un párrafo vacío entre tablas para separación
      if (i < groupImagePaths.length - 1) {
        sectionChildren.push(new Paragraph({
          children: [new TextRun({ text: '' })],
          spacing: { after: 200 }
        }));
      }
      
      console.log(`Tabla creada para la imagen ${i + 1} de ${groupImagePaths.length}`);
    }
    
    // Agregar la sección con título y todas sus tablas al documento
    doc.addSection({
      properties: {},
      children: sectionChildren,
    });
    console.log(`Sección para locación ${locacion} añadida al documento con ${groupImagePaths.length} tablas`);
  }
  
  return { doc, hasContent };
}

export { 
  generateFormat03
 };
