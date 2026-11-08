import React from 'react';
import { Plus } from 'lucide-react';

export interface NewTabButtonProps {
  isCollapsed: boolean;
  onClick: () => void;
}

export const NewTabButton: React.FC<NewTabButtonProps> = ({ isCollapsed, onClick }) => {
  if (isCollapsed) {
    return (
      <div className="p-2 flex justify-center">
        <button
          onClick={onClick}
          className="w-[var(--row-height)] h-[var(--row-height)] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] flex items-center justify-center transition-all shadow-sm group"
          title="New Tab (Ctrl+T)"
        >
          <Plus size={16} className="text-[var(--accent)] group-hover:scale-110 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 py-[var(--control-pad-y)]">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between px-3 py-[var(--control-pad-y)] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-sm text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent-soft)] transition-all shadow-sm group"
        title="New Tab (Ctrl+T)"
      >
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-[var(--accent)] group-hover:rotate-90 transition-transform duration-200" />
          <span className="text-xs font-medium text-[var(--text-primary)]">New Tab</span>
        </div>
        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors select-none">
          Ctrl+T
        </kbd>
      </button>
    </div>
  );
};

export default NewTabButton;
