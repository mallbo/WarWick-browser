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

async function runM3ChallengerStress() {
  console.log('\n===============================================================');
  console.log('  WARWICK M3 VERIFICATION CHALLENGER 1 EMPIRICAL STRESS HARNESS');
  console.log('===============================================================\n');

  // =========================================================================
  // SUITE 1: Token Guard Character Clamping
  // =========================================================================
  console.log('--- SUITE 1: Token Guard Character Clamping ---');

  await test('S1-1: String of length 0 returns empty string <= 40,000 without notice', () => {
    const input = '';
    const output = enforceTokenGuard(input);
    assert.strictEqual(output.length, 0);
    assert.strictEqual(output, '');
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
  });

  await test('S1-2: String of length 10,000 passes through intact <= 40,000 without notice', () => {
    const input = 'A'.repeat(10000);
    const output = enforceTokenGuard(input);
    assert.strictEqual(output.length, 10000);
    assert.strictEqual(output, input);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
  });

  await test('S1-3: String of length 39,999 passes through intact <= 40,000 without notice', () => {
    const input = 'B'.repeat(39999);
    const output = enforceTokenGuard(input);
    assert.strictEqual(output.length, 39999);
    assert.strictEqual(output, input);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
  });

  await test('S1-4: String of exact boundary length 40,000 passes through intact <= 40,000 without notice', () => {
    const input = 'C'.repeat(40000);
    const output = enforceTokenGuard(input);
    assert.strictEqual(output.length, 40000);
    assert.strictEqual(output, input);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
  });

  await test('S1-5: String of length 40,001 is clamped to <= 40,000 and truncation notice is present', () => {
    const input = 'D'.repeat(40001);
    const output = enforceTokenGuard(input);
    assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
    assert.ok(output.endsWith(TRUNCATE_NOTICE));
  });

  await test('S1-6: String of length 100,000 is clamped to <= 40,000 and truncation notice is present', () => {
    const input = 'E'.repeat(100000);
    const output = enforceTokenGuard(input);
    assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
    assert.ok(output.endsWith(TRUNCATE_NOTICE));
  });

  await test('S1-7: String of length 500,000 is clamped to <= 40,000 and truncation notice is present', () => {
    const input = 'WarWick desktop browser integrating Antigravity AI engine. '.repeat(10000); // 590,000 chars
    const output = enforceTokenGuard(input);
    assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
    assert.ok(output.endsWith(TRUNCATE_NOTICE));
    const content = output.substring(0, output.indexOf(TRUNCATE_NOTICE));
    assert.ok(/[\w\.\!\?]$/.test(content), 'Content should end cleanly at a word boundary');
  });

  await test('S1-8: Continuous string without whitespace at 500,000 chars strictly clamped <= 40000', () => {
    const input = 'F'.repeat(500000);
    const output = enforceTokenGuard(input);
    assert.strictEqual(output.length, 40000);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
  });

  await test('S1-9: String of length 1,000,000 (1M chars) strictly clamped <= 40,000', () => {
    const input = 'Z'.repeat(1000000);
    const output = enforceTokenGuard(input);
    assert.ok(output.length <= 40000);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
  });

  await test('S1-10: Multi-byte Unicode / Emoji string strictly clamped <= 40,000', () => {
    const input = '🧠✨🚀🔥'.repeat(25000); // 200,000 characters
    const output = enforceTokenGuard(input);
    assert.ok(output.length <= 40000);
    assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
  });

  // =========================================================================
  // SUITE 2: Native Electron Screenshot Capture & Resilience
  // =========================================================================
  console.log('\n--- SUITE 2: Native Electron Screenshot Capture & Resilience ---');

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
    tabItem.view.webContents.capturePage = async () => {
      // Create a 100x100 32-bit RGBA bitmap
      const bitmap = Buffer.alloc(100 * 100 * 4, 0x7F);
      return nativeImage.createFromBitmap(bitmap, { width: 100, height: 100 });
    };
  };

  await test('S2-1: Valid WebContents produces valid JPEG base64 data URL via native Chromium encoder', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem, 'Tab item must exist');
    attachNativeRasterizer(tabItem);

    const screenshot = await captureActivePageScreenshot(tabManager, 80);
    assert.ok(screenshot, 'Screenshot must not be undefined');
    assert.ok(screenshot.startsWith('data:image/jpeg;base64,'), 'Must start with data:image/jpeg;base64,');

    const base64Data = screenshot.replace('data:image/jpeg;base64,', '');
    const buffer = Buffer.from(base64Data, 'base64');
    assert.ok(buffer.length > 50, 'JPEG buffer should have substantive byte size');

    // Verify JPEG magic bytes: FF D8 FF
    assert.strictEqual(buffer[0], 0xFF, 'Byte 0 must be 0xFF');
    assert.strictEqual(buffer[1], 0xD8, 'Byte 1 must be 0xD8');
    assert.strictEqual(buffer[2], 0xFF, 'Byte 2 must be 0xFF');
  });

  await test('S2-2: Destroyed WebContents returns undefined gracefully without throwing', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);

    // Destroy the tab's webContents and await destruction
    const wc = tabItem.view.webContents;
    wc.close();
    const start = Date.now();
    while (!wc.isDestroyed() && Date.now() - start < 500) {
      await new Promise(r => setTimeout(r, 15));
    }
    assert.strictEqual(wc.isDestroyed(), true);

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined);

    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    assert.strictEqual(context.screenshotBase64, undefined);
    assert.strictEqual(context.readableText, '[Tab WebContents destroyed]');

    // Clean up closed tab from tabManager so subsequent tests don't inherit closed active tab
    tabManager.closeTab(tabState.id);
  });

  await test('S2-3: Crashed tab (isCrashed = true) returns undefined gracefully', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    tabItem.state.isCrashed = true;

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined);

    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    assert.strictEqual(context.screenshotBase64, undefined);
    assert.strictEqual(context.readableText, '[Tab crashed - render process gone]');
  });

  await test('S2-4: Empty tab (about:blank) context extraction', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const context = await extractActivePageContext(tabManager, { includeScreenshot: false });
    assert.strictEqual(context.url, 'about:blank');
    assert.strictEqual(context.readableText, '');
    assert.strictEqual(context.screenshotBase64, undefined);
  });

  await test('S2-5: Zero-dimension view bounds return undefined gracefully', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    attachNativeRasterizer(tabItem);

    // Set bounds to 0x0
    tabItem.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined, 'Must return undefined for 0-dimension bounds');

    // Restore normal bounds
    tabItem.view.setBounds({ x: 240, y: 44, width: 1040, height: 756 });
  });

  await test('S2-6: Quality parameter clamping handles negative, excessive, and float values', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    attachNativeRasterizer(tabItem);

    // Negative quality -> clamped to 1
    const qNeg = await captureActivePageScreenshot(tabManager, -25);
    assert.ok(qNeg && qNeg.startsWith('data:image/jpeg;base64,'));

    // Excessive quality -> clamped to 100
    const qOver = await captureActivePageScreenshot(tabManager, 300);
    assert.ok(qOver && qOver.startsWith('data:image/jpeg;base64,'));

    // Float quality -> clamped and rounded
    const qFloat = await captureActivePageScreenshot(tabManager, 88.4);
    assert.ok(qFloat && qFloat.startsWith('data:image/jpeg;base64,'));
  });

  await test('S2-7: Rapid burst of 10 concurrent screenshot captures without deadlock or crash', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    attachNativeRasterizer(tabItem);

    const promises = Array.from({ length: 10 }, () => captureActivePageScreenshot(tabManager, 75));
    const results = await Promise.all(promises);

    assert.strictEqual(results.length, 10);
    results.forEach((res, i) => {
      assert.ok(res && res.startsWith('data:image/jpeg;base64,'), `Result ${i} failed`);
    });
  });

  await test('S2-8: Empty nativeImage returns undefined gracefully', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    tabItem.view.webContents.capturePage = async () => nativeImage.createEmpty();

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined, 'Must return undefined when image.isEmpty() is true');
  });

  await test('S2-9: capturePage throwing an error is caught and returns undefined', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    tabItem.view.webContents.capturePage = async () => {
      throw new Error('GPU context lost');
    };

    const screenshot = await captureActivePageScreenshot(tabManager);
    assert.strictEqual(screenshot, undefined, 'Must handle thrown GPU error gracefully');
  });

  await test('S2-10: capturePage timeout guard triggers and returns undefined when hanging', async () => {
    const tabState = tabManager.createTab('about:blank', { active: true });
    const tabItem = tabManager.getTab(tabState.id)!;
    assert.ok(tabItem);
    tabItem.view.webContents.capturePage = async () => {
      return new Promise<any>((resolve) => {
        setTimeout(() => resolve(nativeImage.createEmpty()), 4000);
      });
    };

    const start = Date.now();
    const screenshot = await captureActivePageScreenshot(tabManager);
    const elapsed = Date.now() - start;

    assert.strictEqual(screenshot, undefined, 'Must return undefined on timeout');
    assert.ok(elapsed >= 2900 && elapsed < 3500, `Timeout guard should fire at ~3000ms, elapsed ${elapsed}ms`);
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n===============================================================');
  console.log(`  M3 CHALLENGER EMPIRICAL RESULTS: ${passedTests}/${totalTests} PASSED`);
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

runM3ChallengerStress().catch(err => {
  console.error('M3 CHALLENGER RUNNER CRASHED:', err);
  app.exit(1);
});
