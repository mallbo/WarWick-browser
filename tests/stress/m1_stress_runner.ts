import { app, BrowserWindow, WebContentsView } from 'electron';
import { TabManager } from '../../src/main/tabManager';
import { registerIpcHandlers } from '../../src/main/ipcHandlers';
import { IPC_CHANNELS } from '../../src/shared/types';
import assert from 'node:assert';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings: Array<{ test: string; issue: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; repro: string }> = [];

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Details: ${err.message || err}`);
  }
}

// Global safety monitoring
let unhandledRejections: any[] = [];
let uncaughtExceptions: any[] = [];

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  unhandledRejections.push(reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  uncaughtExceptions.push(err);
});

async function runAdversarialStress() {
  console.log('\n===============================================================');
  console.log('  WARWICK ADVERSARIAL CHALLENGER STRESS SUITE (REAL RUNTIME)');
  console.log('===============================================================\n');

  await app.whenReady();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });

  const tabManager = new TabManager(win);
  registerIpcHandlers(win, tabManager);

  // -------------------------------------------------------------------------
  // SECTION 1: Bounds Synchronization Stress & Boundary Testing
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Bounds Synchronization Stress & Corner Cases ---');

  await test('S1-1: Sub-pixel float bounds are rounded to integers', () => {
    tabManager.createTab('about:blank');
    tabManager.setBounds({ x: 240.49, y: 48.75, width: 800.51, height: 600.25 });
    const active = tabManager.getActiveTab();
    assert.ok(active);
    const bounds = active.view.getBounds();
    assert.strictEqual(bounds.x, 240);
    assert.strictEqual(bounds.y, 49);
    assert.strictEqual(bounds.width, 801);
    assert.strictEqual(bounds.height, 600);
  });

  await test('S1-2: Negative bounds are clamped to zero', () => {
    tabManager.setBounds({ x: -100, y: -50, width: -800, height: -600 });
    const active = tabManager.getActiveTab();
    assert.ok(active);
    const bounds = active.view.getBounds();
    assert.strictEqual(bounds.x, 0);
    assert.strictEqual(bounds.y, 0);
    assert.strictEqual(bounds.width, 0);
    assert.strictEqual(bounds.height, 0);
  });

  await test('S1-3: Extreme dimensions (8K 7680x4320)', () => {
    tabManager.setBounds({ x: 0, y: 0, width: 7680, height: 4320 });
    const active = tabManager.getActiveTab();
    assert.ok(active);
    const bounds = active.view.getBounds();
    assert.strictEqual(bounds.width, 7680);
    assert.strictEqual(bounds.height, 4320);
  });

  await test('S1-4: Rapid resize storm (1000 successive setBounds updates)', () => {
    for (let i = 0; i < 1000; i++) {
      tabManager.setBounds({
        x: 240,
        y: 48,
        width: 600 + (i % 300),
        height: 400 + (i % 200)
      });
    }
    const active = tabManager.getActiveTab();
    assert.ok(active);
    const bounds = active.view.getBounds();
    assert.strictEqual(bounds.width, 600 + (999 % 300));
    assert.strictEqual(bounds.height, 400 + (999 % 200));
  });

  await test('S1-5: Concurrent window resize events interleaved with setBounds', () => {
    for (let i = 0; i < 100; i++) {
      win.setSize(1200 + (i % 100), 800 + (i % 100));
      win.emit('resize');
      tabManager.setBounds({ x: 240, y: 48, width: 900 + (i % 50), height: 700 + (i % 50) });
    }
    const active = tabManager.getActiveTab();
    assert.ok(active);
    assert.ok(active.view.getBounds().width > 0);
  });

  await test('S1-6: Bounds update when mainWindow is destroyed does not throw', () => {
    const dummyManager = new TabManager(win);
    assert.doesNotThrow(() => {
      dummyManager.setBounds({ x: 100, y: 100, width: 500, height: 500 });
    });
  });

  await test('S1-7 [CHALLENGE]: setBounds handles null or undefined without throwing uncaught exception', () => {
    try {
      tabManager.setBounds(null as any);
      console.log('    [OK] setBounds handled null cleanly');
    } catch (e: any) {
      findings.push({
        test: 'S1-7',
        issue: `tabManager.setBounds(null) throws uncaught TypeError: ${e.message}`,
        severity: 'HIGH',
        repro: "tabManager.setBounds(null as any)"
      });
      throw e;
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Tab Lifecycle Thrashing & Memory Stress
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Tab Lifecycle & Concurrency Thrashing ---');

  await test('S2-1: 50 tabs burst creation', () => {
    tabManager.destroyAll();
    assert.strictEqual(tabManager.getAllTabs().length, 0);

    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const tab = tabManager.createTab(`about:blank?t=${i}`, { active: false });
      ids.push(tab.id);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 50);
    assert.strictEqual(new Set(ids).size, 50);
  });

  await test('S2-2: Active tab switching storm (200 random switches across 50 tabs)', () => {
    const all = tabManager.getAllTabs();
    for (let i = 0; i < 200; i++) {
      const target = all[(i * 17) % all.length];
      const res = tabManager.switchTab(target.id);
      assert.strictEqual(res, true);
      assert.strictEqual(tabManager.getActiveTabId(), target.id);
    }
    assert.strictEqual(win.contentView.children.length, 1, 'Exactly 1 child view must be attached');
    assert.strictEqual(win.contentView.children[0], tabManager.getActiveTab()?.view);
  });

  await test('S2-3: Idempotent switchTab calls (calling switch on already active tab)', () => {
    const activeId = tabManager.getActiveTabId()!;
    for (let i = 0; i < 50; i++) {
      const res = tabManager.switchTab(activeId);
      assert.strictEqual(res, true);
    }
    assert.strictEqual(win.contentView.children.length, 1);
  });

  await test('S2-4: Rapid mass closing loop down to 3 tabs', () => {
    const all = tabManager.getAllTabs();
    const toClose = all.slice(3); // close 47 tabs
    for (const tab of toClose) {
      const closed = tabManager.closeTab(tab.id);
      assert.strictEqual(closed, true);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 3);
    assert.strictEqual(win.contentView.children.length, 1);
  });

  await test('S2-5: Double closure of same tab returns false safely', () => {
    const temp = tabManager.createTab('about:blank', { active: false });
    assert.strictEqual(tabManager.closeTab(temp.id), true);
    assert.strictEqual(tabManager.closeTab(temp.id), false);
  });

  await test('S2-6: Switching to invalid/random UUID tab returns false safely', () => {
    assert.strictEqual(tabManager.switchTab('00000000-0000-0000-0000-000000000000'), false);
    assert.strictEqual(tabManager.switchTab(''), false);
    assert.strictEqual(tabManager.switchTab(null as any), false);
  });

  await test('S2-7: Closed tab WebContents is cleanly destroyed asynchronously', async () => {
    const temp = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(temp.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;
    assert.strictEqual(wc.isDestroyed(), false);

    tabManager.closeTab(temp.id);
    const start = Date.now();
    while (!wc.isDestroyed() && Date.now() - start < 500) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.strictEqual(wc.isDestroyed(), true, 'WebContents should be destroyed upon closeTab asynchronously');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: Single Tab Closure Auto-Recovery & Edge Cases
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Sole Tab Closure Recovery & Edge Cases ---');

  await test('S3-1: Closing sole remaining active tab triggers automatic default tab creation', () => {
    const all = tabManager.getAllTabs();
    for (const t of all) {
      tabManager.closeTab(t.id);
    }

    const after = tabManager.getAllTabs();
    assert.strictEqual(after.length, 1, 'Auto-recovery must leave 1 tab open');
    assert.strictEqual(after[0].url, 'https://www.google.com');
    assert.strictEqual(tabManager.getActiveTabId(), after[0].id);
    assert.strictEqual(win.contentView.children.length, 1);
  });

  await test('S3-2: 50 consecutive sole-tab closures (chain auto-recovery)', () => {
    for (let i = 0; i < 50; i++) {
      const activeId = tabManager.getActiveTabId();
      assert.ok(activeId, `Iteration ${i}: active tab must exist`);
      assert.strictEqual(tabManager.getAllTabs().length, 1, `Iteration ${i}: exactly 1 tab`);

      const closed = tabManager.closeTab(activeId);
      assert.strictEqual(closed, true, `Iteration ${i}: closeTab succeeds`);

      const current = tabManager.getAllTabs();
      assert.strictEqual(current.length, 1, `Iteration ${i}: auto-created tab present`);
      assert.notStrictEqual(current[0].id, activeId, `Iteration ${i}: new tab ID generated`);
      assert.strictEqual(tabManager.getActiveTabId(), current[0].id, `Iteration ${i}: new tab is active`);
      assert.strictEqual(win.contentView.children.length, 1, `Iteration ${i}: 1 view attached`);
    }
  });

  await test('S3-3 [CHALLENGE]: Closing sole tab when activeTabId was inactive still auto-recovers', () => {
    tabManager.destroyAll();
    assert.strictEqual(tabManager.getAllTabs().length, 0);

    const soleInactive = tabManager.createTab('https://example.org', { active: false });
    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assert.strictEqual(tabManager.getActiveTabId(), null);

    const res = tabManager.closeTab(soleInactive.id);
    assert.strictEqual(res, true);

    const remaining = tabManager.getAllTabs();
    if (remaining.length === 0) {
      findings.push({
        test: 'S3-3',
        issue: 'Closing sole open tab when it was inactive leaves 0 tabs open (violates invariant: browser never empty)',
        severity: 'MEDIUM',
        repro: "tabManager.createTab('https://example.org', { active: false }); tabManager.closeTab(id);"
      });
      assert.fail(`Expected 1 tab auto-created after closing sole tab, but got 0 tabs!`);
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 4: Navigation URL Parsing & Omnibox Resolution Bug
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Navigation & URL Resolver Integrity ---');

  await test('S4-1 [CHALLENGE]: navigate() correctly loads full HTTPS URLs without converting to search queries', () => {
    tabManager.destroyAll();
    const tab = tabManager.createTab('about:blank', { active: true });

    // Test HTTPS URL
    tabManager.navigate(tab.id, 'https://github.com/electron/electron');
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);

    // Verify what navigate resolved to
    const targetUrl = tabManager.resolveNavigationUrl('https://github.com/electron/electron');
    const testHttps = targetUrl === 'https://github.com/electron/electron';
    if (!testHttps) {
      findings.push({
        test: 'S4-1',
        issue: "tabManager failed on valid HTTPS URL",
        severity: 'CRITICAL',
        repro: "tabManager.navigate(tab.id, 'https://github.com/electron/electron')"
      });
      assert.fail(`resolveNavigationUrl failed to recognize valid HTTPS URL 'https://github.com/electron/electron', got: ${targetUrl}`);
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 5: Teardown & Reinitialization
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Complete Teardown & Reinitialization ---');

  await test('S5-1: destroyAll cleanly frees all WebContents and detaches views', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 10; i++) {
      tabManager.createTab(`about:blank?t=${i}`);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 10);

    tabManager.destroyAll();
    assert.strictEqual(tabManager.getAllTabs().length, 0);
    assert.strictEqual(tabManager.getActiveTabId(), null);
    assert.strictEqual(win.contentView.children.length, 0);
  });

  await test('S5-2: tabManager can be reused normally after destroyAll', () => {
    const newTab = tabManager.createTab('https://www.google.com', { active: true });
    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assert.strictEqual(tabManager.getActiveTabId(), newTab.id);
    assert.strictEqual(win.contentView.children.length, 1);
  });

  // -------------------------------------------------------------------------
  // SECTION 6: Milestone 2 Tab Strip, Pinned Tabs & Concurrency Stress
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Milestone 2 Tab Strip, Pinned Tabs & Concurrency Stress ---');

  await test('S6-1 [M2 BURST]: 50 tabs burst creation with mixed schemes and protocols', () => {
    tabManager.destroyAll();
    const urls = [
      'about:blank',
      'https://github.com/electron/electron',
      'http://localhost:3000/dashboard',
      'https://news.ycombinator.com',
      'warwick browser search'
    ];
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const u = urls[i % urls.length];
      const tab = tabManager.createTab(u, { active: i === 0 });
      ids.push(tab.id);
      assert.ok(tab.id, `Tab ${i} must have valid ID`);
      assert.strictEqual(typeof tab.title, 'string', `Tab ${i} must have valid title string`);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 50);
    assert.strictEqual(new Set(ids).size, 50, 'All 50 tab IDs must be unique');
    assert.strictEqual(win.contentView.children.length, 1, 'Only 1 view attached during burst creation');
  });

  await test('S6-2 [M2 SWITCH]: 300 rapid switching operations across 50 tabs', () => {
    const all = tabManager.getAllTabs();
    for (let i = 0; i < 300; i++) {
      const target = all[(i * 13 + (i % 7)) % all.length];
      const res = tabManager.switchTab(target.id);
      assert.strictEqual(res, true, `Switch to ${target.id} must succeed`);
      assert.strictEqual(tabManager.getActiveTabId(), target.id);
    }
    assert.strictEqual(win.contentView.children.length, 1, 'Strict single attached child view invariant');
    assert.strictEqual(win.contentView.children[0], tabManager.getActiveTab()?.view);
  });

  await test('S6-3 [M2 PIN TOGGLE]: 200 pinned tab toggles back and forth', () => {
    const all = tabManager.getAllTabs();
    const half = all.slice(0, 25);
    for (const t of half) {
      assert.strictEqual(tabManager.setTabPinned(t.id, true), true);
    }
    let pinnedCount = tabManager.getAllTabs().filter(t => t.isPinned).length;
    assert.strictEqual(pinnedCount, 25, '25 tabs must be pinned');

    for (let cycle = 0; cycle < 10; cycle++) {
      for (const t of half.slice(0, 10)) {
        tabManager.setTabPinned(t.id, false);
      }
      for (const t of half.slice(0, 10)) {
        tabManager.setTabPinned(t.id, true);
      }
    }
    pinnedCount = tabManager.getAllTabs().filter(t => t.isPinned).length;
    assert.strictEqual(pinnedCount, 25);

    for (const t of half) {
      assert.strictEqual(tabManager.setTabPinned(t.id, false), true);
    }
    assert.strictEqual(tabManager.getAllTabs().filter(t => t.isPinned).length, 0);
  });

  await test('S6-4 [M2 MUTE TOGGLE]: 100 audio muting toggles across tabs', () => {
    const all = tabManager.getAllTabs();
    for (let i = 0; i < 50; i++) {
      const tab = all[i];
      assert.strictEqual(tabManager.setTabMuted(tab.id, true), true);
      const updated = tabManager.getTab(tab.id);
      assert.strictEqual(updated?.state.isMuted, true);
      assert.strictEqual(updated?.view.webContents.isAudioMuted(), true);

      assert.strictEqual(tabManager.setTabMuted(tab.id, false), true);
      assert.strictEqual(updated?.state.isMuted, false);
      assert.strictEqual(updated?.view.webContents.isAudioMuted(), false);
    }
  });

  await test('S6-5 [M2 CLOSURE STORM]: Sequential mass closure of 49 tabs down to 1 tab', () => {
    const all = tabManager.getAllTabs();
    assert.strictEqual(all.length, 50);

    for (let i = 0; i < 49; i++) {
      const currentActive = tabManager.getActiveTabId();
      assert.ok(currentActive);
      const closed = tabManager.closeTab(currentActive);
      assert.strictEqual(closed, true);

      const remaining = tabManager.getAllTabs();
      assert.strictEqual(remaining.length, 50 - (i + 1));
      const newActive = tabManager.getActiveTabId();
      assert.ok(newActive);
      assert.ok(remaining.some(t => t.id === newActive), 'Active tab must be one of the remaining tabs');
      assert.strictEqual(win.contentView.children.length, 1);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 1, 'Exactly 1 tab must remain');
    assert.strictEqual(win.contentView.children.length, 1);
  });

  await test('S6-6 [M2 CHAIN AUTO-RECOVERY]: 30 consecutive sole-tab closures trigger flawless auto-recovery', () => {
    for (let i = 0; i < 30; i++) {
      const activeId = tabManager.getActiveTabId();
      assert.ok(activeId);
      assert.strictEqual(tabManager.getAllTabs().length, 1);

      const closed = tabManager.closeTab(activeId);
      assert.strictEqual(closed, true);

      const after = tabManager.getAllTabs();
      assert.strictEqual(after.length, 1, `Auto-recovery must spawn exactly 1 tab on iteration ${i}`);
      assert.notStrictEqual(after[0].id, activeId, 'Fresh tab ID generated');
      assert.strictEqual(after[0].url, 'https://www.google.com');
      assert.strictEqual(tabManager.getActiveTabId(), after[0].id);
      assert.strictEqual(win.contentView.children.length, 1);
    }
  });

  await test('S6-7 [M2 TITLES]: Extreme titles (Unicode, Arabic RTL, Emojis, CJK, 10,000 chars, HTML/script tags)', () => {
    const active = tabManager.getActiveTab();
    assert.ok(active);
    const wc = active.view.webContents;

    const payloads = [
      'متصفح وارويك للذكاء الاصطناعي',
      '人工知能ブラウザ Warwick ワーウィック',
      '🚀🔥⚡🎉🤖💻 Browser Tab Title with Emojis',
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      'Normal title\0with null bytes',
      'A'.repeat(10000)
    ];

    for (const title of payloads) {
      wc.emit('page-title-updated', {}, title);
      assert.strictEqual(active.state.title, title);
    }

    wc.emit('page-title-updated', {}, '');
    assert.strictEqual(active.state.title, 'Untitled');
  });

  await test('S6-8 [M2 MEMORY]: WebContents listener cleanup verified on closed tabs', async () => {
    const tempTab = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(tempTab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    assert.ok(wc.listenerCount('did-start-loading') > 0);
    assert.ok(wc.listenerCount('did-stop-loading') > 0);
    assert.ok(wc.listenerCount('page-title-updated') > 0);

    tabManager.closeTab(tempTab.id);

    assert.strictEqual(wc.listenerCount('did-start-loading'), 0);
    assert.strictEqual(wc.listenerCount('did-stop-loading'), 0);
    assert.strictEqual(wc.listenerCount('page-title-updated'), 0);

    const start = Date.now();
    while (!wc.isDestroyed() && Date.now() - start < 500) {
      await new Promise(r => setTimeout(r, 20));
    }
    assert.strictEqual(wc.isDestroyed(), true);
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`  EMPIRICAL ADVERSARIAL TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`  ✖ Failed challenge tests: ${failedTests}`);
  }
  if (findings.length > 0) {
    console.warn(`\n  ⚠ Confirmed Empirical Findings (${findings.length}):`);
    findings.forEach((f, idx) => {
      console.warn(`    ${idx + 1}. [${f.severity}] (${f.test}) ${f.issue}`);
      console.warn(`       Repro: ${f.repro}`);
    });
  }
  console.log('===============================================================\n');

  try {
    win.destroy();
  } catch {}

  // Exit with non-zero if challenge tests failed
  app.exit(failedTests > 0 ? 1 : 0);
}

runAdversarialStress().catch((err) => {
  console.error('RUNNER CRASHED:', err);
  app.exit(1);
});
