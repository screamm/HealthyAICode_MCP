import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { computeMaintainability } from '../../src/metrics/maintainability';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('MaintainabilityIndex', () => {
  it('returns high score for simple code', () => {
    const result = computeMaintainability(parse('const x = 1;'), 1, 1);
    expect(result.index).toBeGreaterThan(50);
  });

  it('returns lower score for complex code than for simple code', () => {
    const complex = parse(`
      function f(a: number, b: number, c: number) {
        if (a > 0) { for (let i = 0; i < b; i++) { if (c > 0) { return a + b + c; } } }
        if (b > 0) { while (c > 0) { c--; } }
        return a * b + c;
      }
    `);
    const simple = parse('const x = 1;');
    expect(computeMaintainability(complex, 5, 8).index)
      .toBeLessThan(computeMaintainability(simple, 1, 1).index);
  });

  it('halstead volume is positive for non-trivial code', () => {
    const result = computeMaintainability(parse('function f(x: number) { return x + 1; }'), 1, 1);
    expect(result.halstead.volume).toBeGreaterThan(0);
  });

  it('index is clamped to 0-100', () => {
    const result = computeMaintainability(parse('const x = 1;'), 1, 1);
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(100);
  });
});
