/**
 * Install-time conformance self-test.
 *
 * Runs the gate against a known-bad fixture edit and asserts the verdict is
 * `deny`. This proves, on the *installed* version, that the deny path actually
 * fires — guarding against the silent-pass failure mode where a hook is wired
 * in but no longer blocks (e.g. after a core scoring change or a packaging
 * regression). It is the package analogue of the Sats 1 acceptance metric
 * "known-bad edit blocked on the installed version".
 */
import { evaluateGate, type ProposedEdit } from './evaluate-gate';
import type { GateSelfTestResult } from './gate-types';

/**
 * A deliberately healthy "before" file: a small, well-formed function with no
 * smells. Used as the baseline for the self-test fixture.
 */
export const SELF_TEST_HEALTHY_BEFORE = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`;

/**
 * A known-bad "after": the same module but the secure SHA-256 hash is swapped
 * for the broken MD5 algorithm. This introduces a `CryptographicMisuseRisk`
 * security smell that core's `analyzeCode` detects, so the gate must always
 * deny it with `reasonCode: "new_security_smell"`.
 *
 * MD5 is chosen because cryptographic-misuse detection flows through the
 * `analyzeCode` smell pipeline (via `runAdditiveDetectors`), whereas classic
 * credential/SQL-injection findings live in the separate `auditSecurity` API
 * that the delta gate does not call. The fixture therefore exercises a smell
 * the gate can actually see.
 */
export const SELF_TEST_BAD_AFTER = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
`;

/** The canonical known-bad fixture edit used by {@link runGateSelfTest}. */
export const KNOWN_BAD_EDIT: ProposedEdit = {
  filePath: 'self-test/known-bad.ts',
  before: SELF_TEST_HEALTHY_BEFORE,
  after: SELF_TEST_BAD_AFTER,
  language: 'typescript',
};

/**
 * Runs the conformance self-test for a given harness label. Returns a
 * {@link GateSelfTestResult}; `passed` is true only when the known-bad edit is
 * denied.
 *
 * @param harness         Label of the harness/adapter being verified (default "claude-code").
 * @param harnessVersion  Optional detected harness version, recorded for diagnostics.
 */
export function runGateSelfTest(harness = 'claude-code', harnessVersion?: string): GateSelfTestResult {
  const expectedVerdict = 'deny' as const;
  let observedVerdict: GateSelfTestResult['observedVerdict'];
  try {
    observedVerdict = evaluateGate(KNOWN_BAD_EDIT).verdict;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      harness,
      harnessVersion,
      observedVerdict: 'allow',
      expectedVerdict,
      detail: `Gate threw while evaluating the known-bad fixture: ${detail}`,
    };
  }

  const passed = observedVerdict === expectedVerdict;
  return {
    passed,
    harness,
    harnessVersion,
    observedVerdict,
    expectedVerdict,
    detail: passed
      ? undefined
      : `Known-bad fixture was not blocked (observed "${observedVerdict}", expected "deny"). ` +
        `The gate is installed but not enforcing — do not rely on it.`,
  };
}
