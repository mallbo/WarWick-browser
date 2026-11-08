import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Globe,
  HelpCircle,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Skull,
  Smartphone,
  Square,
  Tag,
  Target,
  Users,
  X,
  XCircle,
  Zap,
  Eye,
  Sparkles
} from 'lucide-react';
import {
  FUNNEL_PERSONAS,
  type FunnelAbandonmentStage,
  type FunnelAutopsyProgress,
  type FunnelAutopsyReport,
  type FunnelEvidence,
  type FunnelFriction,
  type FunnelPersonaId,
  type FunnelPersonaResult
} from '../../shared/types';

export interface FunnelAutopsyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUrl?: string;
}

type Phase = 'idle' | 'running' | 'complete' | 'error' | 'cancelled';

const DEFAULT_SELECTED_PERSONA_IDS: FunnelPersonaId[] = FUNNEL_PERSONAS
  .filter((persona) => persona.defaultSelected)
  .map((persona) => persona.id);

const PERSONA_ICONS = {
  shield: ShieldCheck,
  tag: Tag,
  zap: Zap,
  smartphone: Smartphone,
  help: HelpCircle
} as const;

const STAGE_LABELS: Record<FunnelAbandonmentStage, string> = {
  hero: 'الواجهة الأولى',
  offer: 'العرض والسعر',
  cta: 'زر الإجراء',
  form: 'الفورم',
  trust: 'الثقة',
  checkout: 'الدفع',
  completed: 'أكملت الرحلة'
};

const VERDICT_LABELS: Record<FunnelPersonaResult['verdict'], string> = {
  converted: 'وصلت',
  hesitated: 'ترددت',
  abandoned: 'انسحبت'
};

const VERDICT_STYLES: Record<FunnelPersonaResult['verdict'], string> = {
  converted: 'bg-[rgba(95,160,110,0.14)] text-[#8CC49A] border-[rgba(95,160,110,0.3)]',
  hesitated: 'bg-[rgba(217,164,65,0.14)] text-[#D9A441] border-[rgba(217,164,65,0.3)]',
  abandoned: 'bg-[rgba(217,108,95,0.14)] text-[#D96C5F] border-[rgba(217,108,95,0.32)]'
};

const SEVERITY_LABELS: Record<FunnelFriction['severity'], string> = {
  critical: 'قاتل',
  high: 'خطير',
  medium: 'متوسط',
  low: 'منخفض'
};

const SEVERITY_STYLES: Record<FunnelFriction['severity'], string> = {
  critical: 'bg-[rgba(217,108,95,0.14)] text-[#D96C5F] border-[rgba(217,108,95,0.32)]',
  high: 'bg-[rgba(217,164,65,0.14)] text-[#D9A441] border-[rgba(217,164,65,0.3)]',
  medium: 'bg-[rgba(242,182,50,0.1)] text-[var(--accent)] border-[var(--border-accent-soft)]',
  low: 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
};

