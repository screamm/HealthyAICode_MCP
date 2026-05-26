import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const CRYSTAL_CONFIG: TierBConfig = {
  language: 'crystal',
  functionPatterns: [
    // def name or private def name (method/function definitions)
    /^\s*(?:private\s+|protected\s+)?def\s+(\w+[?!]?)/,
  ],
  // Crystal control-flow keywords that increase cyclomatic complexity
  controlFlowKeywords: /\b(if|unless|elsif|else|case|when|while|loop|until|rescue|ensure|next|break)\b/g,
  commentPrefix: '#',
};

/**
 * Tier B Crystal analyzer.
 *
 * Extracts method definitions using Ruby-style `def name` patterns
 * and measures cyclomatic complexity via control-flow keyword counting.
 * Covers regular, private, and protected methods; methods with ? and ! suffixes.
 *
 * Limitations (Tier B):
 * - Crystal macros and annotations are not tracked as separate functions.
 * - Generic type constraints on methods are not analysed.
 */
export function analyzeCrystal(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, CRYSTAL_CONFIG);
}
