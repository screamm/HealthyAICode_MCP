import { calculateScore, categorize } from './scoring/scorer';
import type { HealthResult, Language, MetricBreakdown, Smell } from './types';

/** Maximum lines before a file is flagged as oversized. */
export const LARGE_FILE_THRESHOLD = 10000;
/** Score assigned to files that cannot be parsed by the AST analyzer. */
export const UNPARSEABLE_SCORE = 5.0;

/** Groups file path and language for result-building helpers. */
export interface FileContext {
  filePath: string;
  language: Language;
}

/** Builds a perfect-score result for empty files. */
export function buildEmptyResult(ctx: FileContext): HealthResult {
  return { filePath: ctx.filePath, language: ctx.language, score: 10.0, category: 'green', smells: [], functions: [], metrics: emptyMetrics(0) };
}

/** Builds a result for files that cannot be parsed by the AST analyzer. */
export function buildUnparseableResult(ctx: FileContext, totalLines: number): HealthResult {
  if (totalLines > LARGE_FILE_THRESHOLD) {
    const smell = buildLargeFileSmell(totalLines);
    const score = calculateScore([smell]);
    return { filePath: ctx.filePath, language: ctx.language, score, category: categorize(score), smells: [smell], functions: [], metrics: emptyMetrics(totalLines) };
  }
  return { filePath: ctx.filePath, language: ctx.language, score: UNPARSEABLE_SCORE, category: 'yellow', smells: [], functions: [], metrics: emptyMetrics(totalLines) };
}

/** Appends a LargeFile finding to the list if the file exceeds the line threshold. */
export function appendLargeFileSmellIfNeeded(smells: Smell[], totalLines: number): void {
  if (totalLines > LARGE_FILE_THRESHOLD) smells.push(buildLargeFileSmell(totalLines));
}

/** Builds a perfect-score result for files in unsupported languages. */
export function buildUnsupportedResult(code: string, filePath: string): HealthResult {
  return { filePath, language: 'unsupported', score: 10.0, category: 'green', smells: [], functions: [], metrics: emptyMetrics(code.split('\n').length) };
}

function buildLargeFileSmell(totalLines: number): Smell {
  return { type: 'LargeFile', severity: 'medium', line: 1, description: `File has ${totalLines} lines — analysis may be slow`, suggestion: 'Consider splitting the file into smaller modules.' };
}

/** Returns a zeroed-out MetricBreakdown for stubs, empty files, and unsupported languages. */
export function emptyMetrics(totalLines: number): MetricBreakdown {
  return { cyclomaticComplexity: 0, cognitiveComplexity: 0, maxNestingDepth: 0, avgFunctionLength: 0, maxFunctionLength: 0, avgParameterCount: 0, maxParameterCount: 0, totalLines, duplicationScore: 0 };
}
