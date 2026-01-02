/**
 * Módulo para renderizar anotaciones sobre imágenes
 * Soporta: círculos/óvalos, rectángulos, flechas y texto
 */
import sharp from 'sharp';

/**
 * Renderiza las anotaciones sobre una imagen
 * @param {Buffer} imageBuffer - Buffer de la imagen original
 * @param {Array} annotations - Array de anotaciones [{type, x, y, ...}]
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Buffer>} Buffer de la imagen con anotaciones
 */
export async function renderAnnotationsOnImage(imageBuffer, annotations = [], options = {}) {
  if (!imageBuffer || !annotations || annotations.length === 0) {
    // Aún si no hay anotaciones, aplicar rotación EXIF para mantener consistencia
    try {
      return await sharp(imageBuffer).rotate().jpeg({ quality: 95 }).toBuffer();
    } catch (e) {
      return imageBuffer;
    }
  }

  try {
    // CRÍTICO: Primero aplicar rotación EXIF para que la imagen tenga la orientación correcta
    // Las fotos de Survey123 pueden venir con orientación EXIF que indica rotación
    // El browser auto-rota según EXIF, pero sharp no lo hace por defecto
    // Usar rotate() sin parámetros aplica la rotación según metadatos EXIF
    const rotatedBuffer = await sharp(imageBuffer).rotate().toBuffer();
    
    // Obtener dimensiones de la imagen YA ROTADA (orientación real)
    const metadata = await sharp(rotatedBuffer).metadata();
    const { width, height } = metadata;

    if (!width || !height) {
      console.warn('[annotation-renderer] No se pudieron obtener dimensiones de imagen');
      return rotatedBuffer;
    }

    // Log para debug de orientación
    const originalMeta = await sharp(imageBuffer).metadata();
    if (originalMeta.orientation && originalMeta.orientation !== 1) {
      console.log(`[annotation-renderer] 📐 Imagen rotada según EXIF (orientation=${originalMeta.orientation}): ${originalMeta.width}x${originalMeta.height} → ${width}x${height}`);
    }

    // Generar SVG con las anotaciones usando dimensiones de imagen rotada
    const svgAnnotations = generateSvgAnnotations(annotations, width, height);
    
    if (!svgAnnotations) {
      return rotatedBuffer;
    }

    // Crear SVG completo
    const svgBuffer = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgAnnotations}
      </svg>
    `);

    // Componer la imagen ROTADA con las anotaciones
    const result = await sharp(rotatedBuffer)
      .composite([{
        input: svgBuffer,
        top: 0,
        left: 0,
      }])
      .jpeg({ quality: 95 })
      .toBuffer();

    console.log(`[annotation-renderer] ✅ Renderizadas ${annotations.length} anotaciones sobre imagen ${width}x${height}`);
    return result;

  } catch (error) {
    console.error('[annotation-renderer] Error renderizando anotaciones:', error.message);
    return imageBuffer;
  }
}

/**
 * Genera el contenido SVG para las anotaciones
 * @param {Array} annotations - Array de anotaciones
 * @param {number} imgWidth - Ancho de la imagen
 * @param {number} imgHeight - Alto de la imagen
 * @returns {string} Contenido SVG
 */
function generateSvgAnnotations(annotations, imgWidth, imgHeight) {
  const svgElements = [];

  for (const ann of annotations) {
    // Aumentar grosor mínimo para mejor visibilidad en impresión
    const { type, strokeColor = '#ff0000', strokeWidth: rawStrokeWidth = 4 } = ann;
    const strokeWidth = Math.max(rawStrokeWidth, 6); // Mínimo 6px para visibilidad
    
    // Calcular escala si la anotación fue creada en dimensiones diferentes
    // Las anotaciones guardan imageWidth/imageHeight del canvas cuando fueron creadas
    const annWidth = ann.imageWidth || imgWidth;
    const annHeight = ann.imageHeight || imgHeight;
    const scaleX = imgWidth / annWidth;
    const scaleY = imgHeight / annHeight;

    switch (type) {
      case 'ellipse': {
        // Círculo/Óvalo: {cx, cy, rx, ry}
        const { cx, cy, rx, ry } = ann;
        if (cx !== undefined && cy !== undefined && rx !== undefined && ry !== undefined) {
          svgElements.push(
            `<ellipse cx="${cx * scaleX}" cy="${cy * scaleY}" rx="${rx * scaleX}" ry="${ry * scaleY}" 
              fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`
          );
        }
        break;
      }

      case 'rectangle': {
        // Rectángulo: {x, y, width, height}
        const { x, y, width, height } = ann;
        if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
          svgElements.push(
            `<rect x="${x * scaleX}" y="${y * scaleY}" width="${Math.abs(width) * scaleX}" height="${Math.abs(height) * scaleY}" 
              fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`
          );
        }
        break;
      }

      case 'background': {
        // Fondo con relleno semitransparente: {x, y, width, height, opacity}
        const { x, y, width, height, opacity = 0.5 } = ann;
        if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
          // Convertir color hex a rgba con la opacidad configurada (50%-100%)
          const fillColor = hexToRgba(strokeColor, opacity);
          svgElements.push(
            `<rect x="${x * scaleX}" y="${y * scaleY}" width="${Math.abs(width) * scaleX}" height="${Math.abs(height) * scaleY}" 
              fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`
          );
        }
        break;
      }

      case 'arrow': {
        // Flecha: {startX, startY, endX, endY}
        const { startX, startY, endX, endY } = ann;
        if (startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
          const sX1 = startX * scaleX;
          const sY1 = startY * scaleY;
          const sX2 = endX * scaleX;
          const sY2 = endY * scaleY;
          
          // Calcular ángulo para la punta de la flecha
          const angle = Math.atan2(sY2 - sY1, sX2 - sX1);
          const arrowLength = 15 * Math.max(scaleX, scaleY);
          const arrowAngle = Math.PI / 6; // 30 grados

          // Puntos de la punta de la flecha
          const x1 = sX2 - arrowLength * Math.cos(angle - arrowAngle);
          const y1 = sY2 - arrowLength * Math.sin(angle - arrowAngle);
          const x2 = sX2 - arrowLength * Math.cos(angle + arrowAngle);
          const y2 = sY2 - arrowLength * Math.sin(angle + arrowAngle);

          svgElements.push(
            `<line x1="${sX1}" y1="${sY1}" x2="${sX2}" y2="${sY2}" 
              stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />`
          );
          svgElements.push(
            `<polygon points="${sX2},${sY2} ${x1},${y1} ${x2},${y2}" 
              fill="${strokeColor}" stroke="${strokeColor}" stroke-width="1" />`
          );
        }
        break;
      }

      case 'text': {
        // Texto: {x, y, text, fontSize}
        const { x, y, text, fontSize = 24 } = ann;
        if (x !== undefined && y !== undefined && text) {
          // Escapar caracteres especiales en XML
          const escapedText = escapeXml(text);
          
          // Escalar posición y tamaño de fuente
          const scaledX = x * scaleX;
          const scaledY = y * scaleY;
          const scaledFontSize = fontSize * Math.max(scaleX, scaleY);
          
          // Calcular líneas de texto (soportar múltiples líneas)
          const lines = escapedText.split('\n');
          const lineHeight = scaledFontSize * 1.3;
          
          // Texto simple sin fondo, sin stroke, sin sombra
          // Usamos dominant-baseline="hanging" para que Y sea la parte superior del texto
          // (igual que textBaseline='top' en Canvas)
          lines.forEach((line, idx) => {
            svgElements.push(
              `<text x="${scaledX}" y="${scaledY + idx * lineHeight}" 
                font-family="Arial, Helvetica, sans-serif" font-size="${scaledFontSize}" 
                fill="${strokeColor}" font-weight="bold"
                dominant-baseline="hanging">
                ${line}
              </text>`
            );
          });
        }
        break;
      }

      default:
        console.warn(`[annotation-renderer] Tipo de anotación desconocido: ${type}`);
    }
  }

  return svgElements.join('\n');
}

/**
 * Escapa caracteres especiales para XML
 * @param {string} str - String a escapar
 * @returns {string} String escapado
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convierte color hex a rgba con opacidad
 * @param {string} hex - Color en formato hex (#ff0000)
 * @param {number} alpha - Opacidad (0-1)
 * @returns {string} Color en formato rgba
 */
function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(255, 0, 0, ${alpha})`;
  
  // Remover # si existe
  const cleanHex = hex.replace('#', '');
  
  // Parsear componentes RGB
  const r = parseInt(cleanHex.substring(0, 2), 16) || 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default { renderAnnotationsOnImage };
