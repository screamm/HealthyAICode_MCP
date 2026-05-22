import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import { analyzeSprintCongestion } from '../../src/temporal/sprint-congestion';

const mockRaw = vi.fn();
const mockGit = { raw: mockRaw };

beforeEach(() => {
  vi.clearAllMocks();
  (simpleGit as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);
});

function makeGitLog(emails: string[]): string {
  return emails.join('\n');
}

describe('analyzeSprintCongestion', () => {
  it('returns isCongestedSprint = false for 2 active contributors', async () => {
    mockRaw.mockResolvedValue(makeGitLog(['alice@co.com', 'bob@co.com']));

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.activeContributors).toBe(2);
    expect(result.isCongestedSprint).toBe(false);
    expect(result.smell).toBeNull();
  });

  it('returns isCongestedSprint = true for 3 active contributors', async () => {
    mockRaw.mockResolvedValue(makeGitLog(['alice@co.com', 'bob@co.com', 'charlie@co.com']));

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.activeContributors).toBe(3);
    expect(result.isCongestedSprint).toBe(true);
    expect(result.smell).not.toBeNull();
    expect(result.smell!.severity).toBe('medium');
  });

  it('returns isCongestedSprint = true for 5 active contributors', async () => {
    mockRaw.mockResolvedValue(makeGitLog([
      'a@co.com', 'b@co.com', 'c@co.com', 'd@co.com', 'e@co.com',
    ]));

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.activeContributors).toBe(5);
    expect(result.isCongestedSprint).toBe(true);
  });

  it('produces medium-severity smell when 3–4 contributors', async () => {
    mockRaw.mockResolvedValue(makeGitLog(['a@co.com', 'b@co.com', 'c@co.com', 'd@co.com']));

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.smell).not.toBeNull();
    expect(result.smell!.severity).toBe('medium');
    expect(result.smell!.type).toBe('DeveloperCongestion');
  });

  it('produces high-severity smell when 5+ contributors', async () => {
    mockRaw.mockResolvedValue(makeGitLog([
      'a@co.com', 'b@co.com', 'c@co.com', 'd@co.com', 'e@co.com', 'f@co.com',
    ]));

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.smell).not.toBeNull();
    expect(result.smell!.severity).toBe('high');
  });

  it('returns empty result gracefully on git error', async () => {
    mockRaw.mockRejectedValue(new Error('not a git repository'));

    const result = await analyzeSprintCongestion('/not-a-repo', 'src/file.ts');
    expect(result.activeContributors).toBe(0);
    expect(result.isCongestedSprint).toBe(false);
    expect(result.smell).toBeNull();
  });

  // ── Edge case ─────────────────────────────────────────────────────────────
  it('returns activeContributors = 0 when no commits in last 14 days', async () => {
    mockRaw.mockResolvedValue('');

    const result = await analyzeSprintCongestion('/repo', 'src/file.ts');
    expect(result.activeContributors).toBe(0);
    expect(result.isCongestedSprint).toBe(false);
  });
});