function formatDecisionTime(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} ث`;
  return `${Math.floor(seconds / 60)} د ${seconds % 60} ث`;
}

function personaName(id: FunnelPersonaId): string {
  return FUNNEL_PERSONAS.find((persona) => persona.id === id)?.name || id;
}

function ScoreRing({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(100, score));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (normalized / 100) * circumference;
  const color = normalized >= 75 ? '#F2B632' : normalized >= 50 ? '#D9A441' : '#D96C5F';

  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold leading-none text-[var(--text-primary)]">{normalized}</span>
        <span className="text-[10px] text-[var(--text-muted)] mt-1">/ 100</span>
      </div>
    </div>
  );
}

function PersonaCard({
  result,
  evidence,
  onShowEvidence
}: {
  result: FunnelPersonaResult;
  evidence: FunnelEvidence[];
  onShowEvidence: (item: FunnelEvidence) => void;
}) {
  const persona = FUNNEL_PERSONAS.find((item) => item.id === result.personaId);
  const Icon = persona ? PERSONA_ICONS[persona.icon] : ShieldCheck;
  const personaEvidence = evidence.filter((item) => result.evidenceIds.includes(item.id));

  return (
    <div className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] shrink-0">
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{result.name}</h3>
            <p className="text-[10px] text-[var(--text-muted)] truncate">{result.englishName}</p>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${VERDICT_STYLES[result.verdict]}`}>
          {VERDICT_LABELS[result.verdict]}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
          <span>درجة البقاء</span>
          <span className="font-mono">{result.score}/100</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${result.score}%`,
              backgroundColor:
                result.score >= 75 ? '#F2B632' : result.score >= 50 ? '#D9A441' : '#D96C5F'
            }}
          />
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{result.causeOfDeath}</p>

      {result.frictionSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.frictionSignals.slice(0, 4).map((signal) => (
            <span
              key={signal}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              {signal}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
        <div className="text-[10px] text-[var(--text-muted)]">
          <span className="text-[var(--text-secondary)]">{STAGE_LABELS[result.abandonmentStage]}</span>
          <span className="mx-1">·</span>
          <span>{formatDecisionTime(result.timeToDecisionMs)}</span>
          <span className="mx-1">·</span>
          <span>ثقة {Math.round(result.confidence * 100)}%</span>
        </div>
        {personaEvidence.length > 0 && (
          <button
            type="button"
            onClick={() => onShowEvidence(personaEvidence[0])}
            className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:text-[var(--accent-bright)] shrink-0"
          >
            <Eye size={12} />
            الدليل ({personaEvidence.length})
          </button>
        )}
      </div>
    </div>
  );
}

function FrictionCard({
  friction,
  evidence,
  onShowEvidence
}: {
  friction: FunnelFriction;
  evidence: FunnelEvidence[];
  onShowEvidence: (item: FunnelEvidence) => void;
}) {
  const related = evidence.filter((item) => friction.evidenceIds.includes(item.id));

  return (
    <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={15} className="text-[var(--text-muted)] shrink-0" />
          <h4 className="text-xs font-semibold text-[var(--text-primary)]">{friction.title}</h4>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${SEVERITY_STYLES[friction.severity]}`}>
          {SEVERITY_LABELS[friction.severity]}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-2">{friction.description}</p>
      <div className="mt-2 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)] mb-0.5">
          <Target size={11} />
          <span>العلاج المقترح</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{friction.recommendation}</p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {friction.affectedPersonas.map((id) => (
            <span
              key={id}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
            >
              {personaName(id)}
            </span>
          ))}
        </div>
        {related.length > 0 && (
          <button
            type="button"
            onClick={() => onShowEvidence(related[0])}
            className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:text-[var(--accent-bright)] shrink-0"
          >
            <Camera size={11} />
            {related.length} دليل
          </button>
        )}
      </div>
    </div>
  );
}

