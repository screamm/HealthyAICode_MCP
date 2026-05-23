// packages/core/tests/temporal/method-coupling.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock tree-sitter-dependent modules to avoid native addon resolution issues
// (same pre-existing issue as tests/diff/git.test.ts and tests/analyzers/*.test.ts).
// The mock returns deterministic function ranges matching the fixture file layout:
//   validateUser: lines 1-3, formatError: lines 5-7, parseToken: lines 9-11, refreshToken: lines 13-15
vi.mock('../../src/analyzers', () => ({
  analyzeByLanguage: vi.fn((_code: string, _lang: string, _filePath: string) => ({
    functions: [
      { name: 'validateUser', line: 1,  length: 3, cyclomaticComplexity: 1, cognitiveComplexity: 0, nestingDepth: 0, parameterCount: 1, smells: [] },
      { name: 'formatError',  line: 5,  length: 3, cyclomaticComplexity: 1, cognitiveComplexity: 0, nestingDepth: 0, parameterCount: 1, smells: [] },
      { name: 'parseToken',   line: 9,  length: 3, cyclomaticComplexity: 1, cognitiveComplexity: 0, nestingDepth: 0, parameterCount: 1, smells: [] },
      { name: 'refreshToken', line: 13, length: 3, cyclomaticComplexity: 1, cognitiveComplexity: 0, nestingDepth: 0, parameterCount: 1, smells: [] },
    ],
    metrics: { cyclomaticComplexity: 1, cognitiveComplexity: 0, maxNestingDepth: 0, avgFunctionLength: 3, maxFunctionLength: 3, avgParameterCount: 1, maxParameterCount: 1, totalLines: 16, duplicationScore: 0 },
    smells: [],
  })),
}));

import { analyzeMethodCoupling, methodCouplingToSmells } from '../../src/temporal/method-coupling';
import { buildMethodCouplingFixtureRepo, type FixtureRepo } from '../fixtures/method-coupling-repo-builder';

// Building 17 commits on Windows can take ~2 min; allow 4 min for shared fixture
const FIXTURE_TIMEOUT = 240_000;

// Share one fixture repo for all integration tests to avoid building multiple repos
let sharedRepo: FixtureRepo;

beforeAll(async () => {
  sharedRepo = await buildMethodCouplingFixtureRepo();
}, FIXTURE_TIMEOUT);

afterAll(async () => {
  await sharedRepo.cleanup();
}, 30_000);

describe('analyzeMethodCoupling', () => {
  it('identifies the coupled-A pair above threshold', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.5 });
    const pair = result.pairs.find(p =>
      [p.methodA, p.methodB].sort().join('|') === ['formatError', 'validateUser'].sort().join('|')
    );
    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThanOrEqual(0.6);
  }, 120_000);

  it('identifies the coupled-B pair above threshold', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.5 });
    const pair = result.pairs.find(p =>
      [p.methodA, p.methodB].sort().join('|') === ['parseToken', 'refreshToken'].sort().join('|')
    );
    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThanOrEqual(0.6);
  }, 120_000);

  it('does not include pairs below threshold', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.5 });
    for (const p of result.pairs) {
      expect(p.couplingStrength).toBeGreaterThanOrEqual(0.5);
    }
  }, 180_000);

  it('sorts pairs by coupling strength desc', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.3 });
    for (let i = 1; i < result.pairs.length; i++) {
      expect(result.pairs[i - 1].couplingStrength).toBeGreaterThanOrEqual(result.pairs[i].couplingStrength);
    }
  }, 120_000);
});

describe('analyzeMethodCoupling — edge cases', () => {
  it('respects maxCommits cap', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { maxCommits: 3, threshold: 0.5 });
    expect(result.commitsAnalyzed).toBeLessThanOrEqual(3);
  }, 120_000);

  it('respects threshold parameter (raising it shrinks pair list)', async () => {
    const lax = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.3 });
    const strict = await analyzeMethodCoupling(sharedRepo.rootPath, sharedRepo.filePath, { threshold: 0.85 });
    expect(strict.pairs.length).toBeLessThanOrEqual(lax.pairs.length);
  }, 240_000);

  it('handles non-existent file gracefully', async () => {
    const result = await analyzeMethodCoupling(sharedRepo.rootPath, 'src/does-not-exist.ts', { threshold: 0.5 });
    expect(result.pairs).toEqual([]);
  }, 120_000);
});

describe('methodCouplingToSmells', () => {
  it('produces smells with type MethodTemporalCoupling', () => {
    const result = {
      filePath: 'src/auth.ts',
      commitsAnalyzed: 16,
      threshold: 0.5,
      pairs: [{
        methodA: 'validateUser', methodB: 'formatError',
        coChangeCount: 7, combinedTouches: 10,
        couplingStrength: 0.7, severity: 'high' as const,
      }],
    };
    const smells = methodCouplingToSmells(result);
    expect(smells).toHaveLength(1);
    expect(smells[0].type).toBe('MethodTemporalCoupling');
    expect(smells[0].description).toContain('validateUser');
    expect(smells[0].description).toContain('formatError');
  });

  it('maps high severity pair to medium smell (conservative advisory)', () => {
    const result = {
      filePath: 'src/auth.ts',
      commitsAnalyzed: 10,
      threshold: 0.5,
      pairs: [{
        methodA: 'a', methodB: 'b',
        coChangeCount: 8, combinedTouches: 10,
        couplingStrength: 0.8, severity: 'high' as const,
      }],
    };
    const smells = methodCouplingToSmells(result);
    expect(smells[0].severity).toBe('medium');
  });

  it('returns empty for empty pairs', () => {
    const smells = methodCouplingToSmells({ filePath: 'x.ts', commitsAnalyzed: 0, threshold: 0.5, pairs: [] });
    expect(smells).toEqual([]);
  });
});
