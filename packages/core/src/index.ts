import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import type { HealthResult, Language, MetricBreakdown } from './types';

// Re-export all types so consumers import from one place
export * from './types';

export { analyzeChangeset } from './diff';

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
  if (language === 'unsupported') {
    return buildUnsupportedResult(code, filePath);
  }

  // Edge case: empty or whitespace-only input — nothing to analyse
  if (code.trim() === '') {
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

  // Count lines before parsing — used both for LargeFile detection and the catch fallback
  const linesForLargeFileCheck = code.split('\n').length;

  let functions: ReturnType<typeof analyzeByLanguage>['functions'];
  let metrics: ReturnType<typeof analyzeByLanguage>['metrics'];

  try {
    ({ functions, metrics } = analyzeByLanguage(code, language));
  } catch {
    // Edge case: unparseable code — a file with syntax errors should not receive a perfect score,
    // so we return 5.0 / yellow rather than 10.0 / green.
    if (linesForLargeFileCheck > 10000) {
      // Very large file caused the parser to fail — surface the LargeFile smell so callers know why
      const largeFileSmell: import('./types').Smell = {
        type: 'LargeFile',
        severity: 'medium',
        line: 1,
        description: `Fil har ${linesForLargeFileCheck} rader — analys kan vara långsam`,
        suggestion: 'Överväg att dela upp filen i mindre moduler.',
      };
      const score = calculateScore([largeFileSmell]);
      const category = categorize(score);
      return {
        filePath,
        language,
        score,
        category,
        smells: [largeFileSmell],
        functions: [],
        metrics: emptyMetrics(linesForLargeFileCheck),
      };
    }
    return {
      filePath,
      language,
      score: 5.0,
      category: 'yellow',
      smells: [],
      functions: [],
      metrics: emptyMetrics(linesForLargeFileCheck),
    };
  }

  const smells = detectSmells(functions, metrics);

  // Append LargeFile smell for successfully-parsed large files so full analysis is still run
  if (linesForLargeFileCheck > 10000) {
    smells.push({
      type: 'LargeFile',
      severity: 'medium',
      line: 1,
      description: `Fil har ${linesForLargeFileCheck} rader — analys kan vara långsam`,
      suggestion: 'Överväg att dela upp filen i mindre moduler.',
    });
  }

  const score = calculateScore(smells);
  const category = categorize(score);
  return { filePath, language, score, category, smells, metrics, functions };
}

// ---- Helpers ----

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

