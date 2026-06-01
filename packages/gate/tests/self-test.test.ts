/**
 * Tests for the install-time gate conformance self-test (src/self-test.ts).
 *
 * These tests verify that:
 *   1. runGateSelfTest returns passed:true on the current installed harness.
 *   2. The known-bad fixture (SELF_TEST_BAD_AFTER) is always denied.
 *   3. The known-bad fixture denial has the expected reasonCode.
 *   4. The self-test metadata (harness label, expectedVerdict) is correct.
 *
 * Note: this test depends on @healthy-ai-code/core being installed. If core
 * is not built/installed, these tests will fail at import time.
 */

import { describe, it, expect } from 'vitest';
import {
  runGateSelfTest,
  KNOWN_BAD_EDIT,
  SELF_TEST_HEALTHY_BEFORE,
  SELF_TEST_BAD_AFTER,
} from '../src/self-test';
import { evaluateGate } from '../src/evaluate-gate';

describe('gate self-test: conformance assertions', () => {
  it('runGateSelfTest passes on the installed harness', () => {
    const result = runGateSelfTest('test-harness');
    expect(result.passed).toBe(true);
    expect(result.observedVerdict).toBe('deny');
    expect(result.expectedVerdict).toBe('deny');
    expect(result.harness).toBe('test-harness');
    expect(result.detail).toBeUndefined();
  });

  it('runGateSelfTest with "claude-code" harness label passes', () => {
    const result = runGateSelfTest('claude-code');
    expect(result.passed).toBe(true);
    expect(result.observedVerdict).toBe('deny');
  });

  it('KNOWN_BAD_EDIT is denied (integration: new_security_smell)', () => {
    const decision = evaluateGate(KNOWN_BAD_EDIT);
    expect(decision.verdict).toBe('deny');
    // The known-bad fixture swaps SHA-256 for MD5 (CryptographicMisuseRisk) — must be new_security_smell.
    expect(decision.reasonCode).toBe('new_security_smell');
  });

  it('known-bad denial contains at least one new smell', () => {
    const decision = evaluateGate(KNOWN_BAD_EDIT);
    expect(decision.verdict).toBe('deny');
    expect(decision.newSmells.length).toBeGreaterThan(0);
  });

  it('SELF_TEST_HEALTHY_BEFORE scores above 9.0', () => {
    const decision = evaluateGate({
      ...KNOWN_BAD_EDIT,
      after: SELF_TEST_HEALTHY_BEFORE,
      before: undefined,
    });
    expect(decision.verdict).toBe('allow');
    expect(decision.scoreAfter).toBeGreaterThan(9.0);
  });

  it('SELF_TEST_BAD_AFTER introduces a CryptographicMisuseRisk smell', () => {
    const decision = evaluateGate({
      ...KNOWN_BAD_EDIT,
      before: SELF_TEST_HEALTHY_BEFORE,
      after: SELF_TEST_BAD_AFTER,
    });
    const securitySmell = decision.newSmells.find(
      s => s.type === 'CryptographicMisuseRisk',
    );
    expect(securitySmell).toBeDefined();
  });

  it('self-test result includes observedVerdict and expectedVerdict', () => {
    const result = runGateSelfTest();
    expect(result).toHaveProperty('observedVerdict');
    expect(result).toHaveProperty('expectedVerdict');
    expect(['allow', 'deny', 'warn']).toContain(result.observedVerdict);
    expect(result.expectedVerdict).toBe('deny');
  });
});
