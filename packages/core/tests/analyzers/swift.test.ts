import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeSwift } from '../../src/analyzers/swift';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeSwift', () => {
  // tree-sitter-swift may lack a native prebuilt on some platforms.
  // All tests use the graceful-fallback path too.

  describe('healthy fixture — simple.swift', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.swift'), 'utf-8');
    let result: ReturnType<typeof analyzeSwift>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeSwift(code); }).not.toThrow();
    });

    it('returns a valid metrics object', () => {
      result = analyzeSwift(code);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalLines).toBeGreaterThan(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzeSwift(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — complex.swift', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.swift'), 'utf-8');
    let result: ReturnType<typeof analyzeSwift>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeSwift(code); }).not.toThrow();
    });

    it('returns a valid smells array', () => {
      result = analyzeSwift(code);
      expect(Array.isArray(result.smells)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzeSwift('');
      expect(result.functions).toHaveLength(0);
    });

    it('does not throw on arbitrary Swift code', () => {
      const code = 'func greet(name: String) -> String { return "Hello \(name)" }\n';
      expect(() => analyzeSwift(code)).not.toThrow();
    });
  });

  describe('analyzeSwift — smell detection', () => {
    it('detects SATD in Swift code with TODO comment', () => {
      const code = '// TODO: refactor this\nfunc run() {}\n';
      const result = analyzeSwift(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('returns no SATD for clean Swift code', () => {
      const code = 'func add(a: Int, b: Int) -> Int { return a + b }\n';
      const result = analyzeSwift(code);
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });
  });
});
