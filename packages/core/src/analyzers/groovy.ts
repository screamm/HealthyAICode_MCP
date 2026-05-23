import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const GROOVY_CONFIG: TierBConfig = {
  language: 'groovy',
  functionPatterns: [
    // def methodName( — Groovy dynamic method definitions
    /^\s*def\s+(\w+)\s*\(/,
    // Optional access modifier + return type + methodName(
    /^\s*(?:public|private|protected|static|final|synchronized)(?:\s+(?:public|private|protected|static|final|synchronized))*\s+(?:[\w<>[\]]+\s+)+(\w+)\s*\(/,
  ],
  // if, for, while, switch, catch
  controlFlowKeywords: /\b(if|for|while|switch|catch)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B Groovy analyzer.
 * Extracts method definitions and cyclomatic complexity via regex.
 */
export function analyzeGroovy(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, GROOVY_CONFIG);
}
