/**
 * Formato 04 - Estructura de dos columnas (2 fotos por fila), 6 fotos por página,
 * con la descripción debajo de cada foto. Incluye TODAS las fotos por registro.
 */
import { Paragraph, TextRun, AlignmentType, TableCell, VerticalAlign, HeightRule, Table, TableRow, WidthType, BorderStyle } from 'docx';
import path from 'path';
import { createDocument, createImageTable, createImageCell } from '../document-builder.js';

function createFormat04TitleCell(numeroFoto) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `Figura N° ${numeroFoto}`, bold: true, size: 16, font: 'Arial' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    columnSpan: 4,
    verticalAlign: VerticalAlign.CENTER,
    height: { value: 0.8, rule: HeightRule.ATLEAST },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  });
}

function createFormat04DescriptionCell(descripcion) {
  const children = [];
  if (!descripcion) {
    return new TableCell({
      children: [
        new Paragraph({ children: [new TextRun({ text: '', size: 16, font: 'Arial' })], alignment: AlignmentType.LEFT }),
      ],
      verticalAlign: VerticalAlign.TOP,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      },
    });
  }

  let items = [];
  if (descripcion.includes('•')) items = descripcion.split('•').filter((i) => i.trim().length > 0);
  else if (descripcion.includes('-')) items = descripcion.split('-').filter((i) => i.trim().length > 0);
  else if (descripcion.includes('\n')) items = descripcion.split('\n').filter((i) => i.trim().length > 0);
  else items = [descripcion];

  items.forEach((texto) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: '• ', bold: true, size: 16, font: 'Arial' }),
          new TextRun({ text: texto.trim(), size: 16, font: 'Arial' }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 100 },
      })
    );
  });

  return new TableCell({
    children,
    verticalAlign: VerticalAlign.TOP,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  });
}

function createFormat04CoordinatesHeaderCell(zona) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Coordenadas', bold: true, size: 16, font: 'Arial' }),
          new TextRun({ text: 'UTM - WGS84', bold: true, size: 16, font: 'Arial', break: 1 }),
          new TextRun({ text: `Zona ${zona || '18'}`, bold: true, size: 16, font: 'Arial', break: 1 }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    columnSpan: 3,
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  });
}

function createFormat04Table(imageObject, photoNumber) {
  const tableRows = [];
  const titleRow = new TableRow({ children: [createFormat04TitleCell(photoNumber)] });
  tableRows.push(titleRow);

  const meta = imageObject && imageObject.metadata ? imageObject.metadata : {};
  const descripcion = meta.Descripcion || '';
  const norte = meta.Norte || '';
  const este = meta.Este || '';
  const altitud = meta.Altitud || '';
  const altitudRounded = altitud !== '' ? String(parseInt(altitud, 10)) : '';
  const norteRounded = norte !== '' ? parseFloat(norte).toFixed(3) : '';
  const esteRounded = este !== '' ? parseFloat(este).toFixed(3) : '';
  const zonaNum = meta.Zona ? parseInt(meta.Zona, 10) : '';
  const zona = zonaNum ? `${zonaNum}` : '18';

  const descriptionCell = createFormat04DescriptionCell(descripcion);
  descriptionCell.rowSpan = 4;

  let imageCell;
  if (imageObject && imageObject.buffer) {
    imageCell = createImageCell(imageObject.buffer);
  } else if (imageObject && imageObject.imageBuffer) {
    imageCell = createImageCell(imageObject.imageBuffer);
  } else {
    imageCell = new TableCell({
      children: [new Paragraph({ text: 'Imagen no encontrada', alignment: AlignmentType.CENTER })],
      columnSpan: 3,
      verticalAlign: VerticalAlign.CENTER,
    });
  }
  imageCell.columnSpan = 3;

  const contentRow = new TableRow({ children: [descriptionCell, imageCell] });
  tableRows.push(contentRow);

  const coordsHeaderRow = new TableRow({ children: [createFormat04CoordinatesHeaderCell(zona)] });
  tableRows.push(coordsHeaderRow);

  const coordLabelsRow = new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: 'Este', bold: true, size: 16, font: 'Arial' })], alignment: AlignmentType.CENTER }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: 'Norte', bold: true, size: 16, font: 'Arial' })], alignment: AlignmentType.CENTER }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: 'Altitud', bold: true, size: 16, font: 'Arial' }),
              new TextRun({ text: '(m.s.n.m.)', bold: true, size: 16, font: 'Arial', break: 1 }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
    ],
  });
  tableRows.push(coordLabelsRow);

  const coordValuesRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: esteRounded, size: 16, font: 'Arial' })], alignment: AlignmentType.CENTER })],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: norteRounded, size: 16, font: 'Arial' })], alignment: AlignmentType.CENTER })],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: altitudRounded, size: 16, font: 'Arial' })], alignment: AlignmentType.CENTER })],
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
      }),
    ],
  });
  tableRows.push(coordValuesRow);

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [40, 20, 20, 20],
    borders: {
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  });
}

