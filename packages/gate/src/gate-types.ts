/**
 * Gate decision contract.
 *
 * These types are kept **structurally identical** to the canonical type-only
 * contract that Foundation declared in
 * `packages/core/src/contracts/gate-types.ts`. They are re-declared here so the
 * `@healthy-ai-code/gate` package is self-contained and does not depend on a
 * deep, currently-unpublished core path. Once Integrate re-exports the contract
 * from `@healthy-ai-code/core` (per the impl contract, §3b), this file can be
 * replaced by a re-export from core with no change to consumers.
 */
import type { HealthCategory, Smell } from '@healthy-ai-code/core';

/** What the gate decided to do with a proposed edit. */
export type GateVerdict = 'allow' | 'deny' | 'warn';

/**
 * Reason category for a non-allow verdict. Used to drive the self-correction
 * message handed back to the agent and to bucket false-positive analysis.
 */
export type GateReasonCode =
  /** Edit drops the file below the absolute health floor. */
  | 'below_floor'
  /** Edit lowers the score relative to the pre-edit version (delta regression). */
  | 'score_regression'
  /** Edit introduces a new security smell (injection, hardcoded secret, etc.). */
  | 'new_security_smell'
  /** Edit introduces a new LLM-integration or supply-chain smell (incl. SlopsquattingRisk). */
  | 'new_ai_native_smell'
  /**
   * Dynamic behavior-equivalence check found that the edit changed observable
   * behaviour for a synthesized input (Python / TS/JS only). This is the ONLY
   * reason code emitted by `evaluateGateWithBehaviorEquiv` and not by the
   * synchronous `evaluateGate`.
   */
  | 'behaviour_divergence'
  /** Edit is allowed; no blocking reason. */
  | 'none';

/**
 * The deterministic decision returned by the gate for a single proposed edit.
 * Serialisable as-is into a Claude Code `PreToolUse` `hookSpecificOutput`
 * payload (structured-JSON deny path).
 */
export interface GateDecision {
  verdict: GateVerdict;
  reasonCode: GateReasonCode;
  /** Human-readable, self-correction-oriented explanation for the agent. */
  reason: string;
  filePath: string;
  /** Score of the file before the proposed edit (null when the file is new). */
  scoreBefore: number | null;
  /** Score of the file as it would be after the proposed edit. */
  scoreAfter: number;
  /** scoreAfter - (scoreBefore ?? scoreAfter); negative = regression. */
  scoreDelta: number;
  categoryAfter: HealthCategory;
  /** Smells newly introduced by the edit (present in `after` but not `before`). */
  newSmells: Smell[];
  /** Floor used for the `below_floor` check. */
  floor: number;
}

/** Tunable thresholds for a gate evaluation. All optional with documented defaults. */
export interface GateConfig {
  /**
   * Absolute score below which an edit is denied regardless of delta.
   * Default: {@link DEFAULT_FLOOR} (6.0 — PROBLEMATIC_THRESHOLD).
   */
  floor?: number;
  /**
   * Minimum allowed score delta. An edit with a delta below this is denied as a
   * regression. Default: {@link DEFAULT_MIN_DELTA} (a small negative tolerance
   * to absorb scoring noise and avoid false-positive fatigue).
   */
  minDelta?: number;
  /** When true, any new security smell forces `deny`. Default: true. */
  denyOnNewSecuritySmell?: boolean;
  /** When true, any new AI-native / supply-chain smell forces `deny`. Default: true. */
  denyOnNewAiNativeSmell?: boolean;
}

/**
 * Identifies one concrete hook-output schema shape that the conformance
 * self-test proves a known-bad edit is blocked under.
 */
export type GateHookSchemaShape =
  /** Modern Claude Code / VS Code Copilot: `hookSpecificOutput.permissionDecision: "deny"`. */
  | 'preToolUse.permissionDecision'
  /** Legacy Claude Code PreToolUse: top-level `decision: "block"`. */
  | 'preToolUse.legacyDecision'
  /** Graceful fallback when a pre-edit block cannot be enforced: PostToolUse `decision: "block"`. */
  | 'postToolUse.decision';

/**
 * Per-schema-shape conformance result: does the serialised hook output for THIS
 * shape actually encode a block for the known-bad edit?
 */
export interface GateSchemaConformance {
  shape: GateHookSchemaShape;
  /** Whether the serialised output for this shape encodes a block. */
  blocked: boolean;
  /** The field path inspected (e.g. "hookSpecificOutput.permissionDecision"). */
  field: string;
  /** The value observed at that field (e.g. "deny", "block"). */
  observedValue: string;
  /** The value required for a block (e.g. "deny", "block"). */
  expectedValue: string;
}

/**
 * Result of the install-time conformance self-test: proves a known-bad edit is
 * actually **blocked** on the installed gate version — not just that the gate's
 * verdict is `deny`, but that the JSON the harness reads encodes a block — and
 * that this holds across more than one hook-output schema shape (so a single
 * Claude Code / Copilot schema change cannot silently turn the gate off).
 */
export interface GateSelfTestResult {
  passed: boolean;
  /** Harness/adapter the self-test ran against (e.g. "claude-code"). */
  harness: string;
  /** Version string of the harness/adapter, when detectable. */
  harnessVersion?: string;
  /** The verdict the gate produced for the known-bad fixture edit. */
  observedVerdict: GateVerdict;
  /** The verdict the self-test expected (always 'deny' for the known-bad fixture). */
  expectedVerdict: GateVerdict;
  /**
   * Per-schema-shape conformance: the self-test asserts the known-bad edit is
   * blocked under EVERY shape here. `passed` is true only when the verdict is
   * `deny` AND every entry's `blocked` is true.
   */
  schemaConformance: GateSchemaConformance[];
  /** Diagnostic detail when `passed` is false. */
  detail?: string;
}

/** Default absolute floor — PROBLEMATIC_THRESHOLD (6.0). Below this an edit is denied regardless of delta. */
export const DEFAULT_FLOOR = 6.0;

/**
 * Default minimum allowed score delta. Small negative tolerance so that
 * scoring noise (e.g. ±0.05 from a cosmetic change) does not trigger a
 * false-positive deny — the core driver of "hook turned off on day one".
 */
export const DEFAULT_MIN_DELTA = -0.05;
