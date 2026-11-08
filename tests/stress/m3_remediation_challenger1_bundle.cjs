"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tests/stress/m3_remediation_challenger1_native.ts
var import_electron2 = require("electron");

// src/main/tabManager.ts
var import_electron = require("electron");
var import_node_crypto = __toESM(require("node:crypto"), 1);

// src/shared/types.ts
var THEME_CONSTANTS = {
  APP_BG: "#121215",
  SIDEBAR_BG: "#16161a",
  SURFACE_BG: "#1c1c22",
  ACCENT_EMERALD: "#10b981",
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 800,
  SIDEBAR_EXPANDED_WIDTH: 240,
  SIDEBAR_COLLAPSED_WIDTH: 52,
  MAX_PAGE_TEXT_CHARS: 4e4,
  DEFAULT_RESEARCH_TIMEOUT_MS: 15e3,
  MAX_BACKGROUND_TABS: 5
};
var IPC_CHANNELS = {
  // Tabs
  TABS_CREATE: "tabs:create",
  TABS_SWITCH: "tabs:switch",
  TABS_CLOSE: "tabs:close",
  TABS_NAVIGATE: "tabs:navigate",
  TABS_RELOAD: "tabs:reload",
  TABS_GO_BACK: "tabs:go-back",
  TABS_GO_FORWARD: "tabs:go-forward",
  TABS_SET_PINNED: "tabs:set-pinned",
  TABS_SET_MUTED: "tabs:set-muted",
  TABS_SET_BOUNDS: "tabs:set-bounds",
  TABS_UPDATED: "tabs:updated",
  // Agent
  AGENT_SEND_PROMPT: "agent:send-prompt",
  AGENT_CANCEL: "agent:cancel",
  AGENT_RESEARCH_QUERY: "agent:research-query",
  AGENT_STREAM_CHUNK: "agent:stream-chunk",
  AGENT_ACTION_EVENT: "agent:action-event",
  // In-Page Context
  CONTEXT_CAPTURE_ACTIVE_PAGE: "context:capture-active-page",
  CONTEXT_READ_PAGE: "context:read-page",
  CONTEXT_TAKE_SCREENSHOT: "context:take-screenshot",
  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_SAVE: "settings:save",
  // History & Bookmarks & Session
  HISTORY_GET: "history:get",
  HISTORY_CLEAR: "history:clear",
  BOOKMARKS_GET: "bookmarks:get",
  BOOKMARKS_ADD: "bookmarks:add",
  BOOKMARKS_REMOVE: "bookmarks:remove",
  SESSION_GET: "session:get",
  // Window Controls
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized"
};

