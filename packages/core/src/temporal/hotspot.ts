import simpleGit from 'simple-git';
import type { HealthResult } from '../types';
import { scoreFiles, classifyHotspotSeverity, type ScoredFile } from './hotspot-helpers';

const DEFAULT_WINDOW = '12 months', TOP_N_DEFAULT = 10;

/** A file identified as a change hotspot — frequently changed and structurally complex. */
export interface HotspotFinding {
  filePath: string;
  commitCount: number;
  complexityScore: number;
  hotspotScore: number;
  severity: 'low' | 'medium' | 'high';
  rankPercentile: number;
}

/**
 * Detects the most problematic change hotspots in a repository.
 * At minimum the top 10% of scored files are returned.
 * Returns an empty array when rootPath is not inside a git repository.
 */
export async function detectHotspots(
  rootPath: string,
  perFileResults: HealthResult[],
  window = DEFAULT_WINDOW,
  topN = TOP_N_DEFAULT,
): Promise<HotspotFinding[]> {
  const git = simpleGit(rootPath);
  let isRepo = false;
  try { isRepo = await git.checkIsRepo(); } catch { isRepo = false; }
  if (!isRepo) return [];

  const allScored = await scoreFiles(git, perFileResults, rootPath, window);
  const scored = allScored.sort((a, b) => b.hotspotScore - a.hotspotScore);
  const cutoff = Math.max(topN, Math.ceil(scored.length * 0.1));

  return scored.slice(0, cutoff).map((s: ScoredFile, idx: number) => ({
    filePath: s.filePath, commitCount: s.commitCount, complexityScore: s.complexity, hotspotScore: s.hotspotScore,
    severity: classifyHotspotSeverity(idx, scored.length),
    rankPercentile: Math.round((idx / Math.max(scored.length, 1)) * 100),
  }));
}
