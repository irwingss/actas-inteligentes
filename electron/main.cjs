const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let logStream = null;
let pendingDeepLink = null;

// Protocolo para deep links (reset password, etc.)
const PROTOCOL_NAME = 'actas-inteligentes';

// Registrar protocolo como manejador por defecto
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

function getLogStream() {
  if (logStream) return logStream;
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const logPath = path.join(userDataPath, 'app.log');
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`\n\n==== app start ${new Date().toISOString()} ====\n`);
    return logStream;
  } catch (err) {
    console.error('Failed to create log stream:', err);
    return null;
  }
}

function logLine(line) {
  const stream = getLogStream();
  if (!stream) return;
  stream.write(String(line) + '\n');
}

function isDev() {
  return !app.isPackaged || process.env.ACTAS_ELECTRON_DEV === '1';
}

function getFrontendUrl() {
  if (isDev()) return process.env.ACTAS_DEV_URL || 'http://localhost:5173';

  const indexPath = path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
  return `file://${indexPath}`;
}

function startBackend() {
  if (isDev()) {
    // In dev, backend is started by npm run dev
    return;
  }

  const backendDir = path.join(process.resourcesPath, 'dist-backend');
  const serverJs = path.join(backendDir, 'server.js');
  logLine(`[backend] starting: ${serverJs}`);

  // Run backend using Electron's embedded Node runtime
  // Asegurar que APPDATA esté disponible para que el backend use la ruta correcta de almacenamiento
  const appDataPath = app.getPath('appData');
  logLine(`[backend] APPDATA path: ${appDataPath}`);
  
  backendProcess = spawn(process.execPath, [serverJs], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3000',
      ELECTRON_RUN_AS_NODE: '1',
      APPDATA: appDataPath // Asegurar que APPDATA esté disponible para paths.js
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  backendProcess.stdout.on('data', (d) => logLine(`[backend][stdout] ${d.toString().trimEnd()}`));
  backendProcess.stderr.on('data', (d) => logLine(`[backend][stderr] ${d.toString().trimEnd()}`));

  backendProcess.on('exit', (code, signal) => {
    logLine(`[backend] exited with code ${code} and signal ${signal}`);
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    logLine(`[backend] failed to start: ${err.message}`);
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    backendProcess.kill();
  } catch {
    // ignore
  }
  backendProcess = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '..', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logLine(`[renderer] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logLine(`[renderer][console] level=${level} ${sourceId}:${line} ${message}`);
  });

  const url = getFrontendUrl();
  logLine(`[main] loading frontend url: ${url}`);
  mainWindow.loadURL(url);

  // Enable DevTools shortcut (F12 or Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  if (isDev()) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Enviar deep link pendiente cuando la ventana esté lista
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      handleDeepLink(pendingDeepLink);
      pendingDeepLink = null;
    }
  });
}

// Manejar deep links en Windows (segunda instancia)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguien intentó ejecutar una segunda instancia, enfocar la ventana
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows: El deep link viene en commandLine
    const deepLink = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
  });

  app.whenReady().then(() => {
    logLine(`[app] isPackaged=${app.isPackaged} ACTAS_ELECTRON_DEV=${process.env.ACTAS_ELECTRON_DEV || ''}`);
    startBackend();
    createWindow();

    // Windows: Verificar si se abrió con deep link
    const deepLinkArg = process.argv.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (deepLinkArg) {
      pendingDeepLink = deepLinkArg;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// macOS: Manejar deep links
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Función para manejar deep links
function handleDeepLink(url) {
  logLine(`[deep-link] Received: ${url}`);
  
  if (!mainWindow) {
    pendingDeepLink = url;
    return;
  }

  // Parsear la URL del deep link
  // Formato: actas-inteligentes://reset-password#access_token=xxx&refresh_token=xxx&type=recovery
  try {
    const urlObj = new URL(url);
    const path = urlObj.hostname || urlObj.pathname.replace(/^\/\//, '');
    const hash = urlObj.hash || '';
    
    logLine(`[deep-link] Path: ${path}, Hash: ${hash}`);
    
    // Enviar al renderer
    mainWindow.webContents.send('deep-link', { path, hash, fullUrl: url });
  } catch (err) {
    logLine(`[deep-link] Error parsing URL: ${err.message}`);
  }
}

// IPC para que el renderer solicite deep links pendientes
ipcMain.handle('get-pending-deep-link', () => {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  // On macOS it's common for applications to stay open until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
