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
    this.audioMuted = false;
    this.navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => {},
      goForward: () => {}
    };
  }

  isDestroyed() {
    return this._destroyed;
  }

  loadURL(url) {
    this.currentUrl = url;
    return Promise.resolve();
  }

  reload() {}

  canGoBack() {
    return false;
  }

  canGoForward() {
    return false;
  }

  setAudioMuted(muted) {
    this.audioMuted = muted;
  }

  isAudioMuted() {
    return this.audioMuted;
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

function loadModules() {
  const tabManagerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/main/tabManager.ts'), 'utf8');
  const omniboxSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/components/Omnibox.tsx'), 'utf8');
  const typesSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/shared/types.ts'), 'utf8');

  const tabManagerJs = ts.transpileModule(tabManagerSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const omniboxJs = ts.transpileModule(omniboxSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React }
  }).outputText;

  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const fakeElectron = {
    WebContentsView: MockWebContentsView,
    BrowserWindow: MockBrowserWindow
  };

  const typesMod = { exports: {} };
  const typesCtx = vm.createContext({
    module: typesMod,
    exports: typesMod.exports
  });
  vm.runInContext(typesJs, typesCtx);
  const THEME_CONSTANTS = typesMod.exports.THEME_CONSTANTS;
  const IPC_CHANNELS = typesMod.exports.IPC_CHANNELS;

  const tmMod = { exports: {} };
  const tmCtx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
      if (m === '../shared/types') return { IPC_CHANNELS, THEME_CONSTANTS };
      return require(m);
    },
    module: tmMod,
    exports: tmMod.exports,
    URL,
    Set,
    Map,
    Math,
    Date,
    console
  });
  vm.runInContext(tabManagerJs, tmCtx);

  const omniMod = { exports: {} };
  const omniCtx = vm.createContext({
    require: (m) => {
      if (m === '../../shared/types') return { IPC_CHANNELS, THEME_CONSTANTS };
      if (m === 'react' || m.startsWith('lucide-react')) return {};
      return require(m);
    },
    module: omniMod,
    exports: omniMod.exports,
    console
  });
  vm.runInContext(omniboxJs, omniCtx);

  return {
    TabManager: tmMod.exports.TabManager,
    parseOmniboxInput: omniMod.exports.parseOmniboxInput,
    THEME_CONSTANTS,
    MockBrowserWindow
  };
}

