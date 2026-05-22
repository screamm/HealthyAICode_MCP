import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BusFactorResult } from '../../src/types';

// ── Minimal compilation test ────────────────────────────────────────────────
// Verifies that BusFactorResult is importable from types (Task 1 acceptance criterion).
it('BusFactorResult interface compiles and has expected shape', () => {
  const r: BusFactorResult = {
    filePath: 'src/foo.ts',
    uniqueContributors: 1,
    normalizedEntropy: 0,
    busFactorEstimate: 1,
    isAtRisk: true,
    contributors: [{ email: 'a@b.com', commitShare: 1 }],
    smell: null,
  };
  expect(r.filePath).toBe('src/foo.ts');
});

// ── Pure logic unit tests (no git I/O) ─────────────────────────────────────
import {
  computeNormalizedEntropy,
  computeBusFactorEstimate,
  analyzeBusFactor,
} from '../../src/temporal/bus-factor';

describe('computeNormalizedEntropy', () => {
  it('returns 0 for a single contributor (all knowledge in one person)', () => {
    const map = new Map([['alice@co.com', 10]]);
    expect(computeNormalizedEntropy(map)).toBe(0);
  });

  it('returns 1.0 for two contributors with exactly 50/50 split', () => {
    const map = new Map([['alice@co.com', 5], ['bob@co.com', 5]]);
    expect(computeNormalizedEntropy(map)).toBeCloseTo(1.0, 5);
  });

  it('returns correct entropy for uneven split (70/30)', () => {
    const map = new Map([['alice@co.com', 7], ['bob@co.com', 3]]);
    const entropy = computeNormalizedEntropy(map);
    // H = -(0.7*log2(0.7) + 0.3*log2(0.3)) ≈ 0.8813
    // normalized = H / log2(2) = H ≈ 0.8813
    expect(entropy).toBeGreaterThan(0.7);
    expect(entropy).toBeLessThan(1.0);
  });

  it('returns 0 for empty commit map', () => {
    expect(computeNormalizedEntropy(new Map())).toBe(0);
  });
});

describe('computeBusFactorEstimate', () => {
  it('returns 1 when one person has > 50% of commits', () => {
    // alice: 80%, bob: 20%
    const shares = [0.8, 0.2];
    expect(computeBusFactorEstimate(shares)).toBe(1);
  });

  it('returns 2 when two people are needed for > 50%', () => {
    // alice: 35%, bob: 30%, charlie: 35% → need alice+bob = 65%
    const shares = [0.35, 0.30, 0.35];
    expect(computeBusFactorEstimate(shares)).toBe(2);
  });

  it('returns 0 for empty share list', () => {
    expect(computeBusFactorEstimate([])).toBe(0);
  });
});

// ── Integration tests with mocked simple-git ────────────────────────────────
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';

const mockRaw = vi.fn();
const mockGit = { raw: mockRaw };

beforeEach(() => {
  vi.clearAllMocks();
  (simpleGit as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);
});

describe('analyzeBusFactor (mocked git)', () => {
  it('busFactorEstimate = 1 when one person has > 50% of commits', async () => {
    // alice: 8 commits, bob: 2 commits → alice at 80%
    const gitLog = Array(8).fill('alice@co.com').concat(Array(2).fill('bob@co.com')).join('\n');
    mockRaw.mockResolvedValue(gitLog);

    const result = await analyzeBusFactor('/repo', 'src/file.ts');
    expect(result.busFactorEstimate).toBe(1);
    expect(result.isAtRisk).toBe(true);
    expect(result.uniqueContributors).toBe(2);
  });

  it('busFactorEstimate = 2 when two people are needed for > 50%', async () => {
    // alice: 4, bob: 4, charlie: 2  → alice+bob = 80%, each has 40%
    const entries = [...Array(4).fill('alice@co.com'), ...Array(4).fill('bob@co.com'), ...Array(2).fill('charlie@co.com')];
    mockRaw.mockResolvedValue(entries.join('\n'));

    const result = await analyzeBusFactor('/repo', 'src/file.ts');
    expect(result.busFactorEstimate).toBe(2);
  });

  it('isAtRisk = true when normalizedEntropy < 0.3', async () => {
    // One dominant contributor → entropy near 0
    const gitLog = Array(100).fill('alice@co.com').concat(['bob@co.com']).join('\n');
    mockRaw.mockResolvedValue(gitLog);

    const result = await analyzeBusFactor('/repo', 'src/file.ts');
    expect(result.isAtRisk).toBe(true);
    expect(result.normalizedEntropy).toBeLessThan(0.3);
  });

  it('produces high-severity smell when busFactorEstimate = 1 and isAtRisk = true', async () => {
    const gitLog = Array(8).fill('alice@co.com').concat(Array(2).fill('bob@co.com')).join('\n');
    mockRaw.mockResolvedValue(gitLog);

    const result = await analyzeBusFactor('/repo', 'src/file.ts');
    expect(result.smell).not.toBeNull();
    expect(result.smell!.severity).toBe('high');
    expect(result.smell!.type).toBe('KnowledgeLoss');
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  it('returns zero-result for empty git history (new file)', async () => {
    mockRaw.mockResolvedValue('');

    const result = await analyzeBusFactor('/repo', 'src/new-file.ts');
    expect(result.busFactorEstimate).toBe(0);
    expect(result.uniqueContributors).toBe(0);
    expect(result.smell).toBeNull();
  });

  it('returns zero-result gracefully on git error', async () => {
    mockRaw.mockRejectedValue(new Error('not a git repo'));

    const result = await analyzeBusFactor('/not-a-repo', 'src/file.ts');
    expect(result.busFactorEstimate).toBe(0);
    expect(result.smell).toBeNull();
  });

  it('normalizedEntropy = 0 for a single contributor', async () => {
    mockRaw.mockResolvedValue(Array(5).fill('solo@co.com').join('\n'));

    const result = await analyzeBusFactor('/repo', 'src/file.ts');
    expect(result.normalizedEntropy).toBe(0);
    expect(result.busFactorEstimate).toBe(1);
    expect(result.isAtRisk).toBe(true);
  });
});
