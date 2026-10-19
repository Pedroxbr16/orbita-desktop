const { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } = require('electron');
const path = require('node:path');
const { inspectFiles, processFiles } = require('./converter.cjs');

// Software compositing avoids driver-specific crashes for transparent utility
// windows on wlroots compositors.
if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') {
  app.disableHardwareAcceleration();
}

let workspaceWindow;
const overlayFiles = new Map();
const overlayWindows = new Set();
const pendingMacFiles = [];

function rendererTarget(query = '') {
  if (process.env.VITE_DEV_SERVER_URL) return { url: `${process.env.VITE_DEV_SERVER_URL}${query}` };
  return { file: path.join(__dirname, '..', 'dist', 'index.html'), query: query.replace(/^\?/, '') };
}

function loadRenderer(window, query = '') {
  const target = rendererTarget(query);
  if (target.url) return window.loadURL(target.url);
  return window.loadFile(target.file, target.query ? { query: Object.fromEntries(new URLSearchParams(target.query)) } : undefined);
}

function webPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  };
}

function createWorkspace() {
  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    workspaceWindow.show();
    workspaceWindow.focus();
    return workspaceWindow;
  }
  workspaceWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#11100f',
    title: 'Orbita',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: webPreferences(),
  });
  workspaceWindow.setMenuBarVisibility(false);
  workspaceWindow.on('closed', () => { workspaceWindow = null; });
  loadRenderer(workspaceWindow, '?mode=workspace');
  return workspaceWindow;
}

function overlayPosition(width, height) {
  // Electron's cursor/display APIs can crash under some wlroots compositors.
  // Wayland also does not let clients choose absolute window coordinates.
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') return {};
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  return {
    x: Math.max(area.x, Math.min(Math.round(cursor.x - width / 2), area.x + area.width - width)),
    y: Math.max(area.y, Math.min(Math.round(cursor.y - height / 2), area.y + area.height - height)),
  };
}

function createOverlay(paths) {
  const width = 620;
  const height = 620;
  const position = overlayPosition(width, height);
  const overlay = new BrowserWindow({
    ...position,
    center: process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland',
    width,
    height,
    minWidth: width,
    minHeight: height,
    maxWidth: width,
    maxHeight: height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: webPreferences(),
  });
  const webContentsId = overlay.webContents.id;
  overlayWindows.add(overlay);
  overlayFiles.set(webContentsId, paths);
  overlay.setMenuBarVisibility(false);
  overlay.webContents.once('did-finish-load', () => {
    overlay.focus();
  });
  overlay.on('closed', () => {
    overlayFiles.delete(webContentsId);
    overlayWindows.delete(overlay);
  });
  loadRenderer(overlay, '?mode=overlay');
  return overlay;
}

function commandFiles(argv) {
  const start = app.isPackaged ? 1 : 2;
  return argv.slice(start).filter((value) => value && !value.startsWith('-') && path.isAbsolute(value));
}

async function openOverlay(paths = []) {
  let selected = paths;
  if (!selected.length) {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (result.canceled) return;
    selected = result.filePaths;
  }
  if (selected.length) createOverlay(selected);
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) openOverlay([filePath]);
  else pendingMacFiles.push(filePath);
});

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const paths = commandFiles(argv);
    if (paths.length) openOverlay(paths);
    else if (argv.includes('--workspace')) createWorkspace();
    else openOverlay();
  });

  app.whenReady().then(async () => {
    const args = process.argv;
    const paths = [...pendingMacFiles, ...commandFiles(args)];
    if (args.includes('--workspace')) createWorkspace();
    else await openOverlay(paths);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openOverlay();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('files:choose', async () => {
  const result = await dialog.showOpenDialog(workspaceWindow || undefined, { properties: ['openFile', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('output:choose', async () => {
  const result = await dialog.showOpenDialog(workspaceWindow || undefined, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('files:inspect', async (_event, paths) => inspectFiles(Array.isArray(paths) ? paths : []));
ipcMain.handle('overlay:get-files', (event) => overlayFiles.get(event.sender.id) || []);

ipcMain.handle('files:process', async (event, payload) => {
  const jobId = String(payload?.jobId || Date.now());
  try {
    const results = await processFiles(payload, (progress) => event.sender.send('job:progress', { jobId, ...progress }));
    if (payload?.overlay && Notification.isSupported()) {
      new Notification({ title: 'Orbita', body: `${results.length} ${results.length === 1 ? 'arquivo pronto' : 'arquivos prontos'} na pasta Orbita.` }).show();
    }
    return { ok: true, results };
  } catch (error) {
    return { ok: false, error: error?.message || 'Não foi possível processar os arquivos.' };
  }
});

ipcMain.handle('file:reveal', (_event, filePath) => {
  if (typeof filePath === 'string') shell.showItemInFolder(path.resolve(filePath));
});

ipcMain.handle('file:open', async (_event, filePath) => {
  if (typeof filePath !== 'string') return 'Caminho inválido.';
  return shell.openPath(path.resolve(filePath));
});

ipcMain.on('overlay:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.on('window:minimize', () => workspaceWindow?.minimize());
ipcMain.on('window:maximize', () => workspaceWindow?.isMaximized() ? workspaceWindow.unmaximize() : workspaceWindow?.maximize());
ipcMain.on('window:close', () => workspaceWindow?.close());
