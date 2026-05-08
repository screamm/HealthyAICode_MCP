import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeCSharp } from '../../src/analyzers/csharp';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeCSharp', () => {
  describe('healthy fixture — Simple.cs', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'Simple.cs'), 'utf-8');
    let result: ReturnType<typeof analyzeCSharp>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeCSharp(code); }).not.toThrow();
    });

    it('detects exactly 3 methods', () => {
      result = analyzeCSharp(code);
      expect(result.functions).toHaveLength(3);
    });

    it('method names are correct', () => {
      result = analyzeCSharp(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('Add');
      expect(names).toContain('Greet');
      expect(names).toContain('IsPositive');
    });

    it('all methods have cyclomaticComplexity of 1', () => {
      result = analyzeCSharp(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all methods have nestingDepth of 0', () => {
      result = analyzeCSharp(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('Add() has parameterCount of 2', () => {
      result = analyzeCSharp(code);
      const addFn = result.functions.find(f => f.name === 'Add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — Complex.cs', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'Complex.cs'), 'utf-8');
    let result: ReturnType<typeof analyzeCSharp>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeCSharp(code); }).not.toThrow();
    });

    it('detects 1 method', () => {
      result = analyzeCSharp(code);
      expect(result.functions).toHaveLength(1);
    });

    it('method name is ProcessData', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].name).toBe('ProcessData');
    });

    it('cyclomaticComplexity > 8', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions for empty string', () => {
      const result = analyzeCSharp('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles constructor_declaration', () => {
      const code = `
public class Foo {
    public Foo(int x) {
        this.x = x;
    }
}
`;
      const result = analyzeCSharp(code);
      const hasCtor = result.functions.some(f => f.name === 'Foo');
      expect(hasCtor).toBe(true);
    });

    it('handles expression-bodied member — no crash', () => {
      const code = `
public class Calc {
    public int Double(int n) => n * 2;
}
`;
      expect(() => analyzeCSharp(code)).not.toThrow();
    });

    it('handles foreach_statement — increments cyclomatic complexity', () => {
      const code = `
public class Foo {
    public int Sum(int[] nums) {
        int s = 0;
        foreach (var n in nums) {
            s += n;
        }
        return s;
    }
}
`;
      const result = analyzeCSharp(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });
});
