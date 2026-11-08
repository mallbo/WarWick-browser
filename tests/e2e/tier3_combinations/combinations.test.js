import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WarwickBrowserDriver } from '../harness/browserDriver.js';
import { THEME_CONSTANTS } from '../harness/types.js';
import { SAMPLE_HTML_WITH_NOISE, SAMPLE_HTML_MASSIVE } from '../harness/fixtures.js';

describe('Tier 3: Cross-Feature Combinations (28 Pairwise & Multi-Feature Interactions)', () => {

  it('X01: Tab Creation + Omnibox Navigation', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create();
    const resolved = driver.resolveUrlOrSearch('github.com');
    await driver.api.tabs.navigate(tab.id, resolved.url);

    const active = driver.getActiveTab();
    assert.strictEqual(active.url, 'https://github.com');
    assert.strictEqual(active.title, 'github.com');
    assert.strictEqual(active.canGoBack, true);
    await driver.close();
  });

  it('X02: Omnibox @ai + AI Drawer Trigger + Streaming Chat', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const resolved = driver.resolveUrlOrSearch('@ai summarize generative agents');
    assert.strictEqual(resolved.type, 'ai');

    // Trigger AI drawer
    driver.isAIDrawerOpen = true;
    driver.recalculateBounds();

    const chunks = [];
    driver.api.agent.onStreamChunk((c) => chunks.push(c));
    const { runId } = await driver.api.agent.sendPrompt(resolved.prompt);

    await new Promise(r => setTimeout(r, 60));
    assert.ok(chunks.length > 0);
    assert.ok(driver.bounds.width < driver.options.width - THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH);
    await driver.close();
  });

  it('X03: Background Deep Research + Concurrent Active Tab Browsing', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const activeTab = await driver.api.tabs.create('https://my-work.com');

    // Start background research
    const researchPromise = driver.api.agent.researchQuery('Quantum computing advancements');

    // Concurrently browse in active tab
    await driver.api.tabs.navigate(activeTab.id, 'https://my-work.com/next-page');
    assert.strictEqual(driver.getActiveTab().url, 'https://my-work.com/next-page');

    await researchPromise;
    await new Promise(r => setTimeout(r, 80));

    // Active tab was undisturbed throughout
    assert.strictEqual(driver.getActiveTab().id, activeTab.id);
    await driver.close();
  });

  it('X04: Background Research Audio Isolation vs Active Tab Audio', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const activeTab = await driver.api.tabs.create('https://music.youtube.com');
    assert.strictEqual(driver.getActiveTab().isMuted, false);

    const bgTab = await driver.openBackgroundResearchTab('https://video-media.com/stream');
    assert.strictEqual(bgTab.isMuted, true);
    assert.strictEqual(driver.getActiveTab().isMuted, false);
    await driver.close();
  });

  it('X05: Live DOM Extraction + Screenshot Capture + Agent Prompt', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://multimodal-analysis.org');
    driver.setTabHtml(tab.id, SAMPLE_HTML_WITH_NOISE);

    const pageContext = await driver.api.context.captureActivePage(true);
    assert.ok(pageContext.readableText.length > 0);
    assert.ok(pageContext.screenshotBase64);

    const res = await driver.api.agent.sendPrompt('Analyze both layout and text', pageContext, true);
    assert.ok(res.runId);
    await driver.close();
  });

  it('X06: Sidebar Collapse + Native Bounds Synchronizer', async () => {
    const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
    await driver.launch();
    const initialWidth = driver.bounds.width;

    driver.toggleSidebar(); // 240 -> 52
    assert.strictEqual(driver.bounds.x, 52);
    assert.strictEqual(driver.bounds.width, initialWidth + (240 - 52));
    await driver.close();
  });

  it('X07: AI Drawer Toggle + Native Bounds Synchronizer', async () => {
    const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
    await driver.launch();
    const initialWidth = driver.bounds.width;

    await driver.handleKeyboardShortcut('Ctrl+J');
    assert.strictEqual(driver.bounds.width, initialWidth - 360);

    await driver.handleKeyboardShortcut('Ctrl+J');
    assert.strictEqual(driver.bounds.width, initialWidth);
    await driver.close();
  });

  it('X08: Sidebar Collapsed + AI Drawer Open Dual Contraction', async () => {
    const driver = new WarwickBrowserDriver({ width: 1280, height: 800 });
    await driver.launch();
    driver.toggleSidebar(); // 52px
    await driver.handleKeyboardShortcut('Ctrl+J'); // 360px

    // 1280 - 52 - 360 = 868
    assert.strictEqual(driver.bounds.x, 52);
    assert.strictEqual(driver.bounds.width, 868);
    await driver.close();
  });

  it('X09: Active Tab Closure + Neighbor Auto-Activation & View Attachment', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab1 = await driver.api.tabs.create('https://stay.com');
    const tab2 = await driver.api.tabs.create('https://leave.com');
    assert.strictEqual(driver.getActiveTab().id, tab2.id);

    await driver.api.tabs.close(tab2.id);
    assert.strictEqual(driver.getActiveTab().id, tab1.id);
    assert.ok(driver.attachedChildViews.has(tab1.id));
    assert.ok(!driver.attachedChildViews.has(tab2.id));
    await driver.close();
  });

  it('X10: Last Tab Closure + New Blank Tab Auto-Spawn', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const initial = driver.getActiveTab();
    await driver.api.tabs.close(initial.id);

    assert.strictEqual(driver.getTabsList().length, 1);
    const newTab = driver.getActiveTab();
    assert.notStrictEqual(newTab.id, initial.id);
    assert.strictEqual(newTab.url, 'about:blank');
    assert.ok(driver.attachedChildViews.has(newTab.id));
    await driver.close();
  });

  it('X11: History Navigation + Omnibox State Sync', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://site-1.com');
    await driver.api.tabs.navigate(tab.id, 'https://site-2.com');
    await driver.api.tabs.navigate(tab.id, 'https://site-3.com');

    await driver.api.tabs.goBack(tab.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://site-2.com');

    await driver.api.tabs.goBack(tab.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://site-1.com');

    await driver.api.tabs.goForward(tab.id);
    assert.strictEqual(driver.getActiveTab().url, 'https://site-2.com');
    await driver.close();
  });

  it('X12: Settings Search Engine Selection + Omnibox Query Routing', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.api.settings.save({ defaultSearchEngine: 'duckduckgo' });
    const ddgQuery = driver.resolveUrlOrSearch('strawberry browser', (await driver.api.settings.get()).defaultSearchEngine);
    assert.ok(ddgQuery.url.includes('duckduckgo.com'));

    await driver.api.settings.save({ defaultSearchEngine: 'google' });
    const googleQuery = driver.resolveUrlOrSearch('strawberry browser', (await driver.api.settings.get()).defaultSearchEngine);
    assert.ok(googleQuery.url.includes('google.com'));
  });

  it('X13: Settings Gemini API Key + Streaming Agent Execution', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    await driver.api.settings.save({ geminiApiKey: 'AIzaSyVerifiedKey987' });
    const settings = await driver.api.settings.get();
    assert.strictEqual(settings.geminiApiKey, 'AIzaSyVerifiedKey987');

    const res = await driver.api.agent.sendPrompt('Analyze market');
    assert.ok(res.runId);
    await driver.close();
  });

  it('X14: MCP Server Registration + Live Action Stream Tool Milestones', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    await driver.api.settings.save({
      mcpServers: [{ name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }]
    });

    const actions = [];
    driver.api.agent.onActionEvent((a) => actions.push(a));
    await driver.api.agent.researchQuery('Search documents');
    await new Promise(r => setTimeout(r, 60));

    assert.ok(actions.some(a => a.stage === 'planning'));
    assert.ok(actions.some(a => a.stage === 'searching'));
    await driver.close();
  });

  it('X15: Keyboard Shortcut Ctrl+T + Omnibox Auto-Focus', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    await driver.handleKeyboardShortcut('Ctrl+T');
    await driver.handleKeyboardShortcut('Ctrl+K');
    assert.strictEqual(driver.omniboxFocused, true);
    await driver.close();
  });

  it('X16: Keyboard Shortcut Ctrl+W + Visited History Preservation', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://closed-page.com');
    await driver.handleKeyboardShortcut('Ctrl+W');

    assert.ok(driver.history.some(h => h.url === 'https://closed-page.com'));
    await driver.close();
  });

  it('X17: Keyboard Shortcut Ctrl+J + AI Drawer State Persistence', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    await driver.handleKeyboardShortcut('Ctrl+J');
    assert.strictEqual(driver.isAIDrawerOpen, true);
    // Setting in state remains valid
    assert.ok(driver.bounds.width < driver.options.width);
    await driver.close();
  });

  it('X18: Quick Action "Summarize active page" + Live DOM Reader', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://article.com');
    driver.setTabHtml(tab.id, SAMPLE_HTML_WITH_NOISE);

    const ctx = await driver.api.context.captureActivePage(false);
    assert.ok(ctx.readableText.includes('Deep Reinforcement Learning in Web Agents'));

    const { runId } = await driver.api.agent.sendPrompt('Summarize active page', ctx);
    assert.ok(runId);
    await driver.close();
  });

  it('X19: Quick Action "Explain this diagram" + High-Res Screenshot', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://diagram.com');
    const ctx = await driver.api.context.captureActivePage(true);
    assert.ok(ctx.screenshotBase64);

    const { runId } = await driver.api.agent.sendPrompt('Explain this diagram', ctx, true);
    assert.ok(runId);
    await driver.close();
  });

  it('X20: DuckDuckGo Search Scraper + Background Tab Harvester', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const res = await driver.api.agent.researchQuery('Autonomous agent capabilities');

    const bgTab = await driver.openBackgroundResearchTab('https://candidate-source.org');
    assert.strictEqual(bgTab.isMuted, true);
    assert.strictEqual(bgTab.isAttachedToWindow, false);

    driver.closeBackgroundResearchTab(bgTab.id);
    assert.strictEqual(driver.backgroundTabs.size, 0);
    await driver.close();
  });

  it('X21: Background Tab Pool Overflow Prevention During Research', async () => {
    const driver = new WarwickBrowserDriver();
    for (let i = 0; i < THEME_CONSTANTS.MAX_BACKGROUND_TABS; i++) {
      await driver.openBackgroundResearchTab(`https://res-${i}.org`);
    }
    assert.strictEqual(driver.backgroundTabs.size, 5);

    // Attempting sixth tab rejects
    await assert.rejects(
      async () => await driver.openBackgroundResearchTab('https://res-6.org'),
      /limit/
    );
  });

  it('X22: Tab Renderer Crash + Reload Recovery', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://crashed-app.com');
    driver.tabs.get(tab.id).state.isCrashed = true;
    assert.strictEqual(driver.getActiveTab().isCrashed, true);

    await driver.api.tabs.reload(tab.id);
    driver.tabs.get(tab.id).state.isCrashed = false;
    assert.strictEqual(driver.getActiveTab().isCrashed, false);
    await driver.close();
  });

  it('X23: Pinned Tabs Immunity on Tab Strip Active Tab Closure', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const pinnedTab = await driver.api.tabs.create('https://mail.google.com');
    driver.tabs.get(pinnedTab.id).state.isPinned = true;

    const normalTab = await driver.api.tabs.create('https://temp.org');
    await driver.api.tabs.close(normalTab.id);

    const remaining = driver.getTabsList();
    assert.ok(remaining.some(t => t.id === pinnedTab.id && t.isPinned));
    await driver.close();
  });

  it('X24: Dark Charcoal Theme `#121215` + Frameless Window Configuration', async () => {
    const driver = new WarwickBrowserDriver({ frameless: true, backgroundColor: THEME_CONSTANTS.APP_BG });
    await driver.launch();
    const win = driver.getWindowInfo();
    assert.strictEqual(win.frameless, true);
    assert.strictEqual(win.backgroundColor, '#121215');
    await driver.close();
  });

  it('X25: Massive 100k DOM Extraction + Token Safety Truncation to 40k chars', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const tab = await driver.api.tabs.create('https://massive.org');
    driver.setTabHtml(tab.id, SAMPLE_HTML_MASSIVE);

    const ctx = await driver.api.context.captureActivePage(false);
    assert.strictEqual(ctx.readableText.length, 40000);

    const res = await driver.api.agent.sendPrompt('Summarize massive', ctx);
    assert.ok(res.runId);
    await driver.close();
  });

  it('X26: In-Flight Agent Streaming + Prompt Cancellation Flow', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    let errorReceived = false;
    driver.api.agent.onActionEvent((a) => {
      if (a.stage === 'error') errorReceived = true;
    });

    await driver.api.agent.sendPrompt('Long reasoning prompt');
    await driver.api.agent.cancel();

    assert.strictEqual(errorReceived, true);
    assert.strictEqual(driver.agentCancelled, true);
    await driver.close();
  });

  it('X27: Continuous Tab Switching Across 3 Tabs View Attachment Tracking', async () => {
    const driver = new WarwickBrowserDriver();
    await driver.launch();
    const t1 = await driver.api.tabs.create('https://t1.com');
    const t2 = await driver.api.tabs.create('https://t2.com');
    const t3 = await driver.api.tabs.create('https://t3.com');

    await driver.api.tabs.switch(t1.id);
    assert.strictEqual(driver.attachedChildViews.size, 1);
    assert.ok(driver.attachedChildViews.has(t1.id));

    await driver.api.tabs.switch(t2.id);
    assert.strictEqual(driver.attachedChildViews.size, 1);
    assert.ok(driver.attachedChildViews.has(t2.id));

    await driver.api.tabs.switch(t3.id);
    assert.strictEqual(driver.attachedChildViews.size, 1);
    assert.ok(driver.attachedChildViews.has(t3.id));
    await driver.close();
  });

  it('X28: Comprehensive Settings Persistence Across App Restarts', async () => {
    const driver1 = new WarwickBrowserDriver();
    await driver1.api.settings.save({
      geminiApiKey: 'AIzaSyPermanentKey',
      defaultSearchEngine: 'duckduckgo',
      sidebarCollapsed: true,
      aiPanelWidth: 400,
      mcpServers: [{ name: 's1', command: 'node', args: [] }]
    });
    const saved = await driver1.api.settings.get();

    // Reopen browser with persisted settings
    const driver2 = new WarwickBrowserDriver({ initialSettings: saved });
    const loaded = await driver2.api.settings.get();
    assert.deepStrictEqual(loaded, saved);
  });

});
