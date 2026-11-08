import { BrowserWindow, WebContentsView, type Rectangle } from 'electron';
import crypto from 'node:crypto';
import type { TabState, ViewBounds } from '../shared/types';
import { IPC_CHANNELS, SESSION_PARTITIONS as SHARED_SESSION_PARTITIONS } from '../shared/types';
import type { StorageService } from './storageService';

// Local fallback keeps the module usable in the legacy challenge harness,
// which mocks ../shared/types with only IPC_CHANNELS and THEME_CONSTANTS.
const SESSION_PARTITIONS = SHARED_SESSION_PARTITIONS || {
  BROWSING: 'persist:warwick-browsing',
  RESEARCH: 'persist:warwick-research-isolated'
};

export interface TabItem {
  id: string;
  view: WebContentsView;
  state: TabState;
  cleanupListeners?: () => void;
}

export class TabManager {
  private mainWindow: BrowserWindow;
  private storageService?: StorageService;
  private tabs: Map<string, TabItem> = new Map();
  private activeTabId: string | null = null;
  private defaultSearchEngine: 'google' | 'duckduckgo' = 'google';

  // Baseline initial bounds (Sidebar 240px, Omnibox 48px)
  private currentBounds: Rectangle = { x: 240, y: 48, width: 1040, height: 752 };
  private containerOffsets = { top: 48, left: 240, right: 0, bottom: 0 };

  constructor(mainWindow: BrowserWindow, storageService?: StorageService) {
    this.mainWindow = mainWindow;
    this.storageService = storageService;
    if (storageService) {
      this.defaultSearchEngine = storageService.getSettings().defaultSearchEngine || 'google';
    }
    this.setupWindowListeners();
  }

  public setSearchEngine(engine: 'google' | 'duckduckgo'): void {
    this.defaultSearchEngine = engine;
  }

