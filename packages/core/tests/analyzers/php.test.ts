import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzePhp } from '../../src/analyzers/php';

const FIXTURES_HEALTHY = join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = join(__dirname, '../fixtures/unhealthy');

describe('analyzePhp', () => {
  describe('healthy fixture — simple.php', () => {
    const code = readFileSync(join(FIXTURES_HEALTHY, 'simple.php'), 'utf8');

    it('parses without throwing', () => {
      expect(() => analyzePhp(code)).not.toThrow();
    });

    it('detects at least one function', () => {
      const { functions } = analyzePhp(code);
      expect(functions.length).toBeGreaterThan(0);
    });

    it('function name is add', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].name).toBe('add');
    });

    it('cyclomaticComplexity is low (≤ 2)', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].cyclomaticComplexity).toBeLessThanOrEqual(2);
    });

    it('parameterCount is 2', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].parameterCount).toBe(2);
    });

    it('nestingDepth is 0', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].nestingDepth).toBe(0);
    });
  });

  describe('unhealthy fixture — complex.php', () => {
    const code = readFileSync(join(FIXTURES_UNHEALTHY, 'complex.php'), 'utf8');

    it('parses without throwing', () => {
      expect(() => analyzePhp(code)).not.toThrow();
    });

    it('detects 1 function', () => {
      const { functions } = analyzePhp(code);
      expect(functions).toHaveLength(1);
    });

    it('function name is processData', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].name).toBe('processData');
    });

    it('cyclomaticComplexity is high (> 3)', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].cyclomaticComplexity).toBeGreaterThan(3);
    });

    it('parameterCount is 5', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].parameterCount).toBe(5);
    });

    it('nestingDepth >= 4 (deeply nested)', () => {
      const { functions } = analyzePhp(code);
      expect(functions[0].nestingDepth).toBeGreaterThanOrEqual(4);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const { functions } = analyzePhp('');
      expect(functions).toHaveLength(0);
    });

    it('handles anonymous function without crashing', () => {
      const code = '<?php\n$fn = function($x) { return $x + 1; };\n';
      expect(() => analyzePhp(code)).not.toThrow();
    });

    it('handles arrow function without crashing', () => {
      const code = '<?php\n$fn = fn($x) => $x * 2;\n';
      expect(() => analyzePhp(code)).not.toThrow();
    });
  });

  describe('smell detection', () => {
    it('detects SATD in PHP code with TODO comment', () => {
      const code = '<?php\nfunction process($items) {\n    // TODO: add input validation\n    return $items;\n}\n';
      const { smells } = analyzePhp(code);
      expect(smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('returns no SATD for clean PHP code', () => {
      const code = '<?php\nfunction add($a, $b) {\n    return $a + $b;\n}\n';
      const { smells } = analyzePhp(code);
      expect(smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });
  });
});
