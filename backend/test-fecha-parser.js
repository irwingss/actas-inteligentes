/**
 * Script de prueba para verificar el parser de fechas en español
 * Ejecutar con: node backend/test-fecha-parser.js
 */

// Simulación de la función parseDateToTimestamp
function parseDateToTimestamp(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Fecha inválida');
  }

  // Mapa de meses en español
  const mesesES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };

  dateStr = dateStr.toLowerCase().trim();

  // Patrón: "10 de agosto de 2024" o "10 agosto 2024"
  const spanishPattern = /(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/;
  let match = dateStr.match(spanishPattern);
  
  if (match) {
    const dia = parseInt(match[1]);
    const mesNombre = match[2];
    const anio = parseInt(match[3]);
    const mes = mesesES[mesNombre];
    
    if (!mes) {
      throw new Error(`Mes no reconocido: ${mesNombre}`);
    }
    
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón: "agosto 2024" (solo mes y año)
  const monthYearPattern = /(\w+)\s+(\d{4})/;
  match = dateStr.match(monthYearPattern);
  
  if (match) {
    const mesNombre = match[1];
    const anio = parseInt(match[2]);
    const mes = mesesES[mesNombre];
    
    if (!mes) {
      throw new Error(`Mes no reconocido: ${mesNombre}`);
    }
    
    const date = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón: DD/MM/YYYY o DD-MM-YYYY
  const dmyPattern = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;
  match = dateStr.match(dmyPattern);
  
  if (match) {
    const dia = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const anio = parseInt(match[3]);
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  // Patrón ISO con hora: YYYY-MM-DD HH:MM:SS
  const isoWithTimePattern = /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/;
  match = dateStr.match(isoWithTimePattern);
  
  if (match) {
    const anio = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const dia = parseInt(match[3]);
    const hora = parseInt(match[4]);
    const minuto = parseInt(match[5]);
    const segundo = parseInt(match[6]);
    const date = new Date(anio, mes - 1, dia, hora, minuto, segundo, 0);
    return date.getTime();
  }

  // Patrón ISO solo fecha: YYYY-MM-DD
  const isoPattern = /(\d{4})-(\d{1,2})-(\d{1,2})/;
  match = dateStr.match(isoPattern);
  
  if (match) {
    const anio = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const dia = parseInt(match[3]);
    const date = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    return date.getTime();
  }

  throw new Error(`No se pudo interpretar la fecha: ${dateStr}`);
}

function timestampToReadable(timestamp) {
  const date = new Date(parseFloat(timestamp));
  if (isNaN(date.getTime())) return timestamp;
  
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const anio = date.getFullYear();
  
  return `${dia}/${mes}/${anio}`;
}

// Casos de prueba
const testCases = [
  "10 de agosto de 2024",
  "10 agosto 2024",
  "agosto 2024",
  "5 de julio de 2024",
  "10/08/2024",
  "10-08-2024",
  "2024-08-10",
  "2025-09-11 15:55:09",  // ISO con hora
  "2025-09-11 08:30:00",  // ISO con hora
  "15 de diciembre de 2023",
  "enero 2024"
];

console.log('🧪 Pruebas del Parser de Fechas en Español\n');
console.log('='.repeat(70));

testCases.forEach((testCase, index) => {
  try {
    const timestamp = parseDateToTimestamp(testCase);
    const readable = timestampToReadable(timestamp);
    console.log(`\n✅ Caso ${index + 1}: "${testCase}"`);
    console.log(`   Timestamp: ${timestamp}`);
    console.log(`   Fecha legible: ${readable}`);
  } catch (error) {
    console.log(`\n❌ Caso ${index + 1}: "${testCase}"`);
    console.log(`   Error: ${error.message}`);
  }
});

console.log('\n' + '='.repeat(70));

// Comparación con timestamp de ejemplo de la BD
const sampleTimestamp = 1757348940000.0;
console.log(`\n📊 Timestamp de ejemplo de la BD: ${sampleTimestamp}`);
console.log(`   Fecha legible: ${timestampToReadable(sampleTimestamp)}`);

console.log('\n✨ Pruebas completadas\n');
