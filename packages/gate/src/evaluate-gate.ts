/**
 * Deterministic delta-gating evaluation.
 *
 * Given a proposed file edit (the file content `before` and `after`), this
 * decides ALLOW / DENY on the **delta**, not the absolute score:
 *
 *   1. DENY `new_security_smell`   — the edit introduces a security smell.
 *   2. DENY `new_ai_native_smell`  — the edit introduces an AI-native / supply-chain smell.
 *   3. DENY `below_floor`          — the edited file scores below the absolute floor.
 *   4. DENY `score_regression`     — the edit lowers the score by more than the tolerance.
 *   5. ALLOW `none`                — neutral or improving edit.
 *
 * Rules 1–2 are evaluated first because a single injected critical smell can be
 * masked by unrelated score improvements elsewhere in the same edit, so the
 * numeric delta alone is not a sufficient guard for those categories.
 *
 * All scoring is delegated to `@healthy-ai-code/core`'s `analyzeCode` — the gate
 * never re-implements the formula, so it stays in lockstep with the published
 * Open Code Health Score.
 */
import { analyzeCode } from '@healthy-ai-code/core';
import type { Language, Smell } from '@healthy-ai-code/core';
import {
  DEFAULT_FLOOR,
  DEFAULT_MIN_DELTA,
  type GateConfig,
  type GateDecision,
  type GateReasonCode,
} from './gate-types';
import { isAdvisorySmell, isAiNativeSmell, isSecuritySmell } from './smell-classification';
import { collectSecuritySmells } from './security-smells';
import { evaluateBehaviorEquivalence } from './behavior-equiv-signal';
// Deep import: core's index does not re-export the scorer. The gate recomputes a
// file's score from the merged smell set (see below) so the reported score and
// the `below_floor` check account for the security smells `analyzeCode` omits.
import { calculateScore, categorize } from '@healthy-ai-code/core/dist/scoring/scorer';

/** A proposed single-file edit to evaluate. */
export interface ProposedEdit {
  /** Path of the file being edited. Used for language detection and reporting. */
  filePath: string;
  /** File content before the edit. `null`/`undefined` means the file is newly created. */
  before?: string | null;
  /** File content after the proposed edit would be applied. */
  after: string;
  /** Language of the file (caller resolves via `detectLanguage(filePath)`). */
  language: Language;
}

/** Resolved (non-optional) gate configuration. */
interface ResolvedConfig {
  floor: number;
  minDelta: number;
  denyOnNewSecuritySmell: boolean;
  denyOnNewAiNativeSmell: boolean;
}

function resolveConfig(config?: GateConfig): ResolvedConfig {
  return {
    floor: config?.floor ?? DEFAULT_FLOOR,
    minDelta: config?.minDelta ?? DEFAULT_MIN_DELTA,
    denyOnNewSecuritySmell: config?.denyOnNewSecuritySmell ?? true,
    denyOnNewAiNativeSmell: config?.denyOnNewAiNativeSmell ?? true,
  };
}

/**
 * Smells present in `after` but not in `before`. Two smells are considered the
 * "same" when their type and (optional) function name match — mirroring the
 * `diffSmells` semantics used by `analyzeChangeset` in core, so the gate's view
 * of "newly introduced" matches the changeset analyzer's.
 */
export function newlyIntroducedSmells(beforeSmells: Smell[], afterSmells: Smell[]): Smell[] {
  return afterSmells.filter(
    (a) => !beforeSmells.some((b) => b.type === a.type && b.functionName === a.functionName),
  );
}

/**
 * Evaluates a proposed edit and returns a deterministic {@link GateDecision}.
 * Pure and synchronous: same input → same decision, no I/O, no network.
 */
