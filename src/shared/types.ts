/**
 * WarWick Browser Shared Types & IPC Contracts
 * Conforms to PROJECT.md § Interface Contracts
 */

export interface TabState {
  id: string;
  url: string;
  title: string;
  faviconUrl?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isMuted: boolean;
  isPinned: boolean;
  isCrashed: boolean;
  createdAt: number;
}

export interface PageContext {
  url: string;
  title: string;
  selectedText: string;
  readableText: string;
  canonicalUrl?: string;
  metaDescription?: string;
  screenshotBase64?: string;
}

export type ResearchStage =
  | 'planning'
  | 'searching'
  | 'reading'
  | 'synthesizing'
  | 'complete'
  | 'error';

export interface ResearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ResearchStep {
  runId: string;
  stage: ResearchStage;
  message: string;
  sources?: ResearchSource[];
  currentUrl?: string;
  progressPercent?: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

export type AiProvider = 'antigravity-local' | 'gemini-api';

// ---------------------------------------------------------------------------
// Theme & Appearance
// ---------------------------------------------------------------------------

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ThemeBackground = 'warm-black' | 'graphite' | 'espresso' | 'slate';
export type ThemeIntensity = 'soft' | 'balanced' | 'bold';
export type ThemeDensity = 'comfortable' | 'compact';

export interface ThemeSettings {
  /** Dark, light, or follow the operating system. */
  mode: ThemeMode;
  /** Six-digit hex accent colour. */
  accent: string;
  /** Human-readable accent label shown in the settings panel. */
  accentName: string;
  /** Background family used by the chrome. */
  background: ThemeBackground;
  /** How strongly the accent tints surfaces, borders and chips. */
  intensity: ThemeIntensity;
  /** Comfortable or compact row / control spacing. */
  density: ThemeDensity;
}

export interface ThemeAccentPreset {
  id: 'wolf-gold' | 'honey' | 'copper' | 'sage' | 'sky' | 'rose';
  name: string;
  hex: string;
}

export interface ThemeBackgroundOption {
  id: ThemeBackground;
  name: string;
  dark: string;
  light: string;
}

export const THEME_ACCENT_PRESETS: ThemeAccentPreset[] = [
  { id: 'wolf-gold', name: 'Wolf Gold', hex: '#F2B632' },
  { id: 'honey', name: 'Honey', hex: '#F2C14E' },
  { id: 'copper', name: 'Copper', hex: '#D98F4E' },
  { id: 'sage', name: 'Sage', hex: '#9FB18F' },
  { id: 'sky', name: 'Sky', hex: '#8FA8C7' },
  { id: 'rose', name: 'Rose', hex: '#C98F92' }
];

export const THEME_BACKGROUND_OPTIONS: ThemeBackgroundOption[] = [
  { id: 'warm-black', name: 'Warm Black', dark: '#121009', light: '#F3EFE6' },
  { id: 'graphite', name: 'Graphite', dark: '#0F1113', light: '#EEF1F3' },
  { id: 'espresso', name: 'Espresso', dark: '#14100C', light: '#F5EEE6' },
  { id: 'slate', name: 'Slate', dark: '#101214', light: '#EEF0F2' }
];

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'dark',
  accent: '#F2B632',
  accentName: 'Wolf Gold',
  background: 'warm-black',
  intensity: 'balanced',
  density: 'comfortable'
};

/**
 * Backwards-compatible normalizer. Settings files created before the theme
 * engine existed do not contain a `theme` object at all; partial or malformed
 * theme objects are repaired field-by-field so the renderer always receives a
 * complete, valid ThemeSettings object.
 */
export function normalizeThemeSettings(theme?: Partial<ThemeSettings> | null): ThemeSettings {
  if (!theme || typeof theme !== 'object') {
    return { ...DEFAULT_THEME };
  }

  const mode: ThemeMode =
    theme.mode === 'dark' || theme.mode === 'light' || theme.mode === 'auto'
      ? theme.mode
      : DEFAULT_THEME.mode;

  const accent =
    typeof theme.accent === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accent)
      ? theme.accent
      : DEFAULT_THEME.accent;

  const accentName =
    typeof theme.accentName === 'string' && theme.accentName.trim().length > 0
      ? theme.accentName
      : DEFAULT_THEME.accentName;

  const background: ThemeBackground = THEME_BACKGROUND_OPTIONS.some(
    (option) => option.id === theme.background
  )
    ? (theme.background as ThemeBackground)
    : DEFAULT_THEME.background;

  const intensity: ThemeIntensity =
    theme.intensity === 'soft' || theme.intensity === 'balanced' || theme.intensity === 'bold'
      ? theme.intensity
      : DEFAULT_THEME.intensity;

  const density: ThemeDensity =
    theme.density === 'comfortable' || theme.density === 'compact'
      ? theme.density
      : DEFAULT_THEME.density;

  return { mode, accent, accentName, background, intensity, density };
}

export interface AppSettings {
  aiProvider?: AiProvider;
  geminiApiKey: string;
  /** Model used by the local Antigravity CLI (agy). */
  aiModel?: string;
  /** Model used by the direct Google Gemini API provider. */
  geminiApiModel?: string;
  defaultSearchEngine: 'google' | 'duckduckgo';
  sidebarCollapsed: boolean;
  aiPanelWidth: number;
  mcpServers: McpServerConfig[];
  /** User-selected appearance. Always normalized before use. */
  theme?: ThemeSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aiProvider: 'antigravity-local',
  geminiApiKey: '',
  aiModel: 'gemini-3.8-flash-high',
  geminiApiModel: 'gemini-2.0-flash',
  defaultSearchEngine: 'google',
  sidebarCollapsed: false,
  aiPanelWidth: 360,
  mcpServers: [],
  theme: { ...DEFAULT_THEME }
};

