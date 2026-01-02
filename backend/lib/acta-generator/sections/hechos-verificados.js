/**
 * Sección 2: Hechos Verificados del Acta de Supervisión
 * Con soporte para HTML renderizado y fotos anotadas
 */
import {
  Table,
  TableRow,
  TableCell,
  Paragraph,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeightRule,
  ImageRun,
  VerticalAlign,
  TableLayoutType,
} from 'docx';
import imageSize from 'image-size';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';
import { createCell, createTextRun, parseHtmlToDocxParagraphs, stripHtmlTags } from '../helpers.js';

// Constantes para dimensiones de imagen (ajustadas para 2 por fila)
// Cálculo: Página 8.5" - márgenes 1.5" = 7" disponible = 504 pts
// Cada celda de 4 columnas = 252 pts (ancho completo de celda)
const CELL_WIDTH_4COL_TWIPS = 5000;
const DOCX_IMAGE_DPI = 96;
const TWIPS_PER_INCH = 1440;
const CELL_WIDTH_4COL_PX = Math.floor((CELL_WIDTH_4COL_TWIPS * DOCX_IMAGE_DPI) / TWIPS_PER_INCH);
const IMAGE_MAX_WIDTH_4COL = CELL_WIDTH_4COL_PX - 8;
const MAX_IMAGE_HEIGHT_2COL = 220; // Alto máximo para fotos verticales (portrait)

// Márgenes cero para celdas de imagen (para que ocupen todo el espacio)
const ZERO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

// Altura mínima de fila
const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST };

// Color azul para textos especiales
const COLOR_BLACK = '000000';

/**
 * Calcula los rangos de fotos por componente dentro de cada instalación de referencia.
 * @param {Array} fotos - Array de fotos del hecho
 * @param {number} startIndex - Índice inicial de fotos para este hecho
 * @returns {Object} Mapa de instalación -> {min, max, componentesConFotos: {nombre: {min, max}}}
 */
function calcularRangosFotosPorInstalacion(fotos, startIndex) {
  const rangosPorInstalacion = {};

  fotos.forEach((foto, idx) => {
    const fotoNum = startIndex + idx;
    const instalacion = foto.instalacion_referencia || foto.instalacionReferencia || 'Otros';
    // Normalizar nombre de instalación (capitalizar)
    const instalacionNormalizada = instalacion.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Obtener nombre del componente (normalizado)
    const componente = foto.componente || '';
    const componenteNormalizado = componente.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    if (!rangosPorInstalacion[instalacionNormalizada]) {
      rangosPorInstalacion[instalacionNormalizada] = {
        min: fotoNum,
        max: fotoNum,
        componentes: new Set(),
        componentesConFotos: {} // Mapa de componente -> {min, max}
      };
    } else {
      rangosPorInstalacion[instalacionNormalizada].min = Math.min(rangosPorInstalacion[instalacionNormalizada].min, fotoNum);
      rangosPorInstalacion[instalacionNormalizada].max = Math.max(rangosPorInstalacion[instalacionNormalizada].max, fotoNum);
    }

    // Agregar componente al Set (evita duplicados)
    if (componenteNormalizado) {
      rangosPorInstalacion[instalacionNormalizada].componentes.add(componenteNormalizado);

      // Calcular rango de fotos por componente
      if (!rangosPorInstalacion[instalacionNormalizada].componentesConFotos[componenteNormalizado]) {
        rangosPorInstalacion[instalacionNormalizada].componentesConFotos[componenteNormalizado] = {
          min: fotoNum,
          max: fotoNum
        };
      } else {
        const compData = rangosPorInstalacion[instalacionNormalizada].componentesConFotos[componenteNormalizado];
        compData.min = Math.min(compData.min, fotoNum);
        compData.max = Math.max(compData.max, fotoNum);
      }
    }
  });

  return rangosPorInstalacion;
}

/**
 * Genera el HTML de componentes y fotos para una instalación específica.
 * @param {Object} datos - Datos de la instalación {componentesConFotos: {componente: {min, max}}}
 * @returns {string} HTML con la lista de componentes y sus fotos
 */