export function evaluateGate(edit: ProposedEdit, config?: GateConfig): GateDecision {
  const cfg = resolveConfig(config);
  const { filePath, language } = edit;

  const hasBefore = edit.before != null && edit.before.trim() !== '';
  const beforeResult = hasBefore ? analyzeCode(edit.before as string, language, filePath) : null;
  const afterResult = analyzeCode(edit.after, language, filePath);

  // `analyzeCode` does NOT run the security / supply-chain detectors, so its
  // `smells` array misses hardcoded secrets, injection sinks and crypto misuse.
  // We collect those separately and merge them in, otherwise an edit that adds a
  // security smell looks identical to a no-op edit and is wrongly allowed. This
  // is the root cause of the false-`allow` the gate's headline guarantee depends
  // on not happening.
  const beforeSecuritySmells = hasBefore
    ? collectSecuritySmells(edit.before as string, language, filePath)
    : [];
  const afterSecuritySmells = collectSecuritySmells(edit.after, language, filePath);

  const beforeSmells = [...(beforeResult ? beforeResult.smells : []), ...beforeSecuritySmells];
  const afterSmells = [...afterResult.smells, ...afterSecuritySmells];
  const newSmells = newlyIntroducedSmells(beforeSmells, afterSmells);

  // Recompute the score from the MERGED smell set so the reported score (and the
  // `below_floor` check) reflect the security smells too. Using core's own
  // `calculateScore` keeps the formula in lockstep with the published Open Code
  // Health Score. When no security smell is present, the merged set equals
  // `analyzeCode`'s set and the score is unchanged.
  const scoreBefore = beforeResult ? calculateScore(beforeSmells, language) : null;
  const scoreAfter = calculateScore(afterSmells, language);
  const categoryAfter = categorize(scoreAfter);
  // For a new file there is no prior score; delta is 0 (judged on floor only).
  const scoreDelta = scoreAfter - (scoreBefore ?? scoreAfter);

  // Regression-relevant delta: the same formula, but over the smell set with
  // advisory (documentation / intent / style) findings removed. The plain
  // `scoreDelta` above dips whenever an edit adds healthy code that dilutes a
  // doc-coverage or style ratio — a `LowDocCoverage` registers and the file
  // loses ~0.3 even though nothing got worse. Judging the regression rule on
  // that raw delta denies benign add-helper / extract-variable edits (measured:
  // a ~10% false-positive rate, the canonical "hook off on day one" trigger).
  // The regression rule below uses this advisory-stripped delta instead, so only
  // a *structural* regression (complexity, nesting, duplication, …) trips it.
  // The reported `scoreDelta`, `scoreBefore`, `scoreAfter`, `below_floor`, and
  // both hard-deny rules are unchanged — only the delta-regression threshold
  // sees the filtered view.
  const stripAdvisory = (s: Smell[]): Smell[] => s.filter((x) => !isAdvisorySmell(x.type));
  const regressionScoreBefore = beforeResult
    ? calculateScore(stripAdvisory(beforeSmells), language)
    : null;
  const regressionScoreAfter = calculateScore(stripAdvisory(afterSmells), language);
  const regressionDelta = regressionScoreAfter - (regressionScoreBefore ?? regressionScoreAfter);

  const decisionBase = {
    filePath,
    scoreBefore,
    scoreAfter,
    scoreDelta,
    categoryAfter,
    newSmells,
    floor: cfg.floor,
  };

  // Rule 1 & 2 — hard-deny on a newly introduced security / AI-native smell,
  // independent of the numeric delta.
  if (cfg.denyOnNewSecuritySmell) {
    const introduced = newSmells.filter((s) => isSecuritySmell(s.type));
    if (introduced.length > 0) {
      return {
        verdict: 'deny',
        reasonCode: 'new_security_smell',
        reason: buildReason('new_security_smell', { ...decisionBase, introduced }),
        ...decisionBase,
      };
    }
  }
  if (cfg.denyOnNewAiNativeSmell) {
    const introduced = newSmells.filter((s) => isAiNativeSmell(s.type));
    if (introduced.length > 0) {
      return {
        verdict: 'deny',
        reasonCode: 'new_ai_native_smell',
        reason: buildReason('new_ai_native_smell', { ...decisionBase, introduced }),
        ...decisionBase,
      };
    }
  }

  // Rule 3 — absolute floor. An edit that leaves the file below the floor is
  // denied even when it is a net improvement (the file is still not safe).
  if (scoreAfter < cfg.floor) {
    return {
      verdict: 'deny',
      reasonCode: 'below_floor',
      reason: buildReason('below_floor', { ...decisionBase, introduced: [] }),
      ...decisionBase,
    };
  }

  // Rule 4 — delta regression (only meaningful when there is a prior version).
  // Judged on the advisory-stripped delta so that adding healthy code that only
  // dilutes a doc-coverage / style ratio is NOT denied (false-positive control).
  if (regressionScoreBefore != null && regressionDelta < cfg.minDelta) {
    // Only the structural (non-advisory) new smells are the cause here; report
    // those, not the advisory ones, so the self-correction message is honest.
    const structuralNewSmells = newSmells.filter((s) => !isAdvisorySmell(s.type));
    return {
      verdict: 'deny',
      reasonCode: 'score_regression',
      reason: buildReason('score_regression', { ...decisionBase, introduced: structuralNewSmells }),
      ...decisionBase,
    };
  }

  // Rule 5 — allow.
  return {
    verdict: 'allow',
    reasonCode: 'none',
    reason: buildReason('none', { ...decisionBase, introduced: [] }),
    ...decisionBase,
  };
}

interface ReasonContext {
  filePath: string;
  scoreBefore: number | null;
  scoreAfter: number;
  scoreDelta: number;
  floor: number;
  introduced: Smell[];
}