export const FunnelAutopsyPanel: React.FC<FunnelAutopsyPanelProps> = ({
  isOpen,
  onClose,
  defaultUrl
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState('');
  const [selectedPersonas, setSelectedPersonas] = useState<FunnelPersonaId[]>(() => [
    ...DEFAULT_SELECTED_PERSONA_IDS
  ]);
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [progress, setProgress] = useState<FunnelAutopsyProgress | null>(null);
  const [report, setReport] = useState<FunnelAutopsyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<FunnelEvidence | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAllFrictions, setShowAllFrictions] = useState(false);

  const runIdRef = useRef<string | null>(null);
  const acceptEventsRef = useRef(false);

  const apiAvailable = Boolean(window.warwickApi?.funnelAutopsy);

  useEffect(() => {
    if (!isOpen) return;
    const api = window.warwickApi?.funnelAutopsy;
    if (!api) return;

    const unsubscribeProgress = api.onProgress((next) => {
      if (!acceptEventsRef.current) return;
      if (runIdRef.current && next.runId !== runIdRef.current) return;
      setProgress(next);
      setLog((previous) => [...previous.slice(-7), next.message]);
      if (next.stage === 'error') {
        setPhase('error');
        setError(next.message);
        acceptEventsRef.current = false;
      } else if (next.stage === 'cancelled') {
        setPhase('cancelled');
        setError(next.message);
        acceptEventsRef.current = false;
      }
    });

    const unsubscribeComplete = api.onComplete((next) => {
      if (!acceptEventsRef.current) return;
      if (runIdRef.current && next.runId !== runIdRef.current) return;
      setReport(next);
      setPhase('complete');
      setError(null);
      setProgress({
        runId: next.runId,
        stage: 'complete',
        message: 'التشريح اكتمل. التقرير جاهز.',
        progressPercent: 100
      });
      setLog((previous) => [...previous.slice(-7), 'التشريح اكتمل. التقرير جاهز.']);
      acceptEventsRef.current = false;
    });

    const unsubscribeError = api.onError((next) => {
      if (!acceptEventsRef.current) return;
      if (runIdRef.current && next.runId !== runIdRef.current) return;
      setPhase(next.cancelled ? 'cancelled' : 'error');
      setError(next.message);
      acceptEventsRef.current = false;
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && defaultUrl && !url) {
      setUrl(defaultUrl);
    }
  }, [isOpen, defaultUrl, url]);

  useEffect(() => {
    if (!isOpen) {
      acceptEventsRef.current = false;
      const runId = runIdRef.current;
      if (runId && window.warwickApi?.funnelAutopsy) {
        void window.warwickApi.funnelAutopsy.cancel(runId);
      }
      runIdRef.current = null;
    }
  }, [isOpen]);

  const handleTogglePersona = useCallback((id: FunnelPersonaId) => {
    setSelectedPersonas((previous) => {
      if (previous.includes(id)) {
        return previous.length > 1 ? previous.filter((item) => item !== id) : previous;
      }
      if (previous.length >= 5) return previous;
      return [...previous, id];
    });
  }, []);

  const handleStart = useCallback(async () => {
    const api = window.warwickApi?.funnelAutopsy;
    if (!api) {
      setError('واجهة Funnel Autopsy غير متاحة في هذه النسخة.');
      setPhase('error');
      return;
    }
    if (!url.trim()) {
      setError('أدخل رابط القمع أولًا.');
      setPhase('error');
      return;
    }
    if (selectedPersonas.length === 0) {
      setError('اختر شخصية واحدة على الأقل.');
      setPhase('error');
      return;
    }

    runIdRef.current = null;
    acceptEventsRef.current = true;
    setPhase('running');
    setReport(null);
    setError(null);
    setProgress({
      runId: 'pending',
      stage: 'queued',
      message: 'تجهيز الشخصيات…',
      progressPercent: 0
    });
    setLog(['تجهيز الشخصيات…']);
    setCopied(false);
    setShowAllFrictions(false);

    try {
      const result = await api.start({
        url: url.trim(),
        personaIds: selectedPersonas,
        captureScreenshots
      });
      runIdRef.current = result.runId;
    } catch (startError) {
      acceptEventsRef.current = false;
      setPhase('error');
      setError(startError instanceof Error ? startError.message : String(startError));
    }
  }, [url, selectedPersonas, captureScreenshots]);

  const handleCancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (runId && window.warwickApi?.funnelAutopsy) {
      try {
        await window.warwickApi.funnelAutopsy.cancel(runId);
      } catch {
        // Ignore cancellation races.
      }
    }
    acceptEventsRef.current = false;
    setPhase('cancelled');
    setError('تم إلغاء التشريح.');
  }, []);

  const handleReset = useCallback(() => {
    const runId = runIdRef.current;
    if (runId && phase === 'running' && window.warwickApi?.funnelAutopsy) {
      void window.warwickApi.funnelAutopsy.cancel(runId);
    }
    runIdRef.current = null;
    acceptEventsRef.current = false;
    setSelectedPersonas([...DEFAULT_SELECTED_PERSONA_IDS]);
    setPhase('idle');
    setReport(null);
    setError(null);
    setProgress(null);
    setLog([]);
    setActiveEvidence(null);
    setCopied(false);
    setShowAllFrictions(false);
  }, [phase]);

  const handleClose = useCallback(() => {
    if (phase === 'running') {
      const runId = runIdRef.current;
      if (runId && window.warwickApi?.funnelAutopsy) {
        void window.warwickApi.funnelAutopsy.cancel(runId);
      }
      runIdRef.current = null;
      acceptEventsRef.current = false;
      setPhase('idle');
      setReport(null);
      setProgress(null);
      setError(null);
      setLog([]);
    } else {
      acceptEventsRef.current = false;
    }
    onClose();
  }, [phase, onClose]);

  const handleCopy = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [report]);

  const handleExport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `funnel-autopsy-${report.runId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }, [report]);

  const handleOpenPage = useCallback(() => {
    if (!report) return;
    if (window.warwickApi?.tabs?.create) {
      void window.warwickApi.tabs.create(report.finalUrl, { active: true });
    }
    onClose();
  }, [report, onClose]);

  const selectedPersonaObjects = useMemo(
    () => FUNNEL_PERSONAS.filter((persona) => selectedPersonas.includes(persona.id)),
    [selectedPersonas]
  );

  const sortedFrictions = useMemo(() => {
    if (!report) return [];
    const rank: Record<FunnelFriction['severity'], number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    return [...report.frictions].sort((a, b) => rank[b.severity] - rank[a.severity]);
  }, [report]);

  if (!isOpen) return null;

  const displayFrictions = showAllFrictions ? sortedFrictions : sortedFrictions.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-[3px] flex items-center justify-center p-2 sm:p-5 app-no-drag">
      <div className="w-full max-w-6xl h-[95vh] bg-[var(--bg-app)] border border-[var(--border-strong)] rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] shrink-0">
              <Skull size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Funnel Autopsy</h2>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)]">
                  AI Persona Autopsy
                </span>
                {report?.aiEnriched && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(95,160,110,0.14)] text-[#8CC49A] border border-[rgba(95,160,110,0.3)] flex items-center gap-1">
                    <Sparkles size={9} />
                    AI enriched
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                شخصيات AI تتصفح قمعك، تتفاعل، ثم نُشرّح سبب الانسحاب بالدليل.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {phase === 'complete' && report && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8CC49A]" />
                تقرير جاهز
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="إغلاق (Esc)"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {phase === 'idle' && (
            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
              <div className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-accent-soft)] shrink-0">
                    <Activity size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      أرِنا أين يموت قمعك.
                    </h3>
                    <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-1">
                      نفتح الصفحة في جلسات معزولة، كل شخصية ترى الصفحة بعين مختلفة.
                      نلتقط الواجهة، العرض، الـ CTA، والفورم — ثم نكتب تقريرًا بسباب الانسحاب.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="text-[10px] text-[var(--text-muted)]">رابط القمع</label>
                  <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus-within:border-[var(--border-accent)] px-3 py-2">
                    <Globe size={15} className="text-[var(--accent)] shrink-0" />
                    <input
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleStart();
                      }}
                      placeholder="https://example.com/pricing"
                      className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
                    />
                    {defaultUrl && (
                      <button
                        type="button"
                        onClick={() => setUrl(defaultUrl)}
                        className="text-[10px] text-[var(--accent)] hover:text-[var(--accent-bright)] shrink-0"
                      >
                        الحالية
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-[var(--accent)]" />
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">اختر الشخصيات</h3>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">{selectedPersonas.length}/5</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {FUNNEL_PERSONAS.map((persona) => {
                    const Icon = PERSONA_ICONS[persona.icon];
                    const selected = selectedPersonas.includes(persona.id);
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => handleTogglePersona(persona.id)}
                        aria-pressed={selected}
                        className={`text-right rounded-xl border p-3 transition-all ${
                          selected
                            ? 'bg-[var(--accent-soft)] border-[var(--border-accent)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`p-1.5 rounded-lg border shrink-0 ${selected ? 'bg-[var(--accent-soft-strong)] text-[var(--accent-bright)] border-[var(--border-accent-soft)]' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)]'}`}>
                            <Icon size={14} />
                          </div>
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]' : 'border-[var(--border-strong)]'}`}>
                            {selected && <Check size={10} />}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-[var(--text-primary)] mt-2">{persona.name}</h4>
                        <p className="text-[9px] text-[var(--text-muted)]">{persona.englishName}</p>
                        <p className="text-[10px] leading-relaxed text-[var(--text-secondary)] mt-1.5">{persona.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureScreenshots}
                    onChange={(event) => setCaptureScreenshots(event.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <Camera size={14} className="text-[var(--accent)]" />
                  التقاط صور للأدلة (أبطأ قليلًا لكن التقرير أقوى)
                </label>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                  <ShieldCheck size={12} className="text-[#8CC49A]" />
                  جلسات معزولة · لا إرسال فورم · لا شراء
                </div>
              </div>

              {!apiAvailable && (
                <div className="rounded-xl border border-[rgba(217,108,95,0.32)] bg-[rgba(217,108,95,0.1)] p-3 text-[11px] text-[#D96C5F]">
                  واجهة Funnel Autopsy غير متاحة في هذه النسخة. أعد تشغيل التطبيق بعد البناء.
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!url.trim() || selectedPersonas.length === 0 || !apiAvailable}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-bright)] disabled:opacity-40 disabled:hover:bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold transition-colors cursor-pointer"
              >
                <Play size={16} />
                ابدأ التشريح
              </button>
            </div>
          )}

          {phase === 'running' && (
            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
              <div className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Loader2 size={17} className="text-[var(--accent)] animate-spin" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">التشريح جارٍ…</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--accent)]">
                    {progress?.progressPercent ?? 0}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                    style={{ width: `${progress?.progressPercent ?? 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-3">{progress?.message || 'تجهيز…'}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-[var(--accent)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">الشخصيات داخل القمع</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {selectedPersonaObjects.map((persona) => {
                    const Icon = PERSONA_ICONS[persona.icon];
                    const isActive = progress?.personaId === persona.id;
                    return (
                      <div
                        key={persona.id}
                        className={`rounded-xl border p-3 flex items-center gap-2 transition-colors ${
                          isActive
                            ? 'bg-[var(--accent-soft)] border-[var(--border-accent)]'
                            : 'bg-[var(--bg-panel)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${isActive ? 'bg-[var(--accent-soft-strong)] text-[var(--accent-bright)]' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{persona.name}</p>
                          <p className="text-[9px] text-[var(--text-muted)] truncate">
                            {isActive ? 'تتصفح الآن…' : 'في الانتظار'}
                          </p>
                        </div>
                        {isActive && <Loader2 size={13} className="text-[var(--accent)] animate-spin ml-auto shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={13} className="text-[var(--accent)]" />
                  <h3 className="text-[11px] font-semibold text-[var(--text-primary)]">سجل الرحلة</h3>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {log.map((line, index) => (
                    <div key={`${index}-${line.slice(0, 20)}`} className="flex items-start gap-2 text-[10px] text-[var(--text-secondary)]">
                      {index === log.length - 1 ? (
                        <Loader2 size={11} className="text-[var(--accent)] animate-spin mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle2 size={11} className="text-[#8CC49A] mt-0.5 shrink-0" />
                      )}
                      <span className="leading-relaxed">{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-[10px] text-[var(--text-muted)]">
                  قد يستغرق 20–40 ثانية حسب حجم الصفحة. لا تغلق النافذة أثناء التشريح.
                </p>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs transition-colors"
                >
                  <Square size={12} />
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {phase === 'complete' && report && (
            <div className="p-4 sm:p-6 space-y-5">
              <div className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <ScoreRing score={report.overallScore} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">{report.verdict}</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        {report.engine === 'heuristic+ai' ? 'Heuristic + AI' : 'Heuristic'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-1">{report.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        <Users size={11} className="text-[var(--accent)]" />
                        {report.personas.length} شخصيات
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[rgba(95,160,110,0.12)] border border-[rgba(95,160,110,0.28)] text-[#8CC49A]">
                        <CheckCircle2 size={11} />
                        {report.personas.filter((persona) => persona.verdict === 'converted').length} وصلت
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[rgba(217,164,65,0.12)] border border-[rgba(217,164,65,0.28)] text-[#D9A441]">
                        <AlertTriangle size={11} />
                        {report.personas.filter((persona) => persona.verdict === 'hesitated').length} ترددت
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[rgba(217,108,95,0.12)] border border-[rgba(217,108,95,0.28)] text-[#D96C5F]">
                        <XCircle size={11} />
                        {report.personas.filter((persona) => persona.verdict === 'abandoned').length} انسحبت
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-[10px] text-[var(--text-muted)]">
                      <Globe size={11} className="shrink-0" />
                      <span className="truncate font-mono">{report.finalUrl}</span>
                      <span className="shrink-0">· {Math.round(report.durationMs / 1000)} ث</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-[var(--accent)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">تشريح الشخصيات</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {report.personas.map((persona) => (
                    <PersonaCard
                      key={persona.personaId}
                      result={persona}
                      evidence={report.evidence}
                      onShowEvidence={setActiveEvidence}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-[var(--accent)]" />
                      <h3 className="text-xs font-semibold text-[var(--text-primary)]">نقاط الاحتكاك القاتلة</h3>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">{report.frictions.length}</span>
                  </div>
                  <div className="space-y-2">
                    {displayFrictions.map((friction) => (
                      <FrictionCard
                        key={friction.id}
                        friction={friction}
                        evidence={report.evidence}
                        onShowEvidence={setActiveEvidence}
                      />
                    ))}
                    {report.frictions.length === 0 && (
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-[11px] text-[var(--text-secondary)]">
                        لم نجد نقاط احتكاك حرجة في القراءة الأولى. أعد التشريح بعد إضافة المزيد من الشخصيات.
                      </div>
                    )}
                    {sortedFrictions.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllFrictions((value) => !value)}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                      >
                        {showAllFrictions ? 'عرض أقل' : `عرض كل النقاط (${sortedFrictions.length})`}
                        <ChevronRight size={12} className={showAllFrictions ? 'rotate-90 transition-transform' : 'transition-transform'} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Tag size={14} className="text-[var(--accent)]" />
                      <h3 className="text-xs font-semibold text-[var(--text-primary)]">ما رآه الوكيل</h3>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] text-[var(--text-muted)]">العنوان الرئيسي</p>
                        <p className="text-[11px] text-[var(--text-primary)] mt-0.5 line-clamp-2">{report.page.h1 || 'غير موجود'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-[var(--text-muted)]">الـ CTA الأساسي</p>
                        <p className="text-[11px] text-[var(--text-primary)] mt-0.5 line-clamp-2">{report.page.primaryCta?.text || 'غير موجود'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-[var(--text-muted)]">الأسعار الظاهرة</p>
                        <p className="text-[11px] text-[var(--text-primary)] mt-0.5 line-clamp-2">{report.page.prices.length ? report.page.prices.slice(0, 3).join(' · ') : 'لا يوجد سعر واضح'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-[var(--text-muted)]">الفورم</p>
                        <p className="text-[11px] text-[var(--text-primary)] mt-0.5">{report.page.fieldCount} حقل · {report.page.requiredFieldCount} إلزامي</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[9px] text-[var(--text-muted)]">إشارات الثقة</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {report.page.trustSignals.length ? report.page.trustSignals.map((signal) => (
                            <span key={signal} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">{signal}</span>
                          )) : (
                            <span className="text-[10px] text-[#D96C5F]">لا توجد إشارات ثقة مرئية</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Camera size={14} className="text-[var(--accent)]" />
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">معرض الأدلة</h3>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{report.evidence.length} صورة</span>
                    </div>
                    {report.evidence.length ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {report.evidence.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveEvidence(item)}
                            className="group relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] aspect-[16/10]"
                          >
                            {item.screenshotBase64 ? (
                              <img
                                src={item.screenshotBase64}
                                alt={item.label}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-1">
                                <Camera size={16} />
                                <span className="text-[9px]">لا صورة</span>
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                              <p className="text-[9px] text-white/90 truncate">{item.label}</p>
                              <p className="text-[8px] text-white/60 truncate">{personaName(item.personaId)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-[10px] text-[var(--text-secondary)]">
                        لم تُلتقط صور. أعد التشريح مع تفعيل خيار الصور.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-[11px] transition-colors"
                  >
                    <RotateCcw size={12} />
                    تشريح جديد
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-[11px] transition-colors"
                  >
                    {copied ? <Check size={12} className="text-[#8CC49A]" /> : <Copy size={12} />}
                    {copied ? 'تم النسخ' : 'نسخ JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-[11px] transition-colors"
                  >
                    <Download size={12} />
                    تصدير
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleOpenPage}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-[var(--accent-contrast)] text-[11px] font-semibold transition-colors"
                >
                  <ExternalLink size={12} />
                  فتح الصفحة الأصلية
                </button>
              </div>
            </div>
          )}

          {(phase === 'error' || phase === 'cancelled') && (
            <div className="p-4 sm:p-6 max-w-2xl mx-auto">
              <div className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 text-center">
                <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${phase === 'cancelled' ? 'bg-[rgba(217,164,65,0.14)] text-[#D9A441]' : 'bg-[rgba(217,108,95,0.14)] text-[#D96C5F]'}`}>
                  {phase === 'cancelled' ? <Square size={20} /> : <XCircle size={20} />}
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-3">
                  {phase === 'cancelled' ? 'تم إلغاء التشريح' : 'تعذر إكمال التشريح'}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{error || 'حدث خطأ غير معروف.'}</p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-[var(--accent-contrast)] text-[11px] font-semibold transition-colors"
                  >
                    <RotateCcw size={12} />
                    إعادة المحاولة
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] transition-colors"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeEvidence && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setActiveEvidence(null)}
        >
          <div
            className="max-w-5xl w-full max-h-[90vh] bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{activeEvidence.label}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">
                  {personaName(activeEvidence.personaId)} · {activeEvidence.description}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={activeEvidence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                  title="فتح الرابط"
                >
                  <ExternalLink size={15} />
                </a>
                <button
                  type="button"
                  onClick={() => setActiveEvidence(null)}
                  className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[var(--bg-app)] flex items-center justify-center p-3">
              {activeEvidence.screenshotBase64 ? (
                <img
                  src={activeEvidence.screenshotBase64}
                  alt={activeEvidence.label}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg border border-[var(--border-subtle)]"
                />
              ) : (
                <div className="text-[11px] text-[var(--text-muted)]">لا توجد صورة لهذا الدليل.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FunnelAutopsyPanel;
