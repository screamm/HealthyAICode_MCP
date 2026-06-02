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

import { sliceJsFunction } from './js-slice';
import { slicePythonFunction } from './python-slice';

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

  /**
   * Transparency: when the engine had to extract a self-contained function slice
   * from a real dependency-laden file (relative imports / local helpers inlined),
   * this lists the inlined provenance (e.g. `["toDate ← ../toDate/index.ts"]`).
   * Absent when no slicing was needed or when slicing was not attempted.
   */
  sliced?: readonly string[];
}

/**
 * Optional inputs to {@link verifyRefactor} for REAL dependency-laden files.
 *
 * When a file path is supplied the engine first attempts FUNCTION-SLICE EXTRACTION:
 * it pulls the target function plus the transitive closure of the local helpers /
 * constants / pure relative-import sibling exports it needs into a self-contained
 * unit, then runs the dynamic differential engine on that unit. If the target
 * genuinely depends on un-isolatable external state (third-party module, network/IO,
 * un-resolvable import), slicing declines and the result stays an honest `unverified`
 * advisory — NO fabricated pass is produced.
 */
export interface VerifyRefactorOptions {
  /** On-disk path of the module the `before` source was read from (resolves relative imports). */
  beforeFile?: string;
  /** On-disk path of the module the `after` source was read from (resolves relative imports). */
  afterFile?: string;
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

/**
 * Cheap heuristic: does this Python source contain module-level imports? When it does, the
 * source is likely a real dependency-laden file rather than a self-contained snippet, so we
 * attempt function-slice extraction even without an explicit file path (relative imports then
 * decline honestly). Self-contained snippets (no imports) skip slicing entirely.
 */
function hasPyImports(source: string): boolean {
  return /(?:^|\n)\s*(?:import\s+\w|from\s+[.\w])/.test(source);
}

/** Cheap heuristic: does this TS/JS source contain ES/CJS value-imports? (See {@link hasPyImports}.) */
function hasJsImports(source: string): boolean {
  return (
    /(?:^|\n)\s*import\s+(?!type\b)[^;]*?\bfrom\s+['"]/.test(source) ||
    /\brequire\s*\(\s*['"]/.test(source)
  );
}

/**
 * Error names that signal an UNBOUND-NAME / load failure rather than a legitimate runtime
 * throw. When a divergence is caused by ONE side raising such an error while the other returns
 * a value, the cause is almost always a broken isolation (a free name that exists only in the
 * original module, or an unresolved import) — NOT a behaviour-preserving violation in the
 * refactor. Reporting it as `divergence` would be a false positive, so the dispatcher
 * reclassifies it to an honest `unverified`.
 */
const UNBOUND_ERROR_NAMES = new Set([
  'NameError',
  'ReferenceError',
  'ImportError',
  'ModuleNotFoundError',
]);

interface OneSidedError {
  /** true when exactly one side raised an unbound-name error and the other did not. */
  readonly broken: boolean;
  /** the offending error name, when broken. */
  readonly error?: string;
}

/** Inspect a Python diverging input for a one-sided unbound-name error. */
function pyOneSidedUnbound(div: {
  before: { outcome: string; error?: string };
  after: { outcome: string; error?: string };
}): OneSidedError {
  const b = div.before;
  const a = div.after;
  const bErr = b.outcome === 'error' && b.error ? b.error : null;
  const aErr = a.outcome === 'error' && a.error ? a.error : null;
  // Broken when exactly one side raised an unbound-name error.
  if (bErr && UNBOUND_ERROR_NAMES.has(bErr) && !(aErr && UNBOUND_ERROR_NAMES.has(aErr))) {
    return { broken: true, error: bErr };
  }
  if (aErr && UNBOUND_ERROR_NAMES.has(aErr) && !(bErr && UNBOUND_ERROR_NAMES.has(bErr))) {
    return { broken: true, error: aErr };
  }
  return { broken: false };
}

/** Inspect a JS diverging input for a one-sided unbound-name throw. */
function jsOneSidedUnbound(div: {
  before: { kind: string; value: unknown };
  after: { kind: string; value: unknown };
}): OneSidedError {
  const bThrow = div.before.kind === 'throw' ? String(div.before.value) : null;
  const aThrow = div.after.kind === 'throw' ? String(div.after.value) : null;
  if (bThrow && UNBOUND_ERROR_NAMES.has(bThrow) && !(aThrow && UNBOUND_ERROR_NAMES.has(aThrow))) {
    return { broken: true, error: bThrow };
  }
  if (aThrow && UNBOUND_ERROR_NAMES.has(aThrow) && !(bThrow && UNBOUND_ERROR_NAMES.has(bThrow))) {
    return { broken: true, error: aThrow };
  }
  return { broken: false };
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
  options: VerifyRefactorOptions = {},
): Promise<VerifyResult> {
  const lang = normalise(language);

  // ── Python ────────────────────────────────────────────────────────────────
  if (PYTHON_LANGS.has(lang)) {
    // targetFunction is required by the Python engine.  Fall back to a
    // sentinel name that will produce an "unverified" verdict from the engine
    // if no hint is provided (rather than crashing).
    const target = targetFunction ?? '__unknown__';

    // FUNCTION-SLICE EXTRACTION (real dependency-laden files). When a file path is
    // given, attempt to isolate the target into a self-contained unit so the dynamic
    // engine can run; if it cannot be isolated honestly, surface that as `unverified`.
    const sliceProvenance: string[] = [];
    let beforeSrc = before;
    let afterSrc = after;
    if (options.beforeFile || hasPyImports(before)) {
      const s = slicePythonFunction(before, target, options.beforeFile ?? null);
      if (!s.ok) {
        return {
          verdict: 'unverified',
          mode: 'static-only-advisory',
          reason: `cannot isolate target for dynamic verification — ${s.reason}`,
        };
      }
      beforeSrc = s.source;
      sliceProvenance.push(...s.inlined);
    }
    if (options.afterFile || hasPyImports(after)) {
      const s = slicePythonFunction(after, target, options.afterFile ?? null);
      if (s.ok) afterSrc = s.source;
      // If the AFTER cannot be sliced we keep it as-is: the after is usually the inline
      // refactor candidate. A genuine load error will surface from the engine honestly.
    }

    const res = await verifyPythonEquivalence(beforeSrc, afterSrc, target);

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

    // BROKEN-SLICE GUARD: a divergence caused by a one-sided unbound-name error (NameError
    // etc.) is an isolation artefact, not a refactoring violation. Reclassify honestly.
    if (verdict === 'divergence' && res.divergingInput) {
      const probe = pyOneSidedUnbound(res.divergingInput as {
        before: { outcome: string; error?: string };
        after: { outcome: string; error?: string };
      });
      if (probe.broken) {
        return {
          verdict: 'unverified',
          mode: 'static-only-advisory',
          reason:
            `cannot isolate target for dynamic verification — one side raised ${probe.error} ` +
            `(an unbound name / unresolved import), so the comparison reflects broken isolation, ` +
            `not a behaviour difference. Reported as advisory only.`,
          sliced: sliceProvenance.length > 0 ? sliceProvenance : undefined,
        };
      }
    }

    const result: VerifyResult = {
      verdict,
      mode: verdict === 'unverified' ? 'static-only-advisory' : 'dynamic',
      inputsTested: res.checked > 0 ? res.checked : undefined,
      reason: res.detail,
    };
    if (sliceProvenance.length > 0) result.sliced = sliceProvenance;

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
    // FUNCTION-SLICE EXTRACTION (real dependency-laden files): isolate the target into a
    // self-contained module the vm sandbox can load (no module resolver), or decline honestly.
    const sliceProvenance: string[] = [];
    let beforeSrc = before;
    let afterSrc = after;
    const jsTarget = targetFunction;
    if (jsTarget && (options.beforeFile || hasJsImports(before))) {
      const s = sliceJsFunction(before, jsTarget, options.beforeFile ?? null);
      if (!s.ok) {
        return {
          verdict: 'unverified',
          mode: 'static-only-advisory',
          reason: `cannot isolate target for dynamic verification — ${s.reason}`,
        };
      }
      beforeSrc = s.source;
      sliceProvenance.push(...s.inlined);
    }
    if (jsTarget && (options.afterFile || hasJsImports(after))) {
      const s = sliceJsFunction(after, jsTarget, options.afterFile ?? null);
      if (s.ok) afterSrc = s.source;
    }

    const res = checkJsEquivalence(beforeSrc, afterSrc, {
      beforeFnName: targetFunction,
      afterFnName: targetFunction,
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

    // BROKEN-SLICE GUARD: a divergence caused by a one-sided ReferenceError (unbound name /
    // unresolved import) is an isolation artefact, not a refactoring violation.
    if (verdict === 'divergence' && res.divergingInput) {
      const probe = jsOneSidedUnbound(res.divergingInput as {
        before: { kind: string; value: unknown };
        after: { kind: string; value: unknown };
      });
      if (probe.broken) {
        return {
          verdict: 'unverified',
          mode: 'static-only-advisory',
          reason:
            `cannot isolate target for dynamic verification — one side threw ${probe.error} ` +
            `(an unbound name / unresolved import), so the comparison reflects broken isolation, ` +
            `not a behaviour difference. Reported as advisory only.`,
          sliced: sliceProvenance.length > 0 ? sliceProvenance : undefined,
        };
      }
    }

    const result: VerifyResult = {
      verdict,
      mode: verdict === 'unverified' ? 'static-only-advisory' : 'dynamic',
      inputsTested: res.checked > 0 ? res.checked : undefined,
      reason: res.detail,
    };
    if (sliceProvenance.length > 0) result.sliced = sliceProvenance;

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
