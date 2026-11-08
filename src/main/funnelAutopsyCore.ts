/**
 * WarWick Browser — Funnel Autopsy core heuristics.
 *
 * This module is intentionally free of Electron imports so it can be unit
 * tested and reused by the renderer if needed. The main-process service feeds
 * it page snapshots captured from isolated hidden browser windows.
 */

import type {
  FunnelAbandonmentStage,
  FunnelAutopsyReport,
  FunnelCta,
  FunnelEvidence,
  FunnelFormField,
  FunnelFriction,
  FunnelFrictionCategory,
  FunnelFrictionSeverity,
  FunnelPageSnapshot,
  FunnelPersonaId,
  FunnelPersonaResult
} from '../shared/types';

// ---------------------------------------------------------------------------
// Persona metadata (kept local so this module has no runtime dependencies)
// ---------------------------------------------------------------------------

export const FUNNEL_PERSONA_META: Record<
  FunnelPersonaId,
  { name: string; englishName: string }
> = {
  skeptic: { name: 'المتشكك', englishName: 'The Skeptic' },
  'bargain-hunter': { name: 'صائد الصفقات', englishName: 'The Bargain Hunter' },
  'impulse-buyer': { name: 'المندفع', englishName: 'The Impulse Buyer' },
  'mobile-first': { name: 'الموبايل أولًا', englishName: 'Mobile First' },
  'non-technical': { name: 'غير التقني', englishName: 'Non-Technical' }
};

export const DEFAULT_FUNNEL_PERSONAS: FunnelPersonaId[] = [
  'skeptic',
  'bargain-hunter',
  'impulse-buyer'
];

const ALL_PERSONAS: FunnelPersonaId[] = [
  'skeptic',
  'bargain-hunter',
  'impulse-buyer',
  'mobile-first',
  'non-technical'
];

const SEVERITY_POINTS: Record<FunnelFrictionSeverity, number> = {
  critical: 26,
  high: 16,
  medium: 9,
  low: 4
};

const SEVERITY_RANK: Record<FunnelFrictionSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const PERSONA_WEIGHTS: Record<
  FunnelPersonaId,
  Record<FunnelFrictionCategory, number>
> = {
  skeptic: {
    trust: 1.15,
    price: 0.55,
    cta: 0.65,
    form: 0.45,
    clarity: 0.8,
    mobile: 0.3,
    speed: 0.4,
    accessibility: 0.2
  },
  'bargain-hunter': {
    trust: 0.8,
    price: 1.2,
    cta: 0.65,
    form: 0.4,
    clarity: 0.7,
    mobile: 0.35,
    speed: 0.5,
    accessibility: 0.2
  },
  'impulse-buyer': {
    trust: 0.45,
    price: 0.5,
    cta: 1.2,
    form: 0.7,
    clarity: 0.9,
    mobile: 0.6,
    speed: 1.0,
    accessibility: 0.2
  },
  'mobile-first': {
    trust: 0.5,
    price: 0.5,
    cta: 0.95,
    form: 1.1,
    clarity: 0.8,
    mobile: 1.3,
    speed: 0.8,
    accessibility: 0.4
  },
  'non-technical': {
    trust: 0.6,
    price: 0.45,
    cta: 0.75,
    form: 1.2,
    clarity: 1.15,
    mobile: 0.5,
    speed: 0.7,
    accessibility: 0.3
  }
};

const STAGE_LABELS: Record<FunnelAbandonmentStage, string> = {
  hero: 'الواجهة الأولى',
  offer: 'العرض والسعر',
  cta: 'زر اتخاذ الإجراء',
  form: 'الفورم',
  trust: 'مرحلة الثقة',
  checkout: 'الدفع',
  completed: 'نهاية الرحلة'
};

const CATEGORY_STAGE: Record<FunnelFrictionCategory, FunnelAbandonmentStage> = {
  trust: 'trust',
  price: 'offer',
  cta: 'cta',
  form: 'form',
  clarity: 'hero',
  mobile: 'cta',
  speed: 'hero',
  accessibility: 'hero'
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cleanText(value: unknown, max = 600): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function uniqueStrings(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value, 240);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCta(raw: Partial<FunnelCta> | null | undefined): FunnelCta | null {
  if (!raw) return null;
  const text = cleanText(raw.text, 140);
  if (!text) return null;
  return {
    text,
    tag: cleanText(raw.tag, 20) || 'unknown',
    href: typeof raw.href === 'string' ? raw.href.slice(0, 2000) : undefined,
    type: typeof raw.type === 'string' ? raw.type.slice(0, 40) : undefined,
    isAboveFold: asBoolean(raw.isAboveFold),
    isPrimary: asBoolean(raw.isPrimary)
  };
}

function normalizeField(raw: Partial<FunnelFormField> | null | undefined): FunnelFormField | null {
  if (!raw) return null;
  const type = cleanText(raw.type, 30) || 'text';
  return {
    type,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : undefined,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 200) : undefined,
    placeholder:
      typeof raw.placeholder === 'string' ? raw.placeholder.slice(0, 200) : undefined,
    required: asBoolean(raw.required)
  };
}

/**
 * Accepts arbitrary data coming back from executeJavaScript and produces a
 * complete snapshot with safe defaults and bounded array sizes.
 */
