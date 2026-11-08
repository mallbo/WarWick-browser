import { contextBridge, ipcRenderer } from 'electron';
import type {
  WarwickApi,
  TabState,
  PageContext,
  ResearchStep,
  AppSettings,
  ViewBounds,
  HistoryEntry,
  BookmarkItem,
  SessionData
} from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';

const warwickApi: WarwickApi = {
  tabs: {
    create: (url?: string, options?: { active?: boolean }): Promise<TabState> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_CREATE, url, options);
    },
    switch: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_SWITCH, id);
    },
    close: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_CLOSE, id);
    },
    navigate: (id: string, url: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_NAVIGATE, id, url);
    },
    reload: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_RELOAD, id);
    },
    goBack: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_GO_BACK, id);
    },
    goForward: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_GO_FORWARD, id);
    },
    setPinned: (id: string, pinned: boolean): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_SET_PINNED, id, pinned);
    },
    setMuted: (id: string, muted: boolean): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_SET_MUTED, id, muted);
    },
    setBounds: (bounds: ViewBounds): void => {
      ipcRenderer.send(IPC_CHANNELS.TABS_SET_BOUNDS, bounds);
    },
    setVisible: (visible: boolean): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TABS_SET_VISIBLE, visible);
    },
    onTabsUpdated: (callback: (tabs: TabState[], activeId: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tabs: TabState[], activeId: string) => {
        callback(tabs, activeId);
      };
      ipcRenderer.on(IPC_CHANNELS.TABS_UPDATED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TABS_UPDATED, listener);
      };
    }
  },

  agent: {
    sendPrompt: (
      prompt: string,
      context?: PageContext,
      includeScreenshot?: boolean
    ): Promise<{ runId: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_PROMPT, prompt, context, includeScreenshot);
    },
    cancel: (): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL);
    },
    researchQuery: (query: string): Promise<{ runId: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_RESEARCH_QUERY, query);
    },
    onStreamChunk: (callback: (chunk: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: string) => {
        callback(chunk);
      };
      ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM_CHUNK, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM_CHUNK, listener);
      };
    },
    onActionEvent: (callback: (step: ResearchStep) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, step: ResearchStep) => {
        callback(step);
      };
      ipcRenderer.on(IPC_CHANNELS.AGENT_ACTION_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AGENT_ACTION_EVENT, listener);
      };
    }
  },

  context: {
    captureActivePage: (includeScreenshot?: boolean): Promise<PageContext> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_CAPTURE_ACTIVE_PAGE, includeScreenshot);
    },
    readPage: (): Promise<PageContext> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_READ_PAGE);
    },
    takeScreenshot: (): Promise<string | undefined> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_TAKE_SCREENSHOT);
    }
  },

  settings: {
    get: (): Promise<AppSettings> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET);
    },
    save: (settings: Partial<AppSettings>): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings);
    }
  },

  history: {
    get: (): Promise<HistoryEntry[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET);
    },
    clear: (): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR);
    }
  },

  bookmarks: {
    get: (): Promise<BookmarkItem[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_GET);
    },
    add: (item: { url: string; title: string; faviconUrl?: string }): Promise<BookmarkItem> => {
      return ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_ADD, item);
    },
    remove: (idOrUrl: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_REMOVE, idOrUrl);
    }
  },

  session: {
    get: (): Promise<SessionData | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET);
    }
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  },

  shortcuts: {
    onFocusOmnibox: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on('shortcuts:focus-omnibox', listener);
      return () => {
        ipcRenderer.removeListener('shortcuts:focus-omnibox', listener);
      };
    },
    onToggleAiDrawer: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on('shortcuts:toggle-ai-drawer', listener);
      return () => {
        ipcRenderer.removeListener('shortcuts:toggle-ai-drawer', listener);
      };
    },
    onOpenSettings: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on('shortcuts:open-settings', listener);
      return () => {
        ipcRenderer.removeListener('shortcuts:open-settings', listener);
      };
    }
  }
};

contextBridge.exposeInMainWorld('warwickApi', warwickApi);
