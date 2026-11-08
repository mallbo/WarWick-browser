# Project: WarWick Browser

## Architecture

WarWick is an AI-powered desktop browser inspired by Strawberry Browser and Arc, built on Electron v34, React 19, TypeScript 5, and Tailwind CSS 4, utilizing `WebContentsView` for tab management and Antigravity as its embedded intelligence engine.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WarWick Electron Main Process                        │
│                                                                        │
│   ┌────────────────────┐   bounds   ┌──────────────────────────────┐   │
│   │    BaseWindow      │ ─────────> │   Tab & WebContentsView      │   │
│   │  (Native Container)│            │          Manager             │   │
│   └─────────┬──────────┘            └──────────────┬───────────────┘   │
│             │                                      │                   │
│             │ IPC Dispatch                         │ View Lifecycle    │
│             ▼                                      ▼                   │
│   ┌────────────────────┐            ┌──────────────────────────────┐   │
│   │    IPC Router      │            │  Active WebContentsView      │   │
│   │ (Tabs, AI, Browser)│            │  (User Browsing Session)     │   │
│   └─────────┬──────────┘            └──────────────────────────────┘   │
│             │                                      ▲                   │
│             ▼                                      │ DOM / Screenshot  │
│   ┌────────────────────┐   Agent Tools             │                   │
│   │ Antigravity Bridge │ ──────────────────────────┤                   │
│   │ (Gemini + MCP Host)│ ──────────────────────────┤                   │
│   └─────────┬──────────┘                           │ Background Tabs   │
│             │                                      ▼                   │
│             │                        ┌──────────────────────────────┐  │
│             └──────────────────────> │  Background Research Tab(s)  │  │
│                                      │  (Scraping & Harvesting)     │  │
│                                      └──────────────────────────────┘  │
└─────────────┼──────────────────────────────────────────────────────────┘
              │ Typed IPC via contextBridge
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│               WarWick React Renderer (UI Chrome)                       │
│                                                                        │
│   ┌──────────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│   │  Vertical Tab Strip  │  │  Top Omnibox   │  │   Antigravity    │   │
│   │   (Left Sidebar)     │  │ Navigation Bar │  │  Copilot Drawer  │   │
│   └──────────────────────┘  └────────────────┘  └──────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `BaseWindow` / Shell Creation | Spawns primary Electron window with custom frameless chrome, dark background `#121215` | M1 | survey_1 |
| 2 | Project Scaffolding & Build Pipeline | Configures Vite, Electron plugins, React 19, TypeScript strict checks, and Tailwind 4 | M1 | survey_3 |
| 3 | Native View Layout & Bounds Sync | Synchronizes React `#web-container` bounds with active `WebContentsView` via ResizeObserver + rAF | M1 | survey_3 |
| 4 | Preload & Typed IPC Bridge | Safe `contextBridge` exposing `window.warwickApi` (tabs, agent, context, settings) | M1 | survey_3 |
| 5 | Create Tab (`createTab`) | Allocates new `WebContentsView`, initializes listeners, handles default or custom URL | M2 | survey_1 |
| 6 | Switch Tab (`switchTab`) | Attaches active view via `addChildView`, detaches previous via `removeChildView`, updates bounds | M2 | survey_1 |
| 7 | Close Tab (`closeTab`) | Destroys specified `WebContentsView`, frees memory; auto-creates blank tab if last closed | M2 | survey_1 |
| 8 | Reload Tab (`reloadTab`) | Reloads current page content in the active `WebContentsView` | M2 | survey_1 |
| 9 | History Back / Forward | Navigates backward/forward in `WebContentsView` session history with boundary guards | M2 | survey_1 |
| 10 | Left Vertical Tab Strip | Arc/Strawberry-style vertical tabs with collapsible width (`240px` <-> `52px`), new tab button | M2 | survey_2 |
| 11 | Tab State Tracking & Favicons | Extracts title, favicon URL, loading state, crash state (`render-process-gone`) | M2 | survey_3 |
| 12 | Omnibox URL / Search Resolver | Smart address bar distinguishing valid URLs from search queries (Google/DuckDuckGo) | M2 | survey_1 |
| 13 | Omnibox `@ai` Trigger | Typing `@ai` or `?` in omnibox opens Antigravity sidebar with prompt prefilled | M2 | survey_2 |
| 14 | Live DOM Reader (`read_current_page`) | Script extracting clean readable text, headings, and metadata (truncating to 40k chars) | M3 | survey_1 |
| 15 | High-Res Screenshot Capture (`take_page_screenshot`) | Captures viewport snapshot via `webContents.capturePage()` as base64 JPEG | M3 | survey_3 |
| 16 | Antigravity Streaming Chat | Streams conversational turns from Gemini API (`@google/genai`) with Antigravity prompts | M3 | survey_3 |
| 17 | Live Agent Action Stream | Displays real-time thoughts and tool execution milestones ("Reading page...", "Searching...") | M3 | survey_2 |
| 18 | Quick Action Chips | One-click prompts ("Summarize active page", "Find key takeaways", "Extract data") | M3 | survey_1 |
| 19 | Local MCP Tool Connection | Connects to local MCP servers via `@modelcontextprotocol/sdk` and maps to Gemini tool schema | M3 | survey_1 |
| 20 | Web Search Tool (`perform_web_search`) | Queries DuckDuckGo static HTML endpoint without bot captchas to find candidate sources | M4 | survey_3 |
| 21 | Background Tab Harvester (`open_background_research_tab`) | Creates detached, audio-muted `WebContentsView` under isolated partition to scrape target pages | M4 | survey_3 |
| 22 | Multi-Step Research Orchestrator | Decomposes topic into queries, crawls candidate pages, extracts text, synthesizes report | M4 | survey_1 |
| 23 | Non-Disruptive Background Pool | Ensures background tabs never steal focus, mute audio, block popups/permissions | M4 | survey_3 |
| 24 | Theme & Branding Engine (OKLCH Dark Palette) | Modern dark charcoal theme (`#121215`, `#16161a`, `#1c1c22`) with emerald `#10b981` accents | M5 | survey_2 |
| 25 | Local Storage & History Persistence | Persists browsing history, bookmarks, session tabs, and settings to disk | M5 | survey_1 |
| 26 | Keyboard Shortcuts | Browser hotkeys: `Ctrl+T` (new tab), `Ctrl+W` (close tab), `Ctrl+K` (omnibox), `Ctrl+J` (toggle AI) | M5 | survey_1 |
| 27 | Settings & API Key Management | Modal/drawer to configure Gemini API Key, default search engine, and MCP servers | M5 | survey_3 |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Scaffolding & WebContentsView Runtime | Vite, Electron, React, TS, Tailwind config, BaseWindow, WebContentsView layout manager, typed IPC | none | DONE |
| M2 | Tab Navigation & Browser UI Chrome | TabManager (lifecycle, navigation, history), Arc-style vertical tabs, floating Omnibox | M1 | DONE |
| M3 | Antigravity AI Engine & In-Page Context | DOM text extractor, screenshot capture, Antigravity sidebar, Gemini API streaming, MCP bridge | M1, M2 | DONE |
| M4 | Autonomous Background Researcher Agent | Headless background WebContentsView pool, DuckDuckGo scraper, multi-step research synthesis | M1, M2, M3 | DONE |
| M5 | Settings, Persistence, Theme Polish & E2E Verification | Dark theme polish, bookmarks, history, settings modal, shortcuts, final 100% test pass | M1, M2, M3, M4 | DONE |

