import { describe, it, expect } from 'vitest';
import { analyzeContextWindowFit } from '../../src/ai-readiness/context-window-fit';
import type { ContextWindowFitInput } from '../../src/ai-readiness/context-window-fit';

function makeFunc(name: string, chars: number): ContextWindowFitInput {
  return {
    name,
    startLine: 1,
    endLine: 10,
    content: 'x'.repeat(chars),
  };
}

describe('analyzeContextWindowFit', () => {
  it('scores 10 for tiny functions', () => {
    // 100 chars → ~25 tokens, well under the 2000-token threshold
    const result = analyzeContextWindowFit([makeFunc('tiny', 100)]);
    expect(result.score).toBe(10);
    expect(result.functionsExceedingContext).toBe(0);
  });

  it('scores lower for functions exceeding 2000 tokens (8000 chars)', () => {
    // 8001 chars → 2001 tokens — exceeds the 2000-token soft cap
    const result = analyzeContextWindowFit([makeFunc('large', 8_001)]);
    expect(result.score).toBeLessThan(10);
    expect(result.functionsExceedingContext).toBe(1);
  });

  it('counts functions exceeding context threshold correctly', () => {
    const funcs: ContextWindowFitInput[] = [
      makeFunc('small1', 100),
      makeFunc('small2', 200),
      makeFunc('big1', 9_000),   // ~2250 tokens — exceeds cap
      makeFunc('big2', 12_000),  // ~3000 tokens — exceeds cap
    ];
    const result = analyzeContextWindowFit(funcs);
    expect(result.functionsExceedingContext).toBe(2);
    expect(result.score).toBeLessThan(10);
  });

  it('handles empty functions array', () => {
    const result = analyzeContextWindowFit([]);
    expect(result.score).toBe(10);
    expect(result.avgFunctionTokens).toBe(0);
    expect(result.maxFunctionTokens).toBe(0);
    expect(result.functionsExceedingContext).toBe(0);
    expect(result.recommendedContextSize).toBe(4_000);
  });

  it('calculates avgFunctionTokens as chars/4 (rounded)', () => {
    // 400 chars → 100 tokens, 800 chars → 200 tokens; avg = 150
    const result = analyzeContextWindowFit([
      makeFunc('a', 400),
      makeFunc('b', 800),
    ]);
    expect(result.avgFunctionTokens).toBe(150);
  });
});