/** Builds a self-correction-oriented, human-readable explanation for the agent. */
function buildReason(code: GateReasonCode, ctx: ReasonContext): string {
  const before = ctx.scoreBefore == null ? 'new file' : ctx.scoreBefore.toFixed(2);
  const after = ctx.scoreAfter.toFixed(2);
  const smellList = (smells: Smell[]): string =>
    smells
      .map((s) => `${s.type}${s.functionName ? ` (${s.functionName})` : ''}: ${s.suggestion}`)
      .join('; ');

  switch (code) {
    case 'new_security_smell':
      return (
        `Edit to ${ctx.filePath} introduces a new security issue and was blocked. ` +
        `Fix before retrying: ${smellList(ctx.introduced)}`
      );
    case 'new_ai_native_smell':
      return (
        `Edit to ${ctx.filePath} introduces a new AI-native / supply-chain risk and was blocked. ` +
        `This often means a hallucinated or typosquatted dependency, an unpinned model, or an ` +
        `unbounded LLM call. Fix before retrying: ${smellList(ctx.introduced)}`
      );
    case 'below_floor':
      return (
        `Edit to ${ctx.filePath} leaves the file at health ${after}/10, below the floor of ` +
        `${ctx.floor.toFixed(2)}. Simplify the changed code (reduce complexity / nesting / size) ` +
        `until it clears the floor before retrying.`
      );
    case 'score_regression':
      return (
        `Edit to ${ctx.filePath} lowers health from ${before} to ${after} ` +
        `(${ctx.scoreDelta.toFixed(2)}). ` +
        (ctx.introduced.length > 0
          ? `New issues introduced: ${smellList(ctx.introduced)}. `
          : '') +
        `Refactor so the edit does not make the file worse, then retry.`
      );
    case 'none':
      return `Edit to ${ctx.filePath} is allowed (health ${before} → ${after}).`;
    case 'behaviour_divergence':
      // This case is handled by evaluateGateWithBehaviorEquiv, not buildReason,
      // but the exhaustiveness guard requires it here.
      return `Edit to ${ctx.filePath} changed observable behaviour and was blocked.`;
    default:
      // Exhaustiveness guard.
      return `Edit to ${ctx.filePath} evaluated.`;
  }
}

/**
 * Extended gate evaluation that adds an **async** behaviour-equivalence signal
 * on top of the synchronous {@link evaluateGate} decision.
 *
 * Contract (honest by construction):
 * - DENY `behaviour_divergence` — the dynamic engine confirmed the edit changed
 *   observable behaviour for a synthesized input (Python / TS / JS only).
 * - WARN (advisory) on `unverified` — the engine could not verify (unsupported
 *   language, file with imports, new file). The gate does NOT block; the
 *   advisory message is appended to the allow/deny reason from the base gate.
 * - `equivalent` — no additional effect; the deterministic decision stands.
 *
 * The synchronous {@link evaluateGate} result is ALWAYS evaluated first. If it
 * already denies (security, floor, regression), the behaviour-equiv check runs
 * in parallel and the deny verdict is not upgraded — the first denial stands.
 * If the base gate allows AND the behaviour-equiv check returns `divergence`,
 * the combined result is `deny / behaviour_divergence`.
 *
 * @param edit            The proposed whole-file edit (before → after).
 * @param config          Optional gate thresholds (same as {@link evaluateGate}).
 * @param targetFunction  Optional function name hint for the Python/TS engine.
 */
export async function evaluateGateWithBehaviorEquiv(
  edit: ProposedEdit,
  config?: GateConfig,
  targetFunction?: string,
): Promise<GateDecision> {
  // Run the synchronous gate and the async behaviour-equiv signal in parallel.
  const [baseDecision, behaviorSignal] = await Promise.all([
    Promise.resolve(evaluateGate(edit, config)),
    evaluateBehaviorEquivalence(edit, targetFunction),
  ]);

  // If the behaviour-equiv engine detected a divergence AND the base gate
  // allowed the edit, upgrade to deny.
  if (behaviorSignal.block && baseDecision.verdict === 'allow') {
    const divergingInputClause = behaviorSignal.divergingInput
      ? ` Diverging input: ${behaviorSignal.divergingInput}.`
      : '';
    return {
      ...baseDecision,
      verdict: 'deny',
      reasonCode: 'behaviour_divergence',
      reason:
        `Edit to ${edit.filePath} changed observable behaviour and was blocked. ` +
        behaviorSignal.reason +
        divergingInputClause,
    };
  }

  // If unverified (advisory), append a warning to the reason but do NOT change
  // the verdict. This is the honest contract: "we couldn't verify, so we don't
  // claim safety nor falsely block."
  if (behaviorSignal.verdict === 'unverified' && behaviorSignal.attempted) {
    return {
      ...baseDecision,
      reason:
        baseDecision.reason +
        ` [behaviour-equiv advisory: ${behaviorSignal.reason}]`,
    };
  }

  // equivalent or language not attempted — deterministic decision stands unchanged.
  return baseDecision;
}
