/**
 * Módulo para el procesamiento de metadatos de CSV
 */
import { parse } from 'csv-parse/sync';

/**
 * Extrae los metadatos del archivo CSV
 * @param {string} csvData Contenido del archivo CSV
 * @returns {Object} Objeto con los metadatos indexados por globalid
 */
function extractMetadata(csvData) {
  try {
    // El parámetro csvData ya es el contenido del archivo, no la ruta
    const fileContent = csvData;
    
    // --- Detección automática del delimitador ---
    let delimiter = ','; // Valor por defecto
    
    // Eliminar posible BOM al inicio del archivo
    const cleanContent = fileContent.replace(/^\uFEFF/, '');
    
    // Verificar si el archivo está vacío
    if (!cleanContent || cleanContent.trim().length === 0) {
      console.error('El archivo CSV está vacío');
      throw new Error('El archivo CSV está vacío');
    }
    
    // Tomar las primeras líneas para análisis (hasta 5 líneas o menos si hay menos)
    const lines = cleanContent.split('\n').slice(0, 5).filter(line => line.trim().length > 0);
    
    if (lines.length > 0) {
      // Contar delimitadores en cada línea
      let totalCommaCount = 0;
      let totalSemicolonCount = 0;
      let totalTabCount = 0;
      
      lines.forEach(line => {
        totalCommaCount += (line.match(/,/g) || []).length;
        totalSemicolonCount += (line.match(/;/g) || []).length;
        totalTabCount += (line.match(/\t/g) || []).length;
      });
      
      console.log(`Análisis de delimitadores en las primeras ${lines.length} líneas:`);
      console.log(`- Comas (,): ${totalCommaCount}`);
      console.log(`- Punto y coma (;): ${totalSemicolonCount}`);
      console.log(`- Tabuladores (\t): ${totalTabCount}`);
      
      // Determinar el delimitador más frecuente
      if (totalSemicolonCount > totalCommaCount && totalSemicolonCount > totalTabCount) {
        delimiter = ';';
      } else if (totalTabCount > totalCommaCount && totalTabCount > totalSemicolonCount) {
        delimiter = '\t';
      }
      
      // Verificación adicional: si no se detectó ningún delimitador pero hay contenido,
      // intentar con punto y coma como respaldo (común en configuraciones regionales europeas/latinoamericanas)
      if (totalCommaCount === 0 && totalSemicolonCount === 0 && totalTabCount === 0) {
        console.log('No se detectó ningún delimitador estándar. Intentando con punto y coma como respaldo.');
        delimiter = ';';
      }
    } else {
      console.error('No se encontraron líneas válidas en el archivo CSV');
      throw new Error('No se encontraron líneas válidas en el archivo CSV');
    }
    
    console.log(`Delimitador detectado: '${delimiter === '\t' ? 'TAB' : delimiter}'`);

    // Parsear el contenido CSV con el delimitador detectado
    let records;
    try {
      records = parse(fileContent, {
        delimiter,
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true,  // Permitir filas con diferente número de columnas
        relaxQuotes: true,       // Ser más flexible con las comillas
        bom: true                // Manejar BOM automáticamente
      });
    } catch (parseError) {
      console.error(`Error al parsear CSV con delimitador '${delimiter}':`, parseError);
      
      // Si falla con el delimitador detectado, intentar con el otro delimitador común
      const fallbackDelimiter = delimiter === ',' ? ';' : ',';
      console.log(`Intentando con delimitador alternativo: '${fallbackDelimiter}'`);
      
      try {
        records = parse(fileContent, {
          delimiter: fallbackDelimiter,
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relaxColumnCount: true,
          relaxQuotes: true,
          bom: true
        });
        console.log(`Parseo exitoso con delimitador alternativo: '${fallbackDelimiter}'`);
        delimiter = fallbackDelimiter; // Actualizar el delimitador usado
      } catch (fallbackError) {
        console.error(`Error al parsear CSV con delimitador alternativo:`, fallbackError);
        throw new Error(`No se pudo parsear el archivo CSV con ningún delimitador estándar. Verifique el formato del archivo.`);
      }
    }
    
    console.log(`Registros parseados del CSV: ${records.length}`);
    if (records.length > 0) {
      console.log(`Columnas disponibles en el CSV: ${Object.keys(records[0]).join(', ')}`);
      console.log(`Muestra del primer registro: ${JSON.stringify(records[0])}`);
    }
    
    // Convertir los datos a un objeto indexado por globalid
    const metadata = {};
    records.forEach((row, index) => {
      // Buscar la columna globalid (puede tener diferentes nombres y caracteres ocultos)
      const cleanedKeys = Object.keys(row).map(k => k.replace(/\uFEFF/g, '').trim());
      const originalKeys = Object.keys(row);

      const globalidKeyIndex = cleanedKeys.findIndex(key => 
        key.toLowerCase() === 'globalid' || 
        key.toLowerCase() === 'global_id' || 
        key.toLowerCase() === 'global id'
      );
      
      const globalidKey = globalidKeyIndex !== -1 ? originalKeys[globalidKeyIndex] : null;
      
      let globalid = globalidKey ? row[globalidKey] : null;
      
      if (!globalid) {
        console.log(`Registro ${index} sin globalid válido, se omite: ${JSON.stringify(row)}`);
        return;
      }
      
      // Limpiar el globalid (quitar llaves si las tiene)
      let key = normalizeGlobalId(String(globalid).trim());
      
      console.log(`Procesando globalid: ${globalid} -> normalizado a: ${key}`);
      
      // Buscar las columnas relevantes con diferentes posibles nombres
      const findColumn = (possibleNames) => {
        const columnKey = Object.keys(row).find(key => 
          possibleNames.includes(key.toLowerCase())
        );
        return columnKey ? row[columnKey] : null;
      };
      
      // Extraer datos con posibles nombres alternativos
      const descripcion = findColumn(['descripcion', 'descripción', 'description']) || '';
      const locacion = findColumn(['locacion', 'locación', 'location']) || '';
      const norte = findColumn(['norte', 'north', 'y']) || '';
      const este = findColumn(['este', 'east', 'x']) || '';
      const altitud = findColumn(['altitud', 'altitude', 'z', 'elevacion', 'elevación', 'elevation']) || '';
      const zona = findColumn(['zona', 'zone', 'utm zone', 'utm_zone']) || '';
      const nombrePunto = findColumn(['nombrepunto', 'nombre_punto', 'nombre punto', 'punto', 'point', 'pointname', 'point_name', 'point name']) || '';
      const numeroFoto = findColumn(['numerofoto', 'numero_foto', 'numero foto', 'foto', 'photo', 'photonumber', 'photo_number', 'photo number']) || '';
      
      // Guardar los metadatos normalizados
      metadata[key] = {
        Descripcion: descripcion,
        Locacion: locacion,
        Locación: locacion, // Mantener ambas versiones para compatibilidad
        Norte: norte,
        Este: este,
        Altitud: altitud,
        Zona: zona,
        NombrePunto: nombrePunto,
        NumeroFoto: numeroFoto,
        // Mantener todos los datos originales también
        ...row
      };
    });
    
    return metadata;
  } catch (error) {
    console.error('Error al extraer metadatos:', error);
    throw new Error(`Error al extraer metadatos: ${error.message}`);
  }
}

