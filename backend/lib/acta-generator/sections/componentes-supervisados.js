/**
 * Sección: Componentes Supervisados del Acta de Supervisión
 * Tabla agrupada por Instalación de Referencia
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
  FootnoteReferenceRun,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';

// Anchos de columna para la tabla de componentes (%)
// Nro | Componentes de la unidad fiscalizable | Norte | Este | Altitud | Descripción del componente
const COLUMN_WIDTHS = [5, 25, 10, 10, 8, 42];

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
    margins: CELL_MARGINS,
    borders: ALL_BORDERS,
  };

  if (shading) {
    cellOptions.shading = { type: ShadingType.SOLID, color: shading };
  }

  return new TableCell(cellOptions);
}

/**
 * Crea la fila de encabezado principal "Componentes supervisados"
 */
function createMainHeaderRow() {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 6,
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: '3.\tComponentes supervisados',
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
 * Crea la fila de encabezados de columna con sub-header para coordenadas
 */
function createColumnHeaderRows() {
  // Primera fila: encabezados principales con "Coordenadas UTM - WGS 84" ocupando 2 columnas
  const headerRow1 = new TableRow({
    children: [
      // Nro (rowSpan 2)
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
                text: 'Nro',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Componentes de la unidad fiscalizable (rowSpan 2)
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
                text: 'Componentes de la unidad fiscalizable',
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
        width: { size: COLUMN_WIDTHS[2] + COLUMN_WIDTHS[3], type: WidthType.PERCENTAGE },
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
                text: 'Altitud',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      // Descripción del componente (rowSpan 2) con footnote real de Word
      new TableCell({
        rowSpan: 2,
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
                text: 'Descripción del componente',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
              // Footnote real de Word que sigue la numeración automática
              new FootnoteReferenceRun(1),
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
 * Crea una fila de separador de instalación (ej: "Batería 1")
 */
function createInstalacionRow(instalacionNombre) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 6,
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: instalacionNombre,
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
 * Crea una fila de componente
 */
function createComponenteRow(componente, numero) {
  // Formatear nombre del componente: "Tipo - Nombre" o solo "Nombre"
  let nombreComponente = componente.componente || '';
  if (componente.tipo_componente && componente.tipo_componente !== nombreComponente) {
    nombreComponente = `${componente.tipo_componente} - ${componente.componente}`;
  }

  // Formatear coordenadas (redondear si son números)
  const norte = componente.norte ? String(Math.round(Number(componente.norte))) : '';
  const este = componente.este ? String(Math.round(Number(componente.este))) : '';
  const altitud = componente.altitud ? String(Math.round(Number(componente.altitud))) : '';

  return new TableRow({
    children: [
      // Nro
      createTableCell(String(numero), { 
        alignment: AlignmentType.CENTER,
        fontSize: FONT_SIZE.NORMAL,
      }),
      // Componente
      createTableCell(nombreComponente, { 
        alignment: AlignmentType.LEFT,
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
      // Descripción
      createTableCell(componente.descripcion || '', { 
        alignment: AlignmentType.JUSTIFIED,
        fontSize: FONT_SIZE.NORMAL,
      }),
    ],
  });
}

/**
 * Agrupa componentes por instalación de referencia
 * Separa componentes marinos para ponerlos al final en su propia sección
 */
function agruparPorInstalacion(componentes) {
  // Separar marinos de terrestres
  // Nota: SQLite devuelve 0/1 como INTEGER, convertir explícitamente a booleano
  const terrestres = componentes.filter(c => !c.es_marino || c.es_marino === 0 || c.es_marino === '0');
  const marinos = componentes.filter(c => c.es_marino && c.es_marino !== 0 && c.es_marino !== '0');
  
  const grupos = new Map();

  // Agrupar terrestres
  terrestres.forEach((comp) => {
    // Usar instalacion_referencia o "Otros" si está vacío
    const instalacion = comp.instalacion_referencia?.trim() || 'Otros';
    
    // Normalizar: capitalizar cada palabra
    const instalacionNormalizada = instalacion
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    if (!grupos.has(instalacionNormalizada)) {
      grupos.set(instalacionNormalizada, []);
    }
    grupos.get(instalacionNormalizada).push(comp);
  });

  // Ordenar componentes dentro de cada grupo por tipo_componente y luego por componente
  grupos.forEach((comps) => {
    comps.sort((a, b) => {
      const tipoCompare = (a.tipo_componente || '').localeCompare(b.tipo_componente || '');
      if (tipoCompare !== 0) return tipoCompare;
      return (a.componente || '').localeCompare(b.componente || '');
    });
  });

  // Agrupar marinos por instalación de referencia (se agregarán al final)
  const gruposMarinos = new Map();
  marinos.forEach((comp) => {
    const instalacion = comp.instalacion_referencia?.trim() || 'Otros';
    const instalacionNormalizada = instalacion
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    if (!gruposMarinos.has(instalacionNormalizada)) {
      gruposMarinos.set(instalacionNormalizada, []);
    }
    gruposMarinos.get(instalacionNormalizada).push(comp);
  });

  // Ordenar componentes marinos dentro de cada grupo
  gruposMarinos.forEach((comps) => {
    comps.sort((a, b) => {
      const tipoCompare = (a.tipo_componente || '').localeCompare(b.tipo_componente || '');
      if (tipoCompare !== 0) return tipoCompare;
      return (a.componente || '').localeCompare(b.componente || '');
    });
  });

  return { terrestres: grupos, marinos: gruposMarinos };
}

/**
 * Crea una fila de título de sección (ej: "Instalaciones en el mar")
 */
function createSeccionTitleRow(titulo) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 6,
        margins: CELL_MARGINS,
        borders: ALL_BORDERS,
        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: titulo,
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
 * Crea la sección completa de Componentes Supervisados
 * @param {Array} componentes - Array de componentes del acta
 * @returns {Table} Tabla de componentes supervisados
 */
export function createComponentesSupervisadosSection(componentes = []) {
  // Si no hay componentes, retornar tabla vacía con mensaje
  if (!componentes || componentes.length === 0) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        createMainHeaderRow(),
        ...createColumnHeaderRows(),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 6,
              margins: CELL_MARGINS,
              borders: ALL_BORDERS,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'No se registraron componentes supervisados',
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

  // Agrupar componentes por instalación (separa terrestres y marinos)
  const { terrestres, marinos } = agruparPorInstalacion(componentes);

  // Construir filas de la tabla
  const rows = [
    createMainHeaderRow(),
    ...createColumnHeaderRows(),
  ];

  // Numeración global de componentes (continua entre terrestres y marinos)
  let numeroGlobal = 1;

  // Iterar por cada grupo de instalación TERRESTRE
  for (const [instalacion, comps] of terrestres) {
    // Agregar fila de encabezado de instalación
    rows.push(createInstalacionRow(instalacion));

    // Agregar filas de componentes
    for (const comp of comps) {
      rows.push(createComponenteRow(comp, numeroGlobal));
      numeroGlobal++;
    }
  }

  // Si hay componentes marinos, agregar sección "Instalaciones en el mar"
  if (marinos.size > 0) {
    // Agregar título de sección marina
    rows.push(createSeccionTitleRow('Instalaciones en el mar'));
    
    // Iterar por cada grupo de instalación MARINA
    for (const [instalacion, comps] of marinos) {
      // Agregar fila de encabezado de instalación marina
      rows.push(createInstalacionRow(instalacion));

      // Agregar filas de componentes (numeración continua)
      for (const comp of comps) {
        rows.push(createComponenteRow(comp, numeroGlobal));
        numeroGlobal++;
      }
    }
  }

  // Crear y retornar la tabla
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export default {
  createComponentesSupervisadosSection,
};
