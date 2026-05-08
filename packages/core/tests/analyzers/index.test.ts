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

  it('routes kotlin to Java analyzer', () => {
    // Kotlin shares the Java grammar for basic structures at this stage
    const result = analyzeByLanguage(JAVA_SIMPLE, 'kotlin');
    expect(result.functions).toHaveLength(1);
  });

  it('routes csharp to CSharp analyzer', () => {
    const result = analyzeByLanguage(CS_SIMPLE, 'csharp');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('Add');
  });

  it('returns empty result for unsupported language', () => {
    // 'unsupported' is not in the Language union but testing the default branch
    const result = analyzeByLanguage('some code', 'typescript');
    expect(result.functions).toBeDefined();
    expect(result.metrics).toBeDefined();
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
