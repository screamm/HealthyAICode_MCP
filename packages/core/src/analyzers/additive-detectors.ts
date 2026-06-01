// packages/core/src/analyzers/additive-detectors.ts
// Sprint 51–60 Phase 2a — wires the additive Sprint 57/58 detectors into the
// per-file analysis pipeline. Each detector emits new SmellTypes that are merged
// into the analyzer's smell list; none of them change the scoring formula
// (they only add weighted findings via the existing SMELL_WEIGHTS table).
//
// This module is invoked from analyzeByLanguage() AFTER the per-language analyzer
// has produced its functions/metrics/smells, so the new smells land in
// parsed.smells exactly like any other language-level smell.

import type { Language, FunctionResult, Smell } from '../types';
import { analyzeLlmIntegration, type LlmLanguage } from './llm-integration';
import { detectHallucinatedImports } from './hallucinated-import';
import { detectComplexityMassConcentration } from './complexity-mass';
import { detectSecuritySinks } from './security-sink-detector';
import { detectExceptionAntiPatterns } from './exception-antipatterns';
import { detectAsyncAntiPatterns } from './async-antipatterns';
import { detectDuplicateCode } from './duplicate-code';
import { detectAiAttributedSATDFromText } from '../smells/ai-attributed-satd';

/** Languages that have a SpecDetect4AI LLM-integration call surface (regex-based). */
const LLM_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['typescript', 'javascript', 'python']);

/** Languages with import semantics + a registry snapshot (slopsquatting check). */
const HALLUCINATION_LANGUAGES: ReadonlySet<Language> = new Set<Language>([
  'typescript',
  'javascript',
  'python',
]);

/** Tier A languages that get exception anti-pattern + security-sink analysis. */
const EXCEPTION_LANGUAGES: ReadonlySet<Language> = new Set<Language>([
  'typescript',
  'javascript',
  'python',
  'java',
  'kotlin',
  'scala',
  'csharp',
  'ruby',
  'php',
]);

/** TS/JS only — DrAsync async anti-patterns. */
const ASYNC_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['typescript', 'javascript']);

/** Tier C / non-source formats where ComplexityMass + duplicate-code are not meaningful. */
const TIER_C: ReadonlySet<Language> = new Set<Language>([
  'yaml',
  'json',
  'dockerfile',
  'hcl',
  'makefile',
  'sql',
  'html',
  'css',
  'markdown',
  'toml',
  'unsupported',
]);

/**
 * Runs all additive (non-formula-changing) Sprint 57/58 detectors for a file and
 * returns the merged Smell[]. Dispatched by language appropriateness.
 *
 * @param code      Raw source string.
 * @param language  Detected language.
 * @param filePath  File path (used for hallucinated-import context).
 * @param functions Per-function results from the language analyzer (for ComplexityMass).
 */
export function runAdditiveDetectors(
  code: string,
  language: Language,
  filePath: string,
  functions: FunctionResult[],
): Smell[] {
  const smells: Smell[] = [];

  // SpecDetect4AI LLM-integration smells (Python/TS/JS).
  if (LLM_LANGUAGES.has(language)) {
    smells.push(...analyzeLlmIntegration(code, language as LlmLanguage, filePath));
  }

  // Hallucinated package imports / slopsquatting (Python/TS/JS; offline-safe no-op if snapshot absent).
  if (HALLUCINATION_LANGUAGES.has(language)) {
    smells.push(...detectHallucinatedImports(code, language, filePath));
  }

  // Security sinks: insecure deserialization, SSRF, crypto misuse (Tier A; detector self-skips Tier C).
  smells.push(...detectSecuritySinks(code, language, filePath));

  // Exception-handling anti-patterns (Tier A languages with exception constructs).
  if (EXCEPTION_LANGUAGES.has(language)) {
    smells.push(...detectExceptionAntiPatterns(code, language));
  }

  // Async / Promise anti-patterns — DrAsync (TS/JS only).
  if (ASYNC_LANGUAGES.has(language)) {
    smells.push(...detectAsyncAntiPatterns(code));
  }

  // Structural Erosion Index — ComplexityMassConcentration (needs ≥3 functions with CC + length).
  if (!TIER_C.has(language)) {
    const massSmell = detectComplexityMassConcentration(functions);
    if (massSmell) smells.push(massSmell);
  }

  // In-file duplicate code (type 1/2). Meaningful for any source language with multi-line blocks.
  if (!TIER_C.has(language)) {
    smells.push(...detectDuplicateCode(code));
  }

  // GenAI-induced self-admitted technical debt (text-based; works for all languages).
  smells.push(...detectAiAttributedSATDFromText(code));

  return smells;
}
