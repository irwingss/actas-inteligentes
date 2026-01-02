/**
 * Formato 01 - Tabla de muestreo
 * Implementación del formato de exportación "Tabla de muestreo"
 */
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { createDocument, createImageTable, generateDocumentBuffer } from '../document-builder.js';

/**
 * Genera el documento Word con el formato "Tabla de muestreo"
 * @param {Object} metadataObj Objeto con los metadatos extraídos del CSV
 * @param {Map} imageGroups Grupos de imágenes procesadas
 * @param {number} startNumber Número inicial para la numeración de fotos
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @param {Object|null} substitutionOptions Opciones de sustitución exacta por punto para Formato 01
 * @returns {Document} Documento Word generado
 */
function generateFormat01(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, substitutionOptions = null) {
  console.log('Generando documento con formato 01 - Tabla de muestreo');
  
  // Crear el documento Word
  const doc = createDocument();
  
  let currentPhotoNumber = startNumber; // Inicializar contador de fotos
  let currentPointNumber = 1; // Contador secuencial de puntos de muestreo independiente
  let hasContent = false; // Bandera para verificar si se agregó contenido
  // Agregar acumulador de métricas de sustitución
  const metrics = { totalPoints: 0, matched: 0, unmatched: 0, replacedCoords: 0, replacedDescription: 0, replacedAltitude: 0, missingData: 0 };
  
  // Iterar por cada grupo ('Componente')
  for (const [locacion, groupImagePaths] of imageGroups.entries()) {
    hasContent = true; // Establecer bandera a true ya que estamos procesando un grupo
    
    console.log(`Generando sección para componente: ${locacion} con ${groupImagePaths.length} imágenes`);
    
    // Crear párrafo de título para el grupo
    const titleParagraph = new Paragraph({
      children: [
        new TextRun({
          text: `${locacion}`,
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
    
    // Generar tablas para las imágenes en este grupo
    for (let i = 0; i < groupImagePaths.length; i += 6) { // Procesar en lotes de hasta 6
      const imagesInBatch = groupImagePaths.slice(i, i + 6);
      const { table, lastPhotoNumber, lastPointNumber, substitutionMetrics } = createImageTable(
        imagesInBatch,
        currentPhotoNumber,
        photoPrefix,
        descriptionField,
        currentPointNumber,
        substitutionOptions
      );
      
      currentPhotoNumber = lastPhotoNumber; // Actualizar el contador de fotos
      currentPointNumber = lastPointNumber; // Actualizar el contador de puntos de muestreo
      sectionChildren.push(table);
      console.log(`Tabla creada para el lote que comienza en el índice ${i}`);
      // Acumular métricas si existen
      if (substitutionMetrics) {
        metrics.totalPoints += substitutionMetrics.totalPoints || 0;
        metrics.matched += substitutionMetrics.matched || 0;
        metrics.unmatched += substitutionMetrics.unmatched || 0;
        metrics.replacedCoords += substitutionMetrics.replacedCoords || 0;
        metrics.replacedDescription += substitutionMetrics.replacedDescription || 0;
        metrics.replacedAltitude += substitutionMetrics.replacedAltitude || 0;
        metrics.missingData += substitutionMetrics.missingData || 0;
      }
    }
    
    // Agregar la sección con título y todas sus tablas al documento
    doc.addSection({
      properties: {},
      children: sectionChildren,
    });
    console.log(`Sección para componente ${locacion} añadida al documento con ${sectionChildren.length - 1} tablas`);
  }
  
  // Log de métricas generales de sustitución (si aplica)
  if (metrics.totalPoints > 0) {
    console.log('[Formato 01] Sustituciones - totales:', metrics);
  }
  return { doc, hasContent, substitutionMetrics: metrics };
}

export { 
  generateFormat01
 };
