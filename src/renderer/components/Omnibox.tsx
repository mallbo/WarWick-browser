import React, { useState, useEffect, useRef } from 'react';
import { Search, Lock, Globe, Sparkles } from 'lucide-react';
import type { TabState } from '../../shared/types';

export interface OmniboxProps {
  activeTab?: TabState;
  onNavigate: (url: string) => void;
  onTriggerAi: (prompt: string) => void;
}

export interface ParsedOmniboxInput {
  type: 'ai' | 'navigation';
  prompt?: string;
  url?: string;
}

/**
 * Parses user omnibox input to distinguish @ai or ? prompts from navigation/search queries.
 * Conforms to Features 12 & 13 and passing E2E tests F13-1..F13-5, B13-1..B13-5.
 */
export function parseOmniboxInput(rawInput: string): ParsedOmniboxInput {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { type: 'navigation', url: '' };
  }

  // Feature 13: @ai prefix check
  if (trimmed.startsWith('@ai')) {
    const remainder = trimmed.slice(3);
    if (remainder.length === 0 || /^\s/.test(remainder)) {
      return {
        type: 'ai',
        prompt: remainder.trim()
      };
    }
  }

  // Feature 13: ? or ??? prefix check
  if (trimmed.startsWith('?')) {
    const prompt = trimmed.replace(/^\?+\s*/, '').trim();
    return {
      type: 'ai',
      prompt
    };
  }

  return {
    type: 'navigation',
    url: trimmed
  };
}

export const Omnibox: React.FC<OmniboxProps> = ({
  activeTab,
  onNavigate,
  onTriggerAi
}) => {
  const [inputValue, setInputValue] = useState<string>(activeTab?.url || '');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const justFocusedRef = useRef<boolean>(false);
  const prevActiveTabIdRef = useRef<string | undefined>(activeTab?.id);

  // Synchronize input value with active tab URL
  useEffect(() => {
    // If active tab changed, always update and clear local edit state
    if (activeTab?.id !== prevActiveTabIdRef.current) {
      prevActiveTabIdRef.current = activeTab?.id;
      setInputValue(activeTab?.url || '');
      setIsFocused(false);
      return;
    }

    // While focused, do not overwrite user's in-progress typing
    if (!isFocused) {
      setInputValue(activeTab?.url || '');
    }
  }, [activeTab?.id, activeTab?.url, isFocused]);

  // Global hotkeys: Ctrl+L or Ctrl+K (Cmd on Mac) to focus omnibox and select all
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Selection on first click / focus
  const handleMouseDown = () => {
    if (!isFocused) {
      justFocusedRef.current = true;
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (justFocusedRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
      justFocusedRef.current = false;
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    justFocusedRef.current = false;
    // Revert to active tab URL on blur
    setInputValue(activeTab?.url || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(activeTab?.url || '');
      inputRef.current?.blur();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const parsed = parseOmniboxInput(trimmed);

    if (parsed.type === 'ai') {
      onTriggerAi(parsed.prompt || '');
      // Revert omnibox back to current URL and blur
      setInputValue(activeTab?.url || '');
      inputRef.current?.blur();
    } else {
      onNavigate(parsed.url || trimmed);
      inputRef.current?.blur();
    }
  };

  // Determine security and AI state for UI styling & icons
  const trimmed = inputValue.trim();
  const isAiQuery = parseOmniboxInput(trimmed).type === 'ai';
  const isHttps = trimmed.startsWith('https://');
  const isHttp = trimmed.startsWith('http://');

  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 max-w-2xl mx-auto relative flex items-center group select-none"
    >
      {/* Left Icon: Lock (HTTPS), Globe (HTTP), Sparkles (@ai), Search (Default) */}
      <div className="absolute left-3.5 flex items-center justify-center pointer-events-none text-[var(--text-muted)]">
        {isAiQuery ? (
          <Sparkles size={14} className="text-[var(--accent)] animate-pulse" />
        ) : isHttps ? (
          <Lock size={13} className="text-[var(--accent)]" />
        ) : isHttp ? (
          <Globe size={14} className="text-[var(--text-muted)]" />
        ) : (
          <Search size={14} className="text-[var(--text-muted)]" />
        )}
      </div>

      {/* Floating Centered Pill Input */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onMouseDown={handleMouseDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Search or enter URL, or type @ai..."
        className={`w-full bg-[var(--bg-surface)] border rounded-full py-1.5 pl-9 pr-24 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all duration-150 shadow-inner select-text ${
          isAiQuery
            ? 'border-[var(--border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)] shadow-inner'
            : 'border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-accent)] focus:ring-1 focus:ring-[var(--border-accent-soft)] focus:shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
        }`}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />

      {/* Right Side Indicator / Badge */}
      <div className="absolute right-3 flex items-center gap-1.5 pointer-events-none">
        {isAiQuery ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft-strong)] border border-[var(--border-accent)] text-[var(--accent-bright)] text-[10px] font-medium tracking-wide">
            <Sparkles size={10} className="text-[var(--accent)]" />
            <span>AI Prompt ↵</span>
          </div>
        ) : isFocused && trimmed.length > 0 ? (
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-mono">
            <span>↵ Enter</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {activeTab?.url && activeTab.url !== 'about:blank' && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono animate-island-pulse transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="tracking-wide">Marketing Lens</span>
              </span>
            )}
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
              Ctrl+K
            </span>
          </div>
        )}
      </div>
    </form>
  );
};

export default Omnibox;
