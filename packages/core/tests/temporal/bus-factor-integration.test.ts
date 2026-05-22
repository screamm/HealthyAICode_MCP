// packages/core/tests/temporal/bus-factor-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildBusFactorFixtureRepo, type BusFactorFixtureRepo } from '../fixtures/bus-factor-repo-builder';
import { analyzeBusFactor } from '../../src/temporal/bus-factor';
import { analyzeSprintCongestion } from '../../src/temporal/sprint-congestion';
import { analyzeKnowledgeLossIndex } from '../../src/temporal/knowledge-loss-index';

// Building 13 commits on Windows can take a while
const FIXTURE_TIMEOUT = 120_000;

let repo: BusFactorFixtureRepo;

beforeAll(async () => {
  repo = await buildBusFactorFixtureRepo();
}, FIXTURE_TIMEOUT);

afterAll(async () => {
  await repo.cleanup();
}, 30_000);

describe('Bus factor integration tests (fixture repo)', () => {
  it('analyzeBusFactor: busFactorEstimate = 1 (alice has 77% of commits)', async () => {
    const result = await analyzeBusFactor(repo.rootPath, repo.filePath);
    // alice: 10/13 ≈ 77% → needs only alice for >50%, so busFactorEstimate = 1
    expect(result.busFactorEstimate).toBe(1);
    expect(result.isAtRisk).toBe(true);
  }, 30_000);

  it('analyzeBusFactor: uniqueContributors = 3 (alice, bob, charlie)', async () => {
    const result = await analyzeBusFactor(repo.rootPath, repo.filePath);
    expect(result.uniqueContributors).toBe(3);
  }, 30_000);

  it('analyzeSprintCongestion: charlie committed within 14 days → at least 1 active contributor', async () => {
    const result = await analyzeSprintCongestion(repo.rootPath, repo.filePath);
    // Charlie committed 10 days ago → should appear in sprint window
    expect(result.activeContributors).toBeGreaterThanOrEqual(1);
    expect(result.activeEmails.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('analyzeKnowledgeLossIndex: returns valid result without throwing', async () => {
    const result = await analyzeKnowledgeLossIndex(repo.rootPath, repo.filePath);
    // Just verify the shape — actual ratio depends on recency of all contributors
    expect(result).toHaveProperty('knowledgeLossRatio');
    expect(result).toHaveProperty('totalLines');
    expect(result).toHaveProperty('inactiveLines');
    expect(result).toHaveProperty('isOrphaned');
    expect(result.knowledgeLossRatio).toBeGreaterThanOrEqual(0);
    expect(result.knowledgeLossRatio).toBeLessThanOrEqual(1);
  }, 30_000);

  it('all three analyzers return gracefully when filePath does not exist', async () => {
    const nonExistentFile = 'src/does-not-exist.ts';

    const [bf, sc, kli] = await Promise.all([
      analyzeBusFactor(repo.rootPath, nonExistentFile),
      analyzeSprintCongestion(repo.rootPath, nonExistentFile),
      analyzeKnowledgeLossIndex(repo.rootPath, nonExistentFile),
    ]);

    expect(bf.busFactorEstimate).toBe(0);
    expect(bf.smell).toBeNull();
    expect(sc.activeContributors).toBe(0);
    expect(sc.smell).toBeNull();
    expect(kli.knowledgeLossRatio).toBe(0);
    expect(kli.smell).toBeNull();
  }, 30_000);
});
