/**
 * Secciones de firmas para el acta:
 * - Sección 8: Personal del Administrado
 * - Sección 9: Equipo Supervisor
 * - Sección 10: Otros participantes
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

// Márgenes internos para celdas
const CELL_MARGINS = {
  top: 60,
  bottom: 60,
  left: 80,
  right: 80,
};

// Estilo de borde
const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

/**
 * Crea una tablita de firma individual (con espacio para firma arriba)
 * @param {Object} data - Datos opcionales { nombre, dni, cargo/colegiatura }
 * @param {string} tercerCampoLabel - Etiqueta del tercer campo ('Cargo' o 'Nro. Colegiatura')
 * @returns {Table} Tabla de firma
 */
function createFirmaTable(data = {}, tercerCampoLabel = 'Cargo') {
  const { nombre = '', dni = '', tercerCampo = '' } = data;
  
  // Altura para espacio de firma (aproximadamente 2cm)
  const FIRMA_HEIGHT = { value: 800, rule: HeightRule.EXACT };
  const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST };
  
  // Anchos de columnas en twips: etiqueta (1500) + valor (3000) = 4500 total por tabla
  const COL_LABEL = 1500;
  const COL_VALUE = 3000;
  
  const rows = [
    // Fila de espacio para firma (vacía, solo bordes laterales y superior)
    new TableRow({
      height: FIRMA_HEIGHT,
      children: [
        new TableCell({
          columnSpan: 2,
          margins: CELL_MARGINS,
          borders: {
            top: borderStyle,
            bottom: noBorder,
            left: borderStyle,
            right: borderStyle,
          },
          children: [new Paragraph({ children: [] })],
        }),
      ],
    }),
    // Fila: Apellidos y Nombres
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        new TableCell({
          width: { size: COL_LABEL, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: 'Apellidos y Nombres',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: COL_VALUE, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: nombre,
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    // Fila: DNI
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        new TableCell({
          width: { size: COL_LABEL, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: 'DNI',
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: COL_VALUE, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: dni,
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    // Fila: Cargo o Colegiatura
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        new TableCell({
          width: { size: COL_LABEL, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: tercerCampoLabel,
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: COL_VALUE, type: WidthType.DXA },
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
              children: [
                new TextRun({
                  text: tercerCampo,
                  font: FONT_FAMILY,
                  size: FONT_SIZE.NORMAL,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];

  return new Table({
    width: { size: COL_LABEL + COL_VALUE, type: WidthType.DXA },
    columnWidths: [COL_LABEL, COL_VALUE],
    rows,
  });
}

/**
 * Crea una fila con dos tablitas de firma lado a lado
 * @param {Table} tabla1 - Primera tabla de firma
 * @param {Table} tabla2 - Segunda tabla de firma (opcional)
 * @returns {Table} Tabla contenedora con las dos tablitas
 */
function createFilaDosFirmas(tabla1, tabla2 = null) {
  // Crear una tabla contenedora con dos celdas sin bordes
  const children1 = tabla1 ? [tabla1] : [new Paragraph({ children: [] })];
  const children2 = tabla2 ? [tabla2] : [new Paragraph({ children: [] })];
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4800, 4800], // Anchos fijos en twips (aprox 50% cada uno)
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: noBorder,
              bottom: noBorder,
              left: noBorder,
              right: noBorder,
            },
            margins: { top: 0, bottom: 0, left: 0, right: 200 },
            children: children1,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: noBorder,
              bottom: noBorder,
              left: noBorder,
              right: noBorder,
            },
            margins: { top: 0, bottom: 0, left: 200, right: 0 },
            children: children2,
          }),
        ],
      }),
    ],
  });
}

/**
 * Sección 8: Personal del Administrado
 * Genera tablitas de firma vacías según la cantidad especificada
 * @param {number} cantidad - Cantidad de espacios para firma
 * @returns {Array} Array de elementos docx
 */
