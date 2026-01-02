/**
 * Sección 3: Muestreo Ambiental del Acta de Supervisión
 * Tabla agrupada por Matriz (Efluente, Calidad de Suelo, Ruido Ambiental, etc.)
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
  VerticalAlign,
  ShadingType,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';

// Anchos de columna para la tabla de muestreo (%)
// Nro | Código de punto | Nro. de muestras | Matriz | Descripción | Norte | Este | Altitud | Muestra Dirimente
const COLUMN_WIDTHS = [4, 10, 7, 8, 30, 10, 10, 7, 14];

// Estilos de borde
const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const ALL_BORDERS = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
};

// Márgenes de celda
const CELL_MARGINS = {
  top: 40,
  bottom: 40,
  left: 60,
  right: 60,
};

/**
 * Crea una celda de tabla estándar
 */
function createTableCell(content, options = {}) {
  const {
    bold = false,
    shading = null,
    columnSpan = 1,
    rowSpan = 1,
    alignment = AlignmentType.LEFT,
    fontSize = FONT_SIZE.NORMAL,
  } = options;

  const cellOptions = {
    children: [
      new Paragraph({
        alignment,
        children: [
          new TextRun({
            text: content || '',
            font: FONT_FAMILY,
            size: fontSize,
            bold,
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    columnSpan,
    rowSpan,
    margins: CELL_MARGINS,
    borders: ALL_BORDERS,
  };

  if (shading) {
    cellOptions.shading = { type: ShadingType.SOLID, color: shading };
  }

  return new TableCell(cellOptions);
}

/**
 * Crea la fila del título de la sección "3. Muestreo ambiental"
 */
function createSectionTitleRow() {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 9,
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: '4.\tMuestreo ambiental',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Crea las filas de encabezado de columna
 * Primera fila: headers principales con "Coordenadas UTM - WGS 84" ocupando 2 columnas
 * Segunda fila: Norte y Este
 */
function createColumnHeaderRows() {
  // Primera fila: encabezados principales
  const headerRow1 = new TableRow({
    children: [
      // Nro. (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[0], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Nro.',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Código de punto (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[1], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Código de punto',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Nro. de muestras (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[2], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Nro. de muestras',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Matriz (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[3], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Matriz',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Descripción (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[4], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Descripción',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Coordenadas "UTM - WGS 84" (columnSpan 2)
      new TableCell({
        columnSpan: 2,
        width: { size: COLUMN_WIDTHS[5] + COLUMN_WIDTHS[6], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Coordenadas "UTM - WGS 84"',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Altitud (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[7], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Altitud',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Muestra Dirimente (rowSpan 2)
      new TableCell({
        rowSpan: 2,
        width: { size: COLUMN_WIDTHS[8], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Muestra Dirimente',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Segunda fila: sub-headers para Norte y Este
  const headerRow2 = new TableRow({
    children: [
      // Norte
      new TableCell({
        width: { size: COLUMN_WIDTHS[5], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Norte',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Este
      new TableCell({
        width: { size: COLUMN_WIDTHS[6], type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Este',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return [headerRow1, headerRow2];
}

/**
 * Crea una fila de separador de matriz (ej: "Efluente", "Calidad de Suelo")
 */
function createMatrizHeaderRow(matrizNombre) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 9,
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: matrizNombre,
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Crea una fila de muestreo
 */
function createMuestreoRow(muestreo, numero) {
  // Formatear coordenadas (redondear si son números)
  const norte = muestreo.norte ? String(Math.round(Number(muestreo.norte))) : '';
  const este = muestreo.este ? String(Math.round(Number(muestreo.este))) : '';
  const altitud = muestreo.altitud ? String(Math.round(Number(muestreo.altitud))) : '';

  // Obtener nombre de matriz para la celda
  const matrizNombre = getMatrizDisplayName(muestreo.matriz);

  return new TableRow({
    children: [
      // Nro
      createTableCell(String(numero), { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Código de punto
      createTableCell(muestreo.codigo_punto || '', { 
        alignment: AlignmentType.LEFT,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Nro. de muestras
      createTableCell(muestreo.nro_muestras || '', { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Matriz
      createTableCell(matrizNombre, { 
        alignment: AlignmentType.LEFT,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Descripción
      createTableCell(muestreo.descripcion || '', { 
        alignment: AlignmentType.JUSTIFIED,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Norte
      createTableCell(norte, { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Este
      createTableCell(este, { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Altitud
      createTableCell(altitud, { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Muestra Dirimente
      createTableCell(muestreo.muestra_dirimente || 'No', { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
    ],
  });
}

/**
 * Mapeo de IDs de matriz a nombres de visualización
 */
const MATRIZ_DISPLAY_NAMES = {
  efluentes: 'Efluente',
  calidad_suelo: 'Suelo',
  ruido_ambiental: 'Ruido',
  calidad_agua: 'Agua',
  calidad_aire: 'Aire',
};

/**
 * Obtiene el nombre de visualización de una matriz
 */
function getMatrizDisplayName(matrizId) {
  if (!matrizId) return '';
  return MATRIZ_DISPLAY_NAMES[matrizId] || matrizId;
}

/**
 * Mapeo de IDs de matriz a nombres de grupo
 */
const MATRIZ_GROUP_NAMES = {
  efluentes: 'Efluente',
  calidad_suelo: 'Calidad de Suelo',
  ruido_ambiental: 'Ruido Ambiental',
  calidad_agua: 'Calidad de Agua',
  calidad_aire: 'Calidad de Aire',
};

/**
 * Obtiene el nombre del grupo de matriz para el header
 */
function getMatrizGroupName(matrizId) {
  if (!matrizId) return 'Sin asignar';
  return MATRIZ_GROUP_NAMES[matrizId] || matrizId;
}

/**
 * Agrupa muestreos por matriz y los ordena según el orden predefinido
 */
function agruparPorMatriz(muestreos) {
  // Orden predefinido de matrices
  const ordenMatrices = ['efluentes', 'calidad_suelo', 'ruido_ambiental', 'calidad_agua', 'calidad_aire'];
  
  const grupos = new Map();

  muestreos.forEach((m) => {
    const matriz = m.matriz || 'sin_asignar';
    
    if (!grupos.has(matriz)) {
      grupos.set(matriz, []);
    }
    grupos.get(matriz).push(m);
  });

  // Ordenar grupos según el orden predefinido
  const gruposOrdenados = [];
  
  // Primero agregar matrices conocidas en orden
  ordenMatrices.forEach(matrizId => {
    if (grupos.has(matrizId)) {
      gruposOrdenados.push({
        matrizId,
        nombre: getMatrizGroupName(matrizId),
        muestreos: grupos.get(matrizId)
      });
    }
  });
  
  // Luego agregar cualquier matriz desconocida
  grupos.forEach((muestreos, matrizId) => {
    if (!ordenMatrices.includes(matrizId) && matrizId !== 'sin_asignar') {
      gruposOrdenados.push({
        matrizId,
        nombre: getMatrizGroupName(matrizId),
        muestreos
      });
    }
  });
  
  // Finalmente agregar "sin asignar" si existe
  if (grupos.has('sin_asignar')) {
    gruposOrdenados.push({
      matrizId: 'sin_asignar',
      nombre: 'Sin asignar',
      muestreos: grupos.get('sin_asignar')
    });
  }

  return gruposOrdenados;
}

/**
 * Crea la sección completa de Muestreo Ambiental
 * @param {Array} muestreos - Array de muestreos del acta
 * @returns {Table} Tabla de muestreo ambiental
 */
export function createMuestreoAmbientalSection(muestreos = []) {
  // Si no hay muestreos, retornar tabla vacía con mensaje
  if (!muestreos || muestreos.length === 0) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        createSectionTitleRow(),
        ...createColumnHeaderRows(),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 9,
              margins: CELL_MARGINS,
              borders: ALL_BORDERS,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'No se realizó muestreo ambiental durante la supervisión',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                      italics: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  // Agrupar muestreos por matriz
  const grupos = agruparPorMatriz(muestreos);

  // Construir filas de la tabla
  const rows = [
    createSectionTitleRow(),
    ...createColumnHeaderRows(),
  ];

  // Numeración global de muestreos
  let numeroGlobal = 1;

  // Iterar por cada grupo de matriz
  for (const grupo of grupos) {
    // Agregar fila de encabezado de matriz
    rows.push(createMatrizHeaderRow(grupo.nombre));

    // Agregar filas de muestreos
    for (const muestreo of grupo.muestreos) {
      rows.push(createMuestreoRow(muestreo, numeroGlobal));
      numeroGlobal++;
    }
  }

  // Crear y retornar la tabla
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export default {
  createMuestreoAmbientalSection,
};
