// packages/core/src/temporal/complexity-trend.ts
import simpleGit from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';

export interface ComplexityPoint {
  x: number;  // commit-index (0 = oldest)
  y: number;  // total complexity at this commit
  sha: string;
}

export interface ComplexityTrendResult {
  filePath: string;
  slope: number;           // positive = rising complexity, negative = declining
  trajectory: 'rising' | 'stable' | 'declining';
  sampledPoints: ComplexityPoint[];
  commitsAnalyzed: number;
}

const STABLE_SLOPE_THRESHOLD = 0.1;

/**
 * Computes slope via least-squares linear regression.
 * Returns 0 for fewer than 2 points.
 */
export function linearRegressionSlope(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Returns an evenly distributed sample of N indices from a list with `total` elements.
 * First and last indices are always included.
 */
export function sampleComplexityPoints(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(Math.round(i * (total - 1) / (n - 1)));
  }
  return indices;
}

/**
 * Analyzes how a file's complexity changes over its git history by sampling N commits
 * and computing a linear regression slope over the sampled complexity values.
 */
export async function analyzeComplexityTrend(
  repoPath: string,
  filePath: string,
  options: { maxCommits?: number; samplePoints?: number } = {},
): Promise<ComplexityTrendResult> {
  const maxCommits = options.maxCommits ?? 200;
  const samplePoints = options.samplePoints ?? 5;
  const git = simpleGit(repoPath);

  let shas: string[] = [];
  try {
    const output = await git.raw([
      'log', '--follow',
      `--max-count=${maxCommits}`,
      '--format=%H',
      '--',
      filePath,
    ]);
    // git log returns newest-first — reverse for oldest-first on x-axis
    shas = output.trim().split('\n').filter(Boolean).reverse();
  } catch {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: 0 };
  }

  if (shas.length === 0) {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: 0 };
  }

  if (shas.length < 2) {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: shas.length };
  }

  const language = detectLanguage(filePath);
  if (language === 'unsupported') {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: shas.length };
  }

  const sampleIndices = sampleComplexityPoints(shas.length, samplePoints);
  const sampledPoints: ComplexityPoint[] = [];

  for (const idx of sampleIndices) {
    const sha = shas[idx];
    try {
      const content = await git.show([`${sha}:${filePath}`]);
      const result = analyzeByLanguage(content, language, filePath);
      const totalComplexity = result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
      sampledPoints.push({ x: idx, y: totalComplexity, sha });
    } catch {
      // File does not exist at this commit — skip
    }
  }

  if (sampledPoints.length < 2) {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints, commitsAnalyzed: shas.length };
  }

  const slope = linearRegressionSlope(sampledPoints);
  const trajectory: ComplexityTrendResult['trajectory'] =
    slope > STABLE_SLOPE_THRESHOLD ? 'rising'
    : slope < -STABLE_SLOPE_THRESHOLD ? 'declining'
    : 'stable';

  return {
    filePath,
    slope: parseFloat(slope.toFixed(4)),
    trajectory,
    sampledPoints,
    commitsAnalyzed: shas.length,
  };
}
