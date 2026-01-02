const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let logStream = null;

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
  backendProcess = spawn(process.execPath, [serverJs], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3000',
      ELECTRON_RUN_AS_NODE: '1'
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
}

app.whenReady().then(() => {
  logLine(`[app] isPackaged=${app.isPackaged} ACTAS_ELECTRON_DEV=${process.env.ACTAS_ELECTRON_DEV || ''}`);
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
