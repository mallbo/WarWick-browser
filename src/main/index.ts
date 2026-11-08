import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TabManager } from './tabManager';
import { AntigravityBridge } from './antigravityBridge';
import { registerIpcHandlers } from './ipcHandlers';
import { StorageService } from './storageService';
import { setupPrivacyShield } from './privacyShield';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let antigravityBridge: AntigravityBridge | null = null;
let storageService: StorageService | null = null;

async function createMainWindow(): Promise<BrowserWindow> {
  // Disable default menu for sleek frameless browser look
  Menu.setApplicationMenu(null);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const preloadPath = path.join(__dirname, 'index.js');

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#121009',
    icon: path.join(__dirname, '../public/favicon.svg'),
    frame: false,
    show: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Initialize storage service
  storageService = new StorageService();
  await storageService.initialize();

  const appSettings = storageService.getSettings();

  // Instantiate TabManager with the primary window and storageService
  tabManager = new TabManager(win, storageService);

  // Instantiate AntigravityBridge with loaded settings
  antigravityBridge = new AntigravityBridge(win, appSettings);

  // Register typed IPC channels
  registerIpcHandlers(win, tabManager, storageService, antigravityBridge);

  // Prevent main shell from navigating away on dropped links or window.open
  win.webContents.setWindowOpenHandler(({ url }) => {
    tabManager?.createTab(url, { active: true });
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, errorCode, errorDescription);
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      tabManager?.createTab(url, { active: true });
    }
  });

  const onWindowReady = () => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }

    // Session Restore (Feature 25)
    const session = storageService?.getSession();
    if (session && session.tabs && session.tabs.length > 0) {
      let activated = false;
      for (const t of session.tabs) {
        const isActive = t.id === session.activeTabId;
        if (isActive) activated = true;
        tabManager?.createTab(t.url, { active: isActive, id: t.id, isPinned: t.isPinned });
      }
      if (!activated && session.tabs.length > 0) {
        tabManager?.switchTab(session.tabs[0].id);
      }
    } else {
      // Initialize default start tab with WarWick Marketing AI Home
      tabManager?.createTab('about:blank', { active: true });
    }
  };

  win.once('ready-to-show', onWindowReady);

  // Safety fallback: ensure window becomes visible even if ready-to-show event is missed
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      onWindowReady();
    }
  }, 1000);

  win.on('closed', () => {
    if (antigravityBridge) {
      antigravityBridge.destroy().catch(() => {});
      antigravityBridge = null;
    }
    if (tabManager) {
      tabManager.destroyAll();
      tabManager = null;
    }
    mainWindow = null;
  });

  // Load React shell
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

app.whenReady().then(async () => {
  setupPrivacyShield();
  mainWindow = await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (isQuitting) return;

  // Electron does not await async "before-quit" handlers. Prevent the quit,
  // flush debounced writes (history/session/settings), then quit for real.
  event.preventDefault();
  isQuitting = true;

  try {
    if (tabManager) {
      tabManager.saveSession();
    }
    if (storageService) {
      await storageService.flushAll();
    }
    if (antigravityBridge) {
      await antigravityBridge.destroy().catch(() => {});
      antigravityBridge = null;
    }
    if (tabManager) {
      tabManager.destroyAll();
    }
  } finally {
    app.quit();
  }
});
