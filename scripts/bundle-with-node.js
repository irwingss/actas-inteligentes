import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const NODE_VERSION = '20.10.0';
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const CACHE_DIR = path.join(ROOT, '.cache');
const BACKEND_SRC = path.join(ROOT, 'backend');
const DIST_BACKEND = path.join(ROOT, 'src-tauri', 'dist-backend');

const BACKEND_INCLUDES = [
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

const EXCLUDE_FILES = ['debug_arcgis.log', 'convert-to-esm.js', 'run_migration.js', 'verify_local_db.js', '.gitignore', '.env.example'];
const EXCLUDE_EXTENSIONS = ['.d.ts', '.d.ts.map', '.map', '.md', '.txt', '.yaml', '.yml'];
const EXCLUDE_DIRS = ['.git', 'test', 'tests', '__tests__', 'docs', 'example', 'examples', 'src'];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    
    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }
        
        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const percent = ((downloaded / total) * 100).toFixed(1);
          process.stdout.write(`\rDownloading: ${percent}%`);
        });
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\nDownload complete!');
          resolve();
        });
      }).on('error', reject);
    };
    
    request(url);
  });
}

function shouldExclude(basename, isDir) {
  if (EXCLUDE_FILES.includes(basename)) return true;
  if (basename.startsWith('test_') || basename.startsWith('debug_')) return true;
  // Allow .env but exclude other dot files
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
  
  if (shouldExclude(basename, stat.isDirectory())) return;
  
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
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

async function main() {
  console.log('=== Bundling Backend with Node.js ===\n');
  
  // 1. Clean dist-backend
  console.log('1. Cleaning dist-backend...');
  if (fs.existsSync(DIST_BACKEND)) {
    fs.rmSync(DIST_BACKEND, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_BACKEND, { recursive: true });
  
  // 2. Download Node.js if not cached
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  const nodeZip = path.join(CACHE_DIR, `node-v${NODE_VERSION}-win-x64.zip`);
  
  if (!fs.existsSync(nodeZip)) {
    console.log('2. Downloading Node.js portable...');
    await downloadFile(NODE_URL, nodeZip);
  } else {
    console.log('2. Using cached Node.js...');
  }
  
  // 3. Extract Node.js to dist-backend
  console.log('3. Extracting Node.js...');
  const extractDir = path.join(DIST_BACKEND, 'node-temp');
  
  execSync(`powershell -Command "Expand-Archive -Path '${nodeZip}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit' });
  
  // Copy node.exe to dist-backend root
  const nodeExeSrc = path.join(extractDir, `node-v${NODE_VERSION}-win-x64`, 'node.exe');
  const nodeExeDest = path.join(DIST_BACKEND, 'node.exe');
  fs.copyFileSync(nodeExeSrc, nodeExeDest);
  console.log('   Node.js copied to dist-backend/node.exe');
  
  // Clean up temp
  fs.rmSync(extractDir, { recursive: true, force: true });
  
  // 4. Copy backend files
  console.log('4. Copying backend files...');
  for (const item of BACKEND_INCLUDES) {
    const src = path.join(BACKEND_SRC, item);
    const dest = path.join(DIST_BACKEND, item);
    
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`   OK: ${item}`);
    } else {
      console.log(`   SKIP: ${item} (not found)`);
    }
  }
  
  // 5. Calculate size
  const sizeBytes = getDirSize(DIST_BACKEND);
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
  
  console.log(`\n=== Bundle Complete! ===`);
  console.log(`Location: ${DIST_BACKEND}`);
  console.log(`Total size: ${sizeMB} MB`);
  console.log(`Includes: Node.js ${NODE_VERSION} + Backend`);
}

main().catch(console.error);
