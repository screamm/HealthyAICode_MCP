import { describe, it, expect } from 'vitest';
import { analyzeGenericTierB } from '../../src/analyzers/generic-tier-b';
import type { TierBConfig } from '../../src/analyzers/generic-tier-b';

const BASH_LIKE_CONFIG: TierBConfig = {
  language: 'bash',
  functionPatterns: [
    /^(\w[\w:-]*)\s*\(\s*\)\s*\{/,
    /^\s*function\s+(\w[\w:-]*)/,
  ],
  controlFlowKeywords: /\b(if|elif|while|for|until|case)\b|\s&&\s|\s\|\|\s/g,
  commentPrefix: '#',
};

describe('analyzeGenericTierB', () => {
  it('extracts a single function and counts control-flow keywords', () => {
    const code = 'foo() {\n  if [ $x -gt 0 ]; then\n    echo hi\n  fi\n}';
    const result = analyzeGenericTierB(code, 'foo.sh', BASH_LIKE_CONFIG);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('foo');
    expect(result.functions[0].cyclomaticComplexity).toBe(2); // base 1 + 1 `if`
  });

  it('extracts multiple functions', () => {
    const code = [
      'setup() {',
      '  echo setup',
      '}',
      'teardown() {',
      '  echo teardown',
      '}',
    ].join('\n');
    const result = analyzeGenericTierB(code, 'test.sh', BASH_LIKE_CONFIG);
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe('setup');
    expect(result.functions[1].name).toBe('teardown');
  });

  it('returns base CC of 1 for a function with no control flow', () => {
    const code = 'hello() {\n  echo hello\n}';
    const result = analyzeGenericTierB(code, 'hello.sh', BASH_LIKE_CONFIG);
    expect(result.functions[0].cyclomaticComplexity).toBe(1);
  });

  it('handles empty input gracefully', () => {
    const result = analyzeGenericTierB('', 'empty.sh', BASH_LIKE_CONFIG);
    expect(result.functions).toHaveLength(0);
    expect(result.metrics.totalLines).toBe(0);
  });

  it('returns correct totalLines', () => {
    const code = 'foo() {\n  echo hi\n}\n';
    const result = analyzeGenericTierB(code, 'foo.sh', BASH_LIKE_CONFIG);
    expect(result.metrics.totalLines).toBe(4);
  });

  it('detects SATD in code', () => {
    const code = 'foo() {\n  # TODO: fix this later\n  echo hi\n}';
    const result = analyzeGenericTierB(code, 'foo.sh', BASH_LIKE_CONFIG);
    expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
  });

  it('smells array is always an array', () => {
    const result = analyzeGenericTierB('foo() { echo hi }', 'f.sh', BASH_LIKE_CONFIG);
    expect(Array.isArray(result.smells)).toBe(true);
  });

  it('function line numbers are 1-indexed', () => {
    const code = 'foo() {\n  echo hi\n}';
    const result = analyzeGenericTierB(code, 'foo.sh', BASH_LIKE_CONFIG);
    expect(result.functions[0].line).toBe(1);
  });
});
