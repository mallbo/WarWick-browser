import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

import { WarwickBrowserDriver } from '../e2e/harness/browserDriver.js';
import { THEME_CONSTANTS } from '../e2e/harness/types.js';

// =============================================================================
// Helper: Extract & Transpile production handlers from App.tsx and tabManager.ts
// =============================================================================

function getAppKeyDownHandler() {
  const appTsxPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
  const appSrc = fs.readFileSync(appTsxPath, 'utf8');

  // Extract handleKeyDown body from App.tsx
  const match = appSrc.match(/const handleKeyDown = \(e: KeyboardEvent\) => \{([\s\S]*?)\n    \};/);
  if (!match) {
    throw new Error('Failed to extract handleKeyDown from src/renderer/App.tsx');
  }

  // Transpile TypeScript body to JavaScript
  const tsCode = `function createHandler(deps) {
    const {
      activeTabId,
      tabs,
      handleCreateTab,
      handleCloseTab,
      handleCycleTab,
      handleReload,
      handleGoBack,
      handleGoForward,
      setIsAgentOpen,
      setIsSettingsOpen,
      setSidebarCollapsed,
      document
    } = deps;

    return function handleKeyDown(e) {
      ${match[1]}
    };
  }`;

  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const sandbox = {};
  vm.createContext(sandbox);
  const factory = vm.runInContext(`(${jsCode})`, sandbox);
  return factory;
}

function getTabManagerBeforeInputEventListener() {
  const tabManagerPath = path.resolve(process.cwd(), 'src/main/tabManager.ts');
  const tabSrc = fs.readFileSync(tabManagerPath, 'utf8');

  // Extract before-input-event listener body
  const match = tabSrc.match(/addTrackedListener\('before-input-event', \(event: any, input: any\) => \{([\s\S]*?)\n    \}\);/);
  if (!match) {
    throw new Error('Failed to extract before-input-event listener from src/main/tabManager.ts');
  }

  const tsCode = `function createListener(manager) {
    const fn = function(event, input) {
      ${match[1]}
    };
    return fn.bind(manager);
  }`;

  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const sandbox = {};
  vm.createContext(sandbox);
  const factory = vm.runInContext(`(${jsCode})`, sandbox);
  return factory;
}

// Mock Synthetic KeyboardEvent
function createMockKeyEvent(options = {}) {
  let prevented = false;
  return {
    key: options.key || '',
    code: options.code || '',
    ctrlKey: !!options.ctrlKey,
    metaKey: !!options.metaKey,
    altKey: !!options.altKey,
    shiftKey: !!options.shiftKey,
    target: options.target || null,
    preventDefault: () => { prevented = true; },
    isDefaultPrevented: () => prevented,
    get defaultPrevented() { return prevented; }
  };
}

// Mock Input Input/WebContents Event for main process
function createMockInputEvent(options = {}) {
  let prevented = false;
  const event = {
    preventDefault: () => { prevented = true; },
    isDefaultPrevented: () => prevented,
    get defaultPrevented() { return prevented; }
  };

  const input = {
    type: options.type || 'keyDown',
    key: options.key || '',
    code: options.code || '',
    control: !!options.control,
    meta: !!options.meta,
    alt: !!options.alt,
    shift: !!options.shift
  };

  return { event, input };
}

