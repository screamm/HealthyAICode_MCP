import { analyzeStructuralTierC } from './structural-tier-c';

/**
 * Tier C YAML analyzer.
 * Returns file-level structural metrics: totalLines, LargeFile smell, SATD.
 * No function-level analysis — YAML files have no functions.
 */
export function analyzeYaml(code: string, filePath = '<inline>') {
  return analyzeStructuralTierC(code, filePath);
}
