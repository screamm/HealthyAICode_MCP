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

/** True when the smell type is in the hard-deny security set. */
export function isSecuritySmell(type: SmellType): boolean {
  return SECURITY_SMELL_TYPES.has(type);
}

/** True when the smell type is in the hard-deny AI-native / supply-chain set. */
export function isAiNativeSmell(type: SmellType): boolean {
  return AI_NATIVE_SMELL_TYPES.has(type);
}
