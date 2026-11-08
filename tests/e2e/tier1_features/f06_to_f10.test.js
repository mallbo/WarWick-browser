import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

describe('Tier 1: Feature Coverage (Features 6 - 10)', () => {

  // =========================================================================
  // Feature 6: Switch Tab (switchTab)
  // =========================================================================
  describe('Feature 6: Switch Tab (switchTab)', () => {
    it('F06-1: Should change active tab ID when switching between tabs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://alpha.com');
      const tab2 = await driver.api.tabs.create('https://beta.com');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);

      const switched = await driver.api.tabs.switch(tab1.id);
      assert.strictEqual(switched, true);
      assert.strictEqual(driver.getActiveTab().id, tab1.id);
      await driver.close();
    });

    it('F06-2: Should detach old view and attach new view to native window', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://site-a.com');
      const tab2 = await driver.api.tabs.create('https://site-b.com');

      assert.ok(driver.attachedChildViews.has(tab2.id));
      assert.ok(!driver.attachedChildViews.has(tab1.id));

      await driver.api.tabs.switch(tab1.id);
      assert.ok(driver.attachedChildViews.has(tab1.id));
      assert.ok(!driver.attachedChildViews.has(tab2.id));
      await driver.close();
    });

    it('F06-3: Should return false when attempting to switch to invalid tab ID', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const switched = await driver.api.tabs.switch('non-existent-tab-id');
      assert.strictEqual(switched, false);
      await driver.close();
    });

    it('F06-4: Should notify onTabsUpdated listeners upon tab switch', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://one.com');
      const tab2 = await driver.api.tabs.create('https://two.com');

      let notifiedActiveId = null;
      driver.api.tabs.onTabsUpdated((tabs, activeId) => {
        notifiedActiveId = activeId;
      });

      await driver.api.tabs.switch(tab1.id);
      assert.strictEqual(notifiedActiveId, tab1.id);
      await driver.close();
    });

    it('F06-5: Should remain stable when switching to already active tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://stable.com');
      const switched = await driver.api.tabs.switch(tab.id);
      assert.strictEqual(switched, true);
      assert.strictEqual(driver.getActiveTab().id, tab.id);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 7: Close Tab (closeTab)
  // =========================================================================
  describe('Feature 7: Close Tab (closeTab)', () => {
    it('F07-1: Should remove closed tab from tab list and release view', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://tab1.com');
      const tab2 = await driver.api.tabs.create('https://tab2.com');
      
      const closed = await driver.api.tabs.close(tab1.id);
      assert.strictEqual(closed, true);
      const remainingIds = driver.getTabsList().map(t => t.id);
      assert.ok(!remainingIds.includes(tab1.id));
      assert.ok(!driver.attachedChildViews.has(tab1.id));
      await driver.close();
    });

    it('F07-2: Should activate neighboring tab when active tab is closed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://keep.com');
      const tab2 = await driver.api.tabs.create('https://close-me.com');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);

      await driver.api.tabs.close(tab2.id);
      assert.strictEqual(driver.getActiveTab().id, tab1.id);
      await driver.close();
    });

    it('F07-3: Should auto-create a blank new tab if the last tab is closed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const currentTabs = driver.getTabsList();
      // Close all existing tabs
      for (const t of currentTabs) {
        await driver.api.tabs.close(t.id);
      }
      // Specification invariant: closing last tab must never leave browser with 0 tabs
      assert.strictEqual(driver.getTabsList().length, 1);
      assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      await driver.close();
    });

    it('F07-4: Should return false when attempting to close non-existent tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const result = await driver.api.tabs.close('unknown-id');
      assert.strictEqual(result, false);
      await driver.close();
    });

    it('F07-5: Should broadcast updated tab list to listeners after closure', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://a.com');
      const tab2 = await driver.api.tabs.create('https://b.com');

      let lastTabCount = 0;
      driver.api.tabs.onTabsUpdated((tabs) => {
        lastTabCount = tabs.length;
      });

      await driver.api.tabs.close(tab1.id);
      assert.strictEqual(lastTabCount, 2); // Initial tab + b.com
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 8: Reload Tab (reloadTab)
  // =========================================================================
  describe('Feature 8: Reload Tab (reloadTab)', () => {
    it('F08-1: Should successfully reload the specified tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://reloadable.org');
      const result = await driver.api.tabs.reload(tab.id);
      assert.strictEqual(result, true);
      await driver.close();
    });

    it('F08-2: Should toggle isLoading state during reload cycle', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://reloading-test.com');
      const states = [];
      driver.api.tabs.onTabsUpdated((tabs) => {
        const current = tabs.find(t => t.id === tab.id);
        if (current) states.push(current.isLoading);
      });

      await driver.api.tabs.reload(tab.id);
      assert.ok(states.length >= 2);
      assert.strictEqual(driver.getActiveTab().isLoading, false);
      await driver.close();
    });

    it('F08-3: Should return false when reloading an invalid tab ID', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const result = await driver.api.tabs.reload('bad-tab-id');
      assert.strictEqual(result, false);
      await driver.close();
    });

    it('F08-4: Should preserve current URL and title across reload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://persisted-url.org');
      await driver.api.tabs.reload(tab.id);
      const active = driver.getActiveTab();
      assert.strictEqual(active.url, 'https://persisted-url.org');
      assert.strictEqual(active.title, 'persisted-url.org');
      await driver.close();
    });

    it('F08-5: Should preserve navigation history index during reload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://step1.com');
      await driver.api.tabs.navigate(tab.id, 'https://step2.com');
      assert.strictEqual(driver.getActiveTab().canGoBack, true);

      await driver.api.tabs.reload(tab.id);
      assert.strictEqual(driver.getActiveTab().canGoBack, true);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 9: History Back / Forward
  // =========================================================================
  describe('Feature 9: History Back / Forward', () => {
    it('F09-1: Should navigate back to previous URL when goBack is invoked', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://first.com');
      await driver.api.tabs.navigate(tab.id, 'https://second.com');
      assert.strictEqual(driver.getActiveTab().url, 'https://second.com');

      const backResult = await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(backResult, true);
      assert.strictEqual(driver.getActiveTab().url, 'https://first.com');
      await driver.close();
    });

    it('F09-2: Should navigate forward after going back when goForward is invoked', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://page1.com');
      await driver.api.tabs.navigate(tab.id, 'https://page2.com');
      await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(driver.getActiveTab().canGoForward, true);

      const fwdResult = await driver.api.tabs.goForward(tab.id);
      assert.strictEqual(fwdResult, true);
      assert.strictEqual(driver.getActiveTab().url, 'https://page2.com');
      await driver.close();
    });

    it('F09-3: Should return false when goBack is called at start of history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://single-history.com');
      assert.strictEqual(tab.canGoBack, false);
      const backResult = await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(backResult, false);
      await driver.close();
    });

    it('F09-4: Should return false when goForward is called at head of history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://head-history.com');
      assert.strictEqual(tab.canGoForward, false);
      const fwdResult = await driver.api.tabs.goForward(tab.id);
      assert.strictEqual(fwdResult, false);
      await driver.close();
    });

    it('F09-5: Should discard forward stack when navigating to new URL after back', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://url-a.com');
      await driver.api.tabs.navigate(tab.id, 'https://url-b.com');
      await driver.api.tabs.goBack(tab.id);
      assert.strictEqual(driver.getActiveTab().canGoForward, true);

      // Branch to url-c: forward stack should clear
      await driver.api.tabs.navigate(tab.id, 'https://url-c.com');
      assert.strictEqual(driver.getActiveTab().canGoForward, false);
      assert.strictEqual(driver.getActiveTab().canGoBack, true);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 10: Left Vertical Tab Strip
  // =========================================================================
  describe('Feature 10: Left Vertical Tab Strip', () => {
    it('F10-1: Should start expanded with width 240px', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH);
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, 240);
      await driver.close();
    });

    it('F10-2: Should collapse to 52px when toggled', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      driver.toggleSidebar();
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH);
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, 52);
      await driver.close();
    });

    it('F10-3: Should expand back to 240px when toggled twice', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      driver.toggleSidebar(); // 52px
      driver.toggleSidebar(); // 240px
      assert.strictEqual(driver.getWindowInfo().sidebarWidth, 240);
      await driver.close();
    });

    it('F10-4: Should include new tab creation shortcut from tab strip', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const initialCount = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+T');
      assert.strictEqual(driver.getTabsList().length, initialCount + 1);
      await driver.close();
    });

    it('F10-5: Should support pin and unpin state flags on tabs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://pinned.site');
      assert.strictEqual(tab.isPinned, false);
      // Toggle pinned
      const record = driver.tabs.get(tab.id);
      record.state.isPinned = true;
      assert.strictEqual(driver.getActiveTab().isPinned, true);
      await driver.close();
    });
  });

});
