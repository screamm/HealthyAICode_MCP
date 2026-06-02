/**
 * Context Window Fit analyzer — measures how well individual functions
 * fit inside an LLM context window.
 *
 * Token approximation: tokens ≈ characters / 4 (OpenAI's BPE rule of thumb).
 * The threshold "exceeds context" is set at 2 000 tokens (~8 000 chars), which
 * is roughly 10 % of a 16 k window or ~1.5 % of a 128 k window.
 */

const CHARS_PER_TOKEN = 4;
const EXCEED_TOKENS = 2_000;
const CONTEXT_TIERS = [4_000, 16_000, 32_000, 128_000, 200_000];
/** Fraction of functions a recommended window must cover (90th percentile). */
const COVERAGE_PERCENTILE = 0.9;
/** Best possible composite score (also the perfect-fit ceiling). */
const MAX_SCORE = 10;
/** Multiplier used to round the score to one decimal place. */
const ONE_DECIMAL = 10;

/** A single function to be evaluated for context-window fit. */
export interface ContextWindowFitInput {
  name: string;
  startLine: number;
  endLine: number;
  content: string;
}

/** Aggregate context-window-fit metrics for a set of functions. */
export interface ContextWindowFitResult {
  /** Composite 0..10 score. Higher is better. */
  score: number;
  /** Average function size in approximated tokens. */
  avgFunctionTokens: number;
  /** Largest function in approximated tokens. */
  maxFunctionTokens: number;
  /** Number of functions exceeding the 2 000-token soft cap. */
  functionsExceedingContext: number;
  /** Smallest standard window (4k/16k/32k/128k/200k) that covers ≥ 90 % of functions. */
  recommendedContextSize: number;
}

/** Approximate token count for a string. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Compute a Context Window Fit result for an array of function bodies.
 *
 * Empty input → perfect score with zero tokens reported.
 */
export function analyzeContextWindowFit(functions: ContextWindowFitInput[]): ContextWindowFitResult {
  if (functions.length === 0) {
    return {
      score: MAX_SCORE,
      avgFunctionTokens: 0,
      maxFunctionTokens: 0,
      functionsExceedingContext: 0,
      recommendedContextSize: CONTEXT_TIERS[0],
    };
  }

  const tokenCounts = functions.map(f => approxTokens(f.content));
  const total = tokenCounts.reduce((a, b) => a + b, 0);
  const avgFunctionTokens = Math.round(total / tokenCounts.length);
  const maxFunctionTokens = Math.max(...tokenCounts);
  const functionsExceedingContext = tokenCounts.filter(t => t > EXCEED_TOKENS).length;

  const exceedRatio = functionsExceedingContext / functions.length;
  let score = MAX_SCORE - exceedRatio * MAX_SCORE;
  if (score < 0) score = 0;
  if (score > MAX_SCORE) score = MAX_SCORE;
  score = Math.round(score * ONE_DECIMAL) / ONE_DECIMAL;

  const recommendedContextSize = pickRecommendedWindow(tokenCounts);

  return {
    score,
    avgFunctionTokens,
    maxFunctionTokens,
    functionsExceedingContext,
    recommendedContextSize,
  };
}

/**
 * Choose the smallest standard window that covers ≥ 90 % of functions.
 * If even the largest tier does not cover, return the largest tier.
 */
function pickRecommendedWindow(tokens: number[]): number {
  const sorted = [...tokens].sort((a, b) => a - b);
  const idx90 = Math.max(0, Math.floor(sorted.length * COVERAGE_PERCENTILE) - 1);
  const p90 = sorted[idx90];
  for (const tier of CONTEXT_TIERS) {
    if (tier >= p90) return tier;
  }
  return CONTEXT_TIERS[CONTEXT_TIERS.length - 1];
}
