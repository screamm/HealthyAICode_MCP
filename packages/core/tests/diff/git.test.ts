import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock simple-git to avoid needing a real git repo in CI.
vi.mock('simple-git', () => {
  return {
    default: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import simpleGit from 'simple-git';
import * as fsp from 'fs/promises';
import { analyzeChangeset } from '../../src/diff/git';

const mockGit = {
  checkIsRepo: vi.fn(),
  diff: vi.fn(),
  show: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (simpleGit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);
});

describe('analyzeChangeset', () => {
  it('throws if path is not a git repository', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false);
    await expect(analyzeChangeset('/not/a/repo', 'main')).rejects.toThrow(
      /git-repository/i
    );
  });

  it('returns empty result when no files changed', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('');
    const result = await analyzeChangeset('/repo', 'main');
    expect(result.filesAnalyzed).toBe(0);
    expect(result.regressions).toHaveLength(0);
    expect(result.improvements).toHaveLength(0);
    expect(result.newUnhealthyFiles).toHaveLength(0);
    expect(result.overallSafe).toBe(true);
  });

  it('skips unsupported file types', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('README.md\ndata.csv\n');
    const result = await analyzeChangeset('/repo', 'main');
    expect(result.filesAnalyzed).toBe(2);
    expect(result.regressions).toHaveLength(0);
  });

  it('detects regression when score drops by more than 0.5', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/foo.ts\n');

    const baseCode = `
function simple(a: number): number {
  return a + 1;
}
`;
    const currentCode = `
function complex(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return f;
          }
        }
      }
    }
  }
  return 0;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(currentCode);
    mockGit.show.mockResolvedValue(baseCode);

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].filePath).toBe('src/foo.ts');
    expect(result.regressions[0].scoreBefore).toBeGreaterThan(
      result.regressions[0].scoreAfter
    );
    expect(result.overallSafe).toBe(false);
  });

  it('detects improvement when score rises by more than 0.5', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/bar.ts\n');

    const baseCode = `
function complex(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return f;
          }
        }
      }
    }
  }
  return 0;
}
`;
    const currentCode = `
function simple(a: number): number {
  return a + 1;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(currentCode);
    mockGit.show.mockResolvedValue(baseCode);

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].filePath).toBe('src/bar.ts');
    expect(result.overallSafe).toBe(true);
  });

  it('marks new unhealthy files (score < 7.0) when base version absent', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/newfile.ts\n');

    const unhealthyCode = `
function mess(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            if (f > 0) {
              if (a > 1) {
                if (b > 1) {
                  if (c > 1) {
                    if (d > 1) {
                      if (e > 1) {
                        return 1;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return 0;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(unhealthyCode);
    // show() throws = new file, no base version
    mockGit.show.mockRejectedValue(new Error('path not found'));

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.newUnhealthyFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.overallSafe).toBe(false);
  });

  it('ChangesetResult has required shape', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('');

    const result = await analyzeChangeset('/repo', 'main');
    expect(result).toHaveProperty('filesAnalyzed');
    expect(result).toHaveProperty('regressions');
    expect(result).toHaveProperty('improvements');
    expect(result).toHaveProperty('newUnhealthyFiles');
    expect(result).toHaveProperty('overallSafe');
  });
});