// src/main/tabManager.ts
var TabManager = class {
  mainWindow;
  storageService;
  tabs = /* @__PURE__ */ new Map();
  activeTabId = null;
  defaultSearchEngine = "google";
  // Baseline initial bounds (Sidebar 240px, Omnibox 48px)
  currentBounds = { x: 240, y: 48, width: 1040, height: 752 };
  containerOffsets = { top: 48, left: 240, right: 0, bottom: 0 };
  constructor(mainWindow, storageService) {
    this.mainWindow = mainWindow;
    this.storageService = storageService;
    if (storageService) {
      this.defaultSearchEngine = storageService.getSettings().defaultSearchEngine || "google";
    }
    this.setupWindowListeners();
  }
  setSearchEngine(engine) {
    this.defaultSearchEngine = engine;
  }
  buildSearchUrl(query) {
    const encoded = encodeURIComponent(query);
    if (this.defaultSearchEngine === "duckduckgo") {
      return `https://duckduckgo.com/html/?q=${encoded}`;
    }
    return `https://www.google.com/search?q=${encoded}`;
  }
  setupWindowListeners() {
    this.mainWindow.on("resize", () => {
      this.handleWindowResize();
    });
  }
  handleWindowResize() {
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
      } catch {
      }
    }
  }
  setBounds(bounds) {
    if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
      return;
    }
    const sanitized = {
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
      } catch {
      }
    }
  }
  deriveInitialTitle(url) {
    if (!url || url === "about:blank") return "New Tab";
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || "New Tab";
    } catch {
      return "New Tab";
    }
  }
  deriveInitialFavicon(url) {
    if (!url || !url.startsWith("http")) return void 0;
    try {
      const parsed = new URL(url);
      return `${parsed.origin}/favicon.ico`;
    } catch {
      return void 0;
    }
  }
  createTab(url, options = { active: true }) {
    const id = options.id || import_node_crypto.default.randomUUID();
    const rawUrl = url?.trim() || (this.defaultSearchEngine === "duckduckgo" ? "https://duckduckgo.com" : "https://www.google.com");
    const targetUrl = this.resolveNavigationUrl(rawUrl) || rawUrl;
    const view = new import_electron.WebContentsView({
      webPreferences: {
        partition: "persist:warwick-browsing",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true
      }
    });
    view.setBackgroundColor("#121215");
    const state = {
      id,
      url: targetUrl,
      title: this.deriveInitialTitle(targetUrl),
      faviconUrl: this.deriveInitialFavicon(targetUrl),
      isLoading: targetUrl !== "about:blank",
      canGoBack: false,
      canGoForward: false,
      isMuted: false,
      isPinned: Boolean(options.isPinned),
      isCrashed: false,
      createdAt: Date.now()
    };
    const wc = view.webContents;
    const registeredListeners = [];
    const addTrackedListener = (event, fn) => {
      wc.on(event, fn);
      registeredListeners.push({ event, fn });
    };
    addTrackedListener("did-start-loading", () => {
      state.isLoading = true;
      state.isCrashed = false;
      this.broadcastTabs();
    });
    addTrackedListener("did-stop-loading", () => {
      state.isLoading = false;
      state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
      state.url = wc.getURL();
      this.broadcastTabs();
    });
    addTrackedListener("page-title-updated", (_event, title) => {
      state.title = title || "Untitled";
      if (state.url && state.url !== "about:blank" && !state.url.startsWith("about:")) {
        this.storageService?.recordHistory(state.url, state.title);
      }
      this.broadcastTabs();
      this.saveSession();
    });
    addTrackedListener("page-favicon-updated", (_event, favicons) => {
      if (favicons && favicons.length > 0) {
        state.faviconUrl = favicons[0];
        this.broadcastTabs();
      }
    });
    addTrackedListener("did-navigate", (_event, navUrl) => {
      state.url = navUrl;
      state.isCrashed = false;
      state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
      if (navUrl && navUrl !== "about:blank" && !navUrl.startsWith("about:")) {
        this.storageService?.recordHistory(navUrl, state.title);
      }
      this.broadcastTabs();
      this.saveSession();
    });
    addTrackedListener("did-navigate-in-page", (_event, navUrl, isMainFrame) => {
      if (isMainFrame) {
        state.url = navUrl;
        state.isCrashed = false;
        state.canGoBack = wc.navigationHistory?.canGoBack ? wc.navigationHistory.canGoBack() : wc.canGoBack();
        state.canGoForward = wc.navigationHistory?.canGoForward ? wc.navigationHistory.canGoForward() : wc.canGoForward();
        if (navUrl && navUrl !== "about:blank" && !navUrl.startsWith("about:")) {
          this.storageService?.recordHistory(navUrl, state.title);
        }
        this.broadcastTabs();
        this.saveSession();
      }
    });
    addTrackedListener("render-process-gone", () => {
      state.isCrashed = true;
      state.isLoading = false;
      this.broadcastTabs();
      this.saveSession();
    });
    addTrackedListener("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const isMod = input.control || input.meta;
      const key = (input.key || "").toLowerCase();
      const code = input.code || "";
      if (isMod && !input.shift && !input.alt && (key === "t" || code === "KeyT")) {
        event.preventDefault();
        this.createTab(void 0, { active: true });
        return;
      }
      if (isMod && !input.shift && !input.alt && (key === "w" || code === "KeyW")) {
        event.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
        return;
      }
      if (isMod && !input.alt && (key === "tab" || code === "Tab")) {
        event.preventDefault();
        this.cycleTab(input.shift ? -1 : 1);
        return;
      }
      if (isMod && !input.shift && !input.alt && (key === "k" || code === "KeyK" || key === "l" || code === "KeyL")) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send("shortcuts:focus-omnibox");
          this.mainWindow.focus();
        } catch {
        }
        return;
      }
      if (isMod && !input.shift && !input.alt && (key === "j" || code === "KeyJ")) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send("shortcuts:toggle-ai-drawer");
        } catch {
        }
        return;
      }
      if (isMod && !input.shift && !input.alt && (key === "r" || code === "KeyR") || !isMod && !input.shift && !input.alt && (key === "f5" || code === "F5")) {
        event.preventDefault();
        if (this.activeTabId) this.reload(this.activeTabId);
        return;
      }
      if (input.alt && !isMod && (key === "arrowleft" || code === "ArrowLeft")) {
        event.preventDefault();
        if (this.activeTabId) this.goBack(this.activeTabId);
        return;
      }
      if (input.alt && !isMod && (key === "arrowright" || code === "ArrowRight")) {
        event.preventDefault();
        if (this.activeTabId) this.goForward(this.activeTabId);
        return;
      }
      if (isMod && !input.shift && !input.alt && (key === "," || code === "Comma")) {
        event.preventDefault();
        try {
          this.mainWindow.webContents.send("shortcuts:open-settings");
        } catch {
        }
        return;
      }
    });
    const cleanupListeners = () => {
      for (const { event, fn } of registeredListeners) {
        try {
          if (wc && !wc.isDestroyed?.()) {
            wc.removeListener(event, fn);
          }
        } catch {
        }
      }
      try {
        if (wc && !wc.isDestroyed?.()) {
          wc.removeAllListeners("did-start-loading");
          wc.removeAllListeners("did-stop-loading");
          wc.removeAllListeners("page-title-updated");
          wc.removeAllListeners("page-favicon-updated");
          wc.removeAllListeners("did-navigate");
          wc.removeAllListeners("did-navigate-in-page");
          wc.removeAllListeners("render-process-gone");
          wc.removeAllListeners("before-input-event");
        }
      } catch {
      }
      registeredListeners.length = 0;
    };
    wc.setWindowOpenHandler(({ url: openUrl, disposition }) => {
      const shouldBeActive = disposition !== "background-tab";
      this.createTab(openUrl, { active: shouldBeActive });
      return { action: "deny" };
    });
    wc.loadURL(targetUrl).catch(() => {
    });
    if (targetUrl && targetUrl !== "about:blank" && !targetUrl.startsWith("about:")) {
      this.storageService?.recordHistory(targetUrl, state.title);
    }
    const tabItem = { id, view, state, cleanupListeners };
    this.tabs.set(id, tabItem);
    if (options.active) {
      this.switchTab(id);
    } else {
      this.broadcastTabs();
    }
    this.saveSession();
    return state;
  }
  switchTab(id) {
    if (!this.tabs.has(id)) return false;
    if (this.activeTabId === id) return true;
    if (this.activeTabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab && currentTab.view?.webContents && !currentTab.view.webContents.isDestroyed?.()) {
        try {
          this.mainWindow.contentView.removeChildView(currentTab.view);
        } catch {
        }
      } else if (currentTab?.view) {
        try {
          this.mainWindow.contentView.removeChildView(currentTab.view);
        } catch {
        }
      }
    }
    const nextTab = this.tabs.get(id);
    if (!nextTab) return false;
    for (const child of this.mainWindow.contentView.children) {
      if (child !== nextTab.view) {
        try {
          this.mainWindow.contentView.removeChildView(child);
        } catch {
        }
      }
    }
    this.activeTabId = id;
    try {
      this.mainWindow.contentView.addChildView(nextTab.view);
      nextTab.view.setBounds(this.currentBounds);
      if (nextTab.view?.webContents && !nextTab.view.webContents.isDestroyed?.()) {
        nextTab.view.webContents.focus();
      }
    } catch (e) {
      console.error("Failed to attach active WebContentsView:", e);
      return false;
    }
    this.broadcastTabs();
    this.saveSession();
    return true;
  }
  cycleTab(direction) {
    const allIds = Array.from(this.tabs.keys());
    if (allIds.length <= 1) return true;
    const currentIndex = this.activeTabId ? allIds.indexOf(this.activeTabId) : 0;
    const nextIndex = (currentIndex + direction + allIds.length) % allIds.length;
    return this.switchTab(allIds[nextIndex]);
  }
  closeTab(id) {
    const tabItem = this.tabs.get(id);
    if (!tabItem) return false;
    const allIds = Array.from(this.tabs.keys());
    const closingIndex = allIds.indexOf(id);
    const wasActive = this.activeTabId === id;
    if (wasActive) {
      try {
        this.mainWindow.contentView.removeChildView(tabItem.view);
      } catch {
      }
    }
    try {
      tabItem.cleanupListeners?.();
    } catch {
    }
    if (tabItem.view?.webContents && !tabItem.view.webContents.isDestroyed?.()) {
      try {
        tabItem.view.webContents.close();
      } catch {
      }
    }
    this.tabs.delete(id);
    if (this.tabs.size === 0) {
      this.activeTabId = null;
      this.createTab(void 0, { active: true });
      this.saveSession();
      return true;
    }
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
  resolveNavigationUrl(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed === "about:" || trimmed === "about:blank") {
      return "about:blank";
    }
    if (trimmed.startsWith("about:")) {
      return trimmed;
    }
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      const rest = schemeMatch[2].trim();
      if (!rest || rest === "/" && scheme !== "file") {
        return this.buildSearchUrl(trimmed);
      }
      if (scheme === "file") {
        return trimmed;
      }
      return trimmed;
    }
    if (/\s/.test(trimmed)) {
      return this.buildSearchUrl(trimmed);
    }
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?::\d+)?(?:\/.*)?$/;
    if (ipv4Pattern.test(trimmed)) {
      return `http://${trimmed}`;
    }
    const localhostPattern = /^localhost(?::\d+)?(?:\/.*)?$/i;
    if (localhostPattern.test(trimmed)) {
      return `http://${trimmed}`;
    }
    const intranetWithPortPattern = /^[a-zA-Z0-9_-]+:\d+(?:\/.*)?$/;
    if (intranetWithPortPattern.test(trimmed)) {
      return `http://${trimmed}`;
    }
    const standardDomainPattern = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/;
    if (standardDomainPattern.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return this.buildSearchUrl(trimmed);
  }
  navigate(id, input) {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    const targetUrl = this.resolveNavigationUrl(input);
    if (!targetUrl) return false;
    tabItem.state.isCrashed = false;
    tabItem.view.webContents.loadURL(targetUrl).catch((err) => {
      console.error("Tab navigation error:", err);
    });
    return true;
  }
  reload(id) {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    tabItem.state.isCrashed = false;
    tabItem.state.isLoading = true;
    this.broadcastTabs();
    tabItem.view.webContents.reload();
    return true;
  }
  setTabMuted(id, muted) {
    const tabItem = this.tabs.get(id);
    if (!tabItem || !tabItem.view?.webContents || tabItem.view.webContents.isDestroyed?.()) return false;
    tabItem.state.isMuted = muted;
    try {
      tabItem.view.webContents.setAudioMuted(muted);
    } catch {
    }
    this.broadcastTabs();
    return true;
  }
  setTabPinned(id, pinned) {
    const tabItem = this.tabs.get(id);
    if (!tabItem) return false;
    tabItem.state.isPinned = pinned;
    this.broadcastTabs();
    this.saveSession();
    return true;
  }
  saveSession() {
    if (!this.storageService) return;
    const tabList = Array.from(this.tabs.values()).map((t) => t.state);
    this.storageService.saveSession(tabList, this.activeTabId || void 0);
  }
  goBack(id) {
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
  goForward(id) {
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
  getActiveTab() {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }
  getTab(id) {
    return this.tabs.get(id) || null;
  }
  getAllTabs() {
    return Array.from(this.tabs.values()).map((t) => t.state);
  }
  getActiveTabId() {
    return this.activeTabId;
  }
  broadcastTabs() {
    if (!this.mainWindow || this.mainWindow.isDestroyed?.() || !this.mainWindow.webContents || this.mainWindow.webContents.isDestroyed?.()) {
      return;
    }
    try {
      const tabsList = this.getAllTabs();
      this.mainWindow.webContents.send?.(IPC_CHANNELS.TABS_UPDATED, tabsList, this.activeTabId || "");
    } catch {
    }
  }
  destroyAll() {
    for (const tab of this.tabs.values()) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view);
      } catch {
      }
      try {
        tab.cleanupListeners?.();
      } catch {
      }
      if (tab.view?.webContents && !tab.view.webContents.isDestroyed?.()) {
        try {
          tab.view.webContents.close();
        } catch {
        }
      }
    }
    this.tabs.clear();
    this.activeTabId = null;
  }
};

