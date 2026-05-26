import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const ERLANG_CONFIG: TierBConfig = {
  language: 'erlang',
  functionPatterns: [
    // Erlang function heads: name(Args) -> or name(Args) when Guard ->
    // The function name must start at column 0 (no leading whitespace)
    /^([a-z][a-zA-Z0-9_]*)\s*\(/,
  ],
  // if/case/receive/try/begin control flow keywords increment CC
  controlFlowKeywords: /\b(if|case|receive|try|begin|catch|when)\b/g,
  commentPrefix: '%',
};

/**
 * Tier B Erlang analyzer.
 *
 * Extracts function definitions using Erlang's `name(Args) ->` pattern
 * and measures cyclomatic complexity via control-flow keyword counting.
 * Covers OTP gen_server callbacks, plain modules, and escript files.
 *
 * Limitations (Tier B):
 * - Multiple function clauses of the same arity are counted as separate functions.
 * - Guard expressions (`when`) count as one branch each.
 * - Module attribute lines (-module, -export, -spec) are ignored by the function pattern.
 */
export function analyzeErlang(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, ERLANG_CONFIG);
}
