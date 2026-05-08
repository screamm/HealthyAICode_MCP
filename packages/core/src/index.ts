import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeTypeScript } from './analyzers/typescript';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import type { HealthResult, Language, ChangesetResult, MetricBreakdown } from './types';

// Re-export all types so consumers import from one place
export * from './types';

/**
 * Analysera en fil på disk. Kastar om filen inte kan läsas.
 */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/**
 * Analysera en kodsträng direkt.
 * @param filePath - Används bara för metadata i resultatet, default '<inline>'.
 */
export function analyzeCode(
  code: string,
  language: Language,
  filePath = '<inline>',
): HealthResult {
  if (language === 'unsupported') {
    return buildUnsupportedResult(code, filePath);
  }

  if (language === 'typescript' || language === 'javascript') {
    const { functions, metrics } = analyzeTypeScript(code);
    const smells = detectSmells(functions, metrics);
    const score = calculateScore(smells);
    const category = categorize(score);
    return { filePath, language, score, category, smells, metrics, functions };
  }

  // Python, Java, Kotlin, C# — stub until Sprint 2
  return buildStubResult(code, language, filePath);
}

/**
 * Analysera git-diff mot basgren.
 * Stub — implementeras i Sprint 2.
 */
export async function analyzeChangeset(
  _repoPath: string,
  _baseBranch: string,
): Promise<ChangesetResult> {
  return {
    filesAnalyzed: 0,
    regressions: [],
    improvements: [],
    newUnhealthyFiles: [],
    overallSafe: true,
  };
}

// ---- Helpers ----

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}

function buildUnsupportedResult(code: string, filePath: string): HealthResult {
  return {
    filePath,
    language: 'unsupported',
    score: 10.0,
    category: 'green',
    smells: [],
    functions: [],
    metrics: emptyMetrics(code.split('\n').length),
  };
}

function buildStubResult(code: string, language: Language, filePath: string): HealthResult {
  const totalLines = code.split('\n').length;
  return {
    filePath,
    language,
    score: 10.0,
    category: 'green',
    smells: [],
    functions: [],
    metrics: emptyMetrics(totalLines),
  };
}
