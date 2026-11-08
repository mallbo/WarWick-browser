const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const bundleFile = path.resolve(__dirname, 'm3_challenger1_bundle_patched.cjs');
  const electronExe = path.resolve(projectRoot, 'node_modules/electron/dist/electron.exe');

  // Build bundle with an on-the-fly plugin that applies the patches
  const patchPlugin = {
    name: 'patch-plugin',
    setup(build) {
      build.onLoad({ filter: /pageContextExtractor\.ts$/ }, async (args) => {
        let text = await fs.promises.readFile(args.path, 'utf8');
        // Fix 1
        text = text.replace(
          'if (!activeTab || activeTab.view.webContents.isDestroyed()) {',
          'if (!activeTab || !activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {'
        );
        // Fix timer
        text = text.replace(
          `    const timeoutPromise = new Promise<null>((_, reject) =>\n      setTimeout(() => reject(new Error('capturePage timeout')), 3000)\n    );\n\n    const image = await Promise.race([\n      wc.capturePage(),\n      timeoutPromise\n    ]);`,
          `    let timeoutId: ReturnType<typeof setTimeout> | undefined;\n    const timeoutPromise = new Promise<null>((_, reject) => {\n      timeoutId = setTimeout(() => reject(new Error('capturePage timeout')), 3000);\n    });\n\n    let image;\n    try {\n      image = await Promise.race([\n        wc.capturePage(),\n        timeoutPromise\n      ]);\n    } finally {\n      if (timeoutId) {\n        clearTimeout(timeoutId);\n      }\n    }`
        );
        // Fix 2
        text = text.replace(
          'if (activeTab.view.webContents.isDestroyed()) {',
          'if (!activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {'
        );
        return { contents: text, loader: 'ts' };
      });

      build.onLoad({ filter: /tabManager\.ts$/ }, async (args) => {
        let text = await fs.promises.readFile(args.path, 'utf8');
        // Fix line 237
        text = text.replace(
          'if (currentTab && !currentTab.view.webContents.isDestroyed()) {',
          'if (currentTab && currentTab.view.webContents && !currentTab.view.webContents.isDestroyed()) {'
        );
        // Fix line 48
        text = text.replace(
          'if (activeTab && !activeTab.view.webContents.isDestroyed()) {',
          'if (activeTab && activeTab.view.webContents && !activeTab.view.webContents.isDestroyed()) {'
        );
        // Fix line 78
        text = text.replace(
          'if (activeTab && !activeTab.view.webContents.isDestroyed()) {',
          'if (activeTab && activeTab.view.webContents && !activeTab.view.webContents.isDestroyed()) {'
        );
        return { contents: text, loader: 'ts' };
      });
    }
  };

  await esbuild.build({
    entryPoints: [path.resolve(projectRoot, 'tests/stress/m3_challenger1_stress.ts')],
    outfile: bundleFile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    plugins: [patchPlugin]
  });

  console.log('[EXEC] Launching Electron with patched M3 Challenger 1 bundle...');
  const result = spawnSync(electronExe, [bundleFile], {
    cwd: projectRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  });

  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);

  console.log(`[EXEC] Electron process exited with status: ${result.status}`);
  process.exit(result.status || 0);
}

main().catch(console.error);
