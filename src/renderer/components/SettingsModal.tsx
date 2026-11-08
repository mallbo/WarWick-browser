import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  Search,
  Cpu,
  Shield,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Sliders,
  Bookmark,
  History as HistoryIcon,
  Palette,
  Sun,
  Moon,
  Monitor,
  RotateCcw
} from 'lucide-react';
import type {
  AppSettings,
  HistoryEntry,
  BookmarkItem,
  McpServerConfig,
  ThemeSettings,
  ThemeMode,
  ThemeIntensity,
  ThemeDensity
} from '../../shared/types';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_THEME,
  THEME_ACCENT_PRESETS,
  THEME_BACKGROUND_OPTIONS,
  normalizeThemeSettings
} from '../../shared/types';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeSettings;
  onThemeChange?: (theme: ThemeSettings) => void;
}

type SettingsTab = 'appearance' | 'general' | 'ai' | 'mcp' | 'privacy';

const THEME_MODE_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'dark', label: 'داكن', icon: Moon },
  { id: 'light', label: 'فاتح', icon: Sun },
  { id: 'auto', label: 'تلقائي', icon: Monitor }
];

const THEME_INTENSITY_OPTIONS: Array<{ id: ThemeIntensity; label: string }> = [
  { id: 'soft', label: 'هادئ' },
  { id: 'balanced', label: 'متوازن' },
  { id: 'bold', label: 'قوي' }
];

