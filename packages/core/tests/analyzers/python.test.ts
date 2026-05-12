import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzePython } from '../../src/analyzers/python';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzePython', () => {
  describe('healthy fixture — simple.py', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.py'), 'utf-8');
    let result: ReturnType<typeof analyzePython>;

    it('parses without throwing', () => {
      expect(() => { result = analyzePython(code); }).not.toThrow();
    });

    it('detects exactly 3 functions', () => {
      result = analyzePython(code);
      expect(result.functions).toHaveLength(3);
    });

    it('function names are correct', () => {
      result = analyzePython(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('add');
      expect(names).toContain('greet');
      expect(names).toContain('is_positive');
    });

    it('all functions have cyclomaticComplexity of 1', () => {
      result = analyzePython(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all functions have nestingDepth of 0', () => {
      result = analyzePython(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('add() has parameterCount of 2', () => {
      result = analyzePython(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzePython(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzePython(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzePython(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — complex.py', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.py'), 'utf-8');
    let result: ReturnType<typeof analyzePython>;

    it('parses without throwing', () => {
      expect(() => { result = analyzePython(code); }).not.toThrow();
    });

    it('detects 1 function', () => {
      result = analyzePython(code);
      expect(result.functions).toHaveLength(1);
    });

    it('function name is process_data', () => {
      result = analyzePython(code);
      expect(result.functions[0].name).toBe('process_data');
    });

    it('cyclomaticComplexity > 8 (deeply branchy function)', () => {
      result = analyzePython(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5 (deeply nested)', () => {
      result = analyzePython(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzePython(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzePython(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzePython('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles lambda — does not crash', () => {
      const code = 'square = lambda x: x * x\n';
      expect(() => analyzePython(code)).not.toThrow();
    });

    it('handles nested functions — counts both', () => {
      const code = `
def outer(x):
    def inner(y):
        return y + 1
    return inner(x)
`;
      const result = analyzePython(code);
      expect(result.functions.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('analyzePython — smell detection', () => {
  it('detects SATD in Python code with TODO comment', () => {
    const code = 'def process_data(items):\n    # TODO: add input validation\n    return items';
    const result = analyzePython(code);
    expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
  });

  it('returns no SATD for clean Python code', () => {
    const code = 'def add(a, b):\n    return a + b';
    const result = analyzePython(code);
    expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
  });
});