function generateFormat04(metadataObj, imageGroups, startNumber, photoPrefix, descriptionField = 'Descripcion') {
  // Nueva implementación: usar la tabla de 2 columnas y 6 fotos por página
  const doc = createDocument();
  let currentPhotoNumber = startNumber;
  let currentPointNumber = 1; // Contador secuencial de puntos de muestreo
  let hasContent = false;

  try {
    // Log de resumen global
    let totalImagesAll = 0;
    for (const [loc, arr] of imageGroups.entries()) totalImagesAll += Array.isArray(arr) ? arr.length : 0;
    console.log(`[FMT04] Iniciando. Locaciones: ${imageGroups.size}, imágenes totales: ${totalImagesAll}`);
  } catch (_) { /* noop */ }

  for (const [locacion, groupImagePaths] of imageGroups.entries()) {
    if (!groupImagePaths || groupImagePaths.length === 0) continue;
    hasContent = true;

    try {
      console.log(`[FMT04] Locación: ${String(locacion)} -> ${groupImagePaths.length} fotos`);
    } catch (_) { /* noop */ }

    // Lotes de 6 fotos como máximo por página
    for (let i = 0; i < groupImagePaths.length; i += 6) {
      const batch = groupImagePaths.slice(i, i + 6);
      const batchNum = Math.floor(i / 6) + 1;
      const end = Math.min(i + 6, groupImagePaths.length);
      try {
        console.log(`[FMT04]  · Lote ${batchNum}: fotos ${i + 1}-${end} de ${groupImagePaths.length}`);
      } catch (_) { /* noop */ }

      // Encabezado de locación solo en la primera página de cada locación
      const children = [];
      if (i === 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `LOCACIÓN ${String(locacion || '').toUpperCase()}` , bold: true, size: 16, font: 'Arial' }),
            ],
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 200 } })
        );
      }

      // Construir la tabla de 2 columnas con descripción debajo de cada foto
      // Resolver descripción por foto priorizando el N de "fotoN-*" del nombre ORIGINAL (Survey123)
      const batchStartOffset = i; // 0-based dentro del grupo completo
      const descriptionResolver = (imageObj, batchIndex) => {
        const meta = (imageObj && imageObj.metadata) ? imageObj.metadata : {};
        // 1) Intentar extraer N desde el nombre de archivo original: fotoN-xxxx.jpg => descripcion_fNN
        try {
          const base = imageObj && imageObj.path ? path.basename(imageObj.path) : '';
          if (base) {
            const m = base.toLowerCase().match(/\bfoto\s*[-_ ]*\s*(\d{1,2})/i);
            if (m) {
              const nn = String(parseInt(m[1], 10)).padStart(2, '0');
              const candidates = [`Descripcion_f${nn}`, `descripcion_f${nn}`];
              for (const k of Object.keys(meta)) {
                const kl = k.toLowerCase();
                if (kl === candidates[0].toLowerCase() || kl === candidates[1].toLowerCase()) {
                  return meta[k] || '';
                }
              }
            }
          }
        } catch (_) { /* noop */ }

        // 2) Fallback: usar el índice real dentro del grupo (1-based) => Descripcion_fXX
        const realIndex = batchStartOffset + (Number(batchIndex) || 0) + 1; // 1-based
        const two = String(realIndex).padStart(2, '0');
        const keyExact = `Descripcion_f${two}`;
        if (keyExact in meta) return meta[keyExact] || '';
        const lower = keyExact.toLowerCase();
        for (const k of Object.keys(meta)) {
          if (k.toLowerCase() === lower) return meta[k] || '';
        }

        // 3) Último recurso: campos genéricos
        return meta.Descripcion || meta.descripcion || '';
      };

      let table, lastPhotoNumber, lastPointNumber;
      try {
        console.time(`[FMT04] build-table ${String(locacion)} #${batchNum}`);
      } catch (_) { /* noop */ }
      const result = createImageTable(
        batch,
        currentPhotoNumber,
        photoPrefix,
        descriptionResolver,
        currentPointNumber
      );
      ({ table, lastPhotoNumber, lastPointNumber } = result);
      try {
        console.timeEnd(`[FMT04] build-table ${String(locacion)} #${batchNum}`);
      } catch (_) { /* noop */ }

      children.push(table);

      // Agregar como nueva sección para forzar salto de página entre lotes (6 por página)
      doc.addSection({ properties: {}, children });

      // Actualizar correlativos
      currentPhotoNumber = lastPhotoNumber;
      currentPointNumber = lastPointNumber;
    }
  }

  return { doc, hasContent };
}

export {  generateFormat04  };
