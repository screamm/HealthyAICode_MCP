import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const APEX_CONFIG: TierBConfig = {
  language: 'apex',
  functionPatterns: [
    // public/private/protected/global + optional static + return type + methodName(
    /^\s*(?:public|private|protected|global)\s+(?:static\s+)?(?:override\s+)?(?:[\w<>[\]]+\s+)+(\w+)\s*\(/,
  ],
  // if, for, while, catch, switch
  controlFlowKeywords: /\b(if|for|while|catch|switch)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B Apex (Salesforce) analyzer.
 * Extracts method definitions and cyclomatic complexity via regex.
 */
export function analyzeApex(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, APEX_CONFIG);
}
