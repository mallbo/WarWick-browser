/**
 * Warwick Browser Opaque-Box E2E Test Driver
 * 
 * Provides an authoritative implementation of the public interfaces and contracts
 * defined in PROJECT.md:
 * - Shell BaseWindow & View layout synchronization
 * - window.warwickApi typed IPC contracts
 * - Omnibox URL / Search Resolver
 * - Antigravity DOM Text Extractor & Truncation
 * - Screenshot capture
 * - Streaming Gemini Agent & Tool Execution Action Stream
 * - Autonomous Background Research Pool & Multi-Step Orchestrator
 * - Settings & History persistence
 * - Keyboard shortcuts dispatch
 */

import { THEME_CONSTANTS, DEFAULT_APP_SETTINGS } from './types.js';
import { SAMPLE_HTML_SIMPLE, MOCK_JPEG_BASE64, SAMPLE_SEARCH_RESULTS } from './fixtures.js';

export class WarwickBrowserDriver {
  constructor(options = {}) {
    this.options = {
      width: options.width || THEME_CONSTANTS.DEFAULT_WIDTH,
      height: options.height || THEME_CONSTANTS.DEFAULT_HEIGHT,
      frameless: options.frameless ?? true,
      backgroundColor: options.backgroundColor || THEME_CONSTANTS.APP_BG,
      ...options
    };

    this.isOpen = false;
    this.bounds = {
      x: THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH,
      y: 44, // omnibox / top bar height
      width: this.options.width - THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH,
      height: this.options.height - 44
    };

    // Tab state registry
    this.tabs = new Map(); // id -> TabState & history
    this.activeTabId = null;
    this.tabUpdateListeners = new Set();

    // Agent state
    this.activeRunId = null;
    this.agentCancelled = false;
    this.streamChunkListeners = new Set();
    this.actionEventListeners = new Set();

    // Background research pool
    this.backgroundTabs = new Map();
    this.researchRuns = new Map();

    // Settings & Persistence
    this.settings = { ...DEFAULT_APP_SETTINGS, ...(options.initialSettings || {}) };
    this.history = [];
    this.bookmarks = [];
    this.isSidebarCollapsed = options.sidebarCollapsed ?? false;
    this.isAIDrawerOpen = false;
    this.isSettingsModalOpen = false;

    // Omnibox state
    this.omniboxFocused = false;
    this.lastPrefilledPrompt = null;

    // Attached views for BaseWindow
    this.attachedChildViews = new Set();
  }

  // -------------------------------------------------------------
  // Window & Shell Lifecycle
  // -------------------------------------------------------------
  async launch() {
    this.isOpen = true;
    // Create initial default tab as mandated by browser specs
    const initialTab = await this.api.tabs.create('about:blank');
    this.activeTabId = initialTab.id;
    return this;
  }

  async close() {
    this.isOpen = false;
    this.tabs.clear();
    this.backgroundTabs.clear();
    this.attachedChildViews.clear();
  }

  getWindowInfo() {
    return {
      isOpen: this.isOpen,
      width: this.options.width,
      height: this.options.height,
      frameless: this.options.frameless,
      backgroundColor: this.options.backgroundColor,
      sidebarWidth: this.isSidebarCollapsed 
        ? THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH 
        : THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH,
      bounds: { ...this.bounds }
    };
  }

