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
  ArrowRight
} from 'lucide-react';
import { WolfAvatar } from './WolfAvatar';

export interface MarketingHomeProps {
  onTriggerAi: (prompt: string) => void;
  onNavigate: (url: string) => void;
  onOpenFunnelAutopsy?: () => void;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  badge: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'cro-audit',
    title: 'فحص معدل التحويل (CRO)',
    description: 'تحليل دقيق للأزرار وسلاسة مسار الدفع ونقاط تسرب العملاء.',
    badge: '84/100 Benchmark',
    icon: TrendingUp,
    prompt: 'قم بإجراء فحص شامل لمعدل التحويل (CRO Audit) لهذه الصفحة، مع تحديد أسباب انسحاب الزوار وحلول رفع المبيعات فوراً.'
  },
  {
    id: 'competitor-spy',
    title: 'رادار المنافسين والأسعار',
    description: 'استخراج فروق الأسعار، الميزات التنافسية، وحيل العروض.',
    badge: 'Market Delta',
    icon: Target,
    prompt: 'قارن هذا المتجر بأبرز المنافسين في نفس المجال، واستخرج الفروق الجوهرية في التسعير والعروض الترويجية.'
  },
  {
    id: 'ad-hooks',
    title: 'توليد 10 خطافات إعلانية',
    description: 'خطافات سيكولوجية للتيك توك والريلز توقف التمرير في 3 ثوانٍ.',
    badge: 'High CTR Angles',
    icon: Flame,
    prompt: 'اكتب 10 خطافات إعلانية قوية (Magnetic Hooks) لهذا المنتج أو المتجر، موجهة لجمهور تيك توك وإنستجرام بأساليب سيكولوجية متنوعة.'
  },
  {
    id: 'summarize',
    title: 'ملخص تحليلي استراتيجي',
    description: 'خلاصة مركزة للمنتج والجمهور المستهدف والأرقام الحيوية.',
    badge: 'Executive Brief',
    icon: FileText,
    prompt: 'لخّص هذه الصفحة تسويقياً في نقاط واضحة مع ذكر أهم الأرقام والملاحظات المؤثرة على قرار الشراء.'
  }
];

export const MarketingHome: React.FC<MarketingHomeProps> = ({
  onTriggerAi,
  onNavigate,
  onOpenFunnelAutopsy
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [targetUrl, setTargetUrl] = useState('');

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      onTriggerAi(`${trimmed}\n\n[الرابط المرجعي: ${targetUrl.trim()}]`);
    } else {
      onTriggerAi(trimmed);
    }
    setPromptInput('');
  };

  const handleCardClick = (basePrompt: string) => {
    if (targetUrl.trim()) {
      onNavigate(targetUrl.trim());
      onTriggerAi(`${basePrompt}\n\n[طبّق ذلك على: ${targetUrl.trim()}]`);
    } else {
      onTriggerAi(basePrompt);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-6 bg-[var(--bg-app)] text-[var(--text-primary)] overflow-y-auto select-none">
      <div className="max-w-4xl w-full flex flex-col items-center space-y-6 my-auto pt-4 pb-8">

        {/* 1. Hero Brand with Cyber-Wolf Portrait */}
        <div className="flex flex-col items-center text-center space-y-3">
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

          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-wide text-[var(--text-primary)] flex items-center justify-center gap-2">
              WarWick Marketing Intelligence
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]">
                2026 Linear OS
              </span>
            </h1>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              متصفح تسويقي فائق الذكاء مدعوم بموديل Antigravity المحلي — فحص فوري للمتاجر، كشف عروض المنافسين، وتشريح مسارات التحويل.
            </p>
          </div>
        </div>

        {/* 2. Unified Store Audit & Prompt Input */}
        <div className="w-full max-w-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-2 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <Globe size={14} className="text-[var(--accent)] shrink-0" />
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="ضع رابط المتجر أو صفحة الهبوط لفحصها (مثلاً: https://store.com)..."
              className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
            />
          </div>

          <form onSubmit={handleSendPrompt} className="flex items-center gap-2 p-1.5">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="اطلب أي مهمة تسويقية: مثلاً 'حلل سرعة الدفع' أو 'اكتب 5 زوايا إعلانية غير مسبوقة'..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={!promptInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-bright)] disabled:opacity-30 disabled:hover:bg-[var(--accent)] text-black text-xs font-semibold transition-all cursor-pointer shadow-md shadow-black/30"
            >
              <span>تحليل</span>
              <Send size={13} />
            </button>
          </form>
        </div>

        {/* 3. BENTO GRID: 4 Interactive Marketing Audit Modules */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {QUICK_ACTIONS.map((action) => {
            const IconComponent = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => handleCardClick(action.prompt)}
                className="flex flex-col justify-between p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right relative overflow-hidden"
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

                <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] mt-3 opacity-80 group-hover:opacity-100 group-hover:translate-x-[-2px] transition-all">
                  <span>تشغيل الفحص</span>
                  <ArrowRight size={12} className="rotate-180" />
                </div>
              </button>
            );
          })}
        </div>

        {/* 4. Funnel Autopsy Diagnostic Banner */}
        <button
          type="button"
          onClick={onOpenFunnelAutopsy}
          className="w-full max-w-3xl flex items-center gap-3.5 p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-accent-soft)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-surface-hover)] transition-all group cursor-pointer text-right shadow-xl shadow-black/30"
        >
          <div className="p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] group-hover:scale-105 transition-transform shrink-0">
            <Skull size={22} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-bright)] transition-colors">
                Funnel Autopsy • تشريح مسارات البيع
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-mono border border-[var(--border-accent-soft)]">
                Multi-Persona Simulation
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
              أرسل شخصيات ذكاء اصطناعي (المشتري المتردد، الباحث عن الخصم، العميل المستعجل) داخل أي مسار شراء، واكتشف اللحظة المحددة لانسحابهم بالصور والدلائل.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] shrink-0">
            بدء التشريح ⏎
          </span>
        </button>

        {/* 5. Shortcuts Bar */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)] font-mono">
          <span>Ctrl+T لتبويب جديد</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>Ctrl+K لشريط الأوامر</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>Ctrl+J لمساعد WarWick</span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>Ctrl+Shift+F لتشريح المسار</span>
        </div>

      </div>
    </div>
  );
};
