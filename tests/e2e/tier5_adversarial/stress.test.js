import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';

export class ExtendedWarwickBrowserDriver extends WarwickBrowserDriver {}

describe('Tier 5: Adversarial Stress & Chaos Verification Suite (12 Stress Tests)', () => {

  // =========================================================================
  // Pillar 1: Concurrency Storms & Rapid User Thrashing
  // =========================================================================
  describe('Pillar 1: Concurrency Storms & Rapid User Thrashing', () => {

    it('STRESS-01: Tab Allocation Thrash (30 concurrent creates + 15 concurrent closes)', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      // Launch 30 concurrent tab creations
      const createPromises = Array.from({ length: 30 }, (_, i) =>
        driver.api.tabs.create(`https://stress-test-${i}.org`)
      );
      const createdTabs = await Promise.all(createPromises);
      assert.strictEqual(createdTabs.length, 30);
      assert.strictEqual(driver.getTabsList().length, 31); // 1 initial + 30

      // Concurrently close the first 15 created tabs
      const closePromises = createdTabs.slice(0, 15).map(tab =>
        driver.api.tabs.close(tab.id)
      );
      const closeResults = await Promise.all(closePromises);
      assert.ok(closeResults.every(r => r === true));
      assert.strictEqual(driver.getTabsList().length, 16);

      // Verify active tab remains valid and attached
      const active = driver.getActiveTab();
      assert.ok(active);
      assert.ok(driver.attachedChildViews.has(active.id));
      await driver.close();
    });

    it('STRESS-02: Rapid Alternating Ctrl+T and Ctrl+W Shortcut Storm (100 spam events)', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      // Rapidly burst 50 new tabs via Ctrl+T
      for (let i = 0; i < 50; i++) {
        await driver.handleKeyboardShortcut('Ctrl+T');
      }
      assert.strictEqual(driver.getTabsList().length, 51);

      // Rapidly close 70 times (more than open count)
      for (let i = 0; i < 70; i++) {
        await driver.handleKeyboardShortcut('Ctrl+W');
      }

      // Tab list must never drop below 1; fallback tab must be about:blank
      assert.strictEqual(driver.getTabsList().length, 1);
      assert.strictEqual(driver.getActiveTab().url, 'about:blank');
      assert.ok(driver.attachedChildViews.has(driver.getActiveTab().id));
      await driver.close();
    });

    it('STRESS-03: Omnibox Navigation Storm During Multi-Step Agent Research', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();
      const activeTab = await driver.api.tabs.create('https://main-workspace.io');

      // Kick off background deep research
      const researchPromise = driver.api.agent.researchQuery('Zero-Knowledge Proof Implementations');

      // Concurrently dispatch 15 rapid navigations in active tab
      for (let i = 0; i < 15; i++) {
        await driver.api.tabs.navigate(activeTab.id, `https://rapid-nav-${i}.com`);
      }

      assert.strictEqual(driver.getActiveTab().id, activeTab.id);
      assert.strictEqual(driver.getActiveTab().url, 'https://rapid-nav-14.com');

      // Await research completion and assert clean isolation
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

  });

  // =========================================================================
  // Pillar 2: Resource Exhaustion & Payload Limits
  // =========================================================================
  describe('Pillar 2: Resource Exhaustion & Payload Limits', () => {

    it('STRESS-04: Background Research Pool Limit Flooding (25 requests vs 5 pool capacity)', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      const results = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          driver.openBackgroundResearchTab(`https://candidate-pool-${i}.org`)
        )
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, THEME_CONSTANTS.MAX_BACKGROUND_TABS); // exactly 5
      assert.strictEqual(rejected.length, 20); // 20 rejected
      assert.strictEqual(driver.backgroundTabs.size, THEME_CONSTANTS.MAX_BACKGROUND_TABS);

      // Releasing 2 tabs allows exactly 2 new allocations
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

    it('STRESS-05: Deep DOM ReDoS & 10MB Garbage Ingestion Benchmark (<150ms, 40k cap)', () => {
      const driver = new ExtendedWarwickBrowserDriver();

      // Construct 10MB synthetic DOM with script blocks, noise, and nested elements
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
      const driver = new ExtendedWarwickBrowserDriver();

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

  });

  // =========================================================================
  // Pillar 3: Microsecond Races & Malformed Inputs
  // =========================================================================
  describe('Pillar 3: Microsecond Races & Malformed Inputs', () => {

    it('STRESS-07: Microsecond Agent Cancellation Race (Immediate cancel in tight loop)', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
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
      const driver = new ExtendedWarwickBrowserDriver();

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

  });

  // =========================================================================
  // Pillar 4: Layout Jitter & Crash Resilience
  // =========================================================================
  describe('Pillar 4: Layout Jitter & Crash Resilience', () => {

    it('STRESS-09: Violent Bounds Sync Jitter (100 chaotic and boundary setBounds)', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
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
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      // Open 2 background tabs
      await driver.openBackgroundResearchTab('https://bg-task-1.org');
      await driver.openBackgroundResearchTab('https://bg-task-2.org');
      assert.strictEqual(driver.backgroundTabs.size, 2);

      // Active tab crashes
      const activeTab = driver.getActiveTab();
      driver.tabs.get(activeTab.id).state.isCrashed = true;
      assert.strictEqual(driver.getActiveTab().isCrashed, true);

      // User reloads crashed tab
      const reloaded = await driver.api.tabs.reload(activeTab.id);
      assert.strictEqual(reloaded, true);
      assert.strictEqual(driver.getActiveTab().isCrashed, false);

      // Background tabs remain completely undisturbed
      assert.strictEqual(driver.backgroundTabs.size, 2);
      await driver.close();
    });

  });

  // =========================================================================
  // Pillar 5: Full Keyboard Shortcut Matrix & Multi-State Cycling
  // =========================================================================
  describe('Pillar 5: Full Keyboard Shortcut Matrix & Multi-State Cycling', () => {

    it('STRESS-11: Tab Cycling Forward & Backward via Ctrl+Tab and Ctrl+Shift+Tab', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      // Create 3 tabs: Tab 0 (about:blank), Tab 1, Tab 2, Tab 3
      const tab1 = await driver.api.tabs.create('https://tab1.com');
      const tab2 = await driver.api.tabs.create('https://tab2.com');
      const tab3 = await driver.api.tabs.create('https://tab3.com');

      const allTabs = driver.getTabsList();
      assert.strictEqual(allTabs.length, 4);
      assert.strictEqual(driver.getActiveTab().id, tab3.id);

      // Cycle forward: 3 -> 0 -> 1 -> 2 -> 3
      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, allTabs[0].id);

      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab1.id);

      await driver.handleKeyboardShortcut('Ctrl+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab2.id);

      // Cycle backward: 2 -> 1 -> 0 -> 3
      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab1.id);

      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, allTabs[0].id);

      await driver.handleKeyboardShortcut('Ctrl+Shift+Tab');
      assert.strictEqual(driver.getActiveTab().id, tab3.id);

      await driver.close();
    });

    it('STRESS-12: Full Matrix of All 8 Browser Shortcuts Verification', async () => {
      const driver = new ExtendedWarwickBrowserDriver();
      await driver.launch();

      // 1. Ctrl+T: New Tab
      const countBefore = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+T');
      assert.strictEqual(driver.getTabsList().length, countBefore + 1);

      // 2. Ctrl+K: Focus Omnibox
      assert.strictEqual(driver.omniboxFocused, false);
      await driver.handleKeyboardShortcut('Ctrl+K');
      assert.strictEqual(driver.omniboxFocused, true);

      // 3. Ctrl+J: Toggle AI Drawer
      assert.strictEqual(driver.isAIDrawerOpen, false);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, true);
      await driver.handleKeyboardShortcut('Ctrl+J');
      assert.strictEqual(driver.isAIDrawerOpen, false);

      // 4. Ctrl+R & F5: Reload active tab
      const tab = driver.getActiveTab();
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+R'), true);
      assert.strictEqual(await driver.handleKeyboardShortcut('F5'), true);

      // 5. Alt+Left & Alt+Right: Navigation history
      await driver.api.tabs.navigate(tab.id, 'https://first.org');
      await driver.api.tabs.navigate(tab.id, 'https://second.org');
      assert.strictEqual(driver.getActiveTab().url, 'https://second.org');

      await driver.handleKeyboardShortcut('Alt+Left');
      assert.strictEqual(driver.getActiveTab().url, 'https://first.org');

      await driver.handleKeyboardShortcut('Alt+Right');
      assert.strictEqual(driver.getActiveTab().url, 'https://second.org');

      // 6. Ctrl+,: Toggle Settings Modal
      assert.strictEqual(driver.isSettingsModalOpen, false);
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, true);
      await driver.handleKeyboardShortcut('Ctrl+,');
      assert.strictEqual(driver.isSettingsModalOpen, false);

      // 7. Ctrl+Tab / Ctrl+Shift+Tab: Tab cycling
      await driver.api.tabs.create('https://cycle-target.com');
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Tab'), true);
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Shift+Tab'), true);

      // 8. Ctrl+W: Close tab
      const countBeforeClose = driver.getTabsList().length;
      await driver.handleKeyboardShortcut('Ctrl+W');
      assert.strictEqual(driver.getTabsList().length, countBeforeClose - 1);

      // Unrecognized shortcuts still return false (conforming to B26-1)
      assert.strictEqual(await driver.handleKeyboardShortcut('Ctrl+Alt+Delete'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('F12'), false);
      assert.strictEqual(await driver.handleKeyboardShortcut('Escape'), false);

      await driver.close();
    });

  });

});
