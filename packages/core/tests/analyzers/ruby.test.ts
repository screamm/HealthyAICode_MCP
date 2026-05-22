import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeRuby } from '../../src/analyzers/ruby';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeRuby', () => {
  describe('healthy fixture — simple.rb', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.rb'), 'utf-8');
    let result: ReturnType<typeof analyzeRuby>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeRuby(code); }).not.toThrow();
    });

    it('detects at least one function', () => {
      result = analyzeRuby(code);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('function name is add', () => {
      result = analyzeRuby(code);
      expect(result.functions.some(f => f.name === 'add')).toBe(true);
    });

    it('cyclomaticComplexity is low (≤ 2)', () => {
      result = analyzeRuby(code);
      expect(result.functions[0].cyclomaticComplexity).toBeLessThanOrEqual(2);
    });

    it('parameterCount is 2', () => {
      result = analyzeRuby(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeRuby(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeRuby(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });
  });

  describe('unhealthy fixture — complex.rb', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.rb'), 'utf-8');
    let result: ReturnType<typeof analyzeRuby>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeRuby(code); }).not.toThrow();
    });

    it('detects 1 function', () => {
      result = analyzeRuby(code);
      expect(result.functions).toHaveLength(1);
    });

    it('function name is process_data', () => {
      result = analyzeRuby(code);
      expect(result.functions[0].name).toBe('process_data');
    });

    it('cyclomaticComplexity > 3', () => {
      result = analyzeRuby(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(3);
    });

    it('nestingDepth >= 3', () => {
      result = analyzeRuby(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(3);
    });

    it('parameterCount is 5', () => {
      result = analyzeRuby(code);
      expect(result.functions[0].parameterCount).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzeRuby('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles singleton_method — detected as function', () => {
      const code = 'def self.create(name)\n  new(name)\nend\n';
      const result = analyzeRuby(code);
      expect(result.functions.some(f => f.name === 'create')).toBe(true);
    });

    it('if branch increments cyclomatic complexity', () => {
      const code = 'def check(x)\n  if x > 0\n    :positive\n  end\nend\n';
      const result = analyzeRuby(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });

  describe('analyzeRuby — smell detection', () => {
    it('detects SATD in Ruby code with TODO comment', () => {
      const code = 'def process(items)\n  # TODO: add input validation\n  items\nend\n';
      const result = analyzeRuby(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('returns no SATD for clean Ruby code', () => {
      const code = 'def add(a, b)\n  a + b\nend\n';
      const result = analyzeRuby(code);
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });
  });
});
