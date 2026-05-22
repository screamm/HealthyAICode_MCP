import { describe, it, expect } from 'vitest';
import { analyzeYaml } from '../../src/analyzers/yaml';

const SIMPLE_YAML = `
name: my-service
version: 1.0.0
config:
  host: localhost
  port: 8080
`;

const LARGE_YAML_LINES = Array.from({ length: 510 }, (_, i) => `key_${i}: value_${i}`).join('\n');

const YAML_WITH_SATD = `
# TODO: remove this workaround after upgrade
name: legacy-service
version: 0.9.0
`;

describe('analyzeYaml', () => {
  it('returns empty functions array (no function-level analysis)', () => {
    const result = analyzeYaml(SIMPLE_YAML, 'config.yaml');
    expect(result.functions).toHaveLength(0);
  });

  it('returns valid metrics with totalLines', () => {
    const result = analyzeYaml(SIMPLE_YAML, 'config.yaml');
    expect(result.metrics.totalLines).toBeGreaterThan(0);
    expect(result.metrics.cyclomaticComplexity).toBe(1);
    expect(result.metrics.duplicationScore).toBe(0);
  });

  it('does not throw on empty input', () => {
    expect(() => analyzeYaml('', 'empty.yaml')).not.toThrow();
  });

  it('detects LargeFile smell when file exceeds 500 lines', () => {
    const result = analyzeYaml(LARGE_YAML_LINES, 'big.yaml');
    expect(result.smells.some(s => s.type === 'LargeFile')).toBe(true);
  });

  it('does NOT flag LargeFile for files with exactly 500 lines', () => {
    const code = Array.from({ length: 500 }, (_, i) => `key_${i}: val`).join('\n');
    const result = analyzeYaml(code, 'ok.yaml');
    expect(result.smells.some(s => s.type === 'LargeFile')).toBe(false);
  });

  it('detects SATD in YAML comments', () => {
    const result = analyzeYaml(YAML_WITH_SATD, 'legacy.yaml');
    expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
  });

  it('smells array is always an array', () => {
    const result = analyzeYaml(SIMPLE_YAML, 'config.yaml');
    expect(Array.isArray(result.smells)).toBe(true);
  });
});
