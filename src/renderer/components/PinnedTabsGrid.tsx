import React, { useState } from 'react';
import { Globe, RotateCw, X } from 'lucide-react';
import type { TabState } from '../../shared/types';

export interface PinnedTabsGridProps {
  pinnedTabs: TabState[];
  activeTabId: string;
  isCollapsed: boolean;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onTogglePin?: (id: string) => void;
}

export const PinnedTabsGrid: React.FC<PinnedTabsGridProps> = ({
  pinnedTabs,
  activeTabId,
  isCollapsed,
  onSwitch,
  onClose,
  onTogglePin
}) => {
  const [failedFavicons, setFailedFavicons] = useState<Record<string, boolean>>({});

  if (pinnedTabs.length === 0) return null;

  const handleImageError = (id: string) => {
    setFailedFavicons((prev) => ({ ...prev, [id]: true }));
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      onClose(id);
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col gap-[var(--row-gap)] items-center px-1 mb-2">
        {pinnedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isFailed = failedFavicons[tab.id];

          return (
            <div
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              className={`group relative flex items-center justify-center w-[var(--row-height)] h-[var(--row-height)] rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] ring-1 ring-[var(--border-accent)] shadow-sm'
                  : 'text-[var(--text-secondary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
              }`}
              title={tab.title || tab.url}
            >
              {isActive && (
                <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-3 rounded-r-full bg-[var(--accent)] shadow-sm" />
              )}

              {tab.isLoading ? (
                <RotateCw size={14} className="animate-spin text-[var(--accent)] shrink-0" />
              ) : tab.faviconUrl && !isFailed ? (
                <img
                  src={tab.faviconUrl}
                  alt=""
                  onError={() => handleImageError(tab.id)}
                  className="w-4 h-4 object-contain rounded-sm"
                />
              ) : (
                <Globe size={14} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
              )}
            </div>
          );
        })}
        <div className="w-6 border-b border-[var(--border-subtle)] my-1" />
      </div>
    );
  }

  return (
    <div className="px-2 mb-2">
      <div className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)] px-1 mb-1.5 uppercase select-none flex items-center justify-between">
        <span>Pinned</span>
        <span className="text-[9px] px-1 rounded bg-[var(--bg-surface-hover)] text-[var(--text-muted)]">{pinnedTabs.length}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {pinnedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isFailed = failedFavicons[tab.id];

          return (
            <div
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              className={`group relative aspect-square rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                isActive
                  ? 'bg-[var(--bg-tab-active)] border-[var(--border-accent)] shadow-sm'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
              }`}
              title={tab.title || tab.url}
            >
              {/* Favicon or loader */}
              {tab.isLoading ? (
                <RotateCw size={14} className="animate-spin text-[var(--accent)]" />
              ) : tab.faviconUrl && !isFailed ? (
                <img
                  src={tab.faviconUrl}
                  alt=""
                  onError={() => handleImageError(tab.id)}
                  className="w-4 h-4 object-contain rounded-sm"
                />
              ) : (
                <Globe size={14} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
              )}

              {/* Active bottom amber dot */}
              {isActive && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-sm" />
              )}

              {/* Close / Unpin hover button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTogglePin) onTogglePin(tab.id);
                  else onClose(tab.id);
                }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Unpin Tab"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="border-b border-[var(--border-subtle)] mt-2.5 mb-1.5" />
    </div>
  );
};

export default PinnedTabsGrid;