export function sanitizeSnapshot(
  raw: Partial<FunnelPageSnapshot> | null | undefined,
  fallbackUrl = ''
): FunnelPageSnapshot {
  const data = raw ?? {};
  const ctas = Array.isArray(data.ctas)
    ? data.ctas
        .map((cta) => normalizeCta(cta))
        .filter((cta): cta is FunnelCta => Boolean(cta))
        .slice(0, 24)
    : [];

  const primaryCta =
    normalizeCta(data.primaryCta) ||
    ctas.find((cta) => cta.isPrimary) ||
    ctas[0];

  const fields = Array.isArray(data.fields)
    ? data.fields
        .map((field) => normalizeField(field))
        .filter((field): field is FunnelFormField => Boolean(field))
        .slice(0, 24)
    : [];

  const forms = Array.isArray(data.forms)
    ? data.forms.slice(0, 10).map((form) => ({
        fieldCount: clamp(asNumber(form?.fieldCount, 0), 0, 200),
        action: typeof form?.action === 'string' ? form.action.slice(0, 2000) : undefined,
        method: typeof form?.method === 'string' ? form.method.slice(0, 20) : undefined
      }))
    : [];

  const navLinks = Array.isArray(data.navLinks)
    ? data.navLinks
        .filter((link) => link && typeof link.text === 'string' && typeof link.href === 'string')
        .slice(0, 16)
        .map((link) => ({
          text: cleanText(link.text, 100),
          href: link.href.slice(0, 2000)
        }))
    : [];

  return {
    url: cleanText(data.url, 2000) || fallbackUrl,
    title: cleanText(data.title, 500),
    metaDescription: cleanText(data.metaDescription, 1000),
    h1: cleanText(data.h1, 500),
    h2s: Array.isArray(data.h2s)
      ? uniqueStrings(data.h2s.map((h) => String(h)), 20)
      : [],
    ctas,
    primaryCta,
    forms,
    fields,
    prices: Array.isArray(data.prices)
      ? uniqueStrings(data.prices.map((p) => String(p)), 12)
      : [],
    trustSignals: Array.isArray(data.trustSignals)
      ? uniqueStrings(data.trustSignals.map((s) => String(s)), 12)
      : [],
    navLinks,
    textSample: cleanText(data.textSample, 12000),
    wordCount: clamp(asNumber(data.wordCount, 0), 0, 500000),
    imageCount: clamp(asNumber(data.imageCount, 0), 0, 5000),
    imagesMissingAlt: clamp(asNumber(data.imagesMissingAlt, 0), 0, 5000),
    hasVideo: asBoolean(data.hasVideo),
    hasChat: asBoolean(data.hasChat),
    hasFaq: asBoolean(data.hasFaq),
    hasTestimonials: asBoolean(data.hasTestimonials),
    hasGuarantee: asBoolean(data.hasGuarantee),
    hasUrgency: asBoolean(data.hasUrgency),
    hasCountdown: asBoolean(data.hasCountdown),
    hasCookieBanner: asBoolean(data.hasCookieBanner),
    hasPricingSection: asBoolean(data.hasPricingSection),
    hasContact: asBoolean(data.hasContact),
    pageHeight: clamp(asNumber(data.pageHeight, 0), 0, 200000),
    viewportHeight: clamp(asNumber(data.viewportHeight, 900), 100, 10000),
    viewportWidth: clamp(asNumber(data.viewportWidth, 1280), 100, 10000),
    formCount: clamp(asNumber(data.formCount, forms.length), 0, 200),
    fieldCount: clamp(asNumber(data.fieldCount, fields.length), 0, 500),
    requiredFieldCount: clamp(asNumber(data.requiredFieldCount, 0), 0, 500),
    buttonCount: clamp(asNumber(data.buttonCount, 0), 0, 5000),
    linkCount: clamp(asNumber(data.linkCount, 0), 0, 10000)
  };
}

export function normalizeFunnelUrl(raw: string): string {
  const trimmed = cleanText(raw, 4000);
  if (!trimmed) {
    throw new Error('أدخل رابط القمع أولًا.');
  }
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('الرابط غير صالح. جرّب رابطًا يبدأ بـ https://');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Funnel Autopsy يدعم روابط http و https فقط.');
  }
  if (!parsed.hostname) {
    throw new Error('الرابط لا يحتوي على نطاق صالح.');
  }
  return parsed.toString();
}

