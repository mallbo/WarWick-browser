/**
 * WarWick Browser — Funnel Autopsy service.
 *
 * Opens the funnel in isolated, hidden browsing sessions (one per persona),
 * captures DOM evidence and screenshots, then produces a cause-of-death report.
 * No form is ever submitted and no purchase is attempted.
 */

import { BrowserWindow, session } from 'electron';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  IPC_CHANNELS,
  type FunnelAutopsyErrorPayload,
  type FunnelAutopsyProgress,
  type FunnelAutopsyReport,
  type FunnelAutopsyRequest,
  type FunnelEvidence,
  type FunnelEvidenceStage,
  type FunnelPersonaId,
  type FunnelPageSnapshot
} from '../shared/types';
import type { AntigravityBridge } from './antigravityBridge';
import { findAgyExecutable } from './antigravityBridge';
import {
  DEFAULT_FUNNEL_PERSONAS,
  FUNNEL_PERSONA_META,
  applyAiEnrichment,
  buildAiPrompt,
  buildHeuristicReport,
  extractJsonObject,
  normalizeFunnelUrl,
  sanitizeSnapshot,
  type FunnelAiEnrichment,
  type PersonaSnapshotBundle
} from './funnelAutopsyCore';

const LOAD_TIMEOUT_MS = 30000;
const SCAN_TIMEOUT_MS = 10000;
const CAPTURE_TIMEOUT_MS = 6000;
const AI_TIMEOUT_MS = 15000;

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PERSONA_VIEWPORTS: Record<
  FunnelPersonaId,
  { width: number; height: number; mobile: boolean }
> = {
  skeptic: { width: 1280, height: 900, mobile: false },
  'bargain-hunter': { width: 1366, height: 900, mobile: false },
  'impulse-buyer': { width: 1280, height: 860, mobile: false },
  'mobile-first': { width: 390, height: 844, mobile: true },
  'non-technical': { width: 1180, height: 900, mobile: false }
};

