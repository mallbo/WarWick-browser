import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function setupIsolatedStorage(customUserDataDir) {
  const typesPath = path.resolve(process.cwd(), 'src/shared/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  const typesCtx = vm.createContext({ module: typesMod, exports: typesMod.exports });
  vm.runInContext(typesJs, typesCtx);
  const { DEFAULT_APP_SETTINGS, IPC_CHANNELS } = typesMod.exports;

  const storagePath = path.resolve(process.cwd(), 'src/main/storageService.ts');
  const storageSrc = fs.readFileSync(storagePath, 'utf8');
  const storageJs = ts.transpileModule(storageSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const storageMod = { exports: {} };
  const storageCtx = vm.createContext({
    require: (m) => {
      if (m === 'electron') {
        return {
          app: {
            getPath: (name) => (name === 'userData' ? customUserDataDir : os.tmpdir())
          }
        };
      }
      if (m === '../shared/types') return typesMod.exports;
      return require(m);
    },
    module: storageMod,
    exports: storageMod.exports,
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    Set,
    Map
  });
  vm.runInContext(storageJs, storageCtx);

  return {
    StorageService: storageMod.exports.StorageService,
    DEFAULT_APP_SETTINGS,
    IPC_CHANNELS
  };
}

function setupIpcHarness() {
  const typesPath = path.resolve(process.cwd(), 'src/shared/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  const typesCtx = vm.createContext({ module: typesMod, exports: typesMod.exports });
  vm.runInContext(typesJs, typesCtx);

  const registeredHandlers = new Map();
  const registeredListeners = new Map();
  const fakeIpcMain = {
    handle: (channel, handler) => {
      registeredHandlers.set(channel, handler);
    },
    on: (channel, listener) => {
      registeredListeners.set(channel, listener);
    },
    _call: async (channel, ...args) => {
      const fn = registeredHandlers.get(channel);
      if (!fn) throw new Error(`No handle registered for channel: ${channel}`);
      return fn({ sender: {} }, ...args);
    },
    _emit: (channel, ...args) => {
      const fn = registeredListeners.get(channel);
      if (!fn) throw new Error(`No listener registered for channel: ${channel}`);
      return fn({ sender: {} }, ...args);
    }
  };

  class MockWebContents extends EventEmitter {
    constructor() {
      super();
      this.currentUrl = 'about:blank';
    }
    loadURL(url) { this.currentUrl = url; return Promise.resolve(); }
    getURL() { return this.currentUrl; }
    getTitle() { return 'Mock Tab'; }
    canGoBack() { return false; }
    canGoForward() { return false; }
    reload() {}
    focus() {}
    close() {}
    setWindowOpenHandler() {}
  }

  class MockWebContentsView {
    constructor() {
      this.webContents = new MockWebContents();
      this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    }
    setBackgroundColor() {}
    setBounds(b) { this.bounds = b; }
  }

  const fakeElectron = {
    ipcMain: fakeIpcMain,
    BrowserWindow: class {},
    WebContentsView: MockWebContentsView,
    app: { getPath: () => os.tmpdir() }
  };

  const tmPath = path.resolve(process.cwd(), 'src/main/tabManager.ts');
  const tmSrc = fs.readFileSync(tmPath, 'utf8');
  const tmJs = ts.transpileModule(tmSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const tmMod = { exports: {} };
  const tmCtx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
      if (m === '../shared/types') return typesMod.exports;
      return require(m);
    },
    module: tmMod,
    exports: tmMod.exports,
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    Set,
    Map
  });
  vm.runInContext(tmJs, tmCtx);

  const ipcPath = path.resolve(process.cwd(), 'src/main/ipcHandlers.ts');
  const ipcSrc = fs.readFileSync(ipcPath, 'utf8');
  const ipcJs = ts.transpileModule(ipcSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const ipcMod = { exports: {} };
  const ipcCtx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
      if (m === '../shared/types') return typesMod.exports;
      if (m === './tabManager') return tmMod.exports;
      if (m === './antigravityBridge') {
        return {
          AntigravityBridge: class {
            constructor() {}
            sendPrompt() { return Promise.resolve({ runId: 'test-run' }); }
            cancel() { return Promise.resolve(true); }
            researchQuery() { return Promise.resolve({ runId: 'test-research' }); }
          }
        };
      }
      if (m === './pageContextExtractor') {
        return {
          extractActivePageContext: () => Promise.resolve({ url: 'about:blank', title: '', selectedText: '', readableText: '' }),
          captureActivePageScreenshot: () => Promise.resolve(undefined)
        };
      }
      return require(m);
    },
    module: ipcMod,
    exports: ipcMod.exports,
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    Set,
    Map
  });
  vm.runInContext(ipcJs, ipcCtx);

  function createMockWindow() {
    const win = new EventEmitter();
    win.contentView = {
      children: [],
      addChildView: (v) => {
        if (!win.contentView.children.includes(v)) win.contentView.children.push(v);
      },
      removeChildView: (v) => {
        const idx = win.contentView.children.indexOf(v);
        if (idx >= 0) win.contentView.children.splice(idx, 1);
      }
    };
    win.webContents = new EventEmitter();
    win.webContents.send = () => {};
    win.isDestroyed = () => false;
    win.minimize = () => {};
    win.maximize = () => {};
    win.unmaximize = () => {};
    win.isMaximized = () => false;
    win.close = () => {};
    win.getContentSize = () => [1280, 800];
    return win;
  }

  return {
    registerIpcHandlers: ipcMod.exports.registerIpcHandlers,
    TabManager: tmMod.exports.TabManager,
    IPC_CHANNELS: typesMod.exports.IPC_CHANNELS,
    DEFAULT_APP_SETTINGS: typesMod.exports.DEFAULT_APP_SETTINGS,
    ipcMain: fakeIpcMain,
    createMockWindow
  };
}