export function mergeSnapshots(snapshots: FunnelPageSnapshot[]): FunnelPageSnapshot {
  if (!snapshots.length) {
    return sanitizeSnapshot({}, '');
  }
  const base = snapshots[0];
  const allCtas = snapshots.flatMap((snapshot) => snapshot.ctas);
  const seenCtas = new Set<string>();
  const ctas = allCtas.filter((cta) => {
    const key = `${cta.text.toLowerCase()}|${cta.href || ''}`;
    if (seenCtas.has(key)) return false;
    seenCtas.add(key);
    return true;
  }).slice(0, 24);

  return {
    ...base,
    h1: base.h1 || snapshots.find((s) => s.h1)?.h1 || '',
    h2s: uniqueStrings(snapshots.flatMap((s) => s.h2s), 24),
    ctas,
    primaryCta:
      base.primaryCta ||
      snapshots.find((s) => s.primaryCta)?.primaryCta ||
      ctas[0],
    prices: uniqueStrings(snapshots.flatMap((s) => s.prices), 16),
    trustSignals: uniqueStrings(snapshots.flatMap((s) => s.trustSignals), 16),
    navLinks: base.navLinks.length
      ? base.navLinks
      : snapshots.find((s) => s.navLinks.length)?.navLinks || [],
    textSample: snapshots.reduce(
      (longest, current) =>
        current.textSample.length > longest.length ? current.textSample : longest,
      base.textSample
    ),
    wordCount: Math.max(...snapshots.map((s) => s.wordCount)),
    imageCount: Math.max(...snapshots.map((s) => s.imageCount)),
    imagesMissingAlt: Math.max(...snapshots.map((s) => s.imagesMissingAlt)),
    hasVideo: snapshots.some((s) => s.hasVideo),
    hasChat: snapshots.some((s) => s.hasChat),
    hasFaq: snapshots.some((s) => s.hasFaq),
    hasTestimonials: snapshots.some((s) => s.hasTestimonials),
    hasGuarantee: snapshots.some((s) => s.hasGuarantee),
    hasUrgency: snapshots.some((s) => s.hasUrgency),
    hasCountdown: snapshots.some((s) => s.hasCountdown),
    hasCookieBanner: snapshots.some((s) => s.hasCookieBanner),
    hasPricingSection: snapshots.some((s) => s.hasPricingSection),
    hasContact: snapshots.some((s) => s.hasContact),
    pageHeight: Math.max(...snapshots.map((s) => s.pageHeight)),
    viewportHeight: base.viewportHeight,
    viewportWidth: base.viewportWidth,
    formCount: Math.max(...snapshots.map((s) => s.formCount)),
    fieldCount: Math.max(...snapshots.map((s) => s.fieldCount)),
    requiredFieldCount: Math.max(...snapshots.map((s) => s.requiredFieldCount)),
    buttonCount: Math.max(...snapshots.map((s) => s.buttonCount)),
    linkCount: Math.max(...snapshots.map((s) => s.linkCount))
  };
}

// ---------------------------------------------------------------------------
// Friction detection
// ---------------------------------------------------------------------------

type FrictionDraft = {
  id: string;
  severity: FunnelFrictionSeverity;
  category: FunnelFrictionCategory;
  title: string;
  description: string;
  recommendation: string;
  affectedPersonas: FunnelPersonaId[];
};

function selected(personas: FunnelPersonaId[], wanted: FunnelPersonaId[]): FunnelPersonaId[] {
  return wanted.filter((persona) => personas.includes(persona));
}

function hasActionWord(text: string): boolean {
  return /(start|get started|try|free|demo|buy|order|shop|subscribe|sign up|signup|register|book|request|contact|download|continue|checkout|add to cart|claim|apply|join|upgrade|pricing|see plans|learn more|ابدأ|جرّب|اشتر|اطلب|سجّل|احجز|تواصل|حمّل|اكتشف|اعرف)/i.test(
    text
  );
}

