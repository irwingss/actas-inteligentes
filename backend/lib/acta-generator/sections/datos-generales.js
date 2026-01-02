/**
 * Sección 1: Datos Generales del Acta de Supervisión
 */
import {
  Table,
  TableRow,
  WidthType,
  AlignmentType,
  TextRun,
  HeightRule,
} from 'docx';

import { FONT_FAMILY, FONT_SIZE, COLORS, COLUMN_WIDTHS } from '../config.js';
import { 
  createCell, 
  createLabelCell, 
  createValueCell,
  parseFechaHora,
} from '../helpers.js';

/**
 * Genera la tabla de Datos Generales (Sección 1)
 * @param {Object} borrador - Datos del borrador del acta
 * @returns {Table}
 */
export function createDatosGeneralesTable(borrador) {
  // Parsear equipos GPS
  let equiposGPS = [];
  try {
    equiposGPS = JSON.parse(borrador.equipos_gps_json || '[]');
  } catch (e) {
    equiposGPS = [];
  }

  // Anchos de columna (7 columnas)
  const COL_W = COLUMN_WIDTHS.STANDARD_7;
  
  // Altura mínima de fila: 0.6 cm = 340 twips (1 cm ≈ 567 twips)
  const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST };

  const rows = [];

  // Fila 1: Encabezado "1. Datos Generales"
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createCell(
          [new TextRun({ text: '1.   Datos Generales', font: FONT_FAMILY, size: FONT_SIZE.NORMAL, bold: true })],
          { columnSpan: 7, shading: COLORS.GRAY_SHADING, alignment: AlignmentType.LEFT }
        ),
      ],
    })
  );

  // Fila 2: Nombre del Administrado | valor | RUC | valor
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Nombre del Administrado', { alignment: AlignmentType.LEFT }),
        createValueCell(borrador.nombre_administrado || '', { columnSpan: 4, alignment: AlignmentType.CENTER }),
        createLabelCell('RUC'),
        createValueCell(borrador.ruc || '', { alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 3: Unidad Fiscalizable | valor
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Unidad Fiscalizable', { alignment: AlignmentType.LEFT }),
        createValueCell(borrador.unidad_fiscalizable || '', { columnSpan: 6, alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 4: Departamento | Provincia | Distrito (LABELS)
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Departamento', { columnSpan: 2 }),
        createLabelCell('Provincia', { columnSpan: 3 }),
        createLabelCell('Distrito', { columnSpan: 2 }),
      ],
    })
  );

  // Fila 5: Valores de Departamento | Provincia | Distrito
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createValueCell(borrador.departamento || '', { columnSpan: 2, alignment: AlignmentType.CENTER }),
        createValueCell(borrador.provincia || '', { columnSpan: 3, alignment: AlignmentType.CENTER }),
        createValueCell(borrador.distrito || '', { columnSpan: 2, alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 6: Dirección y/o Referencia | valor (centrado)
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Dirección y/o Referencia', { alignment: AlignmentType.LEFT }),
        createValueCell(borrador.direccion_referencia || '', { columnSpan: 6, alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 7: Actividad Desarrollada | valor (centrado) | Etapa | valor
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Actividad Desarrollada', { alignment: AlignmentType.LEFT }),
        createValueCell(borrador.actividad_desarrollada || '', { columnSpan: 4, alignment: AlignmentType.CENTER }),
        createLabelCell('Etapa'),
        createValueCell(borrador.etapa || '', { alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 8: Tipo de Supervisión | valor | Orientativa | valor | Estado | valor
  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Tipo de Supervisión', { alignment: AlignmentType.LEFT }),
        createValueCell(borrador.tipo_supervision || '', { alignment: AlignmentType.CENTER }),
        createLabelCell('Orientativa'),
        createValueCell(borrador.orientativa || 'No', { alignment: AlignmentType.CENTER }),
        createLabelCell('Estado'),
        createValueCell(borrador.estado || '', { columnSpan: 2, alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Fila 9: Fecha/Hora de Inicio | fecha | hora h | Fecha/Hora de Cierre | fecha | hora h
  const inicioData = parseFechaHora(borrador.fecha_hora_inicio);
  const cierreData = parseFechaHora(borrador.fecha_hora_cierre);

  rows.push(
    new TableRow({
      height: ROW_HEIGHT,
      children: [
        createLabelCell('Fecha/Hora de Inicio', { alignment: AlignmentType.LEFT }),
        createValueCell(inicioData.fecha, { alignment: AlignmentType.CENTER }),
        createValueCell(inicioData.hora ? `${inicioData.hora} h` : '', { alignment: AlignmentType.CENTER }),
        createLabelCell('Fecha/Hora de Cierre', { alignment: AlignmentType.LEFT }),
        createValueCell(cierreData.fecha, { alignment: AlignmentType.CENTER }),
        createValueCell(cierreData.hora ? `${cierreData.hora} h` : '', { columnSpan: 2, alignment: AlignmentType.CENTER }),
      ],
    })
  );

  // Filas de Equipos GPS (mínimo 2)
  const numGPSRows = Math.max(2, equiposGPS.length);
  for (let i = 0; i < numGPSRows; i++) {
    const equipo = equiposGPS[i] || {};
    rows.push(
      new TableRow({
        height: ROW_HEIGHT,
        children: [
          createLabelCell('Equipos GPS', { alignment: AlignmentType.LEFT, width: COL_W[0] }),
          createLabelCell('Código', { width: COL_W[1] }),
          createValueCell(equipo.codigo || '', { alignment: AlignmentType.CENTER, width: COL_W[2] }),
          createLabelCell('Marca', { width: COL_W[3] }),
          createValueCell(equipo.marca || 'Garmin Montana 750i', { alignment: AlignmentType.CENTER, width: COL_W[4] }),
          createLabelCell('Sistema', { width: COL_W[5] }),
          createValueCell(equipo.sistema || 'WGS 84/UTM', { alignment: AlignmentType.CENTER, width: COL_W[6] }),
        ],
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export default {
  createDatosGeneralesTable,
};
