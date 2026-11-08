import { app, BrowserWindow } from 'electron';
import { AntigravityBridge } from '../../src/main/antigravityBridge';
import { DEFAULT_APP_SETTINGS, IPC_CHANNELS } from '../../src/shared/types';

async function diagnose() {
  await app.whenReady();
  const win = new BrowserWindow({ show: false });

  const captured: any[] = [];
  win.webContents.send = (channel: string, ...args: any[]) => {
    captured.push({ channel, arg0: args[0], time: Date.now() });
  };

  const bridge = new AntigravityBridge(win, DEFAULT_APP_SETTINGS);

  console.log('[DIAGNOSE] Calling sendPrompt...');
  const { runId } = await bridge.sendPrompt('Diagnose Prompt');
  console.log('[DIAGNOSE] runId:', runId, 'isCancelled before cancel:', (bridge as any).isCancelled);

  await new Promise(r => setTimeout(r, 1));
  console.log('[DIAGNOSE] Calling cancel()...');
  const cancelRes = await bridge.cancel();
  console.log('[DIAGNOSE] cancelRes:', cancelRes, 'isCancelled after cancel:', (bridge as any).isCancelled);

  await new Promise(r => setTimeout(r, 200));

  console.log('[DIAGNOSE] Total events captured:', captured.length);
  for (const c of captured) {
    console.log(' - Event:', c.channel, typeof c.arg0 === 'string' ? c.arg0.slice(0, 50) : c.arg0);
  }

  win.destroy();
  app.exit(0);
}

diagnose().catch(err => {
  console.error(err);
  app.exit(1);
});
