import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const DART_CONFIG: TierBConfig = {
  language: 'dart',
  functionPatterns: [
    // Named function: returnType name(
    /^\s*(?:[\w<>\[\]?]+\s+)+(\w+)\s*\(/,
    // Arrow function shorthand: name() =>
    /^\s*(\w+)\s*\(.*\)\s*=>/,
  ],
  // Dart control flow keywords
  controlFlowKeywords: /\b(if|else\s+if|while|for|do|switch|case|catch|when)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B Dart analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * No AST parsing — faster but less precise than Tier A.
 */
export function analyzeDart(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, DART_CONFIG);
}
