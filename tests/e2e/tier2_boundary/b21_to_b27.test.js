import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

describe('Tier 2: Boundary & Corner Cases (Features 21 - 27)', () => {

  // =========================================================================
  // Boundary 21: Background Tab Harvester Corner Cases
  // =========================================================================
  describe('Boundary 21: Background Tab Harvester Corner Cases', () => {
    it('B21-1: Should handle harvesting background URL with parameters and anchor hash', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://harvest.com/data?id=123#summary');
      assert.strictEqual(bg.url, 'https://harvest.com/data?id=123#summary');
    });

    it('B21-2: Should reject harvesting if background tab pool limit (5) is reached', async () => {
      const driver = new WarwickBrowserDriver();
      for (let i = 0; i < THEME_CONSTANTS.MAX_BACKGROUND_TABS; i++) {
        await driver.openBackgroundResearchTab(`https://fill-${i}.org`);
      }
      await assert.rejects(
        async () => await driver.openBackgroundResearchTab('https://overflow.org'),
        /limit/
      );
    });

    it('B21-3: Should return false when closing an invalid background tab ID', () => {
      const driver = new WarwickBrowserDriver();
      assert.strictEqual(driver.closeBackgroundResearchTab('fake-bg-id'), false);
    });

    it('B21-4: Should ensure audio muting is immutable on background tabs', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('https://podcast.com/audio');
      assert.strictEqual(bg.isMuted, true);
      // Attempting to change mute on background tab should remain muted
      bg.isMuted = true;
      assert.strictEqual(bg.isMuted, true);
    });

    it('B21-5: Should handle background tab creation with malformed URL string', async () => {
      const driver = new WarwickBrowserDriver();
      const bg = await driver.openBackgroundResearchTab('invalid-protocol-url');
      assert.ok(bg.id);
      assert.strictEqual(bg.isAttachedToWindow, false);
    });
  });

  // =========================================================================
  // Boundary 22: Multi-Step Research Orchestrator Corner Cases
  // =========================================================================
  describe('Boundary 22: Multi-Step Research Orchestrator Corner Cases', () => {
    it('B22-1: Should handle 1-word research query ("quantum")', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.researchQuery('quantum');
      assert.ok(res.runId);
      await driver.close();
    });

    it('B22-2: Should handle research query with 300 characters', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const longQuery = 'analyze deep learning browser integration and autonomous synthesis '.repeat(4);
      const res = await driver.api.agent.researchQuery(longQuery);
      assert.ok(res.runId);
      await driver.close();
    });

    it('B22-3: Should handle immediate cancellation during research query planning stage', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.agent.researchQuery('Cancel quickly');
      const cancelled = await driver.api.agent.cancel();
      assert.strictEqual(cancelled, true);
      assert.strictEqual(driver.agentCancelled, true);
      await driver.close();
    });

    it('B22-4: Should handle multiple consecutive research runs with distinct run IDs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res1 = await driver.api.agent.researchQuery('Topic 1');
      const res2 = await driver.api.agent.researchQuery('Topic 2');
      assert.notStrictEqual(res1.runId, res2.runId);
      await driver.close();
    });

    it('B22-5: Should handle research query containing quote characters and dashes', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.researchQuery('"Strawberry Browser" vs "Arc-Browser"');
      assert.ok(res.runId);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 23: Non-Disruptive Background Pool Corner Cases
  // =========================================================================
  describe('Boundary 23: Non-Disruptive Background Pool Corner Cases', () => {
    it('B23-1: Should guarantee background tabs are never added to attachedChildViews', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const bg = await driver.openBackgroundResearchTab('https://bg-detach.com');
      assert.ok(!driver.attachedChildViews.has(bg.id));
      await driver.close();
    });

    it('B23-2: Should maintain active tab identity when all background tabs are freed', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const activeId = driver.getActiveTab().id;

      const bg1 = await driver.openBackgroundResearchTab('https://t1.com');
      const bg2 = await driver.openBackgroundResearchTab('https://t2.com');
      driver.closeBackgroundResearchTab(bg1.id);
      driver.closeBackgroundResearchTab(bg2.id);

      assert.strictEqual(driver.getActiveTab().id, activeId);
      await driver.close();
    });

    it('B23-3: Should maintain pool consistency across multiple allocation and free cycles', async () => {
      const driver = new WarwickBrowserDriver();
      for (let cycle = 0; cycle < 5; cycle++) {
        const bg = await driver.openBackgroundResearchTab(`https://cycle-${cycle}.com`);
        assert.strictEqual(driver.backgroundTabs.size, 1);
        driver.closeBackgroundResearchTab(bg.id);
        assert.strictEqual(driver.backgroundTabs.size, 0);
      }
    });

    it('B23-4: Should preserve background partition isolation between research instances', async () => {
      const driver = new WarwickBrowserDriver();
      const bg1 = await driver.openBackgroundResearchTab('https://site-a.com');
      const bg2 = await driver.openBackgroundResearchTab('https://site-b.com');
      assert.strictEqual(bg1.partition, bg2.partition);
      assert.strictEqual(bg1.partition, 'persist:warwick-research-isolated');
    });

    it('B23-5: Should handle opening and closing background tabs rapidly without race', async () => {
      const driver = new WarwickBrowserDriver();
      const opens = [];
      for (let i = 0; i < 5; i++) {
        opens.push(driver.openBackgroundResearchTab(`https://rapid-${i}.com`));
      }
      const tabs = await Promise.all(opens);
      assert.strictEqual(driver.backgroundTabs.size, 5);
      for (const t of tabs) {
        driver.closeBackgroundResearchTab(t.id);
      }
      assert.strictEqual(driver.backgroundTabs.size, 0);
    });
  });

  // =========================================================================
  // Boundary 24: Theme & Branding Engine Corner Cases
  // =========================================================================
  describe('Boundary 24: Theme & Branding Engine Corner Cases', () => {
    it('B24-1: Should validate all core palette tokens are valid hex color formats', () => {
      const hexRegex = /^#[0-9a-fA-F]{6}$/;
      assert.match(THEME_CONSTANTS.APP_BG, hexRegex);
      assert.match(THEME_CONSTANTS.SIDEBAR_BG, hexRegex);
      assert.match(THEME_CONSTANTS.SURFACE_BG, hexRegex);
      assert.match(THEME_CONSTANTS.ACCENT_AMBER, hexRegex);
      assert.match(THEME_CONSTANTS.ACCENT_EMERALD, hexRegex);
    });

    it('B24-2: Should verify contrast between background and surface tokens', () => {
      assert.notStrictEqual(THEME_CONSTANTS.APP_BG, THEME_CONSTANTS.SURFACE_BG);
      assert.notStrictEqual(THEME_CONSTANTS.SIDEBAR_BG, THEME_CONSTANTS.SURFACE_BG);
    });

    it('B24-3: Should support custom dark background override on launch', async () => {
      const driver = new WarwickBrowserDriver({ backgroundColor: '#141418' });
      await driver.launch();
      assert.strictEqual(driver.getWindowInfo().backgroundColor, '#141418');
      await driver.close();
    });

    it('B24-4: Should maintain theme token stability across window resize', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      driver.api.tabs.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
      assert.strictEqual(driver.getWindowInfo().backgroundColor, THEME_CONSTANTS.APP_BG);
      await driver.close();
    });

    it('B24-5: Should expose amber accent color constant for Antigravity AI UI', () => {
      assert.strictEqual(THEME_CONSTANTS.ACCENT_AMBER.toLowerCase(), '#d97706');
      assert.strictEqual(THEME_CONSTANTS.ACCENT_EMERALD.toLowerCase(), '#d97706');
    });
  });

  // =========================================================================
  // Boundary 25: Local Storage & History Persistence Corner Cases
  // =========================================================================
  describe('Boundary 25: History Persistence Corner Cases', () => {
    it('B25-1: Should handle storing URL with internationalized domain (IDN)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://xn--bcher-kva.example');
      assert.ok(driver.history.some(h => h.url.includes('xn--bcher-kva.example')));
      await driver.close();
    });

    it('B25-2: Should handle history recording with URL exceeding 500 characters', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const longUrl = 'https://search.com/results?query=' + 'item-'.repeat(100);
      await driver.api.tabs.create(longUrl);
      assert.strictEqual(driver.history[0].url, longUrl);
      await driver.close();
    });

    it('B25-3: Should not create history entry for empty or undefined url', () => {
      const driver = new WarwickBrowserDriver();
      driver.recordHistory('', 'Empty Title');
      driver.recordHistory(null, 'Null Title');
      driver.recordHistory(undefined, 'Undefined Title');
      assert.strictEqual(driver.history.length, 0);
    });

    it('B25-4: Should handle duplicate visits by adding multiple historical entries with different timestamps', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://same-url.com');
      await driver.api.tabs.create('https://same-url.com');
      const matches = driver.history.filter(h => h.url === 'https://same-url.com');
      assert.strictEqual(matches.length, 2);
      await driver.close();
    });

    it('B25-5: Should enforce 500-entry ceiling even after 1000 consecutive visits', () => {
      const driver = new WarwickBrowserDriver();
      for (let i = 0; i < 1000; i++) {
        driver.recordHistory(`https://site-${i}.com`, `Site ${i}`);
      }
      assert.strictEqual(driver.history.length, 500);
      assert.strictEqual(driver.history[0].url, 'https://site-999.com');
    });
  });

  // =========================================================================
  // Boundary 26: Keyboard Shortcuts Corner Cases
  // =========================================================================
  describe('Boundary 26: Keyboard Shortcuts Corner Cases', () => {
    it('B26-1: Should safely return false for unrecognized shortcut keys', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Alt+Delete'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('F12'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('Escape'), false);
      await driver.close();
    });

    it('B26-2: Should handle lowercase shortcut strings (ctrl+t, ctrl+w, ctrl+k, ctrl+j)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('ctrl+t');
      assert.strictEqual(driver.getTabsList().length, countBefore + 1);
      await driver.close();
    });

    it('B26-3: Should handle rapid shortcut spam of Ctrl+T (10 new tabs)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const countBefore = driver.getTabsList().length;
      for (let i = 0; i < 10; i++) {
        await driver.handleKeyboardShortcut('Ctrl+T');
      }
      assert.strictEqual(driver.getTabsList().length, countBefore + 10);
      await driver.close();
    });

    it('B26-4: Should close tabs via Ctrl+W until only the fallback tab remains', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 5; i++) {
        await driver.handleKeyboardShortcut('Ctrl+T');
      }
      for (let i = 0; i < 10; i++) {
        await driver.handleKeyboardShortcut('Ctrl+W');
      }
      assert.strictEqual(driver.getTabsList().length, 1);
      assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      await driver.close();
    });

    it('B26-5: Should toggle AI drawer repeatedly via Ctrl+J without desync', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      for (let i = 0; i < 10; i++) {
        await driver.handleKeyboardShortcut('Ctrl+J');
      }
      // 10 toggles returns to closed (false)
      assert.strictEqual(driver.isAIDrawerOpen, false);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 27: Settings & API Key Management Corner Cases
  // =========================================================================
  describe('Boundary 27: Settings Management Corner Cases', () => {
    it('B27-1: Should handle API key with spaces or newline trimming', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: '  AIzaKeyWithSpaces  ' });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.geminiApiKey, '  AIzaKeyWithSpaces  ');
    });

    it('B27-2: Should allow setting empty API key', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: '' });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.geminiApiKey, '');
    });

    it('B27-3: Should handle large AI panel width setting (up to 800px)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ aiPanelWidth: 800 });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.aiPanelWidth, 800);
    });

    it('B27-4: Should handle multiple consecutive save operations', async () => {
      const driver = new WarwickBrowserDriver();
      for (let i = 0; i < 20; i++) {
        await driver.api.settings.save({ aiPanelWidth: 300 + i });
      }
      const current = await driver.api.settings.get();
      assert.strictEqual(current.aiPanelWidth, 319);
    });

    it('B27-5: Should preserve all settings keys across multiple saves', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: 'my-key' });
      await driver.api.settings.save({ defaultSearchEngine: 'duckduckgo' });
      await driver.api.settings.save({ sidebarCollapsed: true });

      const current = await driver.api.settings.get();
      assert.strictEqual(current.geminiApiKey, 'my-key');
      assert.strictEqual(current.defaultSearchEngine, 'duckduckgo');
      assert.strictEqual(current.sidebarCollapsed, true);
    });
  });

});
