import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToConvert = [
  'lib/document-generator.js',
  'lib/document-builder.js',
  'lib/image-processor.js',
  'lib/metadata-processor.js',
  'lib/export-formats/format-01.js',
  'lib/export-formats/format-02.js',
  'lib/export-formats/format-03.js',
  'lib/export-formats/format-04.js',
  'utils.js'
];

function convertFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Archivo no encontrado: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Convertir requires a imports
  content = content.replace(/const\s+(\{[^}]+\})\s*=\s*require\(['"]([^'"]+)['"]\);?/g, 'import $1 from \'$2\';');
  content = content.replace(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, 'import $1 from \'$2\';');
  
  // Agregar .js a imports locales
  content = content.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, p1) => {
    if (!p1.endsWith('.js') && !p1.endsWith('.json')) {
      return `from '${p1}.js'`;
    }
    return match;
  });
  
  // Convertir module.exports
  content = content.replace(/module\.exports\s*=\s*\{([^}]+)\};?/g, 'export { $1 };');
  content = content.replace(/module\.exports\s*=\s*([a-zA-Z_$][a-zA-Z0-9_$]*);?/g, 'export default $1;');
  
  // Agregar __dirname y __filename si se usan
  if (content.includes('__dirname') || content.includes('__filename')) {
    if (!content.includes('fileURLToPath')) {
      const importStatement = "import { fileURLToPath } from 'url';\nimport path from 'path';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = path.dirname(__filename);\n\n";
      // Insertar después de los imports existentes
      const firstNonImportLine = content.split('\n').findIndex(line => 
        line.trim() && !line.trim().startsWith('import') && !line.trim().startsWith('//')
      );
      if (firstNonImportLine > 0) {
        const lines = content.split('\n');
        lines.splice(firstNonImportLine, 0, importStatement);
        content = lines.join('\n');
      }
    }
  }
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✅ Convertido: ${filePath}`);
}

console.log('🔄 Convirtiendo archivos de CommonJS a ES Modules...\n');

filesToConvert.forEach(convertFile);

console.log('\n✨ Conversión completada!');
