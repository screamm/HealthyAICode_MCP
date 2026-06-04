/**
 * Classification of {@link SmellType} members into the two categories the gate
 * treats as *hard-deny on introduction* (independent of the score delta):
 *
 * - **security** — injection, hardcoded secrets, unsafe deserialization, SSRF,
 *   path traversal, crypto misuse, dependency vulnerabilities.
 * - **ai-native / supply-chain** — slopsquatting, hallucinated package imports,
 *   and the SpecDetect4AI LLM-integration smells.
 *
 * These two sets drive the `new_security_smell` / `new_ai_native_smell` reason
 * codes: an edit that *adds* any such smell is denied even when the numeric
 * health delta is neutral or positive, because the score formula alone can mask
 * a single critical supply-chain or injection regression behind unrelated
 * improvements elsewhere in the file.
 *
 * The sets are intentionally explicit (not a substring/prefix heuristic) so the
 * gate's behaviour is auditable and a newly added SmellType defaults to *not*
 * hard-denied until it is deliberately classified here.
 *
 * Why the sets are typed `ReadonlySet<string>` rather than `ReadonlySet<SmellType>`:
 * these are curated allow-lists of smell-type *names*. Some of the names
 * (`SsrfRisk`, `CryptographicMisuseRisk`, `SlopsquattingRisk`, the `Llm*` family,
 * `AiAttributedSATD`) are Sprint 57/58 additions to the core `SmellType` union
 * that may not yet be present in the core build the gate is compiled against
 * during phased integration. Membership testing (`set.has(type)`) where `type`
 * is a `SmellType` is sound against a `Set<string>` regardless, so this typing
 * keeps the gate decoupled from the exact, in-flux contents of the union without
 * weakening any call site — `isSecuritySmell` / `isAiNativeSmell` still accept
 * only a `SmellType`.
 */
import type { SmellType } from '@healthy-ai-code/core';

/** Smell-type names that represent a security weakness (CWE-class findings). */
export const SECURITY_SMELL_TYPES: ReadonlySet<string> = new Set<string>([
  'SqlInjectionRisk',
  'XssRisk',
  'CommandInjectionRisk',
  'HardcodedCredential',
  'HardcodedApiKey',
  'UnsafeDeserialization',
  'PathTraversalRisk',
  'DependencyVulnerability',
  'SsrfRisk',
  'CryptographicMisuseRisk',
]);

/**
 * Smell-type names that represent an AI-native or supply-chain risk specific to
 * LLM-generated code (the differentiating biomarker class for this project).
 */
export const AI_NATIVE_SMELL_TYPES: ReadonlySet<string> = new Set<string>([
  'SlopsquattingRisk',
  'HallucinatedPackageImport',
  'LlmUnboundedCall',
  'LlmUnpinnedModel',
  'LlmNoSystemMessage',
  'LlmNoStructuredOutput',
  'LlmUnsetTemperature',
  'AiAttributedSATD',
]);

/**
 * Smell-type names that are **advisory** — documentation, intent, naming and
 * style findings whose score contribution wiggles with file size rather than
 * with any behaviour or safety change.
 *
 * Why this set exists (false-positive control)
 * --------------------------------------------
 * The gate's `score_regression` rule denies an edit whose health delta drops
 * below the tolerance. Documentation-coverage and style metrics are *ratios* or
 * *file-wide* findings: adding a small, perfectly healthy pure function dilutes
 * the doc-coverage ratio and registers a fresh `LowDocCoverage` (weight 0.3 →
 * −0.3 to the score) **even though the new code introduced no defect**. Treating
 * that as a regression blocks exactly the benign edits (add-helper,
 * extract-variable, extract-local) developers make constantly — the surest way
 * to get the hook switched off "on day one".
 *
 * These types are therefore excluded from the *delta-regression* judgement (see
 * `regressionRelevantSmells`). They are **not** excluded from the absolute
 * `below_floor` check: a file genuinely dragged below the floor — for any reason,
 * including pervasive doc debt — is still surfaced. And they never affect the
 * security / AI-native hard-deny rules, which run on their own dedicated sets.
 *
 * Membership is an explicit, auditable allow-list of *non-structural,
 * non-security, non-supply-chain* findings. Structural-complexity smells
 * (ComplexMethod, DeepNesting, CognitiveComplexity, BrainMethod, GodClass,
 * LargeMethod/LargeFile, DuplicateCode, …) are deliberately NOT advisory: an
 * edit that makes a function materially more complex is a real regression and
 * must still be denied.
 */
export const ADVISORY_SMELL_TYPES: ReadonlySet<string> = new Set<string>([
  'LowDocCoverage',
  'DocumentationDebt',
  'IntentClarity',
  'MagicNumber',
  'StyleInconsistency',
  'LowMaintainability',
  // Non-scored clean-code advisory (weight 0): a function with 2–3 sequential control-flow
  // chunks. Excluded from the regression judgement so that extracting a helper — which can
  // reveal a fresh 2-chunk function — is never denied as a regression.
  'TidyOpportunity',
]);

/** True when the smell type is in the hard-deny security set. */
export function isSecuritySmell(type: SmellType): boolean {
  return SECURITY_SMELL_TYPES.has(type);
}

/** True when the smell type is in the hard-deny AI-native / supply-chain set. */
export function isAiNativeSmell(type: SmellType): boolean {
  return AI_NATIVE_SMELL_TYPES.has(type);
}

/**
 * True when the smell type is advisory (documentation / intent / style). Such
 * smells are excluded from the delta-regression judgement so that adding healthy
 * code is not blocked merely because a doc-coverage or style ratio dipped.
 */
export function isAdvisorySmell(type: SmellType): boolean {
  return ADVISORY_SMELL_TYPES.has(type);
}
