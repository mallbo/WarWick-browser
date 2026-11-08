import { describe, it } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { WarwickBrowserDriver } from '../e2e/harness/browserDriver.js';

// =============================================================================
// Transpile and load production `src/main/backgroundResearcher.ts`
// =============================================================================

function createMockResearcherEnvironment(options = {}) {
  const filePath = path.resolve(process.cwd(), 'src/main/backgroundResearcher.ts');
  const src = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesPath = path.resolve(process.cwd(), 'src/shared/types.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  const typesJs = ts.transpileModule(typesSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  vm.runInNewContext(typesJs, { module: typesMod, exports: typesMod.exports });

  const extractorPath = path.resolve(process.cwd(), 'src/main/pageContextExtractor.ts');
  const extractorSrc = fs.readFileSync(extractorPath, 'utf8');
  const extractorJs = ts.transpileModule(extractorSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const extractorMod = { exports: {} };
  vm.runInNewContext(extractorJs, {
    module: extractorMod,
    exports: extractorMod.exports,
    require: () => typesMod.exports
  });

  // Track all created mock WebContents
  const createdWebContents = [];

  class MockWebContents extends EventEmitter {
    constructor(opts = {}) {
      super();
      this._destroyed = Boolean(opts.destroyed);
      this._audioMuted = false;
      this._windowOpenHandler = null;
      this._loadDelay = opts.loadDelay ?? 0;
      this._loadFails = Boolean(opts.loadFails);
      this._domDelay = opts.domDelay ?? 0;
      this._domThrows = Boolean(opts.domThrows);
      this._domResult = opts.domResult ?? {
        title: 'Mock Harvested Page',
        metaDescription: 'Mock Meta Description',
        text: 'Harvested article body text with key empirical research findings.'
      };
      createdWebContents.push(this);
    }

    isDestroyed() {
      return this._destroyed;
    }

    isAudioMuted() {
      return this._audioMuted;
    }

    setAudioMuted(muted) {
      this._audioMuted = Boolean(muted);
    }

    setWindowOpenHandler(fn) {
      this._windowOpenHandler = fn;
    }

    async loadURL(url) {
      if (this._destroyed) throw new Error('WebContents is destroyed');
      if (this._loadFails) {
        setTimeout(() => {
          if (!this._destroyed) {
            this.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', url, true);
          }
        }, this._loadDelay);
        return;
      }
      setTimeout(() => {
        if (!this._destroyed) {
          this.emit('did-finish-load');
        }
      }, this._loadDelay);
    }

    stop() {
      this.emit('stopped');
    }

    close() {
      this._destroyed = true;
      this.emit('destroyed');
    }

    async executeJavaScript(_script, _userGesture) {
      if (this._destroyed) throw new Error('WebContents destroyed during script execution');
      if (this._domThrows) throw new Error('DOM execution failed');
      if (this._domDelay > 0) {
        await new Promise((r) => setTimeout(r, this._domDelay));
      }
      if (this._destroyed) throw new Error('WebContents destroyed during script execution');
      return this._domResult;
    }
  }

  class MockWebContentsView {
    constructor(opts = {}) {
      this.webPreferences = opts.webPreferences;
      if (options.nullWebContentsOnCreate) {
        this.webContents = null;
      } else {
        this.webContents = new MockWebContents(options.wcOptions || {});
      }
    }
  }

  let permissionCallbackResult = null;
  const mockSession = {
    setPermissionRequestHandler: (cb) => {
      // Test handler immediately with a dummy permission
      cb({}, 'media', (granted) => {
        permissionCallbackResult = granted;
      });
    },
    setPermissionCheckHandler: (cb) => {
      this._checkHandler = cb;
    }
  };

  const recordedActions = [];
  const recordedChunks = [];

  class MockBrowserWindow {
    constructor() {
      this._destroyed = false;
      this.webContents = {
        send: (channel, data) => {
          if (channel === typesMod.exports.IPC_CHANNELS.AGENT_ACTION_EVENT) {
            recordedActions.push(data);
          } else if (channel === typesMod.exports.IPC_CHANNELS.AGENT_STREAM_CHUNK) {
            recordedChunks.push(data);
          }
        }
      };
    }
    isDestroyed() {
      return this._destroyed;
    }
  }

  const mod = { exports: {} };
  const ctx = vm.createContext({
    require: (m) => {
      if (m.includes('shared/types')) return typesMod.exports;
      if (m.includes('pageContextExtractor')) return extractorMod.exports;
      if (m === 'electron') {
        return {
          BrowserWindow: MockBrowserWindow,
          WebContentsView: MockWebContentsView,
          session: {
            fromPartition: () => mockSession
          }
        };
      }
      if (m === 'node:crypto' || m === 'crypto') return crypto;
      return {};
    },
    module: mod,
    exports: mod.exports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Buffer,
    Math,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    String,
    AbortController,
    fetch,
    Headers,
    Request,
    Response
  });

  vm.runInContext(js, ctx);

  return {
    exports: mod.exports,
    types: typesMod.exports,
    recordedActions,
    recordedChunks,
    createdWebContents,
    mockSession,
    permissionCallbackResult: () => permissionCallbackResult,
    MockWebContents,
    MockWebContentsView,
    MockBrowserWindow
  };
}

describe('Milestone 4 Empirical Verification: Challenger 1 Stress Harness', () => {

  // ===========================================================================
  // 1. Concurrency Stress on BackgroundTabPool (Strict 5 Tab Ceilings)
  // ===========================================================================
  describe('1. Concurrency Stress (Strict Clamp to 5 & Reject Overflow with /limit/)', () => {

    it('1.1: Rapid Promise.allSettled on 10 simultaneous allocations clamps strictly to 5 fulfilled and 5 rejected with /limit/', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      assert.strictEqual(pool.size, 0);

      // Fire 10 simultaneous allocations
      const attempts = Array.from({ length: 10 }, (_, i) =>
        pool.openBackgroundResearchTab(`https://concurrent-target-${i}.org`)
      );

      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 5, 'Exactly 5 tabs must be allocated');
      assert.strictEqual(rejected.length, 5, 'Exactly 5 tabs must be rejected');
      assert.strictEqual(pool.size, 5, 'Pool size must strictly equal 5');

      // Verify all rejected errors match /limit/
      for (const rej of rejected) {
        assert.ok(rej.reason, 'Rejection reason must be present');
        assert.match(String(rej.reason?.message || rej.reason), /limit/i, 'Error message must match /limit/');
      }

      // Verify attempting an 11th allocation also rejects immediately
      await assert.rejects(
        async () => pool.openBackgroundResearchTab('https://eleventh-attempt.org'),
        /limit/i
      );

      pool.destroyAll();
      assert.strictEqual(pool.size, 0);
    });

    it('1.2: Freeing 2 tabs allows exactly 2 new concurrent allocations out of 5 attempts', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      // Fill initial 5 tabs
      const initialTabs = [];
      for (let i = 0; i < 5; i++) {
        initialTabs.push(await pool.openBackgroundResearchTab(`https://initial-${i}.com`));
      }
      assert.strictEqual(pool.size, 5);

      // Close 2 tabs
      const closed1 = pool.closeBackgroundResearchTab(initialTabs[0].id);
      const closed2 = pool.closeBackgroundResearchTab(initialTabs[1].id);
      assert.strictEqual(closed1, true);
      assert.strictEqual(closed2, true);
      assert.strictEqual(pool.size, 3);

      // Attempt 5 new allocations concurrently
      const refillAttempts = Array.from({ length: 5 }, (_, i) =>
        pool.openBackgroundResearchTab(`https://refill-${i}.org`)
      );
      const refillResults = await Promise.allSettled(refillAttempts);

      const refillFulfilled = refillResults.filter((r) => r.status === 'fulfilled');
      const refillRejected = refillResults.filter((r) => r.status === 'rejected');

      assert.strictEqual(refillFulfilled.length, 2, 'Only 2 available slots can be filled');
      assert.strictEqual(refillRejected.length, 3, 'Remaining 3 must be rejected');
      assert.strictEqual(pool.size, 5, 'Pool size must return to exactly 5');

      for (const rej of refillRejected) {
        assert.match(rej.reason.message, /limit/i);
      }

      pool.destroyAll();
    });

    it('1.3: Concurrency on WarwickBrowserDriver: 10 rapid concurrent allocations clamp to 5 and reject with /limit/', async () => {
      const driver = new WarwickBrowserDriver();
      await driver.launch();

      const attempts = Array.from({ length: 10 }, (_, i) =>
        driver.openBackgroundResearchTab(`https://driver-concurrent-${i}.org`)
      );

      const results = await Promise.allSettled(attempts);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 5);
      assert.strictEqual(rejected.length, 5);
      assert.strictEqual(driver.backgroundTabs.size, 5);

      for (const rej of rejected) {
        assert.match(rej.reason.message, /limit/i);
      }

      await driver.close();
    });
  });

  // ===========================================================================
  // 2. Audio Muting Immature Tamper Resistance
  // ===========================================================================
  describe('2. Audio Muting Immature Tamper Resistance', () => {

    it('2.1: State object property tamper: setting isMuted=false or falsy values has no effect (remains true)', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const tab = await pool.openBackgroundResearchTab('https://media-stream.org');
      assert.strictEqual(tab.isMuted, true);

      // Attempt mutating isMuted directly
      tab.isMuted = false;
      assert.strictEqual(tab.isMuted, true, 'isMuted must remain true after setting false');

      tab.isMuted = 0;
      assert.strictEqual(tab.isMuted, true, 'isMuted must remain true after setting 0');

      tab.isMuted = null;
      assert.strictEqual(tab.isMuted, true, 'isMuted must remain true after setting null');

      tab.isMuted = undefined;
      assert.strictEqual(tab.isMuted, true, 'isMuted must remain true after setting undefined');

      pool.destroyAll();
    });

    it('2.2: Event-level tamper: emitting audio-state-changed while unmuted forces immediate re-muting', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const tab = await pool.openBackgroundResearchTab('https://loud-audio.com');
      const entry = pool.getBackgroundTab(tab.id);
      assert.ok(entry);
      assert.strictEqual(entry.view.webContents.isAudioMuted(), true);

      // Malicious or uncooperative page/extension sets audio muted to false
      entry.view.webContents._audioMuted = false;
      assert.strictEqual(entry.view.webContents.isAudioMuted(), false);

      // Page emits audio-state-changed
      entry.view.webContents.emit('audio-state-changed');

      // Pool audio listener must have automatically re-asserted setAudioMuted(true)
      assert.strictEqual(entry.view.webContents.isAudioMuted(), true, 'Must re-mute on audio-state-changed');

      pool.destroyAll();
    });

    it('2.3: Session permissions and window open handlers are locked down on all background tabs', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const tab = await pool.openBackgroundResearchTab('https://popup-test.com');
      const entry = pool.getBackgroundTab(tab.id);

      // Verify window open handler denies popups
      assert.ok(entry.view.webContents._windowOpenHandler);
      const openResult = entry.view.webContents._windowOpenHandler({ url: 'https://evil-popup.com' });
      assert.strictEqual(openResult?.action, 'deny');

      // Verify permission request was automatically denied
      assert.strictEqual(env.permissionCallbackResult(), false, 'Permissions must be automatically denied');

      pool.destroyAll();
    });
  });

  // ===========================================================================
  // 3. Detached Lifecycle & Exception Resilience
  // ===========================================================================
  describe('3. Detached Lifecycle & Exception Resilience', () => {

    it('3.1: Closing tab while waitForPageLoad is in progress resolves cleanly without unhandled rejection', async () => {
      const env = createMockResearcherEnvironment({ wcOptions: { loadDelay: 500 } });
      const { waitForPageLoad } = env.exports;
      const wc = new env.MockWebContents({ loadDelay: 500 });

      const loadPromise = waitForPageLoad(wc, 1000);

      // Destroy WebContents mid-flight
      setTimeout(() => {
        wc.close();
      }, 50);

      const result = await loadPromise;
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('3.2: Closing tab while safeExecuteDomExtraction is in progress returns null safely', async () => {
      const env = createMockResearcherEnvironment();
      const { safeExecuteDomExtraction } = env.exports;
      const wc = new env.MockWebContents({ domDelay: 500 });

      const domPromise = safeExecuteDomExtraction(wc, 100);

      setTimeout(() => {
        wc.close();
      }, 30);

      const result = await domPromise;
      assert.strictEqual(result, null, 'Safe DOM extraction must return null on interruption/error');
    });

    it('3.3: Closing tab when entry.view.webContents is undefined or destroyed causes zero TypeError', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const tab = await pool.openBackgroundResearchTab('https://null-wc-target.com');
      const entry = pool.getBackgroundTab(tab.id);
      assert.ok(entry);

      // Simulate Electron v34 tearing down native webContents handle
      entry.view.webContents = undefined;

      // Must not throw TypeError: Cannot read properties of undefined (reading 'isDestroyed')
      assert.doesNotThrow(() => {
        const closed = pool.closeBackgroundResearchTab(tab.id);
        assert.strictEqual(closed, true);
      });
      assert.strictEqual(pool.size, 0);

      pool.destroyAll();
    });

    it('3.4: Idempotent teardown: double close on same tab returns true then false with zero leaks', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const tab = await pool.openBackgroundResearchTab('https://double-close.com');
      assert.strictEqual(pool.size, 1);

      const firstClose = pool.closeBackgroundResearchTab(tab.id);
      assert.strictEqual(firstClose, true);
      assert.strictEqual(pool.size, 0);

      const secondClose = pool.closeBackgroundResearchTab(tab.id);
      assert.strictEqual(secondClose, false);
      assert.strictEqual(pool.size, 0);

      pool.destroyAll();
    });

    it('3.5: destroyAll() cleans up heterogeneous pool (loading, destroyed, and missing webContents)', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundTabPool } = env.exports;
      const pool = new BackgroundTabPool();

      const t1 = await pool.openBackgroundResearchTab('https://normal.com');
      const t2 = await pool.openBackgroundResearchTab('https://already-destroyed.com');
      const t3 = await pool.openBackgroundResearchTab('https://null-wc.com');

      // T2 webContents closed
      pool.getBackgroundTab(t2.id).view.webContents.close();
      // T3 webContents nullified
      pool.getBackgroundTab(t3.id).view.webContents = null;

      assert.doesNotThrow(() => {
        pool.destroyAll();
      });
      assert.strictEqual(pool.size, 0);
    });
  });

  // ===========================================================================
  // 4. Rapid Cancellation Across Pipeline Stages
  // ===========================================================================
  describe('4. Rapid Cancellation Across Pipeline Stages', () => {

    it('4.1: Cancellation during planning stage: immediately cleans pool, emits error action, leaks no chunks', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      const { runId } = await researcher.researchQuery('Quantum Machine Learning');
      assert.ok(runId.startsWith('res-'));

      // Cancel immediately during planning stage
      const cancelled = await researcher.cancel();
      assert.strictEqual(cancelled, true);

      // Verify run status
      const record = researcher.researchRuns.get(runId);
      assert.strictEqual(record.status, 'cancelled');

      // Verify pool is completely empty
      assert.strictEqual(researcher.pool.size, 0);

      // Verify error action was emitted
      const errorActions = env.recordedActions.filter((a) => a.stage === 'error');
      assert.strictEqual(errorActions.length, 1);
      assert.strictEqual(errorActions[0].message, 'User cancelled agent execution.');

      // Wait 150ms to verify zero synthesis chunks or completion actions leak
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(env.recordedChunks.length, 0, 'No stream chunks should leak after cancellation');

      const lateActions = env.recordedActions.filter((a) => a.stage === 'complete' || a.stage === 'synthesizing');
      assert.strictEqual(lateActions.length, 0, 'No synthesis or complete actions should leak after cancellation');

      await researcher.destroy();
    });

    it('4.2: Cancellation during reading/harvesting stage: terminates background views immediately', async () => {
      const env = createMockResearcherEnvironment({ wcOptions: { loadDelay: 200 } });
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      const { runId } = await researcher.researchQuery('Deep Research Pipeline');

      // Wait until reading stage starts
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          const readingAction = env.recordedActions.find((a) => a.stage === 'reading');
          if (readingAction) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      // Now cancel while reading
      const cancelled = await researcher.cancel();
      assert.strictEqual(cancelled, true);
      assert.strictEqual(researcher.pool.size, 0, 'Background pool views must be destroyed immediately');

      // Wait 100ms
      await new Promise((r) => setTimeout(r, 100));
      const record = researcher.researchRuns.get(runId);
      assert.strictEqual(record.status, 'cancelled');

      await researcher.destroy();
    });

    it('4.3: Redundant cancel calls when no active run return false safely without throwing', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      // No active run
      const res1 = await researcher.cancel();
      assert.strictEqual(res1, false);

      const res2 = await researcher.cancel();
      assert.strictEqual(res2, false);

      await researcher.destroy();
    });
  });

  // ===========================================================================
  // 5. Query Boundary Stress & Parsing
  // ===========================================================================
  describe('5. Query Boundary Stress & Parsing', () => {

    it('5.1: Single-word query ("Strawberry") executes through all stages to complete synthesis', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      const { runId } = await researcher.researchQuery('Strawberry');
      assert.ok(runId.startsWith('res-'));

      // Wait for execution completion
      await new Promise((resolve) => {
        const check = setInterval(() => {
          const done = env.recordedActions.find((a) => a.runId === runId && a.stage === 'complete');
          if (done) {
            clearInterval(check);
            resolve();
          }
        }, 15);
      });

      assert.ok(env.recordedChunks.length > 0);
      const combinedSynthesis = env.recordedChunks.join('');
      assert.ok(combinedSynthesis.includes('### Research Synthesis: Strawberry'));
      assert.ok(combinedSynthesis.includes('*Sources Cited*:'));

      await researcher.destroy();
    });

    it('5.2: 300+ character query completes successfully without clipping title or unhandled rejections', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      const longQuery = 'Explain in comprehensive technical depth the architectural advantages of offscreen WebContentsView isolation in Electron desktop applications for autonomous background research agents '.repeat(2);
      assert.ok(longQuery.length > 300);

      const { runId } = await researcher.researchQuery(longQuery);

      await new Promise((resolve) => {
        const check = setInterval(() => {
          const done = env.recordedActions.find((a) => a.runId === runId && a.stage === 'complete');
          if (done) {
            clearInterval(check);
            resolve();
          }
        }, 15);
      });

      const record = researcher.researchRuns.get(runId);
      assert.strictEqual(record.status, 'complete');

      await researcher.destroy();
    });

    it('5.3: Special characters ("Strawberry" vs "Arc", quotes, XML brackets, Unicode emojis)', async () => {
      const env = createMockResearcherEnvironment();
      const { BackgroundResearcher } = env.exports;
      const win = new env.MockBrowserWindow();
      const researcher = new BackgroundResearcher(win, null, {
        geminiApiKey: '',
        defaultSearchEngine: 'duckduckgo',
        sidebarCollapsed: false,
        aiPanelWidth: 360,
        mcpServers: []
      });

      const complexQuery = '"Strawberry" vs "Arc" & <script>alert("xss")</script> 🍓🚀';
      const { runId } = await researcher.researchQuery(complexQuery);

      await new Promise((resolve) => {
        const check = setInterval(() => {
          const done = env.recordedActions.find((a) => a.runId === runId && a.stage === 'complete');
          if (done) {
            clearInterval(check);
            resolve();
          }
        }, 15);
      });

      const combinedSynthesis = env.recordedChunks.join('');
      assert.ok(combinedSynthesis.includes('### Research Synthesis: "Strawberry" vs "Arc"'));

      await researcher.destroy();
    });

    it('5.4: Utility parsing: performWebSearch on empty/whitespace query returns empty array', async () => {
      const env = createMockResearcherEnvironment();
      const { performWebSearch } = env.exports;

      const res1 = await performWebSearch('');
      assert.strictEqual(res1.length, 0);

      const res2 = await performWebSearch('    \t\n   ');
      assert.strictEqual(res2.length, 0);
    });

    it('5.5: HTML Entity decoding & DuckDuckGo URL unwrapper handles complex redirect URLs and entities', () => {
      const env = createMockResearcherEnvironment();
      const { decodeHtmlEntities, cleanHtmlText, unwrapDuckDuckGoUrl, parseDuckDuckGoHtml } = env.exports;

      // Entities
      const decoded = decodeHtmlEntities('&lt;b&gt;WarWick &amp; Strawberry&#39;s Browser&lt;/b&gt;');
      assert.strictEqual(decoded, '<b>WarWick & Strawberry\'s Browser</b>');

      const cleaned = cleanHtmlText('<div>  Hello <b>World</b> &amp; Universe  </div>');
      assert.strictEqual(cleaned, 'Hello World & Universe');

      // DuckDuckGo URL unwrapper
      const rawUddg = '/l/?uddg=https%3A%2F%2Fstrawberry.browser%2Fdocs%3Fq%3D1&rut=...';
      const unwrapped = unwrapDuckDuckGoUrl(rawUddg);
      assert.strictEqual(unwrapped, 'https://strawberry.browser/docs?q=1');

      // Direct URL
      const direct = unwrapDuckDuckGoUrl('https://electronjs.org/docs');
      assert.strictEqual(direct, 'https://electronjs.org/docs');

      // Invalid / internal duckduckgo search
      assert.strictEqual(unwrapDuckDuckGoUrl('https://duckduckgo.com/?q=test'), null);
      assert.strictEqual(unwrapDuckDuckGoUrl(''), null);

      // DuckDuckGo HTML parser fixture
      const mockHtml = `
        <div class="result results_links results_links_deep highlight_result web-result">
          <h2 class="result__title">
            <a class="result__url" href="/l/?uddg=https%3A%2F%2Fexample.org%2Farticle">Example <b>Article</b></a>
          </h2>
          <div class="result__snippet">This is an <i>informative</i> snippet &amp; summary.</div>
        </div>
      `;
      const parsed = parseDuckDuckGoHtml(mockHtml, 5);
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].title, 'Example Article');
      assert.strictEqual(parsed[0].url, 'https://example.org/article');
      assert.strictEqual(parsed[0].snippet, 'This is an informative snippet & summary.');
    });
  });
});
