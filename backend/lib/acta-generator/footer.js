/**
 * Footer del documento - Formato, versión y numeración de páginas
 */
import {
  Paragraph,
  Footer,
  TextRun,
  AlignmentType,
  PageNumber,
  Tab,
  TabStopType,
  TabStopPosition,
  convertInchesToTwip,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE } from './config.js';

/**
 * Crea el footer del documento con formato, versión y numeración
 * @param {Object} options - Opciones de configuración del footer
 * @returns {Footer}
 */
export function createDocumentFooter(options = {}) {
  const {
    formato = 'PM0403-F01',
    version = '03',
    fechaAprobacion = '02/06/2025',
  } = options;

  // Tamaño de fuente pequeño para footer (8pt = 16 half-points)
  const FOOTER_FONT_SIZE = 16;

  return new Footer({
    children: [
      // Línea 1: Formato (izquierda) + Página X de Y (derecha)
      new Paragraph({
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: convertInchesToTwip(6.5), // Posición derecha
          },
        ],
        children: [
          new TextRun({
            text: `Formato ${formato}`,
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
          new TextRun({
            children: [
              new Tab(),
              new TextRun({ text: '' }), // Espacio para tab
            ],
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
          new TextRun({
            text: ' de ',
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
        ],
      }),
      
      // Línea 2: Versión
      new Paragraph({
        children: [
          new TextRun({
            text: `Versión: ${version}`,
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
        ],
      }),
      
      // Línea 3: Fecha de aprobación
      new Paragraph({
        children: [
          new TextRun({
            text: 'Fecha de aprobación: ',
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
          }),
          new TextRun({
            text: fechaAprobacion,
            font: FONT_FAMILY,
            size: FOOTER_FONT_SIZE,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

export default {
  createDocumentFooter,
};
