/**
 * Header del documento - Imagen institucional + Decenio/Año
 */
import {
  Paragraph,
  Header,
  ImageRun,
  AlignmentType,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS } from './config.js';
import { createTextRun } from './helpers.js';

/**
 * Crea el header del documento con imagen y textos de decenio/año
 * @param {Buffer} headerImageBuffer - Buffer de la imagen del header
 * @param {string} decenio - Texto del decenio
 * @param {string} anio - Texto del año
 * @returns {Header} Header configurado
 */
export function createDocumentHeader(headerImageBuffer, decenio, anio) {
  const headerChildren = [];

  // 1. Imagen del header centrada (solo si existe)
  if (headerImageBuffer) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new ImageRun({
            data: headerImageBuffer,
            transformation: {
              width: 500,
              height: 45,
            },
          }),
        ],
      })
    );
  }

  // 2. Decenio (texto negro, cursiva, centrado)
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 50, after: 0 },
      children: [
        createTextRun(decenio, {
          italic: true,
          color: COLORS.BLACK,
          size: FONT_SIZE.HEADER,
        }),
      ],
    })
  );

  // 3. Año (texto negro, cursiva, centrado)
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [
        createTextRun(anio, {
          italic: true,
          color: COLORS.BLACK,
          size: FONT_SIZE.HEADER,
        }),
      ],
    })
  );

  return new Header({
    children: headerChildren,
  });
}

export default {
  createDocumentHeader,
};
