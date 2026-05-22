import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const HASKELL_CONFIG: TierBConfig = {
  language: 'haskell',
  functionPatterns: [
    // Top-level function: name arg1 arg2 = ...  (lowercase start, no leading whitespace)
    /^(\w[\w']*)\s+(?:[A-Za-z_][\w']*\s+)*=/,
  ],
  // if/case guards (| ), where/let/do
  controlFlowKeywords: /\b(if|case|where|let|do)\b|\|\s/g,
  commentPrefix: '--',
};

/**
 * Tier B Haskell analyzer.
 * Extracts top-level function definitions and cyclomatic complexity via regex.
 * Guards (| condition = expr) count as +1 CC each.
 */
export function analyzeHaskell(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, HASKELL_CONFIG);
}
