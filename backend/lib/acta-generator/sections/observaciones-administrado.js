/**
 * Sección 5: Observaciones del Administrado
 * Tabla de una sola columna con dos filas:
 * - Primera fila: Título
 * - Segunda fila: Espacio en blanco para observaciones
 */
import {
    Table,
    TableRow,
    TableCell,
    Paragraph,
    TextRun,
    WidthType,
    BorderStyle,
    AlignmentType,
    VerticalAlign,
    ShadingType,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';

// Estilos de borde (igual que en componentes-supervisados.js)
const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const ALL_BORDERS = {
    top: BORDER_STYLE,
    bottom: BORDER_STYLE,
    left: BORDER_STYLE,
    right: BORDER_STYLE,
};

// Márgenes de celda (igual que en componentes-supervisados.js)
const CELL_MARGINS = {
    top: 40,
    bottom: 40,
    left: 60,
    right: 60,
};

/**
 * Crea la sección de Observaciones del Administrado
 * @returns {Array} Array con el título y la tabla
 */
export function createObservacionesAdministradoSection() {
    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            // Fila 1: Título de la sección (con el mismo estilo que otras secciones)
            new TableRow({
                children: [
                    new TableCell({
                        margins: CELL_MARGINS,
                        borders: ALL_BORDERS,
                        shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [
                                    new TextRun({
                                        text: '5.\tObservaciones del Administrado',
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
            // Fila 2: Espacio en blanco para observaciones (con 5 líneas vacías)
            new TableRow({
                children: [
                    new TableCell({
                        margins: CELL_MARGINS,
                        borders: ALL_BORDERS,
                        verticalAlign: VerticalAlign.TOP,
                        children: [
                            new Paragraph({ spacing: { before: 60 } }),
                            new Paragraph({}),
                            new Paragraph({}),
                            new Paragraph({}),
                            new Paragraph({}),
                            new Paragraph({ spacing: { after: 60 } }),
                        ],
                    }),
                ],
            }),
        ],
    });

    return [
        // Espacio antes de la sección
        new Paragraph({ spacing: { before: 300, after: 100 } }),
        table,
    ];
}

export default {
    createObservacionesAdministradoSection,
};
