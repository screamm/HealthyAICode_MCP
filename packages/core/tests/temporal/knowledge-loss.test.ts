import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { analyzeKnowledgeLoss } from '../../src/temporal/knowledge-loss';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const NOT_A_REPO = os.tmpdir();

describe('analyzeKnowledgeLoss', () => {
  it('returns busFactorEstimate -1 for invalid repo path', async () => {
    const result = await analyzeKnowledgeLoss(NOT_A_REPO, 'any/file.ts');
    expect(result.busFactorEstimate).toBe(-1);
    expect(result.smell).toBeNull();
  });

  it('returns result with correct shape', async () => {
    const result = await analyzeKnowledgeLoss(REPO_ROOT, 'packages/core/src/index.ts');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('busFactorEstimate');
    expect(result).toHaveProperty('primaryAuthor');
    expect(result).toHaveProperty('primaryOwnershipRatio');
    expect(result).toHaveProperty('smell');
  });

  it('primaryOwnershipRatio is between 0 and 1', async () => {
    const result = await analyzeKnowledgeLoss(REPO_ROOT, 'packages/core/src/index.ts');
    if (result.busFactorEstimate !== -1) {
      expect(result.primaryOwnershipRatio).toBeGreaterThanOrEqual(0);
      expect(result.primaryOwnershipRatio).toBeLessThanOrEqual(1);
    }
  });

  it('busFactorEstimate is at least 1 for a real file', async () => {
    const result = await analyzeKnowledgeLoss(REPO_ROOT, 'packages/core/src/index.ts');
    if (result.busFactorEstimate !== -1) {
      expect(result.busFactorEstimate).toBeGreaterThanOrEqual(1);
    }
  });

  it('smell has correct type when primary ownership >= 80%', async () => {
    const result = await analyzeKnowledgeLoss(REPO_ROOT, 'packages/core/src/index.ts');
    if (result.smell !== null) {
      expect(result.smell.type).toBe('KnowledgeLoss');
      expect(result.smell.severity).toBe('high');
      expect(result.smell.description).toContain(result.primaryAuthor);
    }
  });
}, 15000);
