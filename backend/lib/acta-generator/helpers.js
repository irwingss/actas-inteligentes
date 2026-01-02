/**
 * Funciones helper para la generación de documentos Word
 * Componentes reutilizables para tablas, celdas y párrafos
 */
import {
  Paragraph,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  BorderStyle,
  TextRun,
  VerticalAlign,
  ShadingType,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from './config.js';

/**
 * Crea una celda de tabla con bordes y formato estándar
 * @param {string|TextRun[]} content - Contenido de la celda
 * @param {Object} options - Opciones de la celda
 * @returns {TableCell}
 */
export function createCell(content, options = {}) {
  const {
    bold = false,
    shading = null,
    columnSpan = 1,
    rowSpan = 1,
    alignment = AlignmentType.LEFT,
    verticalAlign = VerticalAlign.CENTER,
    width = null,
    fontSize = FONT_SIZE.NORMAL,
  } = options;

  const textContent = typeof content === 'string'
    ? [new TextRun({ text: content, font: FONT_FAMILY, size: fontSize, bold })]
    : content;

  const cellOptions = {
    children: [
      new Paragraph({
        children: textContent,
        alignment,
      }),
    ],
    verticalAlign,
    columnSpan,
    rowSpan,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  };

  if (shading) {
    cellOptions.shading = { type: ShadingType.SOLID, color: shading };
  }

  if (width) {
    cellOptions.width = { size: width, type: WidthType.PERCENTAGE };
  }

  return new TableCell(cellOptions);
}

/**
 * Crea una celda con label (fondo gris, negrita)
 * @param {string} text - Texto del label
 * @param {Object} options - Opciones adicionales
 * @returns {TableCell}
 */
export function createLabelCell(text, options = {}) {
  return createCell(
    [new TextRun({ text, font: FONT_FAMILY, size: FONT_SIZE.NORMAL, bold: true })],
    {
      ...options,
      shading: COLORS.GRAY_SHADING,
      alignment: options.alignment || AlignmentType.CENTER,
    }
  );
}

/**
 * Crea una celda con valor (sin fondo)
 * @param {string} text - Texto del valor
 * @param {Object} options - Opciones adicionales
 * @returns {TableCell}
 */
export function createValueCell(text, options = {}) {
  return createCell(text || '', options);
}

/**
 * Crea un TextRun con formato estándar
 * @param {string} text - Texto
 * @param {Object} options - Opciones (bold, italic, color, size)
 * @returns {TextRun}
 */
export function createTextRun(text, options = {}) {
  const {
    bold = false,
    italic = false,
    color = COLORS.BLACK,
    size = FONT_SIZE.NORMAL,
  } = options;

  return new TextRun({
    text,
    font: FONT_FAMILY,
    size,
    bold,
    italics: italic,
    color,
  });
}

/**
 * Crea un párrafo centrado con título de sección
 * @param {string} text - Texto del título
 * @param {Object} options - Opciones adicionales
 * @returns {Paragraph}
 */
export function createSectionTitle(text, options = {}) {
  const {
    spacing = { before: 200, after: 200 },
    alignment = AlignmentType.CENTER,
    size = FONT_SIZE.TITLE,
    bold = true,
  } = options;

  return new Paragraph({
    alignment,
    spacing,
    children: [
      new TextRun({
        text,
        font: FONT_FAMILY,
        size,
        bold,
      }),
    ],
  });
}

/**
 * Crea un párrafo de texto normal
 * @param {string|TextRun[]} content - Contenido del párrafo
 * @param {Object} options - Opciones adicionales
 * @returns {Paragraph}
 */
export function createParagraph(content, options = {}) {
  const {
    alignment = AlignmentType.JUSTIFIED,
    spacing = { before: 100, after: 100 },
  } = options;

  const children = typeof content === 'string'
    ? [createTextRun(content)]
    : content;

  return new Paragraph({
    alignment,
    spacing,
    children,
  });
}

/**
 * Crea una fila de tabla vacía (separador)
 * @param {number} columnSpan - Número de columnas
 * @param {number} height - Altura en twips
 * @returns {TableRow}
 */
export function createEmptyRow(columnSpan = 7, height = 50) {
  return new TableRow({
    height: { value: height, rule: 'exact' },
    children: [
      createCell('', { columnSpan }),
    ],
  });
}

/**
 * Parsea fecha y hora de un string datetime
 * @param {string} datetime - String en varios formatos
 * @returns {Object} {fecha, hora}
 */
export function parseFechaHora(datetime) {
  if (!datetime) return { fecha: '', hora: '' };

  // Formato ISO: 2025-05-05T09:38:00
  if (datetime.includes('T')) {
    const [fecha, horaPart] = datetime.split('T');
    const hora = horaPart ? horaPart.substring(0, 5) : '';
    return { fecha, hora };
  }

  // Formato con espacio: 2025-05-05 09:38
  const parts = datetime.split(' ');
  if (parts.length >= 2) {
    return { fecha: parts[0], hora: parts[1].substring(0, 5) };
  }

  return { fecha: datetime, hora: '' };
}

/**
 * Parsea HTML simple a elementos docx (TextRun y Paragraph)
 * Soporta: <p>, <br>, <strong>/<b>, <em>/<i>, <ul>/<li>
 * @param {string} html - HTML a parsear
 * @param {Object} options - Opciones de formato base
 * @returns {Paragraph[]} Array de párrafos docx
 */
export function parseHtmlToDocxParagraphs(html, options = {}) {
  const {
    color = COLORS.BLACK,
    fontSize = FONT_SIZE.NORMAL
  } = options;

  if (!html || typeof html !== 'string') {
    return [];
  }

  // Limpiar HTML
  let cleanHtml = html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Si no tiene tags HTML, devolver como texto plano justificado
  if (!/<[^>]+>/.test(cleanHtml)) {
    if (!cleanHtml) return [];
    return [
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 50, after: 50 },
        children: [
          new TextRun({
            text: cleanHtml,
            font: FONT_FAMILY,
            size: fontSize,
            color,
          }),
        ],
      }),
    ];
  }

  const paragraphs = [];

  // Estrategia: Procesar el HTML secuencialmente, identificando bloques en orden
  // Esto mantiene el orden correcto de párrafos y listas

  // Reemplazar listas con placeholders únicos para mantener su posición
  let processedHtml = cleanHtml;
  const listData = [];
  let listCounter = 0;

  // Extraer listas y reemplazar con placeholders únicos
  const listRegex = /<(ul|ol)>([\s\S]*?)<\/\1>/gi;
  processedHtml = processedHtml.replace(listRegex, (match, listType, listContent) => {
    const placeholder = `|||LIST_${listCounter}|||`;
    const liItems = listContent.match(/<li>([\s\S]*?)<\/li>/gi) || [];
    const items = liItems.map((li, idx) => {
      let content = li
        .replace(/<\/?li>/gi, '')
        .replace(/<\/?p>/gi, '')
        .replace(/<\/?div>/gi, '')
        .trim();
      const bullet = listType.toLowerCase() === 'ol' ? `${idx + 1}.` : '•';
      return `${bullet}  ${content}`;
    }).filter(c => c.trim());

    listData[listCounter] = items;
    listCounter++;
    return placeholder;
  });

  // Ahora dividir por párrafos y <hr>, manteniendo los placeholders
  // Usar una expresión que capture los separadores
  const parts = processedHtml.split(/(<\/?p>|<br\s*\/?>|<hr\s*\/?>)/gi);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Ignorar tags de cierre y apertura solos
    if (/^<\/?p>$/i.test(trimmed) || /^<br\s*\/?>$/i.test(trimmed) || /^<hr\s*\/?>$/i.test(trimmed)) {
      continue;
    }

    // Verificar si contiene un placeholder de lista
    const listPlaceholderMatch = trimmed.match(/\|\|\|LIST_(\d+)\|\|\|/);
    if (listPlaceholderMatch) {
      // Extraer texto antes del placeholder (si hay)
      const beforeList = trimmed.split(/\|\|\|LIST_\d+\|\|\|/)[0].trim();
      if (beforeList) {
        const cleanContent = beforeList.replace(/<[^>]+>/g, '').trim();
        if (cleanContent) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 50, after: 50 },
              children: parseInlineHtml(beforeList, { color, fontSize }),
            })
          );
        }
      }

      // Insertar items de la lista
      const listIdx = parseInt(listPlaceholderMatch[1], 10);
      const items = listData[listIdx] || [];
      items.forEach(item => {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 30, after: 30 },
            indent: { left: 360 },
            children: parseInlineHtml(item, { color, fontSize }),
          })
        );
      });

      // Agregar párrafo vacío con espaciado después de la lista para separación visual
      paragraphs.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [],
        })
      );

      // Extraer texto después del placeholder (si hay)
      const afterParts = trimmed.split(/\|\|\|LIST_\d+\|\|\|/);
      if (afterParts.length > 1) {
        const afterList = afterParts[1].trim();
        if (afterList) {
          const cleanContent = afterList.replace(/<[^>]+>/g, '').trim();
          if (cleanContent) {
            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 50, after: 50 },
                children: parseInlineHtml(afterList, { color, fontSize }),
              })
            );
          }
        }
      }
    } else {
      // Párrafo normal - limpiar tags residuales y verificar contenido
      const cleanContent = trimmed.replace(/<[^>]+>/g, '').trim();
      if (cleanContent) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 50, after: 50 },
            children: parseInlineHtml(trimmed, { color, fontSize }),
          })
        );
      }
    }
  }

  return paragraphs.length > 0 ? paragraphs : [];
}

