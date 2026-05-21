// packages/core/tests/temporal/method-coupling-helpers.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock tree-sitter-dependent modules to avoid native addon resolution issues
// (same pre-existing issue as tests/diff/git.test.ts and tests/analyzers/*.test.ts)
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

import simpleGit from 'simple-git';
import {
  getMethodRangesAtCommit,
  getChangedLineRanges,
  intersectChangedMethods,
  __clearMethodRangesCache,
} from '../../src/temporal/method-coupling-helpers';
import { buildMethodCouplingFixtureRepo, type FixtureRepo } from '../fixtures/method-coupling-repo-builder';

// Building 17 commits on Windows can take ~2 min; allow 4 min
const FIXTURE_TIMEOUT = 240_000;

// Share one fixture repo for all IO-based tests
let sharedRepo: FixtureRepo;
let initialSha: string;
let coupledA0Sha: string;

beforeAll(async () => {
  sharedRepo = await buildMethodCouplingFixtureRepo();
  const log = await simpleGit(sharedRepo.rootPath).log({ file: sharedRepo.filePath });
  initialSha = log.all[log.all.length - 1].hash;
  coupledA0Sha = log.all[log.all.length - 2].hash;
}, FIXTURE_TIMEOUT);

afterAll(async () => { await sharedRepo.cleanup(); }, 30_000);

// C4: clear cache before each test to prevent state-leakage between tests
beforeEach(__clearMethodRangesCache);

describe('getMethodRangesAtCommit', () => {
  it('returns function ranges from initial commit', async () => {
    const ranges = await getMethodRangesAtCommit(sharedRepo.rootPath, sharedRepo.filePath, initialSha);
    const names = ranges.map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['validateUser', 'formatError', 'parseToken', 'refreshToken']));
  });

  it('each range has positive line and length', async () => {
    const ranges = await getMethodRangesAtCommit(sharedRepo.rootPath, sharedRepo.filePath, initialSha);
    for (const r of ranges) {
      expect(r.line).toBeGreaterThan(0);
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for non-existent commit', async () => {
    const ranges = await getMethodRangesAtCommit(sharedRepo.rootPath, sharedRepo.filePath, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(ranges).toEqual([]);
  });

  it('returns empty array for unsupported file extension', async () => {
    const ranges = await getMethodRangesAtCommit(sharedRepo.rootPath, 'src/readme.md', initialSha);
    expect(ranges).toEqual([]);
  });
});

describe('getChangedLineRanges', () => {
  it('returns ranges for the initial commit (entire file as added)', async () => {
    const ranges = await getChangedLineRanges(sharedRepo.rootPath, sharedRepo.filePath, initialSha);
    // git show on an initial commit shows the entire file as "added"
    expect(ranges.length).toBeGreaterThan(0);
  });

  it('returns the line numbers that changed in a coupled-A commit', async () => {
    const ranges = await getChangedLineRanges(sharedRepo.rootPath, sharedRepo.filePath, coupledA0Sha);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    expect(ranges.every(([start, end]) => end >= start)).toBe(true);
  });

  it('returns empty array for non-existent commit', async () => {
    const ranges = await getChangedLineRanges(sharedRepo.rootPath, sharedRepo.filePath, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(ranges).toEqual([]);
  });
});

describe('intersectChangedMethods', () => {
  const methods = [
    { name: 'a', line: 1, length: 5 },   // lines 1-5
    { name: 'b', line: 7, length: 4 },   // lines 7-10
    { name: 'c', line: 12, length: 3 },  // lines 12-14
  ];

  it('returns empty when no changed lines', () => {
    expect(intersectChangedMethods([], methods)).toEqual([]);
  });

  it('returns the single method when one range falls inside it', () => {
    expect(intersectChangedMethods([[8, 8]], methods)).toEqual(['b']);
  });

  it('returns multiple methods when ranges hit multiple', () => {
    const out = intersectChangedMethods([[2, 3], [13, 13]], methods);
    expect(out.sort()).toEqual(['a', 'c']);
  });

  it('handles ranges spanning method boundaries', () => {
    const out = intersectChangedMethods([[5, 8]], methods);
    expect(out.sort()).toEqual(['a', 'b']);
  });

  it('ignores changes in gaps between methods', () => {
    expect(intersectChangedMethods([[6, 6], [11, 11]], methods)).toEqual([]);
  });

  it('does not duplicate a method when multiple ranges hit it', () => {
    expect(intersectChangedMethods([[2, 2], [4, 4]], methods)).toEqual(['a']);
  });
});
