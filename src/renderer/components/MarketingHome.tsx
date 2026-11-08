import React, { useState } from 'react';
import {
  Sparkles,
  Target,
  Send,
  Globe,
  FileText,
  Skull,
  TrendingUp,
  Flame,
  ArrowRight,
  Languages
} from 'lucide-react';
import { WolfAvatar } from './WolfAvatar';
import type { Language } from '../i18n';
import { translations } from '../i18n';

export interface MarketingHomeProps {
  onTriggerAi: (prompt: string) => void;
  onNavigate: (url: string) => void;
  onOpenFunnelAutopsy?: () => void;
  language?: Language;
  onToggleLanguage?: () => void;
}

export const MarketingHome: React.FC<MarketingHomeProps> = ({
  onTriggerAi,
  onNavigate,
  onOpenFunnelAutopsy,
  language = 'en',
  onToggleLanguage
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const isAr = language === 'ar';
  const t = translations[language].home;

  const quickActions = [
    {
      id: 'cro-audit',
      title: t.croTitle,
      description: t.croDesc,
      badge: t.croBadge,
      icon: TrendingUp,
      prompt: t.croPrompt
    },
    {
      id: 'competitor-spy',
      title: t.spyTitle,
      description: t.spyDesc,
      badge: t.spyBadge,
      icon: Target,
      prompt: t.spyPrompt
    },
    {
      id: 'ad-hooks',
      title: t.hooksTitle,
      description: t.hooksDesc,
      badge: t.hooksBadge,
      icon: Flame,
      prompt: t.hooksPrompt
    },
    {
      id: 'summarize',
      title: t.briefTitle,
      description: t.briefDesc,
      badge: t.briefBadge,
      icon: FileText,
      prompt: t.briefPrompt
    }
  ];

  const handleCardMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      const prefix = isAr ? '[الرابط المرجعي: ' : '[Target URL: ';
      onTriggerAi(`${trimmed}\n\n${prefix}${targetUrl.trim()}]`);
    } else {
      onTriggerAi(trimmed);
    }
    setPromptInput('');
  };

  const handleCardClick = (basePrompt: string) => {
    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      const prefix = isAr ? '[طبّق ذلك على: ' : '[Apply this to: ';
      onTriggerAi(`${basePrompt}\n\n${prefix}${targetUrl.trim()}]`);
    } else {
      onTriggerAi(basePrompt);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="w-full h-full flex flex-col items-center justify-start p-6 bg-[var(--bg-app)] text-[var(--text-primary)] overflow-y-auto select-none"
    >
      <div className="max-w-4xl w-full flex flex-col items-center space-y-6 my-auto pt-4 pb-8">

        {/* 1. Hero Brand with Cyber-Wolf Portrait & Language Toggle */}
        <div className="flex flex-col items-center text-center space-y-3 relative">
          {/* Quick Language Toggle Pill */}
          {onToggleLanguage && (
            <button
              type="button"
              onClick={onToggleLanguage}
              className="absolute -top-2 right-0 sm:right-4 flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20 transition-all cursor-pointer shadow-sm"
              title={isAr ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              <Languages size={13} />
              <span>{isAr ? 'English (EN)' : 'عربي (AR)'}</span>
            </button>
          )}

          <div className="relative group">
            <div
              className="absolute -inset-6 rounded-full opacity-40 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(217, 119, 6, 0.35) 0%, rgba(180, 83, 9, 0.15) 50%, transparent 70%)'
              }}
            />
            <div className="relative transition-transform duration-300 group-hover:scale-[1.03]">
              <WolfAvatar
                id="warwick-hero-portrait"
                size={84}
                halo
                alt="WarWick Marketing AI"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[var(--accent)] text-black shadow-lg">
              <Sparkles size={13} />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-wide text-[var(--text-primary)] flex items-center justify-center gap-2">
              <span>{t.heroTitle}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]">
                {t.badge}
              </span>
            </h1>
            <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              {t.heroSubtitle}
            </p>
          </div>
        </div>

        {/* 2. Unified Search / URL / Prompt Input Box */}
        <div className="w-full max-w-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-2 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <Globe size={14} className="text-[var(--accent)] shrink-0" />
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder={t.urlPlaceholder}
              className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
            />
          </div>

          <form onSubmit={handleSendPrompt} className="flex items-center gap-2 p-1.5">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={t.promptPlaceholder}
              className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={!promptInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-bright)] disabled:opacity-30 disabled:hover:bg-[var(--accent)] text-black text-xs font-semibold transition-all cursor-pointer shadow-md shadow-black/30 shrink-0"
            >
              <span>{t.analyzeBtn}</span>
              <Send size={13} className={isAr ? 'rotate-180' : ''} />
            </button>
          </form>
        </div>

        {/* 3. BENTO GRID: 4 Interactive Marketing Audit Modules */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {quickActions.map((action) => {
            const IconComponent = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onMouseMove={handleCardMouseMove}
                onClick={() => handleCardClick(action.prompt)}
                className={`flex flex-col justify-between p-4 rounded-xl border border-[var(--border-subtle)] spotlight-card active:scale-[0.98] transition-all group cursor-pointer relative overflow-hidden ${
                  isAr ? 'text-right' : 'text-left'
                }`}
              >
                <div className="flex items-start justify-between w-full mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]">
                    {action.badge}
                  </span>
                  <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:scale-105 transition-transform">
                    <IconComponent size={16} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                    {action.description}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] mt-3 opacity-80 group-hover:opacity-100 transition-all">
                  <span>{translations[language].common.runAudit}</span>
                  <ArrowRight size={12} className={isAr ? 'rotate-180' : ''} />
                </div>
              </button>
            );
          })}
        </div>

        {/* 4. Funnel Autopsy Diagnostic Banner */}
        <button
          type="button"
          onMouseMove={handleCardMouseMove}
          onClick={onOpenFunnelAutopsy}
          className={`w-full max-w-3xl flex items-center gap-3.5 p-4 rounded-xl border border-[var(--border-accent-soft)] spotlight-card active:scale-[0.99] transition-all group cursor-pointer shadow-xl shadow-black/30 ${
            isAr ? 'text-right' : 'text-left'
          }`}
        >
          <div className="p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:scale-105 transition-transform shrink-0">
            <Skull size={22} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                {t.autopsyTitle}
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-mono border border-[var(--border-accent-soft)]">
                {t.autopsyBadge}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
              {t.autopsyDesc}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] shrink-0">
            {t.autopsyAction}
          </span>
        </button>

        {/* 5. Shortcuts Bar */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)] font-mono">
          <span>{t.shortcutNewTab}</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>{t.shortcutOmnibox}</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>{t.shortcutAi}</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>{t.shortcutAutopsy}</span>
        </div>

      </div>
    </div>
  );
};