function buildFrictionDrafts(
  page: FunnelPageSnapshot,
  personas: FunnelPersonaId[],
  snapshotsByPersona: Partial<Record<FunnelPersonaId, FunnelPageSnapshot>>
): FrictionDraft[] {
  const drafts: FrictionDraft[] = [];
  const push = (draft: FrictionDraft) => {
    if (draft.affectedPersonas.length > 0) drafts.push(draft);
  };
  const mobileSnapshot = snapshotsByPersona['mobile-first'];
  const primaryCta = page.primaryCta;
  const lookFree = /(free|trial|مجان|تجربة)/i.test(page.textSample);

  if (page.prices.length === 0 && !lookFree) {
    push({
      id: 'missing-price',
      severity: 'critical',
      category: 'price',
      title: 'لا يوجد سعر واضح على الصفحة',
      description:
        'الزائر لا يعرف التكلفة قبل اتخاذ خطوة. صائد الصفقات يفترض أن السعر مرتفع أو مخفي، والانسحاب هنا أرخص من السؤال.',
      recommendation:
        'أظهر السعر أو نطاق السعر أو عبارة «مجاني للبدء» فوق الطية، مع توضيح ما يشمله السعر وما لا يشمله.',
      affectedPersonas: selected(personas, [
        'bargain-hunter',
        'skeptic',
        'non-technical'
      ])
    });
  }

  if (page.trustSignals.length === 0) {
    push({
      id: 'no-trust-signals',
      severity: 'critical',
      category: 'trust',
      title: 'لا توجد إشارات ثقة مرئية',
      description:
        'لا يوجد ضمان، تقييمات، شعارات عملاء، أو دليل أمان. المتشكك لا يجد سببًا واحدًا ليصدّق الادعاء.',
      recommendation:
        'أضف فوق الطية: تقييمًا حقيقيًا، عدد عملاء، شعارات، وضمان استرداد مكتوب بوضوح.',
      affectedPersonas: selected(personas, [
        'skeptic',
        'non-technical',
        'bargain-hunter',
        'mobile-first'
      ])
    });
  } else if (page.trustSignals.length <= 1) {
    push({
      id: 'thin-trust-signals',
      severity: 'high',
      category: 'trust',
      title: 'إشارات الثقة قليلة جدًا',
      description:
        'توجد إشارة ثقة واحدة فقط، وهذا لا يكفي لتهدئة مخاوف الزائر قبل مشاركة بياناته أو الدفع.',
      recommendation:
        'اجمع بين ثلاث طبقات ثقة: دليل اجتماعي + ضمان + إشارة أمان أو شفافية في السعر.',
      affectedPersonas: selected(personas, ['skeptic', 'non-technical'])
    });
  }

  if (!page.hasGuarantee) {
    push({
      id: 'no-guarantee',
      severity: 'high',
      category: 'trust',
      title: 'لا يوجد ضمان أو استرداد واضح',
      description:
        'غياب الضمان يجعل قرار الشراء مخاطرة. المتشكك يفضّل الانسحاب على المخاطرة.',
      recommendation:
        'أضف ضمانًا محددًا (مثال: استرداد خلال 14 يومًا) وضعه بجوار الـ CTA وليس في آخر الصفحة.',
      affectedPersonas: selected(personas, ['skeptic', 'bargain-hunter'])
    });
  }

  if (!page.hasTestimonials) {
    push({
      id: 'no-social-proof',
      severity: 'high',
      category: 'trust',
      title: 'لا يوجد دليل اجتماعي',
      description:
        'لا توجد آراء عملاء أو حالات نجاح. الزائر لا يرى ما حدث لمن سبقه.',
      recommendation:
        'أضف 2–3 شهادات محددة بالاسم والنتيجة، وليس عبارات عامة مثل «خدمة رائعة».',
      affectedPersonas: selected(personas, ['skeptic', 'impulse-buyer'])
    });
  }

  if (page.ctas.length === 0) {
    push({
      id: 'no-primary-cta',
      severity: 'critical',
      category: 'cta',
      title: 'لا يوجد زر إجراء أساسي',
      description:
        'الصفحة تشرح لكنها لا تدعو الزائر لأي خطوة. المندفع يغادر لأن الرحلة لا تبدأ أصلًا.',
      recommendation:
        'أضف زرًا واحدًا واضحًا فوق الطية بصيغة فعلية: «ابدأ التجربة المجانية» أو «احصل على العرض».',
      affectedPersonas: selected(personas, ALL_PERSONAS)
    });
  } else if (!primaryCta?.isAboveFold) {
    push({
      id: 'cta-below-fold',
      severity: 'critical',
      category: 'cta',
      title: 'الـ CTA الأساسي مخفي تحت الطية',
      description:
        'الزائر يحتاج إلى تمرير الصفحة قبل أن يعرف الخطوة التالية. المندفع لا يتحمل هذا الانتظار.',
      recommendation:
        'انقل الـ CTA الأساسي إلى أول شاشة، وكرره بعد كل قسم يشرح قيمة جديدة.',
      affectedPersonas: selected(personas, [
        'impulse-buyer',
        'mobile-first',
        'non-technical'
      ])
    });
  }

  if (page.ctas.length > 5) {
    push({
      id: 'cta-overload',
      severity: page.ctas.length > 8 ? 'high' : 'medium',
      category: 'cta',
      title: 'عدد كبير من الأزرار المنافسة',
      description:
        'كل زر إضافي يشتت القرار. الزائر لا يعرف أي خطوة هي الأساسية.',
      recommendation:
        'اختر CTA أساسيًا واحدًا، واجعل بقية الأزرار ثانوية بلون ووزن بصري أقل.',
      affectedPersonas: selected(personas, ['non-technical', 'impulse-buyer'])
    });
  }

  if (primaryCta && !hasActionWord(primaryCta.text)) {
    push({
      id: 'vague-cta',
      severity: 'high',
      category: 'clarity',
      title: 'نص الـ CTA غير واضح',
      description:
        'نص الزر لا يوضح النتيجة التي سيحصل عليها الزائر، فيقل احتمال الضغط.',
      recommendation:
        'استبدل النص العام بنتيجة محددة: «ابدأ تجربتك المجانية» بدلًا من «إرسال» أو «متابعة».',
      affectedPersonas: selected(personas, ['impulse-buyer', 'non-technical'])
    });
  }

  if (page.fieldCount > 5) {
    push({
      id: 'form-heavy',
      severity: page.fieldCount > 8 ? 'critical' : 'high',
      category: 'form',
      title: 'الفورم طويل ويطلب معلومات كثيرة',
      description:
        `يوجد ${page.fieldCount} حقلًا. كل حقل إضافي يزيد احتمال الانسحاب قبل اكتمال التسجيل.`,
      recommendation:
        'اطلب الحد الأدنى فقط (البريد أو الهاتف)، وأجّل باقي الأسئلة لما بعد التسجيل.',
      affectedPersonas: selected(personas, [
        'non-technical',
        'mobile-first',
        'impulse-buyer'
      ])
    });
  }

  if (page.requiredFieldCount > 4) {
    push({
      id: 'required-heavy',
      severity: 'high',
      category: 'form',
      title: 'عدد كبير من الحقول الإلزامية',
      description:
        'الحقول الإلزامية الكثيرة تجعل الفورم يبدو كاستمارة حكومية، وليس خطوة بسيطة.',
      recommendation:
        'اجعل الحقول الإلزامية 2–3 فقط، ووضّح لماذا تحتاج كل معلومة.',
      affectedPersonas: selected(personas, ['non-technical', 'mobile-first'])
    });
  }

  if (mobileSnapshot && !mobileSnapshot.primaryCta?.isAboveFold) {
    push({
      id: 'mobile-cta-hidden',
      severity: 'critical',
      category: 'mobile',
      title: 'الـ CTA غير ظاهر على الموبايل',
      description:
        'في شاشة الموبايل، لا يرى الزائر زر الإجراء الأساسي قبل التمرير. هذه واحدة من أسرع طرق قتل التحويل.',
      recommendation:
        'ثبّت CTA سفليًا على الموبايل أو ضعه مباشرة تحت العنوان الرئيسي.',
      affectedPersonas: selected(personas, ['mobile-first'])
    });
  }

  if (mobileSnapshot && mobileSnapshot.fieldCount > 3) {
    push({
      id: 'mobile-form-heavy',
      severity: 'high',
      category: 'mobile',
      title: 'الفورم مرهق على الموبايل',
      description:
        'عدد الحقول على شاشة صغيرة يخلق تمريرًا وكتابة كثيرة، فينسحب المستخدم قبل الإرسال.',
      recommendation:
        'قسّم الفورم إلى خطوات، أو استخدم حقولًا ذكية (Autofill) وقلّل الحقول إلى 3 كحد أقصى.',
      affectedPersonas: selected(personas, ['mobile-first'])
    });
  }

  if (!page.h1) {
    push({
      id: 'missing-headline',
      severity: 'high',
      category: 'clarity',
      title: 'لا يوجد عنوان رئيسي (H1)',
      description:
        'الصفحة لا تجيب في أول ثانية: ما هذا؟ لمن؟ وما القيمة؟',
      recommendation:
        'اكتب H1 واحدًا يوضح النتيجة والجمهور: «ساعد فريق التسويق على … في …».',
      affectedPersonas: selected(personas, ALL_PERSONAS)
    });
  } else if (page.h1.length > 130) {
    push({
      id: 'long-headline',
      severity: 'medium',
      category: 'clarity',
      title: 'العنوان الرئيسي طويل جدًا',
      description:
        'العنوان يحتاج جهدًا لقراءته، وقد يضيع الوعد الأساسي في منتصفه.',
      recommendation:
        'اختصر العنوان إلى جملة واحدة (8–14 كلمة) وضع التفاصيل في عنوان فرعي.',
      affectedPersonas: selected(personas, ['impulse-buyer', 'mobile-first'])
    });
  }

  if (page.hasUrgency && !page.hasTestimonials && !page.hasGuarantee) {
    push({
      id: 'urgency-without-proof',
      severity: 'high',
      category: 'trust',
      title: 'ندرة بدون دليل ثقة',
      description:
        'رسائل الاستعجال موجودة، لكن لا يوجد دليل اجتماعي أو ضمان. هذا يبدو كضغط بيعي مرتفع.',
      recommendation:
        'لا تستخدم العد التنازلي إلا إذا كان حقيقيًا، وارفقه بدليل عملاء وضمان واضح.',
      affectedPersonas: selected(personas, ['skeptic', 'bargain-hunter'])
    });
  }

  if (!page.hasFaq) {
    push({
      id: 'missing-faq',
      severity: 'medium',
      category: 'clarity',
      title: 'لا يوجد قسم أسئلة شائعة',
      description:
        'الاعتراضات المتكررة (السعر، الإلغاء، الدعم، الأمان) لا تجد إجابة على الصفحة.',
      recommendation:
        'أضف FAQ من 5 أسئلة تعالج أهم مخاوف ما قبل الشراء، وضعها قرب الـ CTA.',
      affectedPersonas: selected(personas, ['non-technical', 'skeptic'])
    });
  }

  if (!page.hasContact && !page.hasChat) {
    push({
      id: 'no-contact-path',
      severity: 'medium',
      category: 'trust',
      title: 'لا توجد طريقة سريعة للتواصل',
      description:
        'الزائر الذي لديه سؤال لا يجد قناة تواصل، فيغادر بدلًا من السؤال.',
      recommendation:
        'أضف شات أو بريدًا أو واتساب ظاهرًا، مع وقت استجابة متوقع.',
      affectedPersonas: selected(personas, ['skeptic', 'non-technical'])
    });
  }

  const viewport = Math.max(1, page.viewportHeight);
  if (page.pageHeight > viewport * 10) {
    push({
      id: 'very-long-page',
      severity: 'high',
      category: 'speed',
      title: 'الصفحة طويلة جدًا قبل الوصول للقرار',
      description:
        `طول الصفحة يعادل ${Math.round(page.pageHeight / viewport)} شاشات. المندفع ينفد صبره قبل الوصول للعرض.`,
      recommendation:
        'قدّم العرض والـ CTA في أول شاشتين، وانقل التفاصيل الطويلة إلى أقسام قابلة للطي.',
      affectedPersonas: selected(personas, ['impulse-buyer', 'mobile-first'])
    });
  } else if (page.pageHeight > viewport * 6) {
    push({
      id: 'long-page',
      severity: 'medium',
      category: 'speed',
      title: 'الصفحة أطول من اللازم',
      description:
        'المسار إلى القرار طويل، وقد يفقد الزائر الخيط قبل الوصول للـ CTA.',
      recommendation:
        'كرر الـ CTA بعد كل قسم رئيسي، وأضف ملخصًا للعرض في أعلى الصفحة.',
      affectedPersonas: selected(personas, ['impulse-buyer'])
    });
  }

  if (!page.hasVideo) {
    push({
      id: 'no-video',
      severity: 'low',
      category: 'clarity',
      title: 'لا يوجد شرح مرئي',
      description:
        'بعض الزوار يفهمون في 30 ثانية فيديو ما لا يفهمونه في 300 كلمة.',
      recommendation:
        'أضف فيديو قصيرًا (30–60 ثانية) يشرح المشكلة، الحل، والخطوة التالية.',
      affectedPersonas: selected(personas, ['impulse-buyer', 'non-technical'])
    });
  }

  if (page.imagesMissingAlt > 3) {
    push({
      id: 'images-missing-alt',
      severity: 'low',
      category: 'accessibility',
      title: 'صور كثيرة بدون نص بديل',
      description:
        'هذا يضعف الوصول ومحركات البحث، وقد يخفي محتوى مهمًا عن بعض الزوار.',
      recommendation:
        'أضف alt وصفيًا للصور التي تحمل معنى، وalt فارغًا للصور الزخرفية.',
      affectedPersonas: selected(personas, ALL_PERSONAS)
    });
  }

  if (!page.metaDescription) {
    push({
      id: 'missing-meta-description',
      severity: 'low',
      category: 'clarity',
      title: 'لا يوجد وصف Meta للصفحة',
      description:
        'غياب الوصف يضعف ظهور الصفحة في نتائج البحث والمشاركة الاجتماعية.',
      recommendation:
        'أضف وصفًا من 140–160 حرفًا يوضح القيمة والدعوة للخطوة التالية.',
      affectedPersonas: selected(personas, ALL_PERSONAS)
    });
  }

  return drafts;
}