function generarHtmlComponentesFotos(datos) {
  if (!datos || !datos.componentesConFotos || Object.keys(datos.componentesConFotos).length === 0) {
    return '';
  }

  let html = '<p>Los componentes asociados a esta instalación de referencia, y las fotografías donde se aprecian las condiciones mencionadas, son:</p>';
  html += '<ul>';

  // Ordenar componentes alfabéticamente
  const componentesOrdenados = Object.entries(datos.componentesConFotos)
    .sort((a, b) => a[0].localeCompare(b[0]));

  componentesOrdenados.forEach(([componente, fotoRango]) => {
    const rangoTexto = fotoRango.min === fotoRango.max
      ? `Figura N° ${fotoRango.min}`
      : `Figuras N° ${fotoRango.min} a la ${fotoRango.max}`;
    html += `<li>${componente} (${rangoTexto}).</li>`;
  });

  html += '</ul>';
  return html;
}

/**
 * Inyecta los rangos de fotos en el texto de descripción.
 * Detecta secciones por títulos de instalación (<strong><u>Nombre</u></strong>)
 * e INSERTA el HTML de componentes y fotos al FINAL de CADA sección.
 * @param {string} texto - Texto HTML de la descripción
 * @param {Object} rangos - Mapa de instalación -> {min, max, componentesConFotos: {}}
 * @returns {string} Texto con componentes y fotos inyectados después de cada instalación
 */
function inyectarRangosFotosEnDescripcion(texto, rangos) {
  if (!texto || Object.keys(rangos).length === 0) return texto;

  // Detectar secciones de instalación por títulos
  // Patrón: <p><strong><u>NombreInstalacion</u></strong></p> o variantes
  const patronTitulo = /<p>\s*<strong><u>([^<]+)<\/u><\/strong>\s*<\/p>/gi;

  // Encontrar todas las instalaciones mencionadas en el texto
  const instalacionesEnTexto = [];
  let match;
  while ((match = patronTitulo.exec(texto)) !== null) {
    instalacionesEnTexto.push({
      nombre: match[1].trim(),
      posicion: match.index,
      matchCompleto: match[0]
    });
  }

  if (instalacionesEnTexto.length === 0) {
    // Sin títulos de instalación: generar HTML de todos los componentes al final
    let htmlComponentes = '';
    for (const [instalacion, datos] of Object.entries(rangos)) {
      htmlComponentes += generarHtmlComponentesFotos(datos);
    }
    return texto + htmlComponentes;
  }

  // Procesar el texto por secciones (de atrás hacia adelante para no alterar posiciones)
  let resultado = texto;

  for (let i = instalacionesEnTexto.length - 1; i >= 0; i--) {
    const instalacionActual = instalacionesEnTexto[i];
    const nombreInstalacion = instalacionActual.nombre;

    // Determinar dónde termina esta sección
    let posFin;
    if (i < instalacionesEnTexto.length - 1) {
      posFin = instalacionesEnTexto[i + 1].posicion;
    } else {
      posFin = resultado.length;
    }

    // Buscar el rango correspondiente a esta instalación
    let rango = null;
    let rangoKey = null;

    // Búsqueda exacta
    if (rangos[nombreInstalacion]) {
      rango = rangos[nombreInstalacion];
      rangoKey = nombreInstalacion;
    }

    // Búsqueda insensible a mayúsculas
    if (!rango) {
      const nombreLower = nombreInstalacion.toLowerCase();
      for (const [key, value] of Object.entries(rangos)) {
        if (key.toLowerCase() === nombreLower) {
          rango = value;
          rangoKey = key;
          break;
        }
      }
    }

    // Búsqueda parcial (si la instalación contiene o está contenida en la clave)
    if (!rango) {
      const nombreLower = nombreInstalacion.toLowerCase();
      for (const [key, value] of Object.entries(rangos)) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(nombreLower) || nombreLower.includes(keyLower)) {
          rango = value;
          rangoKey = key;
          break;
        }
      }
    }

    // Si encontramos un rango, inyectar el HTML de componentes/fotos al final de esta sección
    if (rango && rango.componentesConFotos && Object.keys(rango.componentesConFotos).length > 0) {
      const htmlComponentes = generarHtmlComponentesFotos(rango);
      // Insertar justo antes de donde empieza la siguiente sección (o al final)
      resultado = resultado.substring(0, posFin) + htmlComponentes + resultado.substring(posFin);
    }
  }

  return resultado;
}

// Márgenes internos para celdas de fotos (padding)
const CELL_MARGINS = {
  top: 80,      // ~2mm
  bottom: 80,   // ~2mm
  left: 100,    // ~2.5mm
  right: 100,   // ~2.5mm
};

/**
 * Crea un párrafo de título (solo el título en negrita)
 * Espaciado aumentado para separar secciones dentro del hecho
 */
