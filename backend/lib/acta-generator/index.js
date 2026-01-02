/**
 * Generador de Actas de Supervisión OEFA
 * Módulo principal - Orquestador de secciones
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import configService from '../../services/configService.js';
import { FONT_FAMILY, FONT_SIZE, COLORS, PAGE_MARGINS } from './config.js';
import { createTextRun, createSectionTitle, createParagraph } from './helpers.js';
import { createDocumentHeader } from './header.js';
import { createDocumentFooter } from './footer.js';

// Importar secciones
import { createDatosGeneralesTable } from './sections/datos-generales.js';
import { createHechosVerificadosSection, createEquipoSupervisorNoPresenteSection } from './sections/hechos-verificados.js';
import { createComponentesSupervisadosSection } from './sections/componentes-supervisados.js';
import { createMuestreoAmbientalSection } from './sections/muestreo-ambiental.js';
import { createObservacionesAdministradoSection } from './sections/observaciones-administrado.js';
import { createOtrosAspectosSection } from './sections/otros-aspectos.js';
import { createRequerimientoInformacionSection } from './sections/requerimiento-informacion.js';
import { 
  createPersonalAdministradoSection, 
  createEquipoSupervisorFirmasSection, 
  createOtrosParticipantesSection 
} from './sections/firmas-personal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Carga la imagen del header institucional
 * @returns {Buffer|null}
 */
function loadHeaderImage() {
  const headerImagePath = path.resolve(__dirname, '../../../frontend/public/header_minam_actas.png');

  try {
    if (fs.existsSync(headerImagePath)) {
      console.log('[acta-generator] ✅ Imagen de header cargada');
      return fs.readFileSync(headerImagePath);
    } else {
      console.warn('[acta-generator] ⚠️ Imagen de header no encontrada:', headerImagePath);
      return null;
    }
  } catch (error) {
    console.error('[acta-generator] ❌ Error cargando imagen de header:', error);
    return null;
  }
}

/**
 * Crea el título principal del Acta
 * @param {string} expediente - Número de expediente
 * @returns {Paragraph[]}
 */
function createActaTitle(expediente) {
  return [
    // Título: "Acta de Supervisión"
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [
        createTextRun('Acta de Supervisión', {
          bold: true,
          size: 28 // 14pt
        }),
      ],
    }),

    // Expediente con número en color
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 300 },
      children: [
        createTextRun('Expediente N.º ', {
          bold: true,
          size: FONT_SIZE.TITLE
        }),
        createTextRun(expediente, {
          bold: true,
          size: FONT_SIZE.TITLE,
          color: COLORS.BLACK,
        }),
      ],
    }),
  ];
}

/**
 * Crea el párrafo de constancia (después de la tabla de datos generales)
 * @returns {Paragraph}
 */
function createConstanciaParagraph() {
  return createParagraph(
    'En el ejercicio de las funciones atribuidas por las normas vigentes, el equipo supervisor acreditado por el Organismo de Evaluación y Fiscalización Ambiental ha constatado lo siguiente:',
    { spacing: { before: 300, after: 200 } }
  );
}

/**
 * Genera el documento Word del Acta de Supervisión
 * @param {Object} borrador - Datos del borrador del acta
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Buffer>} Buffer del documento Word
 */
