const path = require('path');
const { spawnSync } = require('child_process');

// Runs both the Node test suite and the real Electron stress suite
console.log('================================================================');
console.log('Running Milestone 3 Empirical Stress Suite 1: Node Unit / Boundary');
console.log('================================================================\n');

const nodeResult = spawnSync(
  process.execPath,
  ['--test', path.resolve(__dirname, 'm3_token_guard_and_screenshot.test.js')],
  { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') }
);

if (nodeResult.status !== 0) {
  console.error('\n✖ Node unit/boundary test suite failed!');
  process.exit(nodeResult.status || 1);
}

console.log('\n================================================================');
console.log('Running Milestone 3 Empirical Stress Suite 2: Native Electron Runtime');
console.log('================================================================\n');

const electronResult = spawnSync(
  process.execPath,
  [path.resolve(__dirname, '../../tests/stress/run_m3_challenger1.cjs')],
  { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') }
);

if (electronResult.status !== 0) {
  console.error('\n✖ Native Electron stress harness failed!');
  process.exit(electronResult.status || 1);
}

console.log('\n================================================================');
console.log('✅ ALL EMPIRICAL CHALLENGER TESTS PASSED WITH 100% SUCCESS');
console.log('================================================================\n');