export function createPersonalAdministradoSection(cantidad = 2) {
  const elements = [];
  
  // Título de la sección
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 340, rule: HeightRule.ATLEAST },
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
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '8.   Personal del Administrado',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  
  // Espacio después del título
  elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
  
  // Generar tablitas de firma en pares (2 por fila)
  const tablas = [];
  for (let i = 0; i < cantidad; i++) {
    tablas.push(createFirmaTable({}, 'Cargo'));
  }
  
  // Agrupar de 2 en 2
  for (let i = 0; i < tablas.length; i += 2) {
    const tabla1 = tablas[i];
    const tabla2 = tablas[i + 1] || null;
    elements.push(createFilaDosFirmas(tabla1, tabla2));
    // Espacio entre filas de firmas
    if (i + 2 < tablas.length) {
      elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
    }
  }
  
  // Párrafo vacío al final
  elements.push(new Paragraph({ children: [] }));
  
  return elements;
}

/**
 * Sección 9: Equipo Supervisor
 * Genera tablitas de firma con datos de los supervisores
 * @param {Array} supervisores - Array de supervisores { apellidos_nombres, dni, num_colegiatura }
 * @returns {Array} Array de elementos docx
 */
export function createEquipoSupervisorFirmasSection(supervisores = []) {
  const elements = [];
  
  // Título de la sección
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 340, rule: HeightRule.ATLEAST },
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
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '9.   Equipo Supervisor',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  
  // Espacio después del título
  elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
  
  // Si no hay supervisores, mostrar mensaje vacío
  if (supervisores.length === 0) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '[Sin supervisores asignados]',
            font: FONT_FAMILY,
            size: FONT_SIZE.NORMAL,
            italics: true,
            color: '666666',
          }),
        ],
      })
    );
  } else {
    // Generar tablitas de firma con datos de supervisores
    const tablas = supervisores.map(sup => 
      createFirmaTable({
        nombre: sup.apellidos_nombres || '',
        dni: sup.dni || '',
        tercerCampo: sup.num_colegiatura || '',
      }, 'Nro. Colegiatura')
    );
    
    // Agrupar de 2 en 2
    for (let i = 0; i < tablas.length; i += 2) {
      const tabla1 = tablas[i];
      const tabla2 = tablas[i + 1] || null;
      elements.push(createFilaDosFirmas(tabla1, tabla2));
      // Espacio entre filas de firmas
      if (i + 2 < tablas.length) {
        elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
      }
    }
  }
  
  // Párrafo vacío al final
  elements.push(new Paragraph({ children: [] }));
  
  return elements;
}

/**
 * Sección 10: Otros participantes
 * Genera tablitas de firma vacías (por defecto 2)
 * @param {number} cantidad - Cantidad de espacios para firma (por defecto 2)
 * @returns {Array} Array de elementos docx
 */
export function createOtrosParticipantesSection(cantidad = 2) {
  const elements = [];
  
  // Título de la sección
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 340, rule: HeightRule.ATLEAST },
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
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '10.   Otros participantes (Peritos, técnicos, testigos, fiscales, etc.)',
                      font: FONT_FAMILY,
                      size: FONT_SIZE.NORMAL,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  
  // Espacio después del título
  elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
  
  // Generar tablitas de firma vacías
  const tablas = [];
  for (let i = 0; i < cantidad; i++) {
    tablas.push(createFirmaTable({}, 'Cargo'));
  }
  
  // Agrupar de 2 en 2
  for (let i = 0; i < tablas.length; i += 2) {
    const tabla1 = tablas[i];
    const tabla2 = tablas[i + 1] || null;
    elements.push(createFilaDosFirmas(tabla1, tabla2));
    // Espacio entre filas de firmas
    if (i + 2 < tablas.length) {
      elements.push(new Paragraph({ spacing: { before: 200, after: 100 } }));
    }
  }
  
  // Párrafo vacío al final
  elements.push(new Paragraph({ children: [] }));
  
  return elements;
}
