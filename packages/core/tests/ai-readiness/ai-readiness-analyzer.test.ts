import { describe, it, expect } from 'vitest';
import { analyzeAIReadiness } from '../../src/ai-readiness/ai-readiness-analyzer';

const TYPED_TS = `
/** Calculate the total of an order. */
export function calculateOrderTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

interface Item { price: number; }
`;

const UNTYPED_PY = `
def f(a, b):
    x = a + b
    y = a - b
    z = x * y
    return z
`;

describe('analyzeAIReadiness', () => {
  it('returns a perfect score for empty input', () => {
    const result = analyzeAIReadiness([]);
    expect(result.score).toBe(10);
    expect(result.aiBlockers).toHaveLength(0);
  });

  it('gives a high score for well-typed TypeScript', () => {
    const result = analyzeAIReadiness([{
      path: 'order.ts',
      content: TYPED_TS,
      language: 'typescript',
      functions: [{ name: 'calculateOrderTotal', startLine: 2, endLine: 4, content: TYPED_TS }],
      cognitiveComplexity: 1,
      docCoverageRatio: 1,
    }]);
    expect(result.score).toBeGreaterThanOrEqual(7);
    expect(result.dimensions.typeCoverage).toBeGreaterThanOrEqual(9);
    expect(result.dimensions.docSignal).toBe(10);
  });

  it('gives a low score for untyped, cryptically-named Python', () => {
    const result = analyzeAIReadiness([{
      path: 'bad.py',
      content: UNTYPED_PY,
      language: 'python',
      functions: [{ name: 'f', startLine: 2, endLine: 6, content: UNTYPED_PY }],
      cognitiveComplexity: 0,
      docCoverageRatio: 0,
    }]);
    expect(result.score).toBeLessThan(7);
    expect(result.dimensions.typeCoverage).toBeLessThan(5);
    expect(result.aiBlockers.length).toBeGreaterThan(0);
  });

  it('detects long functions as context-window blockers', () => {
    const longContent = 'x'.repeat(10_000); // ~2500 tokens
    const result = analyzeAIReadiness([{
      path: 'huge.ts',
      content: 'function huge() {\n' + longContent + '\n}',
      language: 'typescript',
      functions: [{ name: 'huge', startLine: 1, endLine: 3, content: longContent }],
      cognitiveComplexity: 0,
      docCoverageRatio: 0.5,
    }]);
    expect(result.dimensions.contextWindowFit).toBeLessThan(5);
    expect(result.aiBlockers.some(b => b.issue.includes('tokens'))).toBe(true);
  });

  it('limits aiBlockers to at most 10 entries', () => {
    const badFiles = Array.from({ length: 30 }, (_, idx) => ({
      path: `bad${idx}.py`,
      content: 'def f(a,b):\n    return a+b\n',
      language: 'python',
      functions: [],
      cognitiveComplexity: 9,
      docCoverageRatio: 0,
    }));
    const result = analyzeAIReadiness(badFiles);
    expect(result.aiBlockers.length).toBeLessThanOrEqual(10);
  });

  it('keeps the composite score within [0, 10]', () => {
    const result = analyzeAIReadiness([{
      path: 'mix.ts',
      content: TYPED_TS,
      language: 'typescript',
      functions: [{ name: 'fn', startLine: 1, endLine: 5, content: TYPED_TS }],
      cognitiveComplexity: 5,
      docCoverageRatio: 0.5,
    }]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('includes a human-readable summary', () => {
    const result = analyzeAIReadiness([{
      path: 'order.ts',
      content: TYPED_TS,
      language: 'typescript',
      cognitiveComplexity: 1,
      docCoverageRatio: 1,
    }]);
    expect(result.summary).toMatch(/AI-readiness/);
    expect(result.summary).toMatch(/Good|Fair|Poor/);
  });
});
