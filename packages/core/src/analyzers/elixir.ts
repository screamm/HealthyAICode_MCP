import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const ELIXIR_CONFIG: TierBConfig = {
  language: 'elixir',
  functionPatterns: [
    // def name or defp name (private), supports ? and ! suffixes
    /^\s*defp?\s+(\w+[\w?!]*)/,
  ],
  // if/unless/cond/case/with/receive control flow
  controlFlowKeywords: /\b(if|unless|cond|case|with|receive)\b/g,
  commentPrefix: '#',
};

/**
 * Tier B Elixir analyzer.
 * Extracts def/defp definitions and cyclomatic complexity via regex.
 * Multiple function clauses of the same name are treated as separate functions.
 */
export function analyzeElixir(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, ELIXIR_CONFIG);
}
