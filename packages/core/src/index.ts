import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import { detectBrainMethods } from './temporal/brain-method';
import type { HealthResult, Language } from './types';
import { buildEmptyResult, buildUnparseableResult, buildUnsupportedResult, appendLargeFileSmellIfNeeded, type FileContext } from './core-helpers';

/** Re-exports all public types for use by consumers of this package. */
export * from './types';
/** Analyzes code health changes in a git diff. */
export { analyzeChangeset } from './diff';
/** Measures code churn rate relative to file size. */
export { analyzeCodeChurn } from './temporal/code-churn';
/** Detects files that change together frequently. */
export { analyzeTemporalCoupling } from './temporal/temporal-coupling';
/** Detects files modified by too many developers. */
export { analyzeDeveloperCongestion } from './temporal/developer-congestion';
/** Identifies files with single-owner knowledge risk. */
export { analyzeKnowledgeLoss } from './temporal/knowledge-loss';
/** Analyzes overall project code health. */
export { analyzeProject } from './project';
/** Analyzes method-level temporal coupling (X-Ray-light) for a single file. */
export { analyzeMethodCoupling, methodCouplingToSmells } from './temporal/method-coupling';

/** Reads a file from disk, detects language, and returns a HealthResult. Throws if the file cannot be read. */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/** Analyzes a code string directly. filePath is used only as metadata in the result (defaults to '<inline>'). */
export function analyzeCode(code: string, language: Language, filePath = '<inline>'): HealthResult {
  if (language === 'unsupported') return buildUnsupportedResult(code, filePath);
  if (code.trim() === '') return buildEmptyResult({ filePath, language });
  const totalLines = code.split('\n').length;
  const parsed = tryAnalyze(code, { language, filePath });
  if (parsed === null) return buildUnparseableResult({ filePath, language }, totalLines);
  const smells = [...parsed.smells, ...detectSmells(parsed.functions, parsed.metrics), ...detectBrainMethods(parsed.functions, parsed.metrics.cyclomaticComplexity)];
  appendLargeFileSmellIfNeeded(smells, totalLines);
  const score = calculateScore(smells);
  return { filePath, language, score, category: categorize(score), smells, metrics: parsed.metrics, functions: parsed.functions };
}

/** Attempts to parse and analyze the code, returning null if the analyzer throws. */
function tryAnalyze(code: string, ctx: FileContext): ReturnType<typeof analyzeByLanguage> | null {
  try { return analyzeByLanguage(code, ctx.language, ctx.filePath); } catch { return null; }
}
