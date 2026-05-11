import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectSATD } from '../../src/smells/satd';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('SATD', () => {
  it('flags FIXME as high', () => {
    expect(detectSATD(parse('// FIXME: this is broken')).some(s => s.severity === 'high')).toBe(true);
  });

  it('flags TODO as medium', () => {
    expect(detectSATD(parse('// TODO: refactor this')).some(s => s.severity === 'medium')).toBe(true);
  });

  it('flags HACK as critical', () => {
    expect(detectSATD(parse('// HACK: temporary workaround')).some(s => s.severity === 'critical')).toBe(true);
  });

  it('does not flag normal comments', () => {
    expect(detectSATD(parse('// This function calculates the total price'))).toHaveLength(0);
  });

  it('does not flag "today" as TODO (word boundary)', () => {
    expect(detectSATD(parse("// Run today's report"))).toHaveLength(0);
  });
});