const PAGE_SCAN_SCRIPT = `
(() => {
  try {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 2 && rect.height > 2 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || 1) > 0.05;
    };
    const textOf = (el) => clean(el.innerText || el.textContent || el.value || '');
    const ctaWords = /(start|get started|try|free|demo|buy|order|shop|subscribe|sign up|signup|register|book|request|contact|download|continue|checkout|add to cart|claim|apply|join|upgrade|pricing|see plans|learn more|ابدأ|جرّب|اشتر|اطلب|سجّل|احجز|تواصل|حمّل|اكتشف|اعرف)/i;
    const genericButton = /(submit|send|continue|next|go|learn more|more|details|إرسال|متابعة|التالي|المزيد)/i;
    const bodyText = document.body ? document.body.innerText || '' : '';
    const lower = bodyText.toLowerCase();
    const has = (words) => words.some((word) => lower.indexOf(word) !== -1);
    const viewportHeight = window.innerHeight || 800;
    const anchors = Array.from(document.querySelectorAll('a, button, input[type="submit"], [role="button"]'));
    const ctas = [];
    for (let i = 0; i < anchors.length && ctas.length < 24; i++) {
      const el = anchors[i];
      if (!isVisible(el)) continue;
      const text = textOf(el);
      if (!text) continue;
      const className = typeof el.className === 'string' ? el.className : '';
      const id = typeof el.id === 'string' ? el.id : '';
      const type = (el.getAttribute('type') || '').toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const isCtaText = ctaWords.test(text);
      const isCtaClass = /(cta|btn|button|primary|hero|action)/i.test(className + ' ' + id);
      if (!isCtaText && !isCtaClass && type !== 'submit' && role !== 'button') continue;
      const rect = el.getBoundingClientRect();
      ctas.push({
        text: text.slice(0, 140),
        tag: (el.tagName || '').toLowerCase(),
        href: el.href ? String(el.href).slice(0, 2000) : '',
        type: type || undefined,
        isAboveFold: rect.top >= 0 && rect.top < viewportHeight,
        isPrimary: (isCtaText && !genericButton.test(text)) || /(primary|cta|hero)/i.test(className + ' ' + id)
      });
    }
    const primaryCta = ctas.find((cta) => cta.isPrimary && cta.isAboveFold) ||
      ctas.find((cta) => cta.isPrimary) ||
      ctas.find((cta) => cta.isAboveFold) ||
      ctas[0];

    const fields = [];
    const fieldEls = Array.from(document.querySelectorAll('input, select, textarea'));
    for (let i = 0; i < fieldEls.length && fields.length < 24; i++) {
      const el = fieldEls[i];
      if (!isVisible(el)) continue;
      const type = (el.getAttribute('type') || el.tagName || 'text').toLowerCase();
      if (type === 'hidden') continue;
      let label = '';
      if (el.labels && el.labels.length) {
        label = clean(el.labels[0].innerText || el.labels[0].textContent || '');
      }
      if (!label) label = clean(el.getAttribute('aria-label') || '');
      fields.push({
        type: type,
        name: clean(el.getAttribute('name') || el.id || '').slice(0, 120),
        label: label.slice(0, 200),
        placeholder: clean(el.getAttribute('placeholder') || '').slice(0, 200),
        required: Boolean(el.required || el.getAttribute('aria-required') === 'true')
      });
    }

    const forms = Array.from(document.querySelectorAll('form')).filter(isVisible).slice(0, 10).map((form) => ({
      fieldCount: form.querySelectorAll('input, select, textarea').length,
      action: form.action ? String(form.action).slice(0, 2000) : '',
      method: form.method || ''
    }));

    const headings = Array.from(document.querySelectorAll('h1, h2')).filter(isVisible).slice(0, 24).map((el) => ({
      tag: (el.tagName || '').toLowerCase(),
      text: textOf(el).slice(0, 300)
    }));
    const h1 = (headings.find((h) => h.tag === 'h1') || { text: '' }).text;
    const h2s = headings.filter((h) => h.tag === 'h2').map((h) => h.text).filter(Boolean);

    const priceRegex = /(?:[$€£¥]|USD|EUR|GBP|SAR|AED|EGP|KWD|QAR)\\s?\\d[\\d,.]*(?:\\s?(?:\\/|per)\\s?(?:mo|month|year|yr|شهر|سنة))?|\\d[\\d,.]*\\s?(?:USD|EUR|GBP|SAR|AED|EGP|KWD|QAR)/gi;
    const prices = [];
    const seenPrices = {};
    const matches = bodyText.match(priceRegex) || [];
    for (let i = 0; i < matches.length && prices.length < 12; i++) {
      const price = clean(matches[i]);
      if (price && !seenPrices[price.toLowerCase()]) {
        seenPrices[price.toLowerCase()] = true;
        prices.push(price);
      }
    }

    const trustSignals = [];
    if (has(['money back', 'money-back', 'refund', 'guarantee', 'warranty', 'استرداد', 'ضمان'])) trustSignals.push('ضمان / استرداد');
    if (has(['testimonial', 'review', 'rated', 'stars', 'customers', 'clients', 'تقييم', 'عملاء', 'آراء'])) trustSignals.push('دليل اجتماعي');
    if (has(['secure', 'ssl', 'encrypted', 'safe checkout', 'آمن', 'مشفر'])) trustSignals.push('أمان الدفع');
    if (has(['trusted by', 'as seen in', 'featured in', 'partners', 'شركاء', 'موثوق'])) trustSignals.push('جهة موثوقة');
    if (has(['free trial', 'no credit card', 'cancel anytime', 'تجربة مجانية', 'بدون بطاقة'])) trustSignals.push('إزالة المخاطرة');

    const navLinks = Array.from(document.querySelectorAll('nav a, header a'))
      .filter(isVisible)
      .slice(0, 16)
      .map((el) => ({
        text: textOf(el).slice(0, 100),
        href: el.href ? String(el.href).slice(0, 2000) : ''
      }))
      .filter((link) => link.text && link.href);

    const images = Array.from(document.images);
    const metaEl = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');

    return {
      url: location.href,
      title: document.title || '',
      metaDescription: metaEl ? (metaEl.getAttribute('content') || '') : '',
      h1: h1,
      h2s: h2s,
      ctas: ctas,
      primaryCta: primaryCta,
      forms: forms,
      fields: fields,
      prices: prices,
      trustSignals: trustSignals,
      navLinks: navLinks,
      textSample: clean(bodyText).slice(0, 12000),
      wordCount: clean(bodyText).split(/\\s+/).filter(Boolean).length,
      imageCount: images.length,
      imagesMissingAlt: images.filter((img) => !img.alt).length,
      hasVideo: Boolean(document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]')),
      hasChat: Boolean(document.querySelector('[class*="chat" i], [id*="chat" i], [aria-label*="chat" i], [class*="intercom" i], [id*="intercom" i]')),
      hasFaq: /(faq|frequently asked|الأسئلة الشائعة|أسئلة شائعة)/i.test(bodyText) || Boolean(document.querySelector('[class*="faq" i], [id*="faq" i]')),
      hasTestimonials: /(testimonial|review|rated|تقييم|آراء العملاء)/i.test(bodyText) || Boolean(document.querySelector('[class*="testimonial" i], [class*="review" i]')),
      hasGuarantee: /(guarantee|refund|money back|warranty|ضمان|استرداد)/i.test(bodyText),
      hasUrgency: /(limited time|today only|last chance|expires|only \\d+ left|countdown|عرض محدود|اليوم فقط|آخر فرصة|ينتهي)/i.test(bodyText),
      hasCountdown: Boolean(document.querySelector('[class*="countdown" i], [class*="timer" i], time[datetime]')),
      hasCookieBanner: /(cookie|consent|ملفات تعريف الارتباط|موافقة)/i.test(bodyText) && Boolean(document.querySelector('[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i]')),
      hasPricingSection: /(pricing|plans|packages|الأسعار|الخطط|الباقات)/i.test(bodyText) || Boolean(document.querySelector('[class*="pricing" i], [id*="pricing" i]')),
      hasContact: /(contact|support|email us|call us|تواصل|الدعم|اتصل بنا)/i.test(bodyText) || Boolean(document.querySelector('a[href^="mailto:"], a[href^="tel:"]')),
      pageHeight: document.body ? document.body.scrollHeight : 0,
      viewportHeight: window.innerHeight || 800,
      viewportWidth: window.innerWidth || 1280,
      formCount: forms.length,
      fieldCount: fields.length,
      requiredFieldCount: fields.filter((field) => field.required).length,
      buttonCount: ctas.length,
      linkCount: document.querySelectorAll('a').length
    };
  } catch (error) {
    return {
      url: location.href,
      title: document.title || '',
      metaDescription: '',
      h1: '',
      h2s: [],
      ctas: [],
      primaryCta: null,
      forms: [],
      fields: [],
      prices: [],
      trustSignals: [],
      navLinks: [],
      textSample: document.body ? String(document.body.innerText || '').slice(0, 12000) : '',
      wordCount: 0,
      imageCount: 0,
      imagesMissingAlt: 0,
      hasVideo: false,
      hasChat: false,
      hasFaq: false,
      hasTestimonials: false,
      hasGuarantee: false,
      hasUrgency: false,
      hasCountdown: false,
      hasCookieBanner: false,
      hasPricingSection: false,
      hasContact: false,
      pageHeight: 0,
      viewportHeight: window.innerHeight || 800,
      viewportWidth: window.innerWidth || 1280,
      formCount: 0,
      fieldCount: 0,
      requiredFieldCount: 0,
      buttonCount: 0,
      linkCount: document.querySelectorAll('a').length
    };
  }
})()
`;