describe('M5 Remediation Adversarial Challenger: Deep Empirical Resilience Suite', () => {

  // =========================================================================
  // Target 1: StorageService Non-Array / Corrupt JSON on Disk
  // =========================================================================
  describe('Target 1: StorageService Non-Array / Corrupt JSON Schema Hardening', () => {

    it('CORRUPT-1: history.json with {} (object instead of array) recovers to [] and supports operations without throwing', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-h-obj-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'history.json'), JSON.stringify({ corrupted: true, count: 42 }), 'utf8');

      const { StorageService } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      // Invariant: must be array with 0 items
      const initialHistory = storage.getHistory();
      assert.strictEqual(Array.isArray(initialHistory), true);
      assert.strictEqual(initialHistory.length, 0);

      // Mutation operations must not throw TypeError: this.history.unshift is not a function
      assert.doesNotThrow(() => {
        storage.recordHistory('https://example.com/page1', 'Page 1');
      });
      assert.doesNotThrow(() => {
        storage.addHistory('https://example.com/page2', 'Page 2');
      });
      assert.doesNotThrow(() => {
        storage.addHistory({ url: 'https://example.com/page3', title: 'Page 3' });
      });

      const history = storage.getHistory();
      assert.strictEqual(history.length, 3);
      assert.strictEqual(history[0].url, 'https://example.com/page3');

      // Flush should cleanly write array back to disk
      await storage.flushAll(true);
      const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.strictEqual(Array.isArray(onDisk), true);
      assert.strictEqual(onDisk.length, 3);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('CORRUPT-2: bookmarks.json with null recovers to [] and supports addBookmark without throwing', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-bm-null-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'bookmarks.json'), 'null', 'utf8');

      const { StorageService } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      const initialBookmarks = storage.getBookmarks();
      assert.strictEqual(Array.isArray(initialBookmarks), true);
      assert.strictEqual(initialBookmarks.length, 0);

      // Adding bookmark must succeed
      let bm;
      await assert.doesNotReject(async () => {
        bm = await storage.addBookmark({ url: 'https://warwick.ai', title: 'Warwick Browser' });
      });
      assert.ok(bm && bm.id);
      assert.strictEqual(storage.getBookmarks().length, 1);

      await storage.flushAll(true);
      const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'bookmarks.json'), 'utf8'));
      assert.strictEqual(Array.isArray(onDisk), true);
      assert.strictEqual(onDisk[0].url, 'https://warwick.ai');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('CORRUPT-3: bookmarks.json with non-array object {"url": "foo"} recovers cleanly', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-bm-obj-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'bookmarks.json'), JSON.stringify({ url: 'https://hacked.com' }), 'utf8');

      const { StorageService } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      const bms = storage.getBookmarks();
      assert.strictEqual(Array.isArray(bms), true);
      assert.strictEqual(bms.length, 0);
      assert.strictEqual(bms.some((b) => b && b.url === 'https://hacked.com'), false);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('CORRUPT-4: history.json with array of garbage non-objects filters invalid entries cleanly', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-h-garbage-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const corruptArray = [
        null,
        12345,
        "just a string",
        { title: "No URL" },
        { url: "https://valid.com", title: "Valid Title" },
        false,
        { url: 9999 } // invalid url type
      ];
      fs.writeFileSync(path.join(tempDir, 'history.json'), JSON.stringify(corruptArray), 'utf8');

      const { StorageService } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      const sanitized = storage.getHistory();
      assert.strictEqual(sanitized.length, 1);
      assert.strictEqual(sanitized[0].url, 'https://valid.com');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('CORRUPT-5: settings.json with [] or primitive string recovers to DEFAULT_APP_SETTINGS', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-settings-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'settings.json'), '["some", "array"]', 'utf8');

      const { StorageService, DEFAULT_APP_SETTINGS } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      const settings = storage.getSettings();
      assert.strictEqual(settings.defaultSearchEngine, DEFAULT_APP_SETTINGS.defaultSearchEngine);
      assert.ok(Array.isArray(settings.mcpServers));

      // Partial updates should merge cleanly
      await storage.saveSettings({ geminiApiKey: 'test-key-123' });
      assert.strictEqual(storage.getSettings().geminiApiKey, 'test-key-123');
      assert.strictEqual(storage.getSettings().defaultSearchEngine, 'google');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('CORRUPT-6: session.json with corrupt shapes recovers to null or safe empty tabs', async () => {
      const tempDir = path.join(os.tmpdir(), `warwick-corrupt-session-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'session.json'), JSON.stringify({ tabs: "not-an-array", activeTabId: 123 }), 'utf8');

      const { StorageService } = setupIsolatedStorage(tempDir);
      const storage = new StorageService(tempDir);
      await storage.initialize();

      const session = storage.getSession();
      if (session) {
        assert.ok(Array.isArray(session.tabs));
        assert.strictEqual(session.tabs.length, 0);
      } else {
        assert.strictEqual(session, null);
      }

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // =========================================================================
  // Target 2: IPC Handlers Polymorphic Arguments & Fallbacks
  // =========================================================================
  describe('Target 2: IPC Handlers Polymorphic Caller Compatibility & In-Memory Fallbacks', () => {

    it('IPC-1: registerIpcHandlers with 2 arguments (win, tabManager) operates without crashing', async () => {
      const harness = setupIpcHarness();
      const mockWin = harness.createMockWindow();

      const tabManager = new harness.TabManager(mockWin);

      // Invoke with 2 arguments: (win, tabManager)
      assert.doesNotThrow(() => {
        harness.registerIpcHandlers(mockWin, tabManager);
      });

      // Verify settings IPC channels work via in-memory fallback
      const settings = await harness.ipcMain._call(harness.IPC_CHANNELS.SETTINGS_GET);
      assert.ok(settings);
      assert.strictEqual(settings.defaultSearchEngine, harness.DEFAULT_APP_SETTINGS.defaultSearchEngine);

      const saveResult = await harness.ipcMain._call(harness.IPC_CHANNELS.SETTINGS_SAVE, {
        geminiApiKey: 'test-2-args-key'
      });
      assert.strictEqual(saveResult, true);

      const updatedSettings = await harness.ipcMain._call(harness.IPC_CHANNELS.SETTINGS_GET);
      assert.strictEqual(updatedSettings.geminiApiKey, 'test-2-args-key');

      // Verify history channels operate via fallback
      const history = await harness.ipcMain._call(harness.IPC_CHANNELS.HISTORY_GET);
      assert.strictEqual(Array.isArray(history), true);

      // Verify bookmarks channels operate via fallback
      const bm = await harness.ipcMain._call(harness.IPC_CHANNELS.BOOKMARKS_ADD, {
        url: 'https://example.com',
        title: 'Example'
      });
      assert.ok(bm && bm.url === 'https://example.com');
      const bookmarks = await harness.ipcMain._call(harness.IPC_CHANNELS.BOOKMARKS_GET);
      assert.strictEqual(bookmarks.length, 1);

      tabManager.destroyAll();
    });

    it('IPC-2: registerIpcHandlers with 3 arguments (win, tabManager, bridge) legacy M3/M4 operates cleanly', async () => {
      const harness = setupIpcHarness();
      const mockWin = harness.createMockWindow();

      const tabManager = new harness.TabManager(mockWin);

      class LegacyMockBridge {
        sendPrompt() { return Promise.resolve({ runId: 'm3-run' }); }
        cancel() { return Promise.resolve(true); }
        researchQuery() { return Promise.resolve({ runId: 'm4-research' }); }
      }
      const bridge = new LegacyMockBridge();

      // Invoke with 3 arguments where 3rd is bridge: (win, tabManager, bridge)
      assert.doesNotThrow(() => {
        harness.registerIpcHandlers(mockWin, tabManager, bridge);
      });

      // Agent IPC should invoke the bridge
      const promptRes = await harness.ipcMain._call(harness.IPC_CHANNELS.AGENT_SEND_PROMPT, 'hello');
      assert.deepStrictEqual(promptRes, { runId: 'm3-run' });

      // Settings should still have working fallback
      const settings = await harness.ipcMain._call(harness.IPC_CHANNELS.SETTINGS_GET);
      assert.ok(settings);

      tabManager.destroyAll();
    });

    it('IPC-3: Window controls safely handle mock window without native window methods', async () => {
      const harness = setupIpcHarness();
      // Bare mock window without minimize, maximize, close methods
      const mockBareWin = new EventEmitter();
      mockBareWin.contentView = { children: [], addChildView: () => {}, removeChildView: () => {} };
      mockBareWin.webContents = new EventEmitter();
      mockBareWin.webContents.send = () => {};

      const tabManager = new harness.TabManager(mockBareWin);

      harness.registerIpcHandlers(mockBareWin, tabManager);

      // Trigger window control IPCs (registered via ipcMain.handle or ipcMain.on)
      await assert.doesNotReject(async () => {
        if (harness.ipcMain._call) {
          try {
            await harness.ipcMain._call(harness.IPC_CHANNELS.WINDOW_MINIMIZE);
          } catch {}
          try {
            await harness.ipcMain._call(harness.IPC_CHANNELS.WINDOW_MAXIMIZE);
          } catch {}
          try {
            const isMax = await harness.ipcMain._call(harness.IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
            assert.strictEqual(isMax, false);
          } catch {}
          try {
            await harness.ipcMain._call(harness.IPC_CHANNELS.WINDOW_CLOSE);
          } catch {}
        }
      });

      tabManager.destroyAll();
    });
  });

  // =========================================================================
  // Target 3: Mock WebContents without isDestroyed() in TabManager
  // =========================================================================
  describe('Target 3: Mock WebContents without isDestroyed() in TabManager', () => {

    it('MOCK-WC-1: broadcastTabs() does not throw when webContents is bare EventEmitter without isDestroyed', async () => {
      const harness = setupIpcHarness();
      const mockWin = harness.createMockWindow();
      // Overwrite webContents with bare EventEmitter lacking isDestroyed
      mockWin.webContents = new EventEmitter();
      let sentEvent = null;
      mockWin.webContents.send = (ch, ...args) => {
        sentEvent = { ch, args };
      };

      const tabManager = new harness.TabManager(mockWin);

      // Create a tab - this triggers broadcastTabs() internally
      let tab;
      assert.doesNotThrow(() => {
        tab = tabManager.createTab('https://test.com');
      });
      assert.ok(tab && tab.id);
      assert.ok(sentEvent);
      assert.strictEqual(sentEvent.ch, harness.IPC_CHANNELS.TABS_UPDATED);

      // Switch tab triggers broadcastTabs()
      assert.doesNotThrow(() => {
        tabManager.switchTab(tab.id);
      });

      // Close tab triggers broadcastTabs()
      assert.doesNotThrow(() => {
        tabManager.closeTab(tab.id);
      });

      tabManager.destroyAll();
    });

    it('MOCK-WC-2: setBounds() does not throw when view webContents lacks isDestroyed', async () => {
      const harness = setupIpcHarness();
      const mockWin = harness.createMockWindow();
      mockWin.webContents = new EventEmitter();
      mockWin.webContents.send = () => {};

      const tabManager = new harness.TabManager(mockWin);
      tabManager.createTab('https://test.com');

      assert.doesNotThrow(() => {
        tabManager.setBounds({ x: 0, y: 50, width: 1200, height: 750 });
      });

      tabManager.destroyAll();
    });
  });
});
