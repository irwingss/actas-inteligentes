import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_SRC = path.join(__dirname, 'backend');
const DIST_BACKEND = path.join(__dirname, 'dist-backend');

const INCLUDE_PATTERNS = [
  'server.js',
  'documentGenerator.js',
  'utils.js',
  'package.json',
  '.env',
  'config',
  'db',
  'lib',
  'middleware',
  'routes',
  'services',
  'uploads',
  'storage'
];

const EXCLUDE_FILES = [
  'debug_arcgis.log',
  'convert-to-esm.js',
  'run_migration.js',
  'verify_local_db.js',
  'package-lock.json',
  '.gitignore',
  '.env.example'
];

const EXCLUDE_EXTENSIONS = [
  '.d.ts',
  '.d.ts.map',
  '.map',
  '.md',
  '.markdown',
  '.txt',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
  '.eslintrc',
  '.prettierrc',
  '.editorconfig'
];

const EXCLUDE_DIRS = [
  '.git',
  '.github',
  'test',
  'tests',
  '__tests__',
  'docs',
  'doc',
  'example',
  'examples',
  '.vscode',
  'src'
];

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function shouldExclude(basename, isDir) {
  if (EXCLUDE_FILES.includes(basename)) return true;
  if (basename.startsWith('test_')) return true;
  if (basename.startsWith('debug_') && basename.endsWith('.log')) return true;
  // Allow .env file but exclude other dot files
  if (basename.startsWith('.') && basename !== '.env') return true;
  
  if (isDir) {
    if (EXCLUDE_DIRS.includes(basename.toLowerCase())) return true;
  } else {
    for (const ext of EXCLUDE_EXTENSIONS) {
      if (basename.endsWith(ext)) return true;
    }
  }
  return false;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const stat = fs.statSync(src);
  const basename = path.basename(src);
  const isDir = stat.isDirectory();
  
  if (shouldExclude(basename, isDir)) return;
  
  if (isDir) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(
        path.join(src, entry),
        path.join(dest, entry)
      );
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function getDirSize(dir) {
  let size = 0;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += fs.statSync(filePath).size;
      }
    }
  } catch (e) {
    return 0;
  }
  return size;
}

console.log('Bundling backend...\n');

console.log('Cleaning dist-backend...');
cleanDir(DIST_BACKEND);

console.log('Copying backend files (including node_modules)...');
for (const pattern of INCLUDE_PATTERNS) {
  const src = path.join(BACKEND_SRC, pattern);
  const dest = path.join(DIST_BACKEND, pattern);
  
  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    console.log('  OK: ' + pattern);
  } else {
    console.log('  SKIP: ' + pattern + ' (not found)');
  }
}

// Explicitly copy .env if it exists
const envSrc = path.join(BACKEND_SRC, '.env');
const envDest = path.join(DIST_BACKEND, '.env');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDest);
  console.log('  OK: .env');
}

const sizeBytes = getDirSize(DIST_BACKEND);
const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
console.log('\nBackend bundled successfully to dist-backend/');
console.log('Total size: ' + sizeMB + ' MB');

console.log('\nInstalling production dependencies in dist-backend...');
try {
  execSync('npm install --omit=dev --no-bin-links', { 
    cwd: DIST_BACKEND, 
    stdio: 'inherit' 
  });
  console.log('Dependencies installed successfully.');
} catch (error) {
  console.error('Failed to install dependencies:', error);
  process.exit(1);
}
