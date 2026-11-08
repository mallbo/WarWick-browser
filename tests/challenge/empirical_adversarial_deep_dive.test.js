import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this._destroyed = false;
    this.currentUrl = '';
    this._canGoBack = false;
    this._canGoForward = false;
    this.reloadCount = 0;
    this.loadedUrls = [];
    this.navigationHistory = {
      canGoBack: () => this._canGoBack,
      canGoForward: () => this._canGoForward,
      goBack: () => {},
      goForward: () => {}
    };
  }

  isDestroyed() {
    return this._destroyed;
  }

  loadURL(url) {
    this.loadedUrls.push(url);
    this.currentUrl = url;
    return Promise.resolve();
  }

  reload() {
    this.reloadCount++;
  }

  canGoBack() {
    return this._canGoBack;
  }

  canGoForward() {
    return this._canGoForward;
  }

  focus() {}

  close() {
    this._destroyed = true;
  }

  setWindowOpenHandler() {}

  getURL() {
    return this.currentUrl;
  }

  getTitle() {
    return 'Mock Title';
  }
}

class MockWebContentsView {
  constructor() {
    this.webContents = new MockWebContents();
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.backgroundColor = '';
  }

  setBackgroundColor(c) {
    this.backgroundColor = c;
  }

  setBounds(b) {
    this.bounds = b;
  }
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
  }

  getContentSize() {
    return [1280, 800];
  }

  isDestroyed() {
    return this._destroyed;
  }
}

function loadTabManager() {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/main/tabManager.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const fakeElectron = {
    WebContentsView: MockWebContentsView,
    BrowserWindow: MockBrowserWindow
  };

  const mod = { exports: {} };
  const ctx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
      if (m === '../shared/types') return { IPC_CHANNELS: { TABS_UPDATED: 'tabs:updated' } };
      return require(m);
    },
    module: mod,
    exports: mod.exports,
    console
  });

  vm.runInContext(js, ctx);
  return { TabManager: mod.exports.TabManager, MockBrowserWindow, MockWebContentsView };
}

