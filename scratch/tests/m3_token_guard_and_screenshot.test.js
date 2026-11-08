import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import ts from 'typescript';

// =============================================================================
// Transpile and load production `src/main/pageContextExtractor.ts`
// =============================================================================

function loadPageContextExtractor(mockOverrides = {}) {
  const filePath = path.resolve(process.cwd(), 'src/main/pageContextExtractor.ts');
  const src = fs.readFileSync(filePath, 'utf8');
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
      if (mockOverrides[m]) {
        return mockOverrides[m];
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
  return mod.exports;
}

// 1x1 minimal valid JPEG buffer fixture
const VALID_JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0xBF, 0x80, 0xFF, 0xD9
]);

class MockNativeImage {
  constructor(empty = false, buffer = VALID_JPEG_BUFFER) {
    this._empty = empty;
    this._buffer = buffer;
  }
  isEmpty() {
    return this._empty;
  }
  toJPEG(quality) {
    return this._empty ? Buffer.alloc(0) : this._buffer;
  }
}

class MockWebContents extends EventEmitter {
  constructor(options = {}) {
    super();
    this._destroyed = options.destroyed ?? false;
    this._crashed = options.crashed ?? false;
    this._captureDelay = options.captureDelay ?? 0;
    this._captureThrows = options.captureThrows ?? false;
    this._emptyImage = options.emptyImage ?? false;
    this.title = options.title ?? 'Test Page';
    this.url = options.url ?? 'https://example.com';
    this.domContent = options.domContent ?? {
      title: 'Test Page',
      canonicalUrl: 'https://example.com',
      metaDescription: 'Description',
      selectedText: '',
      readableText: 'Extracted readable text'
    };
  }

  isDestroyed() {
    return this._destroyed;
  }

  destroy() {
    this._destroyed = true;
  }

  getTitle() {
    return this.title;
  }

  getURL() {
    return this.url;
  }

  async capturePage() {
    if (this._captureThrows) {
      throw new Error('Native capturePage GPU device lost');
    }
    if (this._captureDelay > 0) {
      await new Promise(r => setTimeout(r, this._captureDelay));
    }
    return new MockNativeImage(this._emptyImage);
  }

  async executeJavaScript() {
    return this.domContent;
  }
}

function createMockTabManager(options = {}) {
  const wc = new MockWebContents(options);
  const view = {
    webContents: wc,
    getBounds: () => options.bounds ?? { x: 240, y: 44, width: 1040, height: 756 }
  };

  const activeTab = options.noActiveTab ? null : {
    id: 'tab-1',
    state: {
      id: 'tab-1',
      url: options.url ?? 'https://example.com',
      title: options.title ?? 'Test Page',
      isCrashed: options.crashed ?? false,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isMuted: false,
      isPinned: false,
      createdAt: Date.now()
    },
    view
  };

  return {
    getActiveTab: () => activeTab,
    _activeTab: activeTab,
    _wc: wc,
    _view: view
  };
}

