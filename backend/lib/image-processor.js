/**
 * Módulo para el procesamiento de imágenes
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { normalizeGlobalId } from './metadata-processor.js';

/**
 * Aplica la rotación EXIF a una imagen para normalizar su orientación
 * Las fotos de Survey123 pueden tener orientación EXIF que indica rotación
 * @param {Buffer} imageBuffer - Buffer de la imagen original
 * @returns {Promise<Buffer>} Buffer de la imagen con orientación normalizada
 */
async function normalizeImageOrientation(imageBuffer) {
  if (!imageBuffer) return imageBuffer;
  try {
    // rotate() sin parámetros aplica la rotación según metadatos EXIF
    const result = await sharp(imageBuffer).rotate().jpeg({ quality: 95 }).toBuffer();
    return result;
  } catch (error) {
    console.warn('[image-processor] Error normalizando orientación:', error.message);
    return imageBuffer;
  }
}

/**
 * Busca y carga imágenes para los metadatos proporcionados
 * @param {string} fotosDir Directorio que contiene las carpetas de fotos
 * @param {Object} metadataObj Objeto con metadatos indexados por globalid
 * @param {number} photoPosition Posición de la foto a usar (1, 2, 3, etc.)
 * @param {Object|null} selectedByGid Mapa opcional de selección por globalid: { [globalid]: index1Based }
 * @param {Object|null} selectedManyByGid Mapa opcional de selección múltiple por globalid: { [globalid]: (string[]|number[]) }
 * @returns {Object} Mapa de locaciones con sus respectivas imágenes y metadatos
 */
