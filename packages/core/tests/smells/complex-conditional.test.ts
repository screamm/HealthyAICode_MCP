import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectComplexConditional } from '../../src/smells/complex-conditional';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('ComplexConditional', () => {
  it('flags nested ternary as high', () => {
    const tree = parse('const x = a ? (b ? 1 : 2) : 3;');
    expect(detectComplexConditional(tree).some(s => s.severity === 'high')).toBe(true);
  });

  it('flags boolean chain > 3 as medium', () => {
    const tree = parse('if (a && b && c && d) {}');
    expect(detectComplexConditional(tree).some(s => s.severity === 'medium')).toBe(true);
  });

  it('does not flag simple ternary', () => {
    expect(detectComplexConditional(parse('const x = a ? b : c;'))).toHaveLength(0);
  });

  it('does not flag short boolean chain', () => {
    expect(detectComplexConditional(parse('if (a && b) {}'))).toHaveLength(0);
  });
});
