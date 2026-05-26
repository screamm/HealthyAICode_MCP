import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { analyzeDeveloperCongestion } from '../../src/temporal/developer-congestion';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const NOT_A_REPO = os.tmpdir();

describe('analyzeDeveloperCongestion', () => {
  it('returns authorCount 0 and null smell for invalid repo path', async () => {
    const result = await analyzeDeveloperCongestion(NOT_A_REPO, 'any/file.ts');
    expect(result.authorCount).toBe(0);
    expect(result.smell).toBeNull();
  });

  it('returns result with correct shape', async () => {
    const result = await analyzeDeveloperCongestion(REPO_ROOT, 'packages/core/src/index.ts');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('authorCount');
    expect(result).toHaveProperty('authors');
    expect(result).toHaveProperty('smell');
    expect(Array.isArray(result.authors)).toBe(true);
    expect(result.authorCount).toBeGreaterThanOrEqual(0);
  });

  it('authorCount matches authors array length', async () => {
    const result = await analyzeDeveloperCongestion(REPO_ROOT, 'packages/core/src/index.ts');
    expect(result.authorCount).toBe(result.authors.length);
  });

  it('smell is null when only one author', async () => {
    // Single-author project → no congestion
    const result = await analyzeDeveloperCongestion(REPO_ROOT, 'packages/core/src/index.ts');
    if (result.authorCount < 3) {
      expect(result.smell).toBeNull();
    }
  });

  it('smell has correct type when fired', async () => {
    const result = await analyzeDeveloperCongestion(REPO_ROOT, 'packages/core/src/index.ts');
    if (result.smell !== null) {
      expect(result.smell.type).toBe('DeveloperCongestion');
      expect(['low', 'medium', 'high']).toContain(result.smell.severity);
    }
  });
}, 60000); // git log on the real repo can be slow as the repo grows
