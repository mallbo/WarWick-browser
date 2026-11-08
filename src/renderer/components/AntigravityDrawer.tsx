import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  FileText,
  Camera,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Maximize2,
  RotateCcw,
  Send,
  Square,
  ExternalLink,
  Brain,
  Search,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowUpRight,
  Globe,
  Target
} from 'lucide-react';
import type { TabState, ResearchStep, PageContext } from '../../shared/types';
import { WolfAvatar } from './WolfAvatar';

// =============================================================================
// Interfaces & Types
// =============================================================================

export interface AntigravityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: TabState;
  draftPrompt?: string;
  onDraftPromptChange?: (prompt: string) => void;
  onTransitionEnd?: () => void;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  runId?: string;
  context?: {
    url?: string;
    title?: string;
    selectedText?: string;
    hasScreenshot?: boolean;
    screenshotBase64?: string;
  };
  steps?: ResearchStep[];
  isStreaming?: boolean;
  error?: string;
}

interface QuickActionConfig {
  id: string;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  prompt: string;
}

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    id: 'summarize',
    label: 'لخّص الصفحة',
    shortDesc: 'النقاط الأساسية في ثوانٍ',
    icon: FileText,
    prompt: 'لخّص هذه الصفحة في نقاط واضحة، مع ذكر أهم التفاصيل والأرقام والاستنتاجات.'
  },
  {
    id: 'translate',
    label: 'ترجمة فورية',
    shortDesc: 'إلى العربية بدون مغادرة التبويب',
    icon: Globe,
    prompt: 'ترجم محتوى هذه الصفحة إلى العربية مع الحفاظ على المصطلحات التقنية كما هي.'
  },
  {
    id: 'compare',
    label: 'تحليل ومقارنة',
    shortDesc: 'الفروق الجوهرية وأيها أنسب',
    icon: Target,
    prompt: 'حلّل محتوى هذه الصفحة وقارنه بأهم البدائل، واذكر الفروق الجوهرية وأي خيار أنسب ولماذا.'
  },
  {
    id: 'research',
    label: 'بحث معمّق',
    shortDesc: 'مصادر متعددة بخلاصة موثقة',
    icon: Layers,
    prompt: 'ابحث بعمق في هذا الموضوع من عدة مصادر، ولخّص النتائج مع روابط المصادر.'
  }
];

// =============================================================================
// Sub-Component: Code Block with Copy Button
// =============================================================================

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono text-[11px]">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          title="Copy code"
        >
          {copied ? <Check size={12} className="text-[var(--accent)]" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--text-primary)]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// =============================================================================
// Sub-Component: Standalone Zero-Dependency Markdown Renderer
// =============================================================================

const MarkdownRenderer: React.FC<{ content: string; isStreaming?: boolean }> = ({ content, isStreaming }) => {
  const formatInline = (str: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = str;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Inline code `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(
          <code key={keyIdx++} className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-active)] text-[var(--accent-bright)] font-mono text-[11px]">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Bold **bold**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={keyIdx++} className="font-semibold text-[var(--text-primary)]">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic *italic*
      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        parts.push(<em key={keyIdx++} className="italic text-[var(--text-secondary)]">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Plain character advance
      const nextSpecial = remaining.search(/[`*]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial > 0) {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      } else {
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      }
    }

    return <>{parts}</>;
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Headings
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-xs font-semibold text-[var(--accent)] mt-2 mb-1">{line.slice(4)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-sm font-semibold text-[var(--text-primary)] mt-3 mb-1 border-b border-[var(--border-subtle)] pb-1">{line.slice(3)}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-base font-bold text-[var(--text-primary)] mt-3 mb-1">{line.slice(2)}</h1>;
      }
      // Blockquote
      if (line.startsWith('> ')) {
        return (
          <blockquote key={idx} className="border-l-2 border-[var(--border-accent)] pl-2.5 py-0.5 my-1 text-[var(--text-secondary)] italic bg-[var(--accent-soft)] rounded-r">
            {line.slice(2)}
          </blockquote>
        );
      }
      // Unordered list
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start gap-1.5 my-0.5 pl-1">
            <span className="text-[var(--accent)] mt-1">•</span>
            <span className="flex-1">{formatInline(line.slice(2))}</span>
          </div>
        );
      }
      // Ordered list
      const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        return (
          <div key={idx} className="flex items-start gap-1.5 my-0.5 pl-1">
            <span className="text-[var(--accent)] font-mono text-[10px] mt-0.5">{numMatch[1]}.</span>
            <span className="flex-1">{formatInline(numMatch[2])}</span>
          </div>
        );
      }
      // Normal line
      return line ? <p key={idx} className="my-1 leading-relaxed">{formatInline(line)}</p> : <div key={idx} className="h-1.5" />;
    });
  };

  // Split content by code fences ```
  const chunks: React.ReactNode[] = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      chunks.push(
        <div key={`text-${lastIndex}`}>
          {renderFormattedText(content.slice(lastIndex, match.index))}
        </div>
      );
    }
    chunks.push(
      <CodeBlock key={`code-${match.index}`} language={match[1]} code={match[2]} />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    chunks.push(
      <div key={`text-${lastIndex}`}>
        {renderFormattedText(content.slice(lastIndex))}
      </div>
    );
  }

  return (
    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
      {chunks}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--accent)] rounded-xs animate-pulse align-middle" />
      )}
    </div>
  );
};

