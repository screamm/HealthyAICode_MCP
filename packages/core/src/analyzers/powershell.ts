import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const POWERSHELL_CONFIG: TierBConfig = {
  language: 'powershell',
  functionPatterns: [
    // function FunctionName { or function FunctionName(
    /^\s*function\s+([\w-]+)\s*[\({]/i,
  ],
  // if, for, foreach, while, switch, catch, -and, -or
  controlFlowKeywords: /\b(if|elseif|for|foreach|while|switch|catch)\b|-and\b|-or\b/gi,
  commentPrefix: '#',
};

/**
 * Tier B PowerShell analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 */
export function analyzePowerShell(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, POWERSHELL_CONFIG);
}
