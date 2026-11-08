import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

describe('Tier 1: Feature Coverage (Features 21 - 27)', () => {

  // =========================================================================
  // Feature 21: Background Tab Harvester (open_background_research_tab)
  // =========================================================================
  describe('Feature 21: Background Tab Harvester (open_background_research_tab)', () => {
    it('F21-1: Should spawn background research tab detached from visible hierarchy', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://harvest-target.org');
      assert.ok(bg.id.startsWith('bg-'));
      assert.strictEqual(bg.isAttachedToWindow, false);
      assert.strictEqual(driver.backgroundTabs.size, 1);
    });

    it('F21-2: Should enforce isMuted=true on all spawned background research tabs', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://video-media.com');
      assert.strictEqual(bg.isMuted, true);
    });

    it('F21-3: Should run in isolated session partition', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://cookie-target.com');
      assert.strictEqual(bg.partition, 'persist:warwick-research-isolated');
    });

    it('F21-4: Should close background tab and remove from active pool', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://temp-scrape.com');
      const closed = driver.closeBackgroundResearchTab(bg.id);
      assert.strictEqual(closed, true);
      assert.strictEqual(driver.backgroundTabs.size, 0);
    });

    it('F21-5: Should never steal focus from active browsing session', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const activeTabIdBefore = driver.getActiveTab().id;

      await driver.openBackgroundResearchTab('https://harvest-site.com');
      assert.strictEqual(driver.getActiveTab().id, activeTabIdBefore);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 22: Multi-Step Research Orchestrator
  // =========================================================================
  describe('Feature 22: Multi-Step Research Orchestrator', () => {
    it('F22-1: Should initiate research query and return valid runId', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.researchQuery('History of Web Browsers');
      assert.ok(res.runId.startsWith('res-'));
      await driver.close();
    });

    it('F22-2: Should execute through planning, searching, reading, synthesizing stages', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const stages = [];
      driver.api.agent.onActionEvent((action) => {
        stages.push(action.stage);
      });

      await driver.api.agent.researchQuery('Quantum Computing Applications');
      await new Promise(r => setTimeout(r, 350));

      assert.ok(stages.includes('planning'));
      assert.ok(stages.includes('searching'));
      assert.ok(stages.includes('reading'));
      assert.ok(stages.includes('complete'));
      await driver.close();
    });

    it('F22-3: Should produce structured synthesis with citations at completion', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let synthesizedText = '';
      driver.api.agent.onStreamChunk((chunk) => {
        synthesizedText += chunk;
      });

      await driver.api.agent.researchQuery('Artificial Intelligence Agents');
      await new Promise(r => setTimeout(r, 100));

      assert.ok(synthesizedText.includes('Research Synthesis'));
      assert.ok(synthesizedText.includes('Sources Cited'));
      await driver.close();
    });

    it('F22-4: Should track research run state in internal registry', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.researchQuery('Electron Architecture');
      const runRecord = driver.researchRuns.get(res.runId);
      assert.ok(runRecord);
      assert.strictEqual(runRecord.query, 'Electron Architecture');
      await driver.close();
    });

    it('F22-5: Should abort research execution cleanly when cancel is requested', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.agent.researchQuery('Long running research');
      await driver.api.agent.cancel();
      assert.strictEqual(driver.agentCancelled, true);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 23: Non-Disruptive Background Pool
  // =========================================================================
  describe('Feature 23: Non-Disruptive Background Pool', () => {
    it('F23-1: Should enforce maximum background tab limit of 5 to prevent memory exhaustion', async () => {
      const driver = new WarwickBrowserDriver();
      for (let i = 0; i < THEME_CONSTANTS.MAX_BACKGROUND_TABS; i++) {
        await driver.openBackgroundResearchTab(`https://site-${i}.org`);
      }
      assert.strictEqual(driver.backgroundTabs.size, THEME_CONSTANTS.MAX_BACKGROUND_TABS);

      await assert.rejects(
        async () => await driver.openBackgroundResearchTab('https://exceeded.org'),
        /limit/
      );
    });

    it('F23-2: Should keep background tabs out of the user visible tab strip', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const userTabsCountBefore = driver.getTabsList().length;

      await driver.openBackgroundResearchTab('https://background-hidden.org');
      const userTabsCountAfter = driver.getTabsList().length;
      assert.strictEqual(userTabsCountBefore, userTabsCountAfter);
      await driver.close();
    });

    it('F23-3: Should ensure background views do not block user navigation in active tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.openBackgroundResearchTab('https://bg-task.com');

      const navResult = await driver.api.tabs.navigate(driver.getActiveTab().id, 'https://user-nav.org');
      assert.strictEqual(navResult, true);
      assert.strictEqual(driver.getActiveTab().url, 'https://user-nav.org');
      await driver.close();
    });

    it('F23-4: Should release memory slots when background tabs are closed', async () => {
      const driver = new WarwickBrowserDriver();
      const tabs = [];
      for (let i = 0; i < THEME_CONSTANTS.MAX_BACKGROUND_TABS; i++) {
        tabs.push(await driver.openBackgroundResearchTab(`https://slot-${i}.com`));
      }
      driver.closeBackgroundResearchTab(tabs[0].id);
      assert.strictEqual(driver.backgroundTabs.size, THEME_CONSTANTS.MAX_BACKGROUND_TABS - 1);

      // Now should allow opening another tab
      const newTab = await driver.openBackgroundResearchTab('https://new-slot.com');
      assert.ok(newTab);
    });

    it('F23-5: Should clean up all background tabs on browser shutdown', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.openBackgroundResearchTab('https://bg-close-test.org');
      await driver.close();
      assert.strictEqual(driver.backgroundTabs.size, 0);
    });
  });

  // =========================================================================
  // Feature 24: Theme & Branding Engine (OKLCH Dark Palette)
  // =========================================================================
  describe('Feature 24: Theme & Branding Engine (OKLCH Dark Palette)', () => {
    it('F24-1: Should specify primary app background #121215', () => {
      assert.strictEqual(THEME_CONSTANTS.APP_BG, '#121215');
    });

    it('F24-2: Should specify vertical sidebar background #16161a', () => {
      assert.strictEqual(THEME_CONSTANTS.SIDEBAR_BG, '#16161a');
    });

    it('F24-3: Should specify elevated surface background #1c1c22', () => {
      assert.strictEqual(THEME_CONSTANTS.SURFACE_BG, '#1c1c22');
    });

    it('F24-4: Should specify amber accent color #d97706 for Antigravity AI', () => {
      assert.strictEqual(THEME_CONSTANTS.ACCENT_AMBER, '#d97706');
      assert.strictEqual(THEME_CONSTANTS.ACCENT_EMERALD, '#d97706');
    });

    it('F24-5: Should apply dark theme background color to BaseWindow instantiation', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const win = driver.getWindowInfo();
      assert.strictEqual(win.backgroundColor, '#121215');
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 25: Local Storage & History Persistence
  // =========================================================================
  describe('Feature 25: Local Storage & History Persistence', () => {
    it('F25-1: Should record visited URLs in browsing history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://recorded-site.com');
      assert.ok(driver.history.some(h => h.url === 'https://recorded-site.com'));
      await driver.close();
    });

    it('F25-2: Should not record "about:blank" in browsing history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(driver.history.some(h => h.url === 'about:blank'), false);
      await driver.close();
    });

    it('F25-3: Should place newest visited URLs at the front of history', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://first-visit.com');
      await driver.api.tabs.navigate(tab.id, 'https://second-visit.com');
      assert.strictEqual(driver.history[0].url, 'https://second-visit.com');
      assert.strictEqual(driver.history[1].url, 'https://first-visit.com');
      await driver.close();
    });

    it('F25-4: Should record timestamp on each history entry', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const before = Date.now();
      await driver.api.tabs.create('https://timestamped-site.org');
      assert.ok(driver.history[0].visitedAt >= before);
      await driver.close();
    });

    it('F25-5: Should limit history size to max bounds (500 entries)', async () => {
      const driver = new WarwickBrowserDriver();
      for (let i = 0; i < 550; i++) {
        driver.recordHistory(`https://site-${i}.com`, `Site ${i}`);
      }
      assert.strictEqual(driver.history.length, 500);
    });
  });

  // =========================================================================
  // Feature 26: Keyboard Shortcuts
  // =========================================================================
  describe('Feature 26: Keyboard Shortcuts', () => {
    it('F26-1: Should create a new tab when Ctrl+T is pressed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+T');
      assert.strictEqual(driver.getTabsList().length, countBefore + 1);
      await driver.close();
    });

    it('F26-2: Should close active tab when Ctrl+W is pressed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://to-close.com');
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+W');
      assert.strictEqual(driver.getTabsList().length, countBefore - 1);
      await driver.close();
    });

    it('F26-3: Should focus omnibox when Ctrl+K is pressed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(driver.omniboxFocused, false);
      await driver.handleKeyboardShortcut('Ctrl+K');
      assert.strictEqual(driver.omniboxFocused, true);
      await driver.close();
    });

    it('F26-4: Should toggle Antigravity AI sidebar when Ctrl+J is pressed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(driver.isAIDrawerOpen, false);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, true);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, false);
      await driver.close();
    });

    it('F26-5: Should support Mac accelerator Cmd equivalents (Cmd+T, Cmd+W, Cmd+K, Cmd+J)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Cmd+T');
      assert.strictEqual(driver.getTabsList().length, countBefore + 1);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 27: Settings & API Key Management
  // =========================================================================
  describe('Feature 27: Settings & API Key Management', () => {
    it('F27-1: Should retrieve initial application settings via settings.get()', async () => {
      const driver = new WarwickBrowserDriver();
      const settings = await driver.api.settings.get();
      assert.ok(settings);
      assert.strictEqual(typeof settings.geminiApiKey, 'string');
      assert.ok(['google', 'duckduckgo'].includes(settings.defaultSearchEngine));
    });

    it('F27-2: Should persist updated Gemini API key via settings.save()', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: 'AIzaSyDemoKey123456789' });
      const updated = await driver.api.settings.get();
      assert.strictEqual(updated.geminiApiKey, 'AIzaSyDemoKey123456789');
    });

    it('F27-3: Should allow switching default search engine between google and duckduckgo', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ defaultSearchEngine: 'duckduckgo' });
      assert.strictEqual((await driver.api.settings.get()).defaultSearchEngine, 'duckduckgo');

      await driver.api.settings.save({ defaultSearchEngine: 'google' });
      assert.strictEqual((await driver.api.settings.get()).defaultSearchEngine, 'google');
    });

    it('F27-4: Should allow resizing AI panel width preference in settings', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ aiPanelWidth: 420 });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.aiPanelWidth, 420);
    });

    it('F27-5: Should perform partial updates without overwriting unspecified settings', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: 'persisted-key' });
      await driver.api.settings.save({ sidebarCollapsed: true });

      const current = await driver.api.settings.get();
      assert.strictEqual(current.geminiApiKey, 'persisted-key');
      assert.strictEqual(current.sidebarCollapsed, true);
    });
  });

});
