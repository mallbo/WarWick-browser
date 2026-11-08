import React, { useState } from 'react';
import {
  Sparkles,
  ShoppingCart,
  Target,
  Flame,
  TrendingUp,
  Send,
  Globe
} from 'lucide-react';
import { warwickWolfImg } from '../assets';

export interface MarketingHomeProps {
  onTriggerAi: (prompt: string) => void;
  onNavigate: (url: string) => void;
}

export const MarketingHome: React.FC<MarketingHomeProps> = ({
  onTriggerAi,
  onNavigate
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [targetUrl, setTargetUrl] = useState('');

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      onTriggerAi(`${trimmed}\n\n[رابط المتجر المستهدف: ${targetUrl.trim()}]`);
    } else {
      onTriggerAi(trimmed);
    }
    setPromptInput('');
  };

  const handleCardClick = (basePrompt: string) => {
    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      onTriggerAi(`${basePrompt}\n\n[رابط المتجر المراد تحليله: ${targetUrl.trim()}]`);
    } else {
      onTriggerAi(`${basePrompt}\n\nيرجى كتابة أو لصق رابط المتجر/الصفحة المراد تطبيق الفحص عليه.`);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[var(--bg-app)] text-[var(--text-primary)] overflow-y-auto select-none">
      <div className="max-w-2xl w-full flex flex-col items-center text-center space-y-6 my-auto">
        
        {/* Brand & Wolf Avatar */}
        <div className="relative group">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[var(--border-accent)] shadow-xl shadow-black/30 p-1 bg-[var(--bg-panel)] transition-transform duration-300 group-hover:scale-105">
            <img
              src={warwickWolfImg}
              alt="WarWick Marketing AI"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md">
            <Sparkles size={14} />
          </div>
        </div>

        {/* Headings */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--border-accent-soft)] text-[var(--accent)] text-xs font-medium mb-3">
            <span>WarWick Marketing AI Browser</span>
            <span className="text-[10px] bg-[var(--accent-soft-strong)] px-1.5 py-0.5 rounded text-[var(--accent-bright)]">Antigravity 3.8 Flash</span>
          </div>
          <p className="text-sm md:text-base text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
            مساعدك التسويقي المباشر لتحليل المتاجر، مضاعفة معدلات التحويل (CRO)، وهندسة الإعلانات المربحة.
          </p>
        </div>

        {/* Store URL Optional Quick Bar */}
        <div className="w-full max-w-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-2 shadow-lg shadow-black/40">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <Globe size={14} className="text-[var(--accent)] shrink-0" />
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="اكتب أو الصق رابط المتجر هنا (اختياري: مثلاً https://example.com)..."
              className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
            />
          </div>

          {/* Chat / Prompt Input */}
          <form onSubmit={handleSendPrompt} className="flex items-center gap-2 p-1.5">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="اطلب أي تحليل تسويقي أو استفسار من Antigravity..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={!promptInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-bright)] disabled:opacity-40 disabled:hover:bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold transition-all cursor-pointer shadow-md shadow-black/30"
            >
              <span>إرسال</span>
              <Send size={13} />
            </button>
          </form>
        </div>

        {/* 4 Quick Marketing Actions */}
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          
          {/* Card 1: CRO Audit */}
          <button
            type="button"
            onClick={() => handleCardClick('قم بإجراء فحص شامل لمعدل التحويل (CRO) لهذا المتجر/الموقع، واذكر أهم 5 نقاط احتكاك تمنع الزوار من إتمام الشراء، مع حلول فورية قابلة للتطبيق.')}
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:bg-[var(--accent-soft-strong)] transition-colors shrink-0">
              <ShoppingCart size={18} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                فحص معدل التحويل (CRO)
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                تحليل تدفق الشراء، سرعة اتخاذ القرار، وضوح الـ CTA، ونقاط الاحتكاك.
              </p>
            </div>
          </button>

          {/* Card 2: Competitor Analysis */}
          <button
            type="button"
            onClick={() => handleCardClick('حلل هذا المتجر مقارنة بأبرز المنافسين في مجاله: ما هي نقاط القوة والضعف؟ وما هي الفجوات التسويقية التي يمكن استغلالها لزيادة المبيعات؟')}
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:bg-[var(--accent-soft-strong)] transition-colors shrink-0">
              <Target size={18} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                تحليل المتجر والمنافسين
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                كشف نقاط القوة، الفجوات في السوق، واستراتيجيات التفوق التنافسي.
              </p>
            </div>
          </button>

          {/* Card 3: Ad Hooks & Angles */}
          <button
            type="button"
            onClick={() => handleCardClick('استخرج 5 هوكات إعلانية توقف السكرول (Scroll-stopping hooks) وزوايا تسويقية جذابة لترويج هذا المتجر ومنتجاته على TikTok و Meta و Google.')}
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:bg-[var(--accent-soft-strong)] transition-colors shrink-0">
              <Flame size={18} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                استخراج هوكات إعلانية
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                5 هوكات توقف السكرول مع زوايا بيع مبتكرة لحملات TikTok و Meta.
              </p>
            </div>
          </button>

          {/* Card 4: Offer & Landing Page Audit */}
          <button
            type="button"
            onClick={() => handleCardClick('حلل قوة العرض التسويقي (Main Offer) في هذه الصفحة: هل العنوان جذاب؟ هل الضمان يزيل مخاوف الشراء؟ وكيف نزيد الثقة في أول 3 ثوانٍ؟')}
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:bg-[var(--accent-soft-strong)] transition-colors shrink-0">
              <TrendingUp size={18} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                تدقيق العرض والصفحة
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                مراجعة العنوان، الضمانات، عناصر الثقة، ومدى جاهزية العرض للترويج.
              </p>
            </div>
          </button>

        </div>

      </div>
    </div>
  );
};
