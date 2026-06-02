/**
 * Tests for the optional behaviour-equivalence gate signal.
 *
 * Verifies the honesty contract:
 *   - A real divergent refactoring (TS/JS) → block: true.
 *   - A genuinely-equivalent refactoring (TS/JS) → block: false.
 *   - An unsupported language → block: false (advisory, never wrongly denies).
 *   - A new file (no `before`) → block: false (nothing to compare against).
 *
 * These use TS/JS so the test does not depend on a Python interpreter being
 * present in the gate package's test environment.
 */
import { describe, it, expect } from 'vitest';
import { evaluateBehaviorEquivalence } from '../src/behavior-equiv-signal';
import type { ProposedEdit } from '../src/evaluate-gate';

function edit(before: string | null, after: string, language: string): ProposedEdit {
  // language is cast loosely; the signal lower-cases and normalises it itself.
  return { filePath: `f.${language}`, before, after, language: language as ProposedEdit['language'] };
}

describe('evaluateBehaviorEquivalence — TS/JS dynamic signal', () => {
  it('blocks a refactoring that changed observable behaviour', async () => {
    const before = `export function before(a) { return a + 1; }`;
    const after = `export function after(a) { return a - 1; }`;
    const sig = await evaluateBehaviorEquivalence(edit(before, after, 'typescript'));
    expect(sig.attempted).toBe(true);
    expect(sig.verdict).toBe('divergence');
    expect(sig.block).toBe(true);
    expect(sig.mode).toBe('dynamic');
    expect(sig.divergingInput).toBeDefined();
  });

  it('does NOT block a genuinely-equivalent refactoring (pure rename)', async () => {
    const before = `export function before(a, b) { return a + b; }`;
    const after = `export function after(a, b) { const r = a + b; return r; }`;
    const sig = await evaluateBehaviorEquivalence(edit(before, after, 'javascript'));
    expect(sig.attempted).toBe(true);
    expect(sig.verdict).toBe('equivalent');
    expect(sig.block).toBe(false);
    expect(sig.mode).toBe('dynamic');
  });
});

describe('evaluateBehaviorEquivalence — never wrongly blocks', () => {
  it('does NOT block an unsupported language (advisory only)', async () => {
    const before = `fn before(a: i32) -> i32 { a + 1 }`;
    const after = `fn after(a: i32) -> i32 { a - 1 }`;
    const sig = await evaluateBehaviorEquivalence(edit(before, after, 'rust'));
    expect(sig.attempted).toBe(false);
    expect(sig.block).toBe(false);
    expect(sig.verdict).toBe('unverified');
    expect(sig.mode).toBe('static-only-advisory');
  });

  it('does NOT block a newly created file (no prior version)', async () => {
    const after = `export function after(a) { return a - 1; }`;
    const sig = await evaluateBehaviorEquivalence(edit(null, after, 'typescript'));
    expect(sig.block).toBe(false);
    expect(sig.verdict).toBe('unverified');
    expect(sig.reason).toMatch(/no prior file version/i);
  });

  it('does NOT block when the before content is blank', async () => {
    const after = `export function after(a) { return a - 1; }`;
    const sig = await evaluateBehaviorEquivalence(edit('   ', after, 'typescript'));
    expect(sig.block).toBe(false);
  });
});