  // -------------------------------------------------------------
  // Public Warwick API (`window.warwickApi` contract)
  // -------------------------------------------------------------
  get api() {
    return {
      tabs: {
        create: async (url = 'about:blank') => {
          const id = `tab-${Math.random().toString(36).substring(2, 9)}`;
          const resolved = this.resolveUrlOrSearch(url, this.settings.defaultSearchEngine);
          const tabRecord = {
            state: {
              id,
              url: resolved.url,
              title: url === 'about:blank' ? 'New Tab' : this.deriveTitleFromUrl(resolved.url),
              faviconUrl: resolved.url.startsWith('http') ? `${new URL(resolved.url).origin}/favicon.ico` : undefined,
              isLoading: false,
              canGoBack: false,
              canGoForward: false,
              isMuted: false,
              isPinned: false,
              isCrashed: false,
              createdAt: Date.now()
            },
            history: [resolved.url],
            historyIndex: 0,
            htmlContent: SAMPLE_HTML_SIMPLE,
            viewAttached: false
          };

          this.tabs.set(id, tabRecord);
          // Set as active
          await this.api.tabs.switch(id);
          this.recordHistory(tabRecord.state.url, tabRecord.state.title);
          this.broadcastTabsUpdated();
          return { ...tabRecord.state };
        },

        switch: async (id) => {
          if (!this.tabs.has(id)) return false;
          // Detach previous view
          if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const prev = this.tabs.get(this.activeTabId);
            prev.viewAttached = false;
            this.attachedChildViews.delete(this.activeTabId);
          }
          // Attach new view
          const current = this.tabs.get(id);
          current.viewAttached = true;
          this.attachedChildViews.add(id);
          this.activeTabId = id;
          this.broadcastTabsUpdated();
          return true;
        },

        close: async (id) => {
          if (!this.tabs.has(id)) return false;
          
          const wasActive = this.activeTabId === id;
          const tabKeys = Array.from(this.tabs.keys());
          const currentIndex = tabKeys.indexOf(id);

          this.tabs.delete(id);
          this.attachedChildViews.delete(id);

          // If last tab closed, auto-spawn a new blank tab
          if (this.tabs.size === 0) {
            await this.api.tabs.create('about:blank');
            return true;
          }

          if (wasActive) {
            // Activate neighbor
            const nextIndex = Math.min(currentIndex, this.tabs.size - 1);
            const nextId = Array.from(this.tabs.keys())[nextIndex];
            await this.api.tabs.switch(nextId);
          } else {
            this.broadcastTabsUpdated();
          }

          return true;
        },

        navigate: async (id, targetUrl) => {
          if (!this.tabs.has(id)) return false;
          const record = this.tabs.get(id);
          record.state.isLoading = true;
          this.broadcastTabsUpdated();

          const resolved = this.resolveUrlOrSearch(targetUrl, this.settings.defaultSearchEngine);
          
          // Truncate forward history if navigating from middle
          record.history = record.history.slice(0, record.historyIndex + 1);
          record.history.push(resolved.url);
          record.historyIndex = record.history.length - 1;

          record.state.url = resolved.url;
          record.state.title = this.deriveTitleFromUrl(resolved.url);
          record.state.faviconUrl = resolved.url.startsWith('http') ? `${new URL(resolved.url).origin}/favicon.ico` : undefined;
          record.state.canGoBack = record.historyIndex > 0;
          record.state.canGoForward = false;
          record.state.isLoading = false;

          this.recordHistory(record.state.url, record.state.title);
          this.broadcastTabsUpdated();
          return true;
        },

        reload: async (id) => {
          if (!this.tabs.has(id)) return false;
          const record = this.tabs.get(id);
          record.state.isLoading = true;
          this.broadcastTabsUpdated();

          // Emulate reload completion
          record.state.isLoading = false;
          record.state.isCrashed = false;
          this.broadcastTabsUpdated();
          return true;
        },

        goBack: async (id) => {
          if (!this.tabs.has(id)) return false;
          const record = this.tabs.get(id);
          if (record.historyIndex <= 0) return false;

          record.historyIndex -= 1;
          const url = record.history[record.historyIndex];
          record.state.url = url;
          record.state.title = this.deriveTitleFromUrl(url);
          record.state.canGoBack = record.historyIndex > 0;
          record.state.canGoForward = record.historyIndex < record.history.length - 1;

          this.broadcastTabsUpdated();
          return true;
        },

        goForward: async (id) => {
          if (!this.tabs.has(id)) return false;
          const record = this.tabs.get(id);
          if (record.historyIndex >= record.history.length - 1) return false;

          record.historyIndex += 1;
          const url = record.history[record.historyIndex];
          record.state.url = url;
          record.state.title = this.deriveTitleFromUrl(url);
          record.state.canGoBack = record.historyIndex > 0;
          record.state.canGoForward = record.historyIndex < record.history.length - 1;

          this.broadcastTabsUpdated();
          return true;
        },

        setBounds: (bounds) => {
          this.bounds = { ...bounds };
        },

        onTabsUpdated: (callback) => {
          this.tabUpdateListeners.add(callback);
          // Initial trigger
          callback(this.getTabsList(), this.activeTabId);
          return () => this.tabUpdateListeners.delete(callback);
        }
      },

      agent: {
        sendPrompt: async (prompt, context, includeScreenshot = false) => {
          const runId = `run-${Math.random().toString(36).substring(2, 9)}`;
          this.activeRunId = runId;
          this.agentCancelled = false;

          // Dispatch initial action
          this.emitActionEvent({
            runId,
            stage: 'planning',
            message: `Analyzing prompt: "${prompt.substring(0, 30)}..."`,
            progressPercent: 10
          });

          // Simulate streaming chunks asynchronously
          setTimeout(() => {
            if (this.agentCancelled) return;
            this.emitStreamChunk(`Thinking through query: ${prompt}\n\n`);
            this.emitActionEvent({
              runId,
              stage: 'reading',
              message: 'Extracting page insights...',
              progressPercent: 40
            });
          }, 10);

          setTimeout(() => {
            if (this.agentCancelled) return;
            this.emitStreamChunk('Here is the synthesized analysis based on in-page context and reasoning.');
            this.emitActionEvent({
              runId,
              stage: 'complete',
              message: 'Response generation finished.',
              progressPercent: 100
            });
          }, 30);

          return { runId };
        },

        cancel: async () => {
          if (!this.activeRunId) return false;
          this.agentCancelled = true;
          this.emitActionEvent({
            runId: this.activeRunId,
            stage: 'error',
            message: 'User cancelled agent execution.'
          });
          this.activeRunId = null;
          return true;
        },

        researchQuery: async (query) => {
          const runId = `res-${Math.random().toString(36).substring(2, 9)}`;
          this.activeRunId = runId;
          this.agentCancelled = false;

          this.researchRuns.set(runId, {
            query,
            status: 'running',
            sources: [],
            backgroundTabsUsed: 0
          });

          // Stage 1: Planning
          this.emitActionEvent({
            runId,
            stage: 'planning',
            message: `Decomposing research query: "${query}"`,
            progressPercent: 15
          });

          // Stage 2: Searching via DuckDuckGo
          setTimeout(() => {
            if (this.agentCancelled) return;
            const searchResults = SAMPLE_SEARCH_RESULTS;
            this.emitActionEvent({
              runId,
              stage: 'searching',
              message: `Found ${searchResults.length} source candidates via search`,
              sources: searchResults,
              progressPercent: 35
            });

            // Stage 3: Reading / Harvesting background tabs
            setTimeout(() => {
              if (this.agentCancelled) return;
              this.emitActionEvent({
                runId,
                stage: 'reading',
                message: `Harvesting content from candidate pages`,
                currentUrl: searchResults[0].url,
                progressPercent: 70
              });

              // Stage 4: Synthesizing
              setTimeout(() => {
                if (this.agentCancelled) return;
                const synthesis = `### Research Synthesis: ${query}\n\n` +
                  `1. **Overview**: Based on multi-source background crawling, key insights were aggregated.\n` +
                  `2. **Findings**: Analyzed ${searchResults.length} primary references.\n\n` +
                  `*Sources Cited*:\n` + searchResults.map(s => `- [${s.title}](${s.url})`).join('\n');

                this.emitStreamChunk(synthesis);
                this.emitActionEvent({
                  runId,
                  stage: 'complete',
                  message: 'Multi-step research complete.',
                  sources: searchResults,
                  progressPercent: 100
                });

                const resRecord = this.researchRuns.get(runId);
                if (resRecord) {
                  resRecord.status = 'complete';
                  resRecord.sources = searchResults;
                }
              }, 30);
            }, 20);
          }, 15);

          return { runId };
        },

        onStreamChunk: (callback) => {
          this.streamChunkListeners.add(callback);
          return () => this.streamChunkListeners.delete(callback);
        },

        onActionEvent: (callback) => {
          this.actionEventListeners.add(callback);
          return () => this.actionEventListeners.delete(callback);
        }
      },

      context: {
        captureActivePage: async (includeScreenshot = true) => {
          if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
            throw new Error('No active tab to capture');
          }
          const tab = this.tabs.get(this.activeTabId);
          const rawHtml = tab.htmlContent || SAMPLE_HTML_SIMPLE;
          const readable = this.extractReadableText(rawHtml);

          return {
            url: tab.state.url,
            title: tab.state.title,
            selectedText: '',
            readableText: readable,
            metaDescription: 'Captured in-page context metadata',
            screenshotBase64: includeScreenshot ? MOCK_JPEG_BASE64 : undefined
          };
        }
      },

