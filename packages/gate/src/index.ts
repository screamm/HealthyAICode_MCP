/**
 * `@healthy-ai-code/gate` — the deterministic delta-gating hook.
 *
 * Scores a *proposed* file edit before it lands and decides ALLOW / DENY / WARN
 * on the **delta**, not the absolute score. Denies only when the edit lowers a
 * file below the floor, regresses the score beyond tolerance, or introduces a
 * security / AI-native (incl. SlopsquattingRisk) smell. Emits the Claude Code
 * `PreToolUse` structured-JSON deny contract, with a graceful `PostToolUse`
 * coaching fallback when a block cannot be enforced.
 */

/** Core evaluation. */
export { evaluateGate, newlyIntroducedSmells } from './evaluate-gate';
export type { ProposedEdit } from './evaluate-gate';

/**
 * Optional behaviour-equivalence signal (async, Python/TS/JS only). An ADDITIONAL
 * blocking signal a caller can combine with the deterministic `evaluateGate`
 * decision; blocks ONLY on a real dynamic `divergence`. Never blocks on
 * `unverified`/`equivalent`, so unsupported-language edits are never wrongly
 * denied. Measured detection 80% (see docs/benchmarks/behavior-equivalence-results.md).
 */
export { evaluateBehaviorEquivalence } from './behavior-equiv-signal';
export type { BehaviorEquivSignal } from './behavior-equiv-signal';

/** Gate decision contract (structurally identical to core's contracts/gate-types). */
export {
  DEFAULT_FLOOR,
  DEFAULT_MIN_DELTA,
} from './gate-types';
export type {
  GateVerdict,
  GateReasonCode,
  GateDecision,
  GateConfig,
  GateSelfTestResult,
  GateHookSchemaShape,
  GateSchemaConformance,
} from './gate-types';

/** Smell classification used by the hard-deny and false-positive-control rules. */
export {
  SECURITY_SMELL_TYPES,
  AI_NATIVE_SMELL_TYPES,
  ADVISORY_SMELL_TYPES,
  isSecuritySmell,
  isAiNativeSmell,
  isAdvisorySmell,
} from './smell-classification';

/** Claude Code hook output contract (modern + legacy PreToolUse, PostToolUse fallback). */
export {
  toPreToolUseHookOutput,
  toLegacyPreToolUseHookOutput,
  toPostToolUseHookOutput,
} from './claude-code-contract';
export type {
  PreToolUseHookOutput,
  LegacyPreToolUseHookOutput,
  PostToolUseHookOutput,
} from './claude-code-contract';

/** Hook input adapter (parse Claude Code stdin payload → decision + outputs). */
export {
  extractEdit,
  evaluateHookInput,
  allowPassthrough,
} from './hook-runner';
export type { ClaudeCodeHookInput, HookEvaluation } from './hook-runner';

/** Install-time conformance self-test. */
export {
  runGateSelfTest,
  KNOWN_BAD_EDIT,
  SELF_TEST_HEALTHY_BEFORE,
  SELF_TEST_BAD_AFTER,
} from './self-test';

/**
 * Cursor adapter — advisory post-edit assessment.
 *
 * Cursor does not expose a pre-edit hook that can veto a file write before it
 * lands. This adapter maps the gate decision to the best available Cursor
 * mechanism: an afterFileEdit hook that warns the agent and a rules file that
 * asks the agent to call the gate MCP tool before editing.
 *
 * Enforcement level: advisory (not enforced). See getCursorAdapterMetadata()
 * for the full limitation note.
 */
export {
  handleAfterFileEditHook,
  mapDecisionToHookOutput,
  writeCursorRulesFile,
  buildCursorHooksEntry,
  getCursorAdapterMetadata,
  CURSOR_RULES_RELATIVE_PATH,
  ADAPTER_NAME as CURSOR_ADAPTER_NAME,
  ENFORCEMENT_LEVEL as CURSOR_ENFORCEMENT_LEVEL,
} from './adapters/cursor';

export type {
  CursorAfterFileEditPayload,
  CursorEdit,
  CursorHookOutput,
  CursorAdapterMetadata,
  WriteCursorRulesFileOptions,
  HandleAfterFileEditHookOptions,
} from './adapters/cursor';
