import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectDataClumps } from '../../src/smells/data-clumps';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('DataClumps', () => {
  it('flags three shared params across two functions', () => {
    const src = `
      function a(x: number, y: number, z: number) {}
      function b(x: number, y: number, z: number, extra: string) {}
    `;
    expect(detectDataClumps(parse(src)).some(s => s.type === 'DataClumps')).toBe(true);
  });

  it('does not flag when only two params match', () => {
    const src = `
      function a(x: number, y: number) {}
      function b(x: number, y: number) {}
    `;
    expect(detectDataClumps(parse(src))).toHaveLength(0);
  });
});
