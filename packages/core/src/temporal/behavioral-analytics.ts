// packages/core/src/temporal/behavioral-analytics.ts
//
// Orchestrates behavioral analytics: hotspot analysis (complexity × churn),
// complexity trends, file-level coupling, and Architectural Decay Index.
//
// Discovery notes (Task 1):
// - hotspot.ts: detects hotspots using commitCount × complexityScore, requires pre-computed HealthResult[].
//   We need a standalone version that doesn't require HealthResult[] — this file provides analyzeHotspots().
// - code-churn.ts: analyzes a single file's churn relative to its line count. Not suited for multi-file ranking.
// - temporal-coupling.ts: file-pair coupling without time windowing. file-coupling.ts adds rolling windows.
// - method-coupling.ts: intra-file method-level coupling — Sprint 19, no changes needed here.
//
// What is NEW in this file:
//   analyzeHotspots() — multi-file hotspot scoring without requiring pre-computed HealthResult[]

import simpleGit from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';
import type { HotspotResult } from '../types';

export interface HotspotOptions {
  lookbackDays?: number;       // default 90
  topN?: number;               // default 10
  packageRoot?: string;        // monorepo support
  minChurnCommits?: number;    // minimum commits to include a file (default 3)
}

/**
 * Identifies hotspots in a git repository: files with high complexity AND high churn rate.
 *
 * Score formula: normalize(complexity) × normalize(churnRate)
 * where normalization is min-max across all eligible files.
 *
 * Returns top-N files sorted by hotspot score descending (warning + critical only by default).
 * Returns empty array when the repository has no git history or no eligible files.
 */
export async function analyzeHotspots(
  repoPath: string,
  options: HotspotOptions = {},
): Promise<HotspotResult[]> {
  const lookbackDays = options.lookbackDays ?? 90;
  const topN = options.topN ?? 10;
  const minChurnCommits = options.minChurnCommits ?? 3;
  const git = simpleGit(repoPath);

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceIso = since.toISOString().split('T')[0];

  // Collect churn per file using --numstat
  const logArgs = [
    'log',
    '--since', sinceIso,
    '--no-merges',
    '--format=',
    '--numstat',
  ];
  if (options.packageRoot) {
    logArgs.push('--', options.packageRoot);
  }

  let numstatRaw: string;
  try {
    numstatRaw = await git.raw(logArgs);
  } catch {
    return [];
  }

  if (!numstatRaw.trim()) return [];

  // Count commit touches per file separately (needed for minChurnCommits filter)
  const commitCountArgs = [
    'log',
    '--since', sinceIso,
    '--no-merges',
    '--format=%H',
    '--name-only',
  ];
  if (options.packageRoot) {
    commitCountArgs.push('--', options.packageRoot);
  }

  let commitRaw: string;
  try {
    commitRaw = await git.raw(commitCountArgs);
  } catch {
    commitRaw = '';
  }

  // Parse commit counts per file
  const commitCountMap = new Map<string, number>();
  let inCommit = false;
  for (const line of commitRaw.split('\n')) {
    const trimmed = line.trim();
    if (/^[0-9a-f]{40}$/i.test(trimmed)) {
      inCommit = true;
    } else if (trimmed && inCommit) {
      commitCountMap.set(trimmed, (commitCountMap.get(trimmed) ?? 0) + 1);
    }
  }

  // Parse numstat output: "<additions>\t<deletions>\t<filePath>"
  const churnMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstatRaw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [addStr, delStr, filePath] = parts;
    if (addStr === '-' || !filePath || !filePath.trim()) continue; // binary file
    const additions = parseInt(addStr, 10);
    const deletions = parseInt(delStr, 10);
    if (isNaN(additions) || isNaN(deletions)) continue;
    const fp = filePath.trim();
    const existing = churnMap.get(fp) ?? { additions: 0, deletions: 0 };
    churnMap.set(fp, {
      additions: existing.additions + additions,
      deletions: existing.deletions + deletions,
    });
  }

  // Filter files with sufficient commit history
  const eligibleFiles = [...churnMap.entries()].filter(([filePath]) => {
    const count = commitCountMap.get(filePath) ?? 0;
    return count >= minChurnCommits;
  });

  if (eligibleFiles.length === 0) return [];

  // Compute complexity at HEAD for each eligible file
  const complexityMap = new Map<string, number>();
  for (const [filePath] of eligibleFiles) {
    const lang = detectLanguage(filePath);
    if (lang === 'unsupported') {
      complexityMap.set(filePath, 0);
      continue;
    }
    try {
      const content = await git.show([`HEAD:${filePath}`]);
      const result = analyzeByLanguage(content, lang, filePath);
      const totalComplexity = result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
      complexityMap.set(filePath, totalComplexity);
    } catch {
      complexityMap.set(filePath, 0);
    }
  }

  // Normalize and compute hotspot scores
  const maxChurn = Math.max(...eligibleFiles.map(([, v]) => v.additions + v.deletions), 1);
  const maxComplexity = Math.max(...[...complexityMap.values()], 1);

  const scores: HotspotResult[] = eligibleFiles.map(([filePath, churn]) => {
    const totalChurn = churn.additions + churn.deletions;
    const normalizedChurn = totalChurn / maxChurn;
    const normalizedComplexity = (complexityMap.get(filePath) ?? 0) / maxComplexity;
    const score = normalizedChurn * normalizedComplexity;
    const classification: HotspotResult['classification'] =
      score > 0.7 ? 'critical' : score > 0.4 ? 'warning' : 'healthy';
    return {
      filePath,
      score: parseFloat(score.toFixed(4)),
      churn: totalChurn,
      commitCount: commitCountMap.get(filePath) ?? 0,
      complexity: complexityMap.get(filePath) ?? 0,
      classification,
    };
  });

  return scores
    .filter(s => s.classification !== 'healthy')
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
