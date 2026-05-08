import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeJava } from '../../src/analyzers/java';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeJava', () => {
  describe('healthy fixture — Simple.java', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'Simple.java'), 'utf-8');
    let result: ReturnType<typeof analyzeJava>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeJava(code); }).not.toThrow();
    });

    it('detects exactly 3 methods', () => {
      result = analyzeJava(code);
      expect(result.functions).toHaveLength(3);
    });

    it('method names are correct', () => {
      result = analyzeJava(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('add');
      expect(names).toContain('greet');
      expect(names).toContain('isPositive');
    });

    it('all methods have cyclomaticComplexity of 1', () => {
      result = analyzeJava(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all methods have nestingDepth of 0', () => {
      result = analyzeJava(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('add() has parameterCount of 2', () => {
      result = analyzeJava(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeJava(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeJava(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzeJava(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — Complex.java', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'Complex.java'), 'utf-8');
    let result: ReturnType<typeof analyzeJava>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeJava(code); }).not.toThrow();
    });

    it('detects 1 method', () => {
      result = analyzeJava(code);
      expect(result.functions).toHaveLength(1);
    });

    it('method name is processData', () => {
      result = analyzeJava(code);
      expect(result.functions[0].name).toBe('processData');
    });

    it('cyclomaticComplexity > 8', () => {
      result = analyzeJava(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5', () => {
      result = analyzeJava(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzeJava(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzeJava(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzeJava('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles constructor_declaration — detected as function', () => {
      const code = `
public class Foo {
    public Foo(int x) {
        this.x = x;
    }
}
`;
      const result = analyzeJava(code);
      const hasConstructor = result.functions.some(f => f.name === 'Foo');
      expect(hasConstructor).toBe(true);
    });

    it('handles enhanced for loop — increments cyclomatic complexity', () => {
      const code = `
public class Foo {
    public int sumAll(int[] nums) {
        int s = 0;
        for (int n : nums) {
            s += n;
        }
        return s;
    }
}
`;
      const result = analyzeJava(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });
});
