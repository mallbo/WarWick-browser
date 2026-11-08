import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';

describe('Tier 2: Boundary & Corner Cases (Features 16 - 20)', () => {

  // =========================================================================
  // Boundary 16: Antigravity Streaming Chat Corner Cases
  // =========================================================================
  describe('Boundary 16: Antigravity Streaming Chat Corner Cases', () => {
    it('B16-1: Should handle empty prompt string gracefully', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.sendPrompt('');
      assert.ok(res.runId);
      await driver.close();
    });

    it('B16-2: Should handle immediate cancellation before any chunks arrive', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let chunkCount = 0;
      driver.api.agent.onStreamChunk(() => chunkCount++);

      await driver.api.agent.sendPrompt('Cancel immediately');
      const cancelled = await driver.api.agent.cancel();
      assert.strictEqual(cancelled, true);

      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(chunkCount, 0);
      await driver.close();
    });

    it('B16-3: Should handle large prompt with 10k characters', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const largePrompt = 'Analysis: ' + 'data '.repeat(2000);
      const res = await driver.api.agent.sendPrompt(largePrompt);
      assert.ok(res.runId);
      await driver.close();
    });

    it('B16-4: Should allow consecutive prompts without crashing agent runtime', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res1 = await driver.api.agent.sendPrompt('First prompt');
      const res2 = await driver.api.agent.sendPrompt('Second prompt');
      assert.notStrictEqual(res1.runId, res2.runId);
      await driver.close();
    });

    it('B16-5: Should handle special unicode characters in prompt (emojis, math symbols)', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const chunks = [];
      driver.api.agent.onStreamChunk((c) => chunks.push(c));

      await driver.api.agent.sendPrompt('Explain ∀x ∈ ℝ: x² ≥ 0 🧠 🚀');
      await new Promise(r => setTimeout(r, 60));
      assert.ok(chunks.length > 0);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 17: Live Agent Action Stream Corner Cases
  // =========================================================================
  describe('Boundary 17: Live Agent Action Stream Corner Cases', () => {
    it('B17-1: Should clamp progressPercent to valid bounds [0, 100]', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const percentages = [];
      driver.api.agent.onActionEvent((action) => {
        if (typeof action.progressPercent === 'number') {
          percentages.push(action.progressPercent);
        }
      });

      await driver.api.agent.sendPrompt('Clamp test');
      await new Promise(r => setTimeout(r, 60));

      for (const p of percentages) {
        assert.ok(p >= 0 && p <= 100);
      }
      await driver.close();
    });

    it('B17-2: Should handle action events without any optional fields', async () => {
      const driver = new WarwickBrowserDriver();
      let received = null;
      driver.api.agent.onActionEvent((action) => {
        received = action;
      });

      driver.emitActionEvent({
        runId: 'test-minimal',
        stage: 'planning',
        message: 'Minimal action'
      });

      assert.strictEqual(received.runId, 'test-minimal');
      assert.strictEqual(received.stage, 'planning');
      assert.strictEqual(received.sources, undefined);
    });

    it('B17-3: Should handle rapid burst of 50 action events without dropped listeners', async () => {
      const driver = new WarwickBrowserDriver();
      let eventCount = 0;
      driver.api.agent.onActionEvent(() => eventCount++);

      for (let i = 0; i < 50; i++) {
        driver.emitActionEvent({
          runId: 'burst',
          stage: 'reading',
          message: `Event ${i}`,
          progressPercent: i * 2
        });
      }
      assert.strictEqual(eventCount, 50);
    });

    it('B17-4: Should report error stage with descriptive failure message', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let errorEvent = null;
      driver.api.agent.onActionEvent((a) => {
        if (a.stage === 'error') errorEvent = a;
      });

      await driver.api.agent.sendPrompt('Task to fail');
      await driver.api.agent.cancel();

      assert.ok(errorEvent);
      assert.ok(errorEvent.message.includes('cancelled'));
      await driver.close();
    });

    it('B17-5: Should handle sources array containing candidate with missing snippet', () => {
      const driver = new WarwickBrowserDriver();
      let receivedSources = null;
      driver.api.agent.onActionEvent((a) => {
        receivedSources = a.sources;
      });

      driver.emitActionEvent({
        runId: 'snippet-test',
        stage: 'searching',
        message: 'Found sources',
        sources: [{ title: 'Title only', url: 'https://no-snippet.com' }]
      });

      assert.strictEqual(receivedSources.length, 1);
      assert.strictEqual(receivedSources[0].snippet, undefined);
    });
  });

  // =========================================================================
  // Boundary 18: Quick Action Chips Corner Cases
  // =========================================================================
  describe('Boundary 18: Quick Action Chips Corner Cases', () => {
    it('B18-1: Should handle quick action chip clicked on about:blank tab', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res = await driver.api.agent.sendPrompt('Summarize active page', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('B18-2: Should handle rapid clicking on multiple quick action chips', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res1 = await driver.api.agent.sendPrompt('Summarize active page', pageContext);
      const res2 = await driver.api.agent.sendPrompt('Find key takeaways', pageContext);
      const res3 = await driver.api.agent.sendPrompt('Extract structured data', pageContext);

      assert.ok(res1.runId);
      assert.ok(res2.runId);
      assert.ok(res3.runId);
      await driver.close();
    });

    it('B18-3: Should handle quick action with screenshot when image is empty string', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      pageContext.screenshotBase64 = '';
      const res = await driver.api.agent.sendPrompt('Explain screenshot', pageContext, true);
      assert.ok(res.runId);
      await driver.close();
    });

    it('B18-4: Should preserve selectedText in page context if present', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      pageContext.selectedText = 'Highlighted excerpt to explain';
      const res = await driver.api.agent.sendPrompt('Explain highlighted text', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('B18-5: Should handle preset action prompts with special query characters', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res = await driver.api.agent.sendPrompt('Compare page with: "React vs Vue" & benchmarks?', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });
  });

  // =========================================================================
  // Boundary 19: Local MCP Tool Connection Corner Cases
  // =========================================================================
  describe('Boundary 19: Local MCP Tool Connection Corner Cases', () => {
    it('B19-1: Should handle empty args array in MCP server configuration', async () => {
      const driver = new WarwickBrowserDriver();
      const mcp = { name: 'no-args-mcp', command: 'node', args: [] };
      await driver.api.settings.save({ mcpServers: [mcp] });
      const current = await driver.api.settings.get();
      assert.deepStrictEqual(current.mcpServers[0].args, []);
    });

    it('B19-2: Should handle MCP servers with many arguments', async () => {
      const driver = new WarwickBrowserDriver();
      const args = ['--flag1', '--flag2', 'value', '--port', '8080', '--verbose'];
      const mcp = { name: 'complex-mcp', command: 'python', args };
      await driver.api.settings.save({ mcpServers: [mcp] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers[0].args.length, 6);
    });

    it('B19-3: Should handle duplicate MCP server names by storing both', async () => {
      const driver = new WarwickBrowserDriver();
      const servers = [
        { name: 'duplicate', command: 'cmd1', args: [] },
        { name: 'duplicate', command: 'cmd2', args: [] }
      ];
      await driver.api.settings.save({ mcpServers: servers });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers.length, 2);
    });

    it('B19-4: Should allow clearing all MCP servers', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ mcpServers: [{ name: 't1', command: 'c', args: [] }] });
      await driver.api.settings.save({ mcpServers: [] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers.length, 0);
    });

    it('B19-5: Should handle special characters in MCP server command and args', async () => {
      const driver = new WarwickBrowserDriver();
      const mcp = {
        name: 'windows-path-mcp',
        command: 'C:\\Program Files\\nodejs\\node.exe',
        args: ['C:\\Users\\test\\mcp\\index.mjs']
      };
      await driver.api.settings.save({ mcpServers: [mcp] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers[0].command, 'C:\\Program Files\\nodejs\\node.exe');
    });
  });

  // =========================================================================
  // Boundary 20: Web Search Tool Corner Cases
  // =========================================================================
  describe('Boundary 20: Web Search Tool Corner Cases', () => {
    it('B20-1: Should handle search query with Unicode characters & emojis', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('🍓 strawberry browser 🤖 AI', 'google');
      assert.ok(resolved.url.includes('%F0%9F%8D%93'));
    });

    it('B20-2: Should handle search query with 500 characters', () => {
      const driver = new WarwickBrowserDriver();
      const longQuery = 'query '.repeat(100);
      const resolved = driver.resolveUrlOrSearch(longQuery, 'duckduckgo');
      assert.strictEqual(resolved.type, 'search');
      assert.ok(resolved.url.startsWith('https://duckduckgo.com/html/?q='));
    });

    it('B20-3: Should handle question marks in search query without confusing with @ai', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('what is html? and css?', 'google');
      assert.strictEqual(resolved.type, 'search');
    });

    it('B20-4: Should handle search queries starting with numbers (2026 presidential election)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('2026 tech trends', 'google');
      assert.strictEqual(resolved.type, 'search');
    });

    it('B20-5: Should handle search query with plus symbols (C++ vs Rust+Wasm)', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('C++ vs Rust+Wasm', 'duckduckgo');
      assert.strictEqual(resolved.type, 'search');
      assert.ok(resolved.url.includes('C%2B%2B'));
    });
  });

});
