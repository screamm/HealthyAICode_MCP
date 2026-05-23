import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const SCALA_CONFIG: TierBConfig = {
  language: 'scala',
  functionPatterns: [
    // def name(  or  def name[T](
    /^\s*def\s+(\w+)\s*[\[(]/,
    // Single-line def without parens: def name: Type = ...
    /^\s*def\s+(\w+)\s*:/,
  ],
  // Scala control flow keywords
  controlFlowKeywords: /\b(if|else\s+if|while|for|match|case|catch|yield)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B Scala analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * No AST parsing — faster but less precise than Tier A.
 */
export function analyzeScala(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, SCALA_CONFIG);
}
