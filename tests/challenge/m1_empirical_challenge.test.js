import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// =============================================================================
// Test Harness Setup: Mock Electron & Load Actual Production Modules
// =============================================================================

// 1. Mock Electron for Preload Testing
function createPreloadHarness() {
  const ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = async (channel, ...args) => {
    return { channel, args };
  };
  ipcRenderer.send = (channel, ...args) => {
    ipcRenderer.emit('sent:' + channel, ...args);
  };

  let exposedApi = null;
  const contextBridge = {
    exposeInMainWorld: (key, api) => {
      if (key === 'warwickApi') {
        exposedApi = api;
      }
    }
  };

  const preloadCode = fs.readFileSync(
    path.resolve(process.cwd(), 'dist-electron/index.js'),
    'utf8'
  );

  const context = vm.createContext({
    require: (mod) => {
      if (mod === 'electron') {
        return { ipcRenderer, contextBridge };
      }
      return require(mod);
    },
    console
  });

  vm.runInContext(preloadCode, context);

  return { ipcRenderer, warwickApi: exposedApi };
}

// 2. Mock Electron for Main TabManager Testing
class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this._destroyed = false;
    this.currentUrl = '';
    this._canGoBack = false;
    this._canGoForward = false;
    this.reloadCount = 0;
    this.loadedUrls = [];
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
      addChildView: (v) => this.contentView.children.push(v),
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

function loadTabManagerClass() {
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

// =============================================================================
// CHALLENGE SUITE 1: Preload Listener Hygiene
// =============================================================================
describe('Empirical Challenge 1: Preload Listener Hygiene', () => {
  it('CH1-1: tabs.onTabsUpdated unsubscription must detach listener and stop emissions', () => {
    const { ipcRenderer, warwickApi } = createPreloadHarness();
    assert.ok(warwickApi, 'warwickApi must be exposed');

    let callCount = 0;
    let receivedActiveId = '';
    const unsub = warwickApi.tabs.onTabsUpdated((_tabs, activeId) => {
      callCount++;
      receivedActiveId = activeId;
    });

    assert.strictEqual(callCount, 0, 'No emission before event');
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 1, 'Exactly one listener attached');

    // Trigger event
    ipcRenderer.emit('tabs:updated', {}, [], 'tab-1');
    assert.strictEqual(callCount, 1, 'Callback invoked on first emission');
    assert.strictEqual(receivedActiveId, 'tab-1');

    // Unsubscribe
    unsub();
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 0, 'Listener must be detached from ipcRenderer');

    // Trigger event again
    ipcRenderer.emit('tabs:updated', {}, [], 'tab-2');
    assert.strictEqual(callCount, 1, 'Callback must NOT be invoked after unsubscribe');
  });

  it('CH1-2: tabs.onTabsUpdated handles redundant unsubscribe calls idempotently without error', () => {
    const { ipcRenderer, warwickApi } = createPreloadHarness();
    const unsub = warwickApi.tabs.onTabsUpdated(() => {});
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 1);

    assert.doesNotThrow(() => {
      unsub();
      unsub();
      unsub();
    }, 'Multiple unsubscribe calls must not throw');
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 0);
  });

  it('CH1-3: Multiple subscribers to tabs.onTabsUpdated - unsubscribing one does not detach the other', () => {
    const { ipcRenderer, warwickApi } = createPreloadHarness();
    let count1 = 0;
    let count2 = 0;

    const unsub1 = warwickApi.tabs.onTabsUpdated(() => count1++);
    const unsub2 = warwickApi.tabs.onTabsUpdated(() => count2++);

    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 2);

    ipcRenderer.emit('tabs:updated', {}, [], 'tab-1');
    assert.strictEqual(count1, 1);
    assert.strictEqual(count2, 1);

    // Unsubscribe subscriber 1 only
    unsub1();
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 1);

    ipcRenderer.emit('tabs:updated', {}, [], 'tab-2');
    assert.strictEqual(count1, 1, 'Subscriber 1 must not receive event');
    assert.strictEqual(count2, 2, 'Subscriber 2 must continue receiving event');

    unsub2();
    assert.strictEqual(ipcRenderer.listenerCount('tabs:updated'), 0);
  });

  it('CH1-4: agent.onStreamChunk unsubscription hygiene', () => {
    const { ipcRenderer, warwickApi } = createPreloadHarness();
    let chunkCount = 0;
    const unsub = warwickApi.agent.onStreamChunk(() => chunkCount++);

    assert.strictEqual(ipcRenderer.listenerCount('agent:stream-chunk'), 1);
    ipcRenderer.emit('agent:stream-chunk', {}, 'chunk-1');
    assert.strictEqual(chunkCount, 1);

    unsub();
    assert.strictEqual(ipcRenderer.listenerCount('agent:stream-chunk'), 0);
    ipcRenderer.emit('agent:stream-chunk', {}, 'chunk-2');
    assert.strictEqual(chunkCount, 1);
  });

  it('CH1-5: agent.onActionEvent unsubscription hygiene', () => {
    const { ipcRenderer, warwickApi } = createPreloadHarness();
    let actionCount = 0;
    const unsub = warwickApi.agent.onActionEvent(() => actionCount++);

    assert.strictEqual(ipcRenderer.listenerCount('agent:action-event'), 1);
    ipcRenderer.emit('agent:action-event', {}, { stage: 'searching', message: 'test' });
    assert.strictEqual(actionCount, 1);

    unsub();
    assert.strictEqual(ipcRenderer.listenerCount('agent:action-event'), 0);
    ipcRenderer.emit('agent:action-event', {}, { stage: 'complete', message: 'test' });
    assert.strictEqual(actionCount, 1);
  });
});

