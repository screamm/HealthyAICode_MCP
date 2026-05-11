import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectMessageChain } from '../../src/smells/message-chain';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('MessageChain', () => {
  it('flags chain of depth 4', () => {
    const tree = parse('const r = a.b().c().d().e();');
    expect(detectMessageChain(tree).some(s => s.type === 'MessageChain')).toBe(true);
  });

  it('does not flag chain of depth 3', () => {
    expect(detectMessageChain(parse('const r = a.b().c().d();'))).toHaveLength(0);
  });

  it('does not flag simple method call', () => {
    expect(detectMessageChain(parse('foo.bar();'))).toHaveLength(0);
  });
});
