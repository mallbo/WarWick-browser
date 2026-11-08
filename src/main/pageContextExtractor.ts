/**
 * WarWick Browser - In-Page Context Extractor
 * Milestone 3: Features 14 (read_current_page) & 15 (take_page_screenshot)
 */

import type { TabManager } from './tabManager';
import type { PageContext } from '../shared/types';
import { THEME_CONSTANTS } from '../shared/types';

export interface PageExtractorOptions {
  includeScreenshot?: boolean;
  maxChars?: number;
  quality?: number;
}

export const TRUNCATE_NOTICE = '\n\n[Content truncated at 40,000 characters for token limit...]';

/**
 * Enforces a strict 40,000 character token guard with word-boundary truncation
 */
export function enforceTokenGuard(
  text: string,
  maxChars: number = THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS,
  appendNotice: boolean = true
): string {
  if (!text) {
    return '';
  }

  if (text.length <= maxChars) {
    return text;
  }

  if (!appendNotice) {
    return text.substring(0, maxChars);
  }

  const maxContentLength = maxChars - TRUNCATE_NOTICE.length;
  if (maxContentLength <= 0) {
    return text.substring(0, maxChars);
  }

  const candidate = text.substring(0, maxContentLength);
  const lastSpace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
  const cleanCut = lastSpace > maxContentLength * 0.8 ? candidate.substring(0, lastSpace) : candidate;

  const result = cleanCut.trimEnd() + TRUNCATE_NOTICE;
  // Hard guarantee that result never exceeds maxChars
  return result.length <= maxChars ? result : result.substring(0, maxChars);
}

/**
 * Captures a high-resolution viewport screenshot as base64 JPEG data URL
 */
export async function captureActivePageScreenshot(
  tabManager: TabManager,
  quality: number = 80
): Promise<string | undefined> {
  const activeTab = tabManager.getActiveTab();
  if (!activeTab || !activeTab.view?.webContents || activeTab.view.webContents.isDestroyed?.()) {
    return undefined;
  }

  if (activeTab.state.isCrashed) {
    return undefined;
  }

  const wc = activeTab.view.webContents;

  try {
    const bounds = activeTab.view.getBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('capturePage timeout')), 3000);
    });

    let image;
    try {
      image = await Promise.race([
        wc.capturePage(),
        timeoutPromise
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!image || image.isEmpty()) {
      return undefined;
    }

    const clampedQuality = Math.max(1, Math.min(100, Math.round(quality)));
    const jpegBuffer = image.toJPEG(clampedQuality);
    if (!jpegBuffer || jpegBuffer.length === 0) {
      return undefined;
    }

    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
  } catch (err) {
    console.error('Failed to capture page screenshot:', err);
    return undefined;
  }
}

/**
 * Script executed inside the WebContents to extract clean structured DOM content
 */
