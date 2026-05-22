import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const BASH_CONFIG: TierBConfig = {
  language: 'bash',
  functionPatterns: [
    // POSIX: name() { — name can include colons and hyphens
    /^(\w[\w:-]*)\s*\(\s*\)\s*\{/,
    // Bash keyword: function name
    /^\s*function\s+(\w[\w:-]*)/,
  ],
  // if/elif/while/for/until/case plus && and || short-circuit operators
  controlFlowKeywords: /\b(if|elif|while|for|until|case)\b|\s&&\s|\s\|\|\s/g,
  commentPrefix: '#',
};

/**
 * Tier B Bash/Shell analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * No AST parsing — faster but less precise than Tier A.
 */
export function analyzeBash(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, BASH_CONFIG);
}
