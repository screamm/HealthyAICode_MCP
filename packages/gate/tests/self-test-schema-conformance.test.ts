/**
 * Conformance tests for the hardened install-time self-test.
 *
 * The acceptance bar for the gate-harden task is that the self-test asserts a
 * known-bad edit is BLOCKED across >= 2 Claude Code hook-schema shapes/versions
 * — using structured permissionDecision JSON, not exit codes — with a graceful
 * PostToolUse fallback. These tests prove exactly that, by inspecting the
 * serialised hook output (the JSON the harness reads), not merely the gate
 * verdict.
 *
 * Schema shapes covered (verified against current contracts, 2026-06):
 *   1. Modern Claude Code / VS Code Copilot PreToolUse:
 *        hookSpecificOutput.permissionDecision === "deny"
 *   2. Legacy Claude Code PreToolUse (still accepted, e.g. v2.0.76):
 *        top-level decision === "block"
 *   3. PostToolUse graceful fallback (block could not be enforced pre-edit):
 *        top-level decision === "block"
 */
import { describe, it, expect } from 'vitest';
import { runGateSelfTest, KNOWN_BAD_EDIT } from '../src/self-test';
import { evaluateGate } from '../src/evaluate-gate';
import {
  toPreToolUseHookOutput,
  toLegacyPreToolUseHookOutput,
  toPostToolUseHookOutput,
} from '../src/claude-code-contract';

describe('self-test: multi-schema-shape conformance', () => {
  it('passes only when the known-bad edit is blocked in EVERY schema shape', () => {
    const result = runGateSelfTest('claude-code', '2.0.99');
    expect(result.passed).toBe(true);
    expect(result.harnessVersion).toBe('2.0.99');
    expect(result.detail).toBeUndefined();
    // At least two distinct PRE-edit schema shapes plus the PostToolUse fallback.
    expect(result.schemaConformance.length).toBeGreaterThanOrEqual(3);
    expect(result.schemaConformance.every((c) => c.blocked)).toBe(true);
  });

  it('covers the modern PreToolUse permissionDecision shape with value "deny"', () => {
    const result = runGateSelfTest();
    const modern = result.schemaConformance.find(
      (c) => c.shape === 'preToolUse.permissionDecision',
    );
    expect(modern).toBeDefined();
    expect(modern!.blocked).toBe(true);
    expect(modern!.observedValue).toBe('deny');
    expect(modern!.field).toBe('hookSpecificOutput.permissionDecision');
  });

  it('covers the legacy PreToolUse top-level decision shape with value "block"', () => {
    const result = runGateSelfTest();
    const legacy = result.schemaConformance.find(
      (c) => c.shape === 'preToolUse.legacyDecision',
    );
    expect(legacy).toBeDefined();
    expect(legacy!.blocked).toBe(true);
    expect(legacy!.observedValue).toBe('block');
    expect(legacy!.field).toBe('decision');
  });

  it('covers the PostToolUse graceful fallback shape with value "block"', () => {
    const result = runGateSelfTest();
    const post = result.schemaConformance.find((c) => c.shape === 'postToolUse.decision');
    expect(post).toBeDefined();
    expect(post!.blocked).toBe(true);
    expect(post!.observedValue).toBe('block');
  });

  it('proves at least two DISTINCT pre-edit schema shapes block (not just one)', () => {
    const result = runGateSelfTest();
    const preEditShapes = result.schemaConformance.filter(
      (c) => c.shape.startsWith('preToolUse.') && c.blocked,
    );
    expect(preEditShapes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('self-test: serialised hook output really encodes a block (no exit codes)', () => {
  const decision = evaluateGate(KNOWN_BAD_EDIT);

  it('modern PreToolUse JSON has permissionDecision "deny" + a reason', () => {
    const out = toPreToolUseHookOutput(decision);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
    // The block is carried in JSON, not via process exit code.
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('legacy PreToolUse JSON has decision "block" + a reason', () => {
    const out = toLegacyPreToolUseHookOutput(decision);
    expect(out.decision).toBe('block');
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('PostToolUse fallback JSON has decision "block" + a corrective reason', () => {
    const out = toPostToolUseHookOutput(decision);
    expect(out.decision).toBe('block');
    expect(out.reason.length).toBeGreaterThan(0);
    // The fallback message explains the edit already landed (post-edit coaching).
    expect(out.reason).toContain('could not be enforced');
  });
});

describe('self-test: graceful fallback for an ALLOW decision', () => {
  it('an allowed edit does NOT block in any shape (no over-blocking)', () => {
    const allowDecision = evaluateGate({
      ...KNOWN_BAD_EDIT,
      after: KNOWN_BAD_EDIT.before as string, // before == healthy file → allow
    });
    expect(allowDecision.verdict).toBe('allow');
    expect(toPreToolUseHookOutput(allowDecision).hookSpecificOutput.permissionDecision).toBe('allow');
    expect(toLegacyPreToolUseHookOutput(allowDecision).decision).toBe('approve');
    expect(toPostToolUseHookOutput(allowDecision).decision).toBeUndefined();
  });
});