const DOM_EXTRACTION_SCRIPT = `
(() => {
  try {
    const title = document.title || '';
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = (canonicalEl && canonicalEl.href) ? canonicalEl.href : window.location.href;

    const metaEl = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
    const metaDescription = metaEl ? (metaEl.getAttribute('content') || '') : '';

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    const body = document.body;
    if (!body) {
      return { title, canonicalUrl, metaDescription, selectedText, readableText: '' };
    }

    const clone = body.cloneNode(true);

    const unwantedSelectors = 'script, style, svg, iframe, noscript, nav, footer, header, aside, template, canvas, audio, video, object, embed';
    const noiseNodes = clone.querySelectorAll(unwantedSelectors);
    for (let i = 0; i < noiseNodes.length; i++) {
      noiseNodes[i].remove();
    }

    const hiddenNodes = clone.querySelectorAll('[hidden], [aria-hidden="true"]');
    for (let i = 0; i < hiddenNodes.length; i++) {
      hiddenNodes[i].remove();
    }

    const structuredLines = [];

    function processNode(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\\s+/g, ' ');
        if (text.trim().length > 0) {
          structuredLines.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('\\n' + '#'.repeat(level) + ' ' + text + '\\n');
        }
        return;
      }

      if (tag === 'pre') {
        const code = (node.textContent || '').trim();
        if (code) {
          structuredLines.push('\\n\`\`\`\\n' + code + '\\n\`\`\`\\n');
        }
        return;
      }

      if (tag === 'p') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('\\n' + text + '\\n');
        }
        return;
      }

      if (tag === 'li') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          const isOrdered = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol';
          structuredLines.push((isOrdered ? '1. ' : '- ') + text);
        }
        return;
      }

      if (tag === 'tr') {
        const cells = Array.from(node.querySelectorAll('th, td')).map(c => (c.textContent || '').replace(/\\s+/g, ' ').trim());
        if (cells.length > 0) {
          structuredLines.push('| ' + cells.join(' | ') + ' |');
        }
        return;
      }

      if (tag === 'blockquote') {
        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) {
          structuredLines.push('> ' + text);
        }
        return;
      }

      for (let i = 0; i < node.childNodes.length; i++) {
        processNode(node.childNodes[i]);
      }
    }

    processNode(clone);

    let rawStructured = structuredLines.join(' ');
    rawStructured = rawStructured.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n\\s*\\n+/g, '\\n\\n').trim();

    return {
      title,
      canonicalUrl,
      metaDescription,
      selectedText,
      readableText: rawStructured
    };
  } catch (err) {
    return {
      title: document.title || '',
      canonicalUrl: window.location.href,
      metaDescription: '',
      selectedText: '',
      readableText: (document.body ? (document.body.innerText || '') : '').replace(/\\s+/g, ' ').trim()
    };
  }
})()
`;

/**
 * Extracts comprehensive page context from active tab
 */
export async function extractActivePageContext(
  tabManager: TabManager,
  options: PageExtractorOptions = { includeScreenshot: false }
): Promise<PageContext> {
  const activeTab = tabManager.getActiveTab();
  if (!activeTab) {
    throw new Error('No active tab to capture');
  }

  if (!activeTab.view?.webContents || activeTab.view.webContents.isDestroyed?.()) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: '',
      readableText: '[Tab WebContents destroyed]',
      metaDescription: '',
      screenshotBase64: undefined
    };
  }

  const wc = activeTab.view.webContents;

  if (activeTab.state.isCrashed) {
    return {
      url: activeTab.state.url,
      title: activeTab.state.title,
      selectedText: '',
      readableText: '[Tab crashed - render process gone]',
      metaDescription: '',
      screenshotBase64: undefined
    };
  }

  // Handle about:blank or empty URL
  if (activeTab.state.url === 'about:blank' || !activeTab.state.url) {
    let screenshotBase64: string | undefined = undefined;
    if (options.includeScreenshot) {
      screenshotBase64 = await captureActivePageScreenshot(tabManager, options.quality);
    }
    return {
      url: 'about:blank',
      title: activeTab.state.title || 'New Tab',
      selectedText: '',
      readableText: '',
      metaDescription: '',
      screenshotBase64
    };
  }

  // Capture screenshot concurrently if requested
  const screenshotPromise = options.includeScreenshot
    ? captureActivePageScreenshot(tabManager, options.quality)
    : Promise.resolve(undefined);

  // Extract DOM content via executeJavaScript with timeout guard
  const domPromise = (async () => {
    try {
      const extracted = await wc.executeJavaScript(DOM_EXTRACTION_SCRIPT);
      return extracted || {};
    } catch (err) {
      console.warn('DOM extraction failed, falling back to basic text:', err);
      return {
        title: wc.getTitle() || activeTab.state.title,
        canonicalUrl: wc.getURL() || activeTab.state.url,
        metaDescription: '',
        selectedText: '',
        readableText: ''
      };
    }
  })();

  const [domResult, screenshotBase64] = await Promise.all([domPromise, screenshotPromise]);

  const rawText = domResult.readableText || '';
  const readableText = enforceTokenGuard(rawText, options.maxChars ?? THEME_CONSTANTS.MAX_PAGE_TEXT_CHARS);

  return {
    url: domResult.canonicalUrl || wc.getURL() || activeTab.state.url,
    title: domResult.title || wc.getTitle() || activeTab.state.title,
    selectedText: domResult.selectedText || '',
    readableText,
    canonicalUrl: domResult.canonicalUrl,
    metaDescription: domResult.metaDescription || '',
    screenshotBase64
  };
}