function attachEvidence(
  drafts: FrictionDraft[],
  evidence: FunnelEvidence[]
): FunnelFriction[] {
  const evidenceFor = (personaId: FunnelPersonaId, stages: string[]) =>
    evidence
      .filter(
        (item) =>
          item.personaId === personaId && stages.includes(item.stage)
      )
      .map((item) => item.id);

  return drafts.map((draft) => {
    const stages =
      draft.category === 'cta'
        ? ['cta', 'hero']
        : draft.category === 'form'
          ? ['form', 'bottom']
          : draft.category === 'price'
            ? ['mid', 'hero']
            : draft.category === 'trust'
              ? ['mid', 'bottom', 'form']
              : draft.category === 'mobile'
                ? ['cta', 'form']
                : ['hero', 'mid'];

    const evidenceIds = draft.affectedPersonas.flatMap((personaId) =>
      evidenceFor(personaId, stages)
    ).slice(0, 4);

    const fallbackId = evidence.find((item) => stages.includes(item.stage))?.id;
    if (!evidenceIds.length && fallbackId) {
      evidenceIds.push(fallbackId);
    }

    return {
      id: draft.id,
      severity: draft.severity,
      category: draft.category,
      title: draft.title,
      description: draft.description,
      recommendation: draft.recommendation,
      affectedPersonas: draft.affectedPersonas,
      evidenceIds
    };
  });
}