// =============================================================================
// CHALLENGE SUITE 2: URL Parser in navigate()
// =============================================================================
describe('Empirical Challenge 2: URL Parser in navigate()', () => {
  const { TabManager, MockBrowserWindow } = loadTabManagerClass();

  it('CH2-1: Standard HTTPS URL navigation (e.g. https://github.com)', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, 'https://github.com');
    const lastUrl = tabItem.view.webContents.loadedUrls.at(-1);

    // CHALLENGE: If targetUrl was erroneously converted to a Google search, this will expose it!
    assert.strictEqual(
      lastUrl,
      'https://github.com',
      `Expected 'https://github.com' but got '${lastUrl}'`
    );
  });

  it('CH2-2: Standard HTTP URL navigation (e.g. http://example.org/docs)', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, 'http://example.org/docs');
    const lastUrl = tabItem.view.webContents.loadedUrls.at(-1);

    assert.strictEqual(
      lastUrl,
      'http://example.org/docs',
      `Expected 'http://example.org/docs' but got '${lastUrl}'`
    );
  });

  it('CH2-3: IP address navigation (e.g. 127.0.0.1 and http://127.0.0.1:8080)', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, '127.0.0.1');
    const url1 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.ok(
      url1.includes('127.0.0.1') && !url1.includes('google.com/search'),
      `127.0.0.1 should navigate to IP address, not Google search. Got: ${url1}`
    );

    tm.navigate(tab.id, 'http://127.0.0.1:8080');
    const url2 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.strictEqual(
      url2,
      'http://127.0.0.1:8080',
      `http://127.0.0.1:8080 should navigate to target, not Google search. Got: ${url2}`
    );
  });

  it('CH2-4: Intranet host navigation (e.g. localhost:3000 and http://localhost:5173)', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, 'localhost:3000');
    const url1 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.ok(
      url1.includes('localhost:3000') && !url1.includes('google.com/search'),
      `localhost:3000 should navigate to local server, not Google search. Got: ${url1}`
    );

    tm.navigate(tab.id, 'http://localhost:5173');
    const url2 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.strictEqual(
      url2,
      'http://localhost:5173',
      `http://localhost:5173 should navigate directly. Got: ${url2}`
    );
  });

  it('CH2-5: Empty string and whitespace-only navigation', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, '');
    const urlAfterEmpty = tabItem.view.webContents.loadedUrls.at(-1);

    tm.navigate(tab.id, '    ');
    const urlAfterSpaces = tabItem.view.webContents.loadedUrls.at(-1);

    // Empty or spaces navigation should not search for empty query "https://www.google.com/search?q="
    assert.notStrictEqual(
      urlAfterEmpty,
      'https://www.google.com/search?q=',
      'Empty string should not trigger blank search query'
    );
    assert.notStrictEqual(
      urlAfterSpaces,
      'https://www.google.com/search?q=',
      'Whitespace should not trigger blank search query'
    );
  });

  it('CH2-6: Incomplete protocols like http:// or https:// must not load invalid URLs', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, 'http://');
    const url1 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.notStrictEqual(url1, 'http://', 'Should not attempt loading raw incomplete protocol http://');

    tm.navigate(tab.id, 'https://');
    const url2 = tabItem.view.webContents.loadedUrls.at(-1);
    assert.notStrictEqual(url2, 'https://', 'Should not attempt loading raw incomplete protocol https://');
  });

  it('CH2-7: Search query with spaces is correctly encoded for search engine', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    tm.navigate(tab.id, 'strawberry browser arc');
    const lastUrl = tabItem.view.webContents.loadedUrls.at(-1);
    assert.strictEqual(
      lastUrl,
      'https://www.google.com/search?q=strawberry%20browser%20arc',
      `Search query must be properly URL encoded: got ${lastUrl}`
    );
  });
});

