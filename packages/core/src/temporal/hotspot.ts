import simpleGit, { type SimpleGit } from 'simple-git';
import * as path from 'path';
import type { HealthResult, MetricBreakdown } from '../types';

const DEFAULT_WINDOW = '12 months';
const TOP_N_DEFAULT = 10;

export interface HotspotFinding {
  filePath: string;
  commitCount: number;
  complexityScore: number;
  hotspotScore: number;
  severity: 'low' | 'medium' | 'high';
  rankPercentile: number; // 0–100
}

type ScoredFile = { filePath: string; commitCount: number; complexity: number; hotspotScore: number };

async function scoreFiles(git: SimpleGit, files: HealthResult[], rootPath: string, window: string): Promise<ScoredFile[]> {
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

export async function detectHotspots(rootPath: string, perFileResults: HealthResult[], window = DEFAULT_WINDOW, topN = TOP_N_DEFAULT): Promise<HotspotFinding[]> {
  const git = simpleGit(rootPath);
  let isRepo = false;
  try { isRepo = await git.checkIsRepo(); } catch { isRepo = false; }
  if (!isRepo) return [];
  const scored = (await scoreFiles(git, perFileResults, rootPath, window)).sort((a, b) => b.hotspotScore - a.hotspotScore);
  const cutoff = Math.max(topN, Math.ceil(scored.length * 0.1));
  return scored.slice(0, cutoff).map((s, idx) => ({ filePath: s.filePath, commitCount: s.commitCount, complexityScore: s.complexity, hotspotScore: s.hotspotScore, severity: classifyHotspotSeverity(idx, scored.length), rankPercentile: Math.round((idx / Math.max(scored.length, 1)) * 100) }));
}

async function countCommits(
  git: SimpleGit,
  relPath: string,
  window: string,
): Promise<number> {
  try {
    // Use raw git log to count commits touching this file within the time window.
    // --follow handles renames; --format=%H gives one hash per commit.
    const result = await git.raw([
      'log',
      '--follow',
      `--since=${window}`,
      '--format=%H',
      '--',
      relPath,
    ]);
    const lines = result.trim().split('\n').filter(Boolean);
    return lines.length;
  } catch {
    return 0;
  }
}

function complexityScore(m: MetricBreakdown): number {
  // Combine structural complexity indicators into a single score.
  // Uses cyclomatic + cognitive as primary signals, log of total lines as size factor.
  return m.cyclomaticComplexity + m.cognitiveComplexity + Math.log10(Math.max(m.totalLines, 1));
}

function classifyHotspotSeverity(
  idx: number,
  total: number,
): 'low' | 'medium' | 'high' {
  const pct = idx / Math.max(total, 1);
  if (pct < 0.01) return 'high';
  if (pct < 0.05) return 'medium';
  return 'low';
}
