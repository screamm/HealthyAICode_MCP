import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';

describe('analyzeCode multi-language integration', () => {
  it('analyzes Python code and returns real metrics', () => {
    const code = `
def add(a: int, b: int) -> int:
    return a + b
`;
    const result = analyzeCode(code, 'python', 'add.py');
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes Java code and returns real metrics', () => {
    const code = `
public class Foo {
    public int add(int a, int b) {
        return a + b;
    }
}
`;
    const result = analyzeCode(code, 'java', 'Foo.java');
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes C# code and returns real metrics', () => {
    const code = `
public class Foo {
    public int Add(int a, int b) => a + b;
}
`;
    const result = analyzeCode(code, 'csharp', 'Foo.cs');
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes Ruby code and returns real metrics', () => {
    const code = 'def add(a, b)\n  a + b\nend\n';
    const result = analyzeCode(code, 'ruby', 'add.rb');
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes Swift code without throwing (native binary may be absent)', () => {
    const code = 'func add(a: Int, b: Int) -> Int { return a + b }\n';
    const result = analyzeCode(code, 'swift', 'add.swift');
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes Kotlin (routed through Java analyzer)', () => {
    const code = `
public class Foo {
    public int add(int a, int b) {
        return a + b;
    }
}
`;
    const result = analyzeCode(code, 'kotlin', 'Foo.kt');
    expect(result.functions).toHaveLength(1);
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });
});
