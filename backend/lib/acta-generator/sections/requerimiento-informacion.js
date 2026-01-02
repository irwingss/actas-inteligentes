/**
 * Sección 7: Requerimiento de Información del Administrado
 * Tabla con N° de Hecho, Descripción y Plazo (días hábiles)
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
  VerticalAlign,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';
import { parseHtmlToDocxParagraphs } from '../helpers.js';

// Márgenes internos para celdas
const CELL_MARGINS = {
  top: 80,
  bottom: 80,
  left: 100,
  right: 100,
};

// Altura mínima de fila
const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST };

// Estilo de borde
const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };

/**
 * Crea la tabla de Requerimiento de Información (Tabla 7)
 * @param {Array} requerimientos - Array de {numero_hecho, descripcion, plazo}
 * @returns {Array} Array de elementos para el documento
 */
export function createRequerimientoInformacionSection(requerimientos = []) {
  const elements = [];

  // Título de la sección (7. Requerimiento de Información)
  const titleRow = new TableRow({
    height: ROW_HEIGHT,
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
                text: '7.   Requerimiento de Información',
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

  // Anchos de columna en twips (1 inch = 1440 twips, página ~10000 twips)
  // N° Hecho: 800, Descripción: 7800, Plazo: 1400
  const COL_WIDTH_HECHO = 1000;
  const COL_WIDTH_DESC = 7600;
  const COL_WIDTH_PLAZO = 1400;

  // Fila de encabezados
  const headerRow = new TableRow({
    height: ROW_HEIGHT,
    children: [
      new TableCell({
        width: { size: COL_WIDTH_HECHO, type: WidthType.DXA },
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
                text: 'N° de Hecho',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: COL_WIDTH_DESC, type: WidthType.DXA },
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
                text: 'Descripción',
                font: FONT_FAMILY,
                size: FONT_SIZE.NORMAL,
                bold: true,
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: COL_WIDTH_PLAZO, type: WidthType.DXA },
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
                text: 'Plazo (días hábiles)',
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

  // Filas de datos
  const dataRows = [];
  
  if (requerimientos.length === 0) {
    // Fila placeholder si no hay requerimientos
    dataRows.push(
      new TableRow({
        height: ROW_HEIGHT,
        children: [
          new TableCell({
            columnSpan: 3,
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
                    text: '[Sin requerimientos de información]',
                    font: FONT_FAMILY,
                    size: FONT_SIZE.NORMAL,
                    italics: true,
                    color: '808080',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    // Crear filas para cada requerimiento
    requerimientos.forEach((req) => {
      dataRows.push(
        new TableRow({
          height: ROW_HEIGHT,
          children: [
            // N° de Hecho
            new TableCell({
              width: { size: COL_WIDTH_HECHO, type: WidthType.DXA },
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
                      text: String(req.numero_hecho || ''),
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                    }),
                  ],
                }),
              ],
            }),
            // Descripción (soporta HTML/texto enriquecido)
            new TableCell({
              width: { size: COL_WIDTH_DESC, type: WidthType.DXA },
              margins: CELL_MARGINS,
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              verticalAlign: VerticalAlign.TOP,
              children: req.descripcion 
                ? parseHtmlToDocxParagraphs(req.descripcion, { alignment: AlignmentType.JUSTIFIED })
                : [new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    children: [new TextRun({ text: '', font: FONT_FAMILY, size: FONT_SIZE.NORMAL })],
                  })],
            }),
            // Plazo
            new TableCell({
              width: { size: COL_WIDTH_PLAZO, type: WidthType.DXA },
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
                      text: req.plazo ? String(req.plazo) : '',
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

  // Crear tabla con ancho fijo total
  elements.push(
    new Table({
      width: { size: COL_WIDTH_HECHO + COL_WIDTH_DESC + COL_WIDTH_PLAZO, type: WidthType.DXA },
      layout: 'fixed',
      rows: [titleRow, headerRow, ...dataRows],
    })
  );

  // Párrafo vacío después de la tabla
  elements.push(new Paragraph({ children: [] }));

  return elements;
}

export default {
  createRequerimientoInformacionSection,
};
