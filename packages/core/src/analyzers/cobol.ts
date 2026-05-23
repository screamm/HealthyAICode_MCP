import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const COBOL_CONFIG: TierBConfig = {
  language: 'cobol',
  functionPatterns: [
    // PROCEDURE DIVISION or named SECTION headers
    /^\s*([A-Z0-9][\w-]*)\s+SECTION\s*\./i,
    /^\s*(PROCEDURE\s+DIVISION)/i,
  ],
  // IF, EVALUATE, PERFORM, UNTIL
  controlFlowKeywords: /\b(IF|EVALUATE|PERFORM|UNTIL)\b/gi,
  commentPrefix: '*',
};

/**
 * Tier B COBOL analyzer.
 * Extracts SECTION definitions and cyclomatic complexity via regex.
 */
export function analyzeCobol(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, COBOL_CONFIG);
}
