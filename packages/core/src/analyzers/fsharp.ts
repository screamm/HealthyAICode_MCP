import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const FSHARP_CONFIG: TierBConfig = {
  language: 'fsharp',
  functionPatterns: [
    // let functionName param1 param2 = or let rec functionName
    /^\s*let\s+(?:rec\s+)?([a-zA-Z_][\w']*)\s+[^=\s]/,
    // let functionName() = (unit parameter)
    /^\s*let\s+(?:rec\s+)?([a-zA-Z_][\w']*)\s*\(/,
  ],
  // if, match, for, while, try
  controlFlowKeywords: /\b(if|match|for|while|try)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B F# analyzer.
 * Extracts function definitions (let bindings with parameters) and cyclomatic complexity via regex.
 */
export function analyzeFSharp(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, FSHARP_CONFIG);
}
