import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const ZIG_CONFIG: TierBConfig = {
  language: 'zig',
  functionPatterns: [
    // pub fn name( or fn name(
    /^\s*(?:pub\s+)?fn\s+(\w+)\s*\(/,
  ],
  // Zig control-flow keywords that increase cyclomatic complexity
  controlFlowKeywords: /\b(if|while|for|switch|catch|orelse|and|or)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B Zig analyzer.
 *
 * Extracts function definitions using `fn name(` patterns (with optional `pub`)
 * and measures cyclomatic complexity via control-flow keyword counting.
 * Covers comptime functions, pub/private functions, and method-style functions.
 *
 * Limitations (Tier B):
 * - Comptime blocks and anonymous functions are not tracked as separate functions.
 * - Error union return types do not affect complexity counting.
 */
export function analyzeZig(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, ZIG_CONFIG);
}
