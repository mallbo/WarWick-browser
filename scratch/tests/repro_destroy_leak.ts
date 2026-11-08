import { app, BrowserWindow } from 'electron';
import { AntigravityBridge } from '../../src/main/antigravityBridge';
import { DEFAULT_APP_SETTINGS, IPC_CHANNELS } from '../../src/shared/types';
import assert from 'node:assert';

async function testDestroyLeak() {
  await app.whenReady();
  const win = new BrowserWindow({ show: false });

  const capturedChunks: string[] = [];
  win.webContents.send = (channel: string, ...args: any[]) => {
    if (channel === IPC_CHANNELS.AGENT_STREAM_CHUNK) {
      capturedChunks.push(args[0]);
    }
  };

  // Provide an invalid key so that generateContentStream takes ~1-2 seconds to fail with 400
  const bridge = new AntigravityBridge(win, {
    ...DEFAULT_APP_SETTINGS,
    geminiApiKey: 'invalid-network-key-triggering-rejection'
  });

  console.log('[REPRO] Sending prompt with live GenAI attempting network call...');
  await bridge.sendPrompt('Prompt that should be destroyed');

  console.log('[REPRO] Immediately calling bridge.destroy()...');
  await bridge.destroy();

  const chunksImmediatelyAfterDestroy = capturedChunks.length;
  console.log(`[REPRO] Chunks immediately after destroy: ${chunksImmediatelyAfterDestroy}`);

  console.log('[REPRO] Waiting 2500ms for network call to reject...');
  await new Promise((r) => setTimeout(r, 2500));

  console.log(`[REPRO] Chunks after 2500ms: ${capturedChunks.length}`);
  if (capturedChunks.length > chunksImmediatelyAfterDestroy) {
    console.log('[BUG CONFIRMED] Chunks leaked after destroy() was called!');
    console.log('Leaked chunks:', capturedChunks);
  } else {
    console.log('[REPRO] No chunks leaked.');
  }

  win.destroy();
  app.exit(0);
}

testDestroyLeak().catch((err) => {
  console.error(err);
  app.exit(1);
});
