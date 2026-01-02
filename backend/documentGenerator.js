/**
 * Archivo principal para la generación de documentos.
 * Este archivo actúa como fachada (facade) para la funcionalidad refactorizada en el directorio `lib`.
 * Mantiene la misma interfaz pública que la versión anterior.
 */

import { generateDocument, generateCSVTemplate } from './lib/document-generator.js';

// Exportar las funciones para mantener la compatibilidad con el resto de la aplicación.
export {
  generateDocument,
  generateCSVTemplate,
};
