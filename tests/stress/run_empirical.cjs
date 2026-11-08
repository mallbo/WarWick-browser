const esbuild = require('esbuild');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const entryFile = path.resolve(__dirname, 'm1_stress_runner.ts');
  const bundleFile = path.resolve(__dirname, 'bundle.cjs');
  const electronExe = path.resolve(projectRoot, 'node_modules/electron/dist/electron.exe');

  console.log('[BUILD] Bundling stress tests with esbuild...');
  await esbuild.build({
    entryPoints: [entryFile],
    outfile: bundleFile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron']
  });
  console.log('[BUILD] Bundle created at:', bundleFile);

  console.log('[EXEC] Launching Electron with empirical stress bundle...');
  const result = spawnSync(electronExe, [bundleFile], {
    cwd: projectRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  });

  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }

  console.log(`[EXEC] Electron process exited with status: ${result.status}`);
  process.exit(result.status || 0);
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