export async function generateActaWord(borrador, options = {}) {
  console.log('[acta-generator] Iniciando generación de acta...');

  // Obtener configuración del header (decenio y año)
  const headerConfig = await configService.getActaHeaderConfig();

  // Cargar imagen del header
  const headerImageBuffer = loadHeaderImage();

  // Crear header con imagen y textos de decenio/año
  const header = createDocumentHeader(
    headerImageBuffer,
    headerConfig.decenio,
    headerConfig.anio
  );

  // ===== CONTENIDO DEL DOCUMENTO =====
  const children = [];

  // 1. Título del Acta
  const expediente = borrador.expediente || 'XXXX-202X-DSEM-CHID';
  children.push(...createActaTitle(expediente));

  // 2. Sección 1: Datos Generales
  children.push(createDatosGeneralesTable(borrador));

  // 3. Párrafo de constancia
  children.push(createConstanciaParagraph());

  // 4. Sección 2: Hechos Verificados
  // Los hechos vienen directamente del borrador (cargados desde actas_hechos)
  const hechosVerificados = borrador.hechos || [];
  children.push(...createHechosVerificadosSection(hechosVerificados));

  // 5. Sección 3: Componentes Supervisados
  // Los componentes vienen del borrador (cargados desde actas_componentes)
  const componentesSupervisados = borrador.componentes || [];
  // Agregar espacio antes de la tabla de componentes
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  children.push(createComponentesSupervisadosSection(componentesSupervisados));

  // 6. Sección de Muestreo Ambiental
  // Los muestreos vienen del borrador (cargados desde localStorage en el frontend)
  const muestreos = borrador.muestreos || [];
  // Agregar espacio antes de la tabla de muestreo
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  children.push(createMuestreoAmbientalSection(muestreos));

  // 7. Sección 5: Observaciones del Administrado
  children.push(...createObservacionesAdministradoSection());

  // 8. Sección 6: Otros Aspectos
  // Viene del borrador (guardado desde localStorage en el frontend)
  const otrosAspectos = borrador.otrosAspectos || {};
  children.push(...createOtrosAspectosSection(otrosAspectos));

  // 9. Equipo supervisor no presente durante la firma del acta (sin numeración)
  // Viene del borrador (guardado desde localStorage en el frontend)
  // SOLO agregar si hay supervisores no presentes
  const supervisoresNoPresentes = borrador.supervisoresNoPresentes || [];
  if (supervisoresNoPresentes.length > 0) {
    // Agregar espacio (salto de línea) antes de la tabla
    children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
    children.push(...createEquipoSupervisorNoPresenteSection(supervisoresNoPresentes));
  }

  // 10. Sección 7: Requerimiento de Información
  // Viene del borrador (guardado desde localStorage en el frontend)
  // Va DESPUÉS de la tabla de personal de otros aspectos
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  const requerimientos = borrador.requerimientos || [];
  children.push(...createRequerimientoInformacionSection(requerimientos));

  // 11. Sección 8: Personal del Administrado
  // Cantidad de espacios para firma definida en el frontend
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  const cantidadFirmasAdministrado = borrador.cantidadFirmasAdministrado || 2;
  children.push(...createPersonalAdministradoSection(cantidadFirmasAdministrado));

  // 12. Sección 9: Equipo Supervisor (firmas)
  // Usa los datos del equipo supervisor del borrador
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  const equipoSupervisor = borrador.equipoSupervisor || [];
  children.push(...createEquipoSupervisorFirmasSection(equipoSupervisor));

  // 13. Sección 10: Otros participantes
  // Cantidad configurable de espacios para firmas (peritos, técnicos, testigos, fiscales, etc.)
  children.push(new Paragraph({ spacing: { before: 300, after: 100 } }));
  const cantidadFirmasOtrosParticipantes = borrador.cantidadFirmasOtrosParticipantes || 2;
  children.push(...createOtrosParticipantesSection(cantidadFirmasOtrosParticipantes));

  // TODO: Agregar más secciones aquí conforme se desarrollen:
  // - Anexos

  // ===== CREAR FOOTER =====
  const footer = createDocumentFooter({
    formato: 'PM0403-F01',
    version: '03',
    fechaAprobacion: '02/06/2025',
  });

  // ===== CREAR DOCUMENTO =====
  const doc = new Document({
    // Definición de footnotes (notas al pie) para el documento
    footnotes: {
      1: {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'En función de la Ficha de obligaciones priorizadas.',
                font: FONT_FAMILY,
                size: FONT_SIZE.SMALL,
              }),
            ],
          }),
        ],
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(PAGE_MARGINS.top),
              right: convertInchesToTwip(PAGE_MARGINS.right),
              bottom: convertInchesToTwip(PAGE_MARGINS.bottom),
              left: convertInchesToTwip(PAGE_MARGINS.left),
            },
          },
        },
        headers: {
          default: header,
        },
        footers: {
          default: footer,
        },
        children,
      },
    ],
  });

  // Generar buffer
  console.log('[acta-generator] ✅ Documento generado correctamente');
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

export default {
  generateActaWord,
};
