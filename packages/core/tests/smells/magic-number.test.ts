import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectMagicNumbers } from '../../src/smells/magic-number';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('detectMagicNumbers', () => {
  it('flags function with 3+ magic numbers', () => {
    // Numbers in conditions/returns are not inside const declarations → not exempt
    const src = `
function f(x: number) {
  if (x > 42) return 99;
  if (x > 77) return 55;
  return 88;
}`;
    const smells = detectMagicNumbers(parse(src), 'src/f.ts');
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('MagicNumber');
  });

  it('does not flag function with fewer than 3 magic numbers', () => {
    const src = `
function f(x: number) {
  if (x > 42) return 99;
  return 0;
}`;
    expect(detectMagicNumbers(parse(src), 'src/f.ts')).toHaveLength(0);
  });

  it('does not flag allowed literals (0, 1, -1, 2, 100)', () => {
    const src = `
function f(n: number) {
  if (n === 0) return -1;
  if (n === 1) return 2;
  return 100;
}`;
    expect(detectMagicNumbers(parse(src), 'src/f.ts')).toHaveLength(0);
  });

  it('does not flag numbers inside const declarations', () => {
    const src = `
const MAX = 9999;
const MIN = 3456;
const STEP = 7890;
function f() { return MAX + MIN + STEP; }`;
    expect(detectMagicNumbers(parse(src), 'src/f.ts')).toHaveLength(0);
  });

  it('skips test files entirely', () => {
    const src = `
function f() {
  return 42 + 99 + 77;
}`;
    expect(detectMagicNumbers(parse(src), 'src/f.test.ts')).toHaveLength(0);
    expect(detectMagicNumbers(parse(src), 'src/f.spec.ts')).toHaveLength(0);
  });

  it('does not flag type annotations containing "number"', () => {
    const src = 'export function add(a: number, b: number): number { return a + b; }';
    expect(detectMagicNumbers(parse(src), 'src/math.ts')).toHaveLength(0);
  });
});
