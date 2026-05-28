// packages/core/tests/temporal/method-coupling-tier-b.test.ts
//
// Verifies that MethodTemporalCoupling works for Tier B (regex-extracted) languages.
// This covers the language-neutral path in getMethodRangesAtCommit:
//   detectLanguage(.sh) → 'bash' → analyzeByLanguage → analyzeBash → regex extraction
//
// No vi.mock is applied here because Bash analysis uses analyzeGenericTierB (pure
// JS regex), so no native tree-sitter bindings are loaded — tests run cleanly.
//
// Note: the TypeScript regression test in method-coupling.test.ts mocks analyzeByLanguage
// for determinism; this test uses the real implementation to prove end-to-end Tier B flow.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { analyzeMethodCoupling } from '../../src/temporal/method-coupling';
import { getMethodRangesAtCommit, __clearMethodRangesCache } from '../../src/temporal/method-coupling-helpers';
import simpleGit from 'simple-git';
import {
  buildMethodCouplingBashRepo,
  type BashFixtureRepo,
} from '../fixtures/method-coupling-bash-repo-builder';

// Building 17 commits on Windows can take ~2 min; allow 4 min
const FIXTURE_TIMEOUT = 240_000;

let bashRepo: BashFixtureRepo;

beforeAll(async () => {
  bashRepo = await buildMethodCouplingBashRepo();
}, FIXTURE_TIMEOUT);

afterAll(async () => {
  await bashRepo.cleanup();
}, 30_000);

beforeEach(() => {
  __clearMethodRangesCache();
});

describe('MethodTemporalCoupling — Tier B (Bash) language-neutral fallback', () => {
  it('extracts method ranges from a Bash file via regex fallback', async () => {
    const git = simpleGit(bashRepo.rootPath);
    const log = await git.log({ file: bashRepo.filePath });
    const initialSha = log.all[log.all.length - 1].hash;

    const ranges = await getMethodRangesAtCommit({ repoPath: bashRepo.rootPath, filePath: bashRepo.filePath, commitSha: initialSha });
    const names = ranges.map(r => r.name);

    expect(names).toEqual(
      expect.arrayContaining(['deploy_app', 'validate_config', 'setup_env', 'teardown_env']),
    );
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    for (const r of ranges) {
      expect(r.line).toBeGreaterThan(0);
      expect(r.length).toBeGreaterThan(0);
    }
  }, FIXTURE_TIMEOUT);

  it('detects coupled-A pair (deploy_app + validate_config) in Bash file', async () => {
    const result = await analyzeMethodCoupling(
      bashRepo.rootPath,
      bashRepo.filePath,
      { threshold: 0.5 },
    );

    const pair = result.pairs.find(p =>
      [p.methodA, p.methodB].sort().join('|') ===
      ['deploy_app', 'validate_config'].sort().join('|'),
    );

    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThanOrEqual(0.5);
    expect(pair!.coChangeCount).toBeGreaterThanOrEqual(4);
  }, FIXTURE_TIMEOUT);

  it('detects coupled-B pair (setup_env + teardown_env) in Bash file', async () => {
    const result = await analyzeMethodCoupling(
      bashRepo.rootPath,
      bashRepo.filePath,
      { threshold: 0.5 },
    );

    const pair = result.pairs.find(p =>
      [p.methodA, p.methodB].sort().join('|') ===
      ['setup_env', 'teardown_env'].sort().join('|'),
    );

    expect(pair).toBeDefined();
    expect(pair!.coChangeCount).toBeGreaterThanOrEqual(4);
  }, FIXTURE_TIMEOUT);

  it('reports commitsAnalyzed matching the fixture commit count', async () => {
    const result = await analyzeMethodCoupling(
      bashRepo.rootPath,
      bashRepo.filePath,
      { threshold: 0.5 },
    );
    // 1 initial + 7 coupled-A + 4 coupled-B + 3 solo-A + 2 solo-D = 17 commits
    expect(result.commitsAnalyzed).toBe(17);
  }, FIXTURE_TIMEOUT);
});
