import { describe, it, expect } from 'vitest';
import * as path from 'path';

// Fixture paths resolve relative to this file → packages/core/tests/fixtures
const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../../core/tests/fixtures'
);

describe('Integration: healthy fixture → loopComplete: true', () => {
  it('simple.ts (TypeScript healthy) yields score >= 9.0 and zero smells', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/simple.ts'));

    expect(result.score).toBeGreaterThanOrEqual(9.0);
    expect(result.category).toBe('green');
    expect(result.smells).toHaveLength(0);

    const loopComplete = result.score >= 9.5;
    expect(loopComplete).toBe(true);
  });

  it('pure-functions.ts (TypeScript healthy) yields score >= 9.0', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/pure-functions.ts'));

    expect(result.score).toBeGreaterThanOrEqual(9.0);
    expect(result.category).toBe('green');
  });
});

describe('Integration: unhealthy fixture → loopComplete: false', () => {
  it('complex.ts (TypeScript unhealthy) yields score < 7.0 with smells', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'unhealthy/complex.ts'));

    expect(result.score).toBeLessThan(7.0);
    expect(result.smells.length).toBeGreaterThan(0);

    const loopComplete = result.score >= 9.5;
    expect(loopComplete).toBe(false);
  });

  it('complex.ts smells include at least one of: ComplexMethod, DeepNesting, LongParameterList', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'unhealthy/complex.ts'));

    const expectedSmells = ['ComplexMethod', 'DeepNesting', 'LongParameterList', 'LargeMethod'];
    const detectedTypes = result.smells.map(s => s.type);
    const hasExpectedSmell = expectedSmells.some(s => detectedTypes.includes(s));
    expect(hasExpectedSmell).toBe(true);
  });
});

describe('Integration: edge-case fixtures', () => {
  it('edge-cases/empty.ts yields score 10.0 with zero smells', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/empty.ts'));

    expect(result.score).toBe(10.0);
    expect(result.smells).toHaveLength(0);
  });

  it('edge-cases/single-line.ts yields score 10.0', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/single-line.ts'));

    expect(result.score).toBe(10.0);
  });

  it('edge-cases/only-comments.ts does not crash and returns score 10.0', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/only-comments.ts'));

    expect(result.score).toBe(10.0);
    expect(result.smells).toHaveLength(0);
  });
});

describe('Integration: HealthResult shape', () => {
  it('result always contains required fields', async () => {
    const { analyzeFile } = await import('@healthy-ai-code/core');
    const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/simple.ts'));

    expect(typeof result.score).toBe('number');
    expect(['green', 'yellow', 'red']).toContain(result.category);
    expect(Array.isArray(result.smells)).toBe(true);
    expect(Array.isArray(result.functions)).toBe(true);
    expect(typeof result.metrics).toBe('object');
    expect(typeof result.metrics.cyclomaticComplexity).toBe('number');
    expect(typeof result.metrics.totalLines).toBe('number');
  });
});
