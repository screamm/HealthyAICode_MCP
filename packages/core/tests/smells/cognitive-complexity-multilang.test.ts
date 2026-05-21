import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import CSharp from 'tree-sitter-c-sharp';
import { computeCognitiveComplexity } from '../../src/smells/cognitive-complexity';
import { pythonProfile, javaProfile, csharpProfile } from '../../src/smells/language-profile';

const pyParser = new Parser(); pyParser.setLanguage(Python as unknown as object);
const javaParser = new Parser(); javaParser.setLanguage(Java as unknown as object);
const csParser = new Parser(); csParser.setLanguage(CSharp as unknown as object);

describe('computeCognitiveComplexity', () => {
  it('Python: returns 0 for linear function', () => {
    const src = 'def f(x):\n    return x + 1';
    const root = pyParser.parse(src).rootNode;
    expect(computeCognitiveComplexity(root, pythonProfile)).toBe(0);
  });

  it('Python: nested if yields higher complexity than flat if', () => {
    const flat = 'def f(x):\n    if x > 0:\n        return 1\n    return 0';
    const nested = 'def f(x):\n    if x > 0:\n        if x > 10:\n            return 2\n    return 0';
    const flatCC = computeCognitiveComplexity(pyParser.parse(flat).rootNode, pythonProfile);
    const nestedCC = computeCognitiveComplexity(pyParser.parse(nested).rootNode, pythonProfile);
    expect(nestedCC).toBeGreaterThan(flatCC);
  });

  it('Java: catch clause gives +1', () => {
    const src = 'class C { void m() { try { x(); } catch (Exception e) {} } }';
    const cc = computeCognitiveComplexity(javaParser.parse(src).rootNode, javaProfile);
    expect(cc).toBeGreaterThanOrEqual(1);
  });

  it('C#: boolean chain a && b && c gives >= 3 (1 for if + logical ops)', () => {
    const src = 'class C { void M(bool a, bool b, bool c) { if (a && b && c) { } } }';
    const cc = computeCognitiveComplexity(csParser.parse(src).rootNode, csharpProfile);
    expect(cc).toBeGreaterThanOrEqual(3);  // 1 for if + 2 for &&-chain
  });
});
