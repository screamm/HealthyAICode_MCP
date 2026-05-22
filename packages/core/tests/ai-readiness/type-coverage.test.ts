import { describe, it, expect } from 'vitest';
import { analyzeTypeCoverage } from '../../src/ai-readiness/type-coverage';

describe('analyzeTypeCoverage', () => {
  it('awards a high score to fully-typed TypeScript', () => {
    const src = `
      function add(a: number, b: number): number {
        return a + b;
      }
      function greet(name: string): string {
        return "hello " + name;
      }
    `;
    const result = analyzeTypeCoverage(src, 'typescript');
    expect(result.totalFunctions).toBe(2);
    expect(result.annotatedReturns).toBe(2);
    expect(result.score).toBeGreaterThanOrEqual(9);
  });

  it('penalises untyped TypeScript', () => {
    const src = `
      function add(a, b) {
        return a + b;
      }
      function greet(name) {
        return name;
      }
    `;
    const result = analyzeTypeCoverage(src, 'typescript');
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it('awards a high score to fully-typed Python (PEP 484)', () => {
    const src = `
def add(a: int, b: int) -> int:
    return a + b

def greet(name: str) -> str:
    return "hello " + name
`;
    const result = analyzeTypeCoverage(src, 'python');
    expect(result.totalFunctions).toBe(2);
    // add has 2 params (a, b); greet has 1 (name) → total 3 annotated.
    expect(result.annotatedParams).toBe(3);
    expect(result.annotatedReturns).toBe(2);
    expect(result.score).toBe(10);
  });

  it('penalises untyped Python', () => {
    const src = `
def add(a, b):
    return a + b

def greet(name):
    return name
`;
    const result = analyzeTypeCoverage(src, 'python');
    expect(result.totalFunctions).toBe(2);
    expect(result.annotatedParams).toBe(0);
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it('returns a perfect score for statically-typed languages', () => {
    for (const lang of ['java', 'kotlin', 'csharp', 'go', 'rust', 'swift']) {
      const result = analyzeTypeCoverage('whatever', lang);
      expect(result.score).toBe(10);
    }
  });

  it('falls back to JSDoc-based estimation for JavaScript', () => {
    const src = `
      /**
       * @param {number} a
       * @param {number} b
       * @returns {number}
       */
      function add(a, b) { return a + b; }

      /**
       * @param {string} name
       * @returns {string}
       */
      function greet(name) { return "hello " + name; }
    `;
    const result = analyzeTypeCoverage(src, 'javascript');
    expect(result.totalFunctions).toBe(2);
    expect(result.annotatedReturns).toBe(2);
    expect(result.score).toBeGreaterThan(4);
  });

  it('treats empty input as fully covered (vacuous truth)', () => {
    const result = analyzeTypeCoverage('', 'typescript');
    expect(result.coverageRatio).toBe(1);
    expect(result.score).toBe(10);
  });

  it('handles Python class methods, ignoring self', () => {
    const src = `
class Calculator:
    def add(self, a: int, b: int) -> int:
        return a + b
`;
    const result = analyzeTypeCoverage(src, 'python');
    // self is excluded; a and b are annotated.
    expect(result.totalParams).toBe(2);
    expect(result.annotatedParams).toBe(2);
    expect(result.annotatedReturns).toBe(1);
  });
});
