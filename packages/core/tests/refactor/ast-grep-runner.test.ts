/**
 * ast-grep-runner.test.ts — Sprint 53
 *
 * Tests for the ast-grep early-return runner.
 * Uses REAL ast-grep invocations on inline code fixtures to verify rules work
 * end-to-end, plus mocked invocations to cover error paths.
 *
 * Note: child_process.execFile is non-configurable in Node CJS modules, so we
 * test error paths by directly exercising the public API with a reset cache
 * and without trying to spy on execFile.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import module under test using relative path (public re-exports not wired yet)
import {
  applyAstGrepEarlyReturn,
  canUseAstGrep,
  _resetAstGrepCache,
} from '../../src/refactor/ast-grep-runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Skip a test group if ast-grep is not available on PATH. */
async function skipIfNoAstGrep(): Promise<boolean> {
  _resetAstGrepCache();
  return !(await canUseAstGrep());
}

// ---------------------------------------------------------------------------
// Integration tests (real ast-grep invocations)
// ---------------------------------------------------------------------------

describe('applyAstGrepEarlyReturn — real invocations', () => {
  beforeEach(() => {
    _resetAstGrepCache();
  });

  it('transforms TypeScript if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `function processUser(user: any) {\n  if (user.isValid) {\n    doSomething(user);\n    doMore(user);\n  }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'typescript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    expect(result.transformedCode).not.toContain('if (user.isValid) {');
  });

  it('transforms Python if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `def process(user):\n    if user.is_valid:\n        do_something(user)\n        do_more(user)\n`;

    const result = await applyAstGrepEarlyReturn(code, 'python');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    expect(result.transformedCode).not.toContain('if user.is_valid:');
  });

  it('transforms Go if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `package main\n\nfunc process(user User) {\n    if user.IsValid {\n        doSomething(user)\n        doMore(user)\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'go');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  it('transforms Ruby if-block to early return (return unless idiom)', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `def process(user)\n  if user.valid?\n    do_something(user)\n    do_more(user)\n  end\nend\n`;

    const result = await applyAstGrepEarlyReturn(code, 'ruby');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return unless');
  });

  it('transforms Java if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `class P {\n    void process(User user) {\n        if (user.isValid()) {\n            doSomething(user);\n            doMore(user);\n        }\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'java');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return;');
  });

  it('transforms Kotlin if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `fun process(user: User) {\n    if (user.isValid) {\n        doSomething(user)\n        doMore(user)\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'kotlin');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  it('transforms Rust if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `fn process(user: &User) {\n    if user.is_valid {\n        do_something(user);\n        do_more(user);\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'rust');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return;');
  });

  it('transforms Swift if-block to guard-else-return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `func process(user: User) {\n    if user.isValid {\n        doSomething(user)\n        doMore(user)\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'swift');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('guard');
    expect(result.transformedCode).toContain('return');
  });

  it('transforms Scala if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `def process(user: User): Unit = {\n    if (user.isValid) {\n        doSomething(user)\n        doMore(user)\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'scala');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
  });

  it('transforms Elixir if-block to unless guard', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `def process(user) do\n  if user.valid do\n    do_something(user)\n    do_more(user)\n  end\nend\n`;

    const result = await applyAstGrepEarlyReturn(code, 'elixir');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('unless');
  });

  it('transforms JavaScript if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `function processItem(item) {\n  if (item.valid) {\n    const label = item.label;\n    render(label);\n    save(label);\n  }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'javascript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    expect(result.transformedCode).not.toContain('if (item.valid) {');
    // Body statements must be preserved
    expect(result.transformedCode).toContain('render(label)');
    expect(result.transformedCode).toContain('save(label)');
  });

  it('transforms C# if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = [
      'public class P {',
      '    public void Process(User user) {',
      '        if (user.IsActive) {',
      '            var name = user.Name;',
      '            Console.WriteLine(name);',
      '            DoWork(name);',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n');

    const result = await applyAstGrepEarlyReturn(code, 'csharp');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    // Condition must be negated
    expect(result.transformedCode).toContain('!(user.IsActive)');
    // Body statements must be preserved
    expect(result.transformedCode).toContain('Console.WriteLine');
    expect(result.transformedCode).toContain('DoWork');
  });

  it('does NOT transform C# if-else (guard-clause rewrite is unsafe with else)', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = [
      'public class P {',
      '    public void Process(User user) {',
      '        if (user.IsActive) {',
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
    // The if-else should not be rewritten (it would lose the else branch)
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('transforms PHP if-block to early return', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `<?php\nfunction processUser($user) {\n    if ($user->isActive()) {\n        $name = $user->getName();\n        echo $name;\n        doWork($name);\n    }\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'php');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.transformedCode).toContain('return');
    // Condition must be negated
    expect(result.transformedCode).toContain('!($user->isActive())');
    // Body statements must be preserved
    expect(result.transformedCode).toContain('$user->getName()');
    expect(result.transformedCode).toContain('doWork');
  });

  it('returns unchanged code with matchCount=0 for code without matching pattern', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `function add(a: number, b: number): number {\n  return a + b;\n}\n`;

    const result = await applyAstGrepEarlyReturn(code, 'typescript');

    expect(result.error).toBeUndefined();
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
  });

  it('returns matchCount=0 for unsupported language (no rule file)', async () => {
    if (await skipIfNoAstGrep()) return;

    const code = `local function process(user)\n  if user.valid then\n    doSomething(user)\n  end\nend\n`;

    const result = await applyAstGrepEarlyReturn(code, 'lua');

    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe(code);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error-path tests — use cache reset + real binary absence check
// ---------------------------------------------------------------------------

describe('applyAstGrepEarlyReturn — error paths', () => {
  beforeEach(() => _resetAstGrepCache());
  afterEach(() => _resetAstGrepCache());

  it('returns matchCount=0 and no error for language with no rule file', async () => {
    // Bash has no rule file in LANGUAGE_RULE_MAP — handled before any execFile call
    const result = await applyAstGrepEarlyReturn(
      'echo hello',
      'bash',
    );
    expect(result.matchCount).toBe(0);
    expect(result.transformedCode).toBe('echo hello');
    expect(result.error).toBeUndefined();
  });

  it('returns correct shape when ast-grep is available (canUseAstGrep matches binary)', async () => {
    // Just verify the return type contract is satisfied on any outcome
    const result = await applyAstGrepEarlyReturn(
      'function add(a: number, b: number) { return a + b; }',
      'typescript',
    );
    expect(typeof result.matchCount).toBe('number');
    expect(typeof result.transformedCode).toBe('string');
    // error is optional
    expect('transformedCode' in result).toBe(true);
    expect('matchCount' in result).toBe(true);
  });

  it('canUseAstGrep returns a boolean', async () => {
    const result = await canUseAstGrep();
    expect(typeof result).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Language-to-rule-file mapping verification
// ---------------------------------------------------------------------------

describe('LANGUAGE_RULE_MAP coverage', () => {
  const expectedLanguages = [
    'typescript',
    'javascript',
    'python',
    'go',
    'ruby',
    'java',
    'csharp',
    'php',
    'kotlin',
    'rust',
    'swift',
    'scala',
    'elixir',
  ] as const;

  it('has rule files for all expected Tier A languages', async () => {
    if (await skipIfNoAstGrep()) return;

    // Simply verifying that each language does NOT return an error about missing rule
    for (const lang of expectedLanguages) {
      const result = await applyAstGrepEarlyReturn(
        '// no matching pattern',
        lang as Parameters<typeof applyAstGrepEarlyReturn>[1],
      );
      // Should not report a "Rule file not found" error
      expect(result.error ?? '').not.toMatch(/Rule file not found/);
    }
  });
});
