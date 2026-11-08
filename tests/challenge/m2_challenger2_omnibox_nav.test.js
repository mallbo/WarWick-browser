import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import EventEmitter from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// =============================================================================
// MOCK ELECTRON TEST RUNTIME
// =============================================================================

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this._destroyed = false;
    this.currentUrl = '';
    this._isMuted = false;
    this.windowOpenHandler = null;
    this.audioMutedCallHistory = [];
    this.navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => {},
      goForward: () => {}
    };
  }

  isDestroyed() {
    return this._destroyed;
  }

  loadURL(url) {
    this.currentUrl = url;
    return Promise.resolve();
  }

  reload() {}

  canGoBack() {
    return false;
  }

  canGoForward() {
    return false;
  }

  focus() {}

  close() {
    this._destroyed = true;
  }

  setAudioMuted(muted) {
    this._isMuted = Boolean(muted);
    this.audioMutedCallHistory.push(this._isMuted);
  }

  isAudioMuted() {
    return this._isMuted;
  }

  setWindowOpenHandler(handler) {
    this.windowOpenHandler = handler;
  }

  getURL() {
    return this.currentUrl;
  }

  getTitle() {
    return 'Mock Title';
  }
}

class MockWebContentsView {
  constructor() {
    this.webContents = new MockWebContents();
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.backgroundColor = '';
  }

  setBackgroundColor(c) {
    this.backgroundColor = c;
  }

  setBounds(b) {
    this.bounds = b;
  }
}

class MockBrowserWindow extends EventEmitter {
  constructor() {
    super();
    this._destroyed = false;
    this.contentView = {
      children: [],
      addChildView: (v) => {
        if (!this.contentView.children.includes(v)) {
          this.contentView.children.push(v);
        }
      },
      removeChildView: (v) => {
        const idx = this.contentView.children.indexOf(v);
        if (idx >= 0) this.contentView.children.splice(idx, 1);
      }
    };
    this.broadcastHistory = [];
    this.webContents = {
      send: (channel, tabs, activeId) => {
        this.broadcastHistory.push({
          channel,
          tabs: JSON.parse(JSON.stringify(tabs)),
          activeId
        });
      }
    };
  }

  getContentSize() {
    return [1280, 800];
  }

  isDestroyed() {
    return this._destroyed;
  }
}

// =============================================================================
// MODULE LOADERS (Direct source inspection and compilation)
// =============================================================================

function loadOmniboxModule() {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/components/Omnibox.tsx'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React }
  }).outputText;

  const mod = { exports: {} };
  const ctx = vm.createContext({
    require: (m) => {
      if (m === 'react') return { useState: () => [], useEffect: () => {}, useRef: () => ({ current: null }) };
      if (m === 'lucide-react') return {};
      return {};
    },
    module: mod,
    exports: mod.exports,
    console
  });
  vm.runInContext(js, ctx);
  return { parseOmniboxInput: mod.exports.parseOmniboxInput };
}

function loadTabManagerModule() {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/main/tabManager.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const fakeElectron = {
    WebContentsView: MockWebContentsView,
    BrowserWindow: MockBrowserWindow
  };

  const mod = { exports: {} };
  const ctx = vm.createContext({
    require: (m) => {
      if (m === 'electron') return fakeElectron;
      if (m === 'node:crypto' || m === 'crypto') return require('node:crypto');
      if (m === '../shared/types') return { IPC_CHANNELS: { TABS_UPDATED: 'tabs:updated' } };
      return require(m);
    },
    module: mod,
    exports: mod.exports,
    console,
    URL: globalThis.URL,
    encodeURIComponent: globalThis.encodeURIComponent
  });
  vm.runInContext(js, ctx);
  return { TabManager: mod.exports.TabManager, MockBrowserWindow, MockWebContentsView };
}

// =============================================================================
// CHALLENGER 2 VERIFICATION SUITES
// =============================================================================

