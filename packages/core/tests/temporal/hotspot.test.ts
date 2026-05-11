import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { detectHotspots } from '../../src/temporal/hotspot';
import type { HealthResult } from '../../src/types';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const NOT_A_REPO = path.resolve(__dirname, '../../tests/fixtures');

function makeHealthResult(filePath: string, cc = 5, loc = 100): HealthResult {
  return {
    filePath,
    language: 'typescript',
    score: 8.0,
    category: 'green',
    smells: [],
    metrics: {
      cyclomaticComplexity: cc,
      cognitiveComplexity: cc,
      maxNestingDepth: 2,
      avgFunctionLength: 20,
      maxFunctionLength: 40,
      avgParameterCount: 2,
      maxParameterCount: 4,
      totalLines: loc,
      duplicationScore: 0,
    },
    functions: [],
  };
}

describe('detectHotspots', () => {
  it('returns [] for a path that is not a git repository', async () => {
    const result = await detectHotspots(NOT_A_REPO, []);
    expect(result).toEqual([]);
  });

  it('returns [] when perFileResults is empty', async () => {
    const result = await detectHotspots(REPO_ROOT, []);
    expect(result).toEqual([]);
  });

  it('returns an array for files in a real git repo', async () => {
    const files = [
      makeHealthResult(path.join(REPO_ROOT, 'packages/core/src/index.ts')),
    ];
    const result = await detectHotspots(REPO_ROOT, files);
    // Either returns hotspots or [] if the file has no commits in window
    expect(Array.isArray(result)).toBe(true);
  });

  it('each finding has required shape', async () => {
    const files = [
      makeHealthResult(path.join(REPO_ROOT, 'packages/core/src/index.ts')),
      makeHealthResult(path.join(REPO_ROOT, 'packages/core/src/analyzers/typescript.ts')),
    ];
    const result = await detectHotspots(REPO_ROOT, files);
    for (const h of result) {
      expect(h).toHaveProperty('filePath');
      expect(h).toHaveProperty('commitCount');
      expect(h).toHaveProperty('hotspotScore');
      expect(h).toHaveProperty('severity');
      expect(['low', 'medium', 'high']).toContain(h.severity);
    }
  });
}, 20000);
