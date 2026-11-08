import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// =============================================================================
// HELPERS & MODULE LOADERS
// =============================================================================

function loadOmniboxModule() {
  const filePath = path.resolve(process.cwd(), 'src/renderer/components/Omnibox.tsx');
  const src = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React }
  }).outputText;

  const mod = { exports: {} };
  const mockReact = {
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useRef: (initial) => ({ current: initial }),
    useCallback: (fn) => fn
  };
  const ctx = vm.createContext({
    require: (m) => {
      if (m === 'react') return mockReact;
      if (m === 'lucide-react') return { Search: () => null, Lock: () => null, Globe: () => null, Sparkles: () => null };
      return {};
    },
    module: mod,
    exports: mod.exports,
    console
  });
  vm.runInContext(js, ctx);
  return {
    parseOmniboxInput: mod.exports.parseOmniboxInput,
    Omnibox: mod.exports.default || mod.exports.Omnibox,
    rawSource: src
  };
}

function loadAppSource() {
  const filePath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
  const src = fs.readFileSync(filePath, 'utf8');
  return { src };
}

function loadDrawerSource() {
  const filePath = path.resolve(process.cwd(), 'src/renderer/components/AntigravityDrawer.tsx');
  const src = fs.readFileSync(filePath, 'utf8');
  return { src };
}

// =============================================================================
// DEEP DIVE CHALLENGER SUITE
// =============================================================================