describe('Milestone 2 Challenger 2: Omnibox, Navigation & Tab Lifecycle Adversarial Harness', () => {
  const { parseOmniboxInput } = loadOmniboxModule();
  const { TabManager, MockBrowserWindow } = loadTabManagerModule();

  // ===========================================================================
  // SUITE 1: Omnibox @ai and ? Trigger Detection Adversarial Stress
  // ===========================================================================
  describe('Suite 1: Omnibox @ai and ? Trigger Detection with Fuzzy Inputs', () => {
    it('CH2-1.1: Multiline text and leading/trailing whitespace variations', () => {
      // Standard multiline prompt
      const res1 = parseOmniboxInput('@ai line 1\nline 2\nline 3');
      assert.strictEqual(res1.type, 'ai');
      assert.strictEqual(res1.prompt, 'line 1\nline 2\nline 3');

      // Leading newlines before trigger
      const res2 = parseOmniboxInput('\n\n  @ai explain async/await');
      assert.strictEqual(res2.type, 'ai');
      assert.strictEqual(res2.prompt, 'explain async/await');

      // Prompt immediately on next line after trigger
      const res3 = parseOmniboxInput('@ai\nFirst line of query\nSecond line of query');
      assert.strictEqual(res3.type, 'ai');
      assert.strictEqual(res3.prompt, 'First line of query\nSecond line of query');

      // Tab separated multiline prompt
      const res4 = parseOmniboxInput('@ai\tcode snippet:\n\tconst x = 1;');
      assert.strictEqual(res4.type, 'ai');
      assert.strictEqual(res4.prompt, 'code snippet:\n\tconst x = 1;');

      // Single ? with newlines
      const res5 = parseOmniboxInput('?\nWhat is the capital of France?\nGive details');
      assert.strictEqual(res5.type, 'ai');
      assert.strictEqual(res5.prompt, 'What is the capital of France?\nGive details');

      // Multiple ??? with leading tabs and newlines
      const res6 = parseOmniboxInput('???\n\tHow does garbage collection work in V8?');
      assert.strictEqual(res6.type, 'ai');
      assert.strictEqual(res6.prompt, 'How does garbage collection work in V8?');
    });

    it('CH2-1.2: Special code characters, punctuation, quotes, and symbols', () => {
      const codeInputs = [
        {
          input: "@ai const fn = <T extends Record<string, any>>(x: T): void => { console.log(x); };",
          expectedPrompt: "const fn = <T extends Record<string, any>>(x: T): void => { console.log(x); };"
        },
        {
          input: "@ai SELECT id, email, created_at FROM users WHERE status = 'active' AND role IN ('admin', 'editor') ORDER BY id DESC;",
          expectedPrompt: "SELECT id, email, created_at FROM users WHERE status = 'active' AND role IN ('admin', 'editor') ORDER BY id DESC;"
        },
        {
          input: "@ai <div className=\"flex flex-col p-4 bg-zinc-900 border border-zinc-800\"><h1 id=\"title\">&lt;Hello&gt;</h1></div>",
          expectedPrompt: "<div className=\"flex flex-col p-4 bg-zinc-900 border border-zinc-800\"><h1 id=\"title\">&lt;Hello&gt;</h1></div>"
        },
        {
          input: "@ai curl -X POST https://api.openai.com/v1/chat -H 'Authorization: Bearer sk-xxx' -d '{\"model\":\"gpt-4\"}'",
          expectedPrompt: "curl -X POST https://api.openai.com/v1/chat -H 'Authorization: Bearer sk-xxx' -d '{\"model\":\"gpt-4\"}'"
        },
        {
          input: "? `Template literal with ${variable} and \n newlines`",
          expectedPrompt: "`Template literal with ${variable} and \n newlines`"
        },
        {
          input: "@ai !@#$%^&*()_+~|}{[]:;?><,./",
          expectedPrompt: "!@#$%^&*()_+~|}{[]:;?><,./"
        },
        {
          input: "? /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$/g",
          expectedPrompt: "/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$/g"
        }
      ];

      for (const { input, expectedPrompt } of codeInputs) {
        const res = parseOmniboxInput(input);
        assert.strictEqual(res.type, 'ai', `Expected type 'ai' for code input: ${input.slice(0, 40)}`);
        assert.strictEqual(res.prompt, expectedPrompt, `Prompt was mutated or corrupted for: ${input.slice(0, 40)}`);
      }
    });

    it('CH2-1.3: 4,000+ to 20,000 character mega prompts (stress & ReDoS resistance)', () => {
      // 4,000 character prompt
      const prompt4k = 'Summarize this article: ' + 'A'.repeat(4000);
      const start4k = performance.now();
      const res4k = parseOmniboxInput('@ai ' + prompt4k);
      const elapsed4k = performance.now() - start4k;

      assert.strictEqual(res4k.type, 'ai');
      assert.strictEqual(res4k.prompt, prompt4k);
      assert.ok(elapsed4k < 50, `4k prompt parsing took too long: ${elapsed4k}ms`);

      // 10,000 character prompt with repetitive question marks
      const prompt10k = '?'.repeat(500) + ' ' + 'B'.repeat(9500);
      const start10k = performance.now();
      const res10k = parseOmniboxInput(prompt10k);
      const elapsed10k = performance.now() - start10k;

      assert.strictEqual(res10k.type, 'ai');
      assert.strictEqual(res10k.prompt, 'B'.repeat(9500));
      assert.ok(elapsed10k < 50, `10k prompt parsing took too long: ${elapsed10k}ms`);

      // 20,000 character mixed code prompt
      const prompt20k = '@ai ' + 'while(true){console.log("stress");}\n'.repeat(500);
      const res20k = parseOmniboxInput(prompt20k);
      assert.strictEqual(res20k.type, 'ai');
      assert.ok(res20k.prompt?.startsWith('while(true)'));
    });

    it('CH2-1.4: Email addresses and non-trigger @ usages', () => {
      const emailCases = [
        'user@ai.com',
        'contact@ai.org',
        'admin@ai',
        'esraa@domain.com',
        'support@ai.co.uk',
        'test.user+tag@ai.internal',
        'mailto:user@ai.com'
      ];

      for (const email of emailCases) {
        const res = parseOmniboxInput(email);
        assert.strictEqual(res.type, 'navigation', `Email '${email}' should NOT trigger AI`);
        assert.strictEqual(res.url, email);
      }

      // Middle-of-query and end-of-query @ mentions
      const midQueryCases = [
        'send message to @ai please',
        'twitter.com/@ai',
        'github.com/@ai/repo',
        'what is @ai?',
        'ping 8.8.8.8 @ai'
      ];

      for (const query of midQueryCases) {
        const res = parseOmniboxInput(query);
        assert.strictEqual(res.type, 'navigation', `Query '${query}' should NOT trigger AI`);
      }
    });

    it('CH2-1.5: Incomplete and variant @ai prefixes', () => {
      // Incomplete prefixes
      assert.strictEqual(parseOmniboxInput('@').type, 'navigation');
      assert.strictEqual(parseOmniboxInput('@a').type, 'navigation');
      assert.strictEqual(parseOmniboxInput('@@').type, 'navigation');

      // Standalone @ai triggers with empty or whitespace-only prompt
      const empty1 = parseOmniboxInput('@ai');
      assert.strictEqual(empty1.type, 'ai');
      assert.strictEqual(empty1.prompt, '');

      const empty2 = parseOmniboxInput('@ai   ');
      assert.strictEqual(empty2.type, 'ai');
      assert.strictEqual(empty2.prompt, '');

      const empty3 = parseOmniboxInput('@ai\t\n  ');
      assert.strictEqual(empty3.type, 'ai');
      assert.strictEqual(empty3.prompt, '');

      // Question mark empty prompt triggers
      assert.strictEqual(parseOmniboxInput('?').type, 'ai');
      assert.strictEqual(parseOmniboxInput('?').prompt, '');
      assert.strictEqual(parseOmniboxInput('???').type, 'ai');
      assert.strictEqual(parseOmniboxInput('???').prompt, '');
      assert.strictEqual(parseOmniboxInput('?   ').type, 'ai');
      assert.strictEqual(parseOmniboxInput('?   ').prompt, '');

      // Prefixes that start with @ai but are part of a word or domain (NOT AI)
      const falseAiCases = [
        '@ai.com',
        '@airline',
        '@airport',
        '@aim',
        '@ai123',
        '@ai/docs',
        '@ai:8080',
        '@aip'
      ];

      for (const input of falseAiCases) {
        const res = parseOmniboxInput(input);
        assert.strictEqual(res.type, 'navigation', `Input '${input}' should be treated as navigation, not AI trigger`);
        assert.strictEqual(res.url, input);
      }
    });

    it('CH2-1.6: 500-case randomized generative fuzzing on parseOmniboxInput', () => {
      const vocab = ['@ai', '?', '???', 'user@ai.com', '@airline', 'https://', 'http://', 'search term', 'code()', '\n', '\t', ' '];
      for (let i = 0; i < 500; i++) {
        const parts = [];
        const numParts = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < numParts; j++) {
          parts.push(vocab[Math.floor(Math.random() * vocab.length)]);
        }
        const generated = parts.join('');
        const res = parseOmniboxInput(generated);

        assert.ok(res.type === 'ai' || res.type === 'navigation');
        if (res.type === 'ai') {
          assert.strictEqual(typeof res.prompt, 'string');
        } else {
          assert.strictEqual(typeof res.url, 'string');
        }
      }
    });
  });

  // ===========================================================================
  // SUITE 2: URL Resolution Adversarial Oracle
  // ===========================================================================
  describe('Suite 2: URL Resolution with Complex Query Params, Anchors, Non-ASCII Domains & Ports', () => {
    const win = new MockBrowserWindow();
    const tm = new TabManager(win);

    it('CH2-2.1: Complex query parameters with encoded chars and nested structures', () => {
      const queryCases = [
        {
          input: 'https://example.com/search?q=c%2B%2B%20programming&lang=en#results',
          expected: 'https://example.com/search?q=c%2B%2B%20programming&lang=en#results'
        },
        {
          input: 'https://api.github.com/v3/repos?sort=created&direction=asc&page=1&per_page=100',
          expected: 'https://api.github.com/v3/repos?sort=created&direction=asc&page=1&per_page=100'
        },
        {
          input: 'github.com/search?q=repo%3Afacebook%2Freact+is%3Aissue&type=issues',
          expected: 'https://github.com/search?q=repo%3Afacebook%2Freact+is%3Aissue&type=issues'
        },
        {
          input: 'dashboard.io/app/settings?filters[status]=active&filters[tags]=a,b,c&sort=-date',
          expected: 'https://dashboard.io/app/settings?filters[status]=active&filters[tags]=a,b,c&sort=-date'
        },
        {
          input: 'auth.corp.com/oauth/authorize?response_type=code&client_id=123&redirect_uri=https%3A%2F%2Fapp.corp.com%2Fcallback&scope=openid%20profile',
          expected: 'https://auth.corp.com/oauth/authorize?response_type=code&client_id=123&redirect_uri=https%3A%2F%2Fapp.corp.com%2Fcallback&scope=openid%20profile'
        }
      ];

      for (const { input, expected } of queryCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed resolving complex query: '${input}' -> got '${resolved}'`);
      }
    });

    it('CH2-2.2: Anchors, deep paths, and hash fragments', () => {
      const anchorCases = [
        {
          input: 'https://docs.rs/tokio/latest/tokio/#modules',
          expected: 'https://docs.rs/tokio/latest/tokio/#modules'
        },
        {
          input: 'example.com/#overview',
          expected: 'https://example.com/#overview'
        },
        {
          input: 'wiki.archlinux.org/title/Installation_guide#Network_configuration',
          expected: 'https://wiki.archlinux.org/title/Installation_guide#Network_configuration'
        },
        {
          input: 'react.dev/learn/state-a-components-memory#meet-your-first-hook',
          expected: 'https://react.dev/learn/state-a-components-memory#meet-your-first-hook'
        },
        {
          input: 'https://developer.mozilla.org/en-US/docs/Web/API/WebContentsView#specifications',
          expected: 'https://developer.mozilla.org/en-US/docs/Web/API/WebContentsView#specifications'
        }
      ];

      for (const { input, expected } of anchorCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Failed resolving anchor: '${input}' -> got '${resolved}'`);
      }
    });

    it('CH2-2.3: Ports: standard, localhost, intranet, boundary, and explicit protocols', () => {
      const portCases = [
        { input: 'localhost:3000', expected: 'http://localhost:3000' },
        { input: 'localhost:8080/dashboard?user=admin#settings', expected: 'http://localhost:8080/dashboard?user=admin#settings' },
        { input: '127.0.0.1:5173', expected: 'http://127.0.0.1:5173' },
        { input: '192.168.1.100:8000/api/v1', expected: 'http://192.168.1.100:8000/api/v1' },
        { input: 'corp-server:9090', expected: 'http://corp-server:9090' },
        { input: 'dev-cluster-node:443/status', expected: 'http://dev-cluster-node:443/status' },
        { input: 'example.com:8080', expected: 'https://example.com:8080' },
        { input: 'sub.domain.org:8443/path?query=val#hash', expected: 'https://sub.domain.org:8443/path?query=val#hash' },
        { input: 'http://localhost:65535', expected: 'http://localhost:65535' },
        { input: 'https://secure.internal:9443/login', expected: 'https://secure.internal:9443/login' },
        { input: 'ws://127.0.0.1:8080/ws', expected: 'ws://127.0.0.1:8080/ws' }
      ];

      for (const { input, expected } of portCases) {
        const resolved = tm.resolveNavigationUrl(input);
        assert.strictEqual(resolved, expected, `Port resolution failed for '${input}'`);
      }
    });

    it('CH2-2.4: Non-ASCII domains (Punycode & explicit unicode protocols)', () => {
      // Punycode domains with standard ASCII TLD (valid RFC 3492 DNS labels matching standard domain regex)
      assert.strictEqual(tm.resolveNavigationUrl('xn--mnchen-3ya.de'), 'https://xn--mnchen-3ya.de');
      assert.strictEqual(tm.resolveNavigationUrl('xn--n3h.net/icon.png'), 'https://xn--n3h.net/icon.png');

      // Punycode domain with explicit scheme works for all TLDs
      assert.strictEqual(tm.resolveNavigationUrl('https://xn--fsqu00a.xn--0zwm56d'), 'https://xn--fsqu00a.xn--0zwm56d');

      // FINDING/BOUNDARY: Bare Punycode with Punycode TLD (e.g. xn--0zwm56d) falls back to search because standardDomainPattern requires ASCII alphabetical TLD [a-zA-Z]{2,}
      const punycodeTld = tm.resolveNavigationUrl('xn--fsqu00a.xn--0zwm56d');
      assert.strictEqual(punycodeTld, 'https://www.google.com/search?q=xn--fsqu00a.xn--0zwm56d');

      // Explicit protocol with internationalized domain
      assert.strictEqual(tm.resolveNavigationUrl('https://münchen.de'), 'https://münchen.de');
      assert.strictEqual(tm.resolveNavigationUrl('http://café.fr/menu'), 'http://café.fr/menu');
      assert.strictEqual(tm.resolveNavigationUrl('https://españa.es/cultura'), 'https://españa.es/cultura');

      // Bare unicode domains without scheme: fall back to search safely
      const bareUnicode = tm.resolveNavigationUrl('münchen.de');
      assert.ok(bareUnicode?.startsWith('https://www.google.com/search?q='), 'Bare non-ASCII domain should fall back to search safely');
    });

    it('CH2-2.5: Edge cases, scheme preservation, and query fallback', () => {
      // Protocols
      assert.strictEqual(tm.resolveNavigationUrl('file:///C:/Users/file.txt'), 'file:///C:/Users/file.txt');
      assert.strictEqual(tm.resolveNavigationUrl('about:blank'), 'about:blank');
      assert.strictEqual(tm.resolveNavigationUrl('about:gpu'), 'about:gpu');

      // Empty / invalid
      assert.strictEqual(tm.resolveNavigationUrl(''), null);
      assert.strictEqual(tm.resolveNavigationUrl('   '), null);
      assert.strictEqual(tm.resolveNavigationUrl(null), null);
      assert.strictEqual(tm.resolveNavigationUrl(undefined), null);

      // Search fallbacks
      assert.strictEqual(tm.resolveNavigationUrl('what is electron?'), 'https://www.google.com/search?q=what%20is%20electron%3F');
      assert.strictEqual(tm.resolveNavigationUrl('multi word search with special & characters'), 'https://www.google.com/search?q=multi%20word%20search%20with%20special%20%26%20characters');
    });
  });

  // ===========================================================================
  // SUITE 3: Background Tab Creation & Active Tab Non-Displacement Invariant
  // ===========================================================================
  describe('Suite 3: Background Tab Creation ({ active: false }) & Non-Displacement Invariant', () => {
    it('CH2-3.1: Creating background tab does not displace active tab or view hierarchy', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      // Create active tab 1
      const tab1 = tm.createTab('https://github.com/electron/electron', { active: true });
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(win.contentView.children.length, 1);
      const tab1View = tm.getTab(tab1.id).view;
      assert.strictEqual(win.contentView.children[0], tab1View);

      // Create background tab 2
      const tab2 = tm.createTab('https://news.ycombinator.com', { active: false });
      
      // INVARIANT CHECKS:
      // 1. Active tab ID must not have changed
      assert.strictEqual(tm.getActiveTabId(), tab1.id, 'Active tab ID must remain tab1');
      assert.strictEqual(tm.getActiveTab()?.id, tab1.id, 'getActiveTab must return tab1');

      // 2. Window child views must NOT attach the background tab
      assert.strictEqual(win.contentView.children.length, 1, 'Only active tab view should be in BaseWindow');
      assert.strictEqual(win.contentView.children[0], tab1View, 'Attached child view must remain tab1View');

      // 3. Tab registry must contain both tabs
      assert.strictEqual(tm.getAllTabs().length, 2);
      const tab2Item = tm.getTab(tab2.id);
      assert.ok(tab2Item, 'Background tab must be registered');
      assert.strictEqual(tab2Item.state.url, 'https://news.ycombinator.com');
      assert.strictEqual(tab2Item.state.title, 'news.ycombinator.com');
      assert.strictEqual(tab2Item.state.faviconUrl, 'https://news.ycombinator.com/favicon.ico');

      // 4. Last broadcast IPC must report activeId = tab1.id
      const lastBroadcast = win.broadcastHistory[win.broadcastHistory.length - 1];
      assert.strictEqual(lastBroadcast.activeId, tab1.id);
      assert.strictEqual(lastBroadcast.tabs.length, 2);
    });

    it('CH2-3.2: Background tab loading and navigation events do not steal focus or displace active tab', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab1 = tm.createTab('https://example.org', { active: true });
      const tab2 = tm.createTab('https://duckduckgo.com', { active: false });
      const tab2Item = tm.getTab(tab2.id);
      const tab2Wc = tab2Item.view.webContents;

      // Simulate background tab lifecycle events
      tab2Wc.emit('did-start-loading');
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(tab2Item.state.isLoading, true);

      tab2Wc.emit('page-title-updated', {}, 'DuckDuckGo — Privacy, simplified.');
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(tab2Item.state.title, 'DuckDuckGo — Privacy, simplified.');

      tab2Wc.emit('page-favicon-updated', {}, ['https://duckduckgo.com/favicon.ico']);
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(tab2Item.state.faviconUrl, 'https://duckduckgo.com/favicon.ico');

      tab2Wc.emit('did-navigate', {}, 'https://duckduckgo.com/?q=privacy');
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(tab2Item.state.url, 'https://duckduckgo.com/?q=privacy');

      tab2Wc.emit('did-stop-loading');
      assert.strictEqual(tm.getActiveTabId(), tab1.id);
      assert.strictEqual(tab2Item.state.isLoading, false);

      // Verify BaseWindow still only has tab1's view
      assert.strictEqual(win.contentView.children.length, 1);
      assert.strictEqual(win.contentView.children[0], tm.getTab(tab1.id).view);
    });

    it('CH2-3.3: window.open with disposition === background-tab creates background tab', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab1 = tm.createTab('https://reddit.com', { active: true });
      const tab1Wc = tm.getTab(tab1.id).view.webContents;

      assert.ok(typeof tab1Wc.windowOpenHandler === 'function', 'setWindowOpenHandler must be set');

      // Trigger window.open with disposition 'background-tab'
      const openResult = tab1Wc.windowOpenHandler({
        url: 'https://reddit.com/r/programming',
        disposition: 'background-tab'
      });

      assert.strictEqual(openResult?.action, 'deny');
      assert.strictEqual(tm.getAllTabs().length, 2);
      assert.strictEqual(tm.getActiveTabId(), tab1.id, 'window.open background-tab must not displace active tab');
      assert.strictEqual(win.contentView.children.length, 1);

      // Trigger window.open with foreground disposition 'new-window' or 'foreground-tab'
      const fgResult = tab1Wc.windowOpenHandler({
        url: 'https://reddit.com/r/technology',
        disposition: 'foreground-tab'
      });

      assert.strictEqual(fgResult?.action, 'deny');
      assert.strictEqual(tm.getAllTabs().length, 3);
      assert.notStrictEqual(tm.getActiveTabId(), tab1.id, 'foreground-tab disposition should switch active tab');
      assert.strictEqual(win.contentView.children.length, 1);
    });

    it('CH2-3.4: Rapid burst creation of 25 background tabs concurrently', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const activeTab = tm.createTab('https://active-session.com', { active: true });
      const activeId = activeTab.id;

      const bgTabs = [];
      for (let i = 0; i < 25; i++) {
        const bg = tm.createTab(`https://background-page-${i}.com`, { active: false });
        bgTabs.push(bg);
        assert.strictEqual(tm.getActiveTabId(), activeId, `Active tab displaced at iteration ${i}`);
        assert.strictEqual(win.contentView.children.length, 1, `Child view count corrupted at iteration ${i}`);
      }

      assert.strictEqual(tm.getAllTabs().length, 26);
      assert.strictEqual(tm.getActiveTabId(), activeId);
      assert.strictEqual(win.contentView.children[0], tm.getTab(activeId).view);

      // Verify we can switch to the 15th background tab cleanly
      const targetBg = bgTabs[14];
      const switched = tm.switchTab(targetBg.id);
      assert.strictEqual(switched, true);
      assert.strictEqual(tm.getActiveTabId(), targetBg.id);
      assert.strictEqual(win.contentView.children.length, 1);
      assert.strictEqual(win.contentView.children[0], tm.getTab(targetBg.id).view);
    });
  });

  // ===========================================================================
  // SUITE 4: Audio Muting & Unmuting State Verification
  // ===========================================================================
  describe('Suite 4: Audio Muting and Unmuting State Verification', () => {
    it('CH2-4.1: Initial audio muting state is false for newly created tabs', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab1 = tm.createTab('https://youtube.com', { active: true });
      assert.strictEqual(tab1.isMuted, false);

      const tab2 = tm.createTab('https://spotify.com', { active: false });
      assert.strictEqual(tab2.isMuted, false);

      const item1 = tm.getTab(tab1.id);
      const item2 = tm.getTab(tab2.id);
      assert.strictEqual(item1.view.webContents.isAudioMuted(), false);
      assert.strictEqual(item2.view.webContents.isAudioMuted(), false);
    });

    it('CH2-4.2: Toggling mute state updates TabState, native WebContents, and broadcasts', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab = tm.createTab('https://soundcloud.com', { active: true });
      const item = tm.getTab(tab.id);

      // Mute the tab
      const muteResult = tm.setTabMuted(tab.id, true);
      assert.strictEqual(muteResult, true);
      assert.strictEqual(item.state.isMuted, true);
      assert.strictEqual(item.view.webContents.isAudioMuted(), true);

      // Verify broadcast
      const muteBroadcast = win.broadcastHistory[win.broadcastHistory.length - 1];
      const broadcastTabState = muteBroadcast.tabs.find((t) => t.id === tab.id);
      assert.strictEqual(broadcastTabState.isMuted, true);

      // Unmute the tab
      const unmuteResult = tm.setTabMuted(tab.id, false);
      assert.strictEqual(unmuteResult, true);
      assert.strictEqual(item.state.isMuted, false);
      assert.strictEqual(item.view.webContents.isAudioMuted(), false);

      // Verify unmute broadcast
      const unmuteBroadcast = win.broadcastHistory[win.broadcastHistory.length - 1];
      const broadcastUnmutedTab = unmuteBroadcast.tabs.find((t) => t.id === tab.id);
      assert.strictEqual(broadcastUnmutedTab.isMuted, false);
    });

    it('CH2-4.3: Audio mute state persists across tab switches and background updates', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tabA = tm.createTab('https://music.youtube.com', { active: true });
      const tabB = tm.createTab('https://podcasts.google.com', { active: false });

      // Mute tab A only
      tm.setTabMuted(tabA.id, true);
      assert.strictEqual(tm.getTab(tabA.id).state.isMuted, true);
      assert.strictEqual(tm.getTab(tabB.id).state.isMuted, false);

      // Switch to tab B
      tm.switchTab(tabB.id);
      assert.strictEqual(tm.getActiveTabId(), tabB.id);
      assert.strictEqual(tm.getTab(tabB.id).state.isMuted, false);

      // Switch back to tab A
      tm.switchTab(tabA.id);
      assert.strictEqual(tm.getActiveTabId(), tabA.id);
      assert.strictEqual(tm.getTab(tabA.id).state.isMuted, true, 'Tab A must retain muted state after switching back');
      assert.strictEqual(tm.getTab(tabA.id).view.webContents.isAudioMuted(), true);

      // Mute tab B while in background
      tm.setTabMuted(tabB.id, true);
      assert.strictEqual(tm.getTab(tabB.id).state.isMuted, true);
      assert.strictEqual(tm.getTab(tabB.id).view.webContents.isAudioMuted(), true);

      // Unmute tab A while active
      tm.setTabMuted(tabA.id, false);
      assert.strictEqual(tm.getTab(tabA.id).state.isMuted, false);

      // Switch to tab B: tab B must still be muted
      tm.switchTab(tabB.id);
      assert.strictEqual(tm.getTab(tabB.id).state.isMuted, true);
    });

    it('CH2-4.4: 100-cycle rapid mute/unmute stress test', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab = tm.createTab('https://rapid-audio-test.com', { active: true });
      const item = tm.getTab(tab.id);

      for (let i = 0; i < 100; i++) {
        const targetMute = i % 2 === 0;
        const res = tm.setTabMuted(tab.id, targetMute);
        assert.strictEqual(res, true);
        assert.strictEqual(item.state.isMuted, targetMute);
        assert.strictEqual(item.view.webContents.isAudioMuted(), targetMute);
      }
    });

    it('CH2-4.5: Boundary and error handling for setTabMuted', () => {
      const win = new MockBrowserWindow();
      const tm = new TabManager(win);

      const tab = tm.createTab('https://error-test.com', { active: true });

      // Non-existent IDs
      assert.strictEqual(tm.setTabMuted('00000000-0000-0000-0000-000000000000', true), false);
      assert.strictEqual(tm.setTabMuted('', true), false);
      assert.strictEqual(tm.setTabMuted(null, true), false);
      assert.strictEqual(tm.setTabMuted(undefined, true), false);

      // Destroyed webContents
      const item = tm.getTab(tab.id);
      item.view.webContents.close();
      assert.strictEqual(item.view.webContents.isDestroyed(), true);
      assert.strictEqual(tm.setTabMuted(tab.id, true), false, 'Should return false when webContents is destroyed');
    });
  });
});
