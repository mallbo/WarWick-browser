import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import crypto from 'node:crypto';
import {
  DEFAULT_APP_SETTINGS,
  normalizeThemeSettings,
  type AppSettings,
  type HistoryEntry,
  type BookmarkItem,
  type SessionData,
  type SessionTab,
  type TabState
} from '../shared/types';

/**
 * Atomic JSON write with retry and fallback for Windows file locking.
 */
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const content = JSON.stringify(data, null, 2);

  await fsp.writeFile(tempPath, content, 'utf8');

  let renamed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fsp.rename(tempPath, filePath);
      renamed = true;
      break;
    } catch (e: any) {
      if (attempt === 4 || (e.code !== 'EPERM' && e.code !== 'EBUSY')) {
        // Fallback: direct write
        try {
          await fsp.writeFile(filePath, content, 'utf8');
          await fsp.unlink(tempPath).catch(() => {});
          renamed = true;
          break;
        } catch (fallbackErr) {
          await fsp.unlink(tempPath).catch(() => {});
          throw fallbackErr;
        }
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }

  if (!renamed) {
    await fsp.unlink(tempPath).catch(() => {});
  }
}

/**
 * Safe JSON reader that validates schema and falls back to default if file is missing, empty, corrupt, or invalid.
 */
async function readJsonSafe<T>(
  filePath: string,
  defaultValue: T,
  validator?: (data: unknown) => boolean
): Promise<T> {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = await fsp.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return defaultValue;
    }
    const parsed = JSON.parse(content);
    if (validator && !validator(parsed)) {
      console.warn(`[StorageService] Schema validation failed for ${filePath}, using fallback default.`);
      return defaultValue;
    }
    return parsed as T;
  } catch (err) {
    console.warn(`[StorageService] Failed to read ${filePath}, returning default:`, err);
    return defaultValue;
  }
}

const SAFE_SECRET_PREFIX = 'safe:';

/**
 * Encrypts a secret with Electron's OS-backed safeStorage when available.
 * Falls back to plaintext only when the platform has no keyring (some Linux
 * setups) or in unit-test mocks that do not provide safeStorage.
 */
