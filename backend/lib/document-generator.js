/**
 * Módulo principal para la generación de documentos
 */
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { extractMetadata, generateCSVTemplate } from './metadata-processor.js';
import { createDocument, createImageTable, generateDocumentBuffer } from './document-builder.js';
import { processImagesForMetadata } from './image-processor.js';

// Importar los diferentes formatos de exportación
import { generateFormat01 } from './export-formats/format-01.js';
import { generateFormat02 } from './export-formats/format-02.js';
import { generateFormat03 } from './export-formats/format-03.js';
import { generateFormat04 } from './export-formats/format-04.js';

/**
 * Genera el documento Word con las imágenes y metadatos
 * @param {string} csvData Datos del CSV con metadatos
 * @param {string} fotosDir Directorio que contiene las carpetas de fotos
 * @param {number} startNumber Número inicial para la numeración de fotos
 * @param {string} outputFilename Nombre del archivo de salida
 * @param {string} photoPrefix Prefijo para los nombres de las fotos
 * @param {string} exportFormat Formato de exportación (01, 02, 03, 04)
 * @returns {Buffer} Buffer con el documento Word generado
 */
async function generateDocument(csvData, fotosDir, startNumber, outputFilename, photoPrefix, exportFormat = '01', photoPosition = 1, descriptionField = 'Descripcion', selectedByGid = null, selectedManyByGid = null, format03Options = null, format01Options = null) {
  try {
    console.log(`Iniciando generación de documento con formato ${exportFormat}...`);
    
    // 1. Extraer metadatos del CSV
    const metadataObj = extractMetadata(csvData);
    console.log(`Metadatos extraídos: ${Object.keys(metadataObj).length} registros`);
    
    // 2. Procesar imágenes y agruparlas por locación
    // Para formato 04: incluir TODAS las fotos solo si NO hay selección (múltiple o única) provista
    const isFormat04 = String(exportFormat) === '04';
    const hasMany = selectedManyByGid && typeof selectedManyByGid === 'object' && Object.keys(selectedManyByGid).length > 0;
    const hasSingle = selectedByGid && typeof selectedByGid === 'object' && Object.keys(selectedByGid).length > 0;
    const includeAllPhotos = isFormat04 ? !(hasMany || hasSingle) : false;
    const imageGroups = await processImagesForMetadata(
      fotosDir,
      metadataObj,
      photoPosition,
      selectedByGid,
      selectedManyByGid,
      includeAllPhotos
    );
    console.log(`Grupos de imágenes procesados: ${imageGroups.size} locaciones`);
    
    // 3. Generar el documento según el formato seleccionado
    let result;
    
    switch(exportFormat) {
      case '01':
        console.log('Usando formato 01 - Tabla de muestreo');
        result = generateFormat01(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, format01Options);
        break;
      case '02':
        console.log('Usando formato 02 - Tabla Levantamiento Topográfico');
        result = generateFormat02(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, format03Options);
        break;
      case '03':
        console.log('Usando formato 03 - Registro de componentes (basado en formato 02)');
        result = generateFormat02(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, format03Options);
        break;
      case '04':
        console.log('Usando formato 04 - Tabla Informes Lotes Selva (respeta selección cuando aplica)');
        result = generateFormat04(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField);
        break;
      default:
        console.log('Formato no reconocido, usando formato 01 por defecto');
        result = generateFormat01(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField, format01Options);
    }
    
    const { doc, hasContent } = result;
    
    // Verificar si se generó contenido válido
    if (!hasContent) {
      console.log('No se encontraron datos válidos para generar el documento.');
      throw new Error('No se encontraron datos válidos para generar el documento.');
    }
    
    // Imprimir un resumen de las locaciones encontradas
    console.log('Resumen de locaciones encontradas:');
    for (const [locacion, imagenes] of imageGroups.entries()) {
      console.log(`- ${locacion}: ${imagenes.length} registros`);
    }
    
    console.log(`Documento con formato ${exportFormat} generado correctamente.`);
    
    // 5. Generar el documento Word y devolverlo como buffer
    console.log('Generando documento Word...');
    const buffer = await generateDocumentBuffer(doc);
    console.log(`Documento Word generado con éxito (${buffer.length} bytes)`);
    return buffer;
    
  } catch (error) {
    console.error('Error al generar el documento:', error);
    throw new Error(`Error al generar el documento: ${error.message}`);
  }
}

export { 
  generateDocument,
  generateCSVTemplate
 };
