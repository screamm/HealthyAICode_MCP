/**
 * Tests for packages/core/src/refactor/behavior-equiv/index.ts
 *
 * Focus: dispatch logic + advisory fallback correctness.
 *
 * The dynamic engines (python-equiv.ts, js-equiv.ts) are now present, so these
 * tests verify the REAL dispatch behaviour:
 *  1. Python/TS/JS language tags dispatch to the dynamic engine and return a
 *     `dynamic` verdict (equivalent | divergence) on real before/after snippets.
 *  2. Java returns `unverified` with mode `static-only-advisory` (optionally
 *     augmented with a `staticNote` from RefactoringMiner when available).
 *  3. Rust / Go / C# / and all other languages return `unverified` advisory.
 *  4. Language-tag normalisation (upper-case, leading dot, aliases) routes to the
 *     correct engine.
 */

import { describe, it, expect } from 'vitest';
import { verifyRefactor } from '../../../src/refactor/behavior-equiv/index';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Python: a genuinely equivalent rename of the local result variable. The Python
// engine resolves the target function by name; we pass an explicit target.
const BEFORE = `def add(a, b):\n    return a + b\n`;
const AFTER  = `def add(a, b):\n    result = a + b\n    return result\n`;

// TS/JS: the dispatcher resolves the function name automatically when a single
// top-level function is present. Use the before/after export convention.
const JS_EQUIV_BEFORE = `export function before(a, b) { return a + b; }`;
const JS_EQUIV_AFTER  = `export function after(a, b) { const r = a + b; return r; }`;
const JS_DIVERGE_BEFORE = `export function before(a) { return a + 1; }`;
const JS_DIVERGE_AFTER  = `export function after(a) { return a - 1; }`;

// ── Advisory fallback for unsupported languages ────────────────────────────────

describe('verifyRefactor — advisory fallback (unsupported languages)', () => {
  it('returns unverified + static-only-advisory for Rust', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'rust');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
    expect(result.reason).toMatch(/rust/i);
    expect(result.reason).toMatch(/not available/i);
  });

  it('returns unverified + static-only-advisory for Go', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'go');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
  });

  it('returns unverified + static-only-advisory for C#', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'c#');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
  });

  it('returns unverified + static-only-advisory for Ruby', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'ruby');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
  });

  it('returns unverified + static-only-advisory for Kotlin', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'kotlin');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
  });

  it('does NOT return verdict equivalent or divergence for unsupported langs', async () => {
    for (const lang of ['rust', 'go', 'c#', 'php', 'elixir', 'haskell', 'swift', 'scala', 'lua', 'bash']) {
      const result = await verifyRefactor(BEFORE, AFTER, lang);
      expect(result.verdict, `lang=${lang}`).toBe('unverified');
    }
  });

  it('reason text explains which engines ARE supported', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'rust');
    expect(result.reason).toMatch(/python/i);
    expect(result.reason).toMatch(/typescript/i);
  });
});

// ── Java — advisory + optional RefactoringMiner staticNote ────────────────────

describe('verifyRefactor — Java (advisory + optional staticNote)', () => {
  it('returns unverified + static-only-advisory for Java', async () => {
    const result = await verifyRefactor(
      'class A { int add(int a, int b) { return a + b; } }',
      'class A { int add(int a, int b) { int r = a + b; return r; } }',
      'java',
    );
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
    // staticNote may be undefined (RefactoringMiner absent) or a string — both are valid
    expect(result.staticNote === undefined || typeof result.staticNote === 'string').toBe(true);
  });
});

// ── Python dispatch ────────────────────────────────────────────────────────────

describe('verifyRefactor — Python dispatch (dynamic engine present)', () => {
  it('dispatches to the python engine and returns a dynamic equivalent verdict', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'python', 'add');
    // A pure variable rename is behaviourally equivalent.
    expect(result.verdict).toBe('equivalent');
    expect(result.mode).toBe('dynamic');
    expect(result.inputsTested).toBeGreaterThan(0);
  });

  it('dispatches to the python engine and detects a real divergence', async () => {
    const before = `def f(a):\n    return a + 1\n`;
    const after = `def f(a):\n    return a - 1\n`;
    const result = await verifyRefactor(before, after, 'python', 'f');
    expect(result.verdict).toBe('divergence');
    expect(result.mode).toBe('dynamic');
    expect(result.divergingInput).toBeDefined();
  });

  it('normalises "py" alias to the Python engine (dynamic verdict, not advisory)', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'py', 'add');
    expect(result.mode).toBe('dynamic');
    expect(['equivalent', 'divergence']).toContain(result.verdict);
  });

  it('normalises upper-case "PYTHON" to the Python engine', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'PYTHON', 'add');
    expect(result.mode).toBe('dynamic');
    expect(['equivalent', 'divergence']).toContain(result.verdict);
  });
});