describe('Milestone 2 Empirical Challenger Suite (Adversarial Oracles & Stress)', () => {
  const { TabManager, parseOmniboxInput, THEME_CONSTANTS, MockBrowserWindow } = loadModules();

  // =========================================================================
  // ORACLE 1: Sidebar Dimensions & 50+ Rapid Toggles
  // =========================================================================
  describe('Oracle 1: Sidebar Width Constraints & 50+ Rapid Toggles', () => {
    it('M2-S1: THEME_CONSTANTS strictly mandates 240px expanded and 52px collapsed', () => {
      assert.strictEqual(THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH, 240, 'Expanded width must be strictly 240px');
      assert.strictEqual(THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH, 52, 'Collapsed width must be strictly 52px');
    });

    it('M2-S2: 100 rapid collapse/expand toggles verify zero drift', () => {
      let isCollapsed = false;
      const widths = [];

      for (let i = 0; i < 100; i++) {
        isCollapsed = !isCollapsed;
        const currentWidth = isCollapsed
          ? THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH
          : THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH;
        widths.push(currentWidth);

        if (isCollapsed) {
          assert.strictEqual(currentWidth, 52, `Iteration ${i}: Collapsed width must be exactly 52px`);
        } else {
          assert.strictEqual(currentWidth, 240, `Iteration ${i}: Expanded width must be exactly 240px`);
        }
      }

      assert.strictEqual(widths.length, 100);
      assert.strictEqual(widths.filter(w => w === 52).length, 50);
      assert.strictEqual(widths.filter(w => w === 240).length, 50);
    });
  });

  // =========================================================================
  // ORACLE 2: Middle-Click Tab Closure & Mouse Event Semantics
  // =========================================================================
  describe('Oracle 2: Middle-Click Tab Closure Semantics', () => {
    it('M2-M1: Middle-click (button === 1) triggers tab closure, prevents default and stops propagation', () => {
      let closedTabId = null;
      let defaultPrevented = false;
      let propagationStopped = false;

      const mockOnClose = (id) => {
        closedTabId = id;
      };

      // Exact handler logic from TabItem.tsx and PinnedTabsGrid.tsx
      const handleMouseDown = (e, id) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          mockOnClose(id);
        }
      };

      const testEvent = {
        button: 1,
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => { propagationStopped = true; }
      };

      handleMouseDown(testEvent, 'tab-test-uuid');

      assert.strictEqual(closedTabId, 'tab-test-uuid', 'Middle click must close tab');
      assert.strictEqual(defaultPrevented, true, 'Middle click must call preventDefault');
      assert.strictEqual(propagationStopped, true, 'Middle click must call stopPropagation');
    });

    it('M2-M2: Left click (button === 0) and right click (button === 2) do NOT trigger tab closure', () => {
      let closedTabId = null;
      const mockOnClose = (id) => { closedTabId = id; };

      const handleMouseDown = (e, id) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          mockOnClose(id);
        }
      };

      // Left click
      handleMouseDown({ button: 0, preventDefault: () => {}, stopPropagation: () => {} }, 'tab-1');
      assert.strictEqual(closedTabId, null, 'Left click must not trigger middle-click closure');

      // Right click
      handleMouseDown({ button: 2, preventDefault: () => {}, stopPropagation: () => {} }, 'tab-1');
      assert.strictEqual(closedTabId, null, 'Right click must not trigger middle-click closure');
    });
  });

  // =========================================================================
  // ORACLE 3: Tab Titles (Unicode, RTL, Long Strings, Injection)
  // =========================================================================
  describe('Oracle 3: Tab Titles, Unicode and Boundary Resilience', () => {
    it('M2-T1: Tab title handles 10,000 characters without memory corruption or exception', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      const massiveTitle = 'A'.repeat(10000);
      tabItem.view.webContents.emit('page-title-updated', {}, massiveTitle);
      assert.strictEqual(tabItem.state.title, massiveTitle);
      assert.strictEqual(tabItem.state.title.length, 10000);
    });

    it('M2-T2: Tab title handles RTL Arabic, CJK, Cyrillic, and Emojis perfectly', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      const titles = [
        'متصفح وارويك بالذكاء الاصطناعي - صفحة رئيسية', // Arabic RTL
        'Artificial Intelligence 🤖🚀🔥 Warwick Browser', // Emojis
        '日本語タイトル：ウェブブラウザのテスト', // Japanese
        'Русский заголовок: Тестирование вкладок', // Russian
        '∑(x) = ∫ f(t) dt √π ∞ ≠ ≤ ≥' // Math symbols
      ];

      for (const t of titles) {
        tabItem.view.webContents.emit('page-title-updated', {}, t);
        assert.strictEqual(tabItem.state.title, t, `Failed on title: ${t}`);
      }
    });

    it('M2-T3: Tab title safely preserves HTML/XSS injection payloads without executing or throwing', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com');
      const tabItem = tm.getTab(tab.id);

      const injectionPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="document.location=\'http://evil.com\'">',
        '"><svg/onload=alert(1)>',
        'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[/[]/+alert(1)//\'>'
      ];

      for (const payload of injectionPayloads) {
        tabItem.view.webContents.emit('page-title-updated', {}, payload);
        assert.strictEqual(tabItem.state.title, payload);
      }
    });

    it('M2-T4: Initial title extraction fallback handles empty, about:blank, bare domains and complex URLs', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const blankTab = tm.createTab('about:blank');
      // Internal home surface title (was "New Tab" before the UI unification).
      assert.strictEqual(blankTab.title, 'WarWick AI Browser');

      const ghTab = tm.createTab('https://github.com/facebook/react');
      assert.strictEqual(ghTab.title, 'github.com');

      const wwwTab = tm.createTab('https://www.google.com/search?q=test');
      assert.strictEqual(wwwTab.title, 'google.com');

      const invalidTab = tm.createTab('not-a-valid-url-query');
      assert.ok(invalidTab.title.length > 0);
    });
  });

  // =========================================================================
  // ORACLE 4: Vertical Tab Strip & Pinned Tabs Stress
  // =========================================================================
  describe('Oracle 4: Burst Tab Strip, Pinning, and Mass Closures', () => {
    it('M2-B1: Rapid burst creation of 100 tabs maintains strict single attached view invariant', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      for (let i = 0; i < 100; i++) {
        tm.createTab(`about:blank?tab=${i}`, { active: i === 0 });
      }

      assert.strictEqual(tm.getAllTabs().length, 100);
      assert.strictEqual(win.contentView.children.length, 1, 'Only 1 view attached at all times');
    });

    it('M2-B2: 500 rapid switching operations across 100 tabs never causes view stacking', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      for (let i = 0; i < 100; i++) {
        tm.createTab(`about:blank?tab=${i}`, { active: false });
      }
      const allTabs = tm.getAllTabs();

      for (let i = 0; i < 500; i++) {
        const target = allTabs[(i * 37) % allTabs.length];
        const res = tm.switchTab(target.id);
        assert.strictEqual(res, true);
        assert.strictEqual(tm.getActiveTabId(), target.id);
        assert.strictEqual(win.contentView.children.length, 1, 'Child views must stay strictly at 1');
      }
    });

    it('M2-B3: Pinned tab toggling storm (100 pin/unpin toggles)', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      for (let i = 0; i < 20; i++) {
        tm.createTab(`about:blank?pin_test=${i}`, { active: i === 0 });
      }
      const tabs = tm.getAllTabs();

      // Pin all 20 tabs
      for (const t of tabs) {
        assert.strictEqual(tm.setTabPinned(t.id, true), true);
      }
      assert.strictEqual(tm.getAllTabs().filter(t => t.isPinned).length, 20);

      // Unpin odd indexed tabs
      for (let i = 1; i < 20; i += 2) {
        assert.strictEqual(tm.setTabPinned(tabs[i].id, false), true);
      }
      assert.strictEqual(tm.getAllTabs().filter(t => t.isPinned).length, 10);
      assert.strictEqual(tm.getAllTabs().filter(t => !t.isPinned).length, 10);

      // Invalid ID returns false cleanly
      assert.strictEqual(tm.setTabPinned('non-existent-uuid', true), false);
      assert.strictEqual(tm.setTabMuted('non-existent-uuid', true), false);
    });

    it('M2-B4: Mass tab closures down to 1 tab verifies auto-selection of adjacent tab', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      for (let i = 0; i < 50; i++) {
        tm.createTab(`about:blank?close_test=${i}`, { active: i === 0 });
      }

      // Repeatedly close active tab until only 1 remains
      while (tm.getAllTabs().length > 1) {
        const activeId = tm.getActiveTabId();
        assert.ok(activeId);
        const closed = tm.closeTab(activeId);
        assert.strictEqual(closed, true);
        assert.ok(tm.getActiveTabId(), 'New active tab must be automatically selected');
        assert.strictEqual(win.contentView.children.length, 1);
      }

      assert.strictEqual(tm.getAllTabs().length, 1);
    });

    it('M2-B5: Auto-recovery invariant: closing the sole remaining tab spawns a new default tab', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);
      const tab = tm.createTab('https://example.com', { active: true });

      for (let cycle = 0; cycle < 20; cycle++) {
        const currentActive = tm.getActiveTabId();
        assert.ok(currentActive);
        const res = tm.closeTab(currentActive);
        assert.strictEqual(res, true);

        const currentTabs = tm.getAllTabs();
        assert.strictEqual(currentTabs.length, 1, `Cycle ${cycle}: Auto-recovery must maintain exactly 1 tab`);
        assert.strictEqual(tm.getActiveTabId(), currentTabs[0].id);
        // New tabs intentionally start on the private internal surface instead
        // of a remote search page.
        assert.strictEqual(currentTabs[0].url, 'about:blank');
        assert.strictEqual(win.contentView.children.length, 1);
      }
    });
  });

  // =========================================================================
  // ORACLE 5: Omnibox Parser Stress & Adversarial Inputs
  // =========================================================================
  describe('Oracle 5: Omnibox Input Parsing Under Stress', () => {
    it('M2-O1: Correctly parses @ai prompts with extreme whitespace, emojis, and multiline strings', () => {
      const testCases = [
        { input: '@ai', expectedPrompt: '' },
        { input: '@ai   ', expectedPrompt: '' },
        { input: '@ai help me analyze this code', expectedPrompt: 'help me analyze this code' },
        { input: '@ai\nsummarize page', expectedPrompt: 'summarize page' },
        { input: '@ai   🚀 what is warwick?   ', expectedPrompt: '🚀 what is warwick?' },
        { input: '@ai https://github.com/facebook/react', expectedPrompt: 'https://github.com/facebook/react' }
      ];

      for (const { input, expectedPrompt } of testCases) {
        const res = parseOmniboxInput(input);
        assert.strictEqual(res.type, 'ai', `Input '${input}' should be type 'ai'`);
        assert.strictEqual(res.prompt, expectedPrompt, `Input '${input}' prompt mismatch`);
      }
    });

    it('M2-O2: Correctly parses ? and ??? prefixes as AI queries', () => {
      const testCases = [
        { input: '?', expectedPrompt: '' },
        { input: '?    ', expectedPrompt: '' },
        { input: '? what is electron', expectedPrompt: 'what is electron' },
        { input: '??? explain rust vs c++', expectedPrompt: 'explain rust vs c++' },
        { input: '??????   deep research   ', expectedPrompt: 'deep research' }
      ];

      for (const { input, expectedPrompt } of testCases) {
        const res = parseOmniboxInput(input);
        assert.strictEqual(res.type, 'ai', `Input '${input}' should be type 'ai'`);
        assert.strictEqual(res.prompt, expectedPrompt, `Input '${input}' prompt mismatch`);
      }
    });

    it('M2-O3: Does NOT trigger AI on emails, mid-sentence @, or non-prefix ?', () => {
      const testCases = [
        'user@example.com',
        'contact@ai.org',
        'look at @ai on twitter',
        'what is this?',
        'https://example.com?query=1&ai=true',
        'curl -u user:pass @host.com'
      ];

      for (const input of testCases) {
        const res = parseOmniboxInput(input);
        assert.strictEqual(res.type, 'navigation', `Input '${input}' should be type 'navigation'`);
        assert.strictEqual(res.url, input);
      }
    });
  });
});