// ---------------------------------------------------------------------------
// Persona scoring
// ---------------------------------------------------------------------------

export function scorePersona(
  personaId: FunnelPersonaId,
  frictions: FunnelFriction[],
  page: FunnelPageSnapshot
): number {
  let score = 100;
  for (const friction of frictions) {
    if (!friction.affectedPersonas.includes(personaId)) continue;
    const weight = PERSONA_WEIGHTS[personaId][friction.category] ?? 0.4;
    score -= SEVERITY_POINTS[friction.severity] * weight;
  }

  if (page.primaryCta?.isAboveFold) score += 4;
  if (page.prices.length > 0) score += 3;
  score += Math.min(8, page.trustSignals.length * 2);
  if (page.hasGuarantee) score += 3;
  if (page.hasTestimonials) score += 3;
  if (page.hasFaq) score += 2;
  if (page.hasVideo) score += 1;

  return Math.round(clamp(score, 0, 100));
}

function stageForFriction(friction: FunnelFriction | undefined): FunnelAbandonmentStage {
  if (!friction) return 'offer';
  return CATEGORY_STAGE[friction.category] || 'offer';
}

function estimateDecisionTime(
  personaId: FunnelPersonaId,
  page: FunnelPageSnapshot,
  score: number
): number {
  const base: Record<FunnelPersonaId, number> = {
    skeptic: 18000,
    'bargain-hunter': 14000,
    'impulse-buyer': 7000,
    'mobile-first': 12000,
    'non-technical': 16000
  };
  const screens = page.pageHeight / Math.max(1, page.viewportHeight);
  const value =
    base[personaId] +
    screens * 900 +
    page.fieldCount * 700 +
    (100 - score) * 90;
  return Math.round(clamp(value, 4500, 90000));
}

