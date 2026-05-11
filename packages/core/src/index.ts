import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import { detectBrainMethods } from './temporal/brain-method';
import type { HealthResult, Language, MetricBreakdown, Smell } from './types';

// Re-export all types so consumers import from one place
export * from './types';

export { analyzeChangeset } from './diff';
export { analyzeCodeChurn } from './temporal/code-churn';
export { analyzeTemporalCoupling } from './temporal/temporal-coupling';
export { analyzeDeveloperCongestion } from './temporal/developer-congestion';
export { analyzeKnowledgeLoss } from './temporal/knowledge-loss';
export { analyzeProject } from './project';

const LARGE_FILE_THRESHOLD = 10000;
const UNPARSEABLE_SCORE = 5.0;

/** Reads a file from disk, detects language, and returns a HealthResult. Throws if the file cannot be read. */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/** Analyzes a code string directly. filePath is used only as metadata in the result (defaults to '<inline>'). */
export function analyzeCode(
  code: string,
  language: Language,
  filePath = '<inline>',
): HealthResult {
  if (language === 'unsupported') return buildUnsupportedResult(code, filePath);
  if (code.trim() === '') return buildEmptyResult(filePath, language);

  const totalLines = code.split('\n').length;
  const parsed = tryAnalyze(code, language, filePath);

  if (parsed === null) {
    return buildUnparseableResult(filePath, language, totalLines);
  }

  const smells = [
    ...parsed.smells,
    ...detectSmells(parsed.functions, parsed.metrics),
    ...detectBrainMethods(parsed.functions, parsed.metrics.cyclomaticComplexity),
  ];
  appendLargeFileSmellIfNeeded(smells, totalLines);

  const score = calculateScore(smells);
  return {
    filePath,
    language,
    score,
    category: categorize(score),
    smells,
    metrics: parsed.metrics,
    functions: parsed.functions,
  };
}

function tryAnalyze(code: string, language: Language, filePath: string): ReturnType<typeof analyzeByLanguage> | null {
  try {
    return analyzeByLanguage(code, language, filePath);
  } catch {
    return null;
  }
}

function buildEmptyResult(filePath: string, language: Language): HealthResult {
  return {
    filePath,
    language,
    score: 10.0,
    category: 'green',
    smells: [],
    functions: [],
    metrics: emptyMetrics(0),
  };
}

function buildUnparseableResult(
  filePath: string,
  language: Language,
  totalLines: number,
): HealthResult {
  // Unparseable code should not earn a perfect score; large files surface LargeFile so callers know why.
  if (totalLines > LARGE_FILE_THRESHOLD) {
    const smell = buildLargeFileSmell(totalLines);
    const score = calculateScore([smell]);
    return {
      filePath,
      language,
      score,
      category: categorize(score),
      smells: [smell],
      functions: [],
      metrics: emptyMetrics(totalLines),
    };
  }
  return {
    filePath,
    language,
    score: UNPARSEABLE_SCORE,
    category: 'yellow',
    smells: [],
    functions: [],
    metrics: emptyMetrics(totalLines),
  };
}

function appendLargeFileSmellIfNeeded(smells: Smell[], totalLines: number): void {
  if (totalLines > LARGE_FILE_THRESHOLD) {
    smells.push(buildLargeFileSmell(totalLines));
  }
}

function buildLargeFileSmell(totalLines: number): Smell {
  return {
    type: 'LargeFile',
    severity: 'medium',
    line: 1,
    description: `Fil har ${totalLines} rader — analys kan vara långsam`,
    suggestion: 'Överväg att dela upp filen i mindre moduler.',
  };
}

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 0, // not computed; placeholder for stub/unsupported results
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