// src/main/pageContextExtractor.ts
var TRUNCATE_NOTICE = "\n\n[Content truncated at 40,000 characters for token limit...]";
function enforceTokenGuard(text, maxChars = THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS, appendNotice = true) {
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  if (!appendNotice) {
    return text.substring(0, maxChars);
  }
  const maxContentLength = maxChars - TRUNCATE_NOTICE.length;
  if (maxContentLength <= 0) {
    return text.substring(0, maxChars);
  }
  const candidate = text.substring(0, maxContentLength);
  const lastSpace = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"));
  const cleanCut = lastSpace > maxContentLength * 0.8 ? candidate.substring(0, lastSpace) : candidate;
  const result = cleanCut.trimEnd() + TRUNCATE_NOTICE;
  return result.length <= maxChars ? result : result.substring(0, maxChars);
}
async function captureActivePageScreenshot(tabManager, quality = 80) {
  const activeTab = tabManager.getActiveTab();
  if (!activeTab || !activeTab.view?.webContents || activeTab.view.webContents.isDestroyed?.()) {
    return void 0;
  }
  if (activeTab.state.isCrashed) {
    return void 0;
  }
  const wc = activeTab.view.webContents;
  try {
    const bounds = activeTab.view.getBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return void 0;
    }
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("capturePage timeout")), 3e3);
    });
    let image;
    try {
      image = await Promise.race([
        wc.capturePage(),
        timeoutPromise
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    if (!image || image.isEmpty()) {
      return void 0;
    }
    const clampedQuality = Math.max(1, Math.min(100, Math.round(quality)));
    const jpegBuffer = image.toJPEG(clampedQuality);
    if (!jpegBuffer || jpegBuffer.length === 0) {
      return void 0;
    }
    return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
  } catch (err) {
    console.error("Failed to capture page screenshot:", err);
    return void 0;
  }
}
var DOM_EXTRACTION_SCRIPT = `
(() => {
  try {
    const title = document.title || '';
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = (canonicalEl && canonicalEl.href) ? canonicalEl.href : window.location.href;

    const metaEl = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
    const metaDescription = metaEl ? (metaEl.getAttribute('content') || '') : '';

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    const body = document.body;
    if (!body) {
      return { title, canonicalUrl, metaDescription, selectedText, readableText: '' };
    }

    const clone = body.cloneNode(true);

    const unwantedSelectors = 'script, style, svg, iframe, noscript, nav, footer, header, aside, template, canvas, audio, video, object, embed';
    const noiseNodes = clone.querySelectorAll(unwantedSelectors);
    for (let i = 0; i < noiseNodes.length; i++) {
      noiseNodes[i].remove();
    }

    const hiddenNodes = clone.querySelectorAll('[hidden], [aria-hidden="true"]');
    for (let i = 0; i < hiddenNodes.length; i++) {
      hiddenNodes[i].remove();
    }

    const structuredLines = [];

    function processNode(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\\s+/g, ' ');
        if (text.trim().length > 0) {
          structuredLines.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('\\n' + '#'.repeat(level) + ' ' + text + '\\n');
        }
        return;
      }

      if (tag === 'pre') {
        const code = (node.textContent || '').trim();
        if (code) {
          structuredLines.push('\\n\`\`\`\\n' + code + '\\n\`\`\`\\n');
        }
        return;
      }

      if (tag === 'p') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('\\n' + text + '\\n');
        }
        return;
      }

      if (tag === 'li') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          const isOrdered = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol';
          structuredLines.push((isOrdered ? '1. ' : '- ') + text);
        }
        return;
      }

      if (tag === 'tr') {
        const cells = Array.from(node.querySelectorAll('th, td')).map(c => (c.textContent || '').replace(/\\s+/g, ' ').trim());
        if (cells.length > 0) {
          structuredLines.push('| ' + cells.join(' | ') + ' |');
        }
        return;
      }

      if (tag === 'blockquote') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('> ' + text);
        }
        return;
      }

      for (let i = 0; i < node.childNodes.length; i++) {
        processNode(node.childNodes[i]);
      }
    }

    processNode(clone);

    let rawStructured = structuredLines.join(' ');
    rawStructured = rawStructured.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n\\s*\\n+/g, '\\n\\n').trim();

    return {
      title,
      canonicalUrl,
      metaDescription,
      selectedText,
      readableText: rawStructured
    };
  } catch (err) {
    return {
      title: document.title || '',
      canonicalUrl: window.location.href,
      metaDescription: '',
      selectedText: '',
      readableText: (document.body ? (document.body.innerText || '') : '').replace(/\\s+/g, ' ').trim()
    };
  }
})()
`;
async function extractActivePageContext(tabManager, options = { includeScreenshot: false }) {
  const activeTab = tabManager.getActiveTab();
  if (!activeTab) {
    throw new Error("No active tab to capture");
  }
  if (!activeTab.view?.webContents || activeTab.view.webContents.isDestroyed?.()) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: "",
      readableText: "[Tab WebContents destroyed]",
      metaDescription: "",
      screenshotBase64: void 0
    };
  }
  const wc = activeTab.view.webContents;
  if (activeTab.state.isCrashed) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: "",
      readableText: "[Tab crashed - render process gone]",
      metaDescription: "",
      screenshotBase64: void 0
    };
  }
  if (activeTab.state.url === "about:blank" || !activeTab.state.url) {
    let screenshotBase642 = void 0;
    if (options.includeScreenshot) {
      screenshotBase642 = await captureActivePageScreenshot(tabManager, options.quality);
    }
    return {
      url: "about:blank",
      title: activeTab.state.title || "New Tab",
      selectedText: "",
      readableText: "",
      metaDescription: "",
      screenshotBase64: screenshotBase642
    };
  }
  const screenshotPromise = options.includeScreenshot ? captureActivePageScreenshot(tabManager, options.quality) : Promise.resolve(void 0);
  const domPromise = (async () => {
    try {
      const extracted = await wc.executeJavaScript(DOM_EXTRACTION_SCRIPT);
      return extracted || {};
    } catch (err) {
      console.warn("DOM extraction failed, falling back to basic text:", err);
      return {
        title: wc.getTitle() || activeTab.state.title,
        canonicalUrl: wc.getURL() || activeTab.state.url,
        metaDescription: "",
        selectedText: "",
        readableText: ""
      };
    }
  })();
  const [domResult, screenshotBase64] = await Promise.all([domPromise, screenshotPromise]);
  const rawText = domResult.readableText || "";
  const readableText = enforceTokenGuard(rawText, options.maxChars ?? THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);
  return {
    url: domResult.canonicalUrl || wc.getURL() || activeTab.state.url,
    title: domResult.title || wc.getTitle() || activeTab.state.title,
    selectedText: domResult.selectedText || "",
    readableText,
    canonicalUrl: domResult.canonicalUrl,
    metaDescription: domResult.metaDescription || "",
    screenshotBase64
  };
}

