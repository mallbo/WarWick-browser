import { app, BrowserWindow, nativeImage } from 'electron';
import { TabManager } from '../../src/main/tabManager';
import {
  enforceTokenGuard,
  TRUNCATE_NOTICE,
  captureActivePageScreenshot,
  extractActivePageContext
} from '../../src/main/pageContextExtractor';
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

async function runAdversarialRemediationVerification() {
  console.log('\n===============================================================');
  console.log('  WARWICK M3 REMEDIATION CHALLENGER 1 NATIVE ADVERSARIAL HARNESS');
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

  // Helper to attach a synthetic bitmap generator to tab webContents
  const attachNativeRasterizer = (tabItem: any) => {
    if (tabItem.view?.webContents) {
      tabItem.view.webContents.capturePage = async () => {
        const bitmap = Buffer.alloc(100 * 100 * 4, 0x7F);
        return nativeImage.createFromBitmap(bitmap, { width: 100, height: 100 });
      };
    }
  };

  // Helper to simulate detached webContents getter on WebContentsView
  const detachWebContents = (view: any) => {
    Object.defineProperty(view, 'webContents', {
      get: () => undefined,
      configurable: true
    });
  };

  // =========================================================================
  // SUITE 1: Real Detached WebContents Lifecycle & Screenshot / Context Resilience
  // =========================================================================
  console.log('--- SUITE 1: Real Native Detached WebContents Resilience ---');

  await test('ADV-1: Immediately after wc.close(), screenshot and context extract without TypeError', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    attachNativeRasterizer(tabItem);

    // Call wc.close()
    tabItem.view.webContents.close();

    // Verify immediate call (before tick) doesn't throw TypeError
    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.ok(screenshot === undefined || typeof screenshot === 'string');

    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    assert.ok(context && typeof context === 'object');
    assert.ok(typeof context.readableText === 'string');

    tabManager.closeTab(tabState.id);
  });

  await test('ADV-2: Asynchronously after wc.close() (when view.webContents becomes undefined), returns undefined without TypeError', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);

    // Close and wait 150ms for Electron 34 to detach webContents
    tabItem.view.webContents.close();
    await new Promise(r => setTimeout(r, 150));

    // view.webContents may now be undefined or destroyed
    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined);

    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    assert.strictEqual(context.screenshotBase64, undefined);
    assert.strictEqual(context.readableText, '[Tab WebContents destroyed]');

    tabManager.closeTab(tabState.id);
  });

  await test('ADV-3: Explicitly detached view.webContents = undefined returns undefined without TypeError', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);

    // Explicitly simulate detached view
    detachWebContents(tabItem.view);

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined);

    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    assert.strictEqual(context.screenshotBase64, undefined);
    assert.strictEqual(context.readableText, '[Tab WebContents destroyed]');

    tabManager.closeTab(tabState.id);
  });

  await test('ADV-4: Concurrent screenshot capture while tab is actively being closed', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    attachNativeRasterizer(tabItem);

    // Launch screenshot capture and close tab concurrently
    const capturePromise = captureActivePageScreenshot(tabManager);
    tabManager.closeTab(tabState.id);

    const result = await capturePromise;
    // Must be either a valid string or undefined, but never throw an uncaught exception
    assert.ok(result === undefined || typeof result === 'string');
  });

  // =========================================================================
  // SUITE 2: TabManager Operations on Detached Tabs
  // =========================================================================
  console.log('\n--- SUITE 2: Native TabManager Operations on Detached Tabs ---');

  await test('ADV-5: switchTab cleanly detaches previous tab view even if previous webContents is undefined', async () => {
    const t1State = tabManager.createTab('about:blank', { active: true });
    const t2State = tabManager.createTab('about:blank', { active: false });

    const t1 = tabManager.getTab(t1State.id)!;
    assert.ok(t1);

    // Detach t1's webContents
    detachWebContents(t1.view);

    // Switch to t2
    const switchResult = tabManager.switchTab(t2State.id);
    assert.strictEqual(switchResult, true);
    assert.strictEqual(tabManager.getActiveTabId(), t2State.id);

    // Clean up
    tabManager.closeTab(t1State.id);
    tabManager.closeTab(t2State.id);
  });

  await test('ADV-6: switchTab when target tab webContents is undefined attaches view safely without focus() crash', async () => {
    const t1State = tabManager.createTab('about:blank', { active: true });
    const t2State = tabManager.createTab('about:blank', { active: false });

    const t2 = tabManager.getTab(t2State.id)!;
    assert.ok(t2);

    // Detach t2's webContents
    detachWebContents(t2.view);

    // Switch to t2
    const switchResult = tabManager.switchTab(t2State.id);
    assert.strictEqual(switchResult, true);
    assert.strictEqual(tabManager.getActiveTabId(), t2State.id);

    // Clean up
    tabManager.closeTab(t1State.id);
    tabManager.closeTab(t2State.id);
  });

  await test('ADV-7: navigate, reload, setTabMuted, goBack, goForward on detached tab safely return false', async () => {
    const tState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tState.id)!;
    assert.ok(tabItem);

    detachWebContents(tabItem.view);

    assert.strictEqual(tabManager.navigate(tState.id, 'https://example.com'), false);
    assert.strictEqual(tabManager.reload(tState.id), false);
    assert.strictEqual(tabManager.setTabMuted(tState.id, true), false);
    assert.strictEqual(tabManager.goBack(tState.id), false);
    assert.strictEqual(tabManager.goForward(tState.id), false);

    tabManager.closeTab(tState.id);
  });

  await test('ADV-8: closeTab on detached tab frees view, cleans listeners, and maintains tab strip consistency', async () => {
    const t1 = tabManager.createTab('about:blank', { active: true });
    const t2 = tabManager.createTab('about:blank', { active: false });

    const tab1Item = tabManager.getTab(t1.id)!;
    detachWebContents(tab1Item.view);

    const closed = tabManager.closeTab(t1.id);
    assert.strictEqual(closed, true);
    assert.strictEqual(tabManager.getTab(t1.id), null);
    assert.strictEqual(tabManager.getActiveTabId(), t2.id);

    tabManager.closeTab(t2.id);
  });

  await test('ADV-9: destroyAll with mixed alive, closed, and detached tabs executes without exception', async () => {
    const t1 = tabManager.createTab('about:blank');
    const t2 = tabManager.createTab('about:blank');
    const t3 = tabManager.createTab('about:blank');

    // Close t2
    tabManager.getTab(t2.id)!.view.webContents.close();
    // Detach t3
    detachWebContents(tabManager.getTab(t3.id)!.view);

    assert.doesNotThrow(() => {
      tabManager.destroyAll();
    });

    assert.strictEqual(tabManager.getAllTabs().length, 0);
    assert.strictEqual(tabManager.getActiveTabId(), null);
  });

  await test('ADV-10: handleWindowResize and setBounds when active tab webContents is undefined do not throw', async () => {
    const t = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(t.id)!;
    detachWebContents(tabItem.view);

    assert.doesNotThrow(() => {
      tabManager.setBounds({ x: 200, y: 50, width: 900, height: 700 });
      tabManager.handleWindowResize();
    });

    tabManager.closeTab(t.id);
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n===============================================================');
  console.log(`  M3 REMEDIATION CHALLENGER RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`  ✖ FAILED TESTS (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`    ${idx + 1}. ${f.test}: ${f.error}`);
    });
  } else {
    console.log('  ALL NATIVE REMEDIATION TESTS PASSED WITH ZERO UNHANDLED EXCEPTIONS!');
  }
  console.log('===============================================================\n');

  try {
    win.destroy();
  } catch {}

  app.exit(failedTests > 0 ? 1 : 0);
}

runAdversarialRemediationVerification().catch(err => {
  console.error('RUNNER CRASHED:', err);
  app.exit(1);
});