// =============================================================================
// CHALLENGE SUITE 3: History Boundaries (back/forward on empty history)
// =============================================================================
describe('Empirical Challenge 3: History Boundaries', () => {
  const { TabManager, MockBrowserWindow } = loadTabManagerClass();

  it('CH3-1: goBack returns false and does not throw on empty history', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);
    tabItem.view.webContents._canGoBack = false;

    const result = tm.goBack(tab.id);
    assert.strictEqual(result, false, 'goBack must return false when canGoBack is false');
  });

  it('CH3-2: goForward returns false and does not throw on empty forward history', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);
    tabItem.view.webContents._canGoForward = false;

    const result = tm.goForward(tab.id);
    assert.strictEqual(result, false, 'goForward must return false when canGoForward is false');
  });

  it('CH3-3: goBack and goForward on non-existent tab ID return false', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);

    assert.strictEqual(tm.goBack('non-existent-id'), false);
    assert.strictEqual(tm.goForward('non-existent-id'), false);
  });

  it('CH3-4: goBack and goForward on destroyed webContents return false safely', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);
    tabItem.view.webContents.close(); // destroy webContents

    assert.strictEqual(tm.goBack(tab.id), false);
    assert.strictEqual(tm.goForward(tab.id), false);
  });
});

// =============================================================================
// CHALLENGE SUITE 4: Reload & Crash State Transitions
// =============================================================================
describe('Empirical Challenge 4: Reload & Crash State Transitions', () => {
  const { TabManager, MockBrowserWindow } = loadTabManagerClass();

  it('CH4-1: reload() invokes webContents.reload() on healthy tab', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    const result = tm.reload(tab.id);
    assert.strictEqual(result, true);
    assert.strictEqual(tabItem.view.webContents.reloadCount, 1);
  });

  it('CH4-2: reload() returns false on non-existent tab ID', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const result = tm.reload('non-existent-id');
    assert.strictEqual(result, false);
  });

  it('CH4-3: render-process-gone marks tab state as isCrashed: true and isLoading: false', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    assert.strictEqual(tabItem.state.isCrashed, false);

    // Simulate crash event from Electron
    tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });

    assert.strictEqual(tabItem.state.isCrashed, true, 'Tab must be marked as crashed');
    assert.strictEqual(tabItem.state.isLoading, false, 'Loading flag must be cleared on crash');
  });

  it('CH4-4: CRASH RECOVERY: reload or navigation must reset isCrashed flag to false', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    // Crash the tab
    tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    assert.strictEqual(tabItem.state.isCrashed, true);

    // User reloads the crashed tab
    tm.reload(tab.id);

    // Electron signals that page has started or completed loading
    tabItem.view.webContents.emit('did-start-loading');
    tabItem.view.webContents.emit('did-stop-loading');

    // CHALLENGE: Does isCrashed reset to false on reload?
    assert.strictEqual(
      tabItem.state.isCrashed,
      false,
      'isCrashed state must reset to false after reload recovery'
    );
  });

  it('CH4-5: CRASH RECOVERY: navigating to a new URL must reset isCrashed flag to false', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);
    const tab = tm.createTab('https://example.com');
    const tabItem = tm.getTab(tab.id);

    // Crash the tab
    tabItem.view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    assert.strictEqual(tabItem.state.isCrashed, true);

    // User navigates away to a new URL
    tm.navigate(tab.id, 'example.org');

    tabItem.view.webContents.emit('did-navigate', {}, 'https://example.org');
    tabItem.view.webContents.emit('did-stop-loading');

    // CHALLENGE: Does isCrashed reset to false on navigation?
    assert.strictEqual(
      tabItem.state.isCrashed,
      false,
      'isCrashed state must reset to false after successful navigation'
    );
  });
});