  private buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query);
    if (this.defaultSearchEngine === 'duckduckgo') {
      return `https://duckduckgo.com/html/?q=${encoded}`;
    }
    return `https://www.google.com/search?q=${encoded}`;
  }

  private setupWindowListeners(): void {
    // Zero-latency native resize synchronization
    this.mainWindow.on('resize', () => {
      this.handleWindowResize();
    });
  }

  private handleWindowResize(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed?.()) return;
    const [winWidth, winHeight] = this.mainWindow.getContentSize();
    const newWidth = Math.max(0, winWidth - this.containerOffsets.left - this.containerOffsets.right);
    const newHeight = Math.max(0, winHeight - this.containerOffsets.top - this.containerOffsets.bottom);

    this.currentBounds = {
      x: this.containerOffsets.left,
      y: this.containerOffsets.top,
      width: newWidth,
      height: newHeight
    };

    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.view?.webContents && !activeTab.view.webContents.isDestroyed?.()) {
      try {
        activeTab.view.setBounds(this.currentBounds);
      } catch {}
    }
  }

  public setBounds(bounds?: Partial<ViewBounds> | null): void {
    if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
      return;
    }

    const sanitized: Rectangle = {
      x: Math.max(0, Math.round(Number(bounds.x) || 0)),
      y: Math.max(0, Math.round(Number(bounds.y) || 0)),
      width: Math.max(0, Math.round(Number(bounds.width) || 0)),
      height: Math.max(0, Math.round(Number(bounds.height) || 0))
    };

    this.currentBounds = sanitized;

    if (this.mainWindow && !this.mainWindow.isDestroyed?.()) {
      const [winWidth, winHeight] = this.mainWindow.getContentSize();
      this.containerOffsets = {
        left: sanitized.x,
        top: sanitized.y,
        right: Math.max(0, winWidth - (sanitized.x + sanitized.width)),
        bottom: Math.max(0, winHeight - (sanitized.y + sanitized.height))
      };
    }

    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.view?.webContents && !activeTab.view.webContents.isDestroyed?.()) {
      try {
        activeTab.view.setBounds(sanitized);
      } catch {}
    }
  }

  public setViewsVisible(visible: boolean): void {
    const activeTab = this.getActiveTab();
    if (activeTab?.view) {
      try {
        activeTab.view.setVisible(visible);
      } catch (err) {
        console.warn('Failed to set WebContentsView visibility:', err);
      }
    }
  }

  private deriveInitialTitle(url: string): string {
    if (!url || url === 'about:blank' || url.startsWith('warwick://')) return 'WarWick AI Browser';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '') || 'New Tab';
    } catch {
      return 'New Tab';
    }
  }

  private deriveInitialFavicon(url: string): string | undefined {
    if (!url || !url.startsWith('http')) return undefined;
    try {
      const parsed = new URL(url);
      return `${parsed.origin}/favicon.ico`;
    } catch {
      return undefined;
    }
  }

  public createTab(
    url?: string,
    options: { active?: boolean; id?: string; isPinned?: boolean } = { active: true }
  ): TabState {
    const id = options.id || crypto.randomUUID();
    // A brand-new tab starts on the internal marketing/home surface instead of
    // a remote search page. This keeps the first paint instant and private.
    const rawUrl = url?.trim() || 'about:blank';
    const targetUrl = this.resolveNavigationUrl(rawUrl) || rawUrl;

    const view = new WebContentsView({
      webPreferences: {
        partition: SESSION_PARTITIONS.BROWSING,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true
      }
    });

    // Dark zinc background to prevent white flashing
    view.setBackgroundColor('#121009');

    // For about:blank or start pages, keep native view hidden so React canvas is visible
    const isStartUrl = !targetUrl || targetUrl === 'about:blank' || targetUrl.startsWith('warwick://');
    try {
      view.setVisible(!isStartUrl);
    } catch {}

    const state: TabState = {
      id,
      url: targetUrl,
      title: this.deriveInitialTitle(targetUrl),
      faviconUrl: this.deriveInitialFavicon(targetUrl),
      isLoading: targetUrl !== 'about:blank',
      canGoBack: false,
      canGoForward: false,
      isMuted: false,
      isPinned: Boolean(options.isPinned),
      isCrashed: false,
      createdAt: Date.now()
    };

    const wc = view.webContents;
    const registeredListeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];

    const addTrackedListener = (event: string, fn: (...args: any[]) => void) => {
      wc.on(event as any, fn);
      registeredListeners.push({ event, fn });
    };

    addTrackedListener('did-start-loading', () => {
      state.isLoading = true;
      state.isCrashed = false;
      this.broadcastTabs();
    });

    addTrackedListener('did-stop-loading', () => {
      state.isLoading = false;
      state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
      state.url = wc.getURL();
      this.broadcastTabs();
    });

    addTrackedListener('page-title-updated', (_event: any, title: string) => {
      state.title = title || 'Untitled';
      if (state.url && state.url !== 'about:blank' && !state.url.startsWith('about:')) {
        this.storageService?.recordHistory(state.url, state.title);
      }
      this.broadcastTabs();
      this.saveSession();
    });

    addTrackedListener('page-favicon-updated', (_event: any, favicons: string[]) => {
      if (favicons && favicons.length > 0) {
        state.faviconUrl = favicons[0];
        this.broadcastTabs();
      }
    });

    addTrackedListener('did-navigate', (_event: any, navUrl: string) => {
      state.url = navUrl;
      state.isCrashed = false;
      state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
      if (navUrl && navUrl !== 'about:blank' && !navUrl.startsWith('about:')) {
        this.storageService?.recordHistory(navUrl, state.title);
      }
      this.broadcastTabs();
      this.saveSession();
    });

    addTrackedListener('did-navigate-in-page', (_event: any, navUrl: string, isMainFrame: boolean) => {
      if (isMainFrame) {
        state.url = navUrl;
        state.isCrashed = false;
        state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
        state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
        if (navUrl && navUrl !== 'about:blank' && !navUrl.startsWith('about:')) {
          this.storageService?.recordHistory(navUrl, state.title);
        }
        this.broadcastTabs();
        this.saveSession();
      }
    });

    addTrackedListener('render-process-gone', () => {
      state.isCrashed = true;
      state.isLoading = false;
      this.broadcastTabs();
      this.saveSession();
    });

    // Feature 26: Intercept browser shortcuts on child WebContentsView
    addTrackedListener('before-input-event', (event: any, input: any) => {
      if (input.type !== 'keyDown') return;

      const isMod = input.control || input.meta;
      const key = (input.key || '').toLowerCase();
      const code = input.code || '';

      // 1. Ctrl+T: New tab
      if (isMod && !input.shift && !input.alt && (key === 't' || code === 'KeyT')) {
        event.preventDefault();
        this.createTab(undefined, { active: true });
        return;
      }

      // 2. Ctrl+W: Close active tab
      if (isMod && !input.shift && !input.alt && (key === 'w' || code === 'KeyW')) {
        event.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
        return;
      }

      // 3. Ctrl+Tab / Ctrl+Shift+Tab: Tab cycle
      if (isMod && !input.alt && (key === 'tab' || code === 'Tab')) {
        event.preventDefault();
        this.cycleTab(input.shift ? -1 : 1);
        return;
      }

      // 4. Ctrl+K or Ctrl+L: Focus Omnibox
      if (isMod && !input.shift && !input.alt && (key === 'k' || code === 'KeyK' || key === 'l' || code === 'KeyL')) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send('shortcuts:focus-omnibox');
          this.mainWindow.focus();
        } catch {}
        return;
      }

      // 5. Ctrl+J: Toggle WarWick AI Drawer
      if (isMod && !input.shift && !input.alt && (key === 'j' || code === 'KeyJ')) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send('shortcuts:toggle-ai-drawer');
        } catch {}
        return;
      }

      // 5b. Ctrl+Shift+F: Toggle Funnel Autopsy
      if (isMod && input.shift && !input.alt && (key === 'f' || code === 'KeyF')) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send('shortcuts:toggle-funnel-autopsy');
        } catch {}
        return;
      }

      // 6. Ctrl+R or F5: Reload active tab
      if ((isMod && !input.shift && !input.alt && (key === 'r' || code === 'KeyR')) ||
          (!isMod && !input.shift && !input.alt && (key === 'f5' || code === 'F5'))) {
        event.preventDefault();
        if (this.activeTabId) this.reload(this.activeTabId);
        return;
      }

      // 7. Alt+Left / Alt+Right: Navigation back / forward
      if (input.alt && !isMod && (key === 'arrowleft' || code === 'ArrowLeft')) {
        event.preventDefault();
        if (this.activeTabId) this.goBack(this.activeTabId);
        return;
      }
      if (input.alt && !isMod && (key === 'arrowright' || code === 'ArrowRight')) {
        event.preventDefault();
        if (this.activeTabId) this.goForward(this.activeTabId);
        return;
      }

      // 8. Ctrl+,: Open Settings Modal
      if (isMod && !input.shift && !input.alt && (key === ',' || code === 'Comma')) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send('shortcuts:open-settings');
        } catch {}
        return;
      }
    });

    const cleanupListeners = () => {
      for (const { event, fn } of registeredListeners) {
        try {
          if (wc && !wc.isDestroyed?.()) {
            wc.removeListener(event as any, fn);
          }
        } catch {}
      }
      try {
        if (wc && !wc.isDestroyed?.()) {
          wc.removeAllListeners('did-start-loading');
          wc.removeAllListeners('did-stop-loading');
          wc.removeAllListeners('page-title-updated');
          wc.removeAllListeners('page-favicon-updated');
          wc.removeAllListeners('did-navigate');
          wc.removeAllListeners('did-navigate-in-page');
          wc.removeAllListeners('render-process-gone');
          wc.removeAllListeners('before-input-event');
        }
      } catch {}
      registeredListeners.length = 0;
    };

    // Redirect popups and window.open to new browser tabs
    wc.setWindowOpenHandler(({ url: openUrl, disposition }) => {
      const shouldBeActive = disposition !== 'background-tab';
      this.createTab(openUrl, { active: shouldBeActive });
      return { action: 'deny' };
    });

    wc.loadURL(targetUrl).catch(() => {});

    if (targetUrl && targetUrl !== 'about:blank' && !targetUrl.startsWith('about:')) {
      this.storageService?.recordHistory(targetUrl, state.title);
    }

    const tabItem: TabItem = { id, view, state, cleanupListeners };
    this.tabs.set(id, tabItem);

    if (options.active) {
      this.switchTab(id);
    } else {
      this.broadcastTabs();
    }

    this.saveSession();
    return state;
  }

  public switchTab(id: string): boolean {
    if (!this.tabs.has(id)) return false;
    if (this.activeTabId === id) return true;

    // Detach previous active view
    if (this.activeTabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab && currentTab.view?.webContents && !currentTab.view.webContents.isDestroyed?.()) {
        try {
          this.mainWindow.contentView.removeChildView(currentTab.view);
        } catch {}
      } else if (currentTab?.view) {
        try {
          this.mainWindow.contentView.removeChildView(currentTab.view);
        } catch {}
      }
    }

    // Attach target active view
    const nextTab = this.tabs.get(id);
    if (!nextTab) return false;

    // Detach all existing child views to prevent view stacking
    for (const child of this.mainWindow.contentView.children) {
      if (child !== nextTab.view) {
        try {
          this.mainWindow.contentView.removeChildView(child);
        } catch {}
      }
    }

    this.activeTabId = id;
    const isNextStartUrl = !nextTab.state.url || nextTab.state.url === 'about:blank' || nextTab.state.url.startsWith('warwick://');
    try {
      this.mainWindow.contentView.addChildView(nextTab.view);
      nextTab.view.setBounds(this.currentBounds);
      try {
        nextTab.view.setVisible(!isNextStartUrl);
      } catch {}
      if (!isNextStartUrl && nextTab.view?.webContents && !nextTab.view.webContents.isDestroyed?.()) {
        nextTab.view.webContents.focus();
      }
    } catch (e) {
      console.error('Failed to attach active WebContentsView:', e);
      return false;
    }

    this.broadcastTabs();
    this.saveSession();
    return true;
  }

  public cycleTab(direction: 1 | -1): boolean {
    const allIds = Array.from(this.tabs.keys());
    if (allIds.length <= 1) return true;
    const currentIndex = this.activeTabId ? allIds.indexOf(this.activeTabId) : 0;
    const nextIndex = (currentIndex + direction + allIds.length) % allIds.length;
    return this.switchTab(allIds[nextIndex]);
  }

  public closeTab(id: string): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem) return false;

    const allIds = Array.from(this.tabs.keys());
    const closingIndex = allIds.indexOf(id);
    const wasActive = this.activeTabId === id;

    // Detach if attached
    if (wasActive) {
      try {
        this.mainWindow.contentView.removeChildView(tabItem.view);
      } catch {}
    }

    // Always clean up event listeners to release memory closures
    try {
      tabItem.cleanupListeners?.();
    } catch {}

    // Release native Chromium render process if still valid
    if (tabItem.view?.webContents && !tabItem.view.webContents.isDestroyed?.()) {
      try {
        tabItem.view.webContents.close();
      } catch {}
    }

    this.tabs.delete(id);

    // If no tabs remain, unconditionally spawn a default active tab
    if (this.tabs.size === 0) {
      this.activeTabId = null;
      this.createTab(undefined, { active: true });
      this.saveSession();
      return true;
    }

    // Pick adjacent tab if closing active tab
    if (wasActive) {
      const remainingIds = Array.from(this.tabs.keys());
      const nextIndex = Math.min(closingIndex, remainingIds.length - 1);
      this.switchTab(remainingIds[nextIndex]);
    } else {
      this.broadcastTabs();
    }

    this.saveSession();
    return true;
  }

  public resolveNavigationUrl(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // 1. Direct about: schemes
    if (trimmed === 'about:' || trimmed === 'about:blank') {
      return 'about:blank';
    }
    if (trimmed.startsWith('about:')) {
      return trimmed;
    }

    // 2. Explicit protocol schemes (http://, https://, file://, ws://, wss://, ftp://, etc.)
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      const rest = schemeMatch[2].trim();

      // Incomplete schemes: e.g. "http://", "https://" with empty or slash-only target
      if (!rest || (rest === '/' && scheme !== 'file')) {
        return this.buildSearchUrl(trimmed);
      }

      if (scheme === 'file') {
        return trimmed;
      }

      return trimmed;
    }

    // 3. Multi-word queries containing whitespace -> Dynamic Search Engine
    if (/\s/.test(trimmed)) {
      return this.buildSearchUrl(trimmed);
    }

    // 4. IPv4 address with optional port and path (e.g. 127.0.0.1, 127.0.0.1:8080)
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?::\d+)?(?:\/.*)?$/;
    if (ipv4Pattern.test(trimmed)) {
      return `http://${trimmed}`;
    }

    // 5. Localhost with optional port and path (e.g. localhost, localhost:3000)
    const localhostPattern = /^localhost(?::\d+)?(?:\/.*)?$/i;
    if (localhostPattern.test(trimmed)) {
      return `http://${trimmed}`;
    }

    // 6. Intranet host with port (e.g. corp-server:8080, dev-server:3000/app)
    const intranetWithPortPattern = /^[a-zA-Z0-9_-]+:\d+(?:\/.*)?$/;
    if (intranetWithPortPattern.test(trimmed)) {
      return `http://${trimmed}`;
    }

    // 7. Standard domain names with valid TLD (e.g. github.com, example.org/docs)
    const standardDomainPattern = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/;
    if (standardDomainPattern.test(trimmed)) {
      return `https://${trimmed}`;
    }

    // 8. Fallback: single non-URL terms -> Dynamic Search Engine
    return this.buildSearchUrl(trimmed);
  }

  public navigate(id: string, input: string): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;

    const targetUrl = this.resolveNavigationUrl(input);
    if (!targetUrl) return false;

    const isStartUrl = targetUrl === 'about:blank' || targetUrl.startsWith('warwick://');
    try {
      tabItem.view.setVisible(!isStartUrl);
    } catch {}

    tabItem.state.isCrashed = false;
    tabItem.view.webContents.loadURL(targetUrl).catch((err) => {
      console.error('Tab navigation error:', err);
    });
    return true;
  }

  public reload(id: string): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    tabItem.state.isCrashed = false;
    tabItem.state.isLoading = true;
    this.broadcastTabs();
    tabItem.view.webContents.reload();
    return true;
  }

  public setTabMuted(id: string, muted: boolean): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    tabItem.state.isMuted = muted;
    try {
      tabItem.view.webContents.setAudioMuted(muted);
    } catch {}
    this.broadcastTabs();
    return true;
  }

  public setTabPinned(id: string, pinned: boolean): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem) return false;
    tabItem.state.isPinned = pinned;
    this.broadcastTabs();
    this.saveSession();
    return true;
  }

  public saveSession(): void {
    if (!this.storageService) return;
    const tabList = Array.from(this.tabs.values()).map((t) => t.state);
    this.storageService.saveSession(tabList, this.activeTabId || undefined);
  }

  public goBack(id: string): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    const wc = tabItem.view.webContents;
    const canBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
    if (canBack) {
      if (wc.navigationHistory?.goBack) {
        wc.navigationHistory.goBack();
      } else {
        wc.goBack();
      }
      return true;
    }
    return false;
  }

  public goForward(id: string): boolean {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    const wc = tabItem.view.webContents;
    const canForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
    if (canForward) {
      if (wc.navigationHistory?.goForward) {
        wc.navigationHistory.goForward();
      } else {
        wc.goForward();
      }
      return true;
    }
    return false;
  }

  public getActiveTab(): TabItem | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  public getTab(id: string): TabItem | null {
    return this.tabs.get(id) || null;
  }

  public getAllTabs(): TabState[] {
    return Array.from(this.tabs.values()).map((t) => t.state);
  }

  public getActiveTabId(): string | null {
    return this.activeTabId;
  }

  private broadcastTabs(): void {
    if (
      !this.mainWindow ||
      this.mainWindow.isDestroyed?.() ||
      !this.mainWindow.webContents ||
      this.mainWindow.webContents.isDestroyed?.()
    ) {
      return;
    }
    try {
      const tabsList = this.getAllTabs();
      this.mainWindow.webContents.send?.(IPC_CHANNELS.TABS_UPDATED, tabsList, this.activeTabId || '');
    } catch {}
  }

  public destroyAll(): void {
    for (const tab of this.tabs.values()) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view);
      } catch {}
      try {
        tab.cleanupListeners?.();
      } catch {}
      if (tab.view?.webContents && !tab.view.webContents.isDestroyed?.()) {
        try {
          tab.view.webContents.close();
        } catch {}
      }
    }
    this.tabs.clear();
    this.activeTabId = null;
  }
}