describe('Milestone 2 Remediation Deep Dive: Adversarial Oracle on Omnibox & Drawer Transitions', () => {
  const { parseOmniboxInput, rawSource: omniboxSource } = loadOmniboxModule();
  const { src: appSource } = loadAppSource();
  const { src: drawerSource } = loadDrawerSource();

  // ---------------------------------------------------------------------------
  // SUITE 1: Adversarial Testing of @ai Prefix Disambiguation
  // ---------------------------------------------------------------------------
  describe('Suite 1: @ai Prefix Disambiguation & False Positive Elimination', () => {
    it('CH-REM-1: Explicitly requested inputs (@airplane, @airbnb, @aid, @ai.com) strictly evaluate to navigation and isAiQuery = false', () => {
      const targetInputs = ['@airplane', '@airbnb', '@aid', '@ai.com'];

      for (const input of targetInputs) {
        const parsed = parseOmniboxInput(input);
        const isAiQuery = parsed.type === 'ai';

        assert.strictEqual(
          isAiQuery,
          false,
          `Adversarial input '${input}' MUST NOT be recognized as AI query!`
        );
        assert.strictEqual(
          parsed.type,
          'navigation',
          `Adversarial input '${input}' must have type 'navigation'`
        );
        assert.strictEqual(
          parsed.url,
          input,
          `Adversarial input '${input}' should preserve url string`
        );
      }
    });

    it('CH-REM-2: Whitespace padding, paths, query parameters, and ports with target inputs', () => {
      const complexVariations = [
        { input: '   @airplane   ', expectedUrl: '@airplane' },
        { input: '\n\t@airbnb/rooms/12345\n', expectedUrl: '@airbnb/rooms/12345' },
        { input: '@aid?emergency=true&priority=1', expectedUrl: '@aid?emergency=true&priority=1' },
        { input: '@ai.com:8443/api/v1/health#status', expectedUrl: '@ai.com:8443/api/v1/health#status' },
        { input: '  @airplane?q=flight+tracker  ', expectedUrl: '@airplane?q=flight+tracker' },
        { input: '@airbnb.co.uk/experiences', expectedUrl: '@airbnb.co.uk/experiences' },
        { input: '@aid-first', expectedUrl: '@aid-first' },
        { input: '@ai.company/about', expectedUrl: '@ai.company/about' }
      ];

      for (const { input, expectedUrl } of complexVariations) {
        const parsed = parseOmniboxInput(input);
        const isAiQuery = parsed.type === 'ai';

        assert.strictEqual(
          isAiQuery,
          false,
          `Padded/complex input '${input}' MUST NOT trigger AI mode`
        );
        assert.strictEqual(parsed.type, 'navigation');
        assert.strictEqual(parsed.url, expectedUrl);
      }
    });

    it('CH-REM-3: Comprehensive dictionary of @ai* English words and identifiers (NEVER AI)', () => {
      const aiWordList = [
        '@aim',
        '@aiming',
        '@aimless',
        '@air',
        '@airbag',
        '@airborne',
        '@airbus',
        '@aircraft',
        '@airdrop',
        '@airfare',
        '@airfield',
        '@airfoil',
        '@airgun',
        '@airhead',
        '@airiness',
        '@airing',
        '@airless',
        '@airlift',
        '@airline',
        '@airlock',
        '@airmail',
        '@airman',
        '@airplane',
        '@airport',
        '@airship',
        '@airsick',
        '@airspace',
        '@airstrip',
        '@airtight',
        '@airway',
        '@aisle',
        '@aitken',
        '@aioli',
        '@aileron',
        '@ailment',
        '@ai123',
        '@ai_internal',
        '@ai-agent',
        '@ai.dev',
        '@ai:9090'
      ];

      for (const word of aiWordList) {
        const parsed = parseOmniboxInput(word);
        assert.strictEqual(
          parsed.type,
          'navigation',
          `Word starting with @ai ('${word}') MUST NOT trigger AI query`
        );
      }
    });

    it('CH-REM-4: Positive AI trigger confirmation — legitimate queries trigger isAiQuery = true', () => {
      const legitimateAiCases = [
        { input: '@ai', expectedPrompt: '' },
        { input: '@ai ', expectedPrompt: '' },
        { input: '  @ai   ', expectedPrompt: '' },
        { input: '@ai\n', expectedPrompt: '' },
        { input: '@ai\t', expectedPrompt: '' },
        { input: '@ai summarize this page', expectedPrompt: 'summarize this page' },
        { input: '  @ai   what is electron?  ', expectedPrompt: 'what is electron?' },
        { input: '@ai\nexplain quantum computing', expectedPrompt: 'explain quantum computing' },
        { input: '@ai\tgenerate a unit test', expectedPrompt: 'generate a unit test' },
        { input: '?', expectedPrompt: '' },
        { input: '?   ', expectedPrompt: '' },
        { input: '? how do I use React 19?', expectedPrompt: 'how do I use React 19?' },
        { input: '???', expectedPrompt: '' },
        { input: '??? deep dive search', expectedPrompt: 'deep dive search' }
      ];

      for (const { input, expectedPrompt } of legitimateAiCases) {
        const parsed = parseOmniboxInput(input);
        assert.strictEqual(parsed.type, 'ai', `Input '${input}' should be recognized as AI query`);
        assert.strictEqual(parsed.prompt, expectedPrompt, `Prompt mismatch for input '${input}'`);
      }
    });

    it('CH-REM-5: Omnibox.tsx binds isAiQuery strictly to parseOmniboxInput(trimmed).type === "ai"', () => {
      // Static AST / code check on Omnibox.tsx
      assert.ok(
        omniboxSource.includes("const isAiQuery = parseOmniboxInput(trimmed).type === 'ai';"),
        'Omnibox.tsx must compute isAiQuery strictly using parseOmniboxInput(trimmed).type === "ai"'
      );

      // Verify that startsWith("@ai") is NOT directly used for isAiQuery
      const lines = omniboxSource.split('\n');
      const isAiQueryLines = lines.filter((line) => line.includes('isAiQuery ='));
      assert.strictEqual(isAiQueryLines.length, 1, 'Only one declaration of isAiQuery in Omnibox.tsx');
      assert.ok(
        !isAiQueryLines[0].includes(".startsWith('@ai')"),
        'isAiQuery must NOT use .startsWith("@ai") directly!'
      );
    });

    it('CH-REM-6: Form submission routing simulation for @airplane vs @ai', () => {
      // Simulate handleSubmit logic from Omnibox.tsx
      const simulateSubmit = (inputValue) => {
        let navigatedUrl = null;
        let aiPrompt = null;

        const onNavigate = (url) => { navigatedUrl = url; };
        const onTriggerAi = (prompt) => { aiPrompt = prompt; };

        const trimmed = inputValue.trim();
        if (!trimmed) return { navigatedUrl, aiPrompt };

        const parsed = parseOmniboxInput(trimmed);
        if (parsed.type === 'ai') {
          onTriggerAi(parsed.prompt || '');
        } else {
          onNavigate(parsed.url || trimmed);
        }

        return { navigatedUrl, aiPrompt };
      };

      // 1. @airplane -> navigation
      const resAirplane = simulateSubmit('@airplane');
      assert.strictEqual(resAirplane.navigatedUrl, '@airplane');
      assert.strictEqual(resAirplane.aiPrompt, null);

      // 2. @airbnb -> navigation
      const resAirbnb = simulateSubmit('@airbnb');
      assert.strictEqual(resAirbnb.navigatedUrl, '@airbnb');
      assert.strictEqual(resAirbnb.aiPrompt, null);

      // 3. @aid -> navigation
      const resAid = simulateSubmit('@aid');
      assert.strictEqual(resAid.navigatedUrl, '@aid');
      assert.strictEqual(resAid.aiPrompt, null);

      // 4. @ai.com -> navigation
      const resAiCom = simulateSubmit('@ai.com');
      assert.strictEqual(resAiCom.navigatedUrl, '@ai.com');
      assert.strictEqual(resAiCom.aiPrompt, null);

      // 5. @ai help me -> AI trigger
      const resAi = simulateSubmit('@ai help me');
      assert.strictEqual(resAi.navigatedUrl, null);
      assert.strictEqual(resAi.aiPrompt, 'help me');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Drawer Transitions & Bounds Synchronization
  // ---------------------------------------------------------------------------
  describe('Suite 2: Drawer Transitions & Bounds Synchronization Verification', () => {
    it('CH-REM-7: App.tsx attaches onTransitionEnd={reportBounds} to both Sidebar and Copilot Drawer', () => {
      // Verify Sidebar transition end binding
      assert.ok(
        appSource.includes('<Sidebar') && appSource.includes('onTransitionEnd={reportBounds}'),
        'App.tsx must pass onTransitionEnd={reportBounds} to <Sidebar />'
      );

      // The drawer <aside> now lives inside AntigravityDrawer.tsx. App.tsx
      // passes the callback down; the component attaches it to its own aside.
      const drawerBinding =
        appSource.includes('<AntigravityDrawer') &&
        appSource.includes('onTransitionEnd={reportBounds}');
      assert.ok(
        drawerBinding,
        'App.tsx must pass onTransitionEnd={reportBounds} to <AntigravityDrawer />'
      );

      const asideMatch = drawerSource.match(/<aside[\s\S]*?onTransitionEnd=\{onTransitionEnd\}[\s\S]*?>/);
      assert.ok(
        asideMatch !== null,
        'AntigravityDrawer.tsx <aside> must attach onTransitionEnd={onTransitionEnd}'
      );

      // Verify CSS transition duration and timing function on the drawer itself
      assert.ok(
        drawerSource.includes('transition-[width] duration-200 ease-in-out'),
        'Drawer must specify transition-[width] duration-200 ease-in-out'
      );

      // Verify width toggling between the expanded 360px panel and w-0
      assert.ok(
        drawerSource.includes("isOpen ? 'w-[360px] border-l' : 'w-0 border-l-0'"),
        'Drawer must toggle between w-[360px] and w-0 based on isOpen'
      );
    });

    it('CH-REM-8: reportBounds deterministic bounds calculation and IPC delivery', () => {
      let sentBounds = null;
      const fakeWarwickApi = {
        tabs: {
          setBounds: (b) => {
            sentBounds = { ...b };
          }
        }
      };

      // Implement reportBounds exactly as in App.tsx
      const createReportBounds = (containerRef, api) => {
        return () => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const bounds = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
          };
          if (api?.tabs?.setBounds) {
            api.tabs.setBounds(bounds);
          }
        };
      };

      // Case A: Initial layout (Sidebar expanded 240px, Drawer closed 0px)
      // Total window: 1280x800, Omnibox top bar: 44px
      const containerRef = {
        current: {
          getBoundingClientRect: () => ({
            left: 240,
            top: 44,
            width: 1040,
            height: 756
          })
        }
      };

      const reportBounds = createReportBounds(containerRef, fakeWarwickApi);
      reportBounds();

      assert.deepStrictEqual(sentBounds, {
        x: 240,
        y: 44,
        width: 1040,
        height: 756
      });

      // Case B: Drawer opens (w-80 = 320px). Transition completes, container contracts by 320px.
      containerRef.current = {
        getBoundingClientRect: () => ({
          left: 240,
          top: 44,
          width: 720, // 1040 - 320
          height: 756
        })
      };

      // Fire simulated onTransitionEnd callback
      reportBounds();

      assert.deepStrictEqual(sentBounds, {
        x: 240,
        y: 44,
        width: 720,
        height: 756
      });

      // Case C: Drawer closes. Transition completes, container expands by 320px back to 1040px.
      containerRef.current = {
        getBoundingClientRect: () => ({
          left: 240,
          top: 44,
          width: 1040,
          height: 756
        })
      };

      // Fire simulated onTransitionEnd callback
      reportBounds();

      assert.deepStrictEqual(sentBounds, {
        x: 240,
        y: 44,
        width: 1040,
        height: 756
      });
    });

    it('CH-REM-9: Sub-pixel float coordinates and boundary clamping in reportBounds', () => {
      let sentBounds = null;
      const api = { tabs: { setBounds: (b) => { sentBounds = b; } } };

      const createReportBounds = (containerRef) => () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.max(0, Math.round(rect.width)),
          height: Math.max(0, Math.round(rect.height)),
        };
        api.tabs.setBounds(bounds);
      };

      // Fractional float coordinates from display scaling (e.g. 125% or 150% DPI)
      const containerRef = {
        current: {
          getBoundingClientRect: () => ({
            left: 240.4,
            top: 44.6,
            width: 719.8,
            height: 755.2
          })
        }
      };

      const report = createReportBounds(containerRef);
      report();

      assert.strictEqual(sentBounds.x, 240);
      assert.strictEqual(sentBounds.y, 45); // Math.round(44.6) = 45
      assert.strictEqual(sentBounds.width, 720); // Math.round(719.8) = 720
      assert.strictEqual(sentBounds.height, 755); // Math.round(755.2) = 755

      // Negative values clamped to 0
      containerRef.current = {
        getBoundingClientRect: () => ({
          left: -10,
          top: -20,
          width: -50,
          height: -100
        })
      };
      report();
      assert.strictEqual(sentBounds.width, 0);
      assert.strictEqual(sentBounds.height, 0);

      // Null ref handles cleanly without throwing
      containerRef.current = null;
      assert.doesNotThrow(() => report());
    });

    it('CH-REM-10: Dual redundancy: ResizeObserver + onTransitionEnd cooperation', () => {
      // In App.tsx:
      // 1. ResizeObserver provides continuous updates during frame-by-frame rendering
      // 2. onTransitionEnd provides the definitive terminal boundary update when CSS transition finishes
      // 3. window resize listener handles window maximize / restore events

      assert.ok(appSource.includes('new ResizeObserver('), 'App.tsx must register ResizeObserver');
      assert.ok(appSource.includes('requestAnimationFrame('), 'ResizeObserver updates must be throttled with rAF');
      assert.ok(appSource.includes("window.addEventListener('resize'"), 'Window resize listener must be attached');
      assert.ok(appSource.includes('onTransitionEnd={reportBounds}'), 'Transition end callback must be attached');
    });
  });
});
