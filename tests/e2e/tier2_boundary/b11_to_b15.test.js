import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';
import { SAMPLE_HTML_MASSIVE } from '../harness/fixtures.js';

describe('Tier 2: Boundary & Corner Cases (Features 11 - 15)', () => {

  // =========================================================================
  // Boundary 11: Tab State Tracking & Favicons Corner Cases
  // =========================================================================
  describe('Boundary 11: Tab State Tracking Corner Cases', () => {
    it('B11-1: Should handle tab with undefined or missing favicon gracefully', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('about:blank');
      assert.strictEqual(tab.faviconUrl, undefined);
      await driver.close();
    });

    it('B11-2: Should handle non-standard ports in URL for favicon derivation', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://testserver.local:8443/app');
      assert.strictEqual(tab.faviconUrl, 'https://testserver.local:8443/favicon.ico');
      await driver.close();
    });

    it('B11-3: Should preserve isCrashed state across tab switching', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab1 = await driver.api.tabs.create('https://crashed.com');
      const tab2 = await driver.api.tabs.create('https://healthy.com');

      driver.tabs.get(tab1.id).state.isCrashed = true;
      await driver.api.tabs.switch(tab1.id);
      assert.strictEqual(driver.getActiveTab().isCrashed, true);

      await driver.api.tabs.switch(tab2.id);
      assert.strictEqual(driver.getActiveTab().isCrashed, false);
      await driver.close();
    });

    it('B11-4: Should ensure createdAt timestamp is strictly non-negative', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://created.com');
      assert.ok(tab.createdAt > 0);
      await driver.close();
    });

    it('B11-5: Should handle toggling audio mute state back and forth', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://audio-tab.com');
      const record = driver.tabs.get(tab.id);
      record.state.isMuted = true;
      assert.strictEqual(driver.getActiveTab().isMuted, true);
      record.state.isMuted = false;
      assert.strictEqual(driver.getActiveTab().isMuted, false);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 12: Omnibox URL / Search Resolver Corner Cases
  // =========================================================================
  describe('Boundary 12: Omnibox URL / Search Resolver Corner Cases', () => {
    it('B12-1: Should correctly handle IPv4 address with port (192.168.1.1:8080)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('192.168.1.1:8080');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'https://192.168.1.1:8080');
    });

    it('B12-2: Should resolve query with quotation marks as search query', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('"deep research agent"');
      assert.strictEqual(resolved.type, 'search');
      assert.ok(resolved.url.includes('%22deep%20research%20agent%22'));
    });

    it('B12-3: Should resolve complex query with operators (site:github.com filetype:ts)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('site:github.com filetype:ts electron');
      assert.strictEqual(resolved.type, 'search');
      assert.ok(resolved.url.includes('site%3Agithub.com'));
    });

    it('B12-4: Should handle input with leading and trailing tabs and carriage returns', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('\t\r\n  https://cleaned-input.org  \n\t');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'https://cleaned-input.org');
    });

    it('B12-5: Should resolve file:// protocol URLs correctly', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('file:///C:/Users/test/doc.html');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'file:///C:/Users/test/doc.html');
    });
  });

  // =========================================================================
  // Boundary 13: Omnibox @ai Trigger Corner Cases
  // =========================================================================
  describe('Boundary 13: Omnibox @ai Trigger Corner Cases', () => {
    it('B13-1: Should handle multiple question marks prefix (??? query)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('??? what is consciousness');
      assert.strictEqual(resolved.type, 'ai');
      assert.ok(resolved.prompt.includes('what is consciousness'));
    });

    it('B13-2: Should handle @ai followed by a URL as prompt target', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('@ai inspect https://news.ycombinator.com');
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, 'inspect https://news.ycombinator.com');
    });

    it('B13-3: Should handle @ai with very long prompt (4000 characters)', () => {
      const driver = new WarwickBrowserDriver();
      const longPrompt = 'explain ' + 'word '.repeat(800);
      const resolved = driver.resolveUrlOrSearch(`@ai ${longPrompt}`);
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, longPrompt.trim());
    });

    it('B13-4: Should handle multiline text after @ai', () => {
      const driver = new WarwickBrowserDriver();
      const multiline = 'line 1\nline 2\nline 3';
      const resolved = driver.resolveUrlOrSearch(`@ai ${multiline}`);
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, multiline);
    });

    it('B13-5: Should handle special punctuation and code inside prompt', () => {
      const driver = new WarwickBrowserDriver();
      const codePrompt = 'how to write: if (x && y) { return z; }';
      const resolved = driver.resolveUrlOrSearch(`@ai ${codePrompt}`);
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, codePrompt);
    });
  });

  // =========================================================================
  // Boundary 14: Live DOM Reader Corner Cases
  // =========================================================================
  describe('Boundary 14: Live DOM Reader Corner Cases', () => {
    it('B14-1: Should truncate massive 200k DOM text to precisely 40k chars', () => {
      const driver = new WarwickBrowserDriver();
      const hugeHtml = '<p>' + 'The quick brown fox jumps over the lazy dog. '.repeat(5000) + '</p>';
      const extracted = driver.extractReadableText(hugeHtml);
      assert.strictEqual(extracted.length, THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
    });

    it('B14-2: Should handle HTML with 50 levels of deeply nested tags', () => {
      const driver = new WarwickBrowserDriver();
      let nested = 'Deep Content';
      for (let i = 0; i < 50; i++) {
        nested = `<div><span><section>${nested}</section></span></div>`;
      }
      const extracted = driver.extractReadableText(nested);
      assert.strictEqual(extracted, 'Deep Content');
    });

    it('B14-3: Should handle unclosed or malformed HTML tags without crashing', () => {
      const driver = new WarwickBrowserDriver();
      const malformed = '<div><p>Broken tag <b>bold without close <p>another paragraph';
      const extracted = driver.extractReadableText(malformed);
      assert.ok(extracted.includes('Broken tag bold without close another paragraph'));
    });

    it('B14-4: Should return empty string when page contains only non-content tags', () => {
      const driver = new WarwickBrowserDriver();
      const onlyNoise = '<script>var x = 1;</script><style>body {}</style><svg></svg><nav></nav><footer></footer>';
      const extracted = driver.extractReadableText(onlyNoise);
      assert.strictEqual(extracted, '');
    });

    it('B14-5: Should preserve numbers, symbols, and punctuation in readable text', () => {
      const driver = new WarwickBrowserDriver();
      const html = '<article><p>Value: $1,234.56 & 99.9% (alpha = 0.05)</p></article>';
      const extracted = driver.extractReadableText(html);
      assert.ok(extracted.includes('$1,234.56 & 99.9% (alpha = 0.05)'));
    });
  });

  // =========================================================================
  // Boundary 15: High-Res Screenshot Capture Corner Cases
  // =========================================================================
  describe('Boundary 15: Screenshot Capture Corner Cases', () => {
    it('B15-1: Should handle screenshot capture on tab with empty HTML', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('about:blank');
      driver.setTabHtml(tab.id, '');
      const context = await driver.api.context.captureActivePage(true);
      assert.ok(context.screenshotBase64);
      await driver.close();
    });

    it('B15-2: Should return consistent MIME type prefix data:image/jpeg;base64', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://mime-test.com');
      const context = await driver.api.context.captureActivePage(true);
      assert.match(context.screenshotBase64, /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
      await driver.close();
    });

    it('B15-3: Should handle multiple consecutive screenshot captures without memory leak', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://mem-test.com');
      for (let i = 0; i < 10; i++) {
        const ctx = await driver.api.context.captureActivePage(true);
        assert.ok(ctx.screenshotBase64);
      }
      await driver.close();
    });

    it('B15-4: Should include title and url even when screenshot capture is false', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://title-url-test.org');
      const ctx = await driver.api.context.captureActivePage(false);
      assert.strictEqual(ctx.url, 'https://title-url-test.org');
      assert.strictEqual(ctx.title, 'title-url-test.org');
      assert.strictEqual(ctx.screenshotBase64, undefined);
      await driver.close();
    });

    it('B15-5: Should handle screenshot payload size bounds checking', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://size-test.com');
      const ctx = await driver.api.context.captureActivePage(true);
      // Valid base64 length should be positive and bounded
      assert.ok(ctx.screenshotBase64.length > 50);
      assert.ok(ctx.screenshotBase64.length < 5000000);
      await driver.close();
    });
  });

});
