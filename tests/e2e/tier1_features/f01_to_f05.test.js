import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

describe('Tier 1: Feature Coverage (Features 1 - 5)', () => {

  // =========================================================================
  // Feature 1: BaseWindow / Shell Creation
  // =========================================================================
  describe('Feature 1: BaseWindow / Shell Creation', () => {
    it('F01-1: Should initialize with dark background #121215 by default', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.backgroundColor, THEME_CONSTANTS.APP_BG);
      await driver.close();
    });

    it('F01-2: Should initialize frameless window container for custom chrome', async () => {
      const driver = new WarwickBrowserDriver({ frameless: true });
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.frameless, true);
      await driver.close();
    });

    it('F01-3: Should configure default window dimensions at 1280x800', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.width, 1280);
      assert.strictEqual(win.height, 800);
      await driver.close();
    });

    it('F01-4: Should transition isOpen state from false to true on launch', async () => {
      const driver = new WarwickBrowserDriver();
      assert.strictEqual(driver.getWindowInfo().isOpen, false);
      await driver.launch();
      assert.strictEqual(driver.getWindowInfo().isOpen, true);
      await driver.close();
    });

    it('F01-5: Should clean up state and views cleanly on window close', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.close();
      assert.strictEqual(driver.getWindowInfo().isOpen, false);
      assert.strictEqual(driver.getTabsList().length, 0);
    });
  });

  // =========================================================================
  // Feature 2: Project Scaffolding & Build Pipeline
  // =========================================================================
  describe('Feature 2: Project Scaffolding & Build Pipeline', () => {
    it('F02-1: Should export required architectural types and constants', () => {
      assert.ok(THEME_CONSTANTS.APP_BG);
      assert.ok(THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH);
      assert.ok(THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
    });

    it('F02-2: Should enforce strict type structure on default app settings', async () => {
      const driver = new WarwickBrowserDriver();
      const settings = await driver.api.settings.get();
      assert.ok('geminiApiKey' in settings);
      assert.ok('defaultSearchEngine' in settings);
      assert.ok('sidebarCollapsed' in settings);
      assert.ok('aiPanelWidth' in settings);
      assert.ok(Array.isArray(settings.mcpServers));
    });

    it('F02-3: Should support modern ESM import and module execution', () => {
      assert.strictEqual(typeof WarwickBrowserDriver, 'function');
    });

    it('F02-4: Should enforce 40k max char limit specification for token safety', () => {
      assert.strictEqual(THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS, 40000);
    });

    it('F02-5: Should specify isolated background research partition', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://example.com');
      assert.strictEqual(bg.partition, 'persist:warwick-research-isolated');
    });
  });

  // =========================================================================
  // Feature 3: Native View Layout & Bounds Sync
  // =========================================================================
  describe('Feature 3: Native View Layout & Bounds Sync', () => {
    it('F03-1: Should offset initial bounds by expanded sidebar width (240px)', async () => {
      const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.x, 240);
      assert.strictEqual(win.bounds.width, 1280 - 240);
      await driver.close();
    });

    it('F03-2: Should update bounds when sidebar collapses to 52px', async () => {
      const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
      await driver.launch();
      driver.toggleSidebar(); // collapse
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.x, 52);
      assert.strictEqual(win.bounds.width, 1280 - 52);
      await driver.close();
    });

    it('F03-3: Should contract bounds width when AI drawer is opened', async () => {
      const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
      await driver.launch();
      await driver.handleKeyboardShortcut('Ctrl+J'); // open AI drawer
      const win = driver.getWindowInfo();
      // Expanded sidebar (240) + AI drawer (360) = 600px taken
      assert.strictEqual(win.bounds.width, 1280 - 240 - 360);
      await driver.close();
    });

    it('F03-4: Should accept explicit setBounds from React container resize observer', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      driver.api.tabs.setBounds({ x: 200, y: 50, width: 900, height: 600 });
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.x, 200);
      assert.strictEqual(win.bounds.y, 50);
      assert.strictEqual(win.bounds.width, 900);
      assert.strictEqual(win.bounds.height, 600);
      await driver.close();
    });

    it('F03-5: Should maintain non-negative width when window is resized very small', async () => {
      const driver = new WarwickBrowserDriver({ width: 250, height: 400 });
      await driver.launch();
      driver.recalculateBounds();
      const win = driver.getWindowInfo();
      assert.ok(win.bounds.width >= 0);
      assert.ok(win.bounds.height >= 0);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 4: Preload & Typed IPC Bridge
  // =========================================================================
  describe('Feature 4: Preload & Typed IPC Bridge', () => {
    it('F04-1: Should expose tabs namespace with complete method set', async () => {
      const driver = new WarwickBrowserDriver();
      const tabs = driver.api.tabs;
      assert.strictEqual(typeof tabs.create, 'function');
      assert.strictEqual(typeof tabs.switch, 'function');
      assert.strictEqual(typeof tabs.close, 'function');
      assert.strictEqual(typeof tabs.navigate, 'function');
      assert.strictEqual(typeof tabs.reload, 'function');
      assert.strictEqual(typeof tabs.goBack, 'function');
      assert.strictEqual(typeof tabs.goForward, 'function');
      assert.strictEqual(typeof tabs.setBounds, 'function');
      assert.strictEqual(typeof tabs.onTabsUpdated, 'function');
    });

    it('F04-2: Should expose agent namespace with streaming & action events', async () => {
      const driver = new WarwickBrowserDriver();
      const agent = driver.api.agent;
      assert.strictEqual(typeof agent.sendPrompt, 'function');
      assert.strictEqual(typeof agent.cancel, 'function');
      assert.strictEqual(typeof agent.researchQuery, 'function');
      assert.strictEqual(typeof agent.onStreamChunk, 'function');
      assert.strictEqual(typeof agent.onActionEvent, 'function');
    });

    it('F04-3: Should expose context namespace with captureActivePage', async () => {
      const driver = new WarwickBrowserDriver();
      const context = driver.api.context;
      assert.strictEqual(typeof context.captureActivePage, 'function');
    });

    it('F04-4: Should expose settings namespace with get and save', async () => {
      const driver = new WarwickBrowserDriver();
      const settings = driver.api.settings;
      assert.strictEqual(typeof settings.get, 'function');
      assert.strictEqual(typeof settings.save, 'function');
    });

    it('F04-5: Should support unsubscribing listeners to avoid memory leaks', async () => {
      const driver = new WarwickBrowserDriver();
      let callCount = 0;
      const unsubscribe = driver.api.tabs.onTabsUpdated(() => {
        callCount++;
      });
      assert.strictEqual(callCount, 1); // initial emission
      unsubscribe();
      await driver.api.tabs.create('https://example.com');
      // Should not have received additional calls after unsubscribe
      assert.strictEqual(callCount, 1);
    });
  });

  // =========================================================================
  // Feature 5: Create Tab (createTab)
  // =========================================================================
  describe('Feature 5: Create Tab (createTab)', () => {
    it('F05-1: Should create a new tab with default blank URL and title', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('about:blank');
      assert.ok(tab.id.startsWith('tab-'));
      assert.strictEqual(tab.url, 'about:blank');
      assert.strictEqual(tab.title, 'New Tab');
      await driver.close();
    });

    it('F05-2: Should create a new tab with specified HTTPS URL', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://example.org');
      assert.strictEqual(tab.url, 'https://example.org');
      assert.strictEqual(tab.title, 'example.org');
      await driver.close();
    });

    it('F05-3: Should automatically set newly created tab as the active tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://site1.com');
      assert.strictEqual(driver.getActiveTab().id, tab1.id);
      const tab2 = await driver.api.tabs.create('https://site2.com');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);
      await driver.close();
    });

    it('F05-4: Should initialize tab flags correctly (not loading, not crashed, not muted)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://test.com');
      assert.strictEqual(tab.isLoading, false);
      assert.strictEqual(tab.isCrashed, false);
      assert.strictEqual(tab.isMuted, false);
      assert.strictEqual(tab.isPinned, false);
      await driver.close();
    });

    it('F05-5: Should attach the newly created tab view to the native window', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://activeview.com');
      assert.ok(driver.attachedChildViews.has(tab.id));
      await driver.close();
    });
  });

});
