import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { calculateCognitiveComplexity } from '../../src/analyzers/cognitive-complexity';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);

function getFunctionNode(src: string): Parser.SyntaxNode {
  const root = parser.parse(src).rootNode;
  function find(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.type === 'function_declaration') return node;
    for (const child of node.children) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  }
  const fn = find(root);
  if (!fn) throw new Error('No function found in: ' + src);
  return fn;
}

describe('calculateCognitiveComplexity', () => {
  it('returns 0 for a trivial function', () => {
    const node = getFunctionNode('function f() { return 1; }');
    expect(calculateCognitiveComplexity(node, 'f')).toBe(0);
  });

  it('adds 1 for a simple if', () => {
    const node = getFunctionNode('function f(x) { if (x) { return 1; } }');
    expect(calculateCognitiveComplexity(node, 'f')).toBe(1);
  });

  it('adds nesting increment for nested if', () => {
    const node = getFunctionNode('function f(x, y) { if (x) { if (y) { return 1; } } }');
    // outer if: 1+0=1, inner if: 1+1=2 → total 3
    expect(calculateCognitiveComplexity(node, 'f')).toBe(3);
  });

  it('counts one group for a && b', () => {
    const node = getFunctionNode('function f(a, b) { return a && b; }');
    expect(calculateCognitiveComplexity(node, 'f')).toBe(1);
  });

  it('counts operator transitions for a && b || c', () => {
    const node = getFunctionNode('function f(a, b, c) { return a && b || c; }');
    // Outer || expression contributes 2 groups (|| then &&), inner && contributes 1 → total 3
    expect(calculateCognitiveComplexity(node, 'f')).toBe(3);
  });

  it('adds 1 for a recursive call', () => {
    const node = getFunctionNode('function factorial(n) { return n <= 1 ? 1 : factorial(n - 1); }');
    // ternary: 1+0=1, recursive call: +1 → total 2
    const cc = calculateCognitiveComplexity(node, 'factorial');
    expect(cc).toBeGreaterThanOrEqual(2);
  });

  it('does not count recursive call of a differently named function', () => {
    const node = getFunctionNode('function f(n) { return other(n); }');
    expect(calculateCognitiveComplexity(node, 'f')).toBe(0);
  });
});
