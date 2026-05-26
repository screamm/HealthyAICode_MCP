import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectLowDocCoverage } from '../../src/smells/doc-coverage';
import { typescriptProfile } from '../../src/smells/language-profile';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

// Multi-line helpers — 4 lines each, above the TRIVIAL_FUNCTION_LINE_THRESHOLD (3)
const fn = (name: string) => `export function ${name}() {\n  const x = 1;\n  return x;\n}`;
const docFn = (name: string) =>
  `/** Docs for ${name}. */\nexport function ${name}() {\n  const x = 1;\n  return x;\n}`;

describe('detectLowDocCoverage', () => {
  it('exempts files with fewer than 3 non-trivial exports', () => {
    // Only 2 non-trivial undocumented functions — below MIN_EXPORTS_FOR_CHECK threshold.
    const src = [fn('a'), fn('b')].join('\n');
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('always exempts trivial (≤3 line) functions from the check', () => {
    // Single-line exports are never flagged regardless of count or JSDoc coverage.
    const src = 'export function a() {}\nexport function b() {}\nexport function c() {}';
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('flags medium when 0% documented (3 non-trivial exports, no JSDoc)', () => {
    const src = [fn('a'), fn('b'), fn('c')].join('\n');
    const smells = detectLowDocCoverage(parse(src), src, typescriptProfile);
    expect(smells.length).toBe(1);
    expect(smells[0].severity).toBe('medium');
    expect(smells[0].type).toBe('LowDocCoverage');
  });

  it('flags low when 50–79% documented', () => {
    // 2/3 = 66 % → low severity (between 50 and 80 %)
    const src = [docFn('a'), docFn('b'), fn('c')].join('\n');
    const smells = detectLowDocCoverage(parse(src), src, typescriptProfile);
    expect(smells.length).toBe(1);
    expect(smells[0].severity).toBe('low');
  });

  it('returns no smell when ≥80% documented', () => {
    // 4/5 = 80 % → no smell
    const src = [docFn('a'), docFn('b'), docFn('c'), docFn('d'), fn('e')].join('\n');
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('returns no smell when 100% documented', () => {
    const src = [docFn('a'), docFn('b'), docFn('c')].join('\n');
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('reports smell at line 1', () => {
    const src = [fn('a'), fn('b'), fn('c')].join('\n');
    const smells = detectLowDocCoverage(parse(src), src, typescriptProfile);
    expect(smells[0].line).toBe(1);
  });
});
