const { spawnSync } = require('child_process');
const path = require('path');

const res = spawnSync(path.resolve('node_modules/electron/dist/electron.exe'), [path.resolve('scratch/tests/repro_bundle.cjs')], {
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

console.log(res.stdout);
console.error(res.stderr);
