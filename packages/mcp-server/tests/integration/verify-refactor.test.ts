/**
 * Integration tests for the code_health_verify_refactor MCP tool.
 *
 * Verifies the tool returns:
 *   - a dynamic `divergence` verdict (blocking) for a real semantic change (TS/JS),
 *   - a dynamic `equivalent` verdict (non-blocking) for a pure rename,
 *   - an honest `unverified` static-only advisory (non-blocking) for an
 *     unsupported language — never claiming equivalence it cannot prove.
 */
import { describe, it, expect } from 'vitest';
import { handleVerifyRefactor } from '../../src/tools/verify-refactor';

function parse(res: Awaited<ReturnType<typeof handleVerifyRefactor>>) {
  return res.structuredContent as Record<string, unknown>;
}

describe('code_health_verify_refactor — TS/JS dynamic verdicts', () => {
  it('flags a real divergence as blocking', async () => {
    const res = await handleVerifyRefactor({
      before: `export function before(a) { return a + 1; }`,
      after: `export function after(a) { return a - 1; }`,
      language: 'typescript',
    });
    const out = parse(res);
    expect(out['verdict']).toBe('divergence');
    expect(out['mode']).toBe('dynamic');
    expect(out['blocking']).toBe(true);
    expect(String(out['recommendation'])).toMatch(/BLOCK/);
    expect(out['divergingInput']).toBeDefined();
  });

  it('returns equivalent (non-blocking) for a pure rename', async () => {
    const res = await handleVerifyRefactor({
      before: `export function before(a, b) { return a + b; }`,
      after: `export function after(a, b) { const r = a + b; return r; }`,
      language: 'javascript',
    });
    const out = parse(res);
    expect(out['verdict']).toBe('equivalent');
    expect(out['mode']).toBe('dynamic');
    expect(out['blocking']).toBe(false);
    expect(String(out['recommendation'])).toMatch(/PASS/);
  });
});

describe('code_health_verify_refactor — honest advisory for unsupported languages', () => {
  it('returns unverified + non-blocking for Rust (does not overclaim)', async () => {
    const res = await handleVerifyRefactor({
      before: `fn f(a: i32) -> i32 { a + 1 }`,
      after: `fn f(a: i32) -> i32 { a - 1 }`,
      language: 'rust',
    });
    const out = parse(res);
    expect(out['verdict']).toBe('unverified');
    expect(out['mode']).toBe('static-only-advisory');
    expect(out['blocking']).toBe(false);
    expect(String(out['recommendation'])).toMatch(/UNVERIFIED/);
  });
});
