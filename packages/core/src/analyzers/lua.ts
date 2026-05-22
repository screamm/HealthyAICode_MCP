import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const LUA_CONFIG: TierBConfig = {
  language: 'lua',
  functionPatterns: [
    // local function name( or function name(
    /^\s*(?:local\s+)?function\s+(\w[\w.]*)\s*\(/,
    // Table assignment: obj.method = function(
    /^\s*(\w[\w.]*)\s*=\s*function\s*\(/,
  ],
  // if/elseif/while/repeat/for
  controlFlowKeywords: /\b(if|elseif|while|repeat|for)\b/g,
  commentPrefix: '--',
};

/**
 * Tier B Lua analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * Handles named functions, local functions, and table method assignments.
 */
export function analyzeLua(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, LUA_CONFIG);
}
