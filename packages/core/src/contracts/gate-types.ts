/**
 * Type-only contract for the deterministic delta-gating hook (Sats 1 —
 * `@healthy-ai-code/gate`). Additive and optional: nothing in the existing
 * pipeline depends on these. Build agents that implement the gate import from
 * this module via a relative path until Integrate re-exports it from
 * `packages/core/src/index.ts`.
 *
 * The gate scores a *proposed* file edit (before it lands) and decides whether
 * to allow it. The decision is on the **delta**, not the absolute score: an edit
 * is denied only when it makes the file worse (drops below the floor or below
 * its own pre-edit score) or introduces a security / LLM-integration smell.
 */
import type { HealthCategory, Smell } from '../types';

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
  /** Edit is allowed; no blocking reason. */
  | 'none';

/**
 * The deterministic decision returned by the gate for a single proposed edit.
 * Serialisable as-is into a Claude Code `PreToolUse` `hookSpecificOutput`
 * payload (structured-JSON deny path) — see Sats 1.
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
  /** Floor used for the `below_floor` check (defaults to PROBLEMATIC_THRESHOLD when unset). */
  floor: number;
}

/** Tunable thresholds for a gate evaluation. All optional with documented defaults. */
export interface GateConfig {
  /**
   * Absolute score below which an edit is denied regardless of delta.
   * Default: PROBLEMATIC_THRESHOLD (6.0).
   */
  floor?: number;
  /**
   * Minimum allowed score delta. An edit with a delta below this is denied as a
   * regression. Default: a small negative tolerance (e.g. -0.05) to absorb
   * scoring noise and avoid false-positive fatigue.
   */
  minDelta?: number;
  /** When true, any new security smell forces `deny`. Default: true. */
  denyOnNewSecuritySmell?: boolean;
  /** When true, any new AI-native / supply-chain smell forces `deny`. Default: true. */
  denyOnNewAiNativeSmell?: boolean;
}

/**
 * Result of the install-time conformance self-test (Sats 1): proves a
 * known-bad edit is actually blocked on the installed gate version.
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
  /** Diagnostic detail when `passed` is false. */
  detail?: string;
}
