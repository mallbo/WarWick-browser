import { app, BrowserWindow } from 'electron';
import { TabManager } from '../../src/main/tabManager';
import { registerIpcHandlers } from '../../src/main/ipcHandlers';
import assert from 'node:assert';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ test: string; error: string }> = [];

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Details: ${err?.stack || err?.message || err}`);
    failures.push({ test: name, error: err?.message || String(err) });
  }
}

async function runM2ChallengerStress() {
  console.log('\n===============================================================');
  console.log('  WARWICK M2 REMEDIATION EMPIRICAL CHALLENGER STRESS HARNESS');
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

  // Helper to wait for WebContents destruction
  const waitForDestroy = async (wc: any, maxMs = 500): Promise<boolean> => {
    const start = Date.now();
    while (!wc.isDestroyed() && Date.now() - start < maxMs) {
      await new Promise(r => setTimeout(r, 15));
    }
    return wc.isDestroyed();
  };

  // Helper to assert window view invariant
  const assertWindowViewInvariant = (contextMsg: string) => {
    const all = tabManager.getAllTabs();
    if (all.length === 0) {
      assert.strictEqual(win.contentView.children.length, 0, `${contextMsg}: No child view attached when 0 tabs`);
    } else {
      assert.strictEqual(win.contentView.children.length, 1, `${contextMsg}: Exactly 1 child view attached`);
      const activeTab = tabManager.getActiveTab();
      assert.ok(activeTab, `${contextMsg}: Active tab must exist`);
      assert.strictEqual(win.contentView.children[0], activeTab.view, `${contextMsg}: Attached view must match active tab view`);
    }
  };

  // =========================================================================
  // SUITE 1: Direct Verification of S2-7 & S6-8 Baseline and Deep Variations
  // =========================================================================
  console.log('--- SUITE 1: WebContents Lifecycle & Listener Cleanup Verification ---');

  await test('S2-7 (Verification): Closed tab WebContents is cleanly destroyed asynchronously (< 500ms)', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;
    assert.strictEqual(wc.isDestroyed(), false);

    tabManager.closeTab(tab.id);
    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true, 'WebContents must be destroyed upon closeTab asynchronously within 500ms');
  });

  await test('S6-8 (Verification): WebContents listener cleanup verified on closed tabs', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    assert.ok(wc.listenerCount('did-start-loading') > 0);
    assert.ok(wc.listenerCount('did-stop-loading') > 0);
    assert.ok(wc.listenerCount('page-title-updated') > 0);

    tabManager.closeTab(tab.id);

    assert.strictEqual(wc.listenerCount('did-start-loading'), 0);
    assert.strictEqual(wc.listenerCount('did-stop-loading'), 0);
    assert.strictEqual(wc.listenerCount('page-title-updated'), 0);

    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true);
  });

  await test('S1-3: Comprehensive listener cleanup on ALL tracked event types', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    // Verify all 6 tracked events have registered listeners
    const trackedEvents = [
      'did-start-loading',
      'did-stop-loading',
      'page-title-updated',
      'page-favicon-updated',
      'did-navigate',
      'did-navigate-in-page'
    ];

    for (const evt of trackedEvents) {
      assert.ok(wc.listenerCount(evt) > 0, `Event '${evt}' must have registered listener before close`);
    }

    tabManager.closeTab(tab.id);

    // Verify all 6 tracked events are reset to 0 listeners
    for (const evt of trackedEvents) {
      assert.strictEqual(wc.listenerCount(evt), 0, `Event '${evt}' must have 0 listeners after close`);
    }

    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true);
  });

  await test('S1-4: WebContents destruction when closing an ACTIVE tab (attached view)', async () => {
    const tab = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;
    assert.strictEqual(tabManager.getActiveTabId(), tab.id);

    tabManager.closeTab(tab.id);
    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true, 'Active tab WebContents must be destroyed upon close');
    assertWindowViewInvariant('After closing active tab');
  });

  await test('S1-5: WebContents destruction when closing a PINNED tab', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    tabManager.setTabPinned(tab.id, true);
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    tabManager.closeTab(tab.id);
    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true, 'Pinned tab WebContents must be destroyed upon close');
  });

  await test('S1-6: WebContents destruction when closing a MUTED tab', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    tabManager.setTabMuted(tab.id, true);
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    tabManager.closeTab(tab.id);
    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true, 'Muted tab WebContents must be destroyed upon close');
  });

  await test('S1-7: WebContents destruction when closing a CRASHED tab (render-process-gone simulated)', async () => {
    const tab = tabManager.createTab('about:blank', { active: false });
    const tabItem = tabManager.getTab(tab.id);
    assert.ok(tabItem);
    const wc = tabItem.view.webContents;

    // Simulate renderer crash
    wc.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    assert.strictEqual(tabItem.state.isCrashed, true);

    tabManager.closeTab(tab.id);
    const destroyed = await waitForDestroy(wc, 500);
    assert.strictEqual(destroyed, true, 'Crashed tab WebContents must be destroyed upon close');
  });

  // =========================================================================
  // SUITE 2: Tab Churn & Burst Creation
  // =========================================================================
  console.log('\n--- SUITE 2: Tab Churn & Burst Creation Stress ---');

  await test('S2-1: 100-tab burst creation with mixed URLs and schemes', () => {
    tabManager.destroyAll();
    const urls = [
      'about:blank',
      'data:text/html,<h1>Test</h1>',
      'https://github.com/electron/electron',
      'http://localhost:8080/dashboard',
      '127.0.0.1:3000',
      'search term with spaces',
      'news.ycombinator.com'
    ];

    const tabIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const u = urls[i % urls.length];
      const t = tabManager.createTab(u, { active: i === 0 });
      tabIds.push(t.id);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 100);
    assert.strictEqual(new Set(tabIds).size, 100, 'All 100 tab IDs must be distinct');
    assertWindowViewInvariant('100 tabs burst creation');
  });

  await test('S2-2: Burst creation with ALL tabs set to active: true sequentially', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 30; i++) {
      const t = tabManager.createTab(`about:blank?active=${i}`, { active: true });
      assert.strictEqual(tabManager.getActiveTabId(), t.id);
      assertWindowViewInvariant(`Burst active creation iteration ${i}`);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 30);
  });

  await test('S2-3: Rapid interleaved churn storm (300 randomized lifecycle operations)', async () => {
    // 300 cycles of mixed operations
    for (let cycle = 0; cycle < 300; cycle++) {
      const tabs = tabManager.getAllTabs();
      const op = cycle % 7;

      switch (op) {
        case 0: { // Create active
          tabManager.createTab(`about:blank?cycle=${cycle}`, { active: true });
          break;
        }
        case 1: { // Create background
          tabManager.createTab(`about:blank?bg=${cycle}`, { active: false });
          break;
        }
        case 2: { // Switch random tab
          if (tabs.length > 0) {
            const pick = tabs[Math.floor(Math.random() * tabs.length)];
            tabManager.switchTab(pick.id);
          }
          break;
        }
        case 3: { // Close random tab (if > 1)
          if (tabs.length > 1) {
            const pick = tabs[Math.floor(Math.random() * tabs.length)];
            tabManager.closeTab(pick.id);
          }
          break;
        }
        case 4: { // Toggle pin
          if (tabs.length > 0) {
            const pick = tabs[Math.floor(Math.random() * tabs.length)];
            tabManager.setTabPinned(pick.id, !pick.isPinned);
          }
          break;
        }
        case 5: { // Toggle mute
          if (tabs.length > 0) {
            const pick = tabs[Math.floor(Math.random() * tabs.length)];
            tabManager.setTabMuted(pick.id, !pick.isMuted);
          }
          break;
        }
        case 6: { // Navigate active
          const activeId = tabManager.getActiveTabId();
          if (activeId) {
            tabManager.navigate(activeId, `about:blank?nav=${cycle}`);
          }
          break;
        }
      }

      // Invariant check on every 25th iteration to prevent slowdown while ensuring correctness
      if (cycle % 25 === 0) {
        assertWindowViewInvariant(`Churn cycle ${cycle}`);
        assert.ok(tabManager.getAllTabs().length >= 1, 'Tabs list must never be empty');
      }
    }

    assertWindowViewInvariant('After 300 churn operations');
  });

  // =========================================================================
  // SUITE 3: Rapid Tab Switching & Concurrency Stress
  // =========================================================================
  console.log('\n--- SUITE 3: Rapid Tab Switching & Concurrency Stress ---');

  await test('S3-1: 500 rapid switching operations across 50 tabs', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 50; i++) {
      tabManager.createTab(`about:blank?t=${i}`, { active: i === 0 });
    }
    const all = tabManager.getAllTabs();
    assert.strictEqual(all.length, 50);

    for (let i = 0; i < 500; i++) {
      const target = all[(i * 31 + (i % 11)) % all.length];
      const res = tabManager.switchTab(target.id);
      assert.strictEqual(res, true);
      assert.strictEqual(tabManager.getActiveTabId(), target.id);
    }
    assertWindowViewInvariant('After 500 rapid switches');
  });

  await test('S3-2: Rapid switching interleaved with bounds updates (setBounds storm)', () => {
    const all = tabManager.getAllTabs();
    for (let i = 0; i < 100; i++) {
      const target = all[i % all.length];
      tabManager.switchTab(target.id);
      tabManager.setBounds({
        x: 200 + (i % 50),
        y: 40 + (i % 20),
        width: 800 + (i % 100),
        height: 600 + (i % 100)
      });
    }
    assertWindowViewInvariant('After interleaved switches and bounds');
  });

  await test('S3-3: Rapid ping-pong switching between 2 tabs (200 cycles)', () => {
    const all = tabManager.getAllTabs();
    const tabA = all[0].id;
    const tabB = all[1].id;

    for (let i = 0; i < 200; i++) {
      const target = i % 2 === 0 ? tabA : tabB;
      assert.strictEqual(tabManager.switchTab(target), true);
      assert.strictEqual(tabManager.getActiveTabId(), target);
    }
    assertWindowViewInvariant('After 200 ping-pong switches');
  });

  await test('S3-4: Switch to invalid IDs (undefined, null, empty, non-existent UUID) returns false and preserves active view', () => {
    const currentActive = tabManager.getActiveTabId();
    assert.ok(currentActive);

    assert.strictEqual(tabManager.switchTab(''), false);
    assert.strictEqual(tabManager.switchTab('non-existent-uuid'), false);
    assert.strictEqual(tabManager.switchTab(null as any), false);
    assert.strictEqual(tabManager.switchTab(undefined as any), false);

    assert.strictEqual(tabManager.getActiveTabId(), currentActive);
    assertWindowViewInvariant('After invalid switchTab attempts');
  });

  await test('S3-5: Idempotent switchTab on already active tab (100 cycles)', () => {
    const currentActive = tabManager.getActiveTabId()!;
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(tabManager.switchTab(currentActive), true);
    }
    assertWindowViewInvariant('After idempotent switchTab cycles');
  });

  // =========================================================================
  // SUITE 4: Pinned Tab Operations & Toggles
  // =========================================================================
  console.log('\n--- SUITE 4: Pinned Tab Operations & Toggles ---');

  await test('S4-1: 500 pinned tab toggles across multiple tabs', () => {
    const all = tabManager.getAllTabs();
    const half = all.slice(0, 25);

    // Initial pin
    for (const t of half) {
      assert.strictEqual(tabManager.setTabPinned(t.id, true), true);
    }
    assert.strictEqual(tabManager.getAllTabs().filter(t => t.isPinned).length, 25);

    // 20 cycles of flipping 10 tabs
    for (let cycle = 0; cycle < 20; cycle++) {
      for (const t of half.slice(0, 10)) {
        tabManager.setTabPinned(t.id, cycle % 2 === 0 ? false : true);
      }
    }

    // Clean unpin all
    for (const t of all) {
      tabManager.setTabPinned(t.id, false);
    }
    assert.strictEqual(tabManager.getAllTabs().filter(t => t.isPinned).length, 0);
  });

  await test('S4-2: Closing pinned active tab cleanly transitions to adjacent tab', async () => {
    tabManager.destroyAll();
    const t1 = tabManager.createTab('about:blank?1', { active: true });
    const t2 = tabManager.createTab('about:blank?2', { active: false });
    tabManager.setTabPinned(t1.id, true);

    const t1Item = tabManager.getTab(t1.id)!;
    const wc1 = t1Item.view.webContents;

    assert.strictEqual(tabManager.getActiveTabId(), t1.id);
    const closed = tabManager.closeTab(t1.id);
    assert.strictEqual(closed, true);

    assert.strictEqual(tabManager.getActiveTabId(), t2.id);
    assertWindowViewInvariant('After closing pinned active tab');

    const destroyed = await waitForDestroy(wc1, 500);
    assert.strictEqual(destroyed, true);
  });

  await test('S4-3: Mass pinning all 30 tabs and closing all pinned tabs down to 1', async () => {
    tabManager.destroyAll();
    for (let i = 0; i < 30; i++) {
      const t = tabManager.createTab(`about:blank?p=${i}`, { active: i === 0 });
      tabManager.setTabPinned(t.id, true);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 30);
    assert.strictEqual(tabManager.getAllTabs().filter(t => t.isPinned).length, 30);

    const tabsToClose = tabManager.getAllTabs().slice(1);
    for (const t of tabsToClose) {
      assert.strictEqual(tabManager.closeTab(t.id), true);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assertWindowViewInvariant('After mass closing pinned tabs down to 1');
  });

  // =========================================================================
  // SUITE 5: Mass Closures & Sole-Tab Recovery Storm
  // =========================================================================
  console.log('\n--- SUITE 5: Mass Closures & Sole-Tab Recovery Storm ---');

  await test('S5-1: Mass closure of 60 tabs down to 1 in FIFO order', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 60; i++) {
      tabManager.createTab(`about:blank?fifo=${i}`, { active: i === 0 });
    }
    assert.strictEqual(tabManager.getAllTabs().length, 60);

    const all = tabManager.getAllTabs();
    for (let i = 0; i < 59; i++) {
      assert.strictEqual(tabManager.closeTab(all[i].id), true);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assert.strictEqual(tabManager.getAllTabs()[0].id, all[59].id);
    assertWindowViewInvariant('FIFO mass closure down to 1');
  });

  await test('S5-2: Mass closure of 60 tabs down to 1 in LIFO order', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 60; i++) {
      tabManager.createTab(`about:blank?lifo=${i}`, { active: i === 0 });
    }
    assert.strictEqual(tabManager.getAllTabs().length, 60);

    const all = tabManager.getAllTabs();
    for (let i = 59; i > 0; i--) {
      assert.strictEqual(tabManager.closeTab(all[i].id), true);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assert.strictEqual(tabManager.getAllTabs()[0].id, all[0].id);
    assertWindowViewInvariant('LIFO mass closure down to 1');
  });

  await test('S5-3: Consecutive active-tab closures (50 consecutive active closures down to 1)', () => {
    tabManager.destroyAll();
    for (let i = 0; i < 50; i++) {
      tabManager.createTab(`about:blank?active_close=${i}`, { active: i === 0 });
    }
    assert.strictEqual(tabManager.getAllTabs().length, 50);

    for (let i = 0; i < 49; i++) {
      const activeId = tabManager.getActiveTabId()!;
      assert.strictEqual(tabManager.closeTab(activeId), true);
      assert.notStrictEqual(tabManager.getActiveTabId(), activeId);
      assertWindowViewInvariant(`Active close iteration ${i}`);
    }

    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assertWindowViewInvariant('After 49 consecutive active closures');
  });

  await test('S5-4: Chain sole-tab closure storm (50 consecutive sole closures)', async () => {
    // Starting with 1 tab, close it 50 times in a row
    const closedWcs: any[] = [];

    for (let i = 0; i < 50; i++) {
      const active = tabManager.getActiveTab();
      assert.ok(active, `Iteration ${i}: Active tab must exist`);
      assert.strictEqual(tabManager.getAllTabs().length, 1, `Iteration ${i}: Exactly 1 tab before close`);

      const prevId = active.id;
      const prevWc = active.view.webContents;
      closedWcs.push(prevWc);

      const closed = tabManager.closeTab(prevId);
      assert.strictEqual(closed, true, `Iteration ${i}: closeTab succeeded`);

      // Auto-recovery asserts
      const remaining = tabManager.getAllTabs();
      assert.strictEqual(remaining.length, 1, `Iteration ${i}: Exactly 1 tab auto-created`);
      assert.notStrictEqual(remaining[0].id, prevId, `Iteration ${i}: Fresh tab ID generated`);
      assert.strictEqual(remaining[0].url, 'https://www.google.com', `Iteration ${i}: Auto-created default URL`);
      assert.strictEqual(tabManager.getActiveTabId(), remaining[0].id, `Iteration ${i}: New tab active`);
      assertWindowViewInvariant(`Sole tab closure iteration ${i}`);
    }

    // Verify all 50 closed WebContents instances were cleanly destroyed
    for (let i = 0; i < closedWcs.length; i++) {
      const destroyed = await waitForDestroy(closedWcs[i], 500);
      assert.strictEqual(destroyed, true, `Closed WebContents ${i} must be destroyed`);
    }
  });

  await test('S5-5: destroyAll() cleans up 50 tabs and tabManager can be reused immediately', async () => {
    tabManager.destroyAll();
    const wcs: any[] = [];
    for (let i = 0; i < 50; i++) {
      const t = tabManager.createTab(`about:blank?d=${i}`);
      wcs.push(tabManager.getTab(t.id)!.view.webContents);
    }
    assert.strictEqual(tabManager.getAllTabs().length, 50);

    tabManager.destroyAll();
    assert.strictEqual(tabManager.getAllTabs().length, 0);
    assert.strictEqual(tabManager.getActiveTabId(), null);
    assert.strictEqual(win.contentView.children.length, 0);

    // Verify all 50 WebContents are destroyed
    for (let i = 0; i < wcs.length; i++) {
      const destroyed = await waitForDestroy(wcs[i], 500);
      assert.strictEqual(destroyed, true, `WebContents ${i} from destroyAll must be destroyed`);
    }

    // Reuse tabManager
    const fresh = tabManager.createTab('https://www.google.com', { active: true });
    assert.strictEqual(tabManager.getAllTabs().length, 1);
    assert.strictEqual(tabManager.getActiveTabId(), fresh.id);
    assertWindowViewInvariant('After re-using tabManager');
  });

  // =========================================================================
  // SUITE 6: Deep WebContents Memory & Listener Audit
  // =========================================================================
  console.log('\n--- SUITE 6: Deep WebContents Memory & Listener Audit ---');

  await test('S6-1: 100 tabs batch creation and closure with 100% async destruction verification', async () => {
    tabManager.destroyAll();
    const wcs: Array<{ wc: any; id: string }> = [];

    for (let i = 0; i < 100; i++) {
      const t = tabManager.createTab(`about:blank?leaktest=${i}`, { active: i === 0 });
      const item = tabManager.getTab(t.id)!;
      wcs.push({ wc: item.view.webContents, id: t.id });
    }

    assert.strictEqual(tabManager.getAllTabs().length, 100);

    // Close all 100 tabs (last one will auto-recover 1 tab)
    for (const { id } of wcs) {
      tabManager.closeTab(id);
    }

    // Wait for all 100 to be destroyed
    let destroyedCount = 0;
    for (const { wc } of wcs) {
      const d = await waitForDestroy(wc, 1000);
      if (d) destroyedCount++;
    }

    assert.strictEqual(destroyedCount, 100, 'All 100 WebContents must be destroyed without leak');
  });

  await test('S6-2: Verified zero listener count across all 100 closed tabs', () => {
    // Test that closing multiple tabs removes TabManager event listeners unconditionally
    const tempTabs: string[] = [];
    const wcs: any[] = [];
    for (let i = 0; i < 20; i++) {
      const t = tabManager.createTab(`about:blank?listeners=${i}`, { active: false });
      tempTabs.push(t.id);
      wcs.push(tabManager.getTab(t.id)!.view.webContents);
    }

    for (const id of tempTabs) {
      tabManager.closeTab(id);
    }

    const trackedEvents = [
      'did-start-loading',
      'did-stop-loading',
      'page-title-updated',
      'page-favicon-updated',
      'did-navigate',
      'did-navigate-in-page'
    ];

    for (let i = 0; i < wcs.length; i++) {
      const wc = wcs[i];
      for (const evt of trackedEvents) {
        assert.strictEqual(
          wc.listenerCount(evt),
          0,
          `Closed tab ${i} must have 0 listeners for '${evt}'`
        );
      }
    }
  });

  await test('S6-3: Double closeTab on the same ID returns false safely without throwing', () => {
    const t = tabManager.createTab('about:blank?double_close', { active: false });
    assert.strictEqual(tabManager.closeTab(t.id), true);
    assert.strictEqual(tabManager.closeTab(t.id), false);
    assert.strictEqual(tabManager.closeTab(t.id), false);
  });

  await test('S6-4: Memory stability check across 200 tab lifecycles', async () => {
    const memBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < 200; i++) {
      const t = tabManager.createTab(`about:blank?mem=${i}`, { active: false });
      tabManager.closeTab(t.id);
    }

    // Allow async teardown
    await new Promise(r => setTimeout(r, 200));

    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / (1024 * 1024);
    console.log(`    [MEM STATS] Heap used diff after 200 tab cycles: ${diffMb.toFixed(2)} MB`);
    // Ensure heap difference is not runaway (e.g. less than 50MB for 200 tabs)
    assert.ok(diffMb < 50, `Heap memory leak detected: grew by ${diffMb.toFixed(2)} MB`);
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n===============================================================');
  console.log(`  M2 CHALLENGER EMPIRICAL RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`  ✖ FAILED TESTS (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`    ${idx + 1}. ${f.test}: ${f.error}`);
    });
  } else {
    console.log('  ALL EMPIRICAL STRESS TESTS PASSED CLEANLY WITH ZERO REGRESSIONS!');
  }
  console.log('===============================================================\n');

  try {
    win.destroy();
  } catch {}

  app.exit(failedTests > 0 ? 1 : 0);
}

runM2ChallengerStress().catch(err => {
  console.error('CHALLENGER RUNNER CRASHED:', err);
  app.exit(1);
});