function createTitleParagraph(titulo) {
  return new Paragraph({
    spacing: { before: 280, after: 60 },  // Mayor espaciado antes del título
    children: [
      new TextRun({
        text: titulo,
        font: FONT_FAMILY,
        size: FONT_SIZE.NORMAL,
        bold: true,
      }),
    ],
  });
}

/**
 * Crea párrafos de componentes y fotos por instalación (generados directamente en Word)
 * Nuevo formato: cada componente con sus fotografías correspondientes
 * @param {Object} rangosFotos - Mapa de instalación -> {min, max, componentes: Set, componentesConFotos: {}}
 * @returns {Paragraph[]} Array de párrafos
 */
function createComponentesFotosParagraphs(rangosFotos) {
  const paragraphs = [];

  if (!rangosFotos || Object.keys(rangosFotos).length === 0) {
    return paragraphs;
  }

  // Iterar por cada instalación
  for (const [instalacion, datos] of Object.entries(rangosFotos)) {
    // Solo agregar si hay componentes con fotos
    if (datos.componentesConFotos && Object.keys(datos.componentesConFotos).length > 0) {
      // Párrafo introductorio
      paragraphs.push(
        new Paragraph({
          spacing: { before: 150, after: 50 },
          children: [
            new TextRun({
              text: 'Los componentes asociados a esta instalación de referencia, y las fotografías donde se aprecian las condiciones mencionadas, son:',
              font: FONT_FAMILY,
              size: FONT_SIZE.NORMAL,
            }),
          ],
        })
      );

      // Lista de componentes con sus rangos de fotos, ordenados por nombre
      const componentesOrdenados = Object.entries(datos.componentesConFotos)
        .sort((a, b) => a[0].localeCompare(b[0]));

      componentesOrdenados.forEach(([componente, fotoRango]) => {
        // Generar texto del rango de fotos
        const rangoTexto = fotoRango.min === fotoRango.max
          ? `Figura N° ${fotoRango.min}`
          : `Figuras N° ${fotoRango.min} a la ${fotoRango.max}`;

        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 30, after: 30 },
            children: [
              new TextRun({
                text: `${componente} (${rangoTexto}).`,
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
              }),
            ],
          })
        );
      });
    }
  }

  return paragraphs;
}

/**
 * Crea párrafos de contenido a partir de HTML o texto plano
 * @param {string} contenido - Contenido HTML o texto
 * @param {Object} options - Opciones
 * @returns {Paragraph[]} Array de párrafos
 */
function createContentParagraphs(contenido, options = {}) {
  const { isPlaceholder = false, rangosFotos = {} } = options;
  const color = isPlaceholder ? COLOR_BLACK : COLORS.BLACK;

  if (!contenido) return [];

  // Inyectar rangos de fotos detectando secciones por títulos de instalación
  let contenidoProcesado = inyectarRangosFotosEnDescripcion(contenido, rangosFotos);

  // Si contiene HTML, parsearlo
  if (/<[^>]+>/.test(contenidoProcesado)) {
    return parseHtmlToDocxParagraphs(contenidoProcesado, { color });
  }

  // Texto plano - justificado
  return [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 50, after: 100 },
      children: [
        new TextRun({
          text: contenidoProcesado,
          font: FONT_FAMILY,
          size: FONT_SIZE.NORMAL,
          color,
        }),
      ],
    }),
  ];
}

/**
 * Crea la lista de medios probatorios
 */
function createMediosProbatoriosList(medios = []) {
  const defaultMedios = [
    'Fotografías tomadas durante la acción de supervisión.',
  ];

  const items = medios.length > 0 ? medios : defaultMedios;

  const paragraphs = [
    // Título
    new Paragraph({
      spacing: { before: 150, after: 50 },
      children: [
        new TextRun({
          text: 'Medios probatorios',
          font: FONT_FAMILY,
          size: FONT_SIZE.NORMAL,
          bold: true,
        }),
      ],
    }),
  ];

  // Items de lista
  items.forEach(item => {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 30, after: 30 },
        indent: { left: 360 },
        children: [
          new TextRun({
            text: '•  ' + item,
            font: FONT_FAMILY,
            size: FONT_SIZE.NORMAL,
          }),
        ],
      })
    );
  });

  return paragraphs;
}

