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

const require = createRequire(import.meta.url);

function loadStorageService(customUserDataDir) {
  const typesPath = path.resolve(process.cwd(), 'src/shared/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  const typesCtx = vm.createContext({ module: typesMod, exports: typesMod.exports });
  vm.runInContext(typesJs, typesCtx);

  const fakeElectron = {
    app: {
      getPath: (name) => {
        if (name === 'userData') return customUserDataDir;
        return os.tmpdir();
      }
    }
  };

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

  return {
    StorageService: storageMod.exports.StorageService,
    DEFAULT_APP_SETTINGS: typesMod.exports.DEFAULT_APP_SETTINGS
  };
}

describe('Milestone 5 Remediation 2: Deep Concurrency & Parallel FlushAll Stress Suite', () => {

  // =========================================================================
  // Suite 1: Rapid Concurrent Cross-Store Writing (All 4 Stores Interleaved)
  // =========================================================================
  describe('Suite 1: Extreme Cross-Store Concurrency Stress (addHistory, addBookmark, saveSettings, saveSession)', () => {
    let tempDir;
    let storage;
    let DEFAULT_APP_SETTINGS;

    before(async () => {
      tempDir = path.join(os.tmpdir(), `warwick-m5-rem2-stress-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const loaded = loadStorageService(tempDir);
      DEFAULT_APP_SETTINGS = loaded.DEFAULT_APP_SETTINGS;
      storage = new loaded.StorageService(tempDir);
      await storage.initialize();
    });

    after(async () => {
      try {
        await storage.flushAll(true);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('1.1: 800 rapid interleaved concurrent operations across all 4 stores with concurrent reads', async () => {
      const writePromises = [];
      const readResults = {
        settings: [],
        history: [],
        bookmarks: [],
        session: []
      };

      for (let i = 0; i < 200; i++) {
        // 1. saveSettings (async)
        writePromises.push(
          storage.saveSettings({
            geminiApiKey: `key-stress-${i}`,
            aiPanelWidth: 200 + (i % 200),
            defaultSearchEngine: i % 2 === 0 ? 'duckduckgo' : 'google'
          })
        );

        // 2. addBookmark (async) - mix of new and duplicate URLs
        writePromises.push(
          storage.addBookmark({
            url: `https://example-concurrent.org/page-${i % 50}`,
            title: `Title ${i}`,
            faviconUrl: `https://example-concurrent.org/icon-${i}.png`
          })
        );

        // 3. addHistory (sync / debounced) - both object and string signatures
        if (i % 2 === 0) {
          storage.addHistory(`https://history-concurrent.org/item-${i}`, `History Title ${i}`);
        } else {
          storage.addHistory({
            url: `https://history-concurrent.org/item-${i}`,
            title: `History Title ${i}`
          });
        }

        // 4. saveSession (sync / debounced)
        storage.saveSession(
          [
            {
              id: `tab-${i}`,
              url: `https://session-test.org/tab-${i}`,
              title: `Session Tab ${i}`,
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isMuted: false,
              isPinned: i % 5 === 0,
              isCrashed: false,
              createdAt: Date.now()
            },
            {
              id: `tab-crashed-${i}`,
              url: `https://crashed.org/${i}`,
              title: `Crashed`,
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isMuted: false,
              isPinned: false,
              isCrashed: true, // Should be filtered out
              createdAt: Date.now()
            }
          ],
          `tab-${i}`
        );

        // Interleaved concurrent reads during write flood
        readResults.settings.push(storage.getSettings());
        readResults.history.push(storage.getHistory());
        readResults.bookmarks.push(storage.getBookmarks());
        readResults.session.push(storage.getSession());
      }

      const completedWrites = await Promise.all(writePromises);
      assert.strictEqual(completedWrites.length, 400); // 200 settings + 200 bookmarks

      // Validate reads never returned corrupted or null state
      assert.strictEqual(readResults.settings.length, 200);
      for (const s of readResults.settings) {
        assert.ok(typeof s === 'object' && s !== null);
        assert.ok(s.geminiApiKey.startsWith('key-stress-'));
      }

      assert.strictEqual(readResults.history.length, 200);
      for (const h of readResults.history) {
        assert.ok(Array.isArray(h));
      }

      assert.strictEqual(readResults.bookmarks.length, 200);
      for (const b of readResults.bookmarks) {
        assert.ok(Array.isArray(b));
      }

      assert.strictEqual(readResults.session.length, 200);
      for (const sess of readResults.session) {
        assert.ok(sess !== null);
        assert.ok(Array.isArray(sess.tabs));
        // Verify crashed tabs were never saved
        assert.ok(sess.tabs.every(t => !t.url.includes('crashed.org')));
      }

      // Final in-memory state check
      const finalHistory = storage.getHistory();
      assert.strictEqual(finalHistory.length, 200);
      assert.strictEqual(finalHistory[0].url, 'https://history-concurrent.org/item-199'); // LIFO

      const finalBookmarks = storage.getBookmarks();
      // URLs were modulo 50, so exactly 50 deduplicated bookmarks should exist
      assert.strictEqual(finalBookmarks.length, 50);

      const finalSession = storage.getSession();
      assert.strictEqual(finalSession.tabs.length, 1);
      assert.strictEqual(finalSession.tabs[0].url, 'https://session-test.org/tab-199');
      assert.strictEqual(finalSession.activeTabId, 'tab-199');

      // Flush to disk
      await storage.flushAll();

      // Verify all 4 files exist on disk and parse properly
      const settingsOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8'));
      assert.strictEqual(settingsOnDisk.geminiApiKey, 'key-stress-199');

      const historyOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.strictEqual(historyOnDisk.length, 200);
      assert.strictEqual(historyOnDisk[0].url, 'https://history-concurrent.org/item-199');

      const bookmarksOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'bookmarks.json'), 'utf8'));
      assert.strictEqual(bookmarksOnDisk.length, 50);

      const sessionOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'session.json'), 'utf8'));
      assert.strictEqual(sessionOnDisk.tabs.length, 1);
      assert.strictEqual(sessionOnDisk.activeTabId, 'tab-199');
    });

    it('1.2: 1200 rapid concurrent history additions strictly respects 500 max bounds under concurrency', async () => {
      for (let i = 0; i < 1200; i++) {
        storage.addHistory(`https://burst-history-${i}.com/page`, `Burst Page ${i}`);
      }

      const history = storage.getHistory();
      assert.strictEqual(history.length, 500, 'History length must be clamped to exactly 500 entries');
      assert.strictEqual(history[0].url, 'https://burst-history-1199.com/page', 'Newest entry must be at index 0');
      assert.strictEqual(history[499].url, 'https://burst-history-700.com/page', 'Oldest retained entry must be index 700');

      await storage.flushAll();
      const diskHistory = JSON.parse(fs.readFileSync(path.join(tempDir, 'history.json'), 'utf8'));
      assert.strictEqual(diskHistory.length, 500);
      assert.strictEqual(diskHistory[0].url, 'https://burst-history-1199.com/page');
    });

    it('1.3: Concurrent addBookmark and removeBookmark race condition stress', async () => {
      // Concurrently add 100 items and remove odd numbered items
      const operations = [];

      for (let i = 0; i < 100; i++) {
        const url = `https://race-bookmark.org/item-${i}`;
        operations.push(storage.addBookmark({ url, title: `Item ${i}` }));
        if (i % 2 === 1) {
          // Concurrently remove
          operations.push(storage.removeBookmark(url));
        }
      }

      await Promise.all(operations);

      const bookmarks = storage.getBookmarks();
      assert.ok(Array.isArray(bookmarks));
      assert.ok(bookmarks.length > 0);

      await storage.flushAll();
      const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'bookmarks.json'), 'utf8'));
      assert.strictEqual(onDisk.length, bookmarks.length);
    });
  });

  // =========================================================================
  // Suite 2: Parallel Shutdown Stress & flushAll Under Heavy Write Load
  // =========================================================================
  describe('Suite 2: Parallel Shutdown & flushAll Stress', () => {
    let tempDir;
    let storage;

    before(async () => {
      tempDir = path.join(os.tmpdir(), `warwick-m5-rem2-flush-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const loaded = loadStorageService(tempDir);
      storage = new loaded.StorageService(tempDir);
      await storage.initialize();
    });

    after(async () => {
      try {
        await storage.flushAll(true);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('2.1: Continuous write storm while executing simultaneous flushAll() calls', async () => {
      let isWriting = true;
      let writeCount = 0;

      // Start asynchronous write storm
      const writeStorm = (async () => {
        let i = 0;
        while (isWriting && i < 100) {
          storage.addHistory(`https://storm-history.org/${i}`, `Storm ${i}`);
          storage.saveSettings({ geminiApiKey: `storm-key-${i}` });
          storage.saveSession([{ id: `tab-${i}`, url: `https://storm.org/${i}`, title: 'S', isLoading: false, canGoBack: false, canGoForward: false, isMuted: false, isPinned: false, isCrashed: false, createdAt: Date.now() }]);
          writeCount++;
          i++;
          await new Promise(r => setImmediate(r));
        }
      })();

      // Simultaneously fire 20 parallel flushAll(true) calls
      const flushPromises = [];
      for (let f = 0; f < 20; f++) {
        flushPromises.push(storage.flushAll(true));
      }

      const flushResults = await Promise.allSettled(flushPromises);
      isWriting = false;
      await writeStorm;

      // Ensure every single flushAll call completed with fulfilled status
      for (const res of flushResults) {
        assert.strictEqual(res.status, 'fulfilled', 'All flushAll calls must settle with fulfilled');
      }

      // Check directory for lingering .tmp files
      const files = fs.readdirSync(tempDir);
      const tmpFiles = files.filter(f => f.includes('.tmp.'));
      assert.strictEqual(tmpFiles.length, 0, 'No temporary files must linger in storage directory after flushAll');

      // Verify files on disk are valid JSON
      for (const jsonFile of ['settings.json', 'history.json', 'session.json']) {
        const filePath = path.join(tempDir, jsonFile);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          assert.doesNotThrow(() => JSON.parse(content), `${jsonFile} must be valid JSON on disk`);
        }
      }
    });

    it('2.2: 50 back-to-back rapid flushAll() cycles without error or file lock deadlock', async () => {
      for (let cycle = 0; cycle < 50; cycle++) {
        storage.saveSettings({ aiPanelWidth: 300 + (cycle % 100) });
        storage.addHistory(`https://cycle-history.org/${cycle}`, `Cycle ${cycle}`);
        await storage.flushAll(true);
      }

      const files = fs.readdirSync(tempDir);
      const tmpFiles = files.filter(f => f.includes('.tmp.'));
      assert.strictEqual(tmpFiles.length, 0);

      const settings = JSON.parse(fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8'));
      assert.strictEqual(settings.aiPanelWidth, 300 + (49 % 100));
    });

    it('2.3: Hydration verification: new StorageService instance reads back data cleanly after flushAll', async () => {
      const loaded = loadStorageService(tempDir);
      const freshStorage = new loaded.StorageService(tempDir);
      await freshStorage.initialize();

      const restoredSettings = freshStorage.getSettings();
      assert.ok(restoredSettings.geminiApiKey.startsWith('storm-key-'));

      const restoredHistory = freshStorage.getHistory();
      assert.ok(restoredHistory.length > 0);
      assert.ok(restoredHistory.every(h => h && typeof h.url === 'string'));

      const restoredSession = freshStorage.getSession();
      assert.ok(restoredSession !== null);
      assert.ok(restoredSession.tabs.length > 0);
    });
  });

  // =========================================================================
  // Suite 3: Malformed & Invalid Input Robustness in Concurrent Scenarios
  // =========================================================================
  describe('Suite 3: Malformed Input Invariants During High Concurrency', () => {
    let tempDir;
    let storage;

    before(async () => {
      tempDir = path.join(os.tmpdir(), `warwick-m5-rem2-malformed-${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const loaded = loadStorageService(tempDir);
      storage = new loaded.StorageService(tempDir);
      await storage.initialize();
    });

    after(async () => {
      try {
        await storage.flushAll(true);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('3.1: Rejects null, undefined, about:blank, empty strings in addHistory without throwing', () => {
      assert.doesNotThrow(() => {
        storage.addHistory(null);
        storage.addHistory(undefined);
        storage.addHistory('');
        storage.addHistory('   ');
        storage.addHistory('about:blank');
        storage.addHistory('about:preferences');
        storage.addHistory({ url: '' });
        storage.addHistory({ url: 'about:blank' });
        storage.addHistory(12345);
        storage.addHistory({});
      });

      assert.strictEqual(storage.getHistory().length, 0, 'No invalid entries should be recorded in history');
    });

    it('3.2: Rejects invalid bookmark entries while allowing valid ones', async () => {
      await assert.rejects(async () => {
        await storage.addBookmark(null);
      }, /Invalid bookmark item/);

      await assert.rejects(async () => {
        await storage.addBookmark({ url: '' });
      }, /Invalid bookmark item/);

      await assert.rejects(async () => {
        await storage.addBookmark({ title: 'No URL' });
      }, /Invalid bookmark item/);

      const valid = await storage.addBookmark({ url: 'https://valid.org', title: 'Valid' });
      assert.strictEqual(valid.url, 'https://valid.org');
      assert.strictEqual(storage.getBookmarks().length, 1);
    });

    it('3.3: saveSession safely strips undefined/null/crashed tabs and handles non-array input', async () => {
      storage.saveSession(null, 'none');
      assert.strictEqual(storage.getSession().tabs.length, 0);

      storage.saveSession([null, undefined, { isCrashed: true, url: 'https://bad.org' }, { url: 'https://good.org', title: 'Good' }], 'good-id');
      const session = storage.getSession();
      assert.strictEqual(session.tabs.length, 1);
      assert.strictEqual(session.tabs[0].url, 'https://good.org');
      assert.strictEqual(session.activeTabId, 'good-id');

      await storage.flushAll(true);
      const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'session.json'), 'utf8'));
      assert.strictEqual(onDisk.tabs.length, 1);
    });
  });
});
