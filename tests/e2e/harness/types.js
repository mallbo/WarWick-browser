/**
 * Shared Interface Contracts & Constants for WarWick E2E Test Suite
 * Strictly mirrors PROJECT.md § Interface Contracts
 */

export const THEME_CONSTANTS = {
  APP_BG: '#121215',
  SIDEBAR_BG: '#16161a',
  SURFACE_BG: '#1c1c22',
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
};

export const DEFAULT_APP_SETTINGS = {
  geminiApiKey: '',
  defaultSearchEngine: 'google',
  sidebarCollapsed: false,
  aiPanelWidth: 360,
  mcpServers: []
};
