import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';
import ts from 'typescript';

// Read original pageContextExtractor.ts
const originalPath = path.resolve(process.cwd(), 'src/main/pageContextExtractor.ts');
let src = fs.readFileSync(originalPath, 'utf8');

// Apply Fix 1: captureActivePageScreenshot null check + timer cleanup
const targetBlock1 = `  const activeTab = tabManager.getActiveTab();
  if (!activeTab || activeTab.view.webContents.isDestroyed()) {
    return undefined;
  }`;

const replacementBlock1 = `  const activeTab = tabManager.getActiveTab();
  if (!activeTab || !activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {
    return undefined;
  }`;

const targetBlockTimer = `    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('capturePage timeout')), 3000)
    );

    const image = await Promise.race([
      wc.capturePage(),
      timeoutPromise
    ]);`;

const replacementBlockTimer = `    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('capturePage timeout')), 3000);
    });

    let image;
    try {
      image = await Promise.race([
        wc.capturePage(),
        timeoutPromise
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }`;

// Apply Fix 2: extractActivePageContext null check
const targetBlock2 = `  if (activeTab.view.webContents.isDestroyed()) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: '',
      readableText: '[Tab WebContents destroyed]',
      metaDescription: '',
      screenshotBase64: undefined
    };
  }`;

const replacementBlock2 = `  if (!activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: '',
      readableText: '[Tab WebContents destroyed]',
      metaDescription: '',
      screenshotBase64: undefined
    };
  }`;

assert(src.includes(targetBlock1), 'targetBlock1 must exist in source');
assert(src.includes(targetBlockTimer), 'targetBlockTimer must exist in source');
assert(src.includes(targetBlock2), 'targetBlock2 must exist in source');

src = src.replace(targetBlock1, replacementBlock1);
src = src.replace(targetBlockTimer, replacementBlockTimer);
src = src.replace(targetBlock2, replacementBlock2);

console.log('Successfully patched source in-memory. Compiling with TypeScript...');

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText;

const mod = { exports: {} };
const ctx = vm.createContext({
  require: (m) => {
    if (m === '../shared/types') {
      return {
        THEME_CONSTANTS: {
          MAX_PAGE_TEXT_CHARS: 40000,
          DEFAULT_WIDTH: 1280,
          DEFAULT_HEIGHT: 800
        }
      };
    }
    return {};
  },
  module: mod,
  exports: mod.exports,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Buffer,
  Math
});

vm.runInContext(js, ctx);
const { captureActivePageScreenshot, extractActivePageContext, enforceTokenGuard } = mod.exports;

console.log('Testing 2.2b with detached/undefined webContents...');

async function testDetached() {
  const tmDetached = {
    getActiveTab: () => ({
      state: { id: 'tab-detached', url: 'https://example.com', title: 'Detached', isCrashed: false },
      view: { webContents: undefined, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }) }
    })
  };

  const res1 = await captureActivePageScreenshot(tmDetached);
  assert.strictEqual(res1, undefined, 'captureActivePageScreenshot must return undefined');

  const res2 = await extractActivePageContext(tmDetached, { includeScreenshot: true });
  assert.strictEqual(res2.screenshotBase64, undefined);
  assert.strictEqual(res2.readableText, '[Tab WebContents destroyed]');

  console.log('✅ Test 2.2b passed successfully!');
}

async function testTimerCleanup() {
  console.log('Testing timer cleanup on immediate capturePage...');
  let timerCleared = false;
  const originalClearTimeout = clearTimeout;
  // Track clearTimeout calls
  let clearCount = 0;
  const mockClearTimeout = (id) => {
    clearCount++;
    originalClearTimeout(id);
  };

  const mockCtx = vm.createContext({
    require: () => ({ THEME_CONSTANTS: { MAX_PAGE_TEXT_CHARS: 40000 } }),
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout: mockClearTimeout,
    Promise,
    Buffer,
    Math
  });

  vm.runInContext(js, mockCtx);
  const patchedCapture = mockCtx.exports.captureActivePageScreenshot || mockCtx.module.exports.captureActivePageScreenshot;

  const tm = {
    getActiveTab: () => ({
      state: { id: 'tab-1', url: 'https://example.com', title: 'T', isCrashed: false },
      view: {
        webContents: {
          isDestroyed: () => false,
          capturePage: async () => ({
            isEmpty: () => false,
            toJPEG: () => Buffer.from([0xFF, 0xD8, 0xFF])
          })
        },
        getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 })
      }
    })
  };

  const result = await patchedCapture(tm, 80);
  assert.ok(result && result.startsWith('data:image/jpeg;base64,'));
  assert.strictEqual(clearCount, 1, 'clearTimeout should have been called exactly once!');
  console.log('✅ Timer cleanup test passed: clearTimeout called exactly once on success!');
}

async function runAll() {
  await testDetached();
  await testTimerCleanup();
  console.log('All empirical verification checks passed cleanly!');
}

runAll().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
