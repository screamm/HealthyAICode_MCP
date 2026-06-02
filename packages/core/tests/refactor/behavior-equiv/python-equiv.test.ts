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

  // Domain-scoping via USAGE inference (FIX 2). try/except ZeroDivisionError vs `if b == 0`
  // is equivalent over the numeric domain. The BEFORE body uses `a / b`, which the usage
  // analyser reads as numeric — so even UNTYPED params are synthesised as numbers and the
  // genuinely-equivalent pair PASSES (this was a false positive before the fix). Explicit
  // `int` annotations agree. A control with a genuine numeric divergence still fails, proving
  // the engine is not trivially passing once the domain is correctly scoped.
  it('uses USAGE inference to scope the numeric domain (guard-clause refactor passes untyped AND annotated)', async () => {
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

    // Usage (`a / b`) scopes synthesis to numbers → genuinely-equivalent pair passes.
    const untypedResult = await verifyPythonEquivalence(untyped, untypedAfter, 'f', {
      inputs: 600,
      timeoutMs: 25_000,
    });
    expect(untypedResult.verdict).toBe('pass');

    // Explicit int annotations agree with the inferred domain.
    const typed = untyped.replace('def f(a, b):', 'def f(a: int, b: int):');
    const typedAfter = untypedAfter.replace('def f(a, b):', 'def f(a: int, b: int):');
    const typedResult = await verifyPythonEquivalence(typed, typedAfter, 'f', {
      inputs: 600,
      timeoutMs: 25_000,
    });
    expect(typedResult.verdict).toBe('pass');

    // Control: an actual numeric divergence in the same numeric domain is still caught,
    // so the pass above is real evidence of equivalence, not the engine giving up.
    const divergentAfter = [
      'def f(a, b):',
      '    if b == 0:',
      '        return None',
      '    return a // b',  // floor-division differs from true division on the numeric domain
    ].join('\n');
    const divergentResult = await verifyPythonEquivalence(untyped, divergentAfter, 'f', {
      inputs: 600,
      timeoutMs: 25_000,
    });
    expect(divergentResult.verdict).toBe('divergence');
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

  // ── HARDENING (Sprint 51–60): purity gate + type-guided synthesis ───────────────

  describe('FIX 1 — purity / self-containment gate', () => {
    // An impure target must return `unverified` (reason starts "impure:"), NOT a fabricated
    // pass/divergence: differentially executing IO/network/clock/global-state code yields a
    // FALSE verdict because the harness does not control those effects.
    const IMPURE: ReadonlyArray<readonly [string, string, RegExp]> = [
      ['file IO (open)', 'def f(p):\n    with open(p) as fh:\n        return fh.read()\n', /file\/IO \(open\)/],
      [
        'network (urllib)',
        'import urllib.request\n\ndef f(u):\n    return urllib.request.urlopen(u).read()\n',
        /network \(urllib\)/,
      ],
      ['subprocess', 'import subprocess\n\ndef f(c):\n    return subprocess.run(c)\n', /subprocess/],
      ['os.system', 'import os\n\ndef f(c):\n    return os.system(c)\n', /os (process|.*system)/i],
      [
        'global write',
        'STATE = 0\n\ndef f(x):\n    global STATE\n    STATE += x\n    return STATE\n',
        /global mutation \(global STATE\)/,
      ],
      [
        'module-level state write',
        'CACHE = {}\n\ndef f(k, v):\n    CACHE[k] = v\n    return v\n',
        /writes module-level 'CACHE'/,
      ],
      [
        'unfrozen clock (datetime.now)',
        'import datetime\n\ndef f(x):\n    return datetime.datetime.now().year + x\n',
        /datetime/,
      ],
      ['uuid', 'import uuid\n\ndef f(x):\n    return str(uuid.uuid4()) + str(x)\n', /uuid/],
      ['os.environ', 'import os\n\ndef f(k):\n    return os.environ.get(k)\n', /environ|env/i],
      [
        'unseeded RNG instance',
        'import random\n\ndef f(x):\n    return random.Random().random() + x\n',
        /unseeded RNG/,
      ],
    ];

    it.each(IMPURE)(
      'returns unverified (not a false pass) for impure target: %s',
      async (_label, source, reasonRe) => {
        if (!pythonAvailable) return;
        const r = await verifyPythonEquivalence(source, source, 'f', {
          inputs: 50,
          timeoutMs: 15_000,
        });
        expect(r.verdict).toBe('unverified');
        expect(r.detail).toMatch(/^impure:/);
        expect(r.detail).toMatch(reasonRe);
        // Honesty: an impure target must never report a divergence/pass verdict.
        expect(r.verdict).not.toBe('pass');
        expect(r.verdict).not.toBe('divergence');
      },
    );

    it('does NOT over-gate: a pure function using FROZEN random still runs (passes)', async () => {
      if (!pythonAvailable) return;
      // random.* is frozen identically on both sides by the harness, so it is deterministic
      // and must NOT be declined as impure.
      const src = 'import random\n\ndef f(x):\n    return x + random.randint(0, 9)\n';
      const r = await verifyPythonEquivalence(src, src, 'f', { inputs: 50, timeoutMs: 15_000 });
      expect(r.verdict).toBe('pass');
    });

    it('does NOT over-gate: mutating the function\'s OWN argument is observable, not impure', async () => {
      if (!pythonAvailable) return;
      // Argument mutation is compared via post-call arg state (this is exactly how the
      // mutable-default corpus pair is detected) — it must not trip the purity gate.
      const src = 'def f(acc, item):\n    acc.append(item)\n    return acc\n';
      const r = await verifyPythonEquivalence(src, src, 'f', { inputs: 50, timeoutMs: 15_000 });
      expect(r.verdict).toBe('pass');
    });

    it('the divergent mutable-default pair is still DETECTED (purity gate did not suppress it)', async () => {
      if (!pythonAvailable) return;
      // py-03 depends on argument mutation; the function-scoped gate must let it through and
      // the engine must still flag the divergence.
      const r = await verifyFixture('nonequivalent/python/py-03-mutable-default.py');
      expect(r.verdict).toBe('divergence');
    });
  });

  describe('FIX 2 — type/usage-guided synthesis removes the known false positives', () => {
    // py-eq-03 and py-eq-05 were previously flagged divergent ONLY because untyped synthesis
    // fed None/garbage to parameters the BEFORE body uses as numbers / a list. Usage-guided
    // inference now scopes inputs to the real domain, so these genuinely-equivalent pairs PASS.
    it('py-eq-03 guard-clause (safe_div) PASSES — was an FP', async () => {
      if (!pythonAvailable) return;
      const r = await verifyFixture('equivalent/python/py-eq-03-guard-clause.py');
      expect(r.verdict).toBe('pass');
      expect(r.divergingInput).toBeUndefined();
    });

    it('py-eq-05 early-return (find_positive) PASSES — was an FP', async () => {
      if (!pythonAvailable) return;
      const r = await verifyFixture('equivalent/python/py-eq-05-early-return.py');
      expect(r.verdict).toBe('pass');
      expect(r.divergingInput).toBeUndefined();
    });

    it('all other equivalent python pairs remain PASS (no regression)', async () => {
      if (!pythonAvailable) return;
      for (const rel of [
        'equivalent/python/py-eq-04-extract-method.py',
        'equivalent/python/py-eq-06-rename-variable.py',
      ]) {
        const r = await verifyFixture(rel);
        expect(r.verdict, `${rel} should pass`).toBe('pass');
      }
    });

    it('genuinely-divergent pairs are STILL detected after type-guided synthesis', async () => {
      if (!pythonAvailable) return;
      for (const rel of [
        'nonequivalent/python/py-02-range-offbyone.py',
        'nonequivalent/python/py-08-comparator-sign.py',
        'nonequivalent/python/py-09-dropped-return.py',
      ]) {
        const r = await verifyFixture(rel);
        expect(r.verdict, `${rel} should diverge`).toBe('divergence');
      }
    });
  });
});
