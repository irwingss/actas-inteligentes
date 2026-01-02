/**
 * Configuración y constantes para la generación de Actas OEFA
 */

// Fuente del documento
export const FONT_FAMILY = 'Arial';

// Tamaños de fuente (en half-points: pt * 2)
export const FONT_SIZE = {
  NORMAL: 20,     // 10pt - Texto normal de tabla
  SMALL: 18,      // 9pt - Texto pequeño (pies de foto)
  TITLE: 24,      // 12pt - Títulos
  HEADER: 16,     // 8pt - Decenio/Año en header
  SECTION: 20,    // 10pt - Títulos de sección
};

// Colores
export const COLORS = {
  BLACK: '000000',
  RED: '8B0000',           // Rojo oscuro OEFA
  GRAY_SHADING: 'D9D9D9',  // Fondo gris para labels
};

// Anchos de columna estándar para tablas de 7 columnas (%)
// Basado en medidas exactas del formato oficial OEFA (17 cm total):
// Col1: 0-3.75cm, Col2: 3.75-5.75cm, Col3: 5.75-8.65cm, 
// Col4: 8.65-10.95cm, Col5: 10.95-13.40cm, Col6: 13.40-14.75cm, Col7: 14.75-17cm
export const COLUMN_WIDTHS = {
  // 7 columnas estándar (GPS y similares)
  STANDARD_7: [22, 12, 17, 14, 14, 8, 13],
  
  // Combinaciones útiles para filas con menos columnas:
  // Col 1 sola = 22%
  // Col 1+2 = 34% (para "Nombre del Administrado", etc.)
  // Col 2+3+4+5 = 57% (para valores largos)
  // Col 5+6 = 22% (para "RUC" label + valor)
  // Col 6+7 = 21% (para valores finales)
};

// Márgenes del documento (en inches)
export const PAGE_MARGINS = {
  top: 0.5,
  right: 0.75,
  bottom: 0.5,
  left: 0.75,
};

export default {
  FONT_FAMILY,
  FONT_SIZE,
  COLORS,
  COLUMN_WIDTHS,
  PAGE_MARGINS,
};
