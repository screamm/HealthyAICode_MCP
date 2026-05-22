import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const R_CONFIG: TierBConfig = {
  language: 'r',
  functionPatterns: [
    // Arrow assignment: name <- function(
    /^(\w+)\s*<-\s*function\s*\(/,
    // Equals assignment: name = function(
    /^(\w+)\s*=\s*function\s*\(/,
  ],
  // if/else/for/while/repeat/switch
  controlFlowKeywords: /\b(if|else|for|while|repeat|switch)\b/g,
  commentPrefix: '#',
};

/**
 * Tier B R analyzer.
 * Extracts function definitions (arrow and equals assignment) and cyclomatic complexity via regex.
 * Common in data science codebases.
 */
export function analyzeR(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, R_CONFIG);
}
