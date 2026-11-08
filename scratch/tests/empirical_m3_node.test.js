import { describe, it } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// =============================================================================
// Transpile and load AntigravityBridge & PageContextExtractor in VM context
// =============================================================================

function loadModules() {
  const bridgeTs = fs.readFileSync(path.resolve(process.cwd(), 'src/main/antigravityBridge.ts'), 'utf8');
  const extractorTs = fs.readFileSync(path.resolve(process.cwd(), 'src/main/pageContextExtractor.ts'), 'utf8');
  const typesTs = fs.readFileSync(path.resolve(process.cwd(), 'src/shared/types.ts'), 'utf8');

  const typesJs = ts.transpileModule(typesTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const typesMod = { exports: {} };
  vm.runInNewContext(typesJs, { module: typesMod, exports: typesMod.exports });

  const extractorJs = ts.transpileModule(extractorTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const extractorMod = { exports: {} };
  vm.runInNewContext(extractorJs, {
    module: extractorMod,
    exports: extractorMod.exports,
    require: (m) => {
      if (m.includes('types')) return typesMod.exports;
      return {};
    },
    console
  });

  const bridgeJs = ts.transpileModule(bridgeTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;

  const bridgeMod = { exports: {} };
  vm.runInNewContext(bridgeJs, {
    module: bridgeMod,
    exports: bridgeMod.exports,
    require: (m) => {
      if (m.includes('types')) return typesMod.exports;
      if (m.includes('@google/genai')) return { GoogleGenAI: class {} };
      if (m.includes('@modelcontextprotocol/sdk/client/index.js')) return { Client: class { connect() {} listTools() { return { tools: [] }; } } };
      if (m.includes('@modelcontextprotocol/sdk/client/stdio.js')) return { StdioClientTransport: class { close() {} } };
      if (m === 'electron') return {};
      return {};
    },
    process,
    setTimeout,
    clearTimeout,
    console,
    AbortController
  });

  return {
    types: typesMod.exports,
    extractor: extractorMod.exports,
    bridge: bridgeMod.exports
  };
}

const { types, extractor, bridge } = loadModules();

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this.sentMessages = [];
  }
  send(channel, data) {
    this.sentMessages.push({ channel, data });
    this.emit(channel, data);
  }
}

class MockBrowserWindow {
  constructor() {
    this._destroyed = false;
    this.webContents = new MockWebContents();
  }
  isDestroyed() {
    return this._destroyed;
  }
  destroy() {
    this._destroyed = true;
  }
}

describe('Node Independent Challenger Suite: Milestone 3 Verification', () => {

  describe('1. Telemetry Constraints & Run ID Formatting', () => {
    it('1.1 sendPrompt generates runId with ^run-[a-z0-9]+$', async () => {
      const win = new MockBrowserWindow();
      const instance = new bridge.AntigravityBridge(win, types.DEFAULT_APP_SETTINGS);
      const res = await instance.sendPrompt('Testing runId pattern');
      assert.ok(res.runId);
      assert.match(res.runId, /^run-[a-z0-9]+$/);
    });

    it('1.2 researchQuery generates runId with ^res-[a-z0-9]+$', async () => {
      const win = new MockBrowserWindow();
      const instance = new bridge.AntigravityBridge(win, types.DEFAULT_APP_SETTINGS);
      const res = await instance.researchQuery('Testing research runId');
      assert.ok(res.runId);
      assert.match(res.runId, /^res-[a-z0-9]+$/);
    });

    it('1.3 Telemetry progressPercent is strictly clamped to [0, 100]', () => {
      const win = new MockBrowserWindow();
      const instance = new bridge.AntigravityBridge(win, types.DEFAULT_APP_SETTINGS);

      instance.emitAction({ runId: 'run-1', stage: 'planning', progressPercent: -50 });
      instance.emitAction({ runId: 'run-2', stage: 'synthesizing', progressPercent: 150 });
      instance.emitAction({ runId: 'run-3', stage: 'reading', progressPercent: 77.4 });

      const actions = win.webContents.sentMessages.map(m => m.data);
      assert.strictEqual(actions[0].progressPercent, 0);
      assert.strictEqual(actions[1].progressPercent, 100);
      assert.strictEqual(actions[2].progressPercent, 77);
    });
  });

  describe('2. Immediate & Edge Cancellation Semantics', () => {
    it('2.1 Immediate cancel() suppresses all chunks and emits stage: error', async () => {
      const win = new MockBrowserWindow();
      const instance = new bridge.AntigravityBridge(win, types.DEFAULT_APP_SETTINGS);

      const promptPromise = instance.sendPrompt('Prompt to cancel immediately');
      const cancelRes = await instance.cancel();

      assert.strictEqual(cancelRes, true);
      await new Promise(r => setTimeout(r, 80));

      const chunks = win.webContents.sentMessages.filter(m => m.channel === types.IPC_CHANNELS.AGENT_STREAM_CHUNK);
      assert.strictEqual(chunks.length, 0, 'No chunks may be emitted after cancel()');

      const actions = win.webContents.sentMessages.filter(m => m.channel === types.IPC_CHANNELS.AGENT_ACTION_EVENT).map(m => m.data);
      const errAction = actions.find(a => a.stage === 'error');
      assert.ok(errAction);
      assert.strictEqual(errAction.message, 'User cancelled agent execution.');
      assert.strictEqual(actions.some(a => a.stage === 'complete'), false);
    });

    it('2.2 cancel() on idle bridge returns false', async () => {
      const win = new MockBrowserWindow();
      const instance = new bridge.AntigravityBridge(win, types.DEFAULT_APP_SETTINGS);
      const cancelRes = await instance.cancel();
      assert.strictEqual(cancelRes, false);
    });
  });

  describe('3. Token Guard & Truncation Math', () => {
    it('3.1 Large text strictly clamped to <= 40000 characters', () => {
      const largeText = 'X'.repeat(60000);
      const truncated = extractor.enforceTokenGuard(largeText, 40000);
      assert.ok(truncated.length <= 40000);
      assert.ok(truncated.endsWith(extractor.TRUNCATE_NOTICE));
    });

    it('3.2 Short text retained as is', () => {
      const shortText = 'Exact text under token boundary';
      const result = extractor.enforceTokenGuard(shortText, 40000);
      assert.strictEqual(result, shortText);
    });

    it('3.3 Truncation with zero/empty text returns empty string', () => {
      assert.strictEqual(extractor.enforceTokenGuard('', 40000), '');
      assert.strictEqual(extractor.enforceTokenGuard(null, 40000), '');
      assert.strictEqual(extractor.enforceTokenGuard(undefined, 40000), '');
    });
  });
});
