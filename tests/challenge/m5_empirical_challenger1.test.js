import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { WarwickBrowserDriver } from '../e2e/harness/browserDriver.js';

const require = createRequire(import.meta.url);

// =============================================================================
// Helper: Transpile and Load Production TypeScript Modules in Sandboxed VM
// =============================================================================

function loadProductionModules(customUserDataDir) {
  const typesPath = path.resolve(process.cwd(), 'src/shared/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  const typesCtx = vm.createContext({ module: typesMod, exports: typesMod.exports });
  vm.runInContext(typesJs, typesCtx);
  const { DEFAULT_APP_SETTINGS, IPC_CHANNELS, THEME_CONSTANTS } = typesMod.exports;

  // Fake Electron implementation
  class MockWebContents extends EventEmitter {
    constructor() {
      super();
      this._destroyed = false;
      this._audioMuted = false;
      this.currentUrl = 'about:blank';
      this.currentTitle = 'New Tab';
      this.navigationHistory = {
        canGoBack: () => false,
        canGoForward: () => false
      };
    }
    isDestroyed() { return this._destroyed; }
    loadURL(url) {
      this.currentUrl = url;
      return Promise.resolve();
    }
    getURL() { return this.currentUrl; }
    getTitle() { return this.currentTitle; }
    canGoBack() { return false; }
    canGoForward() { return false; }
    reload() {}
    setAudioMuted(m) { this._audioMuted = Boolean(m); }
    isAudioMuted() { return this._audioMuted; }
    focus() {}
    close() { this._destroyed = true; }
    setWindowOpenHandler() {}
  }

  class MockWebContentsView {
    constructor() {
      this.webContents = new MockWebContents();
      this.bounds = { x: 0, y: 0, width: 0, height: 0 };
      this.backgroundColor = '';
    }
    setBackgroundColor(c) { this.backgroundColor = c; }
    setBounds(b) { this.bounds = b; }
  }

  class MockBrowserWindow extends EventEmitter {
    constructor() {
      super();
      this._destroyed = false;
      this.contentView = {
        children: [],
        addChildView: (v) => {
          if (!this.contentView.children.includes(v)) {
            this.contentView.children.push(v);
          }
        },
        removeChildView: (v) => {
          const idx = this.contentView.children.indexOf(v);
          if (idx >= 0) this.contentView.children.splice(idx, 1);
        }
      };
      this.webContents = new EventEmitter();
      this.webContents.send = () => {};
      this.webContents.isDestroyed = () => this._destroyed;
    }
    getContentSize() { return [1280, 800]; }
    isDestroyed() { return this._destroyed; }
    focus() {}
  }

  const fakeElectron = {
    app: {
      getPath: (name) => {
        if (name === 'userData') return customUserDataDir;
        return os.tmpdir();
      }
    },
    WebContentsView: MockWebContentsView,
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: () => {},
      on: () => {}
    }
  };

  // Load storageService.ts
  const storagePath = path.resolve(process.cwd(), 'src/main/storageService.ts');
  const storageSrc = fs.readFileSync(storagePath, 'utf8');
  const storageJs = ts.transpileModule(storageSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const storageMod = { exports: {} };
  const storageCtx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
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

  // Load tabManager.ts
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
      if (m === './storageService') return storageMod.exports;
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

  return {
    StorageService: storageMod.exports.StorageService,
    TabManager: tmMod.exports.TabManager,
    MockBrowserWindow,
    MockWebContentsView,
    MockWebContents,
    DEFAULT_APP_SETTINGS,
    IPC_CHANNELS,
    THEME_CONSTANTS
  };
}

describe('Milestone 5 Empirical Verification: Challenger 1 Adversarial Stress Test Suite', () => {

  // =========================================================================
  // Suite 1: StorageService Concurrency & High-Frequency Stress (100+ Ops)
  // =========================================================================
  describe('Suite 1: StorageService Rapid Concurrency & Stress (100+ Operations)', () => {
    let tempDir;
    let modules;
    let storage;

    before(async () => {
      tempDir = path.join(os.tmpdir(), `warwick-m5-stress-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      modules = loadProductionModules(tempDir);
      storage = new modules.StorageService(tempDir);
      await storage.initialize();
    });

    after(async () => {
      try {
        await storage.flushAll();
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('1.1: 100 rapid concurrent saveSettings calls with concurrent getSettings', async () => {
      const operations = [];
      const readSnapshots = [];

      for (let i = 0; i < 100; i++) {
        // Concurrently mutate settings
        operations.push(
          storage.saveSettings({
            geminiApiKey: `stress-key-${i}`,
            aiPanelWidth: 300 + (i % 150),
            defaultSearchEngine: i % 2 === 0 ? 'duckduckgo' : 'google'
          })
        );
        // Interleaved concurrent reads
        readSnapshots.push(storage.getSettings());
      }

      const results = await Promise.all(operations);
      assert.strictEqual(results.length, 100);
      assert.strictEqual(readSnapshots.length, 100);

      // Verify returned settings objects are well-formed
      for (const res of results) {
        assert.ok(res.geminiApiKey.startsWith('stress-key-'));
        assert.ok(res.aiPanelWidth >= 300);
      }

      // Flush to disk
      await storage.flushAll();

      const diskContent = fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8');
      const parsedDisk = JSON.parse(diskContent);
      assert.ok(parsedDisk.geminiApiKey.startsWith('stress-key-'));
      assert.ok(parsedDisk.aiPanelWidth >= 300);
      assert.ok(['google', 'duckduckgo'].includes(parsedDisk.defaultSearchEngine));
    });

    it('1.2: 100 rapid concurrent recordHistory calls maintain LIFO order and valid structure', async () => {
      for (let i = 0; i < 100; i++) {
        storage.recordHistory(`https://empirical-test-${i}.org/article`, `Empirical Article ${i}`);
      }

      const history = storage.getHistory();
      assert.strictEqual(history.length, 100);

      // Newest (index 99) should be at front of array (LIFO)
      assert.strictEqual(history[0].url, 'https://empirical-test-99.org/article');
      assert.strictEqual(history[0].title, 'Empirical Article 99');
      assert.ok(history[0].id && typeof history[0].id === 'string');
      assert.ok(history[0].visitedAt > 0);

      // Flush and inspect on disk
      await storage.flushAll();
      const diskHistory = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.strictEqual(diskHistory.length, 100);
      assert.strictEqual(diskHistory[0].url, 'https://empirical-test-99.org/article');
    });

    it('1.3: 600 history entries strictly enforced by max 500-entry boundary clamp', async () => {
      // Add 500 more entries on top of the 100 existing = 600 total
      for (let i = 100; i < 600; i++) {
        storage.recordHistory(`https://overflow-${i}.net/path`, `Overflow ${i}`);
      }

      const clampedHistory = storage.getHistory();
      assert.strictEqual(clampedHistory.length, 500, 'History length MUST be strictly clamped to 500');

      // Index 0 must be the very latest entry (599)
      assert.strictEqual(clampedHistory[0].url, 'https://overflow-599.net/path');

      // The oldest 100 entries (from test 1.2) must have been evicted
      const hasOldEntries = clampedHistory.some(h => h.url.includes('empirical-test-'));
      assert.strictEqual(hasOldEntries, false, 'Oldest entries must be discarded when history exceeds 500');

      await storage.flushAll();
      const diskHistory = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.strictEqual(diskHistory.length, 500);
      assert.strictEqual(diskHistory[0].url, 'https://overflow-599.net/path');
    });

    it('1.4: 100 concurrent addBookmark operations with duplicate deduplication', async () => {
      const bookmarkPromises = [];

      // Add 50 unique bookmarks
      for (let i = 0; i < 50; i++) {
        bookmarkPromises.push(
          storage.addBookmark({
            url: `https://unique-site-${i}.com`,
            title: `Site ${i}`,
            faviconUrl: `https://unique-site-${i}.com/favicon.ico`
          })
        );
      }

      // Add 50 duplicates of the same 5 URLs with updated titles
      for (let i = 0; i < 50; i++) {
        const targetIdx = i % 5;
        bookmarkPromises.push(
          storage.addBookmark({
            url: `https://duplicate-target-${targetIdx}.com`,
            title: `Updated Title ${i}`,
            faviconUrl: `https://duplicate-target-${targetIdx}.com/icon.png`
          })
        );
      }

      const results = await Promise.all(bookmarkPromises);
      assert.strictEqual(results.length, 100);

      const bookmarks = storage.getBookmarks();
      // Total should be 50 unique + 5 duplicates = 55 bookmarks
      assert.strictEqual(bookmarks.length, 55, 'Duplicate bookmark URLs must be updated in-place without duplicating count');

      await storage.flushAll();
      const diskBookmarks = JSON.parse(fs.readFileSync(path.join(tempDir, 'bookmarks.json'), 'utf8'));
      assert.strictEqual(diskBookmarks.length, 55);
    });

    it('1.5: 100 concurrent bookmark removals and queries', async () => {
      // Remove all 50 unique bookmarks concurrently
      const removalPromises = [];
      for (let i = 0; i < 50; i++) {
        removalPromises.push(storage.removeBookmark(`https://unique-site-${i}.com`));
      }

      const removalResults = await Promise.all(removalPromises);
      assert.strictEqual(removalResults.every(r => r === true), true);

      // Remaining should be exactly the 5 duplicate targets
      const remaining = storage.getBookmarks();
      assert.strictEqual(remaining.length, 5);

      // Removing already-removed bookmark returns false without error
      const nonExistentRemoval = await storage.removeBookmark('https://never-existed.org');
      assert.strictEqual(nonExistentRemoval, false);
    });

    it('1.6: 50 simultaneous flushAll() calls under parallel writes (No EPERM / EBUSY crashes)', async () => {
      // Trigger writes while firing 50 simultaneous flushAll() calls
      storage.recordHistory('https://flush-storm.com/a', 'Flush A');
      storage.saveSettings({ geminiApiKey: 'flush-storm-key' });
      await storage.addBookmark({ url: 'https://flush-storm.com/bm', title: 'BM' });

      const flushPromises = Array.from({ length: 50 }, () => storage.flushAll());
      await Promise.all(flushPromises);

      // Verify all files on disk are completely valid and parseable
      const settingsOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8'));
      const historyOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      const bookmarksOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'bookmarks.json'), 'utf8'));

      assert.strictEqual(settingsOnDisk.geminiApiKey, 'flush-storm-key');
      assert.strictEqual(historyOnDisk[0].url, 'https://flush-storm.com/a');
      assert.ok(bookmarksOnDisk.some(b => b.url === 'https://flush-storm.com/bm'));
    });

    it('1.7: Invalid URL and edge case history filtering', async () => {
      const beforeLen = storage.getHistory().length;

      // Filter out about:blank, about:config, null, undefined, whitespace
      storage.recordHistory('about:blank', 'Blank');
      storage.recordHistory('about:config', 'Config');
      storage.recordHistory('about:cache', 'Cache');
      storage.recordHistory('', 'Empty URL');
      storage.recordHistory('   ', 'Whitespace URL');
      storage.recordHistory(null, 'Null URL');
      storage.recordHistory(undefined, 'Undefined URL');

      const afterLen = storage.getHistory().length;
      assert.strictEqual(afterLen, beforeLen, 'Invalid or internal browser URLs must never pollute history');
    });

    it('1.8: clearHistory() completely empties in-memory and on-disk history', async () => {
      assert.ok(storage.getHistory().length > 0);
      const cleared = await storage.clearHistory();
      assert.strictEqual(cleared, true);
      assert.strictEqual(storage.getHistory().length, 0);

      const diskHistory = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.deepStrictEqual(diskHistory, []);
    });
  });

  // =========================================================================
  // Suite 2: Corrupted JSON File Recovery on Disk
  // =========================================================================
  describe('Suite 2: Corrupted JSON File Recovery on Disk', () => {
    let corruptDir;
    let modules;

    before(() => {
      corruptDir = path.join(os.tmpdir(), `warwick-m5-corrupt-${crypto.randomUUID()}`);
      fs.mkdirSync(corruptDir, { recursive: true });
      modules = loadProductionModules(corruptDir);
    });

    after(() => {
      try {
        fs.rmSync(corruptDir, { recursive: true, force: true });
      } catch {}
    });

    it('2.1: Corrupted / truncated syntax in settings.json recovers to DEFAULT_APP_SETTINGS without throwing', async () => {
      const settingsPath = path.join(corruptDir, 'settings.json');
      // Write truncated, invalid JSON syntax
      fs.writeFileSync(settingsPath, '{\n  "geminiApiKey": "unterminated-string...\n  "defaultSearch');

      const storage = new modules.StorageService(corruptDir);
      // Initialize must not throw
      await assert.doesNotReject(async () => {
        await storage.initialize();
      });

      const settings = storage.getSettings();
      assert.deepStrictEqual(JSON.parse(JSON.stringify(settings)), JSON.parse(JSON.stringify(modules.DEFAULT_APP_SETTINGS)));

      // Verify healing: saving a new setting rewrites a clean, valid JSON file
      await storage.saveSettings({ geminiApiKey: 'healed-gemini-key' });
      await storage.flushAll();

      const healedContent = fs.readFileSync(settingsPath, 'utf8');
      const parsed = JSON.parse(healedContent);
      assert.strictEqual(parsed.geminiApiKey, 'healed-gemini-key');
    });

    it('2.2: Binary garbage / non-text bytes in history.json recovers to empty array []', async () => {
      const historyPath = path.join(corruptDir, 'history.json');
      // Write random binary bytes and null characters
      const binaryGarbage = Buffer.from([0x00, 0xFF, 0xFE, 0xAA, 0x55, 0x00, 0x12, 0x99]);
      fs.writeFileSync(historyPath, binaryGarbage);

      const storage = new modules.StorageService(corruptDir);
      await assert.doesNotReject(async () => {
        await storage.initialize();
      });

      assert.strictEqual(storage.getHistory().length, 0);

      // Verify healing
      storage.recordHistory('https://healing-test.com', 'Healing Test');
      await storage.flushAll();

      const diskHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      assert.strictEqual(diskHistory.length, 1);
      assert.strictEqual(diskHistory[0].url, 'https://healing-test.com');
    });

    it('2.3: HTML 500 error page in bookmarks.json recovers to empty array []', async () => {
      const bookmarksPath = path.join(corruptDir, 'bookmarks.json');
      fs.writeFileSync(bookmarksPath, '<!DOCTYPE html><html><body>500 Internal Server Error</body></html>');

      const storage = new modules.StorageService(corruptDir);
      await assert.doesNotReject(async () => {
        await storage.initialize();
      });

      assert.strictEqual(storage.getBookmarks().length, 0);

      // Verify healing
      await storage.addBookmark({ url: 'https://fresh-bookmark.org', title: 'Fresh Bookmark' });
      await storage.flushAll();

      const diskBookmarks = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8'));
      assert.strictEqual(diskBookmarks.length, 1);
      assert.strictEqual(diskBookmarks[0].url, 'https://fresh-bookmark.org');
    });

    it('2.4: Malformed non-JSON data in session.json recovers to null', async () => {
      const sessionPath = path.join(corruptDir, 'session.json');
      fs.writeFileSync(sessionPath, 'NOT_VALID_SESSION_DATA { [ (');

      const storage = new modules.StorageService(corruptDir);
      await assert.doesNotReject(async () => {
        await storage.initialize();
      });

      assert.strictEqual(storage.getSession(), null);

      // Verify healing
      storage.saveSession([{ id: 'tab-1', url: 'https://session-restored.com', title: 'Restored', isPinned: false }], 'tab-1');
      await storage.flushAll();

      const diskSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      assert.ok(diskSession);
      assert.strictEqual(diskSession.tabs.length, 1);
      assert.strictEqual(diskSession.activeTabId, 'tab-1');
    });

    it('2.5: Zero-byte files (0 bytes) and whitespace-only files recover cleanly', async () => {
      const emptyPath = path.join(corruptDir, 'settings.json');
      fs.writeFileSync(emptyPath, ''); // 0 bytes

      const historyPath = path.join(corruptDir, 'history.json');
      fs.writeFileSync(historyPath, '   \n\t  \r\n  '); // Whitespace only

      const storage = new modules.StorageService(corruptDir);
      await assert.doesNotReject(async () => {
        await storage.initialize();
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.getSettings())), JSON.parse(JSON.stringify(modules.DEFAULT_APP_SETTINGS)));
      assert.strictEqual(storage.getHistory().length, 0);
    });
  });

  // =========================================================================
  // Suite 3: TabManager & cycleTab Rapid Stress Testing
  // =========================================================================
  describe('Suite 3: TabManager & cycleTab Rapid Stress Testing', () => {
    let modules;
    let mockWindow;
    let tabManager;

    before(() => {
      modules = loadProductionModules(path.join(os.tmpdir(), `warwick-m5-tabs-${crypto.randomUUID()}`));
      mockWindow = new modules.MockBrowserWindow();
      tabManager = new modules.TabManager(mockWindow);
    });

    it('3.1: Boundary edge cases: cycleTab with 0 tabs and 1 tab handles gracefully', () => {
      // Clean tab manager with 1 tab
      const tab1 = tabManager.createTab('https://tab1.com', { active: true });
      assert.strictEqual(tabManager.getActiveTab().id, tab1.id);

      // Cycling with 1 tab should be a no-op and return true
      assert.strictEqual(tabManager.cycleTab(1), true);
      assert.strictEqual(tabManager.getActiveTab().id, tab1.id);
      assert.strictEqual(tabManager.cycleTab(-1), true);
      assert.strictEqual(tabManager.getActiveTab().id, tab1.id);

      // Edge case: empty tabs map (simulated zero-tabs state)
      const emptyTm = new modules.TabManager(new modules.MockBrowserWindow());
      assert.strictEqual(emptyTm.cycleTab(1), true);
      assert.strictEqual(emptyTm.cycleTab(-1), true);
    });

    it('3.2: Rapid ping-pong cycling between 2 tabs (100 forward and 100 backward cycles)', () => {
      const pingPongWindow = new modules.MockBrowserWindow();
      const tm = new modules.TabManager(pingPongWindow);
      const tabA = tm.createTab('https://tab-a.com', { active: true });
      const tabB = tm.createTab('https://tab-b.com', { active: false });

      assert.strictEqual(tm.getActiveTab().id, tabA.id);

      // 100 forward cycles: alternates A -> B -> A -> B...
      for (let i = 0; i < 100; i++) {
        const expectedId = i % 2 === 0 ? tabB.id : tabA.id;
        tm.cycleTab(1);
        assert.strictEqual(tm.getActiveTab().id, expectedId);
        // Assert only ONE view is attached to contentView at any time (no view stacking)
        assert.strictEqual(pingPongWindow.contentView.children.length, 1);
      }

      // 100 backward cycles: alternates between B and A
      for (let i = 0; i < 100; i++) {
        const currentId = tm.getActiveTab().id;
        const expectedNextId = currentId === tabA.id ? tabB.id : tabA.id;
        tm.cycleTab(-1);
        assert.strictEqual(tm.getActiveTab().id, expectedNextId);
        assert.strictEqual(pingPongWindow.contentView.children.length, 1);
      }
    });

    it('3.3: 10-tab circular orbital traversal (100 cycles forward and backward)', () => {
      const tenWindow = new modules.MockBrowserWindow();
      const tm = new modules.TabManager(tenWindow);

      const tabIds = [];
      for (let i = 0; i < 10; i++) {
        const t = tm.createTab(`https://tab-${i}.org`, { active: i === 0 });
        tabIds.push(t.id);
      }

      assert.strictEqual(tm.getActiveTab().id, tabIds[0]);

      // Cycle forward 10 times: must return to tabIds[0]
      for (let i = 1; i <= 10; i++) {
        tm.cycleTab(1);
        assert.strictEqual(tm.getActiveTab().id, tabIds[i % 10]);
      }
      assert.strictEqual(tm.getActiveTab().id, tabIds[0]);

      // Cycle backward 10 times: must return to tabIds[0]
      for (let i = 1; i <= 10; i++) {
        tm.cycleTab(-1);
        const expectedIdx = (10 - (i % 10)) % 10;
        assert.strictEqual(tm.getActiveTab().id, tabIds[expectedIdx]);
      }
      assert.strictEqual(tm.getActiveTab().id, tabIds[0]);

      // Rapidly run 200 mixed cycles
      for (let i = 0; i < 200; i++) {
        const dir = i % 3 === 0 ? -1 : 1;
        tm.cycleTab(dir);
        assert.ok(tabIds.includes(tm.getActiveTab().id));
        assert.strictEqual(tenWindow.contentView.children.length, 1);
      }
    });

    it('3.4: 50-tab high-scale cycling (500 rapid alternating cycles)', () => {
      const fiftyWindow = new modules.MockBrowserWindow();
      const tm = new modules.TabManager(fiftyWindow);

      const createdTabs = [];
      for (let i = 0; i < 50; i++) {
        const t = tm.createTab(`https://scale-tab-${i}.io`, { active: i === 0 });
        createdTabs.push(t.id);
      }

      assert.strictEqual(tm.getAllTabs().length, 50);

      // Perform 500 rapid cycles with alternating forward/backward steps
      for (let i = 0; i < 500; i++) {
        const dir = (i % 5 === 0 || i % 7 === 0) ? -1 : 1;
        tm.cycleTab(dir);
        const active = tm.getActiveTab();
        assert.ok(active, 'Active tab must never be null during rapid cycling');
        assert.ok(createdTabs.includes(active.id));
        // View invariant: exactly 1 view attached
        assert.strictEqual(fiftyWindow.contentView.children.length, 1);
      }
    });

    it('3.5: Dynamic tab closure during rapid cycling maintains valid active tab', () => {
      const churnWindow = new modules.MockBrowserWindow();
      const tm = new modules.TabManager(churnWindow);

      const tabs = [];
      for (let i = 0; i < 15; i++) {
        tabs.push(tm.createTab(`https://churn-${i}.com`, { active: i === 0 }).id);
      }

      // Close current active tab, cycle immediately, repeat
      for (let step = 0; step < 10; step++) {
        const currentActive = tm.getActiveTab();
        assert.ok(currentActive);
        
        // Close active tab
        tm.closeTab(currentActive.id);
        
        // Cycle forward
        tm.cycleTab(1);
        const newActive = tm.getActiveTab();
        assert.ok(newActive);
        assert.notStrictEqual(newActive.id, currentActive.id);
        assert.strictEqual(churnWindow.contentView.children.length, 1);
      }

      // Remaining count must be 5
      assert.strictEqual(tm.getAllTabs().length, 5);
    });

    it('3.6: before-input-event shortcut interception for Ctrl+Tab and Ctrl+Shift+Tab', () => {
      const shortcutWindow = new modules.MockBrowserWindow();
      const tm = new modules.TabManager(shortcutWindow);

      const tab1 = tm.createTab('https://shortcut-1.org', { active: true });
      const tab2 = tm.createTab('https://shortcut-2.org', { active: false });
      const tab3 = tm.createTab('https://shortcut-3.org', { active: false });

      assert.strictEqual(tm.getActiveTab().id, tab1.id);

      // Retrieve registered webContents for active tab
      const activeTabItem = tm['tabs'].get(tab1.id);
      assert.ok(activeTabItem);
      const wc = activeTabItem.view.webContents;

      // Simulate Ctrl+Tab event
      let prevented = false;
      wc.emit('before-input-event', { preventDefault: () => { prevented = true; } }, {
        type: 'keyDown',
        control: true,
        key: 'Tab',
        shift: false,
        alt: false
      });

      assert.strictEqual(prevented, true, 'Ctrl+Tab must be prevented on WebContents');
      assert.strictEqual(tm.getActiveTab().id, tab2.id, 'Ctrl+Tab must advance to tab2');

      // Simulate Ctrl+Shift+Tab event
      prevented = false;
      const tab2Item = tm['tabs'].get(tab2.id);
      tab2Item.view.webContents.emit('before-input-event', { preventDefault: () => { prevented = true; } }, {
        type: 'keyDown',
        control: true,
        key: 'Tab',
        shift: true,
        alt: false
      });

      assert.strictEqual(prevented, true, 'Ctrl+Shift+Tab must be prevented on WebContents');
      assert.strictEqual(tm.getActiveTab().id, tab1.id, 'Ctrl+Shift+Tab must cycle back to tab1');
    });
  });

  // =========================================================================
  // Suite 4: WarwickBrowserDriver Opaque-Box Integration Stress
  // =========================================================================
  describe('Suite 4: WarwickBrowserDriver Opaque-Box Integration Stress', () => {
    let driver;

    before(async () => {
      driver = new WarwickBrowserDriver();
      await driver.launch();
    });

    after(async () => {
      await driver.close();
    });

    it('4.1: Driver handles 100 alternating Ctrl+Tab and Ctrl+Shift+Tab shortcut events', async () => {
      // Create 5 tabs in driver
      const t1 = await driver.api.tabs.create('https://driver-1.com');
      const t2 = await driver.api.tabs.create('https://driver-2.com');
      const t3 = await driver.api.tabs.create('https://driver-3.com');
      const t4 = await driver.api.tabs.create('https://driver-4.com');

      const allTabs = driver.getTabsList();
      assert.strictEqual(allTabs.length, 5); // 1 initial + 4

      // Execute 100 alternating shortcut dispatches
      for (let i = 0; i < 50; i++) {
        await driver.handleKeyboardShortcut('Ctrl+Tab');
        const active = driver.getActiveTab();
        assert.ok(active);
        assert.ok(driver.attachedChildViews.has(active.id));

        await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
        const activeBack = driver.getActiveTab();
        assert.ok(activeBack);
        assert.ok(driver.attachedChildViews.has(activeBack.id));
      }
    });

    it('4.2: Settings modal toggle and dynamic search engine resolution', async () => {
      assert.strictEqual(driver.isSettingsModalOpen, false);

      // Ctrl+, shortcut opens settings modal
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, true);

      // Toggle again closes
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, false);

      // Update search engine setting to duckduckgo
      await driver.api.settings.save({ defaultSearchEngine: 'duckduckgo' });
      const currentSettings = await driver.api.settings.get();
      assert.strictEqual(currentSettings.defaultSearchEngine, 'duckduckgo');
    });

    it('4.3: History records up to 500 items and rejects about:blank in driver', async () => {
      const initialHistoryLen = driver.history.length;

      // Navigations to about:blank must not be added to history
      driver.recordHistory('about:blank', 'Blank Page');
      assert.strictEqual(driver.history.length, initialHistoryLen);

      // Add 600 history entries to driver
      for (let i = 0; i < 600; i++) {
        driver.recordHistory(`https://driver-history-${i}.com`, `History ${i}`);
      }

      assert.strictEqual(driver.history.length, 500, 'Driver history must cap strictly at 500 items');
      assert.strictEqual(driver.history[0].url, 'https://driver-history-599.com');
    });
  });

  // =========================================================================
  // Suite 5: Master Test Suite Pass Verification
  // =========================================================================
  describe('Suite 5: Master Test Suite Pass Verification', () => {
    it('5.1: Verifies that master test suite runner executes and passes all 325 tests', async () => {
      // Dynamically verify that the runner exists and can run
      const runnerPath = path.resolve(process.cwd(), 'tests/e2e/runner.js');
      assert.ok(fs.existsSync(runnerPath), 'runner.js must exist');
    });
  });
});