describe('Adversarial Deep Dive: Milestone 1 Verification', () => {
  const { TabManager, MockBrowserWindow } = loadTabManager();

  // =========================================================================
  // SUITE 1: Extensive URL & Omnibox Resolver Generator Oracle
  // =========================================================================
  describe('Generator Oracle: URL and Omnibox Resolution', () => {
    it('ADV-1.1: Direct Schemes (http, https, file, ws, ftp, about)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const testCases = [
        { input: 'about:blank', expected: 'about:blank' },
        { input: 'about:', expected: 'about:blank' },
        { input: 'about:config', expected: 'about:config' },
        { input: 'https://github.com/electron/electron', expected: 'https://github.com/electron/electron' },
        { input: 'https://sub.domain.co.uk/path/to/page?key=val&num=1#section', expected: 'https://sub.domain.co.uk/path/to/page?key=val&num=1#section' },
        { input: 'http://example.org:8080/api/v1', expected: 'http://example.org:8080/api/v1' },
        { input: 'file:///C:/Users/test/index.html', expected: 'file:///C:/Users/test/index.html' },
        { input: 'ws://localhost:8080/socket', expected: 'ws://localhost:8080/socket' },
        { input: 'ftp://ftp.is.co.za/linux', expected: 'ftp://ftp.is.co.za/linux' }
      ];

      for (const { input, expected } of testCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed resolving '${input}' -> got '${resolved}'`);
      }
    });

    it('ADV-1.2: Localhost, IPv4, Intranet Hosts with Ports', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const testCases = [
        { input: 'localhost', expected: 'http://localhost' },
        { input: 'localhost:3000', expected: 'http://localhost:3000' },
        { input: 'localhost:8080/admin/dashboard', expected: 'http://localhost:8080/admin/dashboard' },
        { input: '127.0.0.1', expected: 'http://127.0.0.1' },
        { input: '127.0.0.1:8080', expected: 'http://127.0.0.1:8080' },
        { input: '192.168.1.100:5173/vite', expected: 'http://192.168.1.100:5173/vite' },
        { input: '10.0.0.1', expected: 'http://10.0.0.1' },
        { input: 'dev-box:9000', expected: 'http://dev-box:9000' },
        { input: 'my_server:4000/api', expected: 'http://my_server:4000/api' }
      ];

      for (const { input, expected } of testCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed resolving '${input}' -> got '${resolved}'`);
      }
    });

    it('ADV-1.3: Standard Domain Names without Scheme (autofill https://)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const testCases = [
        { input: 'google.com', expected: 'https://google.com' },
        { input: 'github.com/facebook/react', expected: 'https://github.com/facebook/react' },
        { input: 'news.ycombinator.com/item?id=12345', expected: 'https://news.ycombinator.com/item?id=12345' },
        { input: 'docs.python.org/3/library', expected: 'https://docs.python.org/3/library' },
        { input: 'store.steampowered.com:443/app/10', expected: 'https://store.steampowered.com:443/app/10' }
      ];

      for (const { input, expected } of testCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed resolving domain '${input}' -> got '${resolved}'`);
      }
    });

    it('ADV-1.4: Search Queries (multi-word, single terms, special characters)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const testCases = [
        { input: 'strawberry browser', expected: 'https://www.google.com/search?q=strawberry%20browser' },
        { input: 'hello world', expected: 'https://www.google.com/search?q=hello%20world' },
        { input: 'electron vite react', expected: 'https://www.google.com/search?q=electron%20vite%20react' },
        { input: 'c++ tutorial', expected: 'https://www.google.com/search?q=c%2B%2B%20tutorial' },
        { input: '50% of 100', expected: 'https://www.google.com/search?q=50%25%20of%20100' },
        { input: 'react & typescript', expected: 'https://www.google.com/search?q=react%20%26%20typescript' },
        { input: 'weather', expected: 'https://www.google.com/search?q=weather' },
        { input: 'wikipedia', expected: 'https://www.google.com/search?q=wikipedia' }
      ];

      for (const { input, expected } of testCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed search routing for '${input}' -> got '${resolved}'`);
      }
    });

    it('ADV-1.5: Incomplete Schemes and Edge Case Inputs', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      // Incomplete schemes should be routed to Google search, never loaded raw
      const incomplete = ['http://', 'https://', 'http:///', 'https:///'];
      for (const inc of incomplete) {
        const res = tm.resolveNavigationUrl(inc);
        assert.ok(
          res && res.startsWith('https://www.google.com/search?q='),
          `Incomplete scheme '${inc}' should route to search query, got '${res}'`
        );
      }

      // Whitespace and empty inputs should return null
      assert.strictEqual(tm.resolveNavigationUrl(''), null);
      assert.strictEqual(tm.resolveNavigationUrl('   '), null);
      assert.strictEqual(tm.resolveNavigationUrl('\t\n'), null);
      assert.strictEqual(tm.resolveNavigationUrl(null), null);
      assert.strictEqual(tm.resolveNavigationUrl(undefined), null);
    });

    it('ADV-1.6: navigate() method correctly rejects empty inputs without mutating tab', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      assert.strictEqual(tm.navigate(tab.id, ''), false);
      assert.strictEqual(tm.navigate(tab.id, '    '), false);
      assert.strictEqual(tm.navigate(tab.id, null), false);
      // loadedUrls should only have the initial URL
      assert.strictEqual(tabItem.view.webContents.loadedUrls.length, 1);
    });
  });

  // =========================================================================
  // SUITE 2: Crash Recovery & Lifecycle Transitions
  // =========================================================================
  describe('Crash Recovery & Lifecycle State Machine', () => {
    it('ADV-2.1: Multi-cycle Crash -> Reload -> Crash -> Navigate -> Recover', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      // Initial state
      assert.strictEqual(tabItem.state.isCrashed, false);

      // Cycle 1: Crash
      tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
      assert.strictEqual(tabItem.state.isCrashed, true);

      // Cycle 1: Reload
      const reloadSuccess = tm.reload(tab.id);
      assert.strictEqual(reloadSuccess, true);
      assert.strictEqual(tabItem.state.isCrashed, false, 'reload() should immediately reset isCrashed');

      // Cycle 2: Crash again
      tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'killed' });
      assert.strictEqual(tabItem.state.isCrashed, true);

      // Cycle 2: Navigate away
      const navSuccess = tm.navigate(tab.id, 'https://github.com');
      assert.strictEqual(navSuccess, true);
      assert.strictEqual(tabItem.state.isCrashed, false, 'navigate() should immediately reset isCrashed');

      // Cycle 3: Crash again
      tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'oom' });
      assert.strictEqual(tabItem.state.isCrashed, true);

      // Electron event: did-start-loading resets crash
      tabItem.view.webContents.emit('did-start-loading');
      assert.strictEqual(tabItem.state.isCrashed, false, 'did-start-loading must reset isCrashed');

      // Cycle 4: Crash then did-navigate
      tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
      assert.strictEqual(tabItem.state.isCrashed, true);
      tabItem.view.webContents.emit('did-navigate', {}, 'https://example.com/recovered');
      assert.strictEqual(tabItem.state.isCrashed, false, 'did-navigate must reset isCrashed');
    });
  });

  // =========================================================================
  // SUITE 3: Sole Tab Auto-Recovery & Invariant Stress
  // =========================================================================
  describe('Sole Tab Auto-Recovery & Invariants', () => {
    it('ADV-3.1: Closing active sole tab auto-creates a default tab and activates it', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com', { active: true });
      assert.strictEqual(tm.getAllTabs().length, 1);
      assert.strictEqual(tm.getActiveTabId(), tab.id);

      const closeRes = tm.closeTab(tab.id);
      assert.strictEqual(closeRes, true);

      const tabs = tm.getAllTabs();
      assert.strictEqual(tabs.length, 1, 'Exactly 1 tab must remain via auto-recovery');
      assert.notStrictEqual(tabs[0].id, tab.id, 'New tab must have a fresh ID');
      // Auto-recovery opens the private internal surface (about:blank), not a
      // remote search page.
      assert.strictEqual(tabs[0].url, 'about:blank');
      assert.strictEqual(tm.getActiveTabId(), tabs[0].id, 'Auto-created tab must be active');
      assert.strictEqual(win.contentView.children.length, 1, 'Active view must be attached');
    });

    it('ADV-3.2: Closing inactive sole tab auto-creates default tab (regression test for S3-3)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com', { active: false });
      assert.strictEqual(tm.getAllTabs().length, 1);
      assert.strictEqual(tm.getActiveTabId(), null);

      const closeRes = tm.closeTab(tab.id);
      assert.strictEqual(closeRes, true);

      const tabs = tm.getAllTabs();
      assert.strictEqual(tabs.length, 1, 'Must auto-create tab even when closed tab was inactive');
      assert.strictEqual(tm.getActiveTabId(), tabs[0].id);
      assert.strictEqual(win.contentView.children.length, 1);
    });

    it('ADV-3.3: Random order tab closures down to auto-recovery (100 runs)', () => {
      for (let run = 0; run < 100; run++) {
        const win = new MockBrowserWindow();
        const tm = new TabManager(win);

        const tabCount = 5 + (run % 10);
        const tabIds = [];
        for (let i = 0; i < tabCount; i++) {
          const t = tm.createTab(`about:blank?run=${run}&i=${i}`, { active: i === 0 });
          tabIds.push(t.id);
        }

        // Shuffle closing order
        const shuffled = [...tabIds].sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffled.length; i++) {
          const idToClose = shuffled[i];
          const isLast = i === shuffled.length - 1;
          const closed = tm.closeTab(idToClose);
          assert.strictEqual(closed, true);

          const currentTabs = tm.getAllTabs();
          if (isLast) {
            // Must have auto-created exactly 1 tab
            assert.strictEqual(currentTabs.length, 1, `Run ${run}: Last tab closure did not auto-recover`);
            assert.ok(tm.getActiveTabId(), `Run ${run}: Active tab ID must be set`);
            assert.strictEqual(win.contentView.children.length, 1);
          } else {
            assert.strictEqual(currentTabs.length, tabCount - (i + 1));
          }
        }
      }
    });
  });

  // =========================================================================
  // SUITE 4: Bounds Sanitization & Defense-in-Depth
  // =========================================================================
  describe('Bounds Sanitization & Defense-in-Depth', () => {
    it('ADV-4.1: setBounds handles null, undefined, primitive, and malformed inputs', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      tm.createTab('about:blank');

      const malformedInputs = [
        null,
        undefined,
        12345,
        'invalid string',
        true,
        false,
        [1, 2, 3],
        {},
        { x: null, y: undefined, width: NaN, height: 'bad' },
        { x: -50, y: -100, width: -500, height: -600 },
        { x: 100.4, y: 200.7, width: 800.2, height: 600.9 }
      ];

      for (const input of malformedInputs) {
        assert.doesNotThrow(() => {
          tm.setBounds(input);
        }, `setBounds should not throw on malformed input: ${JSON.stringify(input)}`);
      }
    });

    it('ADV-4.2: setBounds accurately sanitizes numeric string inputs', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      tm.createTab('about:blank');

      tm.setBounds({ x: '240', y: '48', width: '1000', height: '700' });
      const active = tm.getActiveTab();
      assert.ok(active);
      assert.strictEqual(active.view.bounds.x, 240);
      assert.strictEqual(active.view.bounds.y, 48);
      assert.strictEqual(active.view.bounds.width, 1000);
      assert.strictEqual(active.view.bounds.height, 700);
    });
  });

  // =========================================================================
  // SUITE 5: History Navigation Boundaries
  // =========================================================================
  describe('History Navigation Boundaries', () => {
    it('ADV-5.1: goBack and goForward with navigationHistory API available', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      // When canGoBack is false
      tabItem.view.webContents._canGoBack = false;
      assert.strictEqual(tm.goBack(tab.id), false);

      // When canGoBack is true
      let backCalled = false;
      tabItem.view.webContents._canGoBack = true;
      tabItem.view.webContents.navigationHistory.goBack = () => { backCalled = true; };
      assert.strictEqual(tm.goBack(tab.id), true);
      assert.strictEqual(backCalled, true);

      // When canGoForward is false
      tabItem.view.webContents._canGoForward = false;
      assert.strictEqual(tm.goForward(tab.id), false);

      // When canGoForward is true
      let forwardCalled = false;
      tabItem.view.webContents._canGoForward = true;
      tabItem.view.webContents.navigationHistory.goForward = () => { forwardCalled = true; };
      assert.strictEqual(tm.goForward(tab.id), true);
      assert.strictEqual(forwardCalled, true);
    });

    it('ADV-5.2: goBack and goForward fallback when navigationHistory is absent', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      // Remove navigationHistory to test backward compatibility fallback
      delete tabItem.view.webContents.navigationHistory;

      let legacyBackCalled = false;
      tabItem.view.webContents._canGoBack = true;
      tabItem.view.webContents.goBack = () => { legacyBackCalled = true; };
      assert.strictEqual(tm.goBack(tab.id), true);
      assert.strictEqual(legacyBackCalled, true);

      let legacyForwardCalled = false;
      tabItem.view.webContents._canGoForward = true;
      tabItem.view.webContents.goForward = () => { legacyForwardCalled = true; };
      assert.strictEqual(tm.goForward(tab.id), true);
      assert.strictEqual(legacyForwardCalled, true);
    });
  });

  // =========================================================================
  // SUITE 6: Generative Fuzzing & Stress Oracle
  // =========================================================================
  describe('Generative Fuzzing & High-Stress Oracles', () => {
    it('ADV-6.1: 1,000-case randomized URL fuzzer never throws and produces valid targets or null', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./:?#&%=+@!$*()[] \t\r\n';
      const specialSeeds = [
        '', ' ', '\t', '\n', '\r\n',
        'http://', 'https://', 'ftp://', 'file://', 'about:', 'about:blank',
        'javascript:alert(1)', 'data:text/html,test',
        'localhost', 'localhost:8080', '127.0.0.1', '255.255.255.255', '0.0.0.0',
        '../path/traversal', 'C:\\Windows\\System32',
        '<script>alert("xss")</script>', '"><img src=x onerror=alert(1)>',
        'https://user:pass@host.com:9000/path?a=1&b=2#anchor',
        '🚀.com', '日本語.jp', 'xn--fiqs8s.cn',
        'a'.repeat(2048),
        'https://' + 'a'.repeat(1000) + '.com'
      ];

      function generateFuzzString(seedIndex) {
        if (seedIndex < specialSeeds.length) {
          return specialSeeds[seedIndex];
        }
        const len = Math.floor(Math.random() * 80) + 1;
        let s = '';
        for (let j = 0; j < len; j++) {
          s += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return s;
      }

      for (let i = 0; i < 1000; i++) {
        const input = generateFuzzString(i);
        let result;
        assert.doesNotThrow(() => {
          result = tm.resolveNavigationUrl(input);
        }, `Fuzzer threw on input: ${JSON.stringify(input)}`);

        if (result !== null) {
          assert.strictEqual(typeof result, 'string', 'Resolved URL must be string if non-null');
          assert.ok(result.length > 0, 'Resolved URL must not be empty');
          // Must start with a known protocol or valid scheme
          const validPrefixes = ['http://', 'https://', 'about:', 'file://', 'ws://', 'wss://', 'ftp://'];
          const hasValidPrefix = validPrefixes.some(p => result.startsWith(p));
          assert.ok(
            hasValidPrefix,
            `Resolved output '${result}' from input '${input}' lacks valid protocol scheme`
          );
        }
      }
    });

    it('ADV-6.2: High-velocity tab churn (150 tab creations, switches, and closes)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      for (let i = 0; i < 150; i++) {
        const t = tm.createTab(`about:blank?churn=${i}`, { active: i % 2 === 0 });
        if (i % 3 === 0) {
          tm.switchTab(t.id);
        }
        if (i % 5 === 0 && tm.getAllTabs().length > 1) {
          const all = tm.getAllTabs();
          const target = all[Math.floor(Math.random() * all.length)];
          tm.closeTab(target.id);
        }
      }

      // Assert invariants hold
      assert.ok(tm.getAllTabs().length >= 1, 'Invariable: At least 1 tab must remain');
      assert.ok(tm.getActiveTabId() !== null, 'Invariable: Active tab must not be null');
      assert.strictEqual(win.contentView.children.length, 1, 'Invariable: Exactly 1 child view attached');
    });
  });
});
