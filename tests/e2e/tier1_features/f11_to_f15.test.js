import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';
import { SAMPLE_HTML_WITH_NOISE, SAMPLE_HTML_MASSIVE, MOCK_JPEG_BASE64 } from '../harness/fixtures.js';

describe('Tier 1: Feature Coverage (Features 11 - 15)', () => {

  // =========================================================================
  // Feature 11: Tab State Tracking & Favicons
  // =========================================================================
  describe('Feature 11: Tab State Tracking & Favicons', () => {
    it('F11-1: Should extract hostname as fallback title for URLs', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://github.com/facebook/react');
      assert.strictEqual(tab.title, 'github.com');
      await driver.close();
    });

    it('F11-2: Should automatically extract standard favicon URL from domain', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://news.ycombinator.com/item?id=1');
      assert.strictEqual(tab.faviconUrl, 'https://news.ycombinator.com/favicon.ico');
      await driver.close();
    });

    it('F11-3: Should report isCrashed flag accurately when renderer crashes', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://crash-test.com');
      assert.strictEqual(tab.isCrashed, false);

      // Simulate renderer crash event
      const record = driver.tabs.get(tab.id);
      record.state.isCrashed = true;
      assert.strictEqual(driver.getActiveTab().isCrashed, true);
      await driver.close();
    });

    it('F11-4: Should track createdAt timestamp on tab state creation', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const before = Date.now();
      const tab = await driver.api.tabs.create('https://time-test.com');
      assert.ok(tab.createdAt >= before);
      assert.ok(tab.createdAt <= Date.now());
      await driver.close();
    });

    it('F11-5: Should track isMuted state for audio management', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://youtube.com');
      assert.strictEqual(tab.isMuted, false);
      const record = driver.tabs.get(tab.id);
      record.state.isMuted = true;
      assert.strictEqual(driver.getActiveTab().isMuted, true);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 12: Omnibox URL / Search Resolver
  // =========================================================================
  describe('Feature 12: Omnibox URL / Search Resolver', () => {
    it('F12-1: Should prepend https:// to bare domain names', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('wikipedia.org');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'https://wikipedia.org');
    });

    it('F12-2: Should preserve existing explicit protocol (http or https)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('http://insecure-site.com/sub');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'http://insecure-site.com/sub');
    });

    it('F12-3: Should resolve search query to Google search URL by default', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('what is quantum computing', 'google');
      assert.strictEqual(resolved.type, 'search');
      assert.strictEqual(resolved.url, 'https://www.google.com/search?q=what%20is%20quantum%20computing');
    });

    it('F12-4: Should resolve search query to DuckDuckGo when configured', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('best rust web frameworks', 'duckduckgo');
      assert.strictEqual(resolved.type, 'search');
      assert.strictEqual(resolved.url, 'https://duckduckgo.com/html/?q=best%20rust%20web%20frameworks');
    });

    it('F12-5: Should resolve localhost with port directly to https://localhost:port', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('localhost:3000');
      assert.strictEqual(resolved.type, 'url');
      assert.strictEqual(resolved.url, 'https://localhost:3000');
    });
  });

  // =========================================================================
  // Feature 13: Omnibox @ai Trigger
  // =========================================================================
  describe('Feature 13: Omnibox @ai Trigger', () => {
    it('F13-1: Should recognize @ai prefix and route to AI agent prompt', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('@ai summarize the history of computing');
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, 'summarize the history of computing');
    });

    it('F13-2: Should recognize ? prefix as natural language query to AI agent', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('? how do neural networks learn');
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, 'how do neural networks learn');
    });

    it('F13-3: Should strip whitespace after @ai trigger cleanly', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('@ai    explain quantum superposition   ');
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, 'explain quantum superposition');
    });

    it('F13-4: Should handle empty prompt after @ai gracefully', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('@ai');
      assert.strictEqual(resolved.type, 'ai');
      assert.strictEqual(resolved.prompt, '');
    });

    it('F13-5: Should not trigger @ai if @ appears in email or middle of query', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('contact support@ai.com');
      assert.strictEqual(resolved.type, 'search');
    });
  });

  // =========================================================================
  // Feature 14: Live DOM Reader (read_current_page)
  // =========================================================================
  describe('Feature 14: Live DOM Reader (read_current_page)', () => {
    it('F14-1: Should extract clean text while stripping script, style, nav, and ads', () => {
      const driver = new WarwickBrowserDriver();
      const cleaned = driver.extractReadableText(SAMPLE_HTML_WITH_NOISE);
      assert.ok(!cleaned.includes('console.log'));
      assert.ok(!cleaned.includes('body { background: black; }'));
      assert.ok(!cleaned.includes('Site Header Banner'));
      assert.ok(!cleaned.includes('Sidebar Advertisement Banner'));
      assert.ok(cleaned.includes('Deep Reinforcement Learning in Web Agents'));
    });

    it('F14-2: Should enforce strict 40,000 characters truncation limit', () => {
      const driver = new WarwickBrowserDriver();
      const cleaned = driver.extractReadableText(SAMPLE_HTML_MASSIVE);
      assert.ok(cleaned.length <= THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
      assert.strictEqual(cleaned.length, THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
    });

    it('F14-3: Should return empty string when HTML input is empty or null', () => {
      const driver = new WarwickBrowserDriver();
      assert.strictEqual(driver.extractReadableText(''), '');
      assert.strictEqual(driver.extractReadableText(null), '');
      assert.strictEqual(driver.extractReadableText(undefined), '');
    });

    it('F14-4: Should collapse multiple consecutive whitespaces into single space', () => {
      const driver = new WarwickBrowserDriver();
      const html = '<p>Line 1</p>    \n\n\t   <p>Line 2</p>';
      const cleaned = driver.extractReadableText(html);
      assert.strictEqual(cleaned, 'Line 1 Line 2');
    });

    it('F14-5: Should return active tab PageContext via api.context.captureActivePage', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://context-test.org');
      driver.setTabHtml(tab.id, SAMPLE_HTML_WITH_NOISE);

      const pageContext = await driver.api.context.captureActivePage(false);
      assert.strictEqual(pageContext.url, 'https://context-test.org');
      assert.strictEqual(pageContext.title, 'context-test.org');
      assert.ok(pageContext.readableText.includes('Deep Reinforcement Learning in Web Agents'));
      assert.strictEqual(pageContext.screenshotBase64, undefined);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 15: High-Res Screenshot Capture (take_page_screenshot)
  // =========================================================================
  describe('Feature 15: High-Res Screenshot Capture (take_page_screenshot)', () => {
    it('F15-1: Should include base64 screenshot when requested in captureActivePage', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://screenshot-test.com');
      const pageContext = await driver.api.context.captureActivePage(true);
      assert.ok(pageContext.screenshotBase64);
      assert.ok(pageContext.screenshotBase64.startsWith('data:image/jpeg;base64,'));
      await driver.close();
    });

    it('F15-2: Should omit screenshot payload when includeScreenshot is false to save bandwidth', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://screenshot-test2.com');
      const pageContext = await driver.api.context.captureActivePage(false);
      assert.strictEqual(pageContext.screenshotBase64, undefined);
      await driver.close();
    });

    it('F15-3: Should return valid mock JPEG image data URL', () => {
      assert.ok(MOCK_JPEG_BASE64.startsWith('data:image/jpeg;base64,'));
      const rawBase64 = MOCK_JPEG_BASE64.split(',')[1];
      const buffer = Buffer.from(rawBase64, 'base64');
      assert.ok(buffer.length > 0);
    });

    it('F15-4: Should throw descriptive error when capturing context with no active tab', async () => {
      const driver = new WarwickBrowserDriver();
      // Not launched -> no active tab
      await assert.rejects(
        async () => await driver.api.context.captureActivePage(),
        /No active tab to capture/
      );
    });

    it('F15-5: Should attach screenshot correctly to agent.sendPrompt payload', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      await driver.api.tabs.create('https://agent-screenshot.com');
      const pageContext = await driver.api.context.captureActivePage(true);

      const result = await driver.api.agent.sendPrompt('Analyze this layout', pageContext, true);
      assert.ok(result.runId.startsWith('run-'));
      await driver.close();
    });
  });

});
