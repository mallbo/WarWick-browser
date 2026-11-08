import { useState, useEffect, useRef, useCallback } from 'react';
import type { TabState, ViewBounds, ThemeSettings } from '../shared/types';
import { DEFAULT_THEME, normalizeThemeSettings } from '../shared/types';
import { applyTheme } from './theme';
import type { Language } from './i18n';
import { Sidebar } from './components/Sidebar';
import { NavBar } from './components/NavBar';
import { AntigravityDrawer } from './components/AntigravityDrawer';
import { SettingsModal } from './components/SettingsModal';
import { MarketingHome } from './components/MarketingHome';
import { SarabOverlay } from './components/SarabOverlay';
import { FunnelAutopsyPanel } from './components/FunnelAutopsyPanel';

export default function App() {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isAgentOpen, setIsAgentOpen] = useState<boolean>(true);
  const [agentDraftPrompt, setAgentDraftPrompt] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isFunnelAutopsyOpen, setIsFunnelAutopsyOpen] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return (localStorage.getItem('warwick_lang') as Language) || 'en';
    } catch {
      return 'en';
    }
  });

  const handleToggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next: Language = prev === 'en' ? 'ar' : 'en';
      try {
        localStorage.setItem('warwick_lang', next);
      } catch {}
      return next;
    });
  }, []);

  const webContainerRef = useRef<HTMLDivElement | null>(null);

  // Load the persisted appearance as early as possible and apply it before
  // the user interacts with the chrome.
  useEffect(() => {
    let cancelled = false;

    const bootTheme = async () => {
      if (!window.warwickApi?.settings?.get) {
        applyTheme(DEFAULT_THEME);
        return;
      }
      try {
        const stored = await window.warwickApi.settings.get();
        if (cancelled) return;
        const normalized = normalizeThemeSettings(stored?.theme);
        setTheme(normalized);
        applyTheme(normalized);
      } catch {
        if (!cancelled) applyTheme(DEFAULT_THEME);
      }
    };

    bootTheme();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the OS colour scheme while the user has selected "auto".
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      if (theme.mode === 'auto') applyTheme(theme);
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);

  const handleThemeChange = useCallback((next: ThemeSettings) => {
    const normalized = normalizeThemeSettings(next);
    setTheme(normalized);
    applyTheme(normalized);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsFunnelAutopsyOpen(false);
    setIsSettingsOpen(true);
  }, []);

  const handleOpenFunnelAutopsy = useCallback(() => {
    setIsSettingsOpen(false);
    setIsFunnelAutopsyOpen(true);
  }, []);

  // Synchronize WebContentsView bounds via ResizeObserver + rAF
  const reportBounds = useCallback(() => {
    if (!webContainerRef.current) return;
    const rect = webContainerRef.current.getBoundingClientRect();
    const bounds: ViewBounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    };

    if (window.warwickApi?.tabs?.setBounds) {
      window.warwickApi.tabs.setBounds(bounds);
    }
  }, []);

  const handleCloseFunnelAutopsy = useCallback(() => {
    setIsFunnelAutopsyOpen(false);
    requestAnimationFrame(() => reportBounds());
  }, [reportBounds]);

  useEffect(() => {
    const container = webContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const observer = new ResizeObserver(() => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        reportBounds();
        rafId = null;
      });
    });

    observer.observe(container);
    reportBounds();

    const handleWindowResize = () => reportBounds();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [reportBounds]);

  // Subscribe to tab updates from Main process
  useEffect(() => {
    if (!window.warwickApi?.tabs?.onTabsUpdated) return;

    const unsubscribe = window.warwickApi.tabs.onTabsUpdated((updatedTabs, activeId) => {
      setTabs(updatedTabs);
      setActiveTabId(activeId);
    });

    return unsubscribe;
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isStartPage = !activeTab || !activeTab.url || activeTab.url === 'about:blank' || activeTab.url.startsWith('warwick://');

  // Keep the star in sync with the bookmarks stored by the main process.
  useEffect(() => {
    let cancelled = false;

    const loadBookmarkState = async () => {
      if (!activeTab?.url || activeTab.url === 'about:blank' || !window.warwickApi?.bookmarks?.get) {
        if (!cancelled) setIsBookmarked(false);
        return;
      }
      try {
        const list = await window.warwickApi.bookmarks.get();
        if (!cancelled) {
          setIsBookmarked(list.some((b) => b.url === activeTab.url));
        }
      } catch {
        if (!cancelled) setIsBookmarked(false);
      }
    };

    loadBookmarkState();
    return () => {
      cancelled = true;
    };
  }, [activeTab?.url]);

  // When a modal/panel is open OR on Start Page, hide WebContentsView so React is completely visible!
  useEffect(() => {
    if (window.warwickApi?.tabs?.setVisible) {
      window.warwickApi.tabs.setVisible(!isSettingsOpen && !isFunnelAutopsyOpen && !isStartPage);
    }
  }, [isSettingsOpen, isFunnelAutopsyOpen, isStartPage, activeTabId]);

  // Tab operations
  const handleCreateTab = useCallback(async () => {
    if (window.warwickApi?.tabs?.create) {
      await window.warwickApi.tabs.create('about:blank');
    }
  }, []);

  const handleSwitchTab = useCallback(async (id: string) => {
    if (window.warwickApi?.tabs?.switch) {
      await window.warwickApi.tabs.switch(id);
    }
  }, []);

  const handleCloseTab = useCallback(async (id: string) => {
    if (window.warwickApi?.tabs?.close) {
      await window.warwickApi.tabs.close(id);
    }
  }, []);

  const handleReload = useCallback(async () => {
    if (activeTabId && window.warwickApi?.tabs?.reload) {
      await window.warwickApi.tabs.reload(activeTabId);
    }
  }, [activeTabId]);

  const handleGoBack = useCallback(async () => {
    if (activeTabId && window.warwickApi?.tabs?.goBack) {
      await window.warwickApi.tabs.goBack(activeTabId);
    }
  }, [activeTabId]);

  const handleGoForward = useCallback(async () => {
    if (activeTabId && window.warwickApi?.tabs?.goForward) {
      await window.warwickApi.tabs.goForward(activeTabId);
    }
  }, [activeTabId]);

  const handleNavigate = useCallback(async (url: string) => {
    if (activeTabId && window.warwickApi?.tabs?.navigate) {
      await window.warwickApi.tabs.navigate(activeTabId, url);
    } else if (window.warwickApi?.tabs?.create) {
      await window.warwickApi.tabs.create(url, { active: true });
    }
  }, [activeTabId]);

  const handleTogglePin = useCallback(async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    const nextPinned = tab ? !tab.isPinned : true;
    if (window.warwickApi?.tabs?.setPinned) {
      await window.warwickApi.tabs.setPinned(id, nextPinned);
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isPinned: nextPinned } : t))
      );
    }
  }, [tabs]);

  const handleToggleMute = useCallback(async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    const nextMuted = tab ? !tab.isMuted : true;
    if (window.warwickApi?.tabs?.setMuted) {
      await window.warwickApi.tabs.setMuted(id, nextMuted);
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isMuted: nextMuted } : t))
      );
    }
  }, [tabs]);

  const handleToggleBookmark = useCallback(async () => {
    if (!activeTab?.url || activeTab.url === 'about:blank') return;

    try {
      if (isBookmarked) {
        if (window.warwickApi?.bookmarks?.remove) {
          await window.warwickApi.bookmarks.remove(activeTab.url);
          setIsBookmarked(false);
        }
      } else if (window.warwickApi?.bookmarks?.add) {
        await window.warwickApi.bookmarks.add({
          url: activeTab.url,
          title: activeTab.title || activeTab.url,
          faviconUrl: activeTab.faviconUrl
        });
        setIsBookmarked(true);
      }
    } catch (err) {
      console.error('Failed to update bookmark:', err);
    }
  }, [activeTab, isBookmarked]);

  const handleTriggerAi = useCallback((prompt: string) => {
    setIsAgentOpen(true);
    if (prompt) {
      setAgentDraftPrompt(prompt);
    }
  }, []);

  // Feature 26: Cycle active tab forward / backward
  const handleCycleTab = useCallback((direction: 1 | -1) => {
    if (tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    handleSwitchTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, handleSwitchTab]);

  // Main process shortcuts dispatch subscription
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    if (window.warwickApi?.shortcuts?.onFocusOmnibox) {
      unsubs.push(window.warwickApi.shortcuts.onFocusOmnibox(() => {
        const omniboxInput = document.querySelector('input[placeholder*="Search or enter URL"]') as HTMLInputElement | null;
        if (omniboxInput) {
          omniboxInput.focus();
          omniboxInput.select();
        }
      }));
    }
    if (window.warwickApi?.shortcuts?.onToggleAiDrawer) {
      unsubs.push(window.warwickApi.shortcuts.onToggleAiDrawer(() => {
        setIsAgentOpen((prev) => !prev);
      }));
    }
    if (window.warwickApi?.shortcuts?.onOpenSettings) {
      unsubs.push(window.warwickApi.shortcuts.onOpenSettings(() => {
        setIsSettingsOpen((prev) => !prev);
      }));
    }
    if (window.warwickApi?.shortcuts?.onToggleFunnelAutopsy) {
      unsubs.push(window.warwickApi.shortcuts.onToggleFunnelAutopsy(() => {
        setIsSettingsOpen(false);
        setIsFunnelAutopsyOpen((prev) => !prev);
      }));
    }
    return () => {
      for (const u of unsubs) u();
    };
  }, []);

  // Feature 26: Comprehensive Keyboard Shortcuts with Input Focus Filtering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTextInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      // 1. Ctrl+T: New tab
      if (isMod && !e.shiftKey && !e.altKey && key === 't') {
        e.preventDefault();
        handleCreateTab();
        return;
      }

      // 2. Ctrl+W: Close active tab
      if (isMod && !e.shiftKey && !e.altKey && key === 'w') {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
        return;
      }

      // 3. Ctrl+Tab / Ctrl+Shift+Tab: Cycle active tab forward / backward
      if (isMod && !e.altKey && key === 'tab') {
        e.preventDefault();
        handleCycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      // 4. Ctrl+K or Ctrl+L: Focus Omnibox
      if (isMod && !e.shiftKey && !e.altKey && (key === 'k' || key === 'l')) {
        e.preventDefault();
        const omniboxInput = document.querySelector('input[placeholder*="Search or enter URL"]') as HTMLInputElement | null;
        if (omniboxInput) {
          omniboxInput.focus();
          omniboxInput.select();
        }
        return;
      }

      // 5. Ctrl+J: Toggle Antigravity Copilot drawer
      if (isMod && !e.shiftKey && !e.altKey && key === 'j') {
        e.preventDefault();
        setIsAgentOpen((prev) => !prev);
        return;
      }

      // 6. Ctrl+R or F5: Reload active tab (suppressed inside inputs to prevent data loss)
      if (!isTextInput && (
        (isMod && !e.shiftKey && !e.altKey && key === 'r') ||
        (!isMod && !e.shiftKey && !e.altKey && (key === 'f5' || e.code === 'F5'))
      )) {
        e.preventDefault();
        handleReload();
        return;
      }

      // 7. Alt+Left / Alt+Right: Navigation back / forward (suppressed inside inputs)
      if (!isTextInput && e.altKey && !isMod) {
        if (key === 'arrowleft') {
          e.preventDefault();
          handleGoBack();
          return;
        }
        if (key === 'arrowright') {
          e.preventDefault();
          handleGoForward();
          return;
        }
      }

      // 8. Ctrl+,: Open Settings modal
      if (isMod && !e.shiftKey && !e.altKey && (key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // Ctrl+S: Toggle sidebar
      if (isMod && !e.shiftKey && !e.altKey && key === 's') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activeTabId, tabs, handleCreateTab, handleCloseTab, handleCycleTab, handleReload, handleGoBack, handleGoForward]);

  // Funnel Autopsy owns its own accelerators so the core browser shortcut
  // matrix stays independent from optional feature panels.
  useEffect(() => {
    const handleAutopsyKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (isMod && e.shiftKey && !e.altKey && key === 'f') {
        e.preventDefault();
        setIsSettingsOpen(false);
        setIsFunnelAutopsyOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && isFunnelAutopsyOpen) {
        e.preventDefault();
        setIsFunnelAutopsyOpen(false);
      }
    };
    window.addEventListener('keydown', handleAutopsyKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleAutopsyKeyDown, { capture: true });
  }, [isFunnelAutopsyOpen]);

  // Settings always takes precedence over the feature panel.
  useEffect(() => {
    if (isSettingsOpen) setIsFunnelAutopsyOpen(false);
  }, [isSettingsOpen]);

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] font-sans antialiased"
    >
      {/* 1. Arc/Strawberry-style Vertical Tabs Sidebar */}
      <Sidebar
        tabs={tabs}
        activeTabId={activeTabId}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onCreateTab={handleCreateTab}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onTogglePin={handleTogglePin}
        onToggleMute={handleToggleMute}
        onOpenSettings={handleOpenSettings}
        onOpenFunnelAutopsy={handleOpenFunnelAutopsy}
        onTransitionEnd={reportBounds}
      />

      {/* 2. Main Content & Omnibox Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header / Omnibox Bar */}
        <NavBar
          activeTab={activeTab}
          tabs={tabs}
          onSwitchTab={handleSwitchTab}
          onCloseTab={handleCloseTab}
          onCreateTab={handleCreateTab}
          onTogglePin={handleTogglePin}
          onToggleMute={handleToggleMute}
          onNavigate={handleNavigate}
          onReload={handleReload}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onTriggerAi={handleTriggerAi}
          isAgentOpen={isAgentOpen}
          onToggleAgent={() => setIsAgentOpen((prev) => !prev)}
          isBookmarked={isBookmarked}
          onToggleBookmark={handleToggleBookmark}
          language={language}
          onToggleLanguage={handleToggleLanguage}
        />

        {/* 3. Native WebContentsView Placeholder (#web-container) */}
        <div id="web-container" ref={webContainerRef} className="flex-1 w-full h-full relative bg-[var(--bg-app)]">
          {isStartPage && (
            <MarketingHome
              onTriggerAi={handleTriggerAi}
              onNavigate={handleNavigate}
              onOpenFunnelAutopsy={handleOpenFunnelAutopsy}
              language={language}
              onToggleLanguage={handleToggleLanguage}
            />
          )}
        </div>
      </div>

      {/* 4. Collapsible AI Assistant Drawer */}
      <AntigravityDrawer
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        activeTab={activeTab}
        draftPrompt={agentDraftPrompt}
        onDraftPromptChange={setAgentDraftPrompt}
        onTransitionEnd={reportBounds}
      />

      {/* 5. Settings Modal (Feature 27) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
      />

      {/* 6. Funnel Autopsy — AI persona diagnostics */}
      <FunnelAutopsyPanel
        isOpen={isFunnelAutopsyOpen}
        onClose={handleCloseFunnelAutopsy}
        defaultUrl={!isStartPage ? activeTab?.url : ''}
      />

      {/* 7. Red Sarab overlay — AI control click feedback */}
      <SarabOverlay />
    </div>
  );
}