/**
 * Crea las FILAS de fotografías (no una tabla) para insertar directamente en la tabla del hecho
 * Layout 2 por fila con 8 columnas (4 por foto)
 * @param {Array} fotos - Array de objetos foto con imageBuffer, descripcion, etc.
 * @param {number} startIndex - Índice inicial para numeración
 * @returns {Array<TableRow>} Array de filas para agregar a la tabla del hecho
 */
function createFotografiasRows(fotos = [], startIndex = 1) {
  // Si no hay fotos, devolver filas placeholder
  if (!fotos || fotos.length === 0) {
    return createFotografiasPlaceholderRows(startIndex);
  }

  const tableRows = [];
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
  const noBorder = { style: BorderStyle.NIL };

  // Procesar fotos en pares (2 por fila)
  for (let i = 0; i < fotos.length; i += 2) {
    const foto1 = fotos[i];
    const foto2 = fotos[i + 1]; // Puede ser undefined si es impar
    const figNum1 = startIndex + i;
    const figNum2 = startIndex + i + 1;

    // ===== FILA 1: TÍTULOS + COMPONENTES (unificados) =====
    tableRows.push(createTitleRow(foto1, foto2, figNum1, figNum2, borderStyle, noBorder));

    // ===== FILA 2: IMÁGENES =====
    tableRows.push(createImageRow(foto1, foto2, borderStyle, noBorder));

    // ===== FILA 3: DESCRIPCIONES =====
    tableRows.push(createDescriptionRow(foto1, foto2, borderStyle, noBorder));

    // ===== FILA 4-5: COORDENADAS UTM =====
    const coordRows = createCoordenadasRows(foto1, foto2, borderStyle);
    tableRows.push(...coordRows);
  }

  return tableRows;
}

/**
 * Crea filas placeholder cuando no hay fotos
 * @param {number} startIndex - Índice inicial para numeración
 * @returns {Array<TableRow>} Array de filas placeholder
 */
