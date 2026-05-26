import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const NIM_CONFIG: TierBConfig = {
  language: 'nim',
  functionPatterns: [
    // proc, func, method, iterator, template, macro — all define callables in Nim
    /^\s*(?:proc|func|method|iterator|template|macro)\s+(\w+)/,
  ],
  // Nim control-flow keywords that increase cyclomatic complexity
  controlFlowKeywords: /\b(if|elif|else|for|while|case|try|except|finally|when)\b/g,
  commentPrefix: '#',
};

/**
 * Tier B Nim analyzer.
 *
 * Extracts procedure/function/method definitions and measures cyclomatic
 * complexity via control-flow keyword counting.
 * Covers proc, func, method, iterator, template, and macro declarations.
 *
 * Limitations (Tier B):
 * - Nim's indentation-based scoping makes function-end detection approximate.
 * - Generic parameters (type constraints) are not analysed.
 */
export function analyzeNim(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, NIM_CONFIG);
}
