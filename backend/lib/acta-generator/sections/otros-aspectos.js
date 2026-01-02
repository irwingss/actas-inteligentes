/**
 * Sección 6: Otros Aspectos
 * Documentación de aspectos observados durante la supervisión que no constituyen hechos verificados
 * pero que son relevantes de registrar como observaciones complementarias.
 * Las fotos se muestran inline como "evidencias" (no medios probatorios).
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
    ImageRun,
    TableLayoutType,
} from 'docx';
import imageSize from 'image-size';

import { FONT_FAMILY, FONT_SIZE, COLORS } from '../config.js';
import { parseHtmlToDocxParagraphs } from '../helpers.js';

// Estilos de borde
const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const NO_BORDER = { style: BorderStyle.NIL };
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

// Márgenes cero para celdas de imagen (para que ocupen todo el espacio)
const ZERO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

// Dimensiones máximas para fotos (2 por fila)
// Cálculo: Página 8.5" - márgenes 1.5" = 7" disponible = 504 pts
// Cada celda de 4 columnas = 252 pts (ancho completo de celda)
const CELL_WIDTH_4COL_TWIPS = 5000;
const DOCX_IMAGE_DPI = 96;
const TWIPS_PER_INCH = 1440;
const CELL_WIDTH_4COL_PX = Math.floor((CELL_WIDTH_4COL_TWIPS * DOCX_IMAGE_DPI) / TWIPS_PER_INCH);
const IMAGE_MAX_WIDTH_4COL = CELL_WIDTH_4COL_PX - 8;
const MAX_IMAGE_HEIGHT = 220;     // Alto máximo para fotos verticales (portrait)

/**
 * Crea la sección de Otros Aspectos
 * @param {Object} otrosAspectos - Datos de otros aspectos
 * @param {string} otrosAspectos.descripcion - Descripción HTML
 * @param {Array} otrosAspectos.fotos - Fotos seleccionadas
 * @returns {Array} Array con el título y la tabla
 */
export function createOtrosAspectosSection(otrosAspectos = {}) {
    const { descripcion = '', fotos = [] } = otrosAspectos;
    
    // Si no hay contenido, devolver sección vacía con espacio para rellenar
    const tieneContenido = descripcion && descripcion.trim().length > 0;
    
    // Parsear HTML a párrafos de docx
    let contenidoParagraphs = [];
    if (tieneContenido) {
        try {
            contenidoParagraphs = parseHtmlToDocxParagraphs(descripcion);
        } catch (e) {
            console.warn('[otros-aspectos] Error parseando HTML:', e);
            contenidoParagraphs = [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: descripcion.replace(/<[^>]*>/g, ''), // Fallback: strip HTML
                            font: FONT_FAMILY,
                            size: FONT_SIZE.NORMAL,
                        }),
                    ],
                }),
            ];
        }
    }
    
    // Crear filas de la tabla
    const rows = [
        // Fila 1: Título de la sección
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    margins: CELL_MARGINS,
                    borders: ALL_BORDERS,
                    shading: { type: ShadingType.SOLID, color: COLORS.GRAY_SHADING },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.LEFT,
                            children: [
                                new TextRun({
                                    text: '6.\tOtros Aspectos',
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
    ];
    
    // Fila 2: Contenido o espacio vacío
    if (tieneContenido && contenidoParagraphs.length > 0) {
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        margins: CELL_MARGINS,
                        borders: ALL_BORDERS,
                        verticalAlign: VerticalAlign.TOP,
                        children: contenidoParagraphs,
                    }),
                ],
            })
        );
    } else {
        // Espacio vacío para llenar manualmente
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        margins: CELL_MARGINS,
                        borders: ALL_BORDERS,
                        verticalAlign: VerticalAlign.TOP,
                        children: [
                            new Paragraph({ spacing: { before: 60 } }),
                            new Paragraph({}),
                            new Paragraph({}),
                            new Paragraph({}),
                            new Paragraph({ spacing: { after: 60 } }),
                        ],
                    }),
                ],
            })
        );
    }
    
    // Si hay fotos, agregar "Las evidencias se muestran a continuación:"
    if (fotos && fotos.length > 0) {
        // Fila introductoria
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        margins: CELL_MARGINS,
                        borders: ALL_BORDERS,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                spacing: { before: 100, after: 100 },
                                children: [
                                    new TextRun({
                                        text: 'Las evidencias se muestran a continuación:',
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
    }
    
    const mainTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [10000], // Una sola columna que ocupa todo el ancho (en twips)
        rows,
    });

    const elements = [
        // Espacio antes de la sección
        new Paragraph({ spacing: { before: 300, after: 100 } }),
        mainTable,
    ];
    
    // Si hay fotos, agregar tabla de fotos separada (8 columnas)
    if (fotos && fotos.length > 0) {
        const fotosRows = createEvidenciasRows(fotos, 1);
        const fotosTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            // 8 columnas de igual ancho (1250 twips cada una = 10000 total)
            columnWidths: [1250, 1250, 1250, 1250, 1250, 1250, 1250, 1250],
            rows: fotosRows,
        });
        elements.push(fotosTable);
    }

    return elements;
}

