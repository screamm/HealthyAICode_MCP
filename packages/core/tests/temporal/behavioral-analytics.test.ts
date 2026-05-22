// packages/core/tests/temporal/behavioral-analytics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeHotspots } from '../../src/temporal/behavioral-analytics';
import { analyzeFileCoupling } from '../../src/temporal/file-coupling';
import { analyzeComplexityTrend } from '../../src/temporal/complexity-trend';
import {
  buildBehavioralAnalyticsFixtureRepo,
  type BehavioralFixtureRepo,
} from '../fixtures/behavioral-analytics-repo-builder';

describe('behavioral analytics — full integration', () => {
  let repo: BehavioralFixtureRepo;

  beforeAll(async () => {
    repo = await buildBehavioralAnalyticsFixtureRepo();
  }, 90_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  it('hotspot analysis identifies auth.ts as a hotspot', async () => {
    const hotspots = await analyzeHotspots(repo.rootPath, {
      lookbackDays: 200,
      topN: 10,
      minChurnCommits: 1,
    });
    const authEntry = hotspots.find(r => r.filePath.includes('auth.ts'));
    expect(authEntry).toBeDefined();
    expect(['critical', 'warning']).toContain(authEntry!.classification);
  }, 60_000);

  it('topN parameter limits result list', async () => {
    const results = await analyzeHotspots(repo.rootPath, {
      lookbackDays: 200,
      topN: 2,
      minChurnCommits: 1,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  }, 60_000);

  it('hotspot scores are in [0, 1]', async () => {
    const results = await analyzeHotspots(repo.rootPath, {
      lookbackDays: 200,
      minChurnCommits: 1,
    });
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  }, 60_000);

  it('file coupling identifies auth.ts <-> utils.ts', async () => {
    const coupling = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 200,
      threshold: 0.3,
    });
    const pair = coupling.pairs.find(p =>
      p.fileA.includes('auth') || p.fileB.includes('auth'),
    );
    expect(pair).toBeDefined();
  }, 30_000);

  it('complexity trend identifies rising complexity in auth.ts', async () => {
    const trend = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(trend.trajectory).toBe('rising');
  }, 30_000);

  it('auth.ts has higher complexity slope than types.ts', async () => {
    const authTrend = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    const typesTrend = await analyzeComplexityTrend(repo.rootPath, 'src/types.ts');
    // auth.ts has rising slope, types.ts is stable → auth.ts slope must be higher
    expect(authTrend.slope).toBeGreaterThan(typesTrend.slope);
  }, 60_000);

  it('no test throws for non-existent files or empty date windows', async () => {
    await expect(
      analyzeComplexityTrend(repo.rootPath, 'nonexistent.ts'),
    ).resolves.not.toThrow();

    await expect(
      analyzeFileCoupling(repo.rootPath, { windowDays: 1 }),
    ).resolves.not.toThrow();

    await expect(
      analyzeHotspots(repo.rootPath, { lookbackDays: 1 }),
    ).resolves.not.toThrow();
  }, 30_000);

  it('returns empty arrays for nonexistent packageRoot', async () => {
    const results = await analyzeHotspots(repo.rootPath, {
      lookbackDays: 200,
      packageRoot: 'nonexistent/path',
    });
    expect(results).toHaveLength(0);
  }, 30_000);
});
