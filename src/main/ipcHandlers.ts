import { ipcMain, BrowserWindow } from 'electron';
import type { TabManager } from './tabManager';
import { AntigravityBridge } from './antigravityBridge';
import type { StorageService } from './storageService';
import type { FunnelAutopsyService } from './funnelAutopsy';
import { extractActivePageContext, captureActivePageScreenshot } from './pageContextExtractor';
import {
  IPC_CHANNELS,
  DEFAULT_APP_SETTINGS,
  normalizeThemeSettings,
  type AppSettings,
  type PageContext,
  type ViewBounds,
  type HistoryEntry,
  type BookmarkItem,
  type SessionData,
  type FunnelAutopsyRequest
} from '../shared/types';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  tabManager: TabManager,
  storageService?: StorageService | AntigravityBridge | null,
  antigravityBridge?: AntigravityBridge | null,
  funnelAutopsyService?: FunnelAutopsyService | null
): void {
  // Support polymorphic caller patterns:
  // 1. (win, tabManager, storageService, antigravityBridge) [M5 canonical]
  // 2. (win, tabManager, storageService)                   [M5 modular]
  // 3. (win, tabManager, antigravityBridge)               [Legacy M3/M4]
  // 4. (win, tabManager)                                  [Legacy M1/M2 stress]
  let actualStorage: StorageService | undefined;
  let actualBridge: AntigravityBridge | undefined;

  if (storageService && typeof (storageService as any).sendPrompt === 'function') {
    actualBridge = storageService as AntigravityBridge;
    actualStorage = undefined;
  } else {
    actualStorage = (storageService as StorageService) || undefined;
    actualBridge = (antigravityBridge as AntigravityBridge) || undefined;
  }

  // Resilient in-memory state fallbacks for headless test runners or missing storage
  let inMemorySettings: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    theme: normalizeThemeSettings(DEFAULT_APP_SETTINGS.theme)
  };
  if (actualStorage && typeof actualStorage.getSettings === 'function') {
    try {
      const stored = actualStorage.getSettings();
      if (stored && typeof stored === 'object') {
        inMemorySettings = {
          ...DEFAULT_APP_SETTINGS,
          ...stored,
          theme: normalizeThemeSettings(stored.theme)
        };
      }
    } catch (err) {
      console.warn('[IPC] Failed to read settings from storageService, using defaults:', err);
    }
  }

  const currentSettings = inMemorySettings;
  const bridge = actualBridge ?? new AntigravityBridge(mainWindow, currentSettings);

  let inMemoryHistory: HistoryEntry[] = [];
  let inMemoryBookmarks: BookmarkItem[] = [];
  // Tab Management IPCs
  ipcMain.handle(IPC_CHANNELS.TABS_CREATE, async (_event, url?: string, options?: { active?: boolean }) => {
    return tabManager.createTab(url, options ?? { active: true });
  });

  ipcMain.handle(IPC_CHANNELS.TABS_SWITCH, async (_event, id: string) => {
    return tabManager.switchTab(id);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_CLOSE, async (_event, id: string) => {
    return tabManager.closeTab(id);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_NAVIGATE, async (_event, id: string, url: string) => {
    return tabManager.navigate(id, url);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_RELOAD, async (_event, id: string) => {
    return tabManager.reload(id);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_GO_BACK, async (_event, id: string) => {
    return tabManager.goBack(id);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_GO_FORWARD, async (_event, id: string) => {
    return tabManager.goForward(id);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_SET_PINNED, async (_event, id: string, pinned: boolean) => {
    return tabManager.setTabPinned(id, pinned);
  });

  ipcMain.handle(IPC_CHANNELS.TABS_SET_MUTED, async (_event, id: string, muted: boolean) => {
    return tabManager.setTabMuted(id, muted);
  });

  // Layout Bounds Sync IPC (one-way dispatch)
  ipcMain.on(IPC_CHANNELS.TABS_SET_BOUNDS, (_event, bounds: unknown) => {
    if (!bounds || typeof bounds !== 'object') {
      return;
    }
    try {
      tabManager.setBounds(bounds as Partial<ViewBounds>);
    } catch (err) {
      console.error('Failed to set bounds from IPC:', err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.TABS_SET_VISIBLE, async (_event, visible: boolean) => {
    tabManager.setViewsVisible(Boolean(visible));
    return true;
  });

  // Window Frame Control IPCs (defensively guarded with optional chaining)
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (!mainWindow?.isDestroyed?.()) mainWindow?.minimize?.();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (!mainWindow?.isDestroyed?.()) {
      if (mainWindow?.isMaximized?.()) {
        mainWindow?.unmaximize?.();
      } else {
        mainWindow?.maximize?.();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (!mainWindow?.isDestroyed?.()) mainWindow?.close?.();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    return Boolean(!mainWindow?.isDestroyed?.() && mainWindow?.isMaximized?.());
  });

  // Agent IPC Handlers
  ipcMain.handle(IPC_CHANNELS.AGENT_SEND_PROMPT, async (_event, prompt: string, context?: PageContext, includeScreenshot?: boolean) => {
    return bridge.sendPrompt(prompt, context, includeScreenshot);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    return bridge.cancel();
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_RESEARCH_QUERY, async (_event, query: string) => {
    return bridge.researchQuery(query);
  });

  // Page Context Handlers
  ipcMain.handle(IPC_CHANNELS.CONTEXT_CAPTURE_ACTIVE_PAGE, async (_event, includeScreenshot?: boolean): Promise<PageContext> => {
    return extractActivePageContext(tabManager, { includeScreenshot: Boolean(includeScreenshot) });
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_READ_PAGE, async (): Promise<PageContext> => {
    return extractActivePageContext(tabManager, { includeScreenshot: false });
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_TAKE_SCREENSHOT, async (): Promise<string | undefined> => {
    return captureActivePageScreenshot(tabManager, 80);
  });

  // Settings IPC Handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    if (actualStorage && typeof actualStorage.getSettings === 'function') {
      try {
        const s = actualStorage.getSettings();
        if (s && typeof s === 'object') {
          return { ...s, theme: normalizeThemeSettings(s.theme) };
        }
      } catch (err) {
        console.warn('[IPC] storageService.getSettings() failed, falling back to in-memory:', err);
      }
    }
    return { ...inMemorySettings, theme: normalizeThemeSettings(inMemorySettings.theme) };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, newSettings: Partial<AppSettings>): Promise<boolean> => {
    if (!newSettings || typeof newSettings !== 'object') {
      return false;
    }

    if (actualStorage && typeof actualStorage.saveSettings === 'function') {
      try {
        await actualStorage.saveSettings(newSettings);
      } catch (err) {
        console.warn('[IPC] storageService.saveSettings() failed:', err);
      }
    }

    inMemorySettings = {
      ...inMemorySettings,
      ...newSettings,
      theme:
        newSettings.theme !== undefined
          ? normalizeThemeSettings(newSettings.theme)
          : normalizeThemeSettings(inMemorySettings.theme)
    };

    if (bridge && typeof bridge.updateSettings === 'function') {
      try {
        bridge.updateSettings(newSettings);
      } catch (err) {
        console.warn('[IPC] bridge.updateSettings() failed:', err);
      }
    }

    if (newSettings.defaultSearchEngine && typeof tabManager?.setSearchEngine === 'function') {
      tabManager.setSearchEngine(newSettings.defaultSearchEngine);
    }
    return true;
  });

  // History IPC Handlers (Feature 25)
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, async (): Promise<HistoryEntry[]> => {
    if (actualStorage && typeof actualStorage.getHistory === 'function') {
      try {
        const hist = actualStorage.getHistory();
        return Array.isArray(hist) ? hist : [];
      } catch (err) {
        console.warn('[IPC] storageService.getHistory() failed:', err);
      }
    }
    return [...inMemoryHistory];
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, async (): Promise<boolean> => {
    inMemoryHistory = [];
    if (actualStorage && typeof actualStorage.clearHistory === 'function') {
      try {
        return await actualStorage.clearHistory();
      } catch (err) {
        console.warn('[IPC] storageService.clearHistory() failed:', err);
        return false;
      }
    }
    return true;
  });

  // Bookmarks IPC Handlers (Feature 25)
  ipcMain.handle(IPC_CHANNELS.BOOKMARKS_GET, async (): Promise<BookmarkItem[]> => {
    if (actualStorage && typeof actualStorage.getBookmarks === 'function') {
      try {
        const bms = actualStorage.getBookmarks();
        return Array.isArray(bms) ? bms : [];
      } catch (err) {
        console.warn('[IPC] storageService.getBookmarks() failed:', err);
      }
    }
    return [...inMemoryBookmarks];
  });

  ipcMain.handle(IPC_CHANNELS.BOOKMARKS_ADD, async (_event, item: { url: string; title: string; faviconUrl?: string }): Promise<BookmarkItem> => {
    if (actualStorage && typeof actualStorage.addBookmark === 'function') {
      try {
        return await actualStorage.addBookmark(item);
      } catch (err) {
        console.warn('[IPC] storageService.addBookmark() failed:', err);
      }
    }
    // In-memory fallback
    const targetUrl = item?.url || '';
    const existing = inMemoryBookmarks.find((b) => b.url === targetUrl);
    if (existing) {
      existing.title = item?.title || existing.title;
      existing.faviconUrl = item?.faviconUrl || existing.faviconUrl;
      return { ...existing };
    }
    const bookmark: BookmarkItem = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url: targetUrl,
      title: item?.title || targetUrl,
      faviconUrl: item?.faviconUrl,
      createdAt: Date.now()
    };
    inMemoryBookmarks.unshift(bookmark);
    return bookmark;
  });

  ipcMain.handle(IPC_CHANNELS.BOOKMARKS_REMOVE, async (_event, idOrUrl: string): Promise<boolean> => {
    if (actualStorage && typeof actualStorage.removeBookmark === 'function') {
      try {
        return await actualStorage.removeBookmark(idOrUrl);
      } catch (err) {
        console.warn('[IPC] storageService.removeBookmark() failed:', err);
      }
    }
    const prevLen = inMemoryBookmarks.length;
    inMemoryBookmarks = inMemoryBookmarks.filter((b) => b.id !== idOrUrl && b.url !== idOrUrl);
    return inMemoryBookmarks.length !== prevLen;
  });

  // Session IPC Handlers (Feature 25)
  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (): Promise<SessionData | null> => {
    if (actualStorage && typeof actualStorage.getSession === 'function') {
      try {
        return actualStorage.getSession();
      } catch (err) {
        console.warn('[IPC] storageService.getSession() failed:', err);
      }
    }
    return null;
  });

  // Funnel Autopsy IPC Handlers
  if (funnelAutopsyService) {
    ipcMain.handle(
      IPC_CHANNELS.FUNNEL_AUTOPSY_START,
      async (_event, request: FunnelAutopsyRequest) => funnelAutopsyService.start(request)
    );

    ipcMain.handle(IPC_CHANNELS.FUNNEL_AUTOPSY_CANCEL, async (_event, runId: string) => {
      return funnelAutopsyService.cancel(runId);
    });

    ipcMain.handle(IPC_CHANNELS.FUNNEL_AUTOPSY_GET_REPORT, async (_event, runId: string) => {
      return funnelAutopsyService.getReport(runId);
    });
  } else {
    ipcMain.handle(IPC_CHANNELS.FUNNEL_AUTOPSY_START, async () => {
      throw new Error('Funnel Autopsy service is not available.');
    });
    ipcMain.handle(IPC_CHANNELS.FUNNEL_AUTOPSY_CANCEL, async () => false);
    ipcMain.handle(IPC_CHANNELS.FUNNEL_AUTOPSY_GET_REPORT, async () => null);
  }
}