describe('Milestone 3 Empirical Verification: Challenger 1 Harness', () => {

  const extractor = loadPageContextExtractor();
  const { enforceTokenGuard, TRUNCATE_NOTICE, captureActivePageScreenshot, extractActivePageContext } = extractor;

  // ===========================================================================
  // SECTION 1: Token Guard Character Clamping
  // ===========================================================================
  describe('1. Token Guard Character Clamping Stress', () => {

    it('1.1: String of length 0 returns empty string (length 0, no truncation notice)', () => {
      const input = '';
      const output = enforceTokenGuard(input);
      assert.strictEqual(output.length, 0);
      assert.strictEqual(output, '');
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
    });

    it('1.2: String of length 10,000 passes through completely (length 10000 <= 40000, no notice)', () => {
      const input = 'a'.repeat(10000);
      const output = enforceTokenGuard(input);
      assert.strictEqual(output.length, 10000);
      assert.ok(output.length <= 40000);
      assert.strictEqual(output, input);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
    });

    it('1.3: String of length 39,999 passes through completely (length 39999 <= 40000, no notice)', () => {
      const input = 'k'.repeat(39999);
      const output = enforceTokenGuard(input);
      assert.strictEqual(output.length, 39999);
      assert.ok(output.length <= 40000);
      assert.strictEqual(output, input);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
    });

    it('1.4: String of exact boundary length 40,000 passes through completely (length 40000 <= 40000, no notice)', () => {
      const input = 'w'.repeat(40000);
      const output = enforceTokenGuard(input);
      assert.strictEqual(output.length, 40000);
      assert.ok(output.length <= 40000);
      assert.strictEqual(output, input);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
    });

    it('1.5: String of length 40,001 is clamped to <= 40,000 and truncation notice is present', () => {
      const input = 'z'.repeat(40001);
      const output = enforceTokenGuard(input);
      assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true, 'Truncation notice missing');
      assert.ok(output.endsWith(TRUNCATE_NOTICE));
    });

    it('1.6: String of length 100,000 (100k) is clamped to <= 40,000 and truncation notice is present', () => {
      const input = 'x'.repeat(100000);
      const output = enforceTokenGuard(input);
      assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true, 'Truncation notice missing');
      assert.ok(output.endsWith(TRUNCATE_NOTICE));
    });

    it('1.7: String of length 500,000 (500k) is clamped to <= 40,000 and truncation notice is present', () => {
      const input = 'The quick brown fox jumps over the lazy dog. '.repeat(11200); // ~504,000 chars
      const output = enforceTokenGuard(input);
      assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true, 'Truncation notice missing');
      assert.ok(output.endsWith(TRUNCATE_NOTICE));
      // Verify clean word boundary: body before notice should end cleanly with a word
      const body = output.substring(0, output.indexOf(TRUNCATE_NOTICE));
      assert.ok(!body.endsWith(' '), 'Body should be trimmed of trailing space before notice');
      assert.ok(/[\w\.\!\?]$/.test(body), 'Body should end cleanly at a word boundary');
    });

    it('1.8: Continuous string without whitespace at 500k chars is strictly clamped to <= 40000', () => {
      const input = 'A'.repeat(500000);
      const output = enforceTokenGuard(input);
      assert.strictEqual(output.length, 40000, 'Must clamp to exactly 40000 when no spaces exist');
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
      assert.ok(output.endsWith(TRUNCATE_NOTICE));
    });

    it('1.9: Multi-byte Unicode emojis (50,000 emojis) are strictly clamped <= 40000', () => {
      const input = '🚀✨🔥'.repeat(20000); // 120,000 characters
      const output = enforceTokenGuard(input);
      assert.ok(output.length <= 40000, `Output length ${output.length} exceeds 40000`);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
    });

    it('1.10: String with newlines and paragraphs cleanly preserves structure before truncation', () => {
      const paragraphs = Array.from({ length: 1500 }, (_, i) => `Paragraph ${i}: Detailed browser analysis.\n\n`).join('');
      assert.ok(paragraphs.length > 40000, `Input length ${paragraphs.length} must exceed 40000`);
      const output = enforceTokenGuard(paragraphs);
      assert.ok(output.length <= 40000);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), true);
      assert.ok(output.includes('Paragraph 0:'));
    });

    it('1.11: Custom maxChars parameter (e.g. 100, 200, 500) respects custom limits', () => {
      const input = 'WarWick browser testing token guard custom limits. '.repeat(20);
      const out100 = enforceTokenGuard(input, 100);
      assert.ok(out100.length <= 100, `Length ${out100.length} exceeds 100`);
      assert.strictEqual(out100.includes(TRUNCATE_NOTICE), true);

      const out200 = enforceTokenGuard(input, 200);
      assert.ok(out200.length <= 200, `Length ${out200.length} exceeds 200`);
      assert.strictEqual(out200.includes(TRUNCATE_NOTICE), true);
    });

    it('1.12: appendNotice = false truncates cleanly without appending notice', () => {
      const input = 'a'.repeat(60000);
      const output = enforceTokenGuard(input, 40000, false);
      assert.strictEqual(output.length, 40000);
      assert.strictEqual(output.includes(TRUNCATE_NOTICE), false);
    });

    it('1.13: Falsy inputs (null, undefined, false) safely return empty string without error', () => {
      assert.strictEqual(enforceTokenGuard(null), '');
      assert.strictEqual(enforceTokenGuard(undefined), '');
      assert.strictEqual(enforceTokenGuard(''), '');
    });
  });

  // ===========================================================================
  // SECTION 2: Screenshot Capture Resilience & Format
  // ===========================================================================
  describe('2. Screenshot Capture Resilience & Format Verification', () => {

    it('2.1: Valid WebContents produces valid base64 JPEG data URL format with magic bytes', async () => {
      const tm = createMockTabManager();
      const result = await captureActivePageScreenshot(tm, 80);

      assert.ok(result, 'Screenshot should be returned');
      assert.ok(result.startsWith('data:image/jpeg;base64,'), 'Must start with data:image/jpeg;base64,');

      // Verify payload decodes cleanly to valid JPEG
      const base64Data = result.replace('data:image/jpeg;base64,', '');
      const buffer = Buffer.from(base64Data, 'base64');
      assert.ok(buffer.length > 0, 'Decoded buffer must not be empty');

      // JPEG magic bytes: 0xFF, 0xD8, 0xFF
      assert.strictEqual(buffer[0], 0xFF, 'First magic byte must be 0xFF');
      assert.strictEqual(buffer[1], 0xD8, 'Second magic byte must be 0xD8');
      assert.strictEqual(buffer[2], 0xFF, 'Third magic byte must be 0xFF');
    });

    it('2.2: Destroyed WebContents returns undefined gracefully without throwing', async () => {
      const tm = createMockTabManager({ destroyed: true });
      const result = await captureActivePageScreenshot(tm);
      assert.strictEqual(result, undefined, 'Must return undefined for destroyed WebContents');

      // Verify extractActivePageContext handles destroyed tab gracefully
      const context = await extractActivePageContext(tm, { includeScreenshot: true });
      assert.strictEqual(context.screenshotBase64, undefined);
      assert.strictEqual(context.readableText, '[Tab WebContents destroyed]');
    });

    it('2.2b: WebContentsView with detached/undefined webContents returns undefined gracefully', async () => {
      const tmDetached = {
        getActiveTab: () => ({
          state: { id: 'tab-detached', url: 'https://example.com', title: 'Detached', isCrashed: false },
          view: { webContents: undefined, getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }) }
        })
      };
      const result = await captureActivePageScreenshot(tmDetached);
      assert.strictEqual(result, undefined, 'Must return undefined when webContents is undefined');

      const context = await extractActivePageContext(tmDetached, { includeScreenshot: true });
      assert.strictEqual(context.screenshotBase64, undefined);
      assert.strictEqual(context.readableText, '[Tab WebContents destroyed]');
    });

    it('2.3: Crashed tab (isCrashed = true) returns undefined gracefully without throwing', async () => {
      const tm = createMockTabManager({ crashed: true });
      const result = await captureActivePageScreenshot(tm);
      assert.strictEqual(result, undefined, 'Must return undefined for crashed tab');

      // Verify extractActivePageContext handles crashed tab gracefully
      const context = await extractActivePageContext(tm, { includeScreenshot: true });
      assert.strictEqual(context.screenshotBase64, undefined);
      assert.strictEqual(context.readableText, '[Tab crashed - render process gone]');
    });

    it('2.4: Empty tabs (about:blank or zero dimensions) return undefined or clean empty context', async () => {
      // Zero width / height bounds
      const tmZeroBounds = createMockTabManager({ bounds: { x: 0, y: 0, width: 0, height: 0 } });
      const resultZero = await captureActivePageScreenshot(tmZeroBounds);
      assert.strictEqual(resultZero, undefined, 'Must return undefined when bounds width/height <= 0');

      // Negative bounds
      const tmNegBounds = createMockTabManager({ bounds: { x: 0, y: 0, width: -10, height: 100 } });
      const resultNeg = await captureActivePageScreenshot(tmNegBounds);
      assert.strictEqual(resultNeg, undefined, 'Must return undefined when bounds width <= 0');

      // Empty nativeImage
      const tmEmptyImg = createMockTabManager({ emptyImage: true });
      const resultEmptyImg = await captureActivePageScreenshot(tmEmptyImg);
      assert.strictEqual(resultEmptyImg, undefined, 'Must return undefined when image.isEmpty() is true');

      // about:blank URL
      const tmBlank = createMockTabManager({ url: 'about:blank', title: 'New Tab' });
      const context = await extractActivePageContext(tmBlank, { includeScreenshot: false });
      assert.strictEqual(context.url, 'about:blank');
      assert.strictEqual(context.readableText, '');
      assert.strictEqual(context.screenshotBase64, undefined);
    });

    it('2.5: No active tab (0 tabs) returns undefined for screenshot and throws descriptive error for context', async () => {
      const tmNoTab = createMockTabManager({ noActiveTab: true });
      const screenshot = await captureActivePageScreenshot(tmNoTab);
      assert.strictEqual(screenshot, undefined);

      await assert.rejects(
        async () => await extractActivePageContext(tmNoTab),
        /No active tab to capture/
      );
    });

    it('2.6: GPU capture failure / throw handled gracefully without crashing process', async () => {
      const tmFailing = createMockTabManager({ captureThrows: true });
      const result = await captureActivePageScreenshot(tmFailing);
      assert.strictEqual(result, undefined, 'Must catch error and return undefined');
    });

    it('2.7: Quality parameter clamping handles negative, excessive, and decimal qualities', async () => {
      const tm = createMockTabManager();

      // Negative quality -> clamped to 1
      const qNeg = await captureActivePageScreenshot(tm, -50);
      assert.ok(qNeg && qNeg.startsWith('data:image/jpeg;base64,'));

      // Quality > 100 -> clamped to 100
      const qOver = await captureActivePageScreenshot(tm, 250);
      assert.ok(qOver && qOver.startsWith('data:image/jpeg;base64,'));

      // Float quality -> rounded
      const qFloat = await captureActivePageScreenshot(tm, 85.6);
      assert.ok(qFloat && qFloat.startsWith('data:image/jpeg;base64,'));
    });

    it('2.8: captureActivePageScreenshot respects 3-second timeout guard on hung capturePage', async () => {
      // Simulate capturePage that hangs for 4000ms
      const tmHung = createMockTabManager({ captureDelay: 4000 });
      const start = Date.now();
      const result = await captureActivePageScreenshot(tmHung);
      const elapsed = Date.now() - start;

      assert.strictEqual(result, undefined, 'Must return undefined on timeout');
      assert.ok(elapsed >= 2900 && elapsed < 3500, `Timeout should trigger around 3000ms, took ${elapsed}ms`);
    });
  });

  // ===========================================================================
  // SECTION 3: In-Page Context Extractor Integration
  // ===========================================================================
  describe('3. In-Page Context Extractor Full Pipeline Integration', () => {

    it('3.1: extractActivePageContext returns complete PageContext with clamped text and screenshot', async () => {
      const tm = createMockTabManager({
        url: 'https://docs.anthropic.com/en/prompt-engineering',
        title: 'Prompt Engineering Guide',
        domContent: {
          title: 'Prompt Engineering Guide - Anthropic',
          canonicalUrl: 'https://docs.anthropic.com/en/prompt-engineering',
          metaDescription: 'Official prompt engineering guide',
          selectedText: 'Be clear, direct, and detailed.',
          readableText: 'Massive guide text... '.repeat(3000) // ~69,000 chars
        }
      });

      const context = await extractActivePageContext(tm, { includeScreenshot: true });

      assert.strictEqual(context.url, 'https://docs.anthropic.com/en/prompt-engineering');
      assert.strictEqual(context.title, 'Prompt Engineering Guide - Anthropic');
      assert.strictEqual(context.selectedText, 'Be clear, direct, and detailed.');
      assert.strictEqual(context.metaDescription, 'Official prompt engineering guide');
      assert.ok(context.readableText.length <= 40000, `readableText length ${context.readableText.length} > 40000`);
      assert.strictEqual(context.readableText.includes(TRUNCATE_NOTICE), true);
      assert.ok(context.screenshotBase64 && context.screenshotBase64.startsWith('data:image/jpeg;base64,'));
    });

    it('3.2: extractActivePageContext falls back when executeJavaScript throws', async () => {
      const tm = createMockTabManager({
        url: 'https://secure-bank.com',
        title: 'Secure Portal'
      });
      // Override executeJavaScript to throw (e.g. CSP or context restriction)
      tm._wc.executeJavaScript = async () => {
        throw new Error('Blocked by Content Security Policy');
      };

      const context = await extractActivePageContext(tm, { includeScreenshot: false });
      assert.strictEqual(context.url, 'https://secure-bank.com');
      assert.strictEqual(context.title, 'Secure Portal');
      assert.strictEqual(context.readableText, '');
      assert.strictEqual(context.screenshotBase64, undefined);
    });
  });

});
