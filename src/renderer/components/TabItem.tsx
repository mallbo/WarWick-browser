import React, { useState } from 'react';
import {
  Globe,
  FileText,
  RotateCw,
  X,
  VolumeX,
  Pin,
  AlertCircle
} from 'lucide-react';
import type { TabState } from '../../shared/types';

export interface TabItemProps {
  tab: TabState;
  isActive: boolean;
  isCollapsed: boolean;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
}

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  isCollapsed,
  onSwitch,
  onClose,
  onTogglePin,
  onToggleMute,
}) => {
  const [faviconFailed, setFaviconFailed] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click closes tab instantly
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      onClose(tab.id);
    }
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(tab.id);
  };

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTogglePin) {
      onTogglePin(tab.id);
    }
  };

  const handleMuteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleMute) {
      onToggleMute(tab.id);
    }
  };

  // Render favicon / loading indicator / crash badge
  const renderIcon = () => {
    if (tab.isCrashed) {
      return <AlertCircle size={15} className="text-red-400 shrink-0" />;
    }

    if (tab.isLoading) {
      return <RotateCw size={14} className="animate-spin text-[var(--accent)] shrink-0" />;
    }

    if (tab.faviconUrl && !faviconFailed) {
      return (
        <img
          src={tab.faviconUrl}
          alt=""
          onError={() => setFaviconFailed(true)}
          className="w-4 h-4 object-contain rounded-sm shrink-0"
        />
      );
    }

    if (tab.url.startsWith('about:') || !tab.url) {
      return <FileText size={14} className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />;
    }

    return <Globe size={14} className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />;
  };

  // Collapsed Mode (52px): Icon-only
  if (isCollapsed) {
    return (
      <div
        onClick={() => onSwitch(tab.id)}
        onMouseDown={handleMouseDown}
        className={`group relative flex items-center justify-center w-[var(--row-height)] h-[var(--row-height)] mx-auto rounded-lg cursor-pointer transition-all ${
          isActive
            ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] shadow-inner ring-1 ring-[var(--border-accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
        }`}
        title={tab.title || tab.url || 'Tab'}
      >
        {/* Active subtle amber indicator dot for collapsed mode */}
        {isActive && (
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-3 rounded-r-full bg-[var(--accent)] shadow-sm" />
        )}
        {renderIcon()}
      </div>
    );
  }

  // Expanded Mode (240px): Full Tab Row
  return (
    <div
      onClick={() => onSwitch(tab.id)}
      onMouseDown={handleMouseDown}
      className={`group relative flex items-center justify-between px-2.5 py-[var(--control-pad-y)] h-[var(--row-height)] rounded-lg cursor-pointer transition-all border ${
        isActive
          ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] font-medium border-[var(--border-subtle)] shadow-sm'
          : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
      }`}
      title={tab.title || tab.url}
    >
      {/* Active tab amber pill accent on left edge */}
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--accent)] shadow-sm" />
      )}

      {/* Favicon & Title */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
        <div className="w-4 h-4 shrink-0 flex items-center justify-center">
          {renderIcon()}
        </div>
        <span className="text-xs truncate whitespace-nowrap block tab-title-mask select-none flex-1 font-normal tracking-normal text-[var(--text-primary)]">
          {tab.title || tab.url || 'New Tab'}
        </span>
      </div>

      {/* Right Action Icons (Pin / Mute / Close) */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Audio / Mute indicator */}
        {tab.isMuted ? (
          <button
            onClick={handleMuteClick}
            className="p-1 rounded hover:bg-[var(--bg-surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Unmute Tab"
          >
            <VolumeX size={12} />
          </button>
        ) : null}

        {/* Pin toggle button on hover */}
        {onTogglePin && (
          <button
            onClick={handlePinClick}
            className={`p-1 rounded hover:bg-[var(--bg-surface-active)] transition-opacity ${
              tab.isPinned
                ? 'opacity-100 text-[var(--accent)]'
                : 'opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title={tab.isPinned ? 'Unpin Tab' : 'Pin Tab'}
          >
            <Pin size={12} className={tab.isPinned ? 'rotate-45' : ''} />
          </button>
        )}

        {/* Close Button on Hover */}
        <button
          onClick={handleCloseClick}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-opacity"
          title="Close Tab (Ctrl+W)"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};

export default TabItem;
