import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectGodClass } from '../../src/smells/god-class';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

const BIG_IMPORTS = new Set(['ServiceA', 'ServiceB', 'ServiceC', 'ServiceD', 'ServiceE', 'ServiceF']);

describe('GodClass', () => {
  it('does not flag small cohesive class', () => {
    const src = `
      class Small {
        value: number = 0;
        getValue() { return this.value; }
        setValue(v: number) { this.value = v; }
      }
    `;
    expect(detectGodClass(parse(src), new Set())).toHaveLength(0);
  });
});