/**
 * Normaliza un ID global para asegurar consistencia
 * @param {string} globalid ID global a normalizar
 * @returns {string} ID global normalizado
 */
function normalizeGlobalId(globalid) {
  // Limpiar el globalid (quitar espacios)
  let key = String(globalid).trim();
  
  // Extraer solo el GUID base sin caracteres adicionales
  // Buscar un patrón como {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} en cualquier parte de la cadena
  const guidPattern = /\{([0-9A-F\-]+)\}/i;
  const match = key.match(guidPattern);
  
  if (match) {
    // Si encontramos un patrón de GUID válido con llaves, lo usamos completo con llaves
    // Esto es importante para que coincida con los nombres de las carpetas
    key = match[0];
  } else {
    // Si no tiene llaves, añadirlas para que coincida con el formato de las carpetas
    if (key.match(/^[0-9A-F\-]+$/i)) {
      key = `{${key}}`;
    }
  }
  
  // Convertir a mayúsculas para hacer la comparación case-insensitive
  return key.toUpperCase();
}

/**
 * Genera un archivo CSV de plantilla para metadatos
 * @param {string} [delimiter=','] Delimitador a usar en el CSV (coma por defecto)
 * @returns {Buffer} Buffer con el archivo CSV generado
 */
function generateCSVTemplate(delimiter = ',') {
  try {
    // Encabezados del CSV
    const headers = [
      'globalid',
      'Fecha',
      'NumeroFoto',
      'Locacion',
      'NombrePunto',
      'Descripcion',
      'Hallazgos',
      'Norte',
      'Este',
      'Zona',
      'Datum',
      'Altitud',
      'Profundidad',
      'CreationDate',
      'Creator',
      'EditDate',
      'Editor',
      'Nombre_Punto'
    ];
    
    // Datos de ejemplo
    const data = [
      {
        globalid: '{A1F02E9F-071A-41DE-9427-1AD2BAAD6AAA}',
        Fecha: '2023-01-15',
        NumeroFoto: '7',
        Locacion: 'Pozo EA1688',
        NombrePunto: 'Punto 1',
        Descripcion: 'Levantamiento topográfico del cabezal del Pozo EA1688',
        Hallazgos: 'Ninguno',
        Norte: '9525548.8389',
        Este: '472426.6999',
        Zona: '17M',
        Datum: 'WGS84',
        Altitud: '65.6881',
        Profundidad: '0',
        CreationDate: '2023-01-15',
        Creator: 'Usuario',
        EditDate: '2023-01-15',
        Editor: 'Usuario',
        Nombre_Punto: 'P1'
      },
      {
        globalid: '{B2F03E9F-072A-42DE-9428-2AD3BAAD6BBB}',
        Fecha: '2023-01-15',
        NumeroFoto: '8',
        Locacion: 'Batería EX PN31',
        NombrePunto: 'Punto 2',
        Descripcion: 'Levantamiento topográfico de la Batería EX PN31',
        Hallazgos: 'Ninguno',
        Norte: '9525937.3037',
        Este: '471932.5293',
        Zona: '17M',
        Datum: 'WGS84',
        Altitud: '17.5652',
        Profundidad: '0',
        CreationDate: '2023-01-15',
        Creator: 'Usuario',
        EditDate: '2023-01-15',
        Editor: 'Usuario',
        Nombre_Punto: 'P2'
      }
    ];
    
    // Crear el contenido CSV
    let csvContent = headers.join(delimiter) + '\n';
    
    // Agregar filas de datos
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Escapar comillas y agregar comillas si es necesario
        if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
          return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      csvContent += values.join(delimiter) + '\n';
    });
    
    console.log(`Plantilla CSV generada con delimitador: '${delimiter}'`);
    
    // Convertir a buffer
    return Buffer.from(csvContent, 'utf8');
  } catch (error) {
    console.error('Error al generar la plantilla CSV:', error);
    throw new Error(`Error al generar la plantilla CSV: ${error.message}`);
  }
}

export { 
  extractMetadata,
  normalizeGlobalId,
  generateCSVTemplate
 };