const THEME_DENSITY_OPTIONS: Array<{ id: ThemeDensity; label: string }> = [
  { id: 'comfortable', label: 'مريح' },
  { id: 'compact', label: 'مضغوط' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS,
    theme: { ...DEFAULT_THEME }
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [customHex, setCustomHex] = useState<string>(DEFAULT_THEME.accent);

  // History & Bookmarks data
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);

  // New MCP Server form state
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('npx');
  const [newMcpArgs, setNewMcpArgs] = useState('');

  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings on open
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      if (window.warwickApi?.settings?.get) {
        try {
          const s = await window.warwickApi.settings.get();
          const normalizedTheme = normalizeThemeSettings(s?.theme);
          const nextSettings = { ...DEFAULT_APP_SETTINGS, ...s, theme: normalizedTheme };
          setSettings(nextSettings);
          setCustomHex(normalizedTheme.accent.toUpperCase());
          onThemeChange?.(normalizedTheme);
        } catch {}
      }
      if (window.warwickApi?.history?.get) {
        try {
          const h = await window.warwickApi.history.get();
          setHistory(h);
        } catch {}
      }
      if (window.warwickApi?.bookmarks?.get) {
        try {
          const b = await window.warwickApi.bookmarks.get();
          setBookmarks(b);
        } catch {}
      }
    };

    loadData();
  }, [isOpen, onThemeChange]);

  // Keep the panel in sync when the parent applies a theme (for example via
  // the OS colour-scheme listener while mode is "auto").
  useEffect(() => {
    if (!isOpen || !theme) return;
    const normalized = normalizeThemeSettings(theme);
    setSettings((prev) => ({ ...prev, theme: normalized }));
    setCustomHex(normalized.accent.toUpperCase());
  }, [isOpen, theme]);

  // Clear any pending debounced save when the modal unmounts / closes.
  useEffect(() => {
    return () => {
      if (themeSaveTimer.current) {
        clearTimeout(themeSaveTimer.current);
        themeSaveTimer.current = null;
      }
    };
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const themeSettings = normalizeThemeSettings(settings.theme);

  /**
   * Applies a partial theme update immediately (so the UI previews it) and
   * persists the complete object after a short debounce.
   */
  const applyThemePatch = (patch: Partial<ThemeSettings>) => {
    const next = normalizeThemeSettings({ ...themeSettings, ...patch });
    setSettings((prev) => ({ ...prev, theme: next }));
    setCustomHex(next.accent.toUpperCase());
    onThemeChange?.(next);

    setSaveStatus('saving');
    if (themeSaveTimer.current) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(async () => {
      try {
        if (window.warwickApi?.settings?.save) {
          await window.warwickApi.settings.save({ theme: next });
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
      } finally {
        themeSaveTimer.current = null;
      }
    }, 280);
  };

  const handleCustomHexChange = (raw: string) => {
    setCustomHex(raw);
    let value = raw.trim();
    if (value && !value.startsWith('#')) value = `#${value}`;
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      applyThemePatch({ accent: value.toUpperCase(), accentName: 'Custom' });
    }
  };

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    setSaveStatus('saving');

    if (window.warwickApi?.settings?.save) {
      try {
        await window.warwickApi.settings.save({ [key]: value });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
      }
    }
  };

  const isLocalProvider = (settings.aiProvider || 'antigravity-local') === 'antigravity-local';
  const modelOptions = isLocalProvider
    ? [
        'gemini-3.8-flash-high',
        'gemini-3.8-flash-medium',
        'gemini-3.8-flash-low',
        'claude-sonnet-4-6',
        'claude-opus-4-6-thinking'
      ]
    : ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];
  const selectedModel = isLocalProvider
    ? (settings.aiModel || 'gemini-3.8-flash-high')
    : (settings.geminiApiModel || 'gemini-2.0-flash');

  const updateSelectedModel = (model: string) => {
    if (isLocalProvider) {
      updateSetting('aiModel', model);
    } else {
      updateSetting('geminiApiModel', model);
    }
  };

  const handleAddMcpServer = async () => {
    if (!newMcpName.trim() || !newMcpCommand.trim()) return;

    const argsList = newMcpArgs
      .split(/[\s,]+/)
      .map((a) => a.trim())
      .filter(Boolean);

    const newServer: McpServerConfig = {
      name: newMcpName.trim(),
      command: newMcpCommand.trim(),
      args: argsList
    };

    const updatedServers = [...settings.mcpServers, newServer];
    await updateSetting('mcpServers', updatedServers);

    setNewMcpName('');
    setNewMcpCommand('npx');
    setNewMcpArgs('');
  };

  const handleRemoveMcpServer = async (index: number) => {
    const updatedServers = settings.mcpServers.filter((_, i) => i !== index);
    await updateSetting('mcpServers', updatedServers);
  };

  const handleClearHistory = async () => {
    if (window.warwickApi?.history?.clear) {
      await window.warwickApi.history.clear();
      setHistory([]);
    }
  };

  const handleRemoveBookmark = async (id: string) => {
    if (window.warwickApi?.bookmarks?.remove) {
      await window.warwickApi.bookmarks.remove(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[620px]">
        {/* Header */}
        <div className="h-14 px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">WarWick Settings</h2>
          </div>

          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--accent)]">
                <Check size={13} />
                <span>Saved</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-[11px] text-[var(--text-secondary)] animate-pulse">Saving...</span>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Tab Rail + Right Tab Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Tab Rail */}
          <div className="w-48 border-r border-[var(--border-subtle)] bg-[var(--bg-app)] p-2 flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'appearance'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Palette size={14} />
              <span>Appearance</span>
            </button>

            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Search size={14} />
              <span>General</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Key size={14} />
              <span>Antigravity AI</span>
            </button>

            <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'mcp'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Cpu size={14} />
              <span>MCP Servers</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'privacy'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Shield size={14} />
              <span>Data & Privacy</span>
            </button>
          </div>

          {/* Right Content Pane */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* 1. Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                        Accent Colour
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Pick a preset or enter a custom hex. The whole chrome updates instantly.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--accent)] whitespace-nowrap">
                      {themeSettings.accentName}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 mt-3">
                    {THEME_ACCENT_PRESETS.map((preset) => {
                      const isActive = themeSettings.accent.toUpperCase() === preset.hex.toUpperCase();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyThemePatch({ accent: preset.hex, accentName: preset.name })}
                          className={`relative w-8 h-8 rounded-full border-2 transition-transform hover:scale-105 focus:outline-none ${
                            isActive ? 'border-[var(--text-primary)]' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.name}
                          aria-label={`Use ${preset.name} accent`}
                        >
                          {isActive && (
                            <Check
                              size={13}
                              className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 mt-3 max-w-sm">
                    <input
                      type="color"
                      value={themeSettings.accent}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setCustomHex(value);
                        applyThemePatch({ accent: value, accentName: 'Custom' });
                      }}
                      className="w-9 h-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-0.5 cursor-pointer"
                      title="Choose a custom accent colour"
                    />
                    <input
                      type="text"
                      value={customHex}
                      onChange={(e) => handleCustomHexChange(e.target.value)}
                      onBlur={() => setCustomHex(themeSettings.accent.toUpperCase())}
                      placeholder="#F2B632"
                      className="flex-1 min-w-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                      Accent Intensity
                    </h3>
                    <span className="text-[11px] text-[var(--accent)]">
                      {THEME_INTENSITY_OPTIONS.find((option) => option.id === themeSettings.intensity)?.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 max-w-sm">
                    {THEME_INTENSITY_OPTIONS.map((option) => {
                      const isActive = themeSettings.intensity === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => applyThemePatch({ intensity: option.id })}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                            isActive
                              ? 'bg-[var(--accent-soft-strong)] border-[var(--border-accent)] text-[var(--accent-bright)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Background
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Warm, neutral, and cool surface families.
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-w-sm mt-3">
                    {THEME_BACKGROUND_OPTIONS.map((option) => {
                      const isActive = themeSettings.background === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => applyThemePatch({ background: option.id })}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                            isActive
                              ? 'bg-[var(--accent-soft)] border-[var(--border-accent)] text-[var(--text-primary)]'
                              : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-[var(--border-strong)] shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${option.dark} 50%, ${option.light} 50%)`
                            }}
                          />
                          <span className="truncate">{option.name}</span>
                          {isActive && <Check size={12} className="ml-auto text-[var(--accent)]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                      Mode
                    </h3>
                    <div className="grid grid-cols-3 gap-1.5">
                      {THEME_MODE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const isActive = themeSettings.mode === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => applyThemePatch({ mode: option.id })}
                            className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
                              isActive
                                ? 'bg-[var(--accent-soft-strong)] border-[var(--border-accent)] text-[var(--accent-bright)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            <Icon size={12} />
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                      Density
                    </h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {THEME_DENSITY_OPTIONS.map((option) => {
                        const isActive = themeSettings.density === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => applyThemePatch({ density: option.id })}
                            className={`px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
                              isActive
                                ? 'bg-[var(--accent-soft-strong)] border-[var(--border-accent)] text-[var(--accent-bright)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full border border-[var(--border-accent)] shrink-0"
                        style={{ backgroundColor: themeSettings.accent }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">WarWick</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {themeSettings.accentName} · {themeSettings.mode} · {themeSettings.density}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--accent-soft-strong)]" />
                      <div className="h-1.5 w-10 rounded-full bg-[var(--bg-surface-hover)]" />
                      <div className="h-1.5 w-6 rounded-full bg-[var(--border-subtle)]" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Settings are saved automatically.
                    </span>
                    <button
                      type="button"
                      onClick={() => applyThemePatch(DEFAULT_THEME)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      <RotateCcw size={12} />
                      <span>Reset theme</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Search Engine
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Choose the default search engine used for omnibox queries.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => updateSetting('defaultSearchEngine', 'google')}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
                        settings.defaultSearchEngine === 'google'
                          ? 'bg-[var(--accent-soft)] border-[var(--border-accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <span>Google Search</span>
                      {settings.defaultSearchEngine === 'google' && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => updateSetting('defaultSearchEngine', 'duckduckgo')}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
                        settings.defaultSearchEngine === 'duckduckgo'
                          ? 'bg-[var(--accent-soft)] border-[var(--border-accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <span>DuckDuckGo</span>
                      {settings.defaultSearchEngine === 'duckduckgo' && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Copilot Drawer Width
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Default width for the Antigravity AI assistant drawer ({settings.aiPanelWidth}px).
                  </p>
                  <input
                    type="range"
                    min="280"
                    max="600"
                    step="10"
                    value={settings.aiPanelWidth}
                    onChange={(e) => updateSetting('aiPanelWidth', Number(e.target.value))}
                    className="w-full max-w-sm accent-[var(--accent)] bg-[var(--bg-surface)]"
                  />
                </div>
              </div>
            )}

            {/* 2. Antigravity AI Tab */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                    مصدر الذكاء الاصطناعي (AI Provider)
                  </h3>
                  <div className="grid grid-cols-2 gap-3 max-w-lg mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        updateSetting('aiProvider', 'antigravity-local');
                        if (!settings.aiModel || settings.aiModel.startsWith('gemini-1.')) {
                          updateSetting('aiModel', 'gemini-3.8-flash-high');
                        }
                      }}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        (settings.aiProvider || 'antigravity-local') === 'antigravity-local'
                          ? 'bg-[var(--accent-soft)] border-[var(--border-accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--accent)]">برنامج Antigravity على جهازك</span>
                        {(settings.aiProvider || 'antigravity-local') === 'antigravity-local' && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        مجاني وبدون API Key - متصل ببرنامج Antigravity المثبت ومسجل به.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateSetting('aiProvider', 'gemini-api')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        settings.aiProvider === 'gemini-api'
                          ? 'bg-[var(--accent-soft)] border-[var(--border-accent)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold">Google Gemini API</span>
                        {settings.aiProvider === 'gemini-api' && (
                          <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        استخدام مفتاح Google AI Studio API الخاص بك مباشرة.
                      </span>
                    </button>
                  </div>
                </div>

                {/* If Antigravity Local */}
                {(settings.aiProvider || 'antigravity-local') === 'antigravity-local' ? (
                  <div className="p-4 rounded-xl border border-[var(--border-accent-soft)] bg-[var(--accent-soft)] max-w-lg">
                    <div className="flex items-center gap-2 mb-1 text-[var(--accent)] text-xs font-medium">
                      <Check size={14} />
                      <span>متصل ببرنامج Antigravity المحلي (جاهز للاستخدام بدون مفتاح)</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      يتم تنفيذ الأوامر وتحليل الصفحات عبر جلسة Antigravity المسجلة على جهازك فورياً.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                        Gemini API Key
                      </h3>
                      {settings.geminiApiKey ? (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-medium">
                          <Check size={11} /> Configured
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--accent)] font-medium">
                          Not configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-3">
                      Required for Google AI Studio direct connection.
                    </p>

                    <div className="relative max-w-md">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={settings.geminiApiKey}
                        onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] focus:ring-1 focus:ring-[var(--border-accent-soft)] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title={showApiKey ? 'Hide key' : 'Show key'}
                      >
                        {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    <div className="mt-3">
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-bright)] transition-colors"
                      >
                        <span>Get a free Gemini API key from Google AI Studio</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    AI Model (النموذج)
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    {isLocalProvider
                      ? 'نماذج Antigravity المتاحة على جهازك (الافتراضي: gemini-3.8-flash-high):'
                      : 'اختر نموذج Gemini API (يُستخدم أيضاً في البحث الخلفي):'}
                  </p>
                  <div className="flex gap-2 mb-2.5 flex-wrap">
                    {modelOptions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateSelectedModel(m)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                          selectedModel === m
                            ? 'bg-[var(--accent-soft-strong)] border-[var(--border-accent)] text-[var(--accent-bright)] shadow-sm'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => updateSelectedModel(e.target.value)}
                    placeholder="Enter custom model..."
                    className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--border-accent)]"
                  />
                </div>
              </div>
            )}

            {/* 3. MCP Servers Tab */}
            {activeTab === 'mcp' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Model Context Protocol (MCP) Servers
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-4">
                    Connect local tools and databases directly to Antigravity via MCP stdio transports.
                  </p>

                  {/* List of active servers */}
                  <div className="space-y-2 mb-4">
                    {settings.mcpServers.length === 0 ? (
                      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)]">
                        No local MCP servers registered.
                      </div>
                    ) : (
                      settings.mcpServers.map((server, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                        >
                          <div>
                            <div className="font-semibold text-xs text-[var(--text-primary)]">{server.name}</div>
                            <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                              {server.command} {server.args.join(' ')}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMcpServer(idx)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-surface-hover)] transition-colors"
                            title="Remove Server"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Server Form */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                    <div className="text-xs font-medium text-[var(--text-primary)]">Add Local MCP Server</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Server Name (e.g. sqlite)"
                        value={newMcpName}
                        onChange={(e) => setNewMcpName(e.target.value)}
                        className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                      />
                      <input
                        type="text"
                        placeholder="Command (e.g. npx)"
                        value={newMcpCommand}
                        onChange={(e) => setNewMcpCommand(e.target.value)}
                        className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Arguments (e.g. -y mcp-server-sqlite --db app.db)"
                      value={newMcpArgs}
                      onChange={(e) => setNewMcpArgs(e.target.value)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleAddMcpServer}
                      disabled={!newMcpName.trim() || !newMcpCommand.trim()}
                      className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-bright)] disabled:opacity-40 disabled:hover:bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-all"
                    >
                      <Plus size={14} />
                      <span>Add MCP Server</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Data & Privacy Tab */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                      <HistoryIcon size={14} className="text-[var(--accent)]" />
                      <span>Browsing History</span>
                    </h3>
                    <span className="text-xs text-[var(--text-secondary)] font-mono">
                      {history.length} entries
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Browsing history is stored locally in your application profile.
                  </p>

                  <button
                    onClick={handleClearHistory}
                    disabled={history.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 text-xs transition-colors"
                  >
                    <Trash2 size={13} />
                    <span>Clear Browsing History</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Bookmark size={14} className="text-[var(--accent)]" />
                      <span>Bookmarks</span>
                    </h3>
                    <span className="text-xs text-[var(--text-secondary)] font-mono">
                      {bookmarks.length} saved
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Manage your saved bookmarks.
                  </p>

                  {bookmarks.length === 0 ? (
                    <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)]">
                      No bookmarks saved yet.
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5">
                      {bookmarks.map((bm) => (
                        <div
                          key={bm.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                        >
                          <div className="truncate mr-2">
                            <div className="font-medium text-[var(--text-primary)] truncate">{bm.title}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{bm.url}</div>
                          </div>
                          <button
                            onClick={() => handleRemoveBookmark(bm.id)}
                            className="text-[var(--text-muted)] hover:text-red-400 p-1"
                            title="Remove Bookmark"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
