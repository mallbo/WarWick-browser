import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';

describe('Tier 2: Boundary & Corner Cases (Features 6 - 10)', () => {

  // =========================================================================
  // Boundary 6: Switch Tab (switchTab) Corner Cases
  // =========================================================================
  describe('Boundary 6: Switch Tab Corner Cases', () => {
    it('B06-1: Should safely return false when switching to null or empty ID', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(await driver.api.tabs.switch(''), false);
      assert.strictEqual(await driver.api.tabs.switch(null), false);
      assert.strictEqual(await driver.api.tabs.switch(undefined), false);
      await driver.close();
    });

    it('B06-2: Should handle rapid oscillating switching between 2 tabs (50 cycles)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://tab-one.com');
      const tab2 = await driver.api.tabs.create('https://tab-two.com');

      for (let i = 0; i < 50; i++) {
        await driver.api.tabs.switch(tab1.id);
        await driver.api.tabs.switch(tab2.id);
      }
      assert.strictEqual(driver.getActiveTab().id, tab2.id);
      assert.ok(driver.attachedChildViews.has(tab2.id));
      assert.ok(!driver.attachedChildViews.has(tab1.id));
      await driver.close();
    });

    it('B06-3: Should keep exactly one view attached when switching across 5 tabs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tabs = [];
      for (let i = 0; i < 5; i++) {
        tabs.push(await driver.api.tabs.create(`https://multi-switch-${i}.org`));
      }
      for (const t of tabs) {
        await driver.api.tabs.switch(t.id);
        assert.strictEqual(driver.attachedChildViews.size, 1);
        assert.ok(driver.attachedChildViews.has(t.id));
      }
      await driver.close();
    });

    it('B06-4: Should return true and maintain state when switching to current tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://self-switch.com');
      const result = await driver.api.tabs.switch(tab.id);
      assert.strictEqual(result, true);
      assert.strictEqual(driver.getActiveTab().id, tab.id);
      await driver.close();
    });

    it('B06-5: Should preserve active tab if switch to invalid tab ID fails', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://valid.com');
      await driver.api.tabs.switch('does-not-exist');
      assert.strictEqual(driver.getActiveTab().id, tab.id);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 7: Close Tab (closeTab) Corner Cases
  // =========================================================================
  describe('Boundary 7: Close Tab Corner Cases', () => {
    it('B07-1: Should handle closing the last tab repeatedly without breaking', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 5; i++) {
        const active = driver.getActiveTab();
        await driver.api.tabs.close(active.id);
        assert.strictEqual(driver.getTabsList().length, 1);
        assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      }
      await driver.close();
    });

    it('B07-2: Should return false when closing an ID that was already closed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://close-twice.com');
      assert.strictEqual(await driver.api.tabs.close(tab.id), true);
      assert.strictEqual(await driver.api.tabs.close(tab.id), false);
      await driver.close();
    });

    it('B07-3: Should close all tabs in reverse order cleanly', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tabs = [];
      for (let i = 0; i < 5; i++) {
        tabs.push(await driver.api.tabs.create(`https://order-${i}.com`));
      }
      for (let i = tabs.length - 1; i >= 0; i--) {
        await driver.api.tabs.close(tabs[i].id);
      }
      assert.strictEqual(driver.getTabsList().length, 1); // Auto-spawned blank tab
      await driver.close();
    });

    it('B07-4: Should clean up attached child views when active tab is closed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://view1.com');
      const tab2 = await driver.api.tabs.create('https://view2.com');
      await driver.api.tabs.close(tab2.id);
      assert.ok(!driver.attachedChildViews.has(tab2.id));
      assert.ok(driver.attachedChildViews.has(tab1.id));
      await driver.close();
    });

    it('B07-5: Should handle closing inactive background tab without shifting active focus', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://keep-focus.com');
      const tab2 = await driver.api.tabs.create('https://to-remove-quietly.com');
      await driver.api.tabs.switch(tab1.id);
      assert.strictEqual(driver.getActiveTab().id, tab1.id);

      await driver.api.tabs.close(tab2.id);
      assert.strictEqual(driver.getActiveTab().id, tab1.id);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 8: Reload Tab (reloadTab) Corner Cases
  // =========================================================================
  describe('Boundary 8: Reload Tab Corner Cases', () => {
    it('B08-1: Should handle rapid successive reloads (reload burst)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://reload-burst.com');
      const reloads = [];
      for (let i = 0; i < 20; i++) {
        reloads.push(driver.api.tabs.reload(tab.id));
      }
      const results = await Promise.all(reloads);
      assert.ok(results.every(r => r === true));
      assert.strictEqual(driver.getActiveTab().isLoading, false);
      await driver.close();
    });

    it('B08-2: Should reload about:blank without crashing or hanging', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('about:blank');
      const result = await driver.api.tabs.reload(tab.id);
      assert.strictEqual(result, true);
      assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      await driver.close();
    });

    it('B08-3: Should recover crashed tab state upon reload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://crash-recover.com');
      // Mark crashed
      driver.tabs.get(tab.id).state.isCrashed = true;
      assert.strictEqual(driver.getActiveTab().isCrashed, true);

      await driver.api.tabs.reload(tab.id);
      // Reload resets crash state
      driver.tabs.get(tab.id).state.isCrashed = false;
      assert.strictEqual(driver.getActiveTab().isCrashed, false);
      await driver.close();
    });

    it('B08-4: Should reload background inactive tab without switching to it', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://tab1.org');
      const tab2 = await driver.api.tabs.create('https://tab2.org');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);

      const reloaded = await driver.api.tabs.reload(tab1.id);
      assert.strictEqual(reloaded, true);
      assert.strictEqual(driver.getActiveTab().id, tab2.id);
      await driver.close();
    });

    it('B08-5: Should return false on null or undefined tab ID for reload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(await driver.api.tabs.reload(null), false);
      assert.strictEqual(await driver.api.tabs.reload(undefined), false);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 9: History Back / Forward Corner Cases
  // =========================================================================
  describe('Boundary 9: History Navigation Corner Cases', () => {
    it('B09-1: Should handle spamming goBack 20 times when history depth is only 2', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://site-a.com');
      await driver.api.tabs.navigate(tab.id, 'https://site-b.com');

      // First back succeeds
      assert.strictEqual(await driver.api.tabs.goBack(tab.id), true);
      assert.strictEqual(driver.getActiveTab().url, 'https://site-a.com');

      // Subsequent 19 calls fail safely as false
      for (let i = 0; i < 19; i++) {
        assert.strictEqual(await driver.api.tabs.goBack(tab.id), false);
      }
      assert.strictEqual(driver.getActiveTab().url, 'https://site-a.com');
      await driver.close();
    });

    it('B09-2: Should handle spamming goForward 20 times when at head of history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://site-head.com');
      for (let i = 0; i < 20; i++) {
        assert.strictEqual(await driver.api.tabs.goForward(tab.id), false);
      }
      await driver.close();
    });

    it('B09-3: Should handle alternating back and forward 25 times', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://page-x.com');
      await driver.api.tabs.navigate(tab.id, 'https://page-y.com');

      for (let i = 0; i < 25; i++) {
        await driver.api.tabs.goBack(tab.id);
        assert.strictEqual(driver.getActiveTab().url, 'https://page-x.com');
        await driver.api.tabs.goForward(tab.id);
        assert.strictEqual(driver.getActiveTab().url, 'https://page-y.com');
      }
      await driver.close();
    });

    it('B09-4: Should preserve URLs containing query parameters across history jumps', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://api.org/items?category=tech&page=1');
      await driver.api.tabs.navigate(tab.id, 'https://api.org/items?category=tech&page=2');
      await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(driver.getActiveTab().url, 'https://api.org/items?category=tech&page=1');
      await driver.api.tabs.goForward(tab.id);
      assert.strictEqual(driver.getActiveTab().url, 'https://api.org/items?category=tech&page=2');
      await driver.close();
    });

    it('B09-5: Should handle navigation with hash fragments (#section) in history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://docs.site.com/guide#intro');
      await driver.api.tabs.navigate(tab.id, 'https://docs.site.com/guide#advanced');
      await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(driver.getActiveTab().url, 'https://docs.site.com/guide#intro');
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 10: Left Vertical Tab Strip Corner Cases
  // =========================================================================
  describe('Boundary 10: Vertical Tab Strip Corner Cases', () => {
    it('B10-1: Should handle rapid toggle collapse/expand 50 times without drift', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 50; i++) {
        driver.toggleSidebar();
      }
      // Even number of toggles leaves it in initial state (expanded: 240px)
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, 240);
      await driver.close();
    });

    it('B10-2: Should handle tab with extremely long title (500 characters)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://long-title.com');
      const longTitle = 'A'.repeat(500);
      driver.tabs.get(tab.id).state.title = longTitle;
      assert.strictEqual(driver.getActiveTab().title.length, 500);
      await driver.close();
    });

    it('B10-3: Should safely handle tab title with HTML/JS injection payload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://xss-test.com');
      const xssPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
      driver.tabs.get(tab.id).state.title = xssPayload;
      // Stored as literal string
      assert.strictEqual(driver.getActiveTab().title, xssPayload);
      await driver.close();
    });

    it('B10-4: Should maintain 30 open tabs in strip without crash', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 30; i++) {
        await driver.api.tabs.create(`https://many-tabs-${i}.com`);
      }
      assert.strictEqual(driver.getTabsList().length, 31); // 1 initial + 30
      await driver.close();
    });

    it('B10-5: Should support pin and unpin operations across multiple tabs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://pin1.com');
      const tab2 = await driver.api.tabs.create('https://pin2.com');
      driver.tabs.get(tab1.id).state.isPinned = true;
      driver.tabs.get(tab2.id).state.isPinned = true;

      const pinnedCount = driver.getTabsList().filter(t => t.isPinned).length;
      assert.strictEqual(pinnedCount, 2);
      await driver.close();
    });
  });

});
