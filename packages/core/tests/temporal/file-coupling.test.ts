// packages/core/tests/temporal/file-coupling.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeFileCoupling } from '../../src/temporal/file-coupling';
import {
  buildBehavioralAnalyticsFixtureRepo,
  type BehavioralFixtureRepo,
} from '../fixtures/behavioral-analytics-repo-builder';

describe('analyzeFileCoupling', () => {
  let repo: BehavioralFixtureRepo;

  beforeAll(async () => {
    repo = await buildBehavioralAnalyticsFixtureRepo();
  }, 300_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  it('identifies auth.ts <-> utils.ts coupling above threshold', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180, // covers entire fixture history
      threshold: 0.3,
    });
    const pair = result.pairs.find(p => {
      const files = new Set([p.fileA, p.fileB]);
      return files.has('src/auth.ts') && files.has('src/utils.ts');
    });
    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThanOrEqual(0.3);
  }, 30_000);

  it('types.ts is not coupled to auth.ts above threshold', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.3,
    });
    const pair = result.pairs.find(p => {
      const files = new Set([p.fileA, p.fileB]);
      return files.has('src/auth.ts') && files.has('src/types.ts');
    });
    // types.ts changes rarely with auth.ts — should be below threshold
    expect(pair?.couplingStrength ?? 0).toBeLessThan(0.3);
  }, 30_000);

  it('respects windowDays parameter', async () => {
    const longWindow = await analyzeFileCoupling(repo.rootPath, { windowDays: 180, threshold: 0.1 });
    const shortWindow = await analyzeFileCoupling(repo.rootPath, { windowDays: 10, threshold: 0.1 });
    expect(longWindow.commitsAnalyzed).toBeGreaterThan(shortWindow.commitsAnalyzed);
  }, 30_000);

  it('returns empty pairs for extremely high threshold', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.99,
    });
    expect(result.pairs).toHaveLength(0);
  }, 30_000);

  it('pairs are sorted by coupling strength descending', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.1,
    });
    for (let i = 1; i < result.pairs.length; i++) {
      expect(result.pairs[i - 1].couplingStrength).toBeGreaterThanOrEqual(
        result.pairs[i].couplingStrength,
      );
    }
  }, 30_000);

  it('does not throw for a very short window with no commits', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, { windowDays: 1, threshold: 0.3 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.pairs)).toBe(true);
  }, 10_000);

  it('couplingStrength is in [0, 1] for all pairs', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.0,
    });
    for (const pair of result.pairs) {
      expect(pair.couplingStrength).toBeGreaterThanOrEqual(0);
      expect(pair.couplingStrength).toBeLessThanOrEqual(1);
    }
  }, 30_000);
});
