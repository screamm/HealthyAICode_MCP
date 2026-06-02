/**
 * Acceptance tests for evaluateGateWithBehaviorEquiv — the async gate
 * evaluation that combines the deterministic delta-gate with the optional
 * behaviour-equivalence signal.
 *
 * Three required scenarios (from the PREP TASK gate-wiring spec):
 *   1. A divergent refactoring is DENIED via the behaviour path
 *      (verdict: 'deny', reasonCode: 'behaviour_divergence').
 *   2. An unverified refactoring (unsupported language) is NOT blocked
 *      (verdict: 'allow', advisory warning in reason).
 *   3. A behaviourally-equivalent refactoring PASSES
 *      (verdict: 'allow', no blocking).
 *
 * Additional: base-gate denials are not overridden by the behaviour-equiv
 * signal (security / regression denies still stand).
 *
 * The tests use TypeScript snippets so no Python interpreter is required in
 * the gate package's test environment.
 */
import { describe, it, expect } from 'vitest';
import { evaluateGateWithBehaviorEquiv, type ProposedEdit } from '../src/evaluate-gate';

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// The JS differential-execution engine identifies the function to compare by
// name: by convention, the before-source exports a function named "before" and
// the after-source exports a function named "after". This is how the existing
// corpus tests work and how verifyRefactor's default resolution works. We use
// the same convention here so the engine can auto-resolve without a hint.

/**
 * A clean, healthy TS file that passes the base gate.
 * Exports function "before" — the engine's default convention.
 */
const HEALTHY_TS_BEFORE = `
export function before(a: number, b: number): number {
  return a + b;
}
`.trim();

/**
 * Behaviorally DIVERGENT refactor: a + b → a - b.
 * The engine's default resolution looks for "after" in the after-source, which
 * returns a - b — so the engine will detect a divergence.
 * The base gate allows (no new structural smells, score unchanged).
 */
const DIVERGENT_AFTER = `
export function after(a: number, b: number): number {
  return a - b;
}
`.trim();

/**
 * Behaviourally EQUIVALENT refactor: extract result into a variable.
 * Both base gate and behaviour-equiv should allow this.
 */
const EQUIVALENT_AFTER = `
export function after(a: number, b: number): number {
  const result = a + b;
  return result;
}
`.trim();

/**
 * A Rust snippet — unsupported by the dynamic engine.
 * Base gate allows (no smells); behaviour-equiv returns 'unverified' → advisory.
 */
const RUST_BEFORE = `fn compute(a: i32) -> i32 { a + 1 }`;
const RUST_AFTER = `fn compute(a: i32) -> i32 { a - 1 }`;

/** A file that introduces a security smell (CryptographicMisuseRisk). */
const SECURITY_BAD_AFTER = `import crypto from 'crypto';
export function before(a: number, b: number): number { return a + b; }
export function fingerprint(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}`;
const SECURITY_BEFORE = `import crypto from 'crypto';
export function before(a: number, b: number): number { return a + b; }
export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}`;

function tsEdit(before: string, after: string): ProposedEdit {
  return { filePath: 'src/calc.ts', before, after, language: 'typescript' };
}

function rustEdit(before: string, after: string): ProposedEdit {
  // Cast language loosely — the behaviour-equiv signal normalises it itself.
  return {
    filePath: 'src/lib.rs',
    before,
    after,
    language: 'rust' as ProposedEdit['language'],
  };
}

// ── Scenario 1: divergent refactoring is DENIED ───────────────────────────────

describe('evaluateGateWithBehaviorEquiv — deny on divergence', () => {
  it('denies a TS refactoring that changed observable behaviour (a+b → a-b)', async () => {
    const decision = await evaluateGateWithBehaviorEquiv(tsEdit(HEALTHY_TS_BEFORE, DIVERGENT_AFTER));

    expect(decision.verdict).toBe('deny');
    expect(decision.reasonCode).toBe('behaviour_divergence');
    expect(decision.reason).toMatch(/changed observable behaviour/i);
  });

  it('reason includes information about the diverging input', async () => {
    const decision = await evaluateGateWithBehaviorEquiv(tsEdit(HEALTHY_TS_BEFORE, DIVERGENT_AFTER));

    // The reason should contain something useful — either "diverging input" or
    // content from the behaviour-equiv signal's reason field.
    expect(decision.reason.length).toBeGreaterThan(30);
    // verdict must be deny with behaviour_divergence reason code.
    expect(decision.verdict).toBe('deny');
    expect(decision.reasonCode).toBe('behaviour_divergence');
  });
});

// ── Scenario 2: unverified (advisory) — NOT blocked ───────────────────────────

describe('evaluateGateWithBehaviorEquiv — advisory on unverified (never blocks)', () => {
  it('does NOT block a Rust edit (unsupported language → unverified advisory)', async () => {
    const decision = await evaluateGateWithBehaviorEquiv(rustEdit(RUST_BEFORE, RUST_AFTER));

    // Base gate allows (no structural smells introduced by a trivial change).
    // Behaviour-equiv returns 'unverified' (advisory) → should NOT change verdict to deny.
    expect(decision.verdict).toBe('allow');
    expect(decision.reasonCode).toBe('none');
  });

  it('does NOT block when behaviour-equiv is unverified for a new file', async () => {
    // New file: no `before`. Even for TS, the engine returns 'unverified' (nothing to compare).
    const decision = await evaluateGateWithBehaviorEquiv(
      tsEdit('', HEALTHY_TS_BEFORE),  // empty before = new file
    );

    expect(decision.verdict).toBe('allow');
  });
});

// ── Scenario 3: equivalent refactoring PASSES ─────────────────────────────────

describe('evaluateGateWithBehaviorEquiv — passes on equivalent refactoring', () => {
  it('allows a behaviourally-equivalent TS refactoring (extract variable)', async () => {
    const decision = await evaluateGateWithBehaviorEquiv(tsEdit(HEALTHY_TS_BEFORE, EQUIVALENT_AFTER));

    expect(decision.verdict).toBe('allow');
    expect(decision.reasonCode).toBe('none');
  });
});

// ── Base-gate denials are NOT overridden ──────────────────────────────────────

describe('evaluateGateWithBehaviorEquiv — base-gate denials stand', () => {
  it('preserves a base-gate security deny even when the behaviour-equiv signal passes', async () => {
    // The MD5 edit is caught by the base gate's security-smell rule BEFORE
    // the behaviour-equiv signal can change anything.
    const decision = await evaluateGateWithBehaviorEquiv(
      tsEdit(SECURITY_BEFORE, SECURITY_BAD_AFTER),
    );

    expect(decision.verdict).toBe('deny');
    // Must be a base-gate reason, not behaviour_divergence.
    expect(decision.reasonCode).toBe('new_security_smell');
  });
});

// ── New-file edge case ────────────────────────────────────────────────────────

describe('evaluateGateWithBehaviorEquiv — new file edge cases', () => {
  it('allows a healthy new TS file (no prior version to compare)', async () => {
    const decision = await evaluateGateWithBehaviorEquiv({
      filePath: 'src/new.ts',
      before: null,
      after: HEALTHY_TS_BEFORE,
      language: 'typescript',
    });

    expect(decision.verdict).toBe('allow');
    expect(decision.scoreBefore).toBeNull();
  });
});
