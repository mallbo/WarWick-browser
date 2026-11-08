import React from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Sparkles, ShieldCheck, Star } from 'lucide-react';
import { Omnibox } from './Omnibox';
import { WindowControls } from './WindowControls';
import type { TabState } from '../../shared/types';

export interface NavBarProps {
  activeTab?: TabState;
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
  return (
    <header className="h-12 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-sm flex items-center px-3 gap-2.5 shrink-0 z-10 select-none app-drag">
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

      {/* Antigravity Sidebar Toggle */}
      <div className="flex items-center gap-1.5 app-no-drag">
        {/* Privacy Shield Indicator */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--border-accent-soft)] select-none cursor-default"
          title="WarWick Shield: Ads & Trackers Blocked"
        >
          <ShieldCheck size={14} className="text-[var(--accent)]" />
          <span className="hidden md:inline text-[11px] font-mono">Protected</span>
        </div>

        <button
          onClick={onToggleAgent}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            isAgentOpen
              ? 'bg-[var(--accent-soft-strong)] text-[var(--accent-bright)] border-[var(--border-accent)] shadow-sm shadow-black/40'
              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]'
          }`}
          title="Toggle Antigravity Copilot (Ctrl+J)"
          aria-label="Toggle Antigravity Copilot"
        >
          <Sparkles size={14} className={isAgentOpen ? 'text-[var(--accent)]' : 'text-[var(--accent)]'} />
          <span>Antigravity</span>
        </button>

        {/* Windows Frameless Caption Controls */}
        <WindowControls />
      </div>
    </header>
  );
};

export default NavBar;
