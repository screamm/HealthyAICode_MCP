import { describe, it, expect } from 'vitest';
import { analyzeByLanguage } from '../../src/analyzers/index';

const TS_SIMPLE = `
function add(a: number, b: number): number {
  return a + b;
}
`;

const PY_SIMPLE = `
def add(a: int, b: int) -> int:
    return a + b
`;

const JAVA_SIMPLE = `
public class Foo {
    public int add(int a, int b) {
        return a + b;
    }
}
`;

const CS_SIMPLE = `
public class Foo {
    public int Add(int a, int b) => a + b;
}
`;

describe('analyzeByLanguage router', () => {
  it('routes typescript to TypeScript analyzer', () => {
    const result = analyzeByLanguage(TS_SIMPLE, 'typescript');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes javascript to TypeScript analyzer', () => {
    const result = analyzeByLanguage('function hi() { return 1; }', 'javascript');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('hi');
  });

  it('routes python to Python analyzer', () => {
    const result = analyzeByLanguage(PY_SIMPLE, 'python');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes java to Java analyzer', () => {
    const result = analyzeByLanguage(JAVA_SIMPLE, 'java');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes kotlin to native Kotlin analyzer', () => {
    // Sprint 25: Kotlin now uses native Tier B analyzer with `fun` keyword detection
    const result = analyzeByLanguage('fun add(a: Int, b: Int): Int { return a + b }', 'kotlin');
    expect(result.functions).toHaveLength(1);
  });

  it('routes csharp to CSharp analyzer', () => {
    const result = analyzeByLanguage(CS_SIMPLE, 'csharp');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('Add');
  });

  it('routes ruby to Ruby analyzer', () => {
    const result = analyzeByLanguage('def add(a, b)\n  a + b\nend\n', 'ruby');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes swift to Swift analyzer', () => {
    const result = analyzeByLanguage('func add(a: Int, b: Int) -> Int { return a + b }\n', 'swift');
    // Swift may not have native binary on all platforms — just verify no throw and valid metrics
    expect(result.metrics).toHaveProperty('totalLines');
    expect(Array.isArray(result.functions)).toBe(true);
  });

  it('returns empty result for unsupported language', () => {
    const result = analyzeByLanguage('some code', 'unknown' as unknown as Parameters<typeof analyzeByLanguage>[1]);
    expect(result.functions).toHaveLength(0);
    expect(result.metrics.cyclomaticComplexity).toBe(1);
  });

  it('metrics object has all required keys', () => {
    const result = analyzeByLanguage(PY_SIMPLE, 'python');
    expect(result.metrics).toHaveProperty('cyclomaticComplexity');
    expect(result.metrics).toHaveProperty('cognitiveComplexity');
    expect(result.metrics).toHaveProperty('maxNestingDepth');
    expect(result.metrics).toHaveProperty('avgFunctionLength');
    expect(result.metrics).toHaveProperty('maxFunctionLength');
    expect(result.metrics).toHaveProperty('avgParameterCount');
    expect(result.metrics).toHaveProperty('maxParameterCount');
    expect(result.metrics).toHaveProperty('totalLines');
    expect(result.metrics).toHaveProperty('duplicationScore');
  });
});
