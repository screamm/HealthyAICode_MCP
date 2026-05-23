import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const PERL_CONFIG: TierBConfig = {
  language: 'perl',
  functionPatterns: [
    // sub functionName {
    /^\s*sub\s+(\w+)\s*(?:\{|$)/,
  ],
  // if, for, foreach, while, unless, until
  controlFlowKeywords: /\b(if|elsif|for|foreach|while|unless|until)\b/g,
  commentPrefix: '#',
};

/**
 * Tier B Perl analyzer.
 * Extracts subroutine definitions and cyclomatic complexity via regex.
 */
export function analyzePerl(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, PERL_CONFIG);
}
