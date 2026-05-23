import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const C_CONFIG: TierBConfig = {
  language: 'c',
  functionPatterns: [
    // C function definition: return_type name(
    // Matches lines like: int add(int a, int b) {
    /^\s*(?:(?:static|extern|inline|const)\s+)*[\w*]+\s+(\w+)\s*\([^)]*\)\s*\{?/,
  ],
  // C control flow keywords
  controlFlowKeywords: /\b(if|else\s+if|while|for|do|switch|case|goto)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B C language analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * No AST parsing — faster but less precise than Tier A.
 */
export function analyzeCLang(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, C_CONFIG);
}
