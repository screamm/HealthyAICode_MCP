/**
 * ast-grep-runner-regression.test.ts — astgrep-fix
 *
 * Regression tests for the 2 defects fixed in the astgrep-fix sprint:
 *
 * Defect 1 — Windows binary resolution:
 *   execFile('sg', ...) failed on Windows because `sg` is installed as a .cmd
 *   wrapper that Node's execFile cannot spawn without shell:true.  The fix adds
 *   a Windows-aware resolveAstGrepBinary() that probes candidates including the
 *   .cmd form with shell:true.  These tests verify that canUseAstGrep() returns
 *   true (not false) on this machine and that real rewrites succeed end-to-end.
 *
 * Defect 2 — Missing else-guard in rule files:
 *   The pattern `if ($COND) { $$$BODY }` matched if-else statements in all
 *   language rules except C# and Ruby, causing the else branch to be silently
 *   dropped.  The fix adds `not: regex: '\belse\b'` constraints to all affected
 *   rules.  These tests verify (a) bare-if rewrites still succeed, and (b)
 *   if-else statements are correctly left untransformed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAstGrepEarlyReturn,
  canUseAstGrep,
  _resetAstGrepCache,
} from '../../src/refactor/ast-grep-runner';

// ---------------------------------------------------------------------------
// Defect-1 regression: binary resolution (Windows .cmd wrapper)
// ---------------------------------------------------------------------------

describe('Defect-1 regression — binary resolution', () => {
  beforeEach(() => _resetAstGrepCache());

  it('canUseAstGrep() returns true when sg is installed (resolves .cmd on Windows)', async () => {
    // On a machine where ast-grep is installed via npm (Windows or otherwise),
    // this must return true — the old code returned false on Windows because
    // execFile('sg', ...) fails for .cmd wrappers.
    const available = await canUseAstGrep();
    expect(available).toBe(true);
  });

  it('applyAstGrepEarlyReturn produces no error and non-zero matchCount for a bare TypeScript if-block', async () => {
    const available = await canUseAstGrep();
    if (!available) return; // skip on machines where sg truly is absent

    const code = [
      'function processUser(user: any) {',
      '  if (user.isValid) {',
      '    doSomething(user);',
      '    doMore(user);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'typescript');

    // Must NOT fail with the "not available on PATH" error that the Windows bug caused
    expect(result.error).toBeUndefined();
    // Must have found and applied at least one rewrite
    expect(result.matchCount).toBeGreaterThan(0);
    // Code must be different from input
    expect(result.transformedCode).not.toBe(code);
    expect(result.transformedCode).toContain('return');
  });

  it('applyAstGrepEarlyReturn produces no error for JavaScript bare if-block', async () => {
    const available = await canUseAstGrep();
    if (!available) return;

    const code = [
      'function processItem(item) {',
      '  if (item.valid) {',
      '    render(item);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'javascript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });
});

// ---------------------------------------------------------------------------
// Defect-2 regression: else-guard missing from rule files
// ---------------------------------------------------------------------------

/**
 * Languages that previously had the defect (no `not-else` guard):
 * TypeScript, JavaScript, Python, Go, Java, Kotlin, Rust, Swift, Scala, Elixir, PHP.
 * Languages that were already correct: C# (has kind+not-else rule), Ruby (pattern
 * structure naturally excludes the else block).
 */
describe('Defect-2 regression — if-else guard', () => {
  beforeEach(() => _resetAstGrepCache());

  // Helper: skip test if ast-grep unavailable
  async function sgAvailable() {
    return canUseAstGrep();
  }

  // ── TypeScript ─────────────────────────────────────────────────────────────

  it('TypeScript: does NOT rewrite if-else (would silently drop else branch)', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'function f(x: any) {',
      '  if (x.valid) {',
      '    doWork(x);',
      '  } else {',
      '    skip(x);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'typescript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('TypeScript: DOES rewrite bare if-block (regression: still works after guard was added)', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'function f(x: any) {',
      '  if (x.valid) {',
      '    doWork(x);',
      '    doMore(x);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'typescript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    expect(result.transformedCode).not.toContain('if (x.valid)');
  });

  // ── JavaScript ─────────────────────────────────────────────────────────────

  it('JavaScript: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'function f(x) {',
      '  if (x.valid) {',
      '    doWork(x);',
      '  } else {',
      '    skip(x);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'javascript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('JavaScript: DOES rewrite bare if-block', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'function f(x) {',
      '  if (x.valid) {',
      '    doWork(x);',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'javascript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  // ── Python ─────────────────────────────────────────────────────────────────

  it('Python: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'def f(x):',
      '    if x.valid:',
      '        do_work(x)',
      '    else:',
      '        skip(x)',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'python');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('Python: DOES rewrite bare if-block', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'def f(x):',
      '    if x.valid:',
      '        do_work(x)',
      '        do_more(x)',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'python');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  // ── Go ─────────────────────────────────────────────────────────────────────

  it('Go: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'package main',
      '',
      'func f(x X) {',
      '    if x.Valid {',
      '        doWork(x)',
      '    } else {',
      '        skip(x)',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'go');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('Go: DOES rewrite bare if-block', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'package main',
      '',
      'func f(x X) {',
      '    if x.Valid {',
      '        doWork(x)',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'go');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  // ── Java ───────────────────────────────────────────────────────────────────

  it('Java: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'class P {',
      '    void f(User u) {',
      '        if (u.isValid()) {',
      '            doWork(u);',
      '        } else {',
      '            skip(u);',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'java');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('Java: DOES rewrite bare if-block', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'class P {',
      '    void f(User u) {',
      '        if (u.isValid()) {',
      '            doWork(u);',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'java');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return;');
  });

  // ── Kotlin ─────────────────────────────────────────────────────────────────

  it('Kotlin: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'fun f(u: User) {',
      '    if (u.isValid) {',
      '        doWork(u)',
      '    } else {',
      '        skip(u)',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'kotlin');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  // ── Rust ───────────────────────────────────────────────────────────────────

  it('Rust: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'fn f(x: &X) {',
      '    if x.valid {',
      '        do_work(x);',
      '    } else {',
      '        skip(x);',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'rust');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  // ── PHP ────────────────────────────────────────────────────────────────────

  it('PHP: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      '<?php',
      'function f($x) {',
      '    if ($x->isValid()) {',
      '        doWork($x);',
      '    } else {',
      '        skip($x);',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'php');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('PHP: DOES rewrite bare if-block', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      '<?php',
      'function f($x) {',
      '    if ($x->isValid()) {',
      '        doWork($x);',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'php');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  // ── Elixir ─────────────────────────────────────────────────────────────────

  it('Elixir: does NOT rewrite if-else', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'def f(u) do',
      '  if u.valid do',
      '    do_work(u)',
      '  else',
      '    skip(u)',
      '  end',
      'end',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'elixir');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  // ── Languages already correct (C# and Ruby) ────────────────────────────────

  it('C#: still correctly rejects if-else (was already guarded, regression check)', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'public class P {',
      '    public void F(User u) {',
      '        if (u.IsActive) {',
      '            DoWork();',
      '        } else {',
      '            Skip();',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'csharp');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('Ruby: still correctly rejects if-else (was already guarded, regression check)', async () => {
    if (!(await sgAvailable())) return;

    const code = [
      'def f(u)',
      '  if u.valid?',
      '    do_work(u)',
      '  else',
      '    skip(u)',
      '  end',
      'end',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'ruby');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });
});
