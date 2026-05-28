// packages/core/src/temporal/complexity-trend.ts
import simpleGit from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';

/** A single sampled data point mapping a commit index to the file's total complexity at that commit. */
export interface ComplexityPoint {
  x: number;  // commit-index (0 = oldest)
  y: number;  // total complexity at this commit
  sha: string;
}

/** Result of analyzing complexity trend for a single file over its git history. */
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

  const shas = await fetchCommitShas(git, filePath, maxCommits);
  const shaValidation = validateShas(shas, filePath);
  if (shaValidation !== null) return shaValidation;

  const language = detectLanguage(filePath);
  const languageValidation = validateLanguage(language, filePath, (shas as string[]).length);
  if (languageValidation !== null) return languageValidation;

  const ctx: FileAnalysisContext = { git, filePath, language };
  const sampledPoints = await collectSampledPoints(ctx, shas as string[], samplePoints);
  if (sampledPoints.length < 2) return stableResult(filePath, (shas as string[]).length, sampledPoints);

  return buildTrendResult(filePath, (shas as string[]).length, sampledPoints);
}

function validateShas(shas: string[] | null, filePath: string): ComplexityTrendResult | null {
  if (shas === null || shas.length === 0) return stableResult(filePath, 0);
  if (shas.length < 2) return stableResult(filePath, shas.length);
  return null;
}

function validateLanguage(
  language: ReturnType<typeof detectLanguage>,
  filePath: string,
  commitsAnalyzed: number,
): ComplexityTrendResult | null {
  if (language === 'unsupported') return stableResult(filePath, commitsAnalyzed);
  return null;
}

function stableResult(
  filePath: string,
  commitsAnalyzed: number,
  sampledPoints: ComplexityPoint[] = [],
): ComplexityTrendResult {
  return { filePath, slope: 0, trajectory: 'stable', sampledPoints, commitsAnalyzed };
}

async function fetchCommitShas(
  git: ReturnType<typeof simpleGit>,
  filePath: string,
  maxCommits: number,
): Promise<string[] | null> {
  try {
    const output = await git.raw([
      'log', '--follow',
      `--max-count=${maxCommits}`,
      '--format=%H',
      '--',
      filePath,
    ]);
    // git log returns newest-first — reverse for oldest-first on x-axis
    const trimmed = output.trim();
    const lines = trimmed.split('\n');
    const nonEmpty = lines.filter(Boolean);
    return nonEmpty.reverse();
  } catch {
    return null;
  }
}

interface FileAnalysisContext {
  git: ReturnType<typeof simpleGit>;
  filePath: string;
  language: ReturnType<typeof detectLanguage>;
}

async function collectSampledPoints(
  ctx: FileAnalysisContext,
  shas: string[],
  samplePoints: number,
): Promise<ComplexityPoint[]> {
  const sampleIndices = sampleComplexityPoints(shas.length, samplePoints);
  const sampledPoints: ComplexityPoint[] = [];

  for (const idx of sampleIndices) {
    const point = await fetchComplexityPoint(ctx, shas[idx], idx);
    if (point !== null) sampledPoints.push(point);
  }
  return sampledPoints;
}

async function fetchComplexityPoint(
  ctx: FileAnalysisContext,
  sha: string,
  idx: number,
): Promise<ComplexityPoint | null> {
  const { git, filePath, language } = ctx;
  try {
    const content = await git.show([`${sha}:${filePath}`]);
    const result = analyzeByLanguage(content, language, filePath);
    const totalComplexity = result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
    return { x: idx, y: totalComplexity, sha };
  } catch {
    // File does not exist at this commit — skip
    return null;
  }
}

function classifyTrajectory(slope: number): ComplexityTrendResult['trajectory'] {
  if (slope > STABLE_SLOPE_THRESHOLD) return 'rising';
  if (slope < -STABLE_SLOPE_THRESHOLD) return 'declining';
  return 'stable';
}

function buildTrendResult(
  filePath: string,
  commitsAnalyzed: number,
  sampledPoints: ComplexityPoint[],
): ComplexityTrendResult {
  const slope = linearRegressionSlope(sampledPoints);
  return {
    filePath,
    slope: parseFloat(slope.toFixed(4)),
    trajectory: classifyTrajectory(slope),
    sampledPoints,
    commitsAnalyzed,
  };
}