function buildCauseOfDeath(
  personaId: FunnelPersonaId,
  verdict: FunnelPersonaResult['verdict'],
  stage: FunnelAbandonmentStage,
  topFriction: FunnelFriction | undefined
): string {
  const meta = FUNNEL_PERSONA_META[personaId];
  const stageLabel = STAGE_LABELS[stage];
  if (verdict === 'converted') {
    return `لم تمت ${meta.name}: وصلت إلى نهاية الرحلة. ${
      topFriction
        ? `لكن «${topFriction.title}» ظل يهدد التحويل ويمنع الثقة الكاملة.`
        : 'وكان المسار واضحًا بدرجة جيدة.'
    }`;
  }
  if (!topFriction) {
    return verdict === 'hesitated'
      ? `ترددت ${meta.name} عند ${stageLabel} بسبب غموض عام في التجربة.`
      : `انسحبت ${meta.name} عند ${stageLabel} دون سبب واحد حاسم.`;
  }
  const prefix = verdict === 'hesitated' ? 'ترددت' : 'ماتت';
  return `${prefix} ${meta.name} عند ${stageLabel}: ${topFriction.description}`;
}

export function buildPersonaResult(
  personaId: FunnelPersonaId,
  page: FunnelPageSnapshot,
  frictions: FunnelFriction[],
  evidenceIds: string[],
  overrideSnapshot?: FunnelPageSnapshot
): FunnelPersonaResult {
  const meta = FUNNEL_PERSONA_META[personaId];
  const scoringPage = overrideSnapshot || page;
  const personaFrictions = frictions
    .filter((friction) => friction.affectedPersonas.includes(personaId))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        a.title.localeCompare(b.title, 'ar')
    );
  const score = scorePersona(personaId, frictions, scoringPage);
  const verdict: FunnelPersonaResult['verdict'] =
    score >= 78 ? 'converted' : score >= 48 ? 'hesitated' : 'abandoned';
  const topFriction = personaFrictions[0];
  const abandonmentStage =
    verdict === 'converted' ? 'completed' : stageForFriction(topFriction);
  const confidence = Math.round(
    clamp(0.62 + personaFrictions.length * 0.045 + (100 - score) * 0.0015, 0.55, 0.97) * 100
  ) / 100;

  return {
    personaId,
    name: meta.name,
    englishName: meta.englishName,
    verdict,
    score,
    abandonmentStage,
    causeOfDeath: buildCauseOfDeath(personaId, verdict, abandonmentStage, topFriction),
    confidence,
    timeToDecisionMs: estimateDecisionTime(personaId, scoringPage, score),
    frictionSignals: personaFrictions.slice(0, 5).map((friction) => friction.title),
    evidenceIds
  };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export type PersonaSnapshotBundle = {
  personaId: FunnelPersonaId;
  snapshot: FunnelPageSnapshot;
  evidence: FunnelEvidence[];
};

export function buildHeuristicReport(args: {
  runId: string;
  url: string;
  durationMs: number;
  bundles: PersonaSnapshotBundle[];
}): FunnelAutopsyReport {
  const { runId, url, durationMs, bundles } = args;
  const personaIds = bundles.map((bundle) => bundle.personaId);
  const allEvidence = bundles.flatMap((bundle) => bundle.evidence);
  const page = mergeSnapshots(bundles.map((bundle) => bundle.snapshot));
  const snapshotsByPersona: Partial<Record<FunnelPersonaId, FunnelPageSnapshot>> = {};
  for (const bundle of bundles) {
    snapshotsByPersona[bundle.personaId] = bundle.snapshot;
  }

  const drafts = buildFrictionDrafts(page, personaIds, snapshotsByPersona);
  const frictions = attachEvidence(drafts, allEvidence).sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.affectedPersonas.length - a.affectedPersonas.length
  );

  const personas = bundles.map((bundle) =>
    buildPersonaResult(
      bundle.personaId,
      page,
      frictions,
      bundle.evidence.map((item) => item.id),
      bundle.snapshot
    )
  );

  const average =
    personas.reduce((sum, persona) => sum + persona.score, 0) /
    Math.max(1, personas.length);
  const criticalCount = frictions.filter((f) => f.severity === 'critical').length;
  const overallScore = Math.round(
    clamp(average - Math.min(18, criticalCount * 4), 0, 100)
  );

  const converted = personas.filter((p) => p.verdict === 'converted').length;
  const hesitated = personas.filter((p) => p.verdict === 'hesitated').length;
  const abandoned = personas.filter((p) => p.verdict === 'abandoned').length;
  const topFriction = frictions[0];

  const verdict =
    overallScore >= 80
      ? 'قمع صحي، لكنه ليس محصّنًا ضد الانسحاب'
      : overallScore >= 60
        ? 'قمع يعمل… لكنه ينزف في نقاط محددة'
        : overallScore >= 40
          ? 'قمع ينزف بوضوح ويحتاج تدخلًا جراحيًا'
          : 'قمع في حالة حرجة: معظم الشخصيات تنسحب قبل القرار';

  const summary =
    `شخّصنا ${personas.length} شخصيات داخل نفس القمع. ` +
    `${converted} وصلت، ${hesitated} ترددت، و${abandoned} انسحبت. ` +
    (topFriction
      ? `أكبر قاتل: «${topFriction.title}» — ${topFriction.description}`
      : 'لا توجد نقاط احتكاك حرجة في القراءة الأولى.');

  return {
    runId,
    url,
    finalUrl: page.url || url,
    title: page.title || page.h1 || url,
    createdAt: Date.now(),
    durationMs,
    overallScore,
    verdict,
    summary,
    personas,
    frictions,
    evidence: allEvidence,
    page,
    aiEnriched: false,
    engine: 'heuristic'
  };
}

