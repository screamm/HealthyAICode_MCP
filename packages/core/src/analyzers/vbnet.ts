import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const VBNET_CONFIG: TierBConfig = {
  language: 'vbnet',
  functionPatterns: [
    // Sub or Function with optional access modifiers
    /^\s*(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|MustOverride|NotOverridable)?\s*(?:Sub|Function)\s+(\w+)\s*\(/i,
  ],
  // If, For, While, Select Case, Catch
  controlFlowKeywords: /\b(If|For|While|Select\s+Case|Catch|ElseIf)\b/gi,
  commentPrefix: "'",
};

/**
 * Tier B VB.NET analyzer.
 * Extracts Sub/Function definitions and cyclomatic complexity via regex.
 */
export function analyzeVbNet(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, VBNET_CONFIG);
}