const HIGHLIGHT_CTA_SCRIPT = `
(() => {
  const textOf = (el) => String(el.innerText || el.value || '').replace(/\\s+/g, ' ').trim();
  const words = /(start|get started|try|free|demo|buy|order|shop|subscribe|sign up|signup|register|book|request|contact|download|continue|checkout|add to cart|claim|apply|join|upgrade|pricing|see plans|learn more|ابدأ|جرّب|اشتر|اطلب|سجّل|احجز|تواصل|حمّل|اكتشف|اعرف)/i;
  const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], [role="button"]'));
  const cta = candidates.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && words.test(textOf(el));
  });
  if (!cta) return false;
  cta.scrollIntoView({ block: 'center', behavior: 'instant' });
  cta.style.outline = '3px solid #F2B632';
  cta.style.outlineOffset = '4px';
  return true;
})()
`;

const FILL_FORM_SCRIPT = `
(() => {
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const fields = Array.from(document.querySelectorAll('input, textarea'));
  const blocked = /(hidden|password|file|submit|button|checkbox|radio|search|coupon|promo|quantity|qty|card|cc-|cvc|cvv|expiry|exp-|otp|code)/i;
  const data = {
    name: 'Alex Morgan',
    email: 'alex.autopsy@example.com',
    phone: '+15550100',
    company: 'Northstar Labs',
    note: 'I am comparing a few options before deciding.'
  };
  let filled = 0;
  for (let i = 0; i < fields.length && filled < 6; i++) {
    const el = fields[i];
    if (!el || el.disabled || el.readOnly) continue;
    const type = (el.getAttribute('type') || el.tagName || 'text').toLowerCase();
    const fingerprint = (type + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '')).toLowerCase();
    if (blocked.test(fingerprint)) continue;
    if (el.offsetWidth < 2 || el.offsetHeight < 2) continue;
    let value = data.name;
    if (type === 'email' || /email|e-mail/.test(fingerprint)) value = data.email;
    else if (type === 'tel' || /phone|mobile|whatsapp/.test(fingerprint)) value = data.phone;
    else if (type === 'number') value = '2';
    else if (/company|business|organization/.test(fingerprint)) value = data.company;
    else if (el.tagName === 'TEXTAREA' || /message|note|comment/.test(fingerprint)) value = data.note;
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    );
    try {
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    } catch (error) {
      // Ignore fields that reject synthetic input.
    }
  }
  return { filled: filled, total: fields.length };
})()
`;