## Interface Contracts

### 1. IPC Channels (`MainProcess` ↔ `RendererProcess`)

```typescript
// Shared Data Types
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
  metaDescription?: string;
  screenshotBase64?: string;
}

export interface ResearchStep {
  runId: string;
  stage: 'planning' | 'searching' | 'reading' | 'synthesizing' | 'complete' | 'error';
  message: string;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  currentUrl?: string;
  progressPercent?: number;
}

export interface AppSettings {
  geminiApiKey: string;
  defaultSearchEngine: 'google' | 'duckduckgo';
  sidebarCollapsed: boolean;
  aiPanelWidth: number;
  mcpServers: Array<{ name: string; command: string; args: string[] }>;
}
```

### 2. Context Bridge (`window.warwickApi`)

```typescript
export interface WarwickApi {
  tabs: {
    create: (url?: string) => Promise<TabState>;
    switch: (id: string) => Promise<boolean>;
    close: (id: string) => Promise<boolean>;
    navigate: (id: string, url: string) => Promise<boolean>;
    reload: (id: string) => Promise<boolean>;
    goBack: (id: string) => Promise<boolean>;
    goForward: (id: string) => Promise<boolean>;
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
    onTabsUpdated: (callback: (tabs: TabState[], activeId: string) => void) => () => void;
  };
  agent: {
    sendPrompt: (prompt: string, context?: PageContext, includeScreenshot?: boolean) => Promise<{ runId: string }>;
    cancel: () => Promise<boolean>;
    researchQuery: (query: string) => Promise<{ runId: string }>;
    onStreamChunk: (callback: (chunk: string) => void) => () => void;
    onActionEvent: (callback: (step: ResearchStep) => void) => () => void;
  };
  context: {
    captureActivePage: (includeScreenshot?: boolean) => Promise<PageContext>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: Partial<AppSettings>) => Promise<boolean>;
  };
}
```

## Code Layout

```
warwick/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main/
│   │   ├── index.ts                # BaseWindow & lifecycle entry point
│   │   ├── tabManager.ts           # WebContentsView lifecycle & view attachment manager
│   │   ├── ipcHandlers.ts          # IPC channel registrations
│   │   ├── antigravityBridge.ts    # Gemini API streaming & MCP bridge
│   │   ├── backgroundResearcher.ts # Headless background scraper & multi-step researcher
│   │   └── pageContextExtractor.ts # In-page DOM reader & capturePage utility
│   ├── preload/
│   │   └── index.ts                # contextBridge exposing window.warwickApi
│   ├── renderer/
│   │   ├── main.tsx                # React entry
│   │   ├── App.tsx                 # Root layout (Sidebar, Omnibox, Content Viewport, AI Panel)
│   │   ├── components/
│   │   │   ├── Sidebar.tsx         # Arc/Strawberry-style vertical tabs
│   │   │   ├── Omnibox.tsx         # Floating address & command palette
│   │   │   ├── AntigravityDrawer.tsx # AI copilot drawer & action stream
│   │   │   ├── WebContainer.tsx    # Bounds synchronization placeholder for WebContentsView
│   │   │   └── SettingsModal.tsx   # Gemini API key & settings configuration
│   │   └── styles/
│   │       └── index.css           # Tailwind 4 & OKLCH theme tokens
│   └── shared/
│       └── types.ts                # Shared TypeScript contracts & interfaces
└── tests/
    └── e2e/                        # Dual-track E2E test suite (Tiers 1-4)
```
