import { type SimpleGit } from 'simple-git';
import * as path from 'path';
import type { HealthResult, MetricBreakdown } from '../types';

const HIGH_SEVERITY_PCT = 0.01, MEDIUM_SEVERITY_PCT = 0.05;

/** Scored representation of a single file's hotspot potential. */
export type ScoredFile = { filePath: string; commitCount: number; complexity: number; hotspotScore: number };

/** Scores each file by combining commit frequency with structural complexity. Files with zero commits are excluded. */
export async function scoreFiles(git: SimpleGit, files: HealthResult[], rootPath: string, window: string): Promise<ScoredFile[]> {
  const out: ScoredFile[] = [];
  for (const file of files) {
    const relPath = path.relative(rootPath, file.filePath);
    const commitCount = await countCommits(git, relPath, window);
    if (commitCount === 0) continue;
    const complexity = complexityScore(file.metrics);
    out.push({ filePath: file.filePath, commitCount, complexity, hotspotScore: commitCount * complexity });
  }
  return out;
}

/** Classifies a hotspot entry as high, medium, or low severity based on its rank percentile. */
export function classifyHotspotSeverity(idx: number, total: number): 'low' | 'medium' | 'high' {
  const pct = idx / Math.max(total, 1);
  if (pct < HIGH_SEVERITY_PCT) return 'high';
  if (pct < MEDIUM_SEVERITY_PCT) return 'medium';
  return 'low';
}

async function countCommits(git: SimpleGit, relPath: string, window: string): Promise<number> {
  try {
    const result = await git.raw(['log', '--follow', `--since=${window}`, '--format=%H', '--', relPath]);
    return result.trim().split('\n').filter(Boolean).length;
  } catch { return 0; }
}

function complexityScore(m: MetricBreakdown): number {
  return m.cyclomaticComplexity + m.cognitiveComplexity + Math.log10(Math.max(m.totalLines, 1));
}
