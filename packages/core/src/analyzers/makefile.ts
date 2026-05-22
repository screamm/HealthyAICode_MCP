import { analyzeStructuralTierC } from './structural-tier-c';

/**
 * Tier C Makefile analyzer.
 * Returns file-level structural metrics: totalLines, LargeFile smell, SATD.
 * Makefile syntax is complex (phony targets, pattern rules) — Sprint 25
 * treats Makefiles as plain text without target-level analysis.
 */
export function analyzeMakefile(code: string, filePath = '<inline>') {
  return analyzeStructuralTierC(code, filePath);
}
