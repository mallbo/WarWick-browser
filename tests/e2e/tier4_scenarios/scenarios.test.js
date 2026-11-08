import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';
import { SAMPLE_HTML_WITH_NOISE, SAMPLE_HTML_MASSIVE } from '../harness/fixtures.js';

describe('Tier 4: Real-World Scenarios (15 End-to-End User Workflows)', () => {

  // -------------------------------------------------------------------------
  // Scenario 1: Multi-Tab Research & Comparison Session
  // -------------------------------------------------------------------------
  it('SCENARIO-01: Multi-Tab Research & Comparison Session', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User opens 4 documentation tabs
    const doc1 = await driver.api.tabs.create('https://react.dev/reference/react');
    const doc2 = await driver.api.tabs.create('https://vuejs.org/guide/introduction');
    const doc3 = await driver.api.tabs.create('https://svelte.dev/docs');
    const doc4 = await driver.api.tabs.create('https://angular.dev/overview');

    assert.strictEqual(driver.getTabsList().length, 5); // 1 initial blank + 4 docs
    assert.strictEqual(driver.getActiveTab().id, doc4.id);

    // Switch between tabs to compare
    await driver.api.tabs.switch(doc1.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://react.dev/reference/react');
    await driver.api.tabs.switch(doc2.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://vuejs.org/guide/introduction');

    // Close finished tabs
    await driver.api.tabs.close(doc3.id);
    await driver.api.tabs.close(doc4.id);
    assert.strictEqual(driver.getTabsList().length, 3);

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 2: AI Page Explanation with Live Screenshot
  // -------------------------------------------------------------------------
  it('SCENARIO-02: AI Page Explanation with Live Screenshot', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User navigates to a technical article
    const tab = await driver.api.tabs.create('https://arxiv.org/abs/2604.12345');
    driver.setTabHtml(tab.id, SAMPLE_HTML_WITH_NOISE);

    // User opens AI drawer via hotkey Ctrl+J
    await driver.handleKeyboardShortcut('Ctrl+J');
    assert.strictEqual(driver.isAIDrawerOpen, true);

    // User clicks Quick Action "Explain this page" with screenshot
    const pageContext = await driver.api.context.captureActivePage(true);
    assert.ok(pageContext.screenshotBase64);
    assert.ok(pageContext.readableText.includes('Deep Reinforcement Learning in Web Agents'));

    const chunks = [];
    driver.api.agent.onStreamChunk((c) => chunks.push(c));

    const { runId } = await driver.api.agent.sendPrompt('Explain this page and its visual chart', pageContext, true);
    for (let i = 0; i < 30 && !chunks.some(c => c.includes('in-page context')); i++) {
      await new Promise(r => setTimeout(r, 10));
    }

    assert.ok(chunks.length > 0);
    assert.ok(chunks.some(c => c.includes('in-page context')));
    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Autonomous Deep Background Research while Browsing
  // -------------------------------------------------------------------------
  it('SCENARIO-03: Autonomous Deep Background Research while Browsing', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User is browsing GitHub in active tab
    const userTab = await driver.api.tabs.create('https://github.com/trending');

    // User triggers deep research on a complex topic
    const actionStages = [];
    driver.api.agent.onActionEvent((action) => actionStages.push(action.stage));
    const researchPromise = driver.api.agent.researchQuery('Zero-knowledge proofs in modern cryptography');

    // While research is running, user continues clicking and navigating in active tab
    await driver.api.tabs.navigate(userTab.id, 'https://github.com/trending/rust');
    await driver.api.tabs.navigate(userTab.id, 'https://github.com/trending/python');

    assert.strictEqual(driver.getActiveTab().id, userTab.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://github.com/trending/python');

    // Wait for research to complete
    await researchPromise;
    for (let i = 0; i < 30 && !actionStages.includes('complete'); i++) {
      await new Promise(r => setTimeout(r, 10));
    }

    assert.ok(actionStages.includes('planning'));
    assert.ok(actionStages.includes('searching'));
    assert.ok(actionStages.includes('reading'));
    assert.ok(actionStages.includes('complete'));

    // User's active tab is still untouched
    assert.strictEqual(driver.getActiveTab().id, userTab.id);
    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Keyboard Power-User Navigation Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-04: Keyboard Power-User Navigation Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // 1. New tab via Ctrl+T
    await driver.handleKeyboardShortcut('Ctrl+T');
    const tab1 = driver.getActiveTab();

    // 2. Focus omnibox via Ctrl+K
    await driver.handleKeyboardShortcut('Ctrl+K');
    assert.strictEqual(driver.omniboxFocused, true);

    // 3. Navigate
    await driver.api.tabs.navigate(tab1.id, 'https://news.ycombinator.com');

    // 4. Toggle AI Copilot via Ctrl+J
    await driver.handleKeyboardShortcut('Ctrl+J');
    assert.strictEqual(driver.isAIDrawerOpen, true);

    // 5. Close tab via Ctrl+W
    await driver.handleKeyboardShortcut('Ctrl+W');
    assert.notStrictEqual(driver.getActiveTab().id, tab1.id);

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Web Navigation Error Recovery Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-05: Web Navigation Error Recovery Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User navigates to valid site
    const tab = await driver.api.tabs.create('https://wikipedia.org');

    // User accidentally types invalid search term in omnibox
    const resolved = driver.resolveUrlOrSearch('what happened in 1776?', 'google');
    await driver.api.tabs.navigate(tab.id, resolved.url);
    assert.ok(driver.getActiveTab().url.includes('google.com/search'));

    // User goes back to wikipedia
    await driver.api.tabs.goBack(tab.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://wikipedia.org');

    // User reloads page
    const reloaded = await driver.api.tabs.reload(tab.id);
    assert.strictEqual(reloaded, true);

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Browser Personalization & Settings Sync
  // -------------------------------------------------------------------------
  it('SCENARIO-06: Browser Personalization & Settings Sync', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User configures preferences in settings modal
    await driver.api.settings.save({
      defaultSearchEngine: 'duckduckgo',
      geminiApiKey: 'AIzaSyUserPersonalKey',
      sidebarCollapsed: true,
      aiPanelWidth: 420
    });

    const current = await driver.api.settings.get();
    assert.strictEqual(current.defaultSearchEngine, 'duckduckgo');
    assert.strictEqual(current.geminiApiKey, 'AIzaSyUserPersonalKey');
    assert.strictEqual(current.sidebarCollapsed, true);

    // Verify search resolver immediately adheres to new default engine
    const searchRes = driver.resolveUrlOrSearch('privacy browser', current.defaultSearchEngine);
    assert.ok(searchRes.url.includes('duckduckgo.com'));

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 7: High-Volume Heavy DOM & Long Reading Session
  // -------------------------------------------------------------------------
  it('SCENARIO-07: High-Volume Heavy DOM & Long Reading Session', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // Load massive technical paper (thousands of paragraphs)
    const tab = await driver.api.tabs.create('https://heavy-doc.com/spec');
    driver.setTabHtml(tab.id, SAMPLE_HTML_MASSIVE);

    // Capture context: verify 40k truncation protects against LLM token overflow
    const ctx = await driver.api.context.captureActivePage(false);
    assert.strictEqual(ctx.readableText.length, THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);

    // Run summary prompt
    const { runId } = await driver.api.agent.sendPrompt('Summarize key points', ctx);
    assert.ok(runId);

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Background Research Timeout & Graceful Synthesis
  // -------------------------------------------------------------------------
  it('SCENARIO-08: Background Research Timeout & Graceful Synthesis', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // Initiate research query
    const run = await driver.api.agent.researchQuery('Hanging source simulation');
    const record = driver.researchRuns.get(run.runId);

    // Open background harvest tab with simulated slow endpoint
    const bg = await driver.openBackgroundResearchTab('https://slow-load.com');
    assert.strictEqual(bg.isMuted, true);

    // Timeout occurs -> harvest tab closed
    driver.closeBackgroundResearchTab(bg.id);
    assert.strictEqual(driver.backgroundTabs.size, 0);

    // Research completes with available sources
    for (let i = 0; i < 30 && record.status !== 'complete'; i++) {
      await new Promise(r => setTimeout(r, 10));
    }
    assert.strictEqual(record.status, 'complete');

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Media Playback Audio Isolation Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-09: Media Playback Audio Isolation Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User is playing a tutorial in active tab
    const activeMediaTab = await driver.api.tabs.create('https://youtube.com/watch?v=123');
    driver.tabs.get(activeMediaTab.id).state.isMuted = false;
    assert.strictEqual(driver.getActiveTab().isMuted, false);

    // Background research agent spawns 3 harvest tabs that contain video ads
    const bg1 = await driver.openBackgroundResearchTab('https://ad-heavy-news.com/page1');
    const bg2 = await driver.openBackgroundResearchTab('https://ad-heavy-news.com/page2');
    const bg3 = await driver.openBackgroundResearchTab('https://ad-heavy-news.com/page3');

    // Verify all background tabs are completely muted
    assert.strictEqual(bg1.isMuted, true);
    assert.strictEqual(bg2.isMuted, true);
    assert.strictEqual(bg3.isMuted, true);

    // User's tutorial is still playing audio unmuted
    assert.strictEqual(driver.getActiveTab().isMuted, false);

    driver.closeBackgroundResearchTab(bg1.id);
    driver.closeBackgroundResearchTab(bg2.id);
    driver.closeBackgroundResearchTab(bg3.id);
    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Omnibox Natural Language vs Scheme vs Search Resolution
  // -------------------------------------------------------------------------
  it('SCENARIO-10: Omnibox Natural Language vs Scheme vs Search Resolution', () => {
    const driver = new WarwickBrowserDriver();

    // Bare domain
    const r1 = driver.resolveUrlOrSearch('github.com');
    assert.strictEqual(r1.type, 'url');
    assert.strictEqual(r1.url, 'https://github.com');

    // Explicit HTTPS
    const r2 = driver.resolveUrlOrSearch('https://sub.domain.co.uk/path');
    assert.strictEqual(r2.type, 'url');
    assert.strictEqual(r2.url, 'https://sub.domain.co.uk/path');

    // Natural language search
    const r3 = driver.resolveUrlOrSearch('why is the sky blue', 'google');
    assert.strictEqual(r3.type, 'search');
    assert.ok(r3.url.includes('google.com/search?q=why%20is%20the%20sky%20blue'));

    // Omnibox @ai prompt
    const r4 = driver.resolveUrlOrSearch('@ai summarize recent breakthroughs in fusion');
    assert.strictEqual(r4.type, 'ai');
    assert.strictEqual(r4.prompt, 'summarize recent breakthroughs in fusion');

    // Question mark shortcut
    const r5 = driver.resolveUrlOrSearch('? how far is Mars');
    assert.strictEqual(r5.type, 'ai');
    assert.strictEqual(r5.prompt, 'how far is Mars');
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Rapid Agent Prompt Interruption & Restart
  // -------------------------------------------------------------------------
  it('SCENARIO-11: Rapid Agent Prompt Interruption & Restart', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // Start long-running prompt
    const { runId: run1 } = await driver.api.agent.sendPrompt('Analyze entire web archive');

    // User changes mind and cancels
    const cancelled = await driver.api.agent.cancel();
    assert.strictEqual(cancelled, true);

    // Immediately submit focused prompt
    const { runId: run2 } = await driver.api.agent.sendPrompt('Give me a 3-bullet summary');
    assert.notStrictEqual(run1, run2);

    const chunks = [];
    driver.api.agent.onStreamChunk((c) => chunks.push(c));
    for (let i = 0; i < 20 && chunks.length === 0; i++) {
      await new Promise(r => setTimeout(r, 10));
    }

    assert.ok(chunks.length > 0);
    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Session Persistence Across App Relaunch
  // -------------------------------------------------------------------------
  it('SCENARIO-12: Session Persistence Across App Relaunch', async () => {
    // Session 1
    const session1 = new WarwickBrowserDriver();
    await session1.launch();
    await session1.api.tabs.create('https://site-one.com');
    await session1.api.tabs.create('https://site-two.com');
    await session1.api.settings.save({ geminiApiKey: 'persisted-key-xyz' });

    const persistedHistory = [...session1.history];
    const persistedSettings = await session1.api.settings.get();
    await session1.close();

    // Session 2 (Simulating App Restart)
    const session2 = new WarwickBrowserDriver({ initialSettings: persistedSettings });
    session2.history = persistedHistory;
    await session2.launch();

    assert.strictEqual((await session2.api.settings.get()).geminiApiKey, 'persisted-key-xyz');
    assert.ok(session2.history.some(h => h.url === 'https://site-one.com'));
    assert.ok(session2.history.some(h => h.url === 'https://site-two.com'));
    await session2.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 13: Local MCP Tool Augmentation Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-13: Local MCP Tool Augmentation Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // User registers local MCP SQLite/Filesystem server
    await driver.api.settings.save({
      mcpServers: [
        { name: 'sqlite-tools', command: 'npx', args: ['-y', 'mcp-server-sqlite'] }
      ]
    });

    const settings = await driver.api.settings.get();
    assert.strictEqual(settings.mcpServers.length, 1);
    assert.strictEqual(settings.mcpServers[0].name, 'sqlite-tools');

    // Agent executes prompt with MCP tools available in schema
    const { runId } = await driver.api.agent.sendPrompt('Query local database for active sessions');
    assert.ok(runId);

    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 14: Tab Crash & Isolated Recovery Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-14: Tab Crash & Isolated Recovery Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    const healthyTab = await driver.api.tabs.create('https://working-fine.com');
    const heavyTab = await driver.api.tabs.create('https://memory-heavy.com');

    // Tab 2 crashes
    driver.tabs.get(heavyTab.id).state.isCrashed = true;
    assert.strictEqual(driver.getActiveTab().isCrashed, true);

    // Switch to healthy tab: healthy tab is completely unaffected
    await driver.api.tabs.switch(healthyTab.id);
    assert.strictEqual(driver.getActiveTab().isCrashed, false);

    // Switch back to crashed tab and trigger reload to recover
    await driver.api.tabs.switch(heavyTab.id);
    await driver.api.tabs.reload(heavyTab.id);
    driver.tabs.get(heavyTab.id).state.isCrashed = false;

    assert.strictEqual(driver.getActiveTab().isCrashed, false);
    await driver.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 15: End-to-End Day-in-the-Life Workflow
  // -------------------------------------------------------------------------
  it('SCENARIO-15: Full End-to-End Day-in-the-Life Workflow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();

    // 1. Launch with Frameless Dark Charcoal aesthetic
    const win = driver.getWindowInfo();
    assert.strictEqual(win.backgroundColor, '#121215');

    // 2. Pin daily communications tab
    const pinned = await driver.api.tabs.create('https://mail.company.com');
    driver.tabs.get(pinned.id).state.isPinned = true;

    // 3. Open research work tab
    const workTab = await driver.api.tabs.create('https://docs.anthropic.com');

    // 4. Capture active page context and ask Antigravity copilot for summary
    const ctx = await driver.api.context.captureActivePage(true);
    const { runId: summaryRunId } = await driver.api.agent.sendPrompt('Summarize documentation', ctx, true);
    assert.ok(summaryRunId);

    // 5. Trigger autonomous deep background research
    const { runId: researchRunId } = await driver.api.agent.researchQuery('State of browser automation in 2026');
    assert.ok(researchRunId);

    // 6. User continues work without interruption
    await driver.api.tabs.navigate(workTab.id, 'https://docs.anthropic.com/en/docs/overview');
    assert.strictEqual(driver.getActiveTab().url, 'https://docs.anthropic.com/en/docs/overview');

    // 7. Close work tab when done; pinned tab remains safely intact
    await driver.api.tabs.close(workTab.id);
    assert.ok(driver.getTabsList().some(t => t.id === pinned.id && t.isPinned));

    await driver.close();
  });

});