/**
 * Crea las filas de evidencias fotográficas (2 fotos por fila)
 * Incluye: título, imagen, descripción, coordenadas
 * @param {Array} fotos - Array de fotos con imageBuffer, descripcion, coordenadas, etc.
 * @param {number} startIndex - Índice inicial para numeración
 * @returns {Array<TableRow>} Filas para la tabla
 */
function createEvidenciasRows(fotos = [], startIndex = 1) {
    const tableRows = [];
    
    // Procesar fotos en pares (2 por fila)
    for (let i = 0; i < fotos.length; i += 2) {
        const foto1 = fotos[i];
        const foto2 = fotos[i + 1]; // Puede ser undefined si es impar
        const figNum1 = startIndex + i;
        const figNum2 = startIndex + i + 1;
        
        // Fila 1: Títulos (Figura N° X. Componente)
        tableRows.push(createEvidenciaTitleRow(foto1, foto2, figNum1, figNum2));
        
        // Fila 2: Imágenes
        tableRows.push(createEvidenciaImageRow(foto1, foto2));
        
        // Fila 3: Descripciones
        tableRows.push(createEvidenciaDescriptionRow(foto1, foto2));
        
        // Filas 4-5: Coordenadas UTM
        const coordRows = createEvidenciaCoordenadasRows(foto1, foto2);
        tableRows.push(...coordRows);
    }
    
    return tableRows;
}

/**
 * Crea celda vacía con columnSpan
 */
function createEmptyCell(columnSpan, borders = {}) {
    return new TableCell({
        columnSpan,
        borders: borders,
        children: [new Paragraph({})],
    });
}

/**
 * Crea fila de títulos para evidencias
 * Foto impar siempre ocupa 4 columnas (un lado)
 */
