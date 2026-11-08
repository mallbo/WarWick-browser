import React from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Skull
} from 'lucide-react';
import type { TabState } from '../../shared/types';
import { THEME_CONSTANTS } from '../../shared/types';
import { NewTabButton } from './NewTabButton';
import { TabBar } from './TabBar';
import { WolfAvatar } from './WolfAvatar';

export interface SidebarProps {
  tabs: TabState[];
  activeTabId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCreateTab: () => void;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onOpenSettings?: () => void;
  onOpenFunnelAutopsy?: () => void;
  onTransitionEnd?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tabs,
  activeTabId,
  isCollapsed,
  onToggleCollapse,
  onCreateTab,
  onSwitchTab,
  onCloseTab,
  onTogglePin,
  onToggleMute,
  onOpenSettings,
  onOpenFunnelAutopsy,
  onTransitionEnd,
}) => {
  return (
    <aside
      onTransitionEnd={onTransitionEnd}
      style={{
        width: isCollapsed
          ? THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH
          : THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH,
        minWidth: isCollapsed
          ? THEME_CONSTANTS.SIDEBAR_COLLAPSED_WIDTH
          : THEME_CONSTANTS.SIDEBAR_EXPANDED_WIDTH
      }}
      className="h-full transition-[width] duration-200 ease-in-out bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex flex-col justify-between shrink-0 select-none z-20 relative"
    >
      {/* 1. Header: Brand & Collapse Toggle */}
      <div className="flex flex-col shrink-0">
        <div className="h-12 flex items-center justify-between px-3 border-b border-[var(--border-subtle)] app-drag">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap app-no-drag">
              <WolfAvatar
                id="warwick-brand-avatar"
                size={24}
                alt="WarWick Wolf"
              />
              <span className="font-semibold text-xs tracking-wide text-[var(--text-primary)] flex items-center gap-1.5">
                WarWick
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]">
                  AI
                </span>
              </span>
            </div>
          ) : (
            <div className="mx-auto app-no-drag">
              <WolfAvatar
                id="warwick-brand-avatar"
                size={24}
                alt="WarWick Wolf"
              />
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors app-no-drag"
            title={isCollapsed ? 'Expand Sidebar (Ctrl+S)' : 'Collapse Sidebar (Ctrl+S)'}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* 2. New Tab Button */}
        <NewTabButton isCollapsed={isCollapsed} onClick={onCreateTab} />
      </div>

      {/* 3. Main Vertical Tab Strip (Pinned + Regular) */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        isCollapsed={isCollapsed}
        onSwitchTab={onSwitchTab}
        onCloseTab={onCloseTab}
        onTogglePin={onTogglePin}
        onToggleMute={onToggleMute}
      />

      {/* 4. Bottom Footer: Settings & Status */}
      <div className="p-2 border-t border-[var(--border-subtle)] shrink-0 bg-[var(--bg-sidebar)] app-no-drag space-y-1">
        <button
          onClick={onOpenFunnelAutopsy}
          className={`w-full flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'justify-start px-2.5'
          } py-2 rounded-lg text-xs text-[var(--accent)] hover:text-[var(--accent-bright)] bg-[var(--accent-soft)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-accent-soft)] transition-colors gap-2 group`}
          title="Funnel Autopsy (Ctrl+Shift+F)"
        >
          <Skull size={15} className="group-hover:-rotate-6 transition-transform duration-200" />
          {!isCollapsed && <span className="font-medium text-xs">Funnel Autopsy</span>}
        </button>
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'justify-start px-2.5'
          } py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors gap-2 group`}
          title="Settings (Ctrl+,)"
        >
          <Settings size={15} className="group-hover:rotate-45 transition-transform duration-200" />
          {!isCollapsed && <span className="font-normal text-xs">Settings</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