// tests/stress/m3_remediation_challenger1_native.ts
var import_node_assert = __toESM(require("node:assert"), 1);
var totalTests = 0;
var passedTests = 0;
var failedTests = 0;
var failures = [];
async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \u2714 [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  \u2716 [FAIL] ${name}`);
    console.error(`    Details: ${err?.stack || err?.message || err}`);
    failures.push({ test: name, error: err?.message || String(err) });
  }
}
async function runAdversarialRemediationVerification() {
  console.log("\n===============================================================");
  console.log("  WARWICK M3 REMEDIATION CHALLENGER 1 NATIVE ADVERSARIAL HARNESS");
  console.log("===============================================================\n");
  await import_electron2.app.whenReady();
  const win = new import_electron2.BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });
  const tabManager = new TabManager(win);
  const attachNativeRasterizer = (tabItem) => {
    if (tabItem.view?.webContents) {
      tabItem.view.webContents.capturePage = async () => {
        const bitmap = Buffer.alloc(100 * 100 * 4, 127);
        return import_electron2.nativeImage.createFromBitmap(bitmap, { width: 100, height: 100 });
      };
    }
  };
  const detachWebContents = (view) => {
    Object.defineProperty(view, "webContents", {
      get: () => void 0,
      configurable: true
    });
  };
  console.log("--- SUITE 1: Real Native Detached WebContents Resilience ---");
  await test("ADV-1: Immediately after wc.close(), screenshot and context extract without TypeError", async () => {
    const tabState = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(tabState.id);
    import_node_assert.default.ok(tabItem);
    attachNativeRasterizer(tabItem);
    tabItem.view.webContents.close();
    const screenshot = await captureActivePageScreenshot(tabManager);
    import_node_assert.default.ok(screenshot === void 0 || typeof screenshot === "string");
    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    import_node_assert.default.ok(context && typeof context === "object");
    import_node_assert.default.ok(typeof context.readableText === "string");
    tabManager.closeTab(tabState.id);
  });
  await test("ADV-2: Asynchronously after wc.close() (when view.webContents becomes undefined), returns undefined without TypeError", async () => {
    const tabState = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(tabState.id);
    import_node_assert.default.ok(tabItem);
    tabItem.view.webContents.close();
    await new Promise((r) => setTimeout(r, 150));
    const screenshot = await captureActivePageScreenshot(tabManager);
    import_node_assert.default.strictEqual(screenshot, void 0);
    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    import_node_assert.default.strictEqual(context.screenshotBase64, void 0);
    import_node_assert.default.strictEqual(context.readableText, "[Tab WebContents destroyed]");
    tabManager.closeTab(tabState.id);
  });
  await test("ADV-3: Explicitly detached view.webContents = undefined returns undefined without TypeError", async () => {
    const tabState = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(tabState.id);
    import_node_assert.default.ok(tabItem);
    detachWebContents(tabItem.view);
    const screenshot = await captureActivePageScreenshot(tabManager);
    import_node_assert.default.strictEqual(screenshot, void 0);
    const context = await extractActivePageContext(tabManager, { includeScreenshot: true });
    import_node_assert.default.strictEqual(context.screenshotBase64, void 0);
    import_node_assert.default.strictEqual(context.readableText, "[Tab WebContents destroyed]");
    tabManager.closeTab(tabState.id);
  });
  await test("ADV-4: Concurrent screenshot capture while tab is actively being closed", async () => {
    const tabState = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(tabState.id);
    import_node_assert.default.ok(tabItem);
    attachNativeRasterizer(tabItem);
    const capturePromise = captureActivePageScreenshot(tabManager);
    tabManager.closeTab(tabState.id);
    const result = await capturePromise;
    import_node_assert.default.ok(result === void 0 || typeof result === "string");
  });
  console.log("\n--- SUITE 2: Native TabManager Operations on Detached Tabs ---");
  await test("ADV-5: switchTab cleanly detaches previous tab view even if previous webContents is undefined", async () => {
    const t1State = tabManager.createTab("about:blank", { active: true });
    const t2State = tabManager.createTab("about:blank", { active: false });
    const t1 = tabManager.getTab(t1State.id);
    import_node_assert.default.ok(t1);
    detachWebContents(t1.view);
    const switchResult = tabManager.switchTab(t2State.id);
    import_node_assert.default.strictEqual(switchResult, true);
    import_node_assert.default.strictEqual(tabManager.getActiveTabId(), t2State.id);
    tabManager.closeTab(t1State.id);
    tabManager.closeTab(t2State.id);
  });
  await test("ADV-6: switchTab when target tab webContents is undefined attaches view safely without focus() crash", async () => {
    const t1State = tabManager.createTab("about:blank", { active: true });
    const t2State = tabManager.createTab("about:blank", { active: false });
    const t2 = tabManager.getTab(t2State.id);
    import_node_assert.default.ok(t2);
    detachWebContents(t2.view);
    const switchResult = tabManager.switchTab(t2State.id);
    import_node_assert.default.strictEqual(switchResult, true);
    import_node_assert.default.strictEqual(tabManager.getActiveTabId(), t2State.id);
    tabManager.closeTab(t1State.id);
    tabManager.closeTab(t2State.id);
  });
  await test("ADV-7: navigate, reload, setTabMuted, goBack, goForward on detached tab safely return false", async () => {
    const tState = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(tState.id);
    import_node_assert.default.ok(tabItem);
    detachWebContents(tabItem.view);
    import_node_assert.default.strictEqual(tabManager.navigate(tState.id, "https://example.com"), false);
    import_node_assert.default.strictEqual(tabManager.reload(tState.id), false);
    import_node_assert.default.strictEqual(tabManager.setTabMuted(tState.id, true), false);
    import_node_assert.default.strictEqual(tabManager.goBack(tState.id), false);
    import_node_assert.default.strictEqual(tabManager.goForward(tState.id), false);
    tabManager.closeTab(tState.id);
  });
  await test("ADV-8: closeTab on detached tab frees view, cleans listeners, and maintains tab strip consistency", async () => {
    const t1 = tabManager.createTab("about:blank", { active: true });
    const t2 = tabManager.createTab("about:blank", { active: false });
    const tab1Item = tabManager.getTab(t1.id);
    detachWebContents(tab1Item.view);
    const closed = tabManager.closeTab(t1.id);
    import_node_assert.default.strictEqual(closed, true);
    import_node_assert.default.strictEqual(tabManager.getTab(t1.id), null);
    import_node_assert.default.strictEqual(tabManager.getActiveTabId(), t2.id);
    tabManager.closeTab(t2.id);
  });
  await test("ADV-9: destroyAll with mixed alive, closed, and detached tabs executes without exception", async () => {
    const t1 = tabManager.createTab("about:blank");
    const t2 = tabManager.createTab("about:blank");
    const t3 = tabManager.createTab("about:blank");
    tabManager.getTab(t2.id).view.webContents.close();
    detachWebContents(tabManager.getTab(t3.id).view);
    import_node_assert.default.doesNotThrow(() => {
      tabManager.destroyAll();
    });
    import_node_assert.default.strictEqual(tabManager.getAllTabs().length, 0);
    import_node_assert.default.strictEqual(tabManager.getActiveTabId(), null);
  });
  await test("ADV-10: handleWindowResize and setBounds when active tab webContents is undefined do not throw", async () => {
    const t = tabManager.createTab("about:blank", { active: true });
    const tabItem = tabManager.getTab(t.id);
    detachWebContents(tabItem.view);
    import_node_assert.default.doesNotThrow(() => {
      tabManager.setBounds({ x: 200, y: 50, width: 900, height: 700 });
      tabManager.handleWindowResize();
    });
    tabManager.closeTab(t.id);
  });
  console.log("\n===============================================================");
  console.log(`  M3 REMEDIATION CHALLENGER RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`  \u2716 FAILED TESTS (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`    ${idx + 1}. ${f.test}: ${f.error}`);
    });
  } else {
    console.log("  ALL NATIVE REMEDIATION TESTS PASSED WITH ZERO UNHANDLED EXCEPTIONS!");
  }
  console.log("===============================================================\n");
  try {
    win.destroy();
  } catch {
  }
  import_electron2.app.exit(failedTests > 0 ? 1 : 0);
}
runAdversarialRemediationVerification().catch((err) => {
  console.error("RUNNER CRASHED:", err);
  import_electron2.app.exit(1);
});