describe('M5 Empirical Challenger 2: Keyboard Shortcuts & Tier 5 Adversarial Harness', () => {

  // ===========================================================================
  // Part 1: Form Input Element Target Filtering & Text Editing Passthrough
  // ===========================================================================
  describe('Part 1: Form Input Element Target Filtering (Renderer App.tsx)', () => {
    const handlerFactory = getAppKeyDownHandler();

    function setupEnvironment() {
      const calls = {
        createTab: 0,
        closeTab: [],
        cycleTab: [],
        reload: 0,
        goBack: 0,
        goForward: 0,
        setAgentOpenToggled: 0,
        setSettingsOpenToggled: 0,
        setSidebarCollapsedToggled: 0,
        omniboxFocusCalled: 0,
        omniboxSelectCalled: 0
      };

      const mockOmniboxInput = {
        focus: () => { calls.omniboxFocusCalled++; },
        select: () => { calls.omniboxSelectCalled++; }
      };

      const mockDocument = {
        querySelector: (sel) => {
          if (sel.includes('placeholder*="Search or enter URL"')) {
            return mockOmniboxInput;
          }
          return null;
        }
      };

      const deps = {
        activeTabId: 'tab-active-001',
        tabs: [{ id: 'tab-active-001', url: 'https://example.com' }],
        handleCreateTab: () => { calls.createTab++; },
        handleCloseTab: (id) => { calls.closeTab.push(id); },
        handleCycleTab: (dir) => { calls.cycleTab.push(dir); },
        handleReload: () => { calls.reload++; },
        handleGoBack: () => { calls.goBack++; },
        handleGoForward: () => { calls.goForward++; },
        setIsAgentOpen: (updater) => { calls.setAgentOpenToggled++; },
        setIsSettingsOpen: (updater) => { calls.setSettingsOpenToggled++; },
        setSidebarCollapsed: (updater) => { calls.setSidebarCollapsedToggled++; },
        document: mockDocument
      };

      const handler = handlerFactory(deps);
      return { handler, calls };
    }

    it('1.1: Identifies form inputs vs non-input targets accurately across element types', () => {
      const { handler, calls } = setupEnvironment();

      const inputTargets = [
        { tagName: 'INPUT', isContentEditable: false },
        { tagName: 'TEXTAREA', isContentEditable: false },
        { tagName: 'SELECT', isContentEditable: false },
        { tagName: 'DIV', isContentEditable: true },
        { tagName: 'DIV', isContentEditable: 'plaintext-only' },
        { tagName: 'SPAN', isContentEditable: true }
      ];

      const nonInputTargets = [
        { tagName: 'DIV', isContentEditable: false },
        { tagName: 'BUTTON', isContentEditable: false },
        { tagName: 'BODY', isContentEditable: false },
        { tagName: 'SPAN', isContentEditable: false },
        { tagName: 'A', isContentEditable: false },
        null,
        undefined
      ];

      // Test Ctrl+R (reload) behavior:
      // Inside text input -> reload is SUPPRESSED (does not call handleReload, defaultPrevented = false)
      for (const target of inputTargets) {
        const reloadCountBefore = calls.reload;
        const evt = createMockKeyEvent({ key: 'r', ctrlKey: true, target });
        handler(evt);
        assert.strictEqual(calls.reload, reloadCountBefore, `Reload must NOT be triggered when focused on ${target.tagName}`);
        assert.strictEqual(evt.defaultPrevented, false, `defaultPrevented must be false for text target ${target.tagName}`);
      }

      // Outside text input -> reload is EXECUTED (calls handleReload, defaultPrevented = true)
      for (const target of nonInputTargets) {
        const reloadCountBefore = calls.reload;
        const evt = createMockKeyEvent({ key: 'r', ctrlKey: true, target });
        handler(evt);
        assert.strictEqual(calls.reload, reloadCountBefore + 1, `Reload MUST be triggered when focused on non-text target`);
        assert.strictEqual(evt.defaultPrevented, true, `defaultPrevented must be true for non-text target`);
      }
    });

    it('1.2: Empirically verifies text editing hotkeys (Ctrl+A, C, V, X, Z, Y, Enter) pass through without suppression', () => {
      const { handler, calls } = setupEnvironment();

      const targets = [
        { tagName: 'INPUT', isContentEditable: false },
        { tagName: 'TEXTAREA', isContentEditable: false },
        { tagName: 'DIV', isContentEditable: true }
      ];

      const editingKeys = [
        { key: 'a', ctrlKey: true, desc: 'Ctrl+A (Select All)' },
        { key: 'a', metaKey: true, desc: 'Cmd+A (Select All)' },
        { key: 'c', ctrlKey: true, desc: 'Ctrl+C (Copy)' },
        { key: 'c', metaKey: true, desc: 'Cmd+C (Copy)' },
        { key: 'v', ctrlKey: true, desc: 'Ctrl+V (Paste)' },
        { key: 'v', metaKey: true, desc: 'Cmd+V (Paste)' },
        { key: 'x', ctrlKey: true, desc: 'Ctrl+X (Cut)' },
        { key: 'x', metaKey: true, desc: 'Cmd+X (Cut)' },
        { key: 'z', ctrlKey: true, desc: 'Ctrl+Z (Undo)' },
        { key: 'z', metaKey: true, desc: 'Cmd+Z (Undo)' },
        { key: 'y', ctrlKey: true, desc: 'Ctrl+Y (Redo)' },
        { key: 'z', ctrlKey: true, shiftKey: true, desc: 'Ctrl+Shift+Z (Redo)' },
        { key: 'Enter', ctrlKey: true, desc: 'Ctrl+Enter (Submit Prompt/Form)' },
        { key: 'Enter', metaKey: true, desc: 'Cmd+Enter (Submit Prompt/Form)' },
        { key: 'Enter', desc: 'Enter (Newline)' },
        { key: 'Backspace', desc: 'Backspace' },
        { key: 'Delete', desc: 'Delete' },
        { key: 'h', desc: 'Typing "h"' },
        { key: 'e', desc: 'Typing "e"' }
      ];

      for (const target of targets) {
        for (const k of editingKeys) {
          const evt = createMockKeyEvent({ ...k, target });
          handler(evt);

          assert.strictEqual(
            evt.defaultPrevented,
            false,
            `Text editing hotkey ${k.desc} inside <${target.tagName}> must NOT call preventDefault()`
          );

          // Assert zero side effects
          assert.strictEqual(calls.createTab, 0);
          assert.strictEqual(calls.closeTab.length, 0);
          assert.strictEqual(calls.reload, 0);
          assert.strictEqual(calls.goBack, 0);
          assert.strictEqual(calls.goForward, 0);
        }
      }
    });

    it('1.3: Prevents destructive navigation (Alt+Left/Right, Ctrl+R, F5) inside inputs while allowing them outside', () => {
      const { handler, calls } = setupEnvironment();

      const input = { tagName: 'INPUT', isContentEditable: false };
      const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
      const contenteditable = { tagName: 'DIV', isContentEditable: true };

      // 1. Alt+Left (Back) inside inputs
      const backEvt1 = createMockKeyEvent({ key: 'arrowleft', altKey: true, target: input });
      handler(backEvt1);
      assert.strictEqual(calls.goBack, 0, 'Alt+Left must be suppressed in INPUT');
      assert.strictEqual(backEvt1.defaultPrevented, false);

      const backEvt2 = createMockKeyEvent({ key: 'arrowleft', altKey: true, target: textarea });
      handler(backEvt2);
      assert.strictEqual(calls.goBack, 0, 'Alt+Left must be suppressed in TEXTAREA');

      const backEvt3 = createMockKeyEvent({ key: 'arrowleft', altKey: true, target: contenteditable });
      handler(backEvt3);
      assert.strictEqual(calls.goBack, 0, 'Alt+Left must be suppressed in contenteditable');

      // 2. Alt+Right (Forward) inside inputs
      const fwdEvt = createMockKeyEvent({ key: 'arrowright', altKey: true, target: input });
      handler(fwdEvt);
      assert.strictEqual(calls.goForward, 0, 'Alt+Right must be suppressed in INPUT');
      assert.strictEqual(fwdEvt.defaultPrevented, false);

      // 3. F5 (Reload) inside inputs
      const f5Evt = createMockKeyEvent({ key: 'f5', code: 'F5', target: input });
      handler(f5Evt);
      assert.strictEqual(calls.reload, 0, 'F5 must be suppressed in INPUT');
      assert.strictEqual(f5Evt.defaultPrevented, false);

      // 4. Outside inputs: Alt+Left, Alt+Right, F5 execute properly
      const nonInput = { tagName: 'DIV', isContentEditable: false };

      const outsideBack = createMockKeyEvent({ key: 'arrowleft', altKey: true, target: nonInput });
      handler(outsideBack);
      assert.strictEqual(calls.goBack, 1, 'Alt+Left must execute outside inputs');
      assert.strictEqual(outsideBack.defaultPrevented, true);

      const outsideFwd = createMockKeyEvent({ key: 'arrowright', altKey: true, target: nonInput });
      handler(outsideFwd);
      assert.strictEqual(calls.goForward, 1, 'Alt+Right must execute outside inputs');
      assert.strictEqual(outsideFwd.defaultPrevented, true);

      const outsideF5 = createMockKeyEvent({ key: 'f5', code: 'F5', target: nonInput });
      handler(outsideF5);
      assert.strictEqual(calls.reload, 1, 'F5 must execute outside inputs');
      assert.strictEqual(outsideF5.defaultPrevented, true);
    });

    it('1.4: Global browser accelerators (Ctrl+T, W, Tab, K, J, ,, S) operate cleanly even from inside inputs', () => {
      const { handler, calls } = setupEnvironment();
      const input = { tagName: 'INPUT', isContentEditable: false };

      // Ctrl+T (New tab)
      const tEvt = createMockKeyEvent({ key: 't', ctrlKey: true, target: input });
      handler(tEvt);
      assert.strictEqual(calls.createTab, 1);
      assert.strictEqual(tEvt.defaultPrevented, true);

      // Ctrl+W (Close tab)
      const wEvt = createMockKeyEvent({ key: 'w', ctrlKey: true, target: input });
      handler(wEvt);
      assert.deepStrictEqual(calls.closeTab, ['tab-active-001']);
      assert.strictEqual(wEvt.defaultPrevented, true);

      // Ctrl+Tab (Cycle forward)
      const tabEvt = createMockKeyEvent({ key: 'tab', ctrlKey: true, target: input });
      handler(tabEvt);
      assert.deepStrictEqual(calls.cycleTab, [1]);
      assert.strictEqual(tabEvt.defaultPrevented, true);

      // Ctrl+Shift+Tab (Cycle backward)
      const shiftTabEvt = createMockKeyEvent({ key: 'tab', ctrlKey: true, shiftKey: true, target: input });
      handler(shiftTabEvt);
      assert.deepStrictEqual(calls.cycleTab, [1, -1]);
      assert.strictEqual(shiftTabEvt.defaultPrevented, true);

      // Ctrl+K (Focus Omnibox)
      const kEvt = createMockKeyEvent({ key: 'k', ctrlKey: true, target: input });
      handler(kEvt);
      assert.strictEqual(calls.omniboxFocusCalled, 1);
      assert.strictEqual(calls.omniboxSelectCalled, 1);
      assert.strictEqual(kEvt.defaultPrevented, true);

      // Ctrl+J (Toggle AI Copilot)
      const jEvt = createMockKeyEvent({ key: 'j', ctrlKey: true, target: input });
      handler(jEvt);
      assert.strictEqual(calls.setAgentOpenToggled, 1);
      assert.strictEqual(jEvt.defaultPrevented, true);

      // Ctrl+, (Open Settings)
      const commaEvt = createMockKeyEvent({ key: ',', code: 'Comma', ctrlKey: true, target: input });
      handler(commaEvt);
      assert.strictEqual(calls.setSettingsOpenToggled, 1);
      assert.strictEqual(commaEvt.defaultPrevented, true);

      // Ctrl+S (Toggle Sidebar)
      const sEvt = createMockKeyEvent({ key: 's', ctrlKey: true, target: input });
      handler(sEvt);
      assert.strictEqual(calls.setSidebarCollapsedToggled, 1);
      assert.strictEqual(sEvt.defaultPrevented, true);
    });
  });

  // ===========================================================================
  // Part 2: Main Process WebContents before-input-event Accelerators Matrix
  // ===========================================================================
  describe('Part 2: Main Process before-input-event Accelerators Matrix (tabManager.ts)', () => {
    const listenerFactory = getTabManagerBeforeInputEventListener();

    function setupTabManager() {
      const calls = {
        createdTabs: 0,
        closedTabs: [],
        cycledTabs: [],
        reloadedTabs: [],
        goBackTabs: [],
        goForwardTabs: [],
        sentIpcMessages: []
      };

      const mockManager = {
        activeTabId: 'active-tab-xyz',
        createTab: (url, opts) => { calls.createdTabs++; return Promise.resolve(); },
        closeTab: (id) => { calls.closedTabs.push(id); return Promise.resolve(true); },
        cycleTab: (dir) => { calls.cycledTabs.push(dir); },
        reload: (id) => { calls.reloadedTabs.push(id); return Promise.resolve(true); },
        goBack: (id) => { calls.goBackTabs.push(id); return Promise.resolve(true); },
        goForward: (id) => { calls.goForwardTabs.push(id); return Promise.resolve(true); },
        mainWindow: {
          webContents: {
            send: (channel, data) => { calls.sentIpcMessages.push({ channel, data }); }
          },
          focus: () => {}
        }
      };

      const listener = listenerFactory(mockManager);
      return { listener, calls, mockManager };
    }

    it('2.1: Intercepts all 8 browser accelerators in WebContents and calls preventDefault()', () => {
      const { listener, calls } = setupTabManager();

      // 1. Ctrl+T
      const t = createMockInputEvent({ key: 't', code: 'KeyT', control: true });
      listener(t.event, t.input);
      assert.strictEqual(calls.createdTabs, 1);
      assert.strictEqual(t.event.defaultPrevented, true);

      // 2. Ctrl+W
      const w = createMockInputEvent({ key: 'w', code: 'KeyW', control: true });
      listener(w.event, w.input);
      assert.deepStrictEqual(calls.closedTabs, ['active-tab-xyz']);
      assert.strictEqual(w.event.defaultPrevented, true);

      // 3. Ctrl+Tab & Ctrl+Shift+Tab
      const tabFwd = createMockInputEvent({ key: 'tab', code: 'Tab', control: true });
      listener(tabFwd.event, tabFwd.input);
      assert.deepStrictEqual(calls.cycledTabs, [1]);
      assert.strictEqual(tabFwd.event.defaultPrevented, true);

      const tabBack = createMockInputEvent({ key: 'tab', code: 'Tab', control: true, shift: true });
      listener(tabBack.event, tabBack.input);
      assert.deepStrictEqual(calls.cycledTabs, [1, -1]);
      assert.strictEqual(tabBack.event.defaultPrevented, true);

      // 4. Ctrl+K & Ctrl+L
      const k = createMockInputEvent({ key: 'k', code: 'KeyK', control: true });
      listener(k.event, k.input);
      assert.strictEqual(calls.sentIpcMessages.some(m => m.channel === 'shortcuts:focus-omnibox'), true);
      assert.strictEqual(k.event.defaultPrevented, true);

      const l = createMockInputEvent({ key: 'l', code: 'KeyL', control: true });
      listener(l.event, l.input);
      assert.strictEqual(l.event.defaultPrevented, true);

      // 5. Ctrl+J
      const j = createMockInputEvent({ key: 'j', code: 'KeyJ', control: true });
      listener(j.event, j.input);
      assert.strictEqual(calls.sentIpcMessages.some(m => m.channel === 'shortcuts:toggle-ai-drawer'), true);
      assert.strictEqual(j.event.defaultPrevented, true);

      // 6. Ctrl+R & F5
      const r = createMockInputEvent({ key: 'r', code: 'KeyR', control: true });
      listener(r.event, r.input);
      assert.deepStrictEqual(calls.reloadedTabs, ['active-tab-xyz']);
      assert.strictEqual(r.event.defaultPrevented, true);

      const f5 = createMockInputEvent({ key: 'f5', code: 'F5' });
      listener(f5.event, f5.input);
      assert.strictEqual(calls.reloadedTabs.length, 2);
      assert.strictEqual(f5.event.defaultPrevented, true);

      // 7. Alt+Left & Alt+Right
      const altLeft = createMockInputEvent({ key: 'arrowleft', code: 'ArrowLeft', alt: true });
      listener(altLeft.event, altLeft.input);
      assert.deepStrictEqual(calls.goBackTabs, ['active-tab-xyz']);
      assert.strictEqual(altLeft.event.defaultPrevented, true);

      const altRight = createMockInputEvent({ key: 'arrowright', code: 'ArrowRight', alt: true });
      listener(altRight.event, altRight.input);
      assert.deepStrictEqual(calls.goForwardTabs, ['active-tab-xyz']);
      assert.strictEqual(altRight.event.defaultPrevented, true);

      // 8. Ctrl+,
      const comma = createMockInputEvent({ key: ',', code: 'Comma', control: true });
      listener(comma.event, comma.input);
      assert.strictEqual(calls.sentIpcMessages.some(m => m.channel === 'shortcuts:open-settings'), true);
      assert.strictEqual(comma.event.defaultPrevented, true);
    });

    it('2.2: Standard editing shortcuts and plain typing pass through to WebContents untouched', () => {
      const { listener, calls } = setupTabManager();

      const inPageKeys = [
        { key: 'a', code: 'KeyA', control: true, desc: 'Ctrl+A' },
        { key: 'c', code: 'KeyC', control: true, desc: 'Ctrl+C' },
        { key: 'v', code: 'KeyV', control: true, desc: 'Ctrl+V' },
        { key: 'x', code: 'KeyX', control: true, desc: 'Ctrl+X' },
        { key: 'z', code: 'KeyZ', control: true, desc: 'Ctrl+Z' },
        { key: 'y', code: 'KeyY', control: true, desc: 'Ctrl+Y' },
        { key: 'Enter', code: 'Enter', control: true, desc: 'Ctrl+Enter' },
        { key: 'Enter', code: 'Enter', desc: 'Enter' },
        { key: 'Backspace', code: 'Backspace', desc: 'Backspace' },
        { key: 'a', code: 'KeyA', desc: 'Type "a"' },
        { key: '1', code: 'Digit1', desc: 'Type "1"' }
      ];

      for (const k of inPageKeys) {
        const item = createMockInputEvent(k);
        listener(item.event, item.input);
        assert.strictEqual(
          item.event.defaultPrevented,
          false,
          `In-page key ${k.desc} must NOT call event.preventDefault()`
        );
      }
    });

    it('2.3: Non-keyDown input events (keyUp, char) are ignored cleanly', () => {
      const { listener, calls } = setupTabManager();

      const keyUp = createMockInputEvent({ type: 'keyUp', key: 't', code: 'KeyT', control: true });
      listener(keyUp.event, keyUp.input);
      assert.strictEqual(calls.createdTabs, 0);
      assert.strictEqual(keyUp.event.defaultPrevented, false);

      const charEvent = createMockInputEvent({ type: 'char', key: 'w', code: 'KeyW', control: true });
      listener(charEvent.event, charEvent.input);
      assert.strictEqual(calls.closedTabs.length, 0);
      assert.strictEqual(charEvent.event.defaultPrevented, false);
    });
  });

  // ===========================================================================
  // Part 3: Empirical Execution of All 12 Tier 5 Adversarial Stress Tests
  // ===========================================================================
  describe('Part 3: Empirical Execution of All 12 Tier 5 Adversarial Stress Tests', () => {

    it('STRESS-01: Tab Allocation Thrash (30 concurrent creates + 15 concurrent closes)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const createPromises = Array.from({ length: 30 }, (_, i) =>
        driver.api.tabs.create(`https://stress-test-${i}.org`)
      );
      const createdTabs = await Promise.all(createPromises);
      assert.strictEqual(createdTabs.length, 30);
      assert.strictEqual(driver.getTabsList().length, 31);

      const closePromises = createdTabs.slice(0, 15).map(tab =>
        driver.api.tabs.close(tab.id)
      );
      const closeResults = await Promise.all(closePromises);
      assert.ok(closeResults.every(r => r === true));
      assert.strictEqual(driver.getTabsList().length, 16);

      const active = driver.getActiveTab();
      assert.ok(active);
      assert.ok(driver.attachedChildViews.has(active.id));
      await driver.close();
    });

    it('STRESS-02: Rapid Alternating Ctrl+T and Ctrl+W Shortcut Storm (100 spam events)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      for (let i = 0; i < 50; i++) {
        await driver.handleKeyboardShortcut('Ctrl+T');
      }
      assert.strictEqual(driver.getTabsList().length, 51);

      for (let i = 0; i < 70; i++) {
        await driver.handleKeyboardShortcut('Ctrl+W');
      }

      assert.strictEqual(driver.getTabsList().length, 1);
      assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      assert.ok(driver.attachedChildViews.has(driver.getActiveTab().id));
      await driver.close();
    });

    it('STRESS-03: Omnibox Navigation Storm During Multi-Step Agent Research', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const activeTab = await driver.api.tabs.create('https://main-workspace.io');

      const researchPromise = driver.api.agent.researchQuery('Zero-Knowledge Proof Implementations');

      for (let i = 0; i < 15; i++) {
        await driver.api.tabs.navigate(activeTab.id, `https://rapid-nav-${i}.com`);
      }

      assert.strictEqual(driver.getActiveTab().id, activeTab.id);
      assert.strictEqual(driver.getActiveTab().url, 'https://rapid-nav-14.com');

      const res = await researchPromise;
      assert.ok(res.runId);

      const runRecord = driver.researchRuns.get(res.runId);
      for (let i = 0; i < 30 && runRecord?.status !== 'complete'; i++) {
        await new Promise(r => setTimeout(r, 10));
      }

      assert.ok(runRecord);
      assert.strictEqual(runRecord.status, 'complete');
      assert.strictEqual(driver.getActiveTab().id, activeTab.id);
      await driver.close();
    });

    it('STRESS-04: Background Research Pool Limit Flooding (25 requests vs 5 pool capacity)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const results = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          driver.openBackgroundResearchTab(`https://candidate-pool-${i}.org`)
        )
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, THEME_CONSTANTS.MAX_BACKGROUND_TABS);
      assert.strictEqual(rejected.length, 20);
      assert.strictEqual(driver.backgroundTabs.size, THEME_CONSTANTS.MAX_BACKGROUND_TABS);

      const openTabs = Array.from(driver.backgroundTabs.values());
      driver.closeBackgroundResearchTab(openTabs[0].id);
      driver.closeBackgroundResearchTab(openTabs[1].id);
      assert.strictEqual(driver.backgroundTabs.size, 3);

      const newBg1 = await driver.openBackgroundResearchTab('https://new-slot-1.com');
      const newBg2 = await driver.openBackgroundResearchTab('https://new-slot-2.com');
      assert.ok(newBg1);
      assert.ok(newBg2);
      assert.strictEqual(driver.backgroundTabs.size, 5);
      await driver.close();
    });

    it('STRESS-05: Deep DOM ReDoS & 10MB Garbage Ingestion Benchmark (<250ms, 40k cap)', () => {
      const driver = new WarwickBrowserDriver();

      const chunk = '<div><p>Deep content chunk</p><script>console.log("noisy script");</script><style>.bad{color:red;}</style></div>';
      const massiveDom = `<html><body>${chunk.repeat(100000)}</body></html>`;

      const startTime = Date.now();
      const extracted = driver.extractReadableText(massiveDom);
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 250, `Extraction took too long: ${elapsed}ms (expected <250ms)`);
      assert.ok(extracted.length <= THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
      assert.strictEqual(extracted.length, THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
      assert.ok(!extracted.includes('<script'));
      assert.ok(!extracted.includes('<style'));
    });

    it('STRESS-06: 10,000 Rapid History Records Ceiling Enforcement (O(1) memory bound)', () => {
      const driver = new WarwickBrowserDriver();

      const startTime = Date.now();
      for (let i = 0; i < 10000; i++) {
        driver.recordHistory(`https://site-${i}.com`, `Site Title ${i}`);
      }
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 200, `10k history unshifts took too long: ${elapsed}ms`);
      assert.strictEqual(driver.history.length, 500);
      assert.strictEqual(driver.history[0].url, 'https://site-9999.com');
      assert.strictEqual(driver.history[499].url, 'https://site-9500.com');
    });

    it('STRESS-07: Microsecond Agent Cancellation Race (Immediate cancel in tight loop)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      for (let i = 0; i < 10; i++) {
        const promptPromise = driver.api.agent.sendPrompt(`Prompt iteration ${i}`);
        const cancelPromise = driver.api.agent.cancel();
        const [{ runId }, cancelled] = await Promise.all([promptPromise, cancelPromise]);

        assert.ok(runId);
        assert.strictEqual(cancelled, true);
        assert.strictEqual(driver.agentCancelled, true);
      }

      await driver.close();
    });

    it('STRESS-08: Malformed Search Scraping Recovery & URL Resolver Resilience', () => {
      const driver = new WarwickBrowserDriver();

      const malformedInputs = [
        '',
        '   ',
        null,
        undefined,
        '???',
        '????  ',
        '@ai',
        '@ai   ',
        'http://',
        'https://',
        'ftp://',
        'about:',
        'about:blank',
        'localhost:8080/deep/path',
        '192.168.1.1:3000',
        '✨ emoji search term 🚀',
        '\x00nullbyte',
        'a'.repeat(2000)
      ];

      for (const input of malformedInputs) {
        assert.doesNotThrow(() => {
          const res = driver.resolveUrlOrSearch(input);
          assert.ok(res);
          assert.ok(res.type);
        }, `Failed to resolve input: ${String(input)}`);
      }
    });

    it('STRESS-09: Violent Bounds Sync Jitter (100 chaotic and boundary setBounds)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const chaoticBounds = [
        { x: -100, y: -50, width: -20, height: -10 },
        { x: 0, y: 0, width: 0, height: 0 },
        { x: 1920, y: 1080, width: 3840, height: 2160 },
        { x: NaN, y: NaN, width: NaN, height: NaN },
        { x: 120.85, y: 44.12, width: 1024.99, height: 768.4 }
      ];

      for (let i = 0; i < 20; i++) {
        for (const b of chaoticBounds) {
          driver.api.tabs.setBounds(b);
          assert.ok(typeof driver.bounds.x === 'number');
          assert.ok(typeof driver.bounds.y === 'number');
        }
      }

      await driver.close();
    });

    it('STRESS-10: Active Tab Crash Recovery Under Background Load', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      await driver.openBackgroundResearchTab('https://bg-task-1.org');
      await driver.openBackgroundResearchTab('https://bg-task-2.org');
      assert.strictEqual(driver.backgroundTabs.size, 2);

      const activeTab = driver.getActiveTab();
      driver.tabs.get(activeTab.id).state.isCrashed = true;
      assert.strictEqual(driver.getActiveTab().isCrashed, true);

      const reloaded = await driver.api.tabs.reload(activeTab.id);
      assert.strictEqual(reloaded, true);
      assert.strictEqual(driver.getActiveTab().isCrashed, false);

      assert.strictEqual(driver.backgroundTabs.size, 2);
      await driver.close();
    });

    it('STRESS-11: Tab Cycling Forward & Backward via Ctrl+Tab and Ctrl+Shift+Tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const tab1 = await driver.api.tabs.create('https://tab1.com');
      const tab2 = await driver.api.tabs.create('https://tab2.com');
      const tab3 = await driver.api.tabs.create('https://tab3.com');

      const allTabs = driver.getTabsList();
      assert.strictEqual(allTabs.length, 4);
      assert.strictEqual(driver.getActiveTab().id, tab3.id);

      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, allTabs[0].id);

      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab1.id);

      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);

      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab1.id);

      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, allTabs[0].id);

      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab3.id);

      await driver.close();
    });

    it('STRESS-12: Full Matrix of All 8 Browser Shortcuts Verification', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      // 1. Ctrl+T
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+T');
      assert.strictEqual(driver.getTabsList().length, countBefore + 1);

      // 2. Ctrl+K
      assert.strictEqual(driver.omniboxFocused, false);
      await driver.handleKeyboardShortcut('Ctrl+K');
      assert.strictEqual(driver.omniboxFocused, true);

      // 3. Ctrl+J
      assert.strictEqual(driver.isAIDrawerOpen, false);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, true);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, false);

      // 4. Ctrl+R & F5
      const tab = driver.getActiveTab();
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+R'), true);
      assert.strictEqual(await driver.handleKeyboardShortcut('F5'), true);

      // 5. Alt+Left & Alt+Right
      await driver.api.tabs.navigate(tab.id, 'https://first.org');
      await driver.api.tabs.navigate(tab.id, 'https://second.org');
      assert.strictEqual(driver.getActiveTab().url, 'https://second.org');

      await driver.handleKeyboardShortcut('Alt+Left');
      assert.strictEqual(driver.getActiveTab().url, 'https://first.org');

      await driver.handleKeyboardShortcut('Alt+Right');
      assert.strictEqual(driver.getActiveTab().url, 'https://second.org');

      // 6. Ctrl+,
      assert.strictEqual(driver.isSettingsModalOpen, false);
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, true);
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, false);

      // 7. Ctrl+Tab / Ctrl+Shift+Tab
      await driver.api.tabs.create('https://cycle-target.com');
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Tab'), true);
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Shift+Tab'), true);

      // 8. Ctrl+W
      const countBeforeClose = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+W');
      assert.strictEqual(driver.getTabsList().length, countBeforeClose - 1);

      // Unrecognized shortcuts
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Alt+Delete'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('F12'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('Escape'), false);

      await driver.close();
    });
  });

  // ===========================================================================
  // Part 4: Stress Matrix: Concurrency & Invariant Preservation
  // ===========================================================================
  describe('Part 4: Stress Matrix: Concurrency & Invariant Preservation', () => {

    it('4.1: Rapid parallel firing of all 8 accelerators in 100 iterations maintains driver integrity', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const shortcuts = [
        'Ctrl+T',
        'Ctrl+K',
        'Ctrl+J',
        'Ctrl+Tab',
        'Ctrl+Shift+Tab',
        'Ctrl+R',
        'Ctrl+,',
        'Ctrl+W'
      ];

      for (let i = 0; i < 25; i++) {
        // Fire 4 shortcuts in parallel microtasks
        const burst = [
          driver.handleKeyboardShortcut(shortcuts[i % shortcuts.length]),
          driver.handleKeyboardShortcut(shortcuts[(i + 1) % shortcuts.length]),
          driver.handleKeyboardShortcut(shortcuts[(i + 2) % shortcuts.length]),
          driver.handleKeyboardShortcut(shortcuts[(i + 3) % shortcuts.length])
        ];
        await Promise.all(burst);

        // Invariant: At least 1 tab must always exist
        assert.ok(driver.getTabsList().length >= 1, 'Tab count must never drop below 1');
        assert.ok(driver.getActiveTab(), 'Active tab must never be null');
        assert.ok(typeof driver.bounds.x === 'number', 'Bounds must remain valid numbers');
      }

      await driver.close();
    });

    it('4.2: Handles malformed and edge-case shortcut strings without throwing', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const invalidShortcuts = [
        null,
        undefined,
        '',
        '   ',
        123,
        {},
        [],
        'ctrl+',
        'ctrl++',
        'ctrl+shift+',
        'super+hyper+alt+f13',
        'ctrl+alt+w',
        'cmd+shift+alt+ctrl+t'
      ];

      for (const s of invalidShortcuts) {
        assert.doesNotThrow(async () => {
          const res = await driver.handleKeyboardShortcut(s);
          assert.strictEqual(res, false);
        });
      }

      await driver.close();
    });
  });

  // ===========================================================================
  // Part 5: Deep Adversarial Edge Cases, macOS Cmd, & IME Composition
  // ===========================================================================
  describe('Part 5: Deep Adversarial Edge Cases, macOS Cmd, & IME Composition', () => {
    const handlerFactory = getAppKeyDownHandler();

    function setupDetailedEnv() {
      const calls = {
        createTab: 0,
        closeTab: [],
        cycleTab: [],
        reload: 0,
        goBack: 0,
        goForward: 0,
        setAgentOpenToggled: 0,
        setSettingsOpenToggled: 0,
        setSidebarCollapsedToggled: 0,
        omniboxFocusCalled: 0
      };

      const deps = {
        activeTabId: 'active-tab-xyz',
        tabs: [{ id: 'active-tab-xyz', url: 'https://test.local' }],
        handleCreateTab: () => { calls.createTab++; },
        handleCloseTab: (id) => { calls.closeTab.push(id); },
        handleCycleTab: (d) => { calls.cycleTab.push(d); },
        handleReload: () => { calls.reload++; },
        handleGoBack: () => { calls.goBack++; },
        handleGoForward: () => { calls.goForward++; },
        setIsAgentOpen: () => { calls.setAgentOpenToggled++; },
        setIsSettingsOpen: () => { calls.setSettingsOpenToggled++; },
        setSidebarCollapsed: () => { calls.setSidebarCollapsedToggled++; },
        document: {
          querySelector: (sel) => {
            if (sel.includes('placeholder*="Search or enter URL"')) {
              return {
                focus: () => { calls.omniboxFocusCalled++; },
                select: () => {}
              };
            }
            return null;
          }
        }
      };

      return { handler: handlerFactory(deps), calls };
    }

    it('5.1: macOS Command (metaKey) acts identically to Ctrl for all shortcuts', () => {
      const { handler, calls } = setupDetailedEnv();
      const input = { tagName: 'INPUT', isContentEditable: false };

      // Cmd+T
      const cmdT = createMockKeyEvent({ key: 't', metaKey: true, target: input });
      handler(cmdT);
      assert.strictEqual(calls.createTab, 1);
      assert.strictEqual(cmdT.defaultPrevented, true);

      // Cmd+W
      const cmdW = createMockKeyEvent({ key: 'w', metaKey: true, target: input });
      handler(cmdW);
      assert.deepStrictEqual(calls.closeTab, ['active-tab-xyz']);
      assert.strictEqual(cmdW.defaultPrevented, true);

      // Cmd+K
      const cmdK = createMockKeyEvent({ key: 'k', metaKey: true, target: input });
      handler(cmdK);
      assert.strictEqual(calls.omniboxFocusCalled, 1);
      assert.strictEqual(cmdK.defaultPrevented, true);

      // Cmd+J
      const cmdJ = createMockKeyEvent({ key: 'j', metaKey: true, target: input });
      handler(cmdJ);
      assert.strictEqual(calls.setAgentOpenToggled, 1);
      assert.strictEqual(cmdJ.defaultPrevented, true);

      // Cmd+,
      const cmdComma = createMockKeyEvent({ key: ',', code: 'Comma', metaKey: true, target: input });
      handler(cmdComma);
      assert.strictEqual(calls.setSettingsOpenToggled, 1);
      assert.strictEqual(cmdComma.defaultPrevented, true);
    });

    it('5.2: Missing omnibox element in DOM does not throw error on Ctrl+K/Ctrl+L', () => {
      const deps = {
        activeTabId: 'active-tab-xyz',
        tabs: [{ id: 'active-tab-xyz' }],
        handleCreateTab: () => {},
        handleCloseTab: () => {},
        handleCycleTab: () => {},
        handleReload: () => {},
        handleGoBack: () => {},
        handleGoForward: () => {},
        setIsAgentOpen: () => {},
        setIsSettingsOpen: () => {},
        setSidebarCollapsed: () => {},
        document: { querySelector: () => null } // querySelector returns null!
      };

      const handler = handlerFactory(deps);
      const evt = createMockKeyEvent({ key: 'k', ctrlKey: true });

      assert.doesNotThrow(() => {
        handler(evt);
      });
      assert.strictEqual(evt.defaultPrevented, true);
    });

    it('5.3: Rapid key repeat (holding down Ctrl+Tab or Ctrl+T) safely dispatches all events', () => {
      const { handler, calls } = setupDetailedEnv();

      for (let i = 0; i < 50; i++) {
        const evt = createMockKeyEvent({ key: 'tab', ctrlKey: true });
        handler(evt);
        assert.strictEqual(evt.defaultPrevented, true);
      }

      assert.strictEqual(calls.cycleTab.length, 50);
      assert.ok(calls.cycleTab.every(d => d === 1));
    });

    it('5.4: Unassigned modifiers (Ctrl+Shift+T, Ctrl+Alt+K) do not accidentally fire single-modifier hotkeys', () => {
      const { handler, calls } = setupDetailedEnv();

      // Ctrl+Shift+T (should NOT trigger handleCreateTab because e.shiftKey is true)
      const shiftT = createMockKeyEvent({ key: 't', ctrlKey: true, shiftKey: true });
      handler(shiftT);
      assert.strictEqual(calls.createTab, 0);
      assert.strictEqual(shiftT.defaultPrevented, false);

      // Ctrl+Alt+K (should NOT focus omnibox because e.altKey is true)
      const altK = createMockKeyEvent({ key: 'k', ctrlKey: true, altKey: true });
      handler(altK);
      assert.strictEqual(calls.omniboxFocusCalled, 0);
      assert.strictEqual(altK.defaultPrevented, false);

      // Ctrl+Shift+W (should NOT close tab)
      const shiftW = createMockKeyEvent({ key: 'w', ctrlKey: true, shiftKey: true });
      handler(shiftW);
      assert.strictEqual(calls.closeTab.length, 0);
      assert.strictEqual(shiftW.defaultPrevented, false);
    });
  });

});
