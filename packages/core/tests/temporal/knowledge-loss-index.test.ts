import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import {
  analyzeKnowledgeLossIndex,
  parseBlameOutput,
} from '../../src/temporal/knowledge-loss-index';

const mockRaw = vi.fn();
const mockGit = { raw: mockRaw };

beforeEach(() => {
  vi.clearAllMocks();
  (simpleGit as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);
});

// Helper to build synthetic blame output
function buildBlameOutput(entries: Array<{ email: string; lines: number }>): string {
  const lines: string[] = [];
  for (const { email, lines: count } of entries) {
    for (let i = 0; i < count; i++) {
      // Minimal line-porcelain snippet (hash + metadata block per line)
      lines.push('abc123def456abc123def456abc123def456abc1 1 1 1');
      lines.push(`author-mail <${email}>`);
      lines.push('author-time 1700000000');
      lines.push('\tconst x = 1;');
    }
  }
  return lines.join('\n');
}

describe('parseBlameOutput', () => {
  it('extracts correct email-to-line-count mapping', () => {
    const output = buildBlameOutput([
      { email: 'alice@co.com', lines: 3 },
      { email: 'bob@co.com', lines: 2 },
    ]);
    const result = parseBlameOutput(output);
    expect(result.get('alice@co.com')).toBe(3);
    expect(result.get('bob@co.com')).toBe(2);
    expect(result.size).toBe(2);
  });

  it('returns empty map for empty blame output', () => {
    const result = parseBlameOutput('');
    expect(result.size).toBe(0);
  });

  it('handles blame output without author-mail fields', () => {
    const output = 'abc123 1 1 1\nauthor Alice\nsome other line\n\tcode here';
    const result = parseBlameOutput(output);
    expect(result.size).toBe(0);
  });
});

describe('analyzeKnowledgeLossIndex', () => {
  it('returns KLI = 1.0 when all lines are authored by an inactive contributor', async () => {
    const blameOutput = buildBlameOutput([{ email: 'inactive@old.com', lines: 10 }]);
    // blame succeeds; git log returns no recent activity for inactive@old.com
    mockRaw
      .mockResolvedValueOnce(blameOutput)       // blame call
      .mockResolvedValueOnce('active@co.com\n'); // log call — active set does NOT include inactive@old.com

    const result = await analyzeKnowledgeLossIndex('/repo', 'src/file.ts');
    expect(result.knowledgeLossRatio).toBeCloseTo(1.0, 1);
    expect(result.isOrphaned).toBe(true);
  });

  it('returns KLI = 0.0 when all contributors are active', async () => {
    const blameOutput = buildBlameOutput([{ email: 'alice@co.com', lines: 10 }]);
    mockRaw
      .mockResolvedValueOnce(blameOutput)
      .mockResolvedValueOnce('alice@co.com\n');  // alice is active

    const result = await analyzeKnowledgeLossIndex('/repo', 'src/file.ts');
    expect(result.knowledgeLossRatio).toBeCloseTo(0.0, 5);
    expect(result.isOrphaned).toBe(false);
  });

  it('returns correct KLI for mixed scenario (50% inactive)', async () => {
    const blameOutput = buildBlameOutput([
      { email: 'active@co.com', lines: 5 },
      { email: 'inactive@old.com', lines: 5 },
    ]);
    mockRaw
      .mockResolvedValueOnce(blameOutput)
      .mockResolvedValueOnce('active@co.com\n');

    const result = await analyzeKnowledgeLossIndex('/repo', 'src/file.ts');
    expect(result.knowledgeLossRatio).toBeCloseTo(0.5, 1);
    expect(result.inactiveLines).toBe(5);
    expect(result.totalLines).toBe(10);
  });

  it('returns graceful result on git error', async () => {
    mockRaw.mockRejectedValue(new Error('not a git repository'));

    const result = await analyzeKnowledgeLossIndex('/not-a-repo', 'src/file.ts');
    expect(result.knowledgeLossRatio).toBe(0);
    expect(result.totalLines).toBe(0);
    expect(result.smell).toBeNull();
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  it('returns KLI = 0 for empty file (0 blame lines)', async () => {
    mockRaw
      .mockResolvedValueOnce('')       // blame returns nothing
      .mockResolvedValueOnce('');      // log returns nothing

    const result = await analyzeKnowledgeLossIndex('/repo', 'src/empty.ts');
    expect(result.knowledgeLossRatio).toBe(0);
    expect(result.totalLines).toBe(0);
    expect(result.smell).toBeNull();
  });

  it('returns KLI = 0.0 for all active contributors (second edge case)', async () => {
    const blameOutput = buildBlameOutput([
      { email: 'dev1@co.com', lines: 4 },
      { email: 'dev2@co.com', lines: 6 },
    ]);
    mockRaw
      .mockResolvedValueOnce(blameOutput)
      .mockResolvedValueOnce('dev1@co.com\ndev2@co.com\n');

    const result = await analyzeKnowledgeLossIndex('/repo', 'src/shared.ts');
    expect(result.knowledgeLossRatio).toBeCloseTo(0.0, 5);
    expect(result.isOrphaned).toBe(false);
  });
});
