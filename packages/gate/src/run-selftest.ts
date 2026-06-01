#!/usr/bin/env node
/**
 * Install-time self-test CLI runner for @healthy-ai-code/gate.
 *
 * Runs the gate against the known-bad fixture (a hardcoded credential
 * introduced into a healthy TypeScript file) and asserts that the gate
 * actually blocks it.  This proves, on the *installed* harness version, that
 * the deny path fires — guarding against silent-pass regressions after a
 * core scoring change or a packaging update.
 *
 * Usage:
 *   node dist/run-selftest.js
 *   pnpm --filter @healthy-ai-code/gate selftest
 *
 * Exit codes:
 *   0  Self-test passed — the gate is wired correctly.
 *   1  Self-test FAILED — the gate did not block the known-bad fixture.
 *      Do NOT deploy until this is resolved.
 */

import { runGateSelfTest } from './self-test';

const result = runGateSelfTest('claude-code');

console.log('\n=== @healthy-ai-code/gate install-time conformance self-test ===\n');
console.log(`  Harness    : ${result.harness}`);
console.log(`  Expected   : verdict="${result.expectedVerdict}"`);
console.log(`  Observed   : verdict="${result.observedVerdict}"`);
console.log(`  Result     : ${result.passed ? 'PASS' : 'FAIL'}`);

if (!result.passed) {
  console.log('');
  console.log(`  FAILURE DETAIL: ${result.detail ?? 'no detail'}`);
  console.log('');
  console.log(
    '  The gate is installed but did NOT block the known-bad fixture.\n' +
    '  This means the hook deny path is broken or misconfigured.\n' +
    '  Fix before deploying the gate in production.',
  );
  console.log('');
  process.exit(1);
}

console.log('');
console.log(
  '  Known-bad edit (hardcoded credential) was correctly DENIED.\n' +
  '  Gate is wired correctly on this installed harness version.',
);
console.log('');
process.exit(0);
