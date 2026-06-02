/**
 * slice-extract.test.ts — function-slice extraction for REAL dependency-laden files.
 *
 * Exercises the hardening that lets the behaviour-equivalence engine verify functions in
 * real source files (with imports / sibling-module dependencies) by extracting a
 * self-contained slice, OR honestly declining when the target cannot be isolated.
 *
 * Both the slicers (js-slice / python-slice) and the end-to-end `verifyRefactor` path with
 * the new `{ beforeFile }` option are covered. The Python tests need a usable interpreter;
 * when none is present they assert the engine degrades to an honest `unverified` rather than
 * crashing (so CI without Python still passes meaningfully).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sliceJsFunction } from '../../../src/refactor/behavior-equiv/js-slice';
import { slicePythonFunction } from '../../../src/refactor/behavior-equiv/python-slice';
import { verifyRefactor } from '../../../src/refactor/behavior-equiv/index';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const FIELD = join(REPO_ROOT, 'field-repos');

function field(rel: string): string {
  return join(FIELD, rel);
}
const hasField = existsSync(FIELD);

// ── JS/TS slice extraction (no interpreter needed) ──────────────────────────────

describe('sliceJsFunction — relative-import inlining', () => {
  it('inlines transitive pure relative deps into a self-contained module', () => {
    if (!hasField) return; // field-repos checkout absent — skip
    const f = field('date-fns-typescript/pkgs/core/src/differenceInMilliseconds/index.ts');
    if (!existsSync(f)) return;
    const r = sliceJsFunction(readFileSync(f, 'utf8'), 'differenceInMilliseconds', f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // toDate (relative) and its transitive deps must be inlined; the slice must define the
      // target and carry NO unresolved relative import statement.
      expect(r.source).toContain('function differenceInMilliseconds');
      expect(r.source).toContain('function toDate');
      expect(r.source).not.toMatch(/^\s*import\b/m);
      expect(r.inlined.length).toBeGreaterThan(0);
    }
  });

  it('extracts the full function body of a complex generic signature (no truncation)', () => {
    if (!hasField) return;
    const f = field('date-fns-typescript/pkgs/core/src/areIntervalsOverlapping/index.ts');
    if (!existsSync(f)) return;
    const r = sliceJsFunction(readFileSync(f, 'utf8'), 'areIntervalsOverlapping', f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // constructFrom (a transitively-needed dep with a `& {}` type literal in its params) must
      // be inlined with a complete body, not truncated at the type-literal brace.
      expect(r.source).toContain('function constructFrom');
      expect(r.source).toContain('return new Date(value)'); // last line of constructFrom's body
      expect(r.source).toContain('constructFromSymbol'); // transitive constant resolved
    }
  });

  it('handles CommonJS `exports.NAME = function` and declines on un-isolatable stdlib deps', () => {
    if (!hasField) return;
    const f = field('express-js/lib/utils.js');
    if (!existsSync(f)) return;
    // compileQueryParser uses node:querystring (stdlib, absent in the vm sandbox) → honest decline.
    const r = sliceJsFunction(readFileSync(f, 'utf8'), 'compileQueryParser', f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/querystring|external module/);
  });
});

describe('verifyRefactor — TS/JS real-file slicing via beforeFile option', () => {
  it('detects a swapped-operand divergence on a date-typed function', async () => {
    if (!hasField) return;
    const f = field('date-fns-typescript/pkgs/core/src/differenceInMilliseconds/index.ts');
    if (!existsSync(f)) return;
    const before = readFileSync(f, 'utf8');
    const after =
      'export function differenceInMilliseconds(laterDate, earlierDate) {\n' +
      '  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n' +
      '  return toMs(earlierDate) - toMs(laterDate);\n}\n'; // swapped → negated result
    const r = await verifyRefactor(before, after, 'typescript', 'differenceInMilliseconds', {
      beforeFile: f,
    });
    expect(r.verdict).toBe('divergence');
    expect(r.mode).toBe('dynamic');
  });

  it('passes a genuinely-equivalent date refactor without false positive', async () => {
    if (!hasField) return;
    const f = field('date-fns-typescript/pkgs/core/src/differenceInMilliseconds/index.ts');
    if (!existsSync(f)) return;
    const before = readFileSync(f, 'utf8');
    const after =
      'export function differenceInMilliseconds(laterDate, earlierDate) {\n' +
      '  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n' +
      '  return toMs(laterDate) - toMs(earlierDate);\n}\n';
    const r = await verifyRefactor(before, after, 'typescript', 'differenceInMilliseconds', {
      beforeFile: f,
    });
    expect(r.verdict).toBe('equivalent');
    expect(r.mode).toBe('dynamic');
  });

  it('reclassifies a one-sided ReferenceError divergence to honest unverified (broken slice)', async () => {
    // `before` references an unbound `MISSING_HELPER`; `after` is self-contained. A naive engine
    // would report divergence (value vs ReferenceError); the guard must downgrade to unverified.
    const before = 'export function f(x) { return MISSING_HELPER(x) + 1; }';
    const after = 'export function f(x) { return x + 1; }';
    const r = await verifyRefactor(before, after, 'javascript', 'f');
    expect(r.verdict).toBe('unverified');
    expect(r.mode).toBe('static-only-advisory');
  });
});

// ── Python slice extraction (interpreter-dependent) ─────────────────────────────

describe('slicePythonFunction — relative-import & constant resolution', () => {
  it('resolves a relative import to a trivial stdlib binding and inlines the target', () => {
    if (!hasField) return;
    const f = field('requests-python/src/requests/_internal_utils.py');
    if (!existsSync(f)) return;
    const r = slicePythonFunction(readFileSync(f, 'utf8'), 'to_native_string', f);
    // Requires a Python interpreter to run the AST slicer; if absent it returns ok:false with a
    // clear reason — which is itself an honest outcome. Only assert the SHAPE here.
    if (r.ok) {
      expect(r.source).toContain('def to_native_string');
      expect(r.source).toContain('builtin_str = str'); // .compat re-export resolved
    } else {
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('declines honestly when the target body uses an un-isolatable module (socket)', () => {
    if (!hasField) return;
    const f = field('requests-python/src/requests/utils.py');
    if (!existsSync(f)) return;
    const r = slicePythonFunction(readFileSync(f, 'utf8'), 'is_ipv4_address', f);
    // is_ipv4_address calls socket.inet_aton — either the slicer declines, or the engine's
    // purity gate declines downstream. Here we assert the slicer does NOT fabricate a clean
    // self-contained slice that hides the socket dependency.
    if (r.ok) {
      // If a slice is produced it MUST still contain the socket use for the purity gate to catch.
      expect(r.source).toMatch(/socket/);
    } else {
      expect(r.reason).toMatch(/socket|external|unresolved|isolate/i);
    }
  });
});

describe('verifyRefactor — Python real-file slicing via beforeFile option', () => {
  it('detects the str-vs-bytes divergence in to_native_string OR honestly declines', async () => {
    if (!hasField) return;
    const f = field('requests-python/src/requests/_internal_utils.py');
    if (!existsSync(f)) return;
    const before = readFileSync(f, 'utf8');
    // BUG: str(bytes) instead of bytes.decode — differs only on bytes input.
    const after =
      "def to_native_string(string, encoding='ascii'):\n" +
      '    if isinstance(string, bytes):\n' +
      '        return str(string)\n' +
      '    return string\n';
    const r = await verifyRefactor(before, after, 'python', 'to_native_string', { beforeFile: f });
    // With a working interpreter this is a real divergence; without one, an honest unverified.
    expect(['divergence', 'unverified']).toContain(r.verdict);
    if (r.verdict === 'divergence') expect(r.mode).toBe('dynamic');
  });

  it('declines socket-dependent targets as unverified (never a fabricated pass)', async () => {
    if (!hasField) return;
    const f = field('requests-python/src/requests/utils.py');
    if (!existsSync(f)) return;
    const before = readFileSync(f, 'utf8');
    const after = before; // identical — must NOT be reported equivalent via a fabricated run
    const r = await verifyRefactor(before, after, 'python', 'is_ipv4_address', { beforeFile: f });
    expect(r.verdict).toBe('unverified');
    expect(r.mode).toBe('static-only-advisory');
  });
});
