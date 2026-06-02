/**
 * Tests for packages/core/src/refactor/behavior-equiv/js-equiv.ts
 *
 * Exercises the TS/JS golden-master + property differential engine on:
 *  1. The full committed TS fixture corpus (manifest.json): divergent pairs must be
 *     caught, equivalent pairs must NOT be flagged — measured as detection/FP rates.
 *  2. The `verifyJsEquiv` dispatcher adapter (the contract consumed by index.ts).
 *  3. Determinism (same seed ⇒ same verdict + same diverging input).
 *  4. Specific bug-class edges (async-await drop, mutation-vs-copy, dropped default,
 *     thrown-vs-value, float tolerance, falsy-coercion).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkJsEquivalence, verifyJsEquiv } from '../../../src/refactor/behavior-equiv/js-equiv';

const FIXTURES = join(__dirname, '..', '..', 'fixtures', 'behavior-equiv');

interface ManifestPair {
  id: string;
  language: string;
  expected: 'divergent' | 'equivalent';
  file: string;
}

function readFixture(rel: string): string {
  return readFileSync(join(FIXTURES, rel), 'utf8');
}

function loadManifest(): ManifestPair[] {
  const m = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8'));
  return m.pairs as ManifestPair[];
}

// A fixture file defines BOTH `before` and `after`; the engine compares the two exports.
// Tests use a reduced `runs` budget for speed: the worst-case divergent fixture in this
// corpus is caught at input #38, so 500 inputs is a ~13x safety margin while keeping CI
// fast. The production default (2000) is exercised separately below.
function checkFixturePair(rel: string, runs = 500) {
  const src = readFixture(rel);
  return checkJsEquivalence(src, src, { beforeFnName: 'before', afterFnName: 'after', runs });
}

// ── Full corpus: every TS pair, with explicit per-pair assertions ──────────────

describe('checkJsEquivalence — full committed TS corpus', () => {
  const tsPairs = loadManifest().filter((p) => p.language === 'typescript');

  // ts-08 (dropped `await`) IS now detected. A naive one-shot `Promise.resolve(r).then()`
  // auto-flattens promise nesting and would miss it, so the engine instead unwraps ONE level
  // at a time and records the Promise-nesting depth as part of the observation; AND the ts-08
  // fixture expresses a REAL dropped-await divergence (the unawaited Promise is embedded in the
  // result object, which async-return does not auto-unwrap) so the embedded value also differs.
  // Every TS pair — including ts-08 — must therefore land on its labelled verdict.
  for (const p of tsPairs) {
    it(`${p.id} → ${p.expected}`, () => {
      const res = checkFixturePair(p.file);
      expect(res.verdict, `${p.id}: ${res.detail}`).toBe(p.expected);
      if (p.expected === 'divergent') {
        expect(res.divergingInput, `${p.id} must carry a witness`).toBeDefined();
      }
    });
  }
});

// ── Aggregate detection / false-positive gate ──────────────────────────────────

describe('checkJsEquivalence — corpus detection & false-positive rates', () => {
  it('detects all divergent TS pairs and false-flags none of the equivalent ones', () => {
    const tsPairs = loadManifest().filter((p) => p.language === 'typescript');
    let tp = 0;
    let fn = 0;
    let tn = 0;
    let fp = 0;
    for (const p of tsPairs) {
      const res = checkFixturePair(p.file);
      const flagged = res.verdict === 'divergent';
      if (p.expected === 'divergent') flagged ? tp++ : fn++;
      else flagged ? fp++ : tn++;
    }
    const detection = tp / (tp + fn);
    const fpRate = fp / (tn + fp);
    // Honesty gate from the strategy doc: detection ≥ 80%, FP ≤ 10%.
    expect(detection, `detection=${(detection * 100).toFixed(1)}% (tp=${tp} fn=${fn})`).toBeGreaterThanOrEqual(0.8);
    expect(fpRate, `fpRate=${(fpRate * 100).toFixed(1)}% (fp=${fp} tn=${tn})`).toBeLessThanOrEqual(0.1);
  });
});

// ── Specific high-value bug classes ────────────────────────────────────────────

describe('checkJsEquivalence — specific bug classes', () => {
  it('catches immutable→mutation (push vs spread-copy) via argument-mutation observation', () => {
    const res = checkFixturePair('nonequivalent/typescript/ts-09-mutation-vs-copy.ts');
    expect(res.verdict).toBe('divergent');
  });

  it('catches dropped default argument (undefined input distinguishes the two)', () => {
    const res = checkFixturePair('nonequivalent/typescript/ts-03-dropped-default.ts');
    expect(res.verdict).toBe('divergent');
  });

  it('catches the ?? -> || falsy-coercion break on numeric zero', () => {
    const before = `export function pick(v, d) { return v ?? d; }`;
    const after = `export function pick(v, d) { return v || d; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'pick', afterFnName: 'pick' });
    expect(res.verdict).toBe('divergent');
  });

  it('treats a thrown error vs a returned value as divergence', () => {
    const before = `export function get(o) { return o.x; }`;
    const after = `export function get(o) { if (!('x' in o)) throw new TypeError('missing'); return o.x; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'get', afterFnName: 'get' });
    expect(res.verdict).toBe('divergent');
  });

  it('does not false-flag an algebraically equal reformulation', () => {
    const before = `export function scale(x) { return x * 3; }`;
    const after = `export function scale(x) { return x + x + x; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'scale', afterFnName: 'scale' });
    expect(res.verdict).toBe('equivalent');
  });

  // ── async-semantics: dropped await (ts-08 bug class) ──────────────────────────
  // A dropped await on a value that is then USED (here embedded in the returned object) is a
  // real divergence: the unawaited Promise flows into the result instead of the resolved value.
  it('catches a dropped await whose unresolved Promise is embedded in the result', () => {
    const before = `
      async function fetchUser(id) { return { id, name: 'u' + id }; }
      export async function load(id) { const u = await fetchUser(id); return { user: u }; }`;
    const after = `
      async function fetchUser(id) { return { id, name: 'u' + id }; }
      export async function load(id) { const u = fetchUser(id); return { user: u }; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'load', afterFnName: 'load' });
    expect(res.verdict, res.detail).toBe('divergent');
  });

  // The async-aware harness counts Promise-nesting DEPTH, so a Promise<Promise<T>> diverges
  // from a Promise<T> even when both resolve to the same payload (a one-shot resolve would
  // auto-flatten the extra level and miss it). Embedding via an array prevents async-return
  // auto-unwrap so the dropped await leaves a genuine extra Promise level.
  it('distinguishes Promise<Promise<T>> from Promise<T> by nesting depth', () => {
    const before = `
      async function inner(x) { return x + 1; }
      export async function f(x) { return [await inner(x)]; }`;
    const after = `
      async function inner(x) { return x + 1; }
      export async function f(x) { return [inner(x)]; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'f', afterFnName: 'f' });
    expect(res.verdict, res.detail).toBe('divergent');
  });

  // Honesty guard: two async functions that BOTH correctly await (or whose trailing
  // `return await p` vs `return p` is spec-equivalent because async-return auto-unwraps a
  // directly-returned thenable) must NOT be flagged. This is the case the original ts-08
  // fixture mistakenly encoded; the engine must treat it as equivalent.
  it('does NOT flag spec-equivalent async return (return await p vs return p, directly returned)', () => {
    const before = `
      async function inner(x) { return x + 1; }
      export async function f(x) { return await inner(x); }`;
    const after = `
      async function inner(x) { return x + 1; }
      export async function f(x) { return inner(x); }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'f', afterFnName: 'f' });
    expect(res.verdict, res.detail).toBe('equivalent');
  });
});

// ── Dispatcher adapter contract ────────────────────────────────────────────────

describe('verifyJsEquiv — dispatcher adapter contract', () => {
  it('returns mode:dynamic + verdict:divergence for a broken refactor', async () => {
    const before = `export function f(a, b) { return a + b; }`;
    const after = `export function f(a, b) { return a - b; }`;
    const res = await verifyJsEquiv(before, after, 'f');
    expect(res.verdict).toBe('divergence');
    expect(res.mode).toBe('dynamic');
    expect(res.inputsTested).toBeGreaterThan(0);
    expect(typeof res.divergingInput).toBe('string');
    expect(res.reason.length).toBeGreaterThan(0);
  });

  it('returns mode:dynamic + verdict:equivalent for a true refactor', async () => {
    const before = `export function sum(xs) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return s; }`;
    const after = `export function sum(xs) { return xs.reduce((a, b) => a + b, 0); }`;
    const res = await verifyJsEquiv(before, after, 'sum');
    expect(res.verdict).toBe('equivalent');
    expect(res.mode).toBe('dynamic');
    expect(res.inputsTested).toBeGreaterThan(0);
  });

  it('auto-resolves the sole exported function when no targetFunction is given', async () => {
    const before = `export function inc(n) { return n + 1; }`;
    const after = `export function inc(n) { return n + 2; }`;
    const res = await verifyJsEquiv(before, after);
    expect(res.verdict).toBe('divergence');
  });

  it('returns advisory unverified when the target cannot be resolved', async () => {
    const before = `export function a() { return 1; }\nexport function b() { return 2; }`;
    const after = `export function a() { return 1; }\nexport function b() { return 2; }`;
    const res = await verifyJsEquiv(before, after); // ambiguous, no target
    expect(res.verdict).toBe('unverified');
    expect(res.mode).toBe('static-only-advisory');
  });
});

// ── Production default budget ──────────────────────────────────────────────────

describe('checkJsEquivalence — default 2000-input budget', () => {
  it('catches the hardest divergent pair (boundary) at the production default', () => {
    const src = readFixture('nonequivalent/typescript/ts-01-boundary-condition.ts');
    const res = checkJsEquivalence(src, src, { beforeFnName: 'before', afterFnName: 'after' });
    expect(res.verdict).toBe('divergent');
  });
});

// ── FIX 1: purity / self-containment gate ──────────────────────────────────────

describe('checkJsEquivalence — purity / self-containment gate', () => {
  it('returns unverified (not pass/divergence) for a filesystem-IO function', () => {
    const src = readFixture('impure/ts-impure-fs.ts');
    const res = checkJsEquivalence(src, src, { beforeFnName: 'before', afterFnName: 'after' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure/i);
    expect(res.detail).toMatch(/filesystem|fs/i);
    expect(res.checked).toBe(0);
  });

  it('flags network IO (fetch) as impure → unverified', () => {
    const before = `export async function load(id) { const r = await fetch('/u/' + id); return r.status; }`;
    const after = `export async function load(id) { const r = await fetch('/user/' + id); return r.status; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'load', afterFnName: 'load' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure: network/i);
  });

  it('flags process/environment access as impure → unverified', () => {
    const before = `export function mode() { return process.env.NODE_ENV; }`;
    const after = `export function mode() { return process.env.NODE_ENV || 'dev'; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'mode', afterFnName: 'mode' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure: process/i);
  });

  it('flags module-scope mutation as impure → unverified', () => {
    const before = `let calls = 0;\nexport function tick() { calls += 1; return calls; }`;
    const after = `let calls = 0;\nexport function tick() { calls = calls + 1; return calls; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'tick', afterFnName: 'tick' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure: module-scope mutation/i);
  });

  it('flags crypto.randomUUID (unfrozen nondeterminism) as impure → unverified', () => {
    const before = `export function id() { return crypto.randomUUID(); }`;
    const after = `export function id() { return crypto.randomUUID().toString(); }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'id', afterFnName: 'id' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure: nondeterministic crypto/i);
  });

  it('flags DOM/window access as impure → unverified', () => {
    const before = `export function w() { return window.innerWidth; }`;
    const after = `export function w() { return window.innerWidth * 1; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'w', afterFnName: 'w' });
    expect(res.verdict).toBe('unverified');
    expect(res.detail).toMatch(/impure: dom/i);
  });

  it('does NOT flag Date.now / Math.random — the sandbox freezes them (still verifiable)', () => {
    // Both use frozen sources; the refactor genuinely changes behaviour (off-by-one on the
    // frozen clock). Must run dynamically and detect divergence, NOT bail out as impure.
    const before = `export function f(x) { return x + Date.now() % 7; }`;
    const after = `export function f(x) { return x + Date.now() % 5; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'f', afterFnName: 'f' });
    expect(res.verdict).toBe('divergent');
  });

  it('does NOT flag a read-only module-scope const table as impure (no mutation)', () => {
    // LABELS is read-only (const, never mutated) → the function is still pure & verifiable.
    // Both formulations read the same table identically, so the pair is genuinely equivalent.
    const before = `const LABELS = ['a','b','c'];\nexport function label(i) { return LABELS[i] === undefined ? 'x' : LABELS[i]; }`;
    const after = `const LABELS = ['a','b','c'];\nexport function label(i) { return LABELS[i] ?? 'x'; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'label', afterFnName: 'label' });
    expect(res.verdict).toBe('equivalent');
  });

  it('does NOT flag the word "fetch" appearing only in a comment or string', () => {
    const before = `export function tag(n) { /* fetch the label */ return 'fetch-' + n; }`;
    const after = `export function tag(n) { return 'fetch-' + n; /* fetch */ }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'tag', afterFnName: 'tag' });
    expect(res.verdict).toBe('equivalent');
  });
});

