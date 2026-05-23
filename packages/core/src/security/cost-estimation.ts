// packages/core/src/security/cost-estimation.ts
// API cost estimation for security scan pricing. Sprint 28.

// Prices in USD per 1M tokens (updated 2026-05).
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80,  output: 2.40  },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

/** Estimated tokens per finding: ±20 lines of context + prompt overhead. */
const CONTEXT_TOKENS_PER_FINDING = 400;
/** Estimated JSON response tokens per finding. */
const OUTPUT_TOKENS_PER_FINDING = 150;

export interface CostEstimate {
  model: string;
  findings_count: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  /** Estimated cost in USD, 6 decimal precision. */
  estimated_cost_usd: number;
}

/**
 * Estimate the Claude API cost for assessing a set of static findings.
 *
 * Falls back to Haiku pricing if the model name is not recognized.
 */
export function estimateScanCost(findingsCount: number, model: string): CostEstimate {
  const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['claude-haiku-4-5'];
  const inputTokens = findingsCount * CONTEXT_TOKENS_PER_FINDING;
  const outputTokens = findingsCount * OUTPUT_TOKENS_PER_FINDING;
  const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  return {
    model,
    findings_count: findingsCount,
    estimated_input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    estimated_cost_usd: parseFloat(cost.toFixed(6)),
  };
}