/**
 * Parsea HTML inline a TextRuns (negrita, cursiva, subrayado, etc.)
 * @param {string} html - HTML inline
 * @param {Object} options - Opciones
 * @returns {TextRun[]} Array de TextRuns
 */
function parseInlineHtml(html, options = {}) {
  const {
    color = COLORS.BLACK,
    fontSize = FONT_SIZE.NORMAL
  } = options;

  const textRuns = [];

  // Procesar el HTML de forma iterativa para capturar todos los tags
  let remaining = html;
  const tagPattern = /<(strong|b|em|i|u)>([\s\S]*?)<\/\1>/i;

  while (remaining.length > 0) {
    const match = remaining.match(tagPattern);

    if (match) {
      const beforeTag = remaining.substring(0, match.index);
      const tag = match[1].toLowerCase();
      const tagContent = match[2];

      // Añadir texto antes del tag (si existe)
      if (beforeTag) {
        const cleaned = beforeTag.replace(/<[^>]+>/g, '');
        if (cleaned) {
          textRuns.push(
            new TextRun({
              text: cleaned,
              font: FONT_FAMILY,
              size: fontSize,
              color,
            })
          );
        }
      }

      // Añadir texto con formato
      const isBold = tag === 'strong' || tag === 'b';
      const isItalic = tag === 'em' || tag === 'i';
      const isUnderline = tag === 'u';

      // Limpiar tags anidados del contenido
      const cleanContent = tagContent.replace(/<[^>]+>/g, '');
      if (cleanContent) {
        textRuns.push(
          new TextRun({
            text: cleanContent,
            font: FONT_FAMILY,
            size: fontSize,
            color,
            bold: isBold,
            italics: isItalic,
            underline: isUnderline ? {} : undefined,
          })
        );
      }

      // Continuar con el resto del texto
      remaining = remaining.substring(match.index + match[0].length);
    } else {
      // No hay más tags, añadir el texto restante
      const cleaned = remaining.replace(/<[^>]+>/g, '');
      if (cleaned) {
        textRuns.push(
          new TextRun({
            text: cleaned,
            font: FONT_FAMILY,
            size: fontSize,
            color,
          })
        );
      }
      break;
    }
  }

  // Si no se encontró nada, devolver el texto limpio
  if (textRuns.length === 0) {
    const cleaned = html.replace(/<[^>]+>/g, '').trim();
    if (cleaned) {
      textRuns.push(
        new TextRun({
          text: cleaned,
          font: FONT_FAMILY,
          size: fontSize,
          color,
        })
      );
    }
  }

  return textRuns;
}

/**
 * Strip HTML tags from string
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
export function stripHtmlTags(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

export default {
  createCell,
  createLabelCell,
  createValueCell,
  createTextRun,
  createSectionTitle,
  createParagraph,
  createEmptyRow,
  parseFechaHora,
  parseHtmlToDocxParagraphs,
  stripHtmlTags,
};
