import React from 'react';
import type { TabState } from '../../shared/types';
import { PinnedTabsGrid } from './PinnedTabsGrid';
import { TabItem } from './TabItem';

export interface TabBarProps {
  tabs: TabState[];
  activeTabId: string;
  isCollapsed: boolean;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  isCollapsed,
  onSwitchTab,
  onCloseTab,
  onTogglePin,
  onToggleMute,
}) => {
  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const regularTabs = tabs.filter((t) => !t.isPinned);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 1. Pinned Tabs Section at top */}
      {pinnedTabs.length > 0 && (
        <PinnedTabsGrid
          pinnedTabs={pinnedTabs}
          activeTabId={activeTabId}
          isCollapsed={isCollapsed}
          onSwitch={onSwitchTab}
          onClose={onCloseTab}
          onTogglePin={onTogglePin}
        />
      )}

      {/* 2. Regular Tabs Section Header */}
      {!isCollapsed && regularTabs.length > 0 && pinnedTabs.length > 0 && (
        <div className="px-3 mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase select-none">
          Tabs
        </div>
      )}

      {/* 3. Scrollable Regular Tabs Strip */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-[var(--row-gap)] px-2 pb-2">
        {regularTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isCollapsed={isCollapsed}
            onSwitch={onSwitchTab}
            onClose={onCloseTab}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
          />
        ))}

        {regularTabs.length === 0 && pinnedTabs.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--text-muted)]">
            {!isCollapsed && 'No open tabs'}
          </div>
        )}
      </div>
    </div>
  );
};

export default TabBar;
