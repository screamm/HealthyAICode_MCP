import { analyzeStructuralTierC } from './structural-tier-c';

/**
 * Tier C JSON analyzer.
 * Returns file-level structural metrics: totalLines, LargeFile smell.
 * Note: JSON does not support comments so SATD detection yields no results.
 * File is named json-lang.ts to avoid collision with the built-in `json` module name.
 */
export function analyzeJson(code: string, filePath = '<inline>') {
  return analyzeStructuralTierC(code, filePath);
}