// ---------------------------------------------------------------------------
// AI enrichment merge
// ---------------------------------------------------------------------------

export interface FunnelAiEnrichment {
  summary?: string;
  verdict?: string;
  personas?: Array<{
    personaId?: string;
    causeOfDeath?: string;
    frictionSignals?: string[];
  }>;
  frictions?: Array<{
    id?: string;
    title?: string;
    description?: string;
    recommendation?: string;
  }>;
}

export function extractJsonObject(raw: string): unknown | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function applyAiEnrichment(
  report: FunnelAutopsyReport,
  enrichment: FunnelAiEnrichment | null
): FunnelAutopsyReport {
  if (!enrichment || typeof enrichment !== 'object') return report;

  const next: FunnelAutopsyReport = {
    ...report,
    personas: report.personas.map((persona) => ({ ...persona })),
    frictions: report.frictions.map((friction) => ({ ...friction })),
    aiEnriched: true,
    engine: 'heuristic+ai'
  };

  if (typeof enrichment.summary === 'string' && enrichment.summary.trim()) {
    next.summary = enrichment.summary.trim();
  }
  if (typeof enrichment.verdict === 'string' && enrichment.verdict.trim()) {
    next.verdict = enrichment.verdict.trim();
  }

  if (Array.isArray(enrichment.personas)) {
    for (const item of enrichment.personas) {
      const persona = next.personas.find((candidate) => candidate.personaId === item?.personaId);
      if (!persona) continue;
      if (typeof item.causeOfDeath === 'string' && item.causeOfDeath.trim()) {
        persona.causeOfDeath = item.causeOfDeath.trim();
      }
      if (Array.isArray(item.frictionSignals)) {
        const signals = item.frictionSignals
          .map((signal) => cleanText(signal, 240))
          .filter(Boolean)
          .slice(0, 6);
        if (signals.length) persona.frictionSignals = signals;
      }
    }
  }

  if (Array.isArray(enrichment.frictions)) {
    for (const item of enrichment.frictions) {
      const friction = next.frictions.find((candidate) => candidate.id === item?.id);
      if (!friction) continue;
      if (typeof item.title === 'string' && item.title.trim()) friction.title = item.title.trim();
      if (typeof item.description === 'string' && item.description.trim()) {
        friction.description = item.description.trim();
      }
      if (typeof item.recommendation === 'string' && item.recommendation.trim()) {
        friction.recommendation = item.recommendation.trim();
      }
    }
  }

  return next;
}

export function buildAiPrompt(report: FunnelAutopsyReport): string {
  const compact = {
    url: report.finalUrl,
    title: report.title,
    overallScore: report.overallScore,
    verdict: report.verdict,
    page: {
      h1: report.page.h1,
      prices: report.page.prices,
      primaryCta: report.page.primaryCta,
      trustSignals: report.page.trustSignals,
      fieldCount: report.page.fieldCount,
      hasGuarantee: report.page.hasGuarantee,
      hasTestimonials: report.page.hasTestimonials,
      hasFaq: report.page.hasFaq,
      hasUrgency: report.page.hasUrgency,
      pageHeight: report.page.pageHeight,
      viewportHeight: report.page.viewportHeight
    },
    personas: report.personas.map((persona) => ({
      personaId: persona.personaId,
      name: persona.name,
      verdict: persona.verdict,
      score: persona.score,
      abandonmentStage: persona.abandonmentStage,
      causeOfDeath: persona.causeOfDeath,
      frictionSignals: persona.frictionSignals
    })),
    frictions: report.frictions.map((friction) => ({
      id: friction.id,
      severity: friction.severity,
      category: friction.category,
      title: friction.title,
      description: friction.description,
      recommendation: friction.recommendation
    }))
  };

  return (
    `أنت كبير مسؤولي التحويل (CRO) في WarWick. لديك تقرير Funnel Autopsy أولي مبني على محاكاة شخصيات. ` +
    `حسّن التقرير بالعربية فقط، بلهجة واضحة ومباشرة، دون مبالغة أو وعود غير قابلة للقياس. ` +
    `أعد JSON صالحًا فقط بهذا الشكل: ` +
    `{"summary":"...","verdict":"...","personas":[{"personaId":"...","causeOfDeath":"...","frictionSignals":["..."]}],"frictions":[{"id":"...","title":"...","description":"...","recommendation":"..."}]}. ` +
    `لا تضف أي نص خارج JSON. البيانات:\n` +
    JSON.stringify(compact)
  );
}