// ── FIX 2: type-guided synthesis lowers false positives ─────────────────────────

describe('checkJsEquivalence — type-guided synthesis avoids garbage-input false positives', () => {
  // Equivalent numeric reformulation. Untyped, type-FLIPPING fuzzing would feed a string and
  // make `n*3` (NaN) differ from `n+n+n` ('xxx'), a dishonest FP. Type-stable synthesis keeps
  // the slot numeric, so the pair correctly passes.
  it('does not false-flag x*3 vs x+x+x on an untyped numeric param', () => {
    const before = `export function scale(n) { return n * 3; }`;
    const after = `export function scale(n) { return n + n + n; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'scale', afterFnName: 'scale' });
    expect(res.verdict).toBe('equivalent');
  });

  // TS-typed equivalent reformulation across two params; types resolve both to number.
  it('does not false-flag a TS-typed equivalent average reformulation', () => {
    const before = `export function avg(a: number, b: number): number { return (a + b) / 2; }`;
    const after = `export function avg(a: number, b: number): number { return a / 2 + b / 2; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'avg', afterFnName: 'avg' });
    expect(res.verdict).toBe('equivalent');
  });

  // String param inferred from usage; equivalent uppercase reformulations must not be flagged
  // by being fed a number (n.toUpperCase() would throw on a number → spurious divergence).
  it('does not false-flag equivalent string transforms on a usage-inferred string param', () => {
    const before = `export function shout(s) { return s.trim().toUpperCase(); }`;
    const after = `export function shout(s) { return s.toUpperCase().trim(); }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'shout', afterFnName: 'shout' });
    expect(res.verdict).toBe('equivalent');
  });

  // Genuinely-divergent pairs must STILL be detected after the synthesis hardening.
  it('still detects a genuine numeric divergence (off-by-one)', () => {
    const before = `export function f(n) { return n + 1; }`;
    const after = `export function f(n) { return n + 2; }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'f', afterFnName: 'f' });
    expect(res.verdict).toBe('divergent');
  });

  it('still detects a genuine string divergence', () => {
    const before = `export function g(s) { return s.trim(); }`;
    const after = `export function g(s) { return s.trimStart(); }`;
    const res = checkJsEquivalence(before, after, { beforeFnName: 'g', afterFnName: 'g' });
    expect(res.verdict).toBe('divergent');
  });
});

// ── Determinism ────────────────────────────────────────────────────────────────

describe('checkJsEquivalence — determinism', () => {
  it('produces identical verdicts and witnesses across two runs with the same seed', () => {
    const src = readFixture('nonequivalent/typescript/ts-01-boundary-condition.ts');
    const a = checkJsEquivalence(src, src, { beforeFnName: 'before', afterFnName: 'after', seed: 42 });
    const b = checkJsEquivalence(src, src, { beforeFnName: 'before', afterFnName: 'after', seed: 42 });
    expect(a.verdict).toBe(b.verdict);
    expect(a.checked).toBe(b.checked);
    expect(JSON.stringify(a.divergingInput)).toBe(JSON.stringify(b.divergingInput));
  });
});