async function processImagesForMetadata(fotosDir, metadataObj, photoPosition = 1, selectedByGid = null, selectedManyByGid = null, includeAllPhotos = false) {
  try {
    // Agrupar registros por locación
    const registrosPorLocacion = new Map();
    
    // Recorrer los metadatos y agrupar por componente/locación (preferir 'componente')
    for (const [globalid, metadata] of Object.entries(metadataObj)) {
      // Normalizar y asegurar el componente
      const locacion = (metadata.Componente || metadata.componente || metadata.Locación || metadata.Locacion || '').trim() || 'Sin Componente';

      // Sincronizar el campo estandarizado para el resto del pipeline
      if (!metadata.Componente) {
        metadata.Componente = metadata.componente || metadata.Locación || metadata.Locacion || locacion;
      }
      // Mantener compatibilidad con integraciones antiguas
      if (!metadata.Locacion && metadata.Componente) {
        metadata.Locacion = metadata.Componente;
      }
      
      if (!registrosPorLocacion.has(locacion)) {
        registrosPorLocacion.set(locacion, []);
      }
      
      registrosPorLocacion.get(locacion).push({
        globalid,
        metadata
      });
      
      console.log(`Agregado registro para globalid ${globalid} en componente ${locacion}`);
    }
    
    // Mostrar información de depuración sobre los grupos
    console.log(`Se crearon ${registrosPorLocacion.size} grupos por componente:`);
    for (const [locacion, registros] of registrosPorLocacion.entries()) {
      console.log(`- Componente: ${locacion}, Registros: ${registros.length}`);
    }
    
    // Buscar recursivamente todas las carpetas que podrían contener globalids
    const primeraImagenPorGlobalId = new Map();
    // Para soportar selección múltiple por GID
    const selectedImagesByGlobalId = new Map(); // Map<string, string[]> paths
    
    function buscarCarpetasGlobalIdRecursivo(dirPath, nivel = 0) {
      const indent = '  '.repeat(nivel);
      
      try {
        const items = fs.readdirSync(dirPath);
        console.log(`${indent}Explorando directorio: ${path.basename(dirPath)} (${items.length} items)`);
        
        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          
          try {
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
              // Verificar si el nombre de la carpeta parece un globalid
              const esGlobalId = esNombreGlobalId(item);
              
              if (esGlobalId) {
                // Esta carpeta tiene nombre de globalid, buscar imágenes en ella
                const globalidNormalizado = normalizeGlobalId(item);
                console.log(`${indent}✅ Carpeta globalid encontrada: ${item} -> ${globalidNormalizado}`);
                
                let imageFiles = fs.readdirSync(itemPath)
                  .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                  })
                  .map(file => path.join(itemPath, file));
                // Ordenar nombres de archivo de forma natural por número y luego alfabético para estabilidad
                imageFiles.sort((a, b) => {
                  const na = path.basename(a).toLowerCase();
                  const nb = path.basename(b).toLowerCase();
                  const ra = na.match(/\d+/);
                  const rb = nb.match(/\d+/);
                  const ia = ra ? parseInt(ra[0], 10) : Number.NaN;
                  const ib = rb ? parseInt(rb[0], 10) : Number.NaN;
                  const aHas = !Number.isNaN(ia);
                  const bHas = !Number.isNaN(ib);
                  if (aHas && bHas && ia !== ib) return ia - ib;
                  if (aHas && !bHas) return -1;
                  if (!aHas && bHas) return 1;
                  return na.localeCompare(nb);
                });
                
                if (imageFiles.length > 0) {
                  // Generar variantes de clave robustas: con/sin llaves, mayúsculas/minúsculas, y nombre de carpeta crudo
                  const raw = String(item);
                  const rawNoBraces = raw.replace(/^\{|\}$/g, '');
                  const normWithBraces = globalidNormalizado; // ya en mayúsculas y con llaves
                  const normNoBraces = normWithBraces.replace(/^\{|\}$/g, '');

                  const candidates = new Set([
                    // Normalizado
                    normWithBraces,
                    normWithBraces.toLowerCase(),
                    normWithBraces.toUpperCase(),
                    normNoBraces,
                    normNoBraces.toLowerCase(),
                    normNoBraces.toUpperCase(),
                    // Forzar con llaves a partir de la versión sin llaves
                    `{${normNoBraces}}`,
                    `{${normNoBraces}}`.toLowerCase(),
                    `{${normNoBraces}}`.toUpperCase(),
                    // Crudo (nombre de carpeta tal cual)
                    raw,
                    raw.toLowerCase(),
                    raw.toUpperCase(),
                    rawNoBraces,
                    rawNoBraces.toLowerCase(),
                    rawNoBraces.toUpperCase(),
                  ]);

                  if (includeAllPhotos) {
                    // Incluir todas las imágenes disponibles para este globalid
                    selectedImagesByGlobalId.set(normWithBraces, imageFiles);
                    primeraImagenPorGlobalId.set(globalidNormalizado, imageFiles[0]);
                    console.log(`${indent}  🖼️ Incluyendo todas las ${imageFiles.length} imágenes para ${globalidNormalizado} [modo includeAllPhotos]`);
                  } else {
                    // 1) Intentar selección múltiple si existe
                    let selectedMany = null;
                    if (selectedManyByGid && typeof selectedManyByGid === 'object') {
                      for (const key of candidates) {
                        if (Object.prototype.hasOwnProperty.call(selectedManyByGid, key)) {
                          const arr = selectedManyByGid[key];
                          if (Array.isArray(arr) && arr.length > 0) {
                            selectedMany = arr;
                            break;
                          }
                        }
                      }
                    }

                    if (Array.isArray(selectedMany) && selectedMany.length > 0) {
                      // Normalizar selección múltiple: puede venir como nombres o índices (base 1)
                      const lowerToFull = new Map();
                      for (const p of imageFiles) lowerToFull.set(path.basename(p).toLowerCase(), p);
                      const pickedPaths = [];
                      for (const v of selectedMany) {
                        if (typeof v === 'number' && Number.isFinite(v)) {
                          const idx = Math.max(1, Math.floor(v)) - 1;
                          const p = imageFiles[Math.min(idx, imageFiles.length - 1)];
                          if (p) pickedPaths.push(p);
                        } else if (typeof v === 'string') {
                          const key = v.toLowerCase();
                          const p = lowerToFull.get(key);
                          if (p) pickedPaths.push(p);
                        }
                      }
                      const unique = Array.from(new Set(pickedPaths));
                      if (unique.length > 0) {
                        selectedImagesByGlobalId.set(normWithBraces, unique);
                        primeraImagenPorGlobalId.set(globalidNormalizado, unique[0]);
                        console.log(`${indent}  🖼️ ${imageFiles.length} imágenes, selección múltiple (${unique.length}) [fuente: selectedManyByGid] (gid: ${globalidNormalizado})`);
                      } else {
                        console.log(`${indent}  ⚠️ Selección múltiple vacía/no válida para ${globalidNormalizado}, se usa fallback`);
                      }
                    }

                    // 2) Si no hubo selección múltiple válida, aplicar selección única
                    if (!selectedImagesByGlobalId.has(normWithBraces)) {
                      // Determinar la posición seleccionada para este globalid (1-indexed)
                      let indiceSeleccion1 = null;
                      if (selectedByGid && typeof selectedByGid === 'object') {
                        for (const key of candidates) {
                          if (Object.prototype.hasOwnProperty.call(selectedByGid, key)) {
                            const val = Number(selectedByGid[key]);
                            if (!Number.isNaN(val) && val > 0) {
                              indiceSeleccion1 = val;
                              break;
                            }
                          }
                        }
                      }
                      const posicionBase1 = indiceSeleccion1 != null ? indiceSeleccion1 : photoPosition;
                      const fuenteSeleccion = indiceSeleccion1 != null ? 'selectedByGid' : 'photoPosition';
                      const posicionAjustada = Math.max(1, posicionBase1) - 1;
                      const imagenSeleccionada = imageFiles[Math.min(posicionAjustada, imageFiles.length - 1)];

                      primeraImagenPorGlobalId.set(globalidNormalizado, imagenSeleccionada);
                      selectedImagesByGlobalId.set(normWithBraces, [imagenSeleccionada]);
                      console.log(`${indent}  🖼️ ${imageFiles.length} imágenes, usando posición ${posicionBase1} [fuente: ${fuenteSeleccion}] (gid: ${globalidNormalizado}): ${path.basename(imagenSeleccionada)}`);
                    }
                  }
                } else {
                  console.log(`${indent}  ⚠️ Carpeta globalid sin imágenes: ${item}`);
                }
              } else {
                // No es un globalid, explorar recursivamente (máximo 3 niveles)
                if (nivel < 3) {
                  console.log(`${indent}📂 Explorando subcarpeta: ${item}`);
                  buscarCarpetasGlobalIdRecursivo(itemPath, nivel + 1);
                } else {
                  console.log(`${indent}⏹️ Máximo nivel de recursión alcanzado en: ${item}`);
                }
              }
            }
          } catch (itemError) {
            console.warn(`${indent}⚠️ Error procesando item ${item}:`, itemError.message);
          }
        }
      } catch (dirError) {
        console.warn(`${indent}⚠️ Error leyendo directorio ${dirPath}:`, dirError.message);
      }
    }
    
    // Función para determinar si un nombre parece un globalid
    function esNombreGlobalId(nombre) {
      // Patrones comunes de globalid:
      // {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
      // XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
      const patronGuid = /^\{?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}?$/i;
      return patronGuid.test(nombre.trim());
    }
    
    // Iniciar búsqueda recursiva
    console.log(`🔍 Iniciando búsqueda recursiva de carpetas globalid en: ${fotosDir}`);
    buscarCarpetasGlobalIdRecursivo(fotosDir);
    
    console.log(`📋 Total de carpetas globalid encontradas: ${primeraImagenPorGlobalId.size}`);
    for (const [globalid, imagePath] of primeraImagenPorGlobalId.entries()) {
      console.log(`  - ${globalid}: ${path.basename(imagePath)}`);
    }
    
    // Si no hay metadatos, intentar usar directamente las carpetas de fotos
    if (Object.keys(metadataObj).length === 0) {
      console.log('No se encontraron metadatos válidos en el CSV. Usando solo las carpetas de fotos.');
      
      // Crear un registro para cada carpeta de fotos encontrada
      for (const [globalidNormalizado, imagePath] of primeraImagenPorGlobalId.entries()) {
        // Intentar extraer un componente del nombre de la carpeta o usar un valor predeterminado
        let locacion = 'Sin Componente'; // Valor predeterminado
        
        // Si el path contiene alguna información sobre locación, intentar extraerla
        const pathParts = imagePath.split(path.sep);
        for (const part of pathParts) {
          if (part && part !== globalidNormalizado && !part.includes('.') && part.length > 2) {
            locacion = part;
            break;
          }
        }
        
        if (!registrosPorLocacion.has(locacion)) {
          registrosPorLocacion.set(locacion, []);
        }
        
        // Crear un registro básico con el globalid
        registrosPorLocacion.get(locacion).push({
          globalid: globalidNormalizado,
          metadata: {
            Componente: locacion,
            Locacion: locacion,
            Locación: locacion,
            Descripcion: `Imagen de ${globalidNormalizado}`,
            Norte: '',
            Este: '',
            Altitud: '',
            Zona: '17', // Valor por defecto para la zona
            NombrePunto: '', // Campos adicionales que podrían ser útiles
            NumeroFoto: ''
          }
        });
        
        console.log(`Creado registro para globalid ${globalidNormalizado} en componente ${locacion}`);
      }
    }
    
    // Crear estructura para el documento, agrupando por componente
    const imageGroups = new Map(); // Using Map to maintain insertion order
    
    // Para cada componente
    for (const [locacion, registros] of registrosPorLocacion.entries()) {
      console.log(`---> Procesando componente: ${locacion}, con ${registros.length} registros`);
      
      // Ordenar los registros por número de punto de muestreo
      registros.sort((a, b) => {
        // Extraer el número del punto de muestreo del nombre del punto
        const extraerNumeroPunto = (registro) => {
          const nombrePunto = registro.metadata.NombrePunto || '';
          
          // Caso 1: Si el nombre del punto contiene un guión, extraer el número después del último guión
          if (nombrePunto && nombrePunto.includes('-')) {
            const ultimaParte = nombrePunto.split('-').pop();
            const posibleNumero = parseInt(ultimaParte, 10);
            if (!isNaN(posibleNumero)) {
              return posibleNumero;
            }
          }
          
          // Caso 2: Si el nombre del punto contiene números, extraer el primer número encontrado
          const numeroEncontrado = nombrePunto.match(/\d+/);
          if (numeroEncontrado) {
            const posibleNumero = parseInt(numeroEncontrado[0], 10);
            if (!isNaN(posibleNumero)) {
              return posibleNumero;
            }
          }
          
          // Caso 3: Si hay un campo NumeroFoto o similar, intentar usarlo
          if (registro.metadata.NumeroFoto) {
            const posibleNumero = parseInt(registro.metadata.NumeroFoto, 10);
            if (!isNaN(posibleNumero)) {
              return posibleNumero;
            }
          }
          
          // Si no se puede extraer un número de ninguna forma, colocar al final
          return Infinity;
        };
        
        const numA = extraerNumeroPunto(a);
        const numB = extraerNumeroPunto(b);
        
        return numA - numB; // Ordenar de menor a mayor
      });
      
      console.log(`Registros ordenados por número de punto de muestreo para locación ${locacion}`);
      
      // Crear una lista para esta locación
      imageGroups.set(locacion, []);
      
      // Para cada registro en esta locación (ahora ordenados)
      for (const registro of registros) {
        // Normalizar el globalid para la búsqueda
        let globalid = registro.globalid;
        if (!globalid) {
          console.log(`  Registro sin globalid en locación ${locacion}, se omite`);
          continue;
        }
        
        // Usar el mismo formato que usamos al procesar el CSV
        // El globalid ya debe estar normalizado en el formato correcto
        let globalidNormalizado = globalid;
        
        console.log(`  Buscando imagen para registro con globalid: ${globalidNormalizado}`);
        
        const keyVariants = [globalidNormalizado, globalidNormalizado.toLowerCase(), globalidNormalizado.toUpperCase()];
        let imagePaths = null;
        for (const k of keyVariants) {
          if (selectedImagesByGlobalId.has(k)) { imagePaths = selectedImagesByGlobalId.get(k); break; }
        }
        if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
          const imagePath = primeraImagenPorGlobalId.get(globalidNormalizado);
          imagePaths = imagePath ? [imagePath] : [];
        }

        if (imagePaths.length > 0) {
          for (const imagePath of imagePaths) {
            try {
              // Leer el buffer de la imagen
              let imageBuffer = fs.existsSync(imagePath) ? await fs.promises.readFile(imagePath) : null;
              
              // Aplicar rotación EXIF para normalizar orientación (fotos verticales de Survey123)
              if (imageBuffer) {
                imageBuffer = await normalizeImageOrientation(imageBuffer);
              }

              // Agregar la imagen con sus metadatos al grupo de esta locación
              imageGroups.get(locacion).push({
                path: imagePath,
                imageBuffer,
                metadata: registro.metadata,  // Usar el registro completo como metadatos
                globalid: globalidNormalizado
              });
              console.log(`  Agregada imagen para globalid ${globalidNormalizado} en locación ${locacion}: ${path.basename(imagePath)}`);
            } catch (error) {
              console.error(`Error al leer la imagen ${imagePath}:`, error);
              // Agregar el registro sin la imagen
              imageGroups.get(locacion).push({
                path: imagePath,
                imageBuffer: null,
                metadata: registro.metadata,
                globalid: globalidNormalizado
              });
            }
          }
        } else {
          console.log(`  No se encontró imagen para globalid ${globalidNormalizado} en locación ${locacion}`);
        }
      }
    }
    
    return imageGroups;
  } catch (error) {
    console.error('Error al procesar imágenes:', error);
    throw new Error(`Error al procesar imágenes: ${error.message}`);
  }
}

export { 
  processImagesForMetadata,
  normalizeImageOrientation
 };
