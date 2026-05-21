import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeGo } from '../../src/analyzers/go';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeGo', () => {
  describe('healthy fixture — simple.go', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.go'), 'utf-8');
    let result: ReturnType<typeof analyzeGo>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeGo(code); }).not.toThrow();
    });

    it('detects at least one function', () => {
      result = analyzeGo(code);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('function name is add', () => {
      result = analyzeGo(code);
      expect(result.functions.some(f => f.name === 'add')).toBe(true);
    });

    it('cyclomaticComplexity is low (≤ 2)', () => {
      result = analyzeGo(code);
      expect(result.functions[0].cyclomaticComplexity).toBeLessThanOrEqual(2);
    });

    it('parameterCount is 2 (grouped a, b int)', () => {
      result = analyzeGo(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeGo(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeGo(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });
  });

  describe('unhealthy fixture — complex.go', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.go'), 'utf-8');
    let result: ReturnType<typeof analyzeGo>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeGo(code); }).not.toThrow();
    });

    it('detects 1 function', () => {
      result = analyzeGo(code);
      expect(result.functions).toHaveLength(1);
    });

    it('function name is processData', () => {
      result = analyzeGo(code);
      expect(result.functions[0].name).toBe('processData');
    });

    it('cyclomaticComplexity > 3', () => {
      result = analyzeGo(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(3);
    });

    it('nestingDepth >= 3', () => {
      result = analyzeGo(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(3);
    });

    it('parameterCount is 5', () => {
      result = analyzeGo(code);
      expect(result.functions[0].parameterCount).toBe(5);
    });

    it('metrics.cyclomaticComplexity > 3', () => {
      result = analyzeGo(code);
      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(3);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzeGo('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles method_declaration — detected as function', () => {
      const code = `package main

type Greeter struct{}

func (g Greeter) Greet(name string) string {
	return "hello " + name
}
`;
      const result = analyzeGo(code);
      expect(result.functions.some(f => f.name === 'Greet')).toBe(true);
    });

    it('handles func literal — detected as anonymous function', () => {
      const code = `package main

func main() {
	fn := func(x int) int { return x * 2 }
	_ = fn
}
`;
      const result = analyzeGo(code);
      expect(result.functions.some(f => f.name === '<anonymous>')).toBe(true);
    });

    it('for_statement increments cyclomatic complexity', () => {
      const code = `package main

func loop() {
	for i := 0; i < 10; i++ {
	}
}
`;
      const result = analyzeGo(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });

  describe('analyzeGo — smell detection', () => {
    it('detects SATD in Go code with FIXME comment', () => {
      const code = 'package main\n\nfunc run() {\n\t// FIXME: goroutine leak\n}\n';
      const result = analyzeGo(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('returns no SATD for clean Go code', () => {
      const code = 'package main\n\nfunc add(a, b int) int {\n\treturn a + b\n}\n';
      const result = analyzeGo(code);
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });
  });
});