function createFotografiasPlaceholderRows(startIndex = 1) {
  const rows = [];
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };

  for (let i = 0; i < 2; i++) {
    const figNum1 = startIndex + (i * 2);
    const figNum2 = startIndex + (i * 2) + 1;

    rows.push(
      new TableRow({
        height: { value: 600, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            columnSpan: 4,
            borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `[Figura ${figNum1}]`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    color: COLOR_BLACK,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            columnSpan: 4,
            borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `[Figura ${figNum2}]`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    color: COLOR_BLACK,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  return rows;
}

/**
 * Crea fila de títulos "Figura N° X. Componente" (todo en una celda)
 * Figura N° X. en negrita, Componente sin negrita
 */
function createTitleRow(foto1, foto2, figNum1, figNum2, borderStyle, noBorder) {
  const componente1 = foto1?.componente || 'Componente';
  const componente2 = foto2?.componente || 'Componente';

  const children = [
    // Título + Componente foto 1
    new TableCell({
      columnSpan: 4,
      margins: CELL_MARGINS,
      borders: {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 50, after: 50 },
          children: [
            new TextRun({
              text: `Figura N° ${figNum1}. `,
              font: FONT_FAMILY,
              size: FONT_SIZE.NORMAL,
              bold: true,
            }),
            new TextRun({
              text: componente1,
              font: FONT_FAMILY,
              size: FONT_SIZE.NORMAL,
            }),
          ],
        }),
      ],
    }),
  ];

  // Título + Componente foto 2 (si existe)
  if (foto2) {
    children.push(
      new TableCell({
        columnSpan: 4,
        margins: CELL_MARGINS,
        borders: {
          top: borderStyle,
          bottom: borderStyle,
          left: borderStyle,
          right: borderStyle,
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 50, after: 50 },
            children: [
              new TextRun({
                text: `Figura N° ${figNum2}. `,
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
              new TextRun({
                text: componente2,
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Celda vacía invisible
    children.push(createEmptyCell(4, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }));
  }

  return new TableRow({ children });
}

/**
 * Crea fila de componentes (en negrita)
 */
function createComponenteRow(foto1, foto2, borderStyle, noBorder) {
  const componente1 = foto1?.componente || 'Componente';
  const componente2 = foto2?.componente || 'Componente';

  const children = [
    new TableCell({
      columnSpan: 4,
      margins: CELL_MARGINS,
      borders: {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 30 },
          children: [
            new TextRun({
              text: componente1,
              font: FONT_FAMILY,
              size: FONT_SIZE.NORMAL,
              bold: true,
            }),
          ],
        }),
      ],
    }),
  ];

  if (foto2) {
    children.push(
      new TableCell({
        columnSpan: 4,
        margins: CELL_MARGINS,
        borders: {
          top: borderStyle,
          bottom: borderStyle,
          left: borderStyle,
          right: borderStyle,
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 30 },
            children: [
              new TextRun({
                text: componente2,
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Celda vacía sin bordes cuando no hay foto2 (número impar de fotos)
    children.push(createEmptyCell(4, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }));
  }

  return new TableRow({ children });
}

/**
 * Crea fila de imágenes
 */
function createImageRow(foto1, foto2, borderStyle, noBorder) {
  const children = [
    createImageCell(foto1, borderStyle),
  ];

  if (foto2) {
    children.push(createImageCell(foto2, borderStyle));
  } else {
    // Celda vacía sin bordes cuando no hay foto2 (número impar de fotos)
    children.push(createEmptyCell(4, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }));
  }

  return new TableRow({ children });
}

/**
 * Crea celda con imagen individual
 */
function createImageCell(foto, borderStyle) {
  const imagenChildren = [];

  if (foto?.imageBuffer) {
    let imgWidth = IMAGE_MAX_WIDTH_4COL;
    let imgHeight = MAX_IMAGE_HEIGHT_2COL;

    try {
      const dimensions = imageSize(foto.imageBuffer);
      const originalWidth = dimensions.width || 800;
      const originalHeight = dimensions.height || 600;
      const aspectRatio = originalWidth / originalHeight;

      if (aspectRatio >= 1) {
        // Landscape: SIEMPRE usar ancho completo de celda
        imgWidth = IMAGE_MAX_WIDTH_4COL;
        imgHeight = Math.round(IMAGE_MAX_WIDTH_4COL / aspectRatio);
      } else {
        // Portrait: limitar por altura, calcular ancho proporcionalmente
        imgHeight = MAX_IMAGE_HEIGHT_2COL;
        imgWidth = Math.round(MAX_IMAGE_HEIGHT_2COL * aspectRatio);
      }
    } catch (err) {
      console.warn(`[fotos] No se pudo detectar dimensiones:`, err.message);
      // Fallback: usar ancho completo
      imgWidth = IMAGE_MAX_WIDTH_4COL;
      imgHeight = Math.round(IMAGE_MAX_WIDTH_4COL * 0.75); // Asumir 4:3
    }

    imagenChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        // Sin spacing para maximizar el espacio de la imagen
        children: [
          new ImageRun({
            data: foto.imageBuffer,
            transformation: { width: imgWidth, height: imgHeight },
          }),
        ],
      })
    );
  } else {
    imagenChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 50, after: 50 },
        children: [
          new TextRun({
            text: '[Imagen no disponible]',
            font: FONT_FAMILY,
            size: FONT_SIZE.NORMAL,
            italics: true,
          }),
        ],
      })
    );
  }

  return new TableCell({
    columnSpan: 4,
    // Márgenes cero para que la imagen horizontal ocupe todo el ancho de celda
    margins: ZERO_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: borderStyle,
      bottom: borderStyle,
      left: borderStyle,
      right: borderStyle,
    },
    children: imagenChildren,
  });
}

/**
 * Crea fila de descripciones
 */
function createDescriptionRow(foto1, foto2, borderStyle, noBorder) {
  const desc1 = foto1?.descripcion || foto1?.descripcionEditada || '';
  const desc2 = foto2?.descripcion || foto2?.descripcionEditada || '';

  const children = [
    new TableCell({
      columnSpan: 4,
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      borders: {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30, after: 30 },
          children: [
            new TextRun({
              text: desc1 || ' ',
              font: FONT_FAMILY,
              size: FONT_SIZE.SMALL,
            }),
          ],
        }),
      ],
    }),
  ];

  if (foto2) {
    children.push(
      new TableCell({
        columnSpan: 4,
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: borderStyle,
          bottom: borderStyle,
          left: borderStyle,
          right: borderStyle,
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 30, after: 30 },
            children: [
              new TextRun({
                text: desc2 || ' ',
                font: FONT_FAMILY,
                size: FONT_SIZE.SMALL,
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Celda vacía sin bordes cuando no hay foto2 (número impar de fotos)
    children.push(createEmptyCell(4, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }));
  }

  return new TableRow({ children });
}

/**
 * Crea las 2 filas de coordenadas UTM (headers + valores)
 */
function createCoordenadasRows(foto1, foto2, borderStyle) {
  const noBorder = { style: BorderStyle.NIL };

  // Extraer coordenadas
  const este1 = foto1?.este || foto1?.x || '';
  const norte1 = foto1?.norte || foto1?.y || '';
  const altitud1 = foto1?.altitud || foto1?.altitude || '';

  const este2 = foto2?.este || foto2?.x || '';
  const norte2 = foto2?.norte || foto2?.y || '';
  const altitud2 = foto2?.altitud || foto2?.altitude || '';

  // Fila de headers
  const headerRow = new TableRow({
    children: [
      // Foto 1: Coordenadas UTM (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Coordenadas', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'UTM – WGS 84.', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Zona 17 M', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
          }),
        ],
      }),
      // Este header
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Este', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
      }),
      // Norte header
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Norte', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
      }),
      // Altitud header
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Altitud', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
      }),
      // Foto 2 (si existe)
      ...(foto2 ? [
        new TableCell({
          rowSpan: 2,
          margins: CELL_MARGINS,
          verticalAlign: VerticalAlign.CENTER,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Coordenadas', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'UTM – WGS 84.', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Zona 17 M', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })],
            }),
          ],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Este', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Norte', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Altitud', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
      ] : [
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
      ]),
    ],
  });

  // Fila de valores
  const valueRow = new TableRow({
    children: [
      // Foto 1 valores (la celda UTM ya tiene rowSpan)
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: este1 ? String(Math.round(este1)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
      }),
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: norte1 ? String(Math.round(norte1)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
      }),
      new TableCell({
        margins: CELL_MARGINS,
        borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: altitud1 ? String(Math.round(altitud1)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
      }),
      // Foto 2 valores (si existe)
      ...(foto2 ? [
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: este2 ? String(Math.round(este2)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: norte2 ? String(Math.round(norte2)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          borders: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: altitud2 ? String(Math.round(altitud2)) : '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
      ] : [
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
        createEmptyCell(1, { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }),
      ]),
    ],
  });

  return [headerRow, valueRow];
}

