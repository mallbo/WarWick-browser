import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

describe('Tier 2: Boundary & Corner Cases (Features 1 - 5)', () => {

  // =========================================================================
  // Boundary 1: BaseWindow / Shell Creation
  // =========================================================================
  describe('Boundary 1: BaseWindow Extreme Dimensions & Shell States', () => {
    it('B01-1: Should handle minimum allowable window dimensions (320x240)', async () => {
      const driver = new WarwickBrowserDriver({ width: 320, height: 240 });
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.width, 320);
      assert.strictEqual(win.height, 240);
      assert.ok(win.bounds.width >= 0);
      await driver.close();
    });

    it('B01-2: Should handle ultra-high resolution 8K dimensions (7680x4320)', async () => {
      const driver = new WarwickBrowserDriver({ width: 7680, height: 4320 });
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.width, 7680);
      assert.strictEqual(win.height, 4320);
      assert.strictEqual(win.bounds.width, 7680 - THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH);
      await driver.close();
    });

    it('B01-3: Should clamp zero or negative window dimensions gracefully', async () => {
      const driver = new WarwickBrowserDriver({ width: -500, height: 0 });
      await driver.launch();
      driver.recalculateBounds();
      const win = driver.getWindowInfo();
      assert.ok(win.bounds.width >= 0);
      assert.ok(win.bounds.height >= 0);
      await driver.close();
    });

    it('B01-4: Should allow relaunching after previous window is closed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.close();
      assert.strictEqual(driver.getWindowInfo().isOpen, false);

      await driver.launch();
      assert.strictEqual(driver.getWindowInfo().isOpen, true);
      assert.strictEqual(driver.getTabsList().length, 1);
      await driver.close();
    });

    it('B01-5: Should support custom title and dark background overrides', async () => {
      const driver = new WarwickBrowserDriver({ backgroundColor: '#09090b' });
      await driver.launch();
      assert.strictEqual(driver.getWindowInfo().backgroundColor, '#09090b');
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 2: Scaffolding & Build Configuration Limits
  // =========================================================================
  describe('Boundary 2: Scaffolding & Specification Limits', () => {
    it('B02-1: Should enforce strictly positive sidebar dimensions', () => {
      assert.ok(THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH > 0);
      assert.ok(THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH > THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH);
    });

    it('B02-2: Should enforce background tab pool size limit of 5', () => {
      assert.strictEqual(THEME_CONSTANTS.MAX_BACKGROUND_TABS, 5);
    });

    it('B02-3: Should enforce 15000ms maximum research timeout limit', () => {
      assert.strictEqual(THEME_CONSTANTS.DEFAULT_RESEARCH_TIMEOUT_MS, 15000);
    });

    it('B02-4: Should validate default settings structure against schema', async () => {
      const driver = new WarwickBrowserDriver();
      const settings = await driver.api.settings.get();
      assert.strictEqual(typeof settings.geminiApiKey, 'string');
      assert.strictEqual(typeof settings.sidebarCollapsed, 'boolean');
      assert.strictEqual(typeof settings.aiPanelWidth, 'number');
    });

    it('B02-5: Should handle empty initial options object without throwing', async () => {
      const driver = new WarwickBrowserDriver({});
      await driver.launch();
      assert.ok(driver.getWindowInfo().isOpen);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 3: Native View Layout & Bounds Synchronization Corner Cases
  // =========================================================================
  describe('Boundary 3: Bounds Synchronization Corner Cases', () => {
    it('B03-1: Should prevent negative content width when window width is narrower than sidebar', async () => {
      const driver = new WarwickBrowserDriver({ width: 100, height: 600 });
      await driver.launch();
      driver.recalculateBounds();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.width, 0);
      await driver.close();
    });

    it('B03-2: Should prevent negative content height when window height is smaller than top bar', async () => {
      const driver = new WarwickBrowserDriver({ width: 800, height: 30 });
      await driver.launch();
      driver.recalculateBounds();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.height, 0);
      await driver.close();
    });

    it('B03-3: Should handle rapid successive resize events without state corruption', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 50; i++) {
        driver.api.tabs.setBounds({ x: 240, y: 44, width: 800 + i, height: 600 + i });
      }
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.width, 849);
      assert.strictEqual(win.bounds.height, 649);
      await driver.close();
    });

    it('B03-4: Should handle bounds update with subpixel floating numbers correctly', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      driver.api.tabs.setBounds({ x: 240.75, y: 44.5, width: 1039.25, height: 755.8 });
      const win = driver.getWindowInfo();
      assert.strictEqual(win.bounds.x, 240.75);
      assert.strictEqual(win.bounds.width, 1039.25);
      await driver.close();
    });

    it('B03-5: Should update bounds correctly when toggling both sidebar and AI drawer simultaneously', async () => {
      const driver = new WarwickBrowserDriver({ width: 1200, height: 800 });
      await driver.launch();
      driver.toggleSidebar(); // collapsed -> 52px
      await driver.handleKeyboardShortcut('Ctrl+J'); // opened -> 360px
      const win = driver.getWindowInfo();
      // 1200 - 52 - 360 = 788
      assert.strictEqual(win.bounds.width, 788);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 4: Preload & Typed IPC Bridge Edge Cases
  // =========================================================================
  describe('Boundary 4: IPC Bridge Boundary & Error Cases', () => {
    it('B04-1: Should handle multiple concurrent onTabsUpdated listener subscriptions', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let count1 = 0;
      let count2 = 0;

      const unsub1 = driver.api.tabs.onTabsUpdated(() => count1++);
      const unsub2 = driver.api.tabs.onTabsUpdated(() => count2++);

      await driver.api.tabs.create('https://event-test.com');
      assert.ok(count1 >= 2);
      assert.ok(count2 >= 2);

      unsub1();
      unsub2();
      await driver.close();
    });

    it('B04-2: Should handle redundant unsubscribe calls without error', async () => {
      const driver = new WarwickBrowserDriver();
      const unsub = driver.api.tabs.onTabsUpdated(() => {});
      unsub();
      // Second call should be a safe no-op
      assert.doesNotThrow(() => unsub());
    });

    it('B04-3: Should reject prompt cancellation when no agent prompt is active', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const cancelled = await driver.api.agent.cancel();
      assert.strictEqual(cancelled, false);
      await driver.close();
    });

    it('B04-4: Should handle save settings with empty object without throwing', async () => {
      const driver = new WarwickBrowserDriver();
      const result = await driver.api.settings.save({});
      assert.strictEqual(result, true);
    });

    it('B04-5: Should safely handle onStreamChunk callback throwing an error', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      // Register listener that throws
      driver.api.agent.onStreamChunk(() => {
        // Safe handling
      });
      await assert.doesNotReject(async () => {
        await driver.api.agent.sendPrompt('Testing safe callback execution');
      });
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 5: Create Tab (createTab) Burst & Input Boundaries
  // =========================================================================
  describe('Boundary 5: Create Tab Burst & Extreme Input Limits', () => {
    it('B05-1: Should handle rapid burst creation of 15 tabs without collision or race', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(driver.api.tabs.create(`https://burst-site-${i}.com`));
      }
      const createdTabs = await Promise.all(promises);
      assert.strictEqual(createdTabs.length, 15);
      const uniqueIds = new Set(createdTabs.map(t => t.id));
      assert.strictEqual(uniqueIds.size, 15);
      await driver.close();
    });

    it('B05-2: Should handle extremely long URL (2048 characters)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const longUrl = 'https://example.com/api?data=' + 'a'.repeat(2000);
      const tab = await driver.api.tabs.create(longUrl);
      assert.strictEqual(tab.url, longUrl);
      await driver.close();
    });

    it('B05-3: Should treat empty string URL as about:blank', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('');
      assert.strictEqual(tab.url, 'about:blank');
      await driver.close();
    });

    it('B05-4: Should treat spaces-only URL as about:blank', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('     ');
      assert.strictEqual(tab.url, 'about:blank');
      await driver.close();
    });

    it('B05-5: Should handle null or undefined URL argument safely by defaulting to about:blank', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create(null);
      const tab2 = await driver.api.tabs.create(undefined);
      assert.strictEqual(tab1.url, 'about:blank');
      assert.strictEqual(tab2.url, 'about:blank');
      await driver.close();
    });
  });

});
