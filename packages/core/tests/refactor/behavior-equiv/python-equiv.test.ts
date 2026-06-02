import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  verifyPythonEquivalence,
  type PythonEquivResult,
} from '../../../src/refactor/behavior-equiv/python-equiv';

/**
 * Behaviour-equivalence fixtures store BOTH versions of a function in one file as
 * `before(...)` and `after(...)` (plus any module-level state the bug needs, e.g. a shared
 * mutable default). `verifyPythonEquivalence` expects two modules that each define a
 * same-named target function, so we synthesise:
 *   - the "before" module = the whole fixture source + `f = before`
 *   - the "after"  module = the whole fixture source + `f = after`
 * Aliasing (rather than text-extracting the body) preserves module-level state such as the
 * shared list in py-03-mutable-default, so the bug remains observable.
 */
const FIXTURE_ROOT = path.resolve(__dirname, '../../fixtures/behavior-equiv');
const TARGET = 'f';

async function readFixture(rel: string): Promise<string> {
  return fs.readFile(path.join(FIXTURE_ROOT, rel), 'utf8');
}

function beforeModule(src: string): string {
  return `${src}\n\nf = before\n`;
}
function afterModule(src: string): string {
  return `${src}\n\nf = after\n`;
}

async function verifyFixture(rel: string): Promise<PythonEquivResult> {
  const src = await readFixture(rel);
  // 600 inputs keeps each pair well under the 30s vitest timeout while staying far above
  // the density needed to hit the edge-biased boundary/coercion cases in this corpus.
  return verifyPythonEquivalence(beforeModule(src), afterModule(src), TARGET, {
    inputs: 600,
    timeoutMs: 25_000,
  });
}

describe('python-equiv: differential behaviour-equivalence engine', () => {
  let pythonAvailable = true;

  beforeAll(async () => {
    // Self-check: a trivially-identical pair must verify (and confirms the interpreter works).
    const probe = await verifyPythonEquivalence(
      'def f(x):\n    return x + 1\n',
      'def f(x):\n    return x + 1\n',
      'f',
      { inputs: 20, timeoutMs: 15_000 },
    );
    if (probe.verdict === 'unverified') {
      pythonAvailable = false;
      // eslint-disable-next-line no-console
      console.warn(`[python-equiv test] skipping — Python unavailable: ${probe.detail}`);
    } else {
      expect(probe.verdict).toBe('pass');
    }
  });

  it('flags a KNOWN-DIVERGENT pair (py-04 integer truncation n/2 vs n//2)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('nonequivalent/python/py-04-integer-truncation.py');
    expect(r.verdict).toBe('divergence');
    expect(r.divergingInput).toBeDefined();
    // before(odd) is a float, after(odd) is an int — the witness must show a value mismatch.
    expect(r.divergingInput!.before.outcome).toBe('value');
    expect(r.divergingInput!.after.outcome).toBe('value');
    expect(r.divergingInput!.before.value).not.toEqual(r.divergingInput!.after.value);
  });

  it('flags a KNOWN-DIVERGENT pair (py-07 dict default — KeyError vs 0)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('nonequivalent/python/py-07-dict-default.py');
    expect(r.verdict).toBe('divergence');
    // One side returns a value, the other raises KeyError on a missing key.
    const outcomes = [r.divergingInput!.before.outcome, r.divergingInput!.after.outcome];
    expect(outcomes).toContain('error');
  });

  it('flags a KNOWN-DIVERGENT pair (py-05 truthy coercion — `or` vs `is None`)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('nonequivalent/python/py-05-truthy-coercion.py');
    expect(r.verdict).toBe('divergence');
    expect(r.divergingInput).toBeDefined();
  });

  it('PASSES a KNOWN-EQUIVALENT pair (py-eq-01 recursive → iterative factorial)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('equivalent/python/py-eq-01-recursive-to-iterative.py');
    expect(r.verdict).toBe('pass');
    expect(r.divergingInput).toBeUndefined();
    expect(r.checked).toBeGreaterThan(0);
  });

  it('PASSES a KNOWN-EQUIVALENT pair (py-eq-07 manual max-loop → max() builtin)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('equivalent/python/py-eq-07-use-builtin.py');
    expect(r.verdict).toBe('pass');
  });

  it('PASSES a KNOWN-EQUIVALENT pair (py-eq-02 for-loop → list comprehension)', async () => {
    if (!pythonAvailable) return;
    const r = await verifyFixture('equivalent/python/py-eq-02-comprehension.py');
    expect(r.verdict).toBe('pass');
  });

  // Honest domain-scoping demonstration: try/except ZeroDivisionError vs `if b == 0` guard
  // is ONLY equivalent over numeric inputs — for non-numeric b (e.g. None) the original
  // raises TypeError while the guard short-circuits to None. Without type information the
  // engine (correctly) surfaces that real divergence. WITH `int` annotations it restricts
  // input synthesis to the numeric domain and correctly reports equivalence. This both
  // proves the engine is not trivially flagging and that annotations scope the domain.
  it('uses type annotations to scope the input domain (guard-clause refactor: divergent untyped, equivalent when annotated int)', async () => {
    if (!pythonAvailable) return;

    const untyped = [
      'def f(a, b):',
      '    try:',
      '        return a / b',
      '    except ZeroDivisionError:',
      '        return None',
    ].join('\n');
    const untypedAfter = [
      'def f(a, b):',
      '    if b == 0:',
      '        return None',
      '    return a / b',
    ].join('\n');

    const untypedResult = await verifyPythonEquivalence(untyped, untypedAfter, 'f', {
      inputs: 600,
      timeoutMs: 25_000,
    });
    // Genuine semantic difference on non-numeric inputs — not a spurious false positive.
    expect(untypedResult.verdict).toBe('divergence');

    const typed = untyped.replace('def f(a, b):', 'def f(a: int, b: int):');
    const typedAfter = untypedAfter.replace('def f(a, b):', 'def f(a: int, b: int):');
    const typedResult = await verifyPythonEquivalence(typed, typedAfter, 'f', {
      inputs: 600,
      timeoutMs: 25_000,
    });
    // Restricting to the numeric domain via annotations recovers the intended equivalence.
    expect(typedResult.verdict).toBe('pass');
  });

  it('reports `unverified` (not a crash) when the target function is missing', async () => {
    if (!pythonAvailable) return;
    const r = await verifyPythonEquivalence(
      'def g(x):\n    return x\n',
      'def g(x):\n    return x\n',
      'nonexistent_target',
      { inputs: 10, timeoutMs: 15_000 },
    );
    expect(r.verdict).toBe('unverified');
    expect(r.detail).toMatch(/not found/i);
  });

  it('is deterministic — same divergence verdict and checked count across two runs', async () => {
    if (!pythonAvailable) return;
    const rel = 'nonequivalent/python/py-04-integer-truncation.py';
    const a = await verifyFixture(rel);
    const b = await verifyFixture(rel);
    expect(a.verdict).toBe(b.verdict);
    expect(a.checked).toBe(b.checked);
    expect(a.divergingInput?.args).toEqual(b.divergingInput?.args);
  });
});
