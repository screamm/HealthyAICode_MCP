import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { analyzeCodeChurn } from '../../src/temporal/code-churn';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
// tmpdir exists on disk but is not a git repo
const NOT_A_REPO = os.tmpdir();

describe('analyzeCodeChurn', () => {
  it('returns churnRate 0 and null smell for invalid repo path', async () => {
    const result = await analyzeCodeChurn({ repoPath: NOT_A_REPO, filePath: 'any/file.ts', linesOfCode: 100 });
    expect(result.churnRate).toBe(0);
    expect(result.smell).toBeNull();
  });

  it('returns result with correct shape', async () => {
    const result = await analyzeCodeChurn({ repoPath: REPO_ROOT, filePath: 'packages/core/src/index.ts', linesOfCode: 50 });
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('linesAdded');
    expect(result).toHaveProperty('linesDeleted');
    expect(result).toHaveProperty('churnRate');
    expect(result).toHaveProperty('smell');
    expect(result.churnRate).toBeGreaterThanOrEqual(0);
  });

  it('smell is null when churnRate is low', async () => {
    // A file with very high LOC has proportionally low churn rate
    const result = await analyzeCodeChurn({ repoPath: REPO_ROOT, filePath: 'packages/core/src/index.ts', linesOfCode: 999999 });
    expect(result.smell).toBeNull();
  });

  it('smell has correct type when fired', async () => {
    // Use a low LOC to force a high churn rate
    const result = await analyzeCodeChurn({ repoPath: REPO_ROOT, filePath: 'packages/core/src/index.ts', linesOfCode: 1 });
    if (result.smell !== null) {
      expect(result.smell.type).toBe('CodeChurn');
      expect(['low', 'medium', 'high']).toContain(result.smell.severity);
    }
  });
}, 60000); // git log on the real repo can be slow as the repo grows