function createEvidenciaTitleRow(foto1, foto2, figNum1, figNum2) {
    const componente1 = foto1?.componente || 'Vista general';
    const componente2 = foto2?.componente || 'Vista general';
    
    const children = [
        // Foto 1 siempre ocupa 4 columnas
        new TableCell({
            columnSpan: 4,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
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
    
    if (foto2) {
        children.push(
            new TableCell({
                columnSpan: 4,
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
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
        // Celda vacía sin bordes para completar las 8 columnas
        children.push(createEmptyCell(4, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }));
    }
    
    return new TableRow({ children });
}

/**
 * Crea fila de imágenes para evidencias
 * Foto impar siempre ocupa 4 columnas (un lado)
 */
function createEvidenciaImageRow(foto1, foto2) {
    const children = [
        createEvidenciaImageCell(foto1, 4),
    ];
    
    if (foto2) {
        children.push(createEvidenciaImageCell(foto2, 4));
    } else {
        // Celda vacía sin bordes para completar las 8 columnas
        children.push(createEmptyCell(4, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }));
    }
    
    return new TableRow({ children });
}

/**
 * Crea celda con imagen individual
 * @param {Object} foto - Objeto foto con imageBuffer
 * @param {number} colSpan - Número de columnas a ocupar (4 o 8)
 */
function createEvidenciaImageCell(foto, colSpan = 4) {
    const imagenChildren = [];
    
    if (foto?.imageBuffer) {
        let imgWidth = IMAGE_MAX_WIDTH_4COL;
        let imgHeight = MAX_IMAGE_HEIGHT;
        
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
                imgHeight = MAX_IMAGE_HEIGHT;
                imgWidth = Math.round(MAX_IMAGE_HEIGHT * aspectRatio);
            }
        } catch (err) {
            console.warn(`[otros-aspectos] No se pudo detectar dimensiones:`, err.message);
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
        columnSpan: colSpan,
        verticalAlign: VerticalAlign.CENTER,
        borders: ALL_BORDERS,
        // Márgenes cero para que la imagen horizontal ocupe todo el ancho de celda
        margins: ZERO_MARGINS,
        children: imagenChildren,
    });
}

/**
 * Crea fila de descripciones para evidencias
 * Foto impar siempre ocupa 4 columnas (un lado)
 */
function createEvidenciaDescriptionRow(foto1, foto2) {
    const desc1 = foto1?.descripcion || foto1?.descripcionEditada || '';
    const desc2 = foto2?.descripcion || foto2?.descripcionEditada || '';
    
    const children = [
        new TableCell({
            columnSpan: 4,
            margins: CELL_MARGINS,
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
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
                borders: ALL_BORDERS,
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
    }
    if (!foto2) {
        // Celda vacía sin bordes para completar las 8 columnas
        children.push(createEmptyCell(4, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }));
    }
    
    return new TableRow({ children });
}

/**
 * Crea las 2 filas de coordenadas UTM (headers + valores)
 * Foto impar siempre ocupa 4 columnas (un lado)
 */
function createEvidenciaCoordenadasRows(foto1, foto2) {
    const este1 = foto1?.este || foto1?.x || '';
    const norte1 = foto1?.norte || foto1?.y || '';
    const altitud1 = foto1?.altitud || foto1?.altitude || '';
    
    // Siempre 1 columna por celda (4 columnas por foto)
    const colSpan = 1;
    
    // Fila de headers
    const headerChildren = [
        // Foto 1: Coordenadas UTM (rowSpan 2)
        new TableCell({
            rowSpan: 2,
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
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
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Este', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
        // Norte header
        new TableCell({
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Norte', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
        // Altitud header
        new TableCell({
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Altitud', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
        }),
    ];
    
    // Agregar columnas de foto2 si existe
    if (foto2) {
        const este2 = foto2?.este || foto2?.x || '';
        const norte2 = foto2?.norte || foto2?.y || '';
        const altitud2 = foto2?.altitud || foto2?.altitude || '';
        
        headerChildren.push(
            new TableCell({
                rowSpan: 2,
                margins: CELL_MARGINS,
                verticalAlign: VerticalAlign.CENTER,
                borders: ALL_BORDERS,
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
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Este', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
            }),
            new TableCell({
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Norte', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
            }),
            new TableCell({
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Altitud', font: FONT_FAMILY, size: FONT_SIZE.SMALL, bold: true })] })],
            })
        );
    } else {
        // Celdas vacías sin bordes para completar las 8 columnas (4 celdas para el lado derecho)
        headerChildren.push(
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER })
        );
    }
    
    const headerRow = new TableRow({ children: headerChildren });
    
    // Fila de valores
    const valueChildren = [
        // Foto 1 valores (la celda UTM ya tiene rowSpan)
        new TableCell({
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(este1) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
        new TableCell({
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(norte1) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
        new TableCell({
            columnSpan: colSpan,
            margins: CELL_MARGINS,
            borders: ALL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(altitud1) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
        }),
    ];
    
    // Agregar valores de foto2 si existe, o celdas vacías
    if (foto2) {
        const este2 = foto2?.este || foto2?.x || '';
        const norte2 = foto2?.norte || foto2?.y || '';
        const altitud2 = foto2?.altitud || foto2?.altitude || '';
        
        valueChildren.push(
            new TableCell({
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(este2) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
            }),
            new TableCell({
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(norte2) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
            }),
            new TableCell({
                margins: CELL_MARGINS,
                borders: ALL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(altitud2) || '-', font: FONT_FAMILY, size: FONT_SIZE.SMALL })] })],
            })
        );
    } else {
        // Celdas vacías sin bordes para completar las 8 columnas
        valueChildren.push(
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }),
            createEmptyCell(1, { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER })
        );
    }
    
    const valueRow = new TableRow({ children: valueChildren });
    
    return [headerRow, valueRow];
}

export default {
    createOtrosAspectosSection,
};