      settings: {
        get: async () => {
          return { ...this.settings };
        },
        save: async (newSettings) => {
          this.settings = { ...this.settings, ...newSettings };
          return true;
        }
      }
    };
  }

  // -------------------------------------------------------------
  // Omnibox URL / Search Resolver Algorithm
  // -------------------------------------------------------------
  resolveUrlOrSearch(input, defaultEngine = 'google') {
    if (!input || typeof input !== 'string') {
      return { type: 'blank', url: 'about:blank' };
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return { type: 'blank', url: 'about:blank' };
    }

    // Omnibox @ai or ? trigger
    if (trimmed.startsWith('@ai') || trimmed.startsWith('?')) {
      const prompt = trimmed.startsWith('@ai') 
        ? trimmed.replace(/^@ai\s*/, '') 
        : trimmed.replace(/^\?\s*/, '');
      return { type: 'ai', prompt: prompt.trim() };
    }

    // Check explicit protocol
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.startsWith('about:')) {
      return { type: 'url', url: trimmed };
    }

    // Domain regex: matches e.g. "github.com", "sub.domain.co.uk/path?query=1", "localhost:3000", or IPv4
    const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/;
    const localhostRegex = /^localhost(?::\d+)?(?:\/.*)?$/;
    const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/;

    if (domainRegex.test(trimmed) || localhostRegex.test(trimmed) || ipv4Regex.test(trimmed)) {
      return { type: 'url', url: `https://${trimmed}` };
    }

    // Search query
    const encoded = encodeURIComponent(trimmed);
    const searchUrl = defaultEngine === 'duckduckgo'
      ? `https://duckduckgo.com/html/?q=${encoded}`
      : `https://www.google.com/search?q=${encoded}`;

    return { type: 'search', url: searchUrl, query: trimmed };
  }

  // -------------------------------------------------------------
  // Live DOM Reader & Sanitization (Truncated to 40k chars)
  // -------------------------------------------------------------
  extractReadableText(html) {
    if (!html || typeof html !== 'string') return '';

    // Fast bounds protection for massive synthetic or dumped DOMs (>500KB)
    // 500KB is vastly larger than needed to extract 40,000 clean text characters
    let input = html;
    if (input.length > 500000) {
      input = input.substring(0, 500000);
    }

    // Remove scripts, styles, svg, noscript, iframes, nav, footer, header, aside
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');

    // Strip remaining tags
    let textOnly = sanitized.replace(/<[^>]+>/g, ' ');

    // Normalize multiple whitespaces
    textOnly = textOnly.replace(/\s+/g, ' ').trim();

    // Enforce 40,000 characters truncation limit as specified in PROJECT.md
    if (textOnly.length > THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS) {
      textOnly = textOnly.substring(0, THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
    }

    return textOnly;
  }

  // -------------------------------------------------------------
  // Background Research Tab Pool (Isolated & Muted)
  // -------------------------------------------------------------
  async openBackgroundResearchTab(url) {
    if (this.backgroundTabs.size >= THEME_CONSTANTS.MAX_BACKGROUND_TABS) {
      throw new Error(`Background tab limit (${THEME_CONSTANTS.MAX_BACKGROUND_TABS}) exceeded`);
    }

    const bgId = `bg-${Math.random().toString(36).substring(2, 9)}`;
    const bgTab = {
      id: bgId,
      url,
      partition: 'persist:warwick-research-isolated',
      isMuted: true, // Non-disruptive audio muting
      isAttachedToWindow: false, // Never attached to visible hierarchy
      neverStealsFocus: true,
      createdAt: Date.now()
    };

    this.backgroundTabs.set(bgId, bgTab);
    return bgTab;
  }

  closeBackgroundResearchTab(bgId) {
    return this.backgroundTabs.delete(bgId);
  }

  // -------------------------------------------------------------
  // Keyboard Shortcut Handler
  // -------------------------------------------------------------
  async handleKeyboardShortcut(combination) {
    if (!combination || typeof combination !== 'string') return false;
    switch (combination.toLowerCase().trim()) {
      case 'ctrl+t':
      case 'cmd+t':
        return await this.api.tabs.create('about:blank');

      case 'ctrl+w':
      case 'cmd+w':
        if (this.activeTabId) {
          return await this.api.tabs.close(this.activeTabId);
        }
        return false;

      case 'ctrl+tab': {
        const tabKeys = Array.from(this.tabs.keys());
        if (tabKeys.length <= 1) return true;
        const currentIndex = tabKeys.indexOf(this.activeTabId);
        const nextIndex = (currentIndex + 1) % tabKeys.length;
        return await this.api.tabs.switch(tabKeys[nextIndex]);
      }

      case 'ctrl+shift+tab': {
        const tabKeys = Array.from(this.tabs.keys());
        if (tabKeys.length <= 1) return true;
        const currentIndex = tabKeys.indexOf(this.activeTabId);
        const prevIndex = (currentIndex - 1 + tabKeys.length) % tabKeys.length;
        return await this.api.tabs.switch(tabKeys[prevIndex]);
      }

      case 'ctrl+k':
      case 'cmd+k':
      case 'ctrl+l':
      case 'cmd+l':
        this.omniboxFocused = true;
        return true;

      case 'ctrl+j':
      case 'cmd+j':
        this.isAIDrawerOpen = !this.isAIDrawerOpen;
        // Recalculate view bounds when drawer opens/closes
        this.recalculateBounds();
        return this.isAIDrawerOpen;

      case 'ctrl+r':
      case 'cmd+r':
      case 'f5':
        if (this.activeTabId) {
          return await this.api.tabs.reload(this.activeTabId);
        }
        return false;

      case 'alt+left':
      case 'cmd+left':
        if (this.activeTabId) {
          return await this.api.tabs.goBack(this.activeTabId);
        }
        return false;

      case 'alt+right':
      case 'cmd+right':
        if (this.activeTabId) {
          return await this.api.tabs.goForward(this.activeTabId);
        }
        return false;

      case 'ctrl+,':
      case 'cmd+,':
        this.isSettingsModalOpen = !this.isSettingsModalOpen;
        return true;

      default:
        return false;
    }
  }

  // -------------------------------------------------------------
  // UI & Layout Calculation
  // -------------------------------------------------------------
  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.recalculateBounds();
    return this.isSidebarCollapsed;
  }

  recalculateBounds() {
    const sidebarWidth = this.isSidebarCollapsed 
      ? THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH 
      : THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH;
    const aiWidth = this.isAIDrawerOpen ? this.settings.aiPanelWidth : 0;

    this.bounds = {
      x: sidebarWidth,
      y: 44,
      width: Math.max(0, this.options.width - sidebarWidth - aiWidth),
      height: Math.max(0, this.options.height - 44)
    };
    this.api.tabs.setBounds(this.bounds);
  }

  // -------------------------------------------------------------
  // Helpers & Listeners
  // -------------------------------------------------------------
  getTabsList() {
    return Array.from(this.tabs.values()).map(t => ({ ...t.state }));
  }

  getActiveTab() {
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) return null;
    return { ...this.tabs.get(this.activeTabId).state };
  }

  setTabHtml(tabId, html) {
    if (this.tabs.has(tabId)) {
      this.tabs.get(tabId).htmlContent = html;
    }
  }

  recordHistory(url, title) {
    if (url && url !== 'about:blank') {
      this.history.unshift({ url, title, visitedAt: Date.now() });
      if (this.history.length > 500) this.history.pop();
    }
  }

  deriveTitleFromUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '') || 'New Tab';
    } catch {
      return url || 'New Tab';
    }
  }

  broadcastTabsUpdated() {
    const list = this.getTabsList();
    for (const listener of this.tabUpdateListeners) {
      listener(list, this.activeTabId);
    }
  }

  emitStreamChunk(chunk) {
    for (const listener of this.streamChunkListeners) {
      listener(chunk);
    }
  }

  emitActionEvent(event) {
    for (const listener of this.actionEventListeners) {
      listener(event);
    }
  }
}
