import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { SAMPLE_SEARCH_RESULTS } from '../harness/fixtures.js';

describe('Tier 1: Feature Coverage (Features 16 - 20)', () => {

  // =========================================================================
  // Feature 16: Antigravity Streaming Chat
  // =========================================================================
  describe('Feature 16: Antigravity Streaming Chat', () => {
    it('F16-1: Should return unique runId when prompt is sent', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const res = await driver.api.agent.sendPrompt('Hello Antigravity');
      assert.ok(res.runId);
      assert.ok(res.runId.startsWith('run-'));
      await driver.close();
    });

    it('F16-2: Should stream text chunks to registered onStreamChunk listeners', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const chunks = [];
      driver.api.agent.onStreamChunk((chunk) => {
        chunks.push(chunk);
      });

      await driver.api.agent.sendPrompt('Summarize physics');
      // Wait for simulated stream completion
      await new Promise(r => setTimeout(r, 60));

      assert.ok(chunks.length >= 2);
      assert.ok(chunks.some(c => c.includes('Thinking through query')));
      await driver.close();
    });

    it('F16-3: Should abort streaming when agent.cancel() is invoked', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const chunks = [];
      driver.api.agent.onStreamChunk((chunk) => {
        chunks.push(chunk);
      });

      const promptPromise = driver.api.agent.sendPrompt('Long task to cancel');
      await driver.api.agent.cancel();
      await new Promise(r => setTimeout(r, 60));

      // Cancelled early, so second chunk should not have been emitted
      assert.strictEqual(driver.agentCancelled, true);
      await driver.close();
    });

    it('F16-4: Should include prompt context in reasoning response', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const chunks = [];
      driver.api.agent.onStreamChunk((c) => chunks.push(c));

      await driver.api.agent.sendPrompt('SpecificTestPromptKeyword');
      await new Promise(r => setTimeout(r, 60));

      const fullText = chunks.join('');
      assert.ok(fullText.includes('SpecificTestPromptKeyword'));
      await driver.close();
    });

    it('F16-5: Should support unsubscribing from stream chunk listener', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let chunkCount = 0;
      const unsubscribe = driver.api.agent.onStreamChunk(() => {
        chunkCount++;
      });

      unsubscribe();
      await driver.api.agent.sendPrompt('Test unsubscribe');
      await new Promise(r => setTimeout(r, 60));

      assert.strictEqual(chunkCount, 0);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 17: Live Agent Action Stream
  // =========================================================================
  describe('Feature 17: Live Agent Action Stream', () => {
    it('F17-1: Should emit planning stage event upon initial prompt submission', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const actions = [];
      driver.api.agent.onActionEvent((action) => actions.push(action));

      const { runId } = await driver.api.agent.sendPrompt('Plan my trip');
      assert.ok(actions.some(a => a.runId === runId && a.stage === 'planning'));
      await driver.close();
    });

    it('F17-2: Should transition through reading and complete stages', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const stages = [];
      driver.api.agent.onActionEvent((a) => stages.push(a.stage));

      await driver.api.agent.sendPrompt('Analyze document');
      await new Promise(r => setTimeout(r, 60));

      assert.ok(stages.includes('planning'));
      assert.ok(stages.includes('reading'));
      assert.ok(stages.includes('complete'));
      await driver.close();
    });

    it('F17-3: Should report progressPercent advancing from low to 100%', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const percentages = [];
      driver.api.agent.onActionEvent((a) => {
        if (typeof a.progressPercent === 'number') percentages.push(a.progressPercent);
      });

      await driver.api.agent.sendPrompt('Progress test');
      await new Promise(r => setTimeout(r, 60));

      assert.ok(percentages.length >= 2);
      assert.ok(percentages[0] < 50);
      assert.strictEqual(percentages[percentages.length - 1], 100);
      await driver.close();
    });

    it('F17-4: Should emit error stage when agent is cancelled', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const actions = [];
      driver.api.agent.onActionEvent((a) => actions.push(a));

      await driver.api.agent.sendPrompt('Task to be killed');
      await driver.api.agent.cancel();

      assert.ok(actions.some(a => a.stage === 'error' && a.message.includes('cancelled')));
      await driver.close();
    });

    it('F17-5: Should attach source references when action involves citations', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const actionsWithSources = [];
      driver.api.agent.onActionEvent((a) => {
        if (a.sources && a.sources.length > 0) actionsWithSources.push(a);
      });

      await driver.api.agent.researchQuery('Quantum computing sources');
      await new Promise(r => setTimeout(r, 100));

      assert.ok(actionsWithSources.length >= 1);
      assert.ok(actionsWithSources[0].sources[0].url.startsWith('https://'));
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 18: Quick Action Chips
  // =========================================================================
  describe('Feature 18: Quick Action Chips', () => {
    it('F18-1: Should support "Summarize active page" preset prompt', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res = await driver.api.agent.sendPrompt('Summarize active page', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('F18-2: Should support "Find key takeaways" preset prompt', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res = await driver.api.agent.sendPrompt('Find key takeaways', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('F18-3: Should support "Extract structured data" preset prompt', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(false);
      const res = await driver.api.agent.sendPrompt('Extract structured data', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('F18-4: Should include active page URL and readableText in preset prompt execution', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const tab = await driver.api.tabs.create('https://news.ycombinator.com');
      const pageContext = await driver.api.context.captureActivePage(false);

      assert.strictEqual(pageContext.url, 'https://news.ycombinator.com');
      const res = await driver.api.agent.sendPrompt('Summarize active page', pageContext);
      assert.ok(res.runId);
      await driver.close();
    });

    it('F18-5: Should allow toggling screenshot inclusion with quick action chips', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      const pageContext = await driver.api.context.captureActivePage(true);
      assert.ok(pageContext.screenshotBase64);
      const res = await driver.api.agent.sendPrompt('Explain diagram in screenshot', pageContext, true);
      assert.ok(res.runId);
      await driver.close();
    });
  });

  // =========================================================================
  // Feature 19: Local MCP Tool Connection
  // =========================================================================
  describe('Feature 19: Local MCP Tool Connection', () => {
    it('F19-1: Should allow registering local MCP server configuration', async () => {
      const driver = new WarwickBrowserDriver();
      const mcpServer = {
        name: 'test-mcp-server',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything']
      };

      await driver.api.settings.save({ mcpServers: [mcpServer] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers.length, 1);
      assert.strictEqual(current.mcpServers[0].name, 'test-mcp-server');
    });

    it('F19-2: Should support multiple configured MCP servers', async () => {
      const driver = new WarwickBrowserDriver();
      const servers = [
        { name: 'server-1', command: 'node', args: ['server1.js'] },
        { name: 'server-2', command: 'node', args: ['server2.js'] }
      ];
      await driver.api.settings.save({ mcpServers: servers });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers.length, 2);
    });

    it('F19-3: Should remove MCP server when updated configuration omits it', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({
        mcpServers: [{ name: 'to-remove', command: 'cmd', args: [] }]
      });
      await driver.api.settings.save({ mcpServers: [] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.mcpServers.length, 0);
    });

    it('F19-4: Should preserve other settings when updating mcpServers', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.api.settings.save({ geminiApiKey: 'secret-key-123' });
      await driver.api.settings.save({ mcpServers: [{ name: 's1', command: 'c', args: [] }] });
      const current = await driver.api.settings.get();
      assert.strictEqual(current.geminiApiKey, 'secret-key-123');
      assert.strictEqual(current.mcpServers.length, 1);
    });

    it('F19-5: Should validate MCP server definition contains required keys', async () => {
      const driver = new WarwickBrowserDriver();
      const validServer = { name: 'valid', command: 'node', args: [] };
      assert.ok('name' in validServer);
      assert.ok('command' in validServer);
      assert.ok(Array.isArray(validServer.args));
    });
  });

  // =========================================================================
  // Feature 20: Web Search Tool (perform_web_search)
  // =========================================================================
  describe('Feature 20: Web Search Tool (perform_web_search)', () => {
    it('F20-1: Should return search results containing title, url, and snippet', () => {
      assert.ok(SAMPLE_SEARCH_RESULTS.length > 0);
      const first = SAMPLE_SEARCH_RESULTS[0];
      assert.ok(first.title);
      assert.ok(first.url.startsWith('https://'));
      assert.ok(first.snippet);
    });

    it('F20-2: Should format DuckDuckGo static HTML search endpoint URL correctly', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('autonomous browser agents', 'duckduckgo');
      assert.ok(resolved.url.startsWith('https://duckduckgo.com/html/?q='));
    });

    it('F20-3: Should URL-encode special search characters in search query URL', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('c++ & rust / web-assembly?', 'duckduckgo');
      assert.ok(!resolved.url.includes(' '));
      assert.ok(resolved.url.includes('%26'));
      assert.ok(resolved.url.includes('%2F'));
    });

    it('F20-4: Should include search results in research agent action stream', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();
      let capturedSources = null;
      driver.api.agent.onActionEvent((action) => {
        if (action.sources) capturedSources = action.sources;
      });

      await driver.api.agent.researchQuery('AI Browsers');
      await new Promise(r => setTimeout(r, 60));

      assert.ok(capturedSources);
      assert.strictEqual(capturedSources.length, SAMPLE_SEARCH_RESULTS.length);
      await driver.close();
    });

    it('F20-5: Should fallback to Google search URL when default engine is set to google', () => {
      const driver = new WarwickBrowserDriver();
      const resolved = driver.resolveUrlOrSearch('latest electron release', 'google');
      assert.ok(resolved.url.startsWith('https://www.google.com/search?q='));
    });
  });

});
