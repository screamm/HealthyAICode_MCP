import { describe, it, expect, vi } from 'vitest';
import { getChangeFrequency } from '../../src/analyzers/change-frequency';

vi.mock('simple-git', () => {
  const mockRaw = vi.fn();
  return {
    simpleGit: vi.fn(() => ({ raw: mockRaw })),
    _mockRaw: mockRaw,
  };
});

describe('getChangeFrequency', () => {
  it('returns 3 when git log outputs 3 SHA lines', async () => {
    const { simpleGit } = await import('simple-git') as any;
    simpleGit.mockReturnValue({
      raw: vi.fn().mockResolvedValue('abc123\ndef456\nghi789\n'),
    });
    const count = await getChangeFrequency('/repo', 'src/file.ts');
    expect(count).toBe(3);
  });

  it('returns 0 when git log outputs empty string', async () => {
    const { simpleGit } = await import('simple-git') as any;
    simpleGit.mockReturnValue({
      raw: vi.fn().mockResolvedValue(''),
    });
    const count = await getChangeFrequency('/repo', 'src/file.ts');
    expect(count).toBe(0);
  });

  it('returns 0 when git throws an exception (never rethrows)', async () => {
    const { simpleGit } = await import('simple-git') as any;
    simpleGit.mockReturnValue({
      raw: vi.fn().mockRejectedValue(new Error('git not found')),
    });
    const count = await getChangeFrequency('/repo', 'src/file.ts');
    expect(count).toBe(0);
  });
});