type RunState = {
  runId: string;
  cancelled: boolean;
  finished: boolean;
  windows: Set<BrowserWindow>;
  report?: FunnelAutopsyReport;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class FunnelAutopsyService {
  private mainWindow: BrowserWindow;
  private bridge?: AntigravityBridge | null;
  private runs = new Map<string, RunState>();
  private isDestroyed = false;

  constructor(mainWindow: BrowserWindow, bridge?: AntigravityBridge | null) {
    this.mainWindow = mainWindow;
    this.bridge = bridge;
  }

  public async start(request: FunnelAutopsyRequest): Promise<{ runId: string }> {
    if (this.isDestroyed) {
      throw new Error('Funnel Autopsy service has been destroyed');
    }
    const url = normalizeFunnelUrl(request?.url || '');
    const personaIds = this.resolvePersonas(request?.personaIds);
    const runId = `autopsy-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const state: RunState = {
      runId,
      cancelled: false,
      finished: false,
      windows: new Set()
    };
    this.runs.set(runId, state);
    this.emitProgress({
      runId,
      stage: 'queued',
      message: 'تم استلام رابط القمع. تجهيز الشخصيات…',
      progressPercent: 2,
      currentUrl: url
    });

    void this.execute(state, { ...request, url, personaIds }).catch((error) => {
      if (state.cancelled || this.isDestroyed) return;
      state.finished = true;
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress({
        runId,
        stage: 'error',
        message,
        progressPercent: 100,
        currentUrl: url
      });
      this.sendError({ runId, message });
    });

    return { runId };
  }

  public async cancel(runId: string): Promise<boolean> {
    const state = this.runs.get(runId);
    if (!state || state.finished) return false;
    state.cancelled = true;
    state.finished = true;
    for (const win of Array.from(state.windows)) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.stop();
          win.destroy();
        }
      } catch {
        // Ignore teardown races.
      }
    }
    state.windows.clear();
    this.emitProgress({
      runId,
      stage: 'cancelled',
      message: 'تم إلغاء التشريح.',
      progressPercent: 100
    });
    this.sendError({ runId, message: 'تم إلغاء التشريح.', cancelled: true });
    return true;
  }

  public getReport(runId: string): FunnelAutopsyReport | null {
    return this.runs.get(runId)?.report ?? null;
  }

  public async destroy(): Promise<void> {
    this.isDestroyed = true;
    for (const runId of Array.from(this.runs.keys())) {
      await this.cancel(runId);
    }
    this.runs.clear();
  }

  private resolvePersonas(ids?: FunnelPersonaId[]): FunnelPersonaId[] {
    const known = new Set(Object.keys(FUNNEL_PERSONA_META) as FunnelPersonaId[]);
    const requested = Array.isArray(ids)
      ? ids.filter((id): id is FunnelPersonaId => known.has(id))
      : [];
    const unique = Array.from(new Set(requested));
    if (unique.length > 0) return unique.slice(0, 5);
    return [...DEFAULT_FUNNEL_PERSONAS];
  }

  private async execute(state: RunState, request: FunnelAutopsyRequest & { personaIds: FunnelPersonaId[] }): Promise<void> {
    const startedAt = Date.now();
    const bundles: PersonaSnapshotBundle[] = [];
    const failedPersonas: FunnelPersonaId[] = [];

    this.emitProgress({
      runId: state.runId,
      stage: 'loading',
      message: `فتح ${request.url} في ${request.personaIds.length} جلسات معزولة…`,
      progressPercent: 6,
      currentUrl: request.url
    });

    for (let i = 0; i < request.personaIds.length; i++) {
      if (state.cancelled) return;
      const personaId = request.personaIds[i];
      const meta = FUNNEL_PERSONA_META[personaId];
      try {
        const bundle = await this.runPersona(state, request.url, personaId, request, i, request.personaIds.length);
        bundles.push(bundle);
      } catch (error) {
        if (state.cancelled) return;
        failedPersonas.push(personaId);
        console.warn(`[Funnel Autopsy] Persona ${personaId} failed:`, error);
        this.emitProgress({
          runId: state.runId,
          stage: 'walking',
          message: `${meta.name} لم تكمل الرحلة (${error instanceof Error ? error.message : String(error)}). نكمل بالشخصيات الأخرى…`,
          progressPercent: 12 + Math.round(((i + 1) / request.personaIds.length) * 60),
          personaId
        });
      }
    }

    if (state.cancelled) return;
    if (bundles.length === 0) {
      throw new Error('تعذر فتح الصفحة أو جمع أي بيانات. تأكد من الرابط واتصال الإنترنت.');
    }

    this.emitProgress({
      runId: state.runId,
      stage: 'analyzing',
      message: 'نشريح الأدلة ونحدد سبب الوفاة لكل شخصية…',
      progressPercent: 78,
      currentUrl: request.url
    });

    const heuristic = buildHeuristicReport({
      runId: state.runId,
      url: request.url,
      durationMs: Date.now() - startedAt,
      bundles
    });

    let report = heuristic;
    if (!state.cancelled) {
      try {
        report = await this.enrichWithAi(heuristic, state);
      } catch (error) {
        console.warn('[Funnel Autopsy] AI enrichment failed, keeping heuristic report:', error);
      }
    }

    if (state.cancelled) return;
    state.report = report;
    state.finished = true;

    if (failedPersonas.length > 0) {
      report.summary += ` (تعذر تشغيل ${failedPersonas.length} شخصية، لكن التقرير مبني على الشخصيات التي أكملت.)`;
    }

    this.emitProgress({
      runId: state.runId,
      stage: 'complete',
      message: 'التشريح اكتمل. التقرير جاهز.',
      progressPercent: 100,
      currentUrl: report.finalUrl
    });
    this.send(IPC_CHANNELS.FUNNEL_AUTOPSY_COMPLETE, report);
  }

  private async runPersona(
    state: RunState,
    url: string,
    personaId: FunnelPersonaId,
    request: FunnelAutopsyRequest,
    index: number,
    total: number
  ): Promise<PersonaSnapshotBundle> {
    const meta = FUNNEL_PERSONA_META[personaId];
    const viewport = PERSONA_VIEWPORTS[personaId];
    const partition = `funnel-autopsy-${state.runId}-${personaId}`;
    const baseProgress = 10 + (index / Math.max(1, total)) * 62;

    this.emitProgress({
      runId: state.runId,
      stage: 'loading',
      message: `${meta.name}: فتح الصفحة (${viewport.mobile ? 'موبايل' : 'سطح مكتب'})…`,
      progressPercent: baseProgress,
      personaId,
      currentUrl: url
    });

    try {
      const personaSession = session.fromPartition(partition);
      personaSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      personaSession.setPermissionCheckHandler(() => false);
    } catch {
      // Some mocked/test environments do not expose session helpers.
    }

    const win = new BrowserWindow({
      show: false,
      width: viewport.width,
      height: viewport.height,
      minWidth: 320,
      minHeight: 480,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#121009',
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        webSecurity: true,
        spellcheck: false,
        devTools: false
      }
    });
    state.windows.add(win);

    try {
      win.webContents.setUserAgent(viewport.mobile ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT);
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      try {
        win.webContents.setZoomFactor(1);
      } catch {}

      await withTimeout(win.loadURL(url), LOAD_TIMEOUT_MS, 'Page load');
      await wait(900 + index * 220);
      if (state.cancelled) throw new Error('cancelled');

      this.emitProgress({
        runId: state.runId,
        stage: 'scanning',
        message: `${meta.name}: تقرأ الواجهة الأولى وتلتقط إشارات الثقة…`,
        progressPercent: baseProgress + 10,
        personaId,
        currentUrl: url
      });

      const raw = await withTimeout(
        win.webContents.executeJavaScript(PAGE_SCAN_SCRIPT, true),
        SCAN_TIMEOUT_MS,
        'Page scan'
      );
      const snapshot = sanitizeSnapshot(raw as Partial<FunnelPageSnapshot>, url);
      const evidence: FunnelEvidence[] = [];

      if (request.captureScreenshots !== false) {
        this.emitProgress({
          runId: state.runId,
          stage: 'walking',
          message: `${meta.name}: تبدأ في التمرير واختبار رحلة القمع…`,
          progressPercent: baseProgress + 18,
          personaId,
          currentUrl: url
        });

        const hero = await this.capture(win, personaId, 'hero', 'أول شاشة', 'ما يراه الزائر قبل أي تمرير', snapshot.url);
        if (hero) evidence.push(hero);

        await this.runInPage(win, `(() => { const y = Math.max(0, document.body.scrollHeight * 0.55 - window.innerHeight * 0.5); window.scrollTo(0, y); return window.scrollY; })()`);
        await wait(380);
        const mid = await this.capture(win, personaId, 'mid', 'منتصف الصفحة', 'العرض والسعر وإشارات الثقة', snapshot.url);
        if (mid) evidence.push(mid);

        this.emitProgress({
          runId: state.runId,
          stage: 'walking',
          message: `${meta.name}: تقترب من الـ CTA وتختبر وضوحه…`,
          progressPercent: baseProgress + 28,
          personaId,
          currentUrl: url
        });
        await this.runInPage(win, HIGHLIGHT_CTA_SCRIPT);
        await wait(380);
        const cta = await this.capture(win, personaId, 'cta', 'لحظة الـ CTA', 'الزر الأساسي كما تراه الشخصية', snapshot.url);
        if (cta) evidence.push(cta);

        const fillResult = await this.runInPage(win, FILL_FORM_SCRIPT);
        const filledCount = Number((fillResult as { filled?: number } | null)?.filled || 0);
        if (filledCount > 0) {
          this.emitProgress({
            runId: state.runId,
            stage: 'capturing',
            message: `${meta.name}: تملأ الفورم ببيانات تجريبية دون إرسال…`,
            progressPercent: baseProgress + 38,
            personaId,
            currentUrl: url
          });
          await wait(380);
          const form = await this.capture(win, personaId, 'form', 'لحظة الفورم', `${filledCount} حقول جرى تعبئتها بدون إرسال`, snapshot.url);
          if (form) evidence.push(form);
        } else {
          await this.runInPage(win, `(() => { window.scrollTo(0, document.body.scrollHeight); return window.scrollY; })()`);
          await wait(380);
          const bottom = await this.capture(win, personaId, 'bottom', 'نهاية الصفحة', 'آخر ما تراه الشخصية قبل القرار', snapshot.url);
          if (bottom) evidence.push(bottom);
        }
      }

      return { personaId, snapshot, evidence };
    } finally {
      state.windows.delete(win);
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch {}
    }
  }

  private async capture(
    win: BrowserWindow,
    personaId: FunnelPersonaId,
    stage: FunnelEvidenceStage,
    label: string,
    description: string,
    url: string
  ): Promise<FunnelEvidence | null> {
    if (win.isDestroyed()) return null;
    try {
      const image = await withTimeout(win.webContents.capturePage(), CAPTURE_TIMEOUT_MS, 'Screenshot');
      if (!image || image.isEmpty()) return null;
      const base64 = image.toJPEG(58).toString('base64');
      return {
        id: `ev-${personaId}-${stage}-${crypto.randomBytes(2).toString('hex')}`,
        personaId,
        stage,
        label,
        description,
        screenshotBase64: `data:image/jpeg;base64,${base64}`,
        url,
        capturedAt: Date.now()
      };
    } catch (error) {
      console.warn(`[Funnel Autopsy] Screenshot ${stage} failed:`, error);
      return null;
    }
  }

  private async runInPage(win: BrowserWindow, script: string): Promise<unknown> {
    if (win.isDestroyed()) return null;
    try {
      return await withTimeout(
        win.webContents.executeJavaScript(script, true),
        SCAN_TIMEOUT_MS,
        'Page interaction'
      );
    } catch (error) {
      console.warn('[Funnel Autopsy] Interaction failed:', error);
      return null;
    }
  }

  private async enrichWithAi(
    report: FunnelAutopsyReport,
    state: RunState
  ): Promise<FunnelAutopsyReport> {
    if (state.cancelled) return report;
    if (!this.bridge) return report;
    const prompt = buildAiPrompt(report);
    let raw: string | null = null;

    const client = this.bridge?.getGenAIClient?.();
    if (client) {
      try {
        this.emitProgress({
          runId: state.runId,
          stage: 'analyzing',
          message: 'Gemini يكتب السبب التفصيلي للوفاة…',
          progressPercent: 84,
          currentUrl: report.finalUrl
        });
        const settings = this.bridge?.getSettingsSnapshot?.();
        const model = settings?.geminiApiModel?.trim() || 'gemini-2.0-flash';
        const response = await withTimeout(
          client.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
          }),
          AI_TIMEOUT_MS,
          'Gemini analysis'
        );
        raw = response?.text || null;
      } catch (error) {
        console.warn('[Funnel Autopsy] Gemini enrichment failed:', error);
      }
    }

    if (!raw && !state.cancelled) {
      raw = await this.tryLocalAgy(prompt, report, state);
    }

    if (!raw || state.cancelled) return report;
    const parsed = extractJsonObject(raw) as FunnelAiEnrichment | null;
    return applyAiEnrichment(report, parsed);
  }

  private async tryLocalAgy(
    prompt: string,
    report: FunnelAutopsyReport,
    state: RunState
  ): Promise<string | null> {
    if (state.cancelled) return null;
    const agyPath = findAgyExecutable();
    const model = this.bridge?.getSettingsSnapshot?.()?.aiModel?.trim() || 'gemini-3.8-flash-high';

    this.emitProgress({
      runId: state.runId,
      stage: 'analyzing',
      message: 'Antigravity المحلي يكتب التقرير…',
      progressPercent: 88,
      currentUrl: report.finalUrl
    });

    return new Promise((resolve) => {
      let settled = false;
      let output = '';
      let child: ChildProcess | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          child?.kill();
        } catch {}
        resolve(value);
      };

      try {
        child = spawn(
          agyPath,
          ['-p', prompt, '--model', model, '--disable-slash-commands'],
          { windowsHide: true, env: process.env }
        );
        child.stdout?.on('data', (data: Buffer) => {
          output += data.toString('utf8');
          if (output.length > 200000) finish(null);
        });
        child.on('error', () => finish(null));
        child.on('close', (code) => {
          finish(code === 0 && output.trim() ? output.trim() : null);
        });
        timer = setTimeout(() => finish(null), AI_TIMEOUT_MS);
      } catch {
        finish(null);
      }
    });
  }

  private emitProgress(progress: FunnelAutopsyProgress): void {
    if (this.isDestroyed) return;
    this.send(IPC_CHANNELS.FUNNEL_AUTOPSY_PROGRESS, {
      ...progress,
      progressPercent: clampPercent(progress.progressPercent)
    });
  }

  private sendError(payload: FunnelAutopsyErrorPayload): void {
    if (this.isDestroyed) return;
    this.send(IPC_CHANNELS.FUNNEL_AUTOPSY_ERROR, payload);
  }

  private send(channel: string, payload: unknown): void {
    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, payload);
      }
    } catch {
      // Window may be closing.
    }
  }
}
