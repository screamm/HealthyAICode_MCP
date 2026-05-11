import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectTypeSafetyEscapes } from '../../src/smells/type-safety-escape';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('detectTypeSafetyEscapes', () => {
  it('flags @ts-nocheck as critical', () => {
    const src = '// @ts-nocheck\nexport function f() {}';
    const smells = detectTypeSafetyEscapes(parse(src), src);
    expect(smells.some(s => s.severity === 'critical')).toBe(true);
    expect(smells.some(s => s.type === 'TypeSafetyEscape')).toBe(true);
  });

  it('flags @ts-ignore as high', () => {
    const src = '// @ts-ignore\nconst x = 1;';
    const smells = detectTypeSafetyEscapes(parse(src), src);
    expect(smells.some(s => s.severity === 'high')).toBe(true);
  });

  it('flags @ts-expect-error as low', () => {
    const src = '// @ts-expect-error\nconst x = 1;';
    const smells = detectTypeSafetyEscapes(parse(src), src);
    expect(smells.some(s => s.severity === 'low')).toBe(true);
  });

  it('flags explicit any usage as medium', () => {
    const src = 'const x: any = {};';
    const smells = detectTypeSafetyEscapes(parse(src), src);
    expect(smells.some(s => s.severity === 'medium')).toBe(true);
  });

  it('returns no smells for clean typed code', () => {
    const src = 'export function add(a: number, b: number): number { return a + b; }';
    expect(detectTypeSafetyEscapes(parse(src), src)).toHaveLength(0);
  });

  it('reports correct line number for directive', () => {
    const src = 'const a = 1;\n// @ts-nocheck\nconst b = 2;';
    const smells = detectTypeSafetyEscapes(parse(src), src);
    const critical = smells.find(s => s.severity === 'critical');
    expect(critical?.line).toBe(2);
  });
});
