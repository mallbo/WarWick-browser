import React from 'react';
import { Plus, X, VolumeX, Pin } from 'lucide-react';
import type { TabState } from '../../shared/types';

export interface TopTabsProps {
  tabs: TabState[];
  activeTabId: string;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateTab: () => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
}

export const TopTabs: React.FC<TopTabsProps> = ({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onCreateTab,
  onTogglePin,
  onToggleMute
}) => {
  return (
    <div className="flex items-center h-8 px-1 gap-1 overflow-x-auto select-none no-scrollbar app-no-drag flex-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const displayTitle = tab.title || (tab.url === 'about:blank' ? 'New Tab' : tab.url) || 'New Tab';

        return (
          <div
            key={tab.id}
            onClick={() => onSwitchTab(tab.id)}
            className={`group relative flex items-center h-7 px-2.5 max-w-[190px] min-w-[110px] rounded-t-md text-xs cursor-pointer border-t-2 transition-all duration-150 ${
              isActive
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--accent)] shadow-sm'
                : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            }`}
            title={tab.url}
          >
            {/* Status dot / Favicon */}
            <span
              className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${
                tab.isLoading
                  ? 'bg-[var(--accent)] animate-ping'
                  : isActive
                  ? 'bg-amber-400'
                  : 'bg-[var(--text-muted)]'
              }`}
            />

            {/* Tab Title */}
            <span className="truncate flex-1 font-medium text-[11px]">
              {displayTitle}
            </span>

            {/* Pin Indicator */}
            {tab.isPinned && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin?.(tab.id);
                }}
                className="text-[var(--accent)] ml-1 shrink-0 hover:text-white"
                title="Pinned Tab"
              >
                <Pin size={10} fill="currentColor" />
              </button>
            )}

            {/* Mute Indicator */}
            {tab.isMuted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMute?.(tab.id);
                }}
                className="text-[var(--accent)] ml-1 hover:text-[var(--text-primary)] shrink-0"
                title="Unmute tab"
              >
                <VolumeX size={11} />
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className={`p-0.5 ml-1.5 rounded hover:bg-[var(--bg-surface-hover)] hover:text-white transition-opacity ${
                isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
              }`}
              title="Close tab (Ctrl+W)"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* New Tab Button */}
      <button
        onClick={onCreateTab}
        className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0 ml-1"
        title="New Tab (Ctrl+T)"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};
