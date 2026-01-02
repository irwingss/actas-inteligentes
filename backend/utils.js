import { TableCell, Paragraph, BorderStyle } from 'docx';

/**
 * Crea una nueva instancia de una celda de tabla vacía y sin bordes, optimizada para ser invisible
 * y mantener el ancho de columna incluso en casos impares.
 * Esto es necesario para evitar reutilizar la misma instancia de objeto, lo que puede
 * causar problemas en la librería docx al renderizar tablas complejas.
 * @returns {TableCell} Una nueva instancia de TableCell invisible que mantiene el ancho.
 */
function createEmptyCell() {
  return new TableCell({
    children: [
      // Usar un espacio no rompible con ancho cero para forzar que la celda mantenga su estructura
      // pero sea invisible visualmente
      new Paragraph({ 
        text: '\u00A0', // Espacio no rompible
        spacing: { before: 0, after: 0 },
        alignment: require('docx').AlignmentType.CENTER,
        style: {
          size: 1, // Tamaño mínimo
          color: "ffffff" // Color blanco para hacerlo invisible
        }
      })
    ],
    width: { size: 12.5, type: require('docx').WidthType.PERCENTAGE }, // Forzar ancho proporcional
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    shading: { fill: "ffffff", color: "ffffff" }, // Color blanco para asegurar transparencia visual
    verticalAlign: require('docx').VerticalAlign.CENTER
  });
}

export {  createEmptyCell  };
