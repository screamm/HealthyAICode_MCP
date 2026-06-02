/**
 * Unified behavior-equivalence verification API.
 *
 * Dispatches to language-specific dynamic differential-execution engines for
 * Python and TypeScript/JavaScript (proven GO in the spike, 100 % detection /
 * 0 % FP on the labelled corpus, 2026-06-01).
 *
 * For ALL other languages the API returns an honest `unverified` advisory result
 * rather than pretending to verify something it cannot. Java additionally gets an
 * optional RefactoringMiner structural-equivalence check, surfaced separately in
 * `staticNote`.
 *
 * See: scripts/spikes/behavior-equiv/README.md for spike evidence.
 * See: claudedocs/2026-06-01-win-by-margin.md for strategy context.
 *
 * HONESTY CONTRACT (non-negotiable):
 *   - Never return `verdict:'equivalent'` or `verdict:'divergence'` for a language
 *     this module cannot dynamically verify.
 *   - `mode:'static-only-advisory'` is not a downgrade — it is the correct honest
 *     answer for ~44 of the 46 supported languages.
 */

import {
  verifyPythonEquivalence,
} from './python-equiv';

import {
  checkJsEquivalence,
} from './js-equiv';

// ── Shared result type ─────────────────────────────────────────────────────────

/**
 * Verdict of a behavior-equivalence check.
 *
 * - `'equivalent'`  – dynamic differential execution found no divergence across
 *                     all synthesized inputs (Python / TS/JS only).
 * - `'divergence'`  – at least one synthesized input produced different output
 *                     between `before` and `after` (Python / TS/JS only).
 * - `'unverified'`  – dynamic verification is not available for this language;
 *                     a structural advisory note may still be present.
 */
export type Verdict = 'equivalent' | 'divergence' | 'unverified';

/**
 * Verification mode, surfaced for transparency.
 *
 * - `'dynamic'`              – full differential-execution (Python or TS/JS).
 * - `'static-only-advisory'` – no dynamic engine; structural check only (advisory).
 */
export type VerifyMode = 'dynamic' | 'static-only-advisory';

/** Result returned by {@link verifyRefactor}. */
export interface VerifyResult {
  /** Equivalence verdict (see type docs above). */
  verdict: Verdict;

  /** Verification mode applied. */
  mode: VerifyMode;

  /**
   * For `'dynamic'` mode: number of distinct synthesized inputs tested.
   * `undefined` for `'static-only-advisory'`.
   */
  inputsTested?: number;

  /**
   * First diverging input (stringified) when `verdict === 'divergence'`.
   * `undefined` otherwise.
   */
  divergingInput?: string;

  /**
   * Human-readable explanation — always present.
   * For `'unverified'` results this explains WHICH engine would be needed.
   */
  reason: string;

  /**
   * Optional structural advisory note from RefactoringMiner (Java only, when
   * the tool is available). Never used to upgrade `verdict` from `'unverified'`.
   */
  staticNote?: string;
}

// ── Language normalisation ─────────────────────────────────────────────────────

/** Languages handled by the Python differential-execution engine. */
const PYTHON_LANGS = new Set(['python', 'py']);

/** Languages handled by the TypeScript/JavaScript differential-execution engine. */
const JS_LANGS = new Set(['typescript', 'javascript', 'ts', 'js', 'tsx', 'jsx']);

/** Normalise a caller-supplied language tag to lower-case and strip leading dots. */
function normalise(language: string): string {
  return language.trim().toLowerCase().replace(/^\./, '');
}

// ── Java structural advisory (RefactoringMiner) ────────────────────────────────

async function tryRefactoringMinerNote(
  before: string,
  after: string,
): Promise<string | undefined> {
  try {
    const { canUseRefactoringMiner, verifyRefactoringBetweenFileVersions } =
      await import('../refactoring-miner-oracle');

    if (!(await canUseRefactoringMiner())) {
      return 'RefactoringMiner unavailable (set HEALTHY_AI_REFACTORING_MINER or fetch per docs/refactoring-miner-oracle.md)';
    }

    // Attempt a generic structural check. We pass an empty expectedType so the
    // oracle reports what RefactoringMiner detected rather than failing on a mismatch.
    // Callers needing precise class-path resolution should call
    // verifyRefactoringBetweenCommits directly.
    const result = await verifyRefactoringBetweenFileVersions(
      before,
      after,
      'src/Refactored.java',
      '',
    );

    if (result.detected.length === 0) {
      return 'RefactoringMiner: no structural refactoring patterns detected between before/after.';
    }
    const types = result.detected.map((d) => d.type).join(', ');
    return (
      `RefactoringMiner detected: ${types}.` +
      (result.unexpectedChanges ? ' (additional structural changes present)' : '')
    );
  } catch {
    return undefined;
  }
}