function encryptSecret(value: string): string {
  if (!value) return '';
  try {
    if (safeStorage?.isEncryptionAvailable?.()) {
      return SAFE_SECRET_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
  } catch (err) {
    console.warn('[StorageService] safeStorage encryption unavailable:', err);
  }
  return value;
}

function decryptSecret(value: string): string {
  if (typeof value !== 'string' || !value) return '';
  if (!value.startsWith(SAFE_SECRET_PREFIX)) return value;

  try {
    if (safeStorage?.isEncryptionAvailable?.()) {
      return safeStorage.decryptString(
        Buffer.from(value.slice(SAFE_SECRET_PREFIX.length), 'base64')
      );
    }
  } catch (err) {
    console.warn('[StorageService] Could not decrypt stored API key:', err);
  }
  return '';
}

export class StorageService {
  private userDataDir: string;
  private settingsPath: string;
  private historyPath: string;
  private bookmarksPath: string;
  private sessionPath: string;

  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  private history: HistoryEntry[] = [];
  private bookmarks: BookmarkItem[] = [];
  private session: SessionData | null = null;

  private saveSettingsTimer: NodeJS.Timeout | null = null;
  private saveHistoryTimer: NodeJS.Timeout | null = null;
  private saveBookmarksTimer: NodeJS.Timeout | null = null;
  private saveSessionTimer: NodeJS.Timeout | null = null;

  constructor(customDir?: string) {
    try {
      this.userDataDir = customDir || (app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.userData'));
    } catch {
      this.userDataDir = path.join(process.cwd(), '.userData');
    }

    this.settingsPath = path.join(this.userDataDir, 'settings.json');
    this.historyPath = path.join(this.userDataDir, 'history.json');
    this.bookmarksPath = path.join(this.userDataDir, 'bookmarks.json');
    this.sessionPath = path.join(this.userDataDir, 'session.json');
  }

  public async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        await fsp.mkdir(this.userDataDir, { recursive: true });
      }

      // Settings: ensure non-null object, not an array, and merged with defaults
      const rawSettings = await readJsonSafe<unknown>(
        this.settingsPath,
        DEFAULT_APP_SETTINGS,
        (d) => Boolean(d && typeof d === 'object' && !Array.isArray(d))
      );
      this.settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings))
        ? {
            ...DEFAULT_APP_SETTINGS,
            ...(rawSettings as Partial<AppSettings>),
            theme: normalizeThemeSettings((rawSettings as Partial<AppSettings>).theme)
          }
        : { ...DEFAULT_APP_SETTINGS, theme: normalizeThemeSettings(DEFAULT_APP_SETTINGS.theme) };
      if (!Array.isArray(this.settings.mcpServers)) {
        this.settings.mcpServers = [];
      }
      // Transparently decrypt keys saved by newer builds and keep legacy
      // plaintext keys working.
      this.settings.geminiApiKey = decryptSecret(this.settings.geminiApiKey || '');

      // History: ensure array of valid objects with string url
      const rawHistory = await readJsonSafe<unknown>(
        this.historyPath,
        [],
        (d) => Array.isArray(d)
      );
      this.history = Array.isArray(rawHistory)
        ? (rawHistory.filter((item) => item && typeof item === 'object' && typeof (item as any).url === 'string') as HistoryEntry[])
        : [];
      if (this.history.length > 500) {
        this.history = this.history.slice(0, 500);
      }

      // Bookmarks: ensure array of valid objects with string url
      const rawBookmarks = await readJsonSafe<unknown>(
        this.bookmarksPath,
        [],
        (d) => Array.isArray(d)
      );
      this.bookmarks = Array.isArray(rawBookmarks)
        ? (rawBookmarks.filter((item) => item && typeof item === 'object' && typeof (item as any).url === 'string') as BookmarkItem[])
        : [];

      // Session: ensure object with valid tabs array
      const rawSession = await readJsonSafe<unknown>(
        this.sessionPath,
        null,
        (d) => d === null || (typeof d === 'object' && !Array.isArray(d))
      );
      if (rawSession && typeof rawSession === 'object' && !Array.isArray(rawSession)) {
        const sessionObj = rawSession as Record<string, unknown>;
        const rawTabs = sessionObj.tabs;
        const validTabs: SessionTab[] = Array.isArray(rawTabs)
          ? rawTabs
              .filter((t) => t && typeof t === 'object' && typeof (t as any).url === 'string')
              .map((t: any) => ({
                id: typeof t.id === 'string' ? t.id : crypto.randomUUID(),
                url: String(t.url),
                title: typeof t.title === 'string' ? t.title : String(t.url),
                isPinned: Boolean(t.isPinned)
              }))
          : [];

        this.session = {
          tabs: validTabs,
          activeTabId: typeof sessionObj.activeTabId === 'string' ? sessionObj.activeTabId : undefined,
          lastSavedAt: typeof sessionObj.lastSavedAt === 'number' ? sessionObj.lastSavedAt : Date.now()
        };
      } else {
        this.session = null;
      }
    } catch (err) {
      console.error('[StorageService] Error during initialization:', err);
      this.settings = {
        ...DEFAULT_APP_SETTINGS,
        theme: normalizeThemeSettings(DEFAULT_APP_SETTINGS.theme)
      };
      this.history = [];
      this.bookmarks = [];
      this.session = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Settings Management (Feature 27)
  // ---------------------------------------------------------------------------

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public async saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = {
      ...this.settings,
      ...partial,
      theme:
        partial.theme !== undefined
          ? normalizeThemeSettings(partial.theme)
          : normalizeThemeSettings(this.settings.theme)
    };
    if (!Array.isArray(this.settings.mcpServers)) {
      this.settings.mcpServers = [];
    }
    this.scheduleSaveSettings();
    return { ...this.settings };
  }

  private serializeSettings(): AppSettings {
    return {
      ...this.settings,
      geminiApiKey: encryptSecret(this.settings.geminiApiKey || '')
    };
  }

  private scheduleSaveSettings(): void {
    if (this.saveSettingsTimer) clearTimeout(this.saveSettingsTimer);
    this.saveSettingsTimer = setTimeout(async () => {
      try {
        await writeJsonAtomic(this.settingsPath, this.serializeSettings());
      } catch (err) {
        console.error('[StorageService] Failed to persist settings.json:', err);
      }
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // History Management (Feature 25)
  // ---------------------------------------------------------------------------

  public getHistory(): HistoryEntry[] {
    return Array.isArray(this.history) ? [...this.history] : [];
  }

  public recordHistory(url?: string | null, title?: string | null): void {
    if (!Array.isArray(this.history)) {
      this.history = [];
    }
    if (!url || typeof url !== 'string') return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl || trimmedUrl === 'about:blank' || trimmedUrl.startsWith('about:')) return;

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      url: trimmedUrl,
      title: (title && typeof title === 'string' && title.trim()) ? title.trim() : trimmedUrl,
      visitedAt: Date.now()
    };

    // Newest visited URLs placed at front of history (F25-3)
    this.history.unshift(entry);

    // Limit history size to max bounds of 500 entries (F25-5, B25-5)
    if (this.history.length > 500) {
      this.history = this.history.slice(0, 500);
    }

    this.scheduleSaveHistory();
  }

  public addHistory(urlOrItem?: string | { url: string; title?: string } | null, title?: string | null): void {
    if (!urlOrItem) return;
    if (typeof urlOrItem === 'object') {
      return this.recordHistory(urlOrItem.url, urlOrItem.title ?? title);
    }
    return this.recordHistory(urlOrItem, title);
  }

  public async clearHistory(): Promise<boolean> {
    this.history = [];
    if (this.saveHistoryTimer) {
      clearTimeout(this.saveHistoryTimer);
      this.saveHistoryTimer = null;
    }
    try {
      await writeJsonAtomic(this.historyPath, []);
      return true;
    } catch (err) {
      console.error('[StorageService] Failed to clear history.json:', err);
      return false;
    }
  }

  private scheduleSaveHistory(): void {
    if (this.saveHistoryTimer) clearTimeout(this.saveHistoryTimer);
    this.saveHistoryTimer = setTimeout(async () => {
      try {
        await writeJsonAtomic(this.historyPath, Array.isArray(this.history) ? this.history : []);
      } catch (err) {
        console.error('[StorageService] Failed to persist history.json:', err);
      }
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Bookmarks Management (Feature 25)
  // ---------------------------------------------------------------------------

  public getBookmarks(): BookmarkItem[] {
    return Array.isArray(this.bookmarks) ? [...this.bookmarks] : [];
  }

  public async addBookmark(item: { url: string; title: string; faviconUrl?: string }): Promise<BookmarkItem> {
    if (!Array.isArray(this.bookmarks)) {
      this.bookmarks = [];
    }
    if (!item || typeof item !== 'object' || !item.url || typeof item.url !== 'string') {
      throw new Error('Invalid bookmark item: url is required');
    }

    const trimmedUrl = item.url.trim();
    const existing = this.bookmarks.find((b) => b && b.url === trimmedUrl);
    if (existing) {
      existing.title = (item.title && typeof item.title === 'string' && item.title.trim()) ? item.title.trim() : existing.title;
      existing.faviconUrl = item.faviconUrl || existing.faviconUrl;
      this.scheduleSaveBookmarks();
      return { ...existing };
    }

    const bookmark: BookmarkItem = {
      id: crypto.randomUUID(),
      url: trimmedUrl,
      title: (item.title && typeof item.title === 'string' && item.title.trim()) ? item.title.trim() : trimmedUrl,
      faviconUrl: item.faviconUrl,
      createdAt: Date.now()
    };

    this.bookmarks.unshift(bookmark);
    this.scheduleSaveBookmarks();
    return bookmark;
  }

  public async removeBookmark(idOrUrl: string): Promise<boolean> {
    if (!Array.isArray(this.bookmarks)) {
      this.bookmarks = [];
      return false;
    }
    if (!idOrUrl || typeof idOrUrl !== 'string') return false;
    const beforeLen = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter((b) => b && b.id !== idOrUrl && b.url !== idOrUrl);
    if (this.bookmarks.length !== beforeLen) {
      this.scheduleSaveBookmarks();
      return true;
    }
    return false;
  }

  private scheduleSaveBookmarks(): void {
    if (this.saveBookmarksTimer) clearTimeout(this.saveBookmarksTimer);
    this.saveBookmarksTimer = setTimeout(async () => {
      try {
        await writeJsonAtomic(this.bookmarksPath, Array.isArray(this.bookmarks) ? this.bookmarks : []);
      } catch (err) {
        console.error('[StorageService] Failed to persist bookmarks.json:', err);
      }
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // Session Persistence & Restore (Feature 25)
  // ---------------------------------------------------------------------------

  public getSession(): SessionData | null {
    if (!this.session || typeof this.session !== 'object') return null;
    return {
      tabs: Array.isArray(this.session.tabs) ? [...this.session.tabs] : [],
      activeTabId: typeof this.session.activeTabId === 'string' ? this.session.activeTabId : undefined,
      lastSavedAt: typeof this.session.lastSavedAt === 'number' ? this.session.lastSavedAt : Date.now()
    };
  }

  public saveSession(tabs: TabState[], activeTabId?: string): void {
    const rawTabs = Array.isArray(tabs) ? tabs : [];
    const validTabs: SessionTab[] = rawTabs
      .filter((t) => t && typeof t === 'object' && t.url && !t.isCrashed)
      .map((t) => ({
        id: String(t.id || crypto.randomUUID()),
        url: String(t.url),
        title: String(t.title || t.url),
        isPinned: Boolean(t.isPinned)
      }));

    this.session = {
      tabs: validTabs,
      activeTabId: typeof activeTabId === 'string' ? activeTabId : undefined,
      lastSavedAt: Date.now()
    };

    this.scheduleSaveSession();
  }

  private scheduleSaveSession(): void {
    if (this.saveSessionTimer) clearTimeout(this.saveSessionTimer);
    this.saveSessionTimer = setTimeout(async () => {
      try {
        if (this.session) {
          await writeJsonAtomic(this.sessionPath, this.session);
        }
      } catch (err) {
        console.error('[StorageService] Failed to persist session.json:', err);
      }
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // Synchronous Shutdown Flush (Parallel Execution)
  // ---------------------------------------------------------------------------

  public async flushAll(force = false): Promise<void> {
    const writes: Promise<void>[] = [];

    if (this.saveSettingsTimer || force) {
      if (this.saveSettingsTimer) {
        clearTimeout(this.saveSettingsTimer);
        this.saveSettingsTimer = null;
      }
      writes.push(writeJsonAtomic(this.settingsPath, this.serializeSettings()));
    }

    if (this.saveHistoryTimer || force) {
      if (this.saveHistoryTimer) {
        clearTimeout(this.saveHistoryTimer);
        this.saveHistoryTimer = null;
      }
      writes.push(writeJsonAtomic(this.historyPath, Array.isArray(this.history) ? this.history : []));
    }

    if (this.saveBookmarksTimer || force) {
      if (this.saveBookmarksTimer) {
        clearTimeout(this.saveBookmarksTimer);
        this.saveBookmarksTimer = null;
      }
      writes.push(writeJsonAtomic(this.bookmarksPath, Array.isArray(this.bookmarks) ? this.bookmarks : []));
    }

    if (this.saveSessionTimer || (force && this.session)) {
      if (this.saveSessionTimer) {
        clearTimeout(this.saveSessionTimer);
        this.saveSessionTimer = null;
      }
      if (this.session) {
        writes.push(writeJsonAtomic(this.sessionPath, this.session));
      }
    }

    if (writes.length > 0) {
      const results = await Promise.allSettled(writes);
      for (const res of results) {
        if (res.status === 'rejected') {
          console.error('[StorageService] Error during flushAll atomic write:', res.reason);
        }
      }
    }
  }
}
