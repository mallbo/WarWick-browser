import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Sparkles, ShieldCheck, Star } from 'lucide-react';
import { Omnibox } from './Omnibox';
import { WindowControls } from './WindowControls';
import { TopTabs } from './TopTabs';
import { playSarab } from './SarabOverlay';
import type { TabState } from '../../shared/types';

const SARAB_LANDING_DELAY = 400;

export interface NavBarProps {
  activeTab?: TabState;
  tabs?: TabState[];
  onSwitchTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onCreateTab?: () => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onNavigate: (url: string) => void;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onTriggerAi: (prompt: string) => void;
  isAgentOpen: boolean;
  onToggleAgent: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({
  activeTab,
  tabs = [],
  onSwitchTab,
  onCloseTab,
  onCreateTab,
  onTogglePin,
  onToggleMute,
  onNavigate,
  onReload,
  onGoBack,
  onGoForward,
  onTriggerAi,
  isAgentOpen,
  onToggleAgent,
  isBookmarked,
  onToggleBookmark
}) => {
  const aiButtonRef = useRef<HTMLButtonElement | null>(null);
  const sarabBusyRef = useRef(false);

  const handleToggleAssistant = () => {
    if (sarabBusyRef.current) return;

    const origin =
      document.getElementById('warwick-brand-avatar') ||
      document.getElementById('warwick-hero-portrait');
    const target = aiButtonRef.current;

    const animated = playSarab(origin, target);
    if (!animated) {
      onToggleAgent();
      return;
    }

    // Let the mirage land before the drawer reshapes the layout.
    sarabBusyRef.current = true;
    window.setTimeout(() => {
      sarabBusyRef.current = false;
      onToggleAgent();
    }, SARAB_LANDING_DELAY);
  };

  return (
    <header className="flex flex-col border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-md shrink-0 z-10 select-none">
      {/* 1. Top Tabs & Window Controls Row */}
      <div className="flex items-center justify-between px-2 pt-1 pb-0 app-drag border-b border-white/[0.03]">
        {tabs.length > 0 && onSwitchTab && onCloseTab && onCreateTab ? (
          <TopTabs
            tabs={tabs}
            activeTabId={activeTab?.id || ''}
            onSwitchTab={onSwitchTab}
            onCloseTab={onCloseTab}
            onCreateTab={onCreateTab}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
          />
        ) : (
          <div className="flex-1" />
        )}
        <WindowControls />
      </div>

      {/* 2. Main Navigation Controls & Omnibox Row */}
      <div className="h-11 flex items-center px-3 gap-2.5 app-drag">
        {/* Navigation Controls: Back, Forward, Reload */}
        <div className="flex items-center gap-1 text-[var(--text-secondary)] app-no-drag">
          <button
            onClick={onGoBack}
            disabled={!activeTab?.canGoBack}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            title="Back (Alt+Left)"
            aria-label="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onGoForward}
            disabled={!activeTab?.canGoForward}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            title="Forward (Alt+Right)"
            aria-label="Forward"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={onReload}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            title={activeTab?.isLoading ? 'Loading page... (Click to reload)' : 'Reload page (Ctrl+R / F5)'}
            aria-label="Reload"
          >
            <RotateCw size={15} className={activeTab?.isLoading ? 'animate-spin text-[var(--accent)]' : ''} />
          </button>
          <button
            onClick={onToggleBookmark}
            disabled={!activeTab?.url || activeTab.url === 'about:blank'}
            className={`p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed ${
              isBookmarked ? 'text-[var(--accent)]' : 'hover:text-[var(--text-primary)]'
            }`}
            title={isBookmarked ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            <Star size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Floating Centered Omnibox */}
        <div className="flex-1 app-no-drag">
          <Omnibox
            activeTab={activeTab}
            onNavigate={onNavigate}
            onTriggerAi={onTriggerAi}
          />
        </div>

        {/* WarWick AI Assistant Toggle & Shield */}
        <div className="flex items-center gap-1.5 app-no-drag">
          {/* Privacy Shield Indicator */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-accent-soft)] select-none cursor-default"
            title="WarWick Shield: Ads & Trackers Blocked"
          >
            <ShieldCheck size={14} className="text-[var(--accent)]" />
            <span className="hidden md:inline text-[11px] font-mono">Protected</span>
          </div>

          <button
            ref={aiButtonRef}
            id="warwick-ai-button"
            type="button"
            onClick={handleToggleAssistant}
            aria-pressed={isAgentOpen}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
              isAgentOpen
                ? 'bg-[var(--accent-soft-strong)] text-[var(--accent-bright)] border-[var(--border-accent)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
            title="مساعد WarWick الذكي (Ctrl+J)"
            aria-label="مساعد WarWick الذكي"
          >
            <Sparkles size={12} className="text-[var(--accent)]" />
            <span className="leading-none">AI</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default NavBar;