// ── Advisory fallback (all unsupported languages) ─────────────────────────────

function advisoryResult(language: string): VerifyResult {
  return {
    verdict: 'unverified',
    mode: 'static-only-advisory',
    reason:
      `Dynamic behavior-equivalence verification is not available for language ` +
      `"${language}". Only Python and TypeScript/JavaScript are supported by the ` +
      `differential-execution engine (spike-proven, 2026-06-01). ` +
      `For "${language}" a manual review or a language-specific test suite is required. ` +
      `Do NOT interpret this result as evidence of equivalence or divergence.`,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Verify that `after` is behaviorally equivalent to `before` for the given
 * `language`.
 *
 * - **Python / TS / JS** — delegates to a dynamic differential-execution engine
 *   (2 000 synthesized inputs, frozen nondeterminism). Returns `'equivalent'`
 *   or `'divergence'`.
 * - **Java** — returns `'unverified'` with an optional RefactoringMiner
 *   structural note in `staticNote` (advisory only; does NOT prove equivalence).
 * - **All other languages** — returns `'unverified'` with an honest explanation.
 *
 * @param before         Source code of the function/file before refactoring.
 * @param after          Source code of the function/file after refactoring.
 * @param language       Language identifier (e.g. "python", "typescript", "rust").
 * @param targetFunction Optional: name of the specific function to focus on.
 *                       Required for the Python engine; ignored for TS/JS
 *                       (which uses the function name embedded in the source).
 *                       Ignored for advisory-mode languages.
 */
export async function verifyRefactor(
  before: string,
  after: string,
  language: string,
  targetFunction?: string,
): Promise<VerifyResult> {
  const lang = normalise(language);

  // ── Python ────────────────────────────────────────────────────────────────
  if (PYTHON_LANGS.has(lang)) {
    // targetFunction is required by the Python engine.  Fall back to a
    // sentinel name that will produce an "unverified" verdict from the engine
    // if no hint is provided (rather than crashing).
    const target = targetFunction ?? '__unknown__';
    const res = await verifyPythonEquivalence(before, after, target);

    // Map Python engine verdict → unified Verdict.
    // Python engine: 'pass' | 'divergence' | 'unverified'
    let verdict: Verdict;
    if (res.verdict === 'pass') {
      verdict = 'equivalent';
    } else if (res.verdict === 'divergence') {
      verdict = 'divergence';
    } else {
      verdict = 'unverified';
    }

    const result: VerifyResult = {
      verdict,
      mode: verdict === 'unverified' ? 'static-only-advisory' : 'dynamic',
      inputsTested: res.checked > 0 ? res.checked : undefined,
      reason: res.detail,
    };

    if (verdict === 'divergence' && res.divergingInput !== undefined) {
      try {
        result.divergingInput = JSON.stringify(res.divergingInput);
      } catch {
        result.divergingInput = String(res.divergingInput);
      }
    }

    return result;
  }

  // ── TypeScript / JavaScript ────────────────────────────────────────────────
  if (JS_LANGS.has(lang)) {
    const res = checkJsEquivalence(before, after, {
      beforeFnName: targetFunction,
    });

    // Map JS engine verdict → unified Verdict.
    // JS engine: 'equivalent' | 'divergent' | 'unverified'
    let verdict: Verdict;
    if (res.verdict === 'equivalent') {
      verdict = 'equivalent';
    } else if (res.verdict === 'divergent') {
      verdict = 'divergence';
    } else {
      verdict = 'unverified';
    }

    const result: VerifyResult = {
      verdict,
      mode: verdict === 'unverified' ? 'static-only-advisory' : 'dynamic',
      inputsTested: res.checked > 0 ? res.checked : undefined,
      reason: res.detail,
    };

    if (verdict === 'divergence' && res.divergingInput !== undefined) {
      try {
        result.divergingInput = JSON.stringify(res.divergingInput);
      } catch {
        result.divergingInput = String(res.divergingInput);
      }
    }

    return result;
  }

  // ── Java — advisory + optional RefactoringMiner structural note ───────────
  if (lang === 'java') {
    const base = advisoryResult(language);
    const staticNote = await tryRefactoringMinerNote(before, after);
    return { ...base, staticNote };
  }

  // ── All other languages — honest advisory ─────────────────────────────────
  return advisoryResult(language);
}
