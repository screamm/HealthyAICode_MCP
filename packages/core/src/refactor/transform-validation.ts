/**
 * transform-validation.ts — Sprint 51-60
 *
 * Language-neutral guard that rejects a mechanical refactor output which does not
 * re-parse cleanly in its OWN language. This is the fix for the invalid-Java bug:
 * a TS-shaped code template applied to a Java/Python/Go file produces syntactically
 * invalid source that {@link analyzeCode} can no longer parse. Such output must NEVER
 * be returned to the loop — instead the smell is marked as requiring manual/LLM action.
 *
 * The check is intentionally cheap and metric-based rather than full re-compilation:
 *   - For Tier A (tree-sitter) languages an unparseable file yields `functions: []`.
 *     If the original had functions and the transformed output extracts none, the
 *     transform corrupted the syntax → reject.
 *   - A transform must also not *lose* functions (a corrupted brace structure typically
 *     collapses N functions to 0 or 1). We require the function count to be
 *     non-decreasing for a valid behaviour-preserving structural transform, since every
 *     transform here either keeps the function set or ADDS extracted helpers.
 */

import { analyzeCode } from '../index';
import type { Language } from '../types';

/** Languages whose mechanical templates emit JS/TS-shaped syntax in this codebase. */
const TS_SHAPED_LANGUAGES: ReadonlySet<Language> = new Set<Language>([
  'typescript',
  'javascript',
]);

/**
 * Returns true when the synchronous template-based transforms (which emit
 * `function name(...) {}`, `interface {}`, `const { … } = params;`) are syntactically
 * valid for `language`. Only TS/JS share that surface syntax closely enough to apply
 * a template blindly. Every other language must go through a real AST transformer
 * (rope / gopls / ast-grep) or be deferred to manual/LLM action.
 */
export function templatesMatchLanguage(language: Language): boolean {
  return TS_SHAPED_LANGUAGES.has(language);
}

/** Outcome of {@link validateTransform}. */
export interface TransformValidation {
  /** True when the transformed code is safe to return to the loop. */
  valid: boolean;
  /** Human-readable reason when `valid` is false. */
  reason?: string;
}

/**
 * Validates that `transformedCode` re-parses cleanly in `language` relative to `originalCode`.
 *
 * Rejection conditions (any one fails the transform):
 *  1. The transformed code is empty / whitespace-only while the original was not.
 *  2. The original parsed to ≥ 1 function but the transform parses to 0 functions
 *     (a classic sign the templates corrupted the syntax — the invalid-Java case).
 *  3. The transform LOST functions (count decreased): a behaviour-preserving structural
 *     refactor in this pipeline only keeps or adds functions, never removes them.
 *
 * A no-op transform (`transformedCode === originalCode`) is reported as valid — the
 * caller is responsible for treating "no change" as non-progress separately.
 */
export function validateTransform(
  originalCode: string,
  transformedCode: string,
  language: Language,
): TransformValidation {
  if (transformedCode === originalCode) {
    return { valid: true };
  }
  if (originalCode.trim().length > 0 && transformedCode.trim().length === 0) {
    return { valid: false, reason: 'transform produced empty output' };
  }

  const before = analyzeCode(originalCode, language);
  const after = analyzeCode(transformedCode, language);

  const beforeFns = before.functions.length;
  const afterFns = after.functions.length;

  // The original had structure but the transform parses to nothing → corrupted syntax.
  if (beforeFns >= 1 && afterFns === 0) {
    return {
      valid: false,
      reason: `transform corrupted syntax: ${beforeFns} function(s) before, 0 after re-parse in ${language}`,
    };
  }

  // A behaviour-preserving structural transform never removes functions.
  if (afterFns < beforeFns) {
    return {
      valid: false,
      reason: `transform lost functions (${beforeFns} → ${afterFns}) — likely invalid output in ${language}`,
    };
  }

  return { valid: true };
}