// ── TypeScript / JavaScript dispatch ──────────────────────────────────────────

describe('verifyRefactor — TypeScript/JavaScript dispatch (dynamic engine present)', () => {
  it('dispatches to the JS engine and detects a real divergence', async () => {
    const result = await verifyRefactor(JS_DIVERGE_BEFORE, JS_DIVERGE_AFTER, 'typescript');
    expect(result.verdict).toBe('divergence');
    expect(result.mode).toBe('dynamic');
    expect(result.divergingInput).toBeDefined();
  });

  it('dispatches to the JS engine and returns equivalent for a pure rename', async () => {
    const result = await verifyRefactor(JS_EQUIV_BEFORE, JS_EQUIV_AFTER, 'javascript');
    expect(result.verdict).toBe('equivalent');
    expect(result.mode).toBe('dynamic');
    expect(result.inputsTested).toBeGreaterThan(0);
  });

  it('normalises "ts" alias to the JS engine', async () => {
    const result = await verifyRefactor(JS_DIVERGE_BEFORE, JS_DIVERGE_AFTER, 'ts');
    expect(result.mode).toBe('dynamic');
    expect(result.verdict).toBe('divergence');
  });

  it('normalises "js" alias to the JS engine', async () => {
    const result = await verifyRefactor(JS_DIVERGE_BEFORE, JS_DIVERGE_AFTER, 'js');
    expect(result.mode).toBe('dynamic');
    expect(result.verdict).toBe('divergence');
  });

  it('normalises "tsx" alias to the JS engine', async () => {
    const result = await verifyRefactor(JS_DIVERGE_BEFORE, JS_DIVERGE_AFTER, 'tsx');
    expect(result.mode).toBe('dynamic');
    expect(result.verdict).toBe('divergence');
  });

  it('normalises "jsx" alias to the JS engine', async () => {
    const result = await verifyRefactor(JS_DIVERGE_BEFORE, JS_DIVERGE_AFTER, 'jsx');
    expect(result.mode).toBe('dynamic');
    expect(result.verdict).toBe('divergence');
  });

  it('normalises "JavaScript" (mixed-case) to the JS engine', async () => {
    const result = await verifyRefactor(JS_EQUIV_BEFORE, JS_EQUIV_AFTER, 'JavaScript');
    expect(result.mode).toBe('dynamic');
    expect(result.verdict).toBe('equivalent');
  });
});

// ── Language-tag normalisation edge cases ─────────────────────────────────────

describe('verifyRefactor — language normalisation', () => {
  it('strips a leading dot from the language tag', async () => {
    // ".py" should route to the Python engine (dynamic), not unknown-advisory.
    const result = await verifyRefactor(BEFORE, AFTER, '.py', 'add');
    expect(result.mode).toBe('dynamic');
    expect(['equivalent', 'divergence']).toContain(result.verdict);
  });

  it('handles whitespace-padded language tags', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, '  rust  ');
    expect(result.verdict).toBe('unverified');
    expect(result.mode).toBe('static-only-advisory');
  });
});

// ── VerifyResult shape invariants ─────────────────────────────────────────────

describe('verifyRefactor — result shape invariants', () => {
  it('always includes a non-empty reason string', async () => {
    for (const lang of ['python', 'typescript', 'java', 'rust', 'go']) {
      const result = await verifyRefactor(BEFORE, AFTER, lang);
      expect(typeof result.reason, `lang=${lang}`).toBe('string');
      expect(result.reason.length, `lang=${lang}`).toBeGreaterThan(0);
    }
  });

  it('advisory results never have inputsTested set', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'rust');
    expect(result.inputsTested).toBeUndefined();
  });

  it('advisory results never have divergingInput set', async () => {
    const result = await verifyRefactor(BEFORE, AFTER, 'go');
    expect(result.divergingInput).toBeUndefined();
  });
});
