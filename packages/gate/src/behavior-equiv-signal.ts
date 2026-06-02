/**
 * Optional behaviour-equivalence blocking signal for the delta-gate.
 *
 * The core delta-gate (`evaluateGate`) is intentionally **pure and synchronous**:
 * it scores a proposed file edit's delta and never performs I/O. Dynamic
 * behaviour-equivalence verification is the opposite — it spawns a sandbox /
 * subprocess and is async, and it only covers Python and TS/JS. Wiring it into
 * `evaluateGate` would break that invariant and could not run on the ~44 other
 * languages, so it lives here as a SEPARATE, OPT-IN signal that a caller can
 * combine with the deterministic decision.
 *
 * Contract (honest by construction):
 *   - Returns `block: true` ONLY on a real dynamic `divergence` verdict — i.e. the
 *     refactored file changed observable behaviour for a synthesized input.
 *   - `equivalent` and `unverified` NEVER block. `unverified` covers every
 *     language the dynamic engine cannot handle (and Python/JS edits the engine
 *     could not load), so a genuinely-equivalent refactor in an unsupported
 *     language is never wrongly blocked by this signal.
 *   - Measured detection on the labelled corpus (real run 2026-06-02): 80%
 *     (Python/JS). See docs/benchmarks/behavior-equivalence-results.md. Because
 *     detection is not 100%, this is an ADDITIONAL signal — not a replacement for
 *     the deterministic gate or a language-specific test suite.
 */
import { verifyRefactor } from '@healthy-ai-code/core';
import type { VerifyResult } from '@healthy-ai-code/core';
import type { ProposedEdit } from './evaluate-gate';

/** Languages the dynamic differential-execution engine can verify. */
const DYNAMIC_LANGS = new Set([
  'python',
  'py',
  'typescript',
  'javascript',
  'ts',
  'js',
  'tsx',
  'jsx',
]);

/** Result of the optional behaviour-equivalence check on a proposed edit. */
export interface BehaviorEquivSignal {
  /** True iff the edit changed observable behaviour (dynamic `divergence`). */
  block: boolean;
  /** The underlying verification verdict. */
  verdict: VerifyResult['verdict'];
  /** Verification mode applied (`dynamic` or `static-only-advisory`). */
  mode: VerifyResult['mode'];
  /** Human-readable explanation, suitable for surfacing to the agent. */
  reason: string;
  /** First diverging input (stringified) when `verdict === 'divergence'`. */
  divergingInput?: string;
  /** Whether the dynamic engine was actually attempted for this language. */
  attempted: boolean;
}

/**
 * Run the behaviour-equivalence check on a proposed edit as an ADDITIONAL gate
 * signal. Pure observation: it does not mutate the edit or the deterministic
 * decision — the caller decides how to combine `block` with the gate verdict.
 *
 * @param edit           The proposed whole-file edit (before → after).
 * @param targetFunction Optional function name to compare. Required by the
 *                       Python engine; resolved automatically for TS/JS when
 *                       both sides share a single exported function.
 */
export async function evaluateBehaviorEquivalence(
  edit: ProposedEdit,
  targetFunction?: string,
): Promise<BehaviorEquivSignal> {
  const lang = String(edit.language).trim().toLowerCase().replace(/^\./, '');
  const attempted = DYNAMIC_LANGS.has(lang);

  // No prior version (new file) ⇒ nothing to compare against ⇒ never block.
  const hasBefore = edit.before != null && String(edit.before).trim() !== '';
  if (!attempted || !hasBefore) {
    return {
      block: false,
      verdict: 'unverified',
      mode: 'static-only-advisory',
      attempted,
      reason: !hasBefore
        ? 'No prior file version to compare against; behaviour-equivalence check skipped (not a regression risk).'
        : `Dynamic behaviour-equivalence verification is not available for "${edit.language}"; ` +
          `treated as advisory only (does not block).`,
    };
  }

  const result = await verifyRefactor(
    edit.before as string,
    edit.after,
    edit.language,
    targetFunction,
  );

  return {
    block: result.verdict === 'divergence',
    verdict: result.verdict,
    mode: result.mode,
    reason:
      result.verdict === 'divergence'
        ? `Edit to ${edit.filePath} changed observable behaviour and was flagged. ${result.reason}`
        : result.reason,
    divergingInput: result.divergingInput,
    attempted,
  };
}