/**
 * Session partitions used by the main process.
 * Keep these in one place so the privacy shield can attach to the exact
 * partitions that tabs and the background researcher actually use.
 */
export const SESSION_PARTITIONS = {
  BROWSING: 'persist:warwick-browsing',
  RESEARCH: 'persist:warwick-research-isolated'
} as const;

export const THEME_CONSTANTS = {
  APP_BG: '#111113',
  SIDEBAR_BG: '#151518',
  SURFACE_BG: '#1a1a1f',
  ACCENT_AMBER: '#d97706',
  // Backwards-compatible alias: the product accent is amber now.
  ACCENT_EMERALD: '#d97706',
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 800,
  SIDEBAR_EXPANDED_WIDTH: 240,
  SIDEBAR_COLLAPSED_WIDTH: 52,
  MAX_PAGE_TEXT_CHARS: 40000,
  DEFAULT_RESEARCH_TIMEOUT_MS: 15000,
  MAX_BACKGROUND_TABS: 5,
} as const;

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WarwickTabsApi {
  create: (url?: string, options?: { active?: boolean }) => Promise<TabState>;
  switch: (id: string) => Promise<boolean>;
  close: (id: string) => Promise<boolean>;
  navigate: (id: string, url: string) => Promise<boolean>;
  reload: (id: string) => Promise<boolean>;
  goBack: (id: string) => Promise<boolean>;
  goForward: (id: string) => Promise<boolean>;
  setPinned: (id: string, pinned: boolean) => Promise<boolean>;
  setMuted: (id: string, muted: boolean) => Promise<boolean>;
  setBounds: (bounds: ViewBounds) => void;
  setVisible?: (visible: boolean) => Promise<boolean>;
  onTabsUpdated: (callback: (tabs: TabState[], activeId: string) => void) => () => void;
}

export interface WarwickAgentApi {
  sendPrompt: (prompt: string, context?: PageContext, includeScreenshot?: boolean) => Promise<{ runId: string }>;
  cancel: () => Promise<boolean>;
  researchQuery: (query: string) => Promise<{ runId: string }>;
  onStreamChunk: (callback: (chunk: string) => void) => () => void;
  onActionEvent: (callback: (step: ResearchStep) => void) => () => void;
}

export interface WarwickContextApi {
  captureActivePage: (includeScreenshot?: boolean) => Promise<PageContext>;
  readPage: () => Promise<PageContext>;
  takeScreenshot: () => Promise<string | undefined>;
}

export interface WarwickSettingsApi {
  get: () => Promise<AppSettings>;
  save: (settings: Partial<AppSettings>) => Promise<boolean>;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  faviconUrl?: string;
}

export interface SessionTab {
  id: string;
  url: string;
  title: string;
  isPinned?: boolean;
}

export interface SessionData {
  tabs: SessionTab[];
  activeTabId?: string;
  lastSavedAt: number;
}

export interface WarwickHistoryApi {
  get: () => Promise<HistoryEntry[]>;
  clear: () => Promise<boolean>;
}

export interface WarwickBookmarksApi {
  get: () => Promise<BookmarkItem[]>;
  add: (bookmark: { url: string; title: string; faviconUrl?: string }) => Promise<BookmarkItem>;
  remove: (idOrUrl: string) => Promise<boolean>;
}

export interface WarwickSessionApi {
  get: () => Promise<SessionData | null>;
}

export interface WarwickWindowApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

export interface WarwickShortcutsApi {
  onFocusOmnibox: (callback: () => void) => () => void;
  onToggleAiDrawer: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
}

export interface WarwickApi {
  tabs: WarwickTabsApi;
  agent: WarwickAgentApi;
  context: WarwickContextApi;
  settings: WarwickSettingsApi;
  history?: WarwickHistoryApi;
  bookmarks?: WarwickBookmarksApi;
  session?: WarwickSessionApi;
  window?: WarwickWindowApi;
  shortcuts?: WarwickShortcutsApi;
}

export const IPC_CHANNELS = {
  // Tabs
  TABS_CREATE: 'tabs:create',
  TABS_SWITCH: 'tabs:switch',
  TABS_CLOSE: 'tabs:close',
  TABS_NAVIGATE: 'tabs:navigate',
  TABS_RELOAD: 'tabs:reload',
  TABS_GO_BACK: 'tabs:go-back',
  TABS_GO_FORWARD: 'tabs:go-forward',
  TABS_SET_PINNED: 'tabs:set-pinned',
  TABS_SET_MUTED: 'tabs:set-muted',
  TABS_SET_BOUNDS: 'tabs:set-bounds',
  TABS_SET_VISIBLE: 'tabs:set-visible',
  TABS_UPDATED: 'tabs:updated',

  // Agent
  AGENT_SEND_PROMPT: 'agent:send-prompt',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_RESEARCH_QUERY: 'agent:research-query',
  AGENT_STREAM_CHUNK: 'agent:stream-chunk',
  AGENT_ACTION_EVENT: 'agent:action-event',

  // In-Page Context
  CONTEXT_CAPTURE_ACTIVE_PAGE: 'context:capture-active-page',
  CONTEXT_READ_PAGE: 'context:read-page',
  CONTEXT_TAKE_SCREENSHOT: 'context:take-screenshot',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // History & Bookmarks & Session
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  BOOKMARKS_GET: 'bookmarks:get',
  BOOKMARKS_ADD: 'bookmarks:add',
  BOOKMARKS_REMOVE: 'bookmarks:remove',
  SESSION_GET: 'session:get',

  // Window Controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
} as const;

// Global Window augmentation
declare global {
  interface Window {
    warwickApi: WarwickApi;
  }
}
