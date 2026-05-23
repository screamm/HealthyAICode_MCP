import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const OBJC_CONFIG: TierBConfig = {
  language: 'objc',
  functionPatterns: [
    // Instance method: - (returnType)methodName or - (returnType)methodName:param
    /^\s*-\s*\(\s*[\w\s*]+\)\s*(\w+)\s*[:{;]/,
    // Class method: + (returnType)methodName
    /^\s*\+\s*\(\s*[\w\s*]+\)\s*(\w+)\s*[:{;]/,
  ],
  // if, for, while, switch, @catch
  controlFlowKeywords: /\b(if|for|while|switch)\b|@catch/g,
  commentPrefix: '//',
};

/**
 * Tier B Objective-C analyzer.
 * Extracts instance and class method definitions and cyclomatic complexity via regex.
 */
export function analyzeObjC(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, OBJC_CONFIG);
}