/**
 * Crea celda vacía invisible
 */
function createEmptyCell(columnSpan, borders) {
  return new TableCell({
    columnSpan,
    borders,
    children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
  });
}



/**
 * Crea el contenido de un hecho verificado individual
 * Tabla de 8 columnas para compatibilidad con fotos 2x2
 * @param {Object} hecho - Datos del hecho
 * @param {number} index - Número del hecho (1, 2, 3...)
 * @param {number} fotoStartIndex - Índice inicial para las fotos
 * @returns {Table} Tabla con todo el contenido del hecho
 */
function createHechoContent(hecho, index, fotoStartIndex) {
  const rows = [];

  // Fila 1: Presunto Incumplimiento | valor | Subsanado | valor (usando 8 columnas con columnSpan)
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        new TableCell({
          columnSpan: 2,
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: 'Presunto Incumplimiento',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          columnSpan: 2,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: hecho.presunto_incumplimiento || '[sí/no/no aplica/por determinar]',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  color: hecho.presunto_incumplimiento ? COLORS.BLACK : COLOR_BLACK,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          columnSpan: 2,
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Subsanado',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          columnSpan: 2,
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: hecho.subsanado || '[sí/no/no aplica]',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  color: hecho.subsanado ? COLORS.BLACK : COLOR_BLACK,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Calcular rangos de fotos por instalación para reemplazar placeholders
  const rangosFotos = calcularRangosFotosPorInstalacion(hecho.fotos || [], fotoStartIndex);

  // Fila 2: Contenido del hecho (una celda grande)
  const contentParagraphs = [];

  // Hecho Detectado N°: (negrita + subrayado) + Objetivo (negrita)
  contentParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 100, after: 100 },
      children: [
        new TextRun({
          text: `Hecho Detectado ${index}: `,
          font: FONT_FAMILY,
          size: FONT_SIZE.NORMAL,
          bold: true,
          underline: { type: 'single' },
        }),
        new TextRun({
          text: hecho.objetivo || 'Objetivo',
          font: FONT_FAMILY,
          size: FONT_SIZE.NORMAL,
          bold: true,
          color: hecho.objetivo ? COLORS.BLACK : COLOR_BLACK,
        }),
      ],
    })
  );

  // ===== OBLIGACIÓN (título + contenido separados) =====
  contentParagraphs.push(createTitleParagraph('Obligación'));
  const obligacionContent = hecho.obligacion || '[Breve referencia a la obligación fiscalizable (IGA, Norma, Medida Administrativa, etc.)]';
  contentParagraphs.push(...createContentParagraphs(obligacionContent, { isPlaceholder: !hecho.obligacion }));

  // ===== DESCRIPCIÓN (título + contenido separados) =====
  // NOTA: Los componentes y fotos ahora se inyectan directamente en el HTML 
  // al final de cada sección de instalación (ver inyectarRangosFotosEnDescripcion)
  contentParagraphs.push(createTitleParagraph('Descripción'));
  const descripcionContent = hecho.descripcion || '[Descripción clara y precisa del hecho verificado]';
  contentParagraphs.push(...createContentParagraphs(descripcionContent, {
    isPlaceholder: !hecho.descripcion,
    rangosFotos: rangosFotos  // Inyecta componentes/fotos al final de cada instalación
  }));

  // ===== REQUERIMIENTO DE SUBSANACIÓN (título + contenido separados) =====
  contentParagraphs.push(createTitleParagraph('Requerimiento de subsanación'));
  const reqSubsanacion = hecho.requerimiento_subsanacion ||
    '[Si el hecho no es subsanado antes del cierre de la acción de supervisión, efectuar el requerimiento de corrección, indicando la actividad requerida y el plazo para hacerlo.]';
  contentParagraphs.push(...createContentParagraphs(reqSubsanacion, { isPlaceholder: !hecho.requerimiento_subsanacion }));

  // ===== INFORMACIÓN PARA ANÁLISIS DE RIESGO (título + contenido separados) =====
  contentParagraphs.push(createTitleParagraph('Información para análisis de riesgo'));
  const infoRiesgo = hecho.info_analisis_riesgo ||
    '[Consignar información preliminar objetiva que sea posible recoger en campo para aplicar la metodología de riesgo]';
  contentParagraphs.push(...createContentParagraphs(infoRiesgo, { isPlaceholder: !hecho.info_analisis_riesgo }));

  // ===== MEDIOS PROBATORIOS =====
  contentParagraphs.push(...createMediosProbatoriosList(hecho.medios_probatorios));

  // Agregar fila de contenido (sin fotos, las fotos van como filas separadas)
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 8,
          margins: CELL_MARGINS,
          borders: {
            top: { style: BorderStyle.NIL },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          },
          children: contentParagraphs,
        }),
      ],
    })
  );

  // ===== FILAS DE FOTOGRAFÍAS (directamente en la tabla del hecho) =====
  const fotoRows = createFotografiasRows(hecho.fotos, fotoStartIndex);
  rows.push(...fotoRows);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    // 8 columnas con más ancho en col 1 y 5 (UTM) para evitar texto comprimido
    // Col 1 (UTM): 1550, Col 2 (Este): 1050, Col 3 (Norte): 1050, Col 4 (Altitud): 1350
    // Col 5 (UTM): 1550, Col 6 (Este): 1050, Col 7 (Norte): 1050, Col 8 (Altitud): 1350
    // Total: 10000 twips
    columnWidths: [1550, 1050, 1050, 1350, 1550, 1050, 1050, 1350],
    rows,
  });
}