// =============================================================================
// Sub-Component: Live Thought / Action Stream Accordion (Feature 17)
// =============================================================================

const ThoughtAccordion: React.FC<{ steps?: ResearchStep[]; isStreaming?: boolean }> = ({ steps = [], isStreaming }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (steps.length === 0 && !isStreaming) return null;

  const currentStep = steps[steps.length - 1];
  const progressPercent = currentStep?.progressPercent;

  const getStageIcon = (stage?: string) => {
    switch (stage) {
      case 'planning': return <Brain size={13} className="text-[var(--accent)] animate-pulse" />;
      case 'reading': return <FileText size={13} className="text-[var(--accent)] animate-pulse" />;
      case 'searching': return <Search size={13} className="text-[var(--accent)] animate-pulse" />;
      case 'synthesizing': return <Sparkles size={13} className="text-[var(--accent)] animate-spin" />;
      case 'complete': return <CheckCircle2 size={13} className="text-[var(--accent)]" />;
      case 'error': return <AlertCircle size={13} className="text-rose-400" />;
      default: return <Sparkles size={13} className="text-[var(--accent)]" />;
    }
  };

  const getStageTitle = (stage?: string) => {
    switch (stage) {
      case 'planning': return 'Planning reasoning strategy...';
      case 'reading': return 'Reading active tab DOM context...';
      case 'searching': return 'Searching candidate sources...';
      case 'synthesizing': return 'Synthesizing response...';
      case 'complete': return 'Analysis complete';
      case 'error': return 'Task interrupted or failed';
      default: return 'Thinking...';
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {getStageIcon(currentStep?.stage)}
          <span className="font-medium text-[var(--text-primary)] truncate text-[11px]">
            {currentStep?.message || getStageTitle(currentStep?.stage)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof progressPercent === 'number' && (
            <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded border border-[var(--border-accent-soft)]">
              {progressPercent}%
            </span>
          )}
          {isOpen ? <ChevronDown size={14} className="text-[var(--text-secondary)]" /> : <ChevronRight size={14} className="text-[var(--text-secondary)]" />}
        </div>
      </button>

      {/* Progress Bar Line */}
      {typeof progressPercent === 'number' && (
        <div className="w-full bg-[var(--border-subtle)] h-0.5 overflow-hidden">
          <div
            className="bg-[var(--accent)] h-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      )}

      {/* Expanded Accordion Body */}
      {isOpen && (
        <div className="p-3 flex flex-col gap-2 bg-[var(--bg-sidebar)] border-t border-[var(--border-subtle)]">
          <div className="flex flex-col gap-1.5">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="mt-0.5 shrink-0 text-[var(--accent)]">›</span>
                <div className="flex-1">
                  <span className="text-[var(--text-secondary)]">{step.message}</span>
                  {step.currentUrl && (
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5">
                      URL: {step.currentUrl}
                    </div>
                  )}
                  {step.sources && step.sources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {step.sources.map((src, sIdx) => (
                        <a
                          key={sIdx}
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--accent)] hover:text-[var(--accent-bright)] text-[10px] transition-colors"
                          title={src.snippet || src.url}
                        >
                          <span className="truncate max-w-[140px]">{src.title}</span>
                          <ArrowUpRight size={10} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Sub-Component: Screenshot Expand Modal
// =============================================================================

const ScreenshotModal: React.FC<{
  imageUrl: string | null;
  onClose: () => void;
  pageTitle?: string;
}> = ({ imageUrl, onClose, pageTitle }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl max-h-[90vh] bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="h-10 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-primary)] truncate">
            <Camera size={14} className="text-[var(--accent)]" />
            <span className="font-medium truncate">{pageTitle || 'Active Page Viewport Snapshot'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-2 overflow-auto flex items-center justify-center bg-[var(--bg-app)]">
          <img
            src={imageUrl.startsWith('data:') ? imageUrl : `data:image/jpeg;base64,${imageUrl}`}
            alt="Page Viewport"
            className="max-w-full max-h-[78vh] object-contain rounded border border-[var(--border-subtle)]"
          />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Primary Component: AntigravityDrawer
// =============================================================================

export const AntigravityDrawer: React.FC<AntigravityDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  draftPrompt = '',
  onDraftPromptChange,
  onTransitionEnd
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [includeScreenshot, setIncludeScreenshot] = useState<boolean>(false);
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  // Sync draftPrompt from Omnibox if changed externally
  useEffect(() => {
    if (draftPrompt) {
      setInputPrompt(draftPrompt);
    }
  }, [draftPrompt]);

  // Autoscroll to bottom upon new message or stream chunk
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to agent stream chunks & action events
  useEffect(() => {
    if (!window.warwickApi?.agent) return;

    const unChunk = window.warwickApi.agent.onStreamChunk((chunk: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') {
          const newAssistantMsg: ChatMessage = {
            id: `msg-assistant-${Date.now()}`,
            role: 'assistant',
            content: chunk,
            timestamp: Date.now(),
            isStreaming: true
          };
          return [...prev, newAssistantMsg];
        }
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: last.content + chunk,
            isStreaming: true
          }
        ];
      });
    });

    const unAction = window.warwickApi.agent.onActionEvent((step: ResearchStep) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const isDone = step.stage === 'complete' || step.stage === 'error';

        if (isDone) {
          setIsStreaming(false);
        }

        // If no assistant message exists yet, auto-initialize one in state
        if (!last || last.role !== 'assistant') {
          const newAssistantMsg: ChatMessage = {
            id: `msg-assistant-${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            runId: step.runId,
            steps: [step],
            isStreaming: !isDone,
            error: step.stage === 'error' ? step.message : undefined
          };
          return [...prev, newAssistantMsg];
        }

        const updatedSteps = [...(last.steps || []), step];
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            steps: updatedSteps,
            isStreaming: !isDone,
            error: step.stage === 'error' ? step.message : last.error
          }
        ];
      });
    });

    return () => {
      unChunk();
      unAction();
    };
  }, []);

  // Dispatch prompt submission
  const handleSubmitPrompt = useCallback(
    async (promptToSend: string, forceIncludeScreenshot?: boolean) => {
      const trimmed = promptToSend.trim();
      if (!trimmed || isStreaming) return;

      const shouldScreenshot = forceIncludeScreenshot ?? includeScreenshot;

      // 1. Capture in-page context
      let pageContext: PageContext | undefined = undefined;
      if (window.warwickApi?.context?.captureActivePage) {
        try {
          pageContext = await window.warwickApi.context.captureActivePage(shouldScreenshot);
        } catch (err) {
          console.error('Failed to capture active page context:', err);
        }
      }

      // 2. Append User Message
      const userMessageId = `msg-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
        context: pageContext
          ? {
              url: pageContext.url,
              title: pageContext.title,
              selectedText: pageContext.selectedText,
              hasScreenshot: !!pageContext.screenshotBase64,
              screenshotBase64: pageContext.screenshotBase64
            }
          : undefined
      };

      // 3. Prepare Assistant Placeholder
      const assistantMessageId = `msg-assistant-${Date.now()}`;
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        steps: [{
          runId: 'pending',
          stage: 'planning',
          message: 'Reading active tab & planning response...',
          progressPercent: 10
        }],
        isStreaming: true
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setInputPrompt('');
      if (onDraftPromptChange) onDraftPromptChange('');
      setIsStreaming(true);

      // 4. Dispatch via IPC
      try {
        if (window.warwickApi?.agent?.sendPrompt) {
          const res = await window.warwickApi.agent.sendPrompt(trimmed, pageContext, shouldScreenshot);
          activeRunIdRef.current = res.runId;
        }
      } catch (err) {
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            ...assistantPlaceholder,
            isStreaming: false,
            error: err instanceof Error ? err.message : 'Failed to communicate with the WarWick assistant'
          }
        ]);
      }
    },
    [includeScreenshot, isStreaming, onDraftPromptChange]
  );

  // Deep background research: searches the web, harvests pages in isolated
  // background tabs, then streams a synthesized answer into this chat.
  const handleResearch = useCallback(async () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `🔎 بحث خلفي: ${trimmed}`,
      timestamp: Date.now()
    };

    const assistantMessageId = `msg-assistant-${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      steps: [{
        runId: 'pending',
        stage: 'planning',
        message: 'Planning multi-source background research...',
        progressPercent: 15
      }],
      isStreaming: true
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInputPrompt('');
    if (onDraftPromptChange) onDraftPromptChange('');
    setIsStreaming(true);

    try {
      if (window.warwickApi?.agent?.researchQuery) {
        const res = await window.warwickApi.agent.researchQuery(trimmed);
        activeRunIdRef.current = res.runId;
      } else {
        throw new Error('Background research is not available in this build.');
      }
    } catch (err) {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...assistantPlaceholder,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Failed to start background research'
        }
      ]);
    }
  }, [inputPrompt, isStreaming, onDraftPromptChange]);

  // Quick Action Click Handler
  const handleQuickAction = useCallback(
    (action: QuickActionConfig) => {
      handleSubmitPrompt(action.prompt);
    },
    [handleSubmitPrompt]
  );

  // Stop / Cancel Generation Handler
  const handleCancel = useCallback(async () => {
    if (window.warwickApi?.agent?.cancel) {
      await window.warwickApi.agent.cancel();
    }
    setIsStreaming(false);
  }, []);

  // Clear Chat History
  const handleClearChat = useCallback(() => {
    if (isStreaming) handleCancel();
    setMessages([]);
  }, [isStreaming, handleCancel]);

  return (
    <>
      <aside
        id="antigravity-drawer"
        onTransitionEnd={onTransitionEnd}
        className={`${
          isOpen ? 'w-[360px] border-l' : 'w-0 border-l-0'
        } transition-[width] duration-200 ease-in-out bg-[var(--bg-sidebar)] border-[var(--border-subtle)] overflow-hidden flex flex-col shrink-0 select-none z-10 relative`}
      >
        {/* 1. Header */}
        <div className="h-12 border-b border-[var(--border-subtle)] px-4 flex items-center justify-between shrink-0 bg-[var(--bg-sidebar)]">
          <div className="flex items-center gap-2 overflow-hidden">
            <WolfAvatar size={24} alt="WarWick" />
            <div className="flex flex-col overflow-hidden">
              <span className="font-semibold text-xs text-[var(--text-primary)]">
                WarWick AI
              </span>
              {activeTab?.title && (
                <span className="text-[10px] text-[var(--text-secondary)] truncate max-w-[190px]">
                  {activeTab.title}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                title="Clear conversation"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Close drawer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 2. Messages & Actions Scroll Container */}
        <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 text-xs">
          {/* Quick Actions Header Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-0.5">
              <span className="font-semibold uppercase tracking-wider text-[10px] text-[var(--accent)] flex items-center gap-1">
                <Layers size={11} className="text-[var(--accent)]" />
                أدوات سريعة
              </span>
              <button
                type="button"
                onClick={() => setIncludeScreenshot(!includeScreenshot)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                  includeScreenshot
                    ? 'bg-[var(--accent-soft-strong)] text-[var(--accent-bright)] border-[var(--border-accent)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
                }`}
                title="إرفاق لقطة شاشة مع الطلب"
              >
                <Camera size={11} />
                <span>+لقطة</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((action) => {
                const IconComponent = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isStreaming}
                    onClick={() => handleQuickAction(action)}
                    className="flex flex-col text-left p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] transition-all group disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--border-accent)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium text-[11px] mb-0.5">
                      <IconComponent size={13} className="text-[var(--accent)] group-hover:scale-110 transition-transform" />
                      <span className="truncate">{action.label}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] truncate">{action.shortDesc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Messages */}
          {messages.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center text-center p-4 text-[var(--text-muted)]">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] mb-2 shadow-sm">
                <Sparkles size={20} />
              </div>
              <p className="font-medium text-[var(--text-primary)] text-xs mb-1">الصفحة جاهزة للعمل عليها</p>
              <p className="text-[11px] leading-relaxed max-w-[240px]">
                اسأل عن الصفحة الحالية، لخّص مقالًا طويلًا، أو اطلب أي مهمة — أو اكتب سؤالك بالأسفل.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 mt-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {/* User Bubble */}
                  {msg.role === 'user' ? (
                    <div className="max-w-[90%] bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded-2xl rounded-tr-xs px-3.5 py-2.5 text-xs text-[var(--text-primary)] shadow-sm">
                      <p className="leading-relaxed">{msg.content}</p>

                      {/* Context Attachment Preview */}
                      {msg.context && (
                        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
                          {msg.context.url && (
                            <div className="flex items-center gap-1 truncate text-[var(--accent)] font-mono">
                              <ExternalLink size={10} />
                              <span className="truncate">{msg.context.url}</span>
                            </div>
                          )}
                          {msg.context.screenshotBase64 && (
                            <div
                              onClick={() => setActiveModalImage(msg.context!.screenshotBase64!)}
                              className="mt-1 relative group cursor-pointer rounded overflow-hidden border border-[var(--border-subtle)] max-w-[140px]"
                            >
                              <img
                                src={
                                  msg.context.screenshotBase64.startsWith('data:')
                                    ? msg.context.screenshotBase64
                                    : `data:image/jpeg;base64,${msg.context.screenshotBase64}`
                                }
                                alt="Context Snapshot"
                                className="w-full h-16 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[var(--text-primary)] gap-1 text-[9px]">
                                <Maximize2 size={11} />
                                <span>Expand</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Assistant Bubble */
                    <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-xs p-3 text-xs text-[var(--text-primary)] shadow-md flex flex-col">
                      {/* Thought Accordion */}
                      {msg.steps && msg.steps.length > 0 && (
                        <ThoughtAccordion steps={msg.steps} isStreaming={msg.isStreaming} />
                      )}

                      {/* Message Content */}
                      {msg.content ? (
                        <MarkdownRenderer content={msg.content} isStreaming={msg.isStreaming} />
                      ) : msg.isStreaming ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-1">
                          <Sparkles size={13} className="text-[var(--accent)] animate-spin" />
                          <span>Thinking through query...</span>
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--text-secondary)] py-1">
                          لم يتم استلام نص الرد. يرجى مراجعة إعدادات مفتاح Gemini API في الإعدادات.
                        </div>
                      )}

                      {/* Error state */}
                      {msg.error && (
                        <div className="mt-2 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                          <AlertCircle size={13} className="shrink-0" />
                          <span>{msg.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 3. Input Footer Bar */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitPrompt(inputPrompt);
            }}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus-within:border-[var(--border-accent)] focus-within:ring-1 focus-within:ring-[var(--border-accent-soft)] transition-all">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => {
                  setInputPrompt(e.target.value);
                  if (onDraftPromptChange) onDraftPromptChange(e.target.value);
                }}
                placeholder={isStreaming ? 'WarWick is thinking...' : 'اسأل عن هذه الصفحة أو اطلب أي مهمة...'}
                disabled={isStreaming}
                className="bg-transparent border-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none flex-1 disabled:opacity-50"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors cursor-pointer"
                  title="Stop generating"
                >
                  <Square size={13} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleResearch}
                    disabled={!inputPrompt.trim()}
                    className="p-1 rounded-md bg-[var(--bg-surface-hover)] text-[var(--accent-bright)] hover:bg-[var(--bg-surface-active)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    title="بحث خلفي متعدد المصادر (Background Research)"
                  >
                    <Layers size={13} />
                  </button>
                  <button
                    type="submit"
                    disabled={!inputPrompt.trim()}
                    className="p-1 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-bright)] disabled:opacity-30 disabled:hover:bg-[var(--accent)] transition-colors cursor-pointer disabled:cursor-not-allowed"
                    title="Send message"
                  >
                    <Send size={13} />
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </aside>

      {/* Screenshot Expand Modal */}
      <ScreenshotModal
        imageUrl={activeModalImage}
        onClose={() => setActiveModalImage(null)}
        pageTitle={activeTab?.title}
      />
    </>
  );
};

export default AntigravityDrawer;
