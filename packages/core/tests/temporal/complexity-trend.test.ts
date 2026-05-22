// packages/core/tests/temporal/complexity-trend.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  linearRegressionSlope,
  sampleComplexityPoints,
  analyzeComplexityTrend,
} from '../../src/temporal/complexity-trend';
import {
  buildBehavioralAnalyticsFixtureRepo,
  type BehavioralFixtureRepo,
} from '../fixtures/behavioral-analytics-repo-builder';

describe('linearRegressionSlope', () => {
  it('returns positive slope for rising sequence', () => {
    const points = [{ x: 0, y: 5 }, { x: 1, y: 7 }, { x: 2, y: 10 }, { x: 3, y: 13 }];
    expect(linearRegressionSlope(points)).toBeGreaterThan(0);
  });

  it('returns negative slope for declining sequence', () => {
    const points = [{ x: 0, y: 20 }, { x: 1, y: 15 }, { x: 2, y: 10 }, { x: 3, y: 5 }];
    expect(linearRegressionSlope(points)).toBeLessThan(0);
  });

  it('returns zero for constant sequence', () => {
    const points = [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }];
    expect(Math.abs(linearRegressionSlope(points))).toBeLessThan(0.001);
  });

  it('returns 0 for a single point', () => {
    expect(linearRegressionSlope([{ x: 0, y: 5 }])).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(linearRegressionSlope([])).toBe(0);
  });

  it('computes correct slope for known data', () => {
    // y = 2x + 1: slope should be exactly 2
    const points = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }];
    expect(linearRegressionSlope(points)).toBeCloseTo(2, 5);
  });
});

describe('sampleComplexityPoints — sampling indexing', () => {
  it('returns 5 indices for a list with 20 elements', () => {
    const indices = sampleComplexityPoints(20, 5);
    expect(indices).toHaveLength(5);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(19);
  });

  it('returns all indices for a list shorter than N', () => {
    const indices = sampleComplexityPoints(3, 5);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('returns evenly distributed indices', () => {
    const indices = sampleComplexityPoints(100, 5);
    const gaps = indices.slice(1).map((v, i) => v - indices[i]);
    const maxGap = Math.max(...gaps);
    const minGap = Math.min(...gaps);
    expect(maxGap - minGap).toBeLessThanOrEqual(2); // even gaps ±1
  });

  it('returns N indices for a list larger than N', () => {
    const indices = sampleComplexityPoints(50, 5);
    expect(indices).toHaveLength(5);
    expect(indices[0]).toBe(0);
    expect(indices[4]).toBe(49);
  });
});

describe('analyzeComplexityTrend — integration', () => {
  let repo: BehavioralFixtureRepo;

  beforeAll(async () => {
    repo = await buildBehavioralAnalyticsFixtureRepo();
  }, 60_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  it('identifies rising complexity in auth.ts', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(result.trajectory).toBe('rising');
    expect(result.slope).toBeGreaterThan(0);
  }, 30_000);

  it('auth.ts has at least 3 sampled points', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(result.sampledPoints.length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('handles non-existent file gracefully', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/does-not-exist.ts');
    expect(result.trajectory).toBe('stable');
    expect(result.sampledPoints).toHaveLength(0);
    expect(result.commitsAnalyzed).toBe(0);
  }, 10_000);

  it('commitsAnalyzed reflects actual commit count for auth.ts', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    // auth.ts appears in commits 0–12 = 13 commits
    expect(result.commitsAnalyzed).toBeGreaterThanOrEqual(10);
  }, 30_000);
});