/**
 * Crea la tabla de título "2. Hechos Verificados" (separada)
 * @returns {Table}
 */
export function createHechosVerificadosTitulo() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        height: ROW_HEIGHT,
        children: [
          createCell(
            [new TextRun({
              text: '2.   Hechos Verificados',
              font: FONT_FAMILY,
              size: FONT_SIZE.NORMAL,
              bold: true
            })],
            { shading: COLORS.GRAY_SHADING, alignment: AlignmentType.LEFT }
          ),
        ],
      }),
    ],
  });
}

/**
 * Genera la sección completa de Hechos Verificados
 * Estructura: Título (tabla separada) -> Enter -> Hecho 1 (tabla) -> Enter -> Hecho 2 (tabla) -> ...
 * @param {Array} hechos - Array de hechos verificados desde actas_hechos
 * @returns {Array} Array de elementos para el documento
 */
export function createHechosVerificadosSection(hechos = []) {
  const elements = [];

  // Tabla de título "2. Hechos Verificados" (1 fila, 1 columna, ancho completo)
  elements.push(createHechosVerificadosTitulo());

  // Párrafo vacío (enter) después del título
  elements.push(new Paragraph({ children: [] }));

  // Si no hay hechos, crear uno de ejemplo con placeholders
  if (hechos.length === 0) {
    hechos = [{}];
  }

  // Crear cada hecho como tabla independiente con enter entre ellos
  let fotoIndex = 1;
  hechos.forEach((hecho, idx) => {
    // Mapear campos de actas_hechos al formato del documento
    const hechoData = {
      presunto_incumplimiento: hecho.presunto_incumplimiento || null,
      subsanado: hecho.subsanado || null,
      objetivo: hecho.titulo_hecho || hecho.hecho_detec_original || null,
      obligacion: hecho.obligacion || null,
      descripcion: hecho.descripcion || hecho.descripcion_original || null,
      requerimiento_subsanacion: hecho.requerimiento_subsanacion || null,
      // Usar texto_analisis_riesgo (resumen automático) en lugar de info_analisis_riesgo
      info_analisis_riesgo: hecho.texto_analisis_riesgo || hecho.info_analisis_riesgo || null,
      medios_probatorios: hecho.medios_probatorios || [],
      fotos: hecho.fotos || [],
    };

    // Añadir tabla del hecho
    // IMPORTANTE: Usar siempre idx + 1 para numeración secuencial (1, 2, 3...)
    // Los hechos ya vienen ordenados por numero_hecho desde la consulta SQL
    elements.push(createHechoContent(hechoData, idx + 1, fotoIndex));

    // Párrafo vacío (enter) después de cada hecho
    elements.push(new Paragraph({ children: [] }));

    // Incrementar índice según cantidad real de fotos (mínimo 4 para placeholders)
    fotoIndex += Math.max(hechoData.fotos.length, 4);
  });

  return elements;
}

/**
 * Crea la tabla de "Equipo supervisor no presente durante la firma del acta"
 * Sin numeración, va después de los hechos verificados
 * @param {Array} supervisoresNoPresentesArray - Array de supervisores [{nombre, cargo, dni}]
 * @returns {Array} Array de elementos para el documento
 */
export function createEquipoSupervisorNoPresenteSection(supervisoresNoPresentes = []) {
  const elements = [];
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
  
  // Altura mínima de fila
  const ROW_HEIGHT_LOCAL = { value: 340, rule: HeightRule.ATLEAST };

  // Crear tabla con título y datos de supervisores
  const rows = [];

  // Fila de título (sin numeración, fondo gris)
  rows.push(
    new TableRow({
      height: ROW_HEIGHT_LOCAL,
      children: [
        new TableCell({
          columnSpan: 3,
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: 'Equipo supervisor no presente durante la firma del acta',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Fila de encabezados de columna
  rows.push(
    new TableRow({
      height: ROW_HEIGHT_LOCAL,
      children: [
        new TableCell({
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Nombre',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'Cargo',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          margins: CELL_MARGINS,
          shading: { fill: COLORS.GRAY_SHADING },
          borders: {
            top: borderStyle,
            bottom: borderStyle,
            left: borderStyle,
            right: borderStyle,
          },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'DNI',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Si no hay supervisores, mostrar fila vacía placeholder
  if (supervisoresNoPresentes.length === 0) {
    rows.push(
      new TableRow({
        height: ROW_HEIGHT_LOCAL,
        children: [
          new TableCell({
            margins: CELL_MARGINS,
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '[Nombre del supervisor]',
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    italics: true,
                    color: COLOR_BLACK,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            margins: CELL_MARGINS,
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '[Cargo]',
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    italics: true,
                    color: COLOR_BLACK,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            margins: CELL_MARGINS,
            borders: {
              top: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
              right: borderStyle,
            },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '[DNI]',
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    italics: true,
                    color: COLOR_BLACK,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Agregar filas con datos de supervisores
    supervisoresNoPresentes.forEach((supervisor) => {
      rows.push(
        new TableRow({
          height: ROW_HEIGHT_LOCAL,
          children: [
            new TableCell({
              margins: CELL_MARGINS,
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: supervisor.nombre || '',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: supervisor.cargo || '',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              margins: CELL_MARGINS,
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: supervisor.dni || '',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    });
  }

  // Crear tabla con anchos de columna proporcionales (50%, 25%, 25%)
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5000, 2500, 2500], // 50%, 25%, 25% (en twips, total 10000)
      rows,
    })
  );

  // Párrafo vacío después de la tabla
  elements.push(new Paragraph({ children: [] }));

  return elements;
}

export default {
  createHechosVerificadosSection,
  createEquipoSupervisorNoPresenteSection,
};
