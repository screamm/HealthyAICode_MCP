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

interface HotspotConfig {
  lookbackDays: number;
  topN: number;
  minChurnCommits: number;
  sinceIso: string;
  packageRoot?: string;
}

interface ChurnEntry {
  additions: number;
  deletions: number;
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
  const config = resolveHotspotConfig(options);
  const git = simpleGit(repoPath);

  const churnMap = await fetchChurnMap(git, config);
  if (!churnMap) return [];

  const commitCountMap = await fetchCommitCountMap(git, config);
  const eligibleFiles = filterEligibleFiles(churnMap, commitCountMap, config.minChurnCommits);
  if (eligibleFiles.length === 0) return [];

  const complexityMap = await computeComplexityMap(git, eligibleFiles);
  const scores = scoreHotspots(eligibleFiles, churnMap, commitCountMap, complexityMap);

  return scores
    .filter(s => s.classification !== 'healthy')
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topN);
}

function resolveHotspotConfig(options: HotspotOptions): HotspotConfig {
  const lookbackDays = options.lookbackDays ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  return {
    lookbackDays,
    topN: options.topN ?? 10,
    minChurnCommits: options.minChurnCommits ?? 3,
    sinceIso: since.toISOString().split('T')[0],
    packageRoot: options.packageRoot,
  };
}

async function fetchChurnMap(
  git: ReturnType<typeof simpleGit>,
  config: HotspotConfig,
): Promise<Map<string, ChurnEntry> | null> {
  const logArgs = buildNumstatArgs(config);
  let numstatRaw: string;
  try {
    numstatRaw = await git.raw(logArgs);
  } catch {
    return null;
  }
  if (!numstatRaw.trim()) return null;
  return parseNumstat(numstatRaw);
}

function buildNumstatArgs(config: HotspotConfig): string[] {
  const args = ['log', '--since', config.sinceIso, '--no-merges', '--format=', '--numstat'];
  if (config.packageRoot) args.push('--', config.packageRoot);
  return args;
}

function parseNumstat(raw: string): Map<string, ChurnEntry> {
  const churnMap = new Map<string, ChurnEntry>();
  for (const line of raw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [addStr, delStr, filePath] = parts;
    if (addStr === '-' || !filePath?.trim()) continue; // binary file
    const additions = parseInt(addStr, 10);
    const deletions = parseInt(delStr, 10);
    if (isNaN(additions) || isNaN(deletions)) continue;
    const fp = filePath.trim();
    const existing = churnMap.get(fp) ?? { additions: 0, deletions: 0 };
    churnMap.set(fp, { additions: existing.additions + additions, deletions: existing.deletions + deletions });
  }
  return churnMap;
}

async function fetchCommitCountMap(
  git: ReturnType<typeof simpleGit>,
  config: HotspotConfig,
): Promise<Map<string, number>> {
  const commitCountArgs = buildCommitCountArgs(config);
  let commitRaw: string;
  try {
    commitRaw = await git.raw(commitCountArgs);
  } catch {
    commitRaw = '';
  }
  return parseCommitCounts(commitRaw);
}

function buildCommitCountArgs(config: HotspotConfig): string[] {
  const args = ['log', '--since', config.sinceIso, '--no-merges', '--format=%H', '--name-only'];
  if (config.packageRoot) args.push('--', config.packageRoot);
  return args;
}

function parseCommitCounts(raw: string): Map<string, number> {
  const commitCountMap = new Map<string, number>();
  let inCommit = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^[0-9a-f]{40}$/i.test(trimmed)) {
      inCommit = true;
    } else if (trimmed && inCommit) {
      commitCountMap.set(trimmed, (commitCountMap.get(trimmed) ?? 0) + 1);
    }
  }
  return commitCountMap;
}

function filterEligibleFiles(
  churnMap: Map<string, ChurnEntry>,
  commitCountMap: Map<string, number>,
  minChurnCommits: number,
): [string, ChurnEntry][] {
  return [...churnMap.entries()].filter(([filePath]) => {
    const count = commitCountMap.get(filePath) ?? 0;
    return count >= minChurnCommits;
  });
}

async function computeComplexityMap(
  git: ReturnType<typeof simpleGit>,
  eligibleFiles: [string, ChurnEntry][],
): Promise<Map<string, number>> {
  const complexityMap = new Map<string, number>();
  for (const [filePath] of eligibleFiles) {
    const complexity = await fetchFileComplexity(git, filePath);
    complexityMap.set(filePath, complexity);
  }
  return complexityMap;
}

async function fetchFileComplexity(
  git: ReturnType<typeof simpleGit>,
  filePath: string,
): Promise<number> {
  const lang = detectLanguage(filePath);
  if (lang === 'unsupported') return 0;
  try {
    const content = await git.show([`HEAD:${filePath}`]);
    const result = analyzeByLanguage(content, lang, filePath);
    return result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
  } catch {
    return 0;
  }
}

function scoreHotspots(
  eligibleFiles: [string, ChurnEntry][],
  churnMap: Map<string, ChurnEntry>,
  commitCountMap: Map<string, number>,
  complexityMap: Map<string, number>,
): HotspotResult[] {
  const maxChurn = Math.max(...eligibleFiles.map(([, v]) => v.additions + v.deletions), 1);
  const maxComplexity = Math.max(...[...complexityMap.values()], 1);

  return eligibleFiles.map(([filePath]) => buildHotspotResult({
    filePath,
    churnMap,
    commitCountMap,
    complexityMap,
    maxChurn,
    maxComplexity,
  }));
}

interface BuildHotspotResultOptions {
  filePath: string;
  churnMap: Map<string, ChurnEntry>;
  commitCountMap: Map<string, number>;
  complexityMap: Map<string, number>;
  maxChurn: number;
  maxComplexity: number;
}

function classifyHotspot(score: number): HotspotResult['classification'] {
  if (score > 0.7) return 'critical';
  if (score > 0.4) return 'warning';
  return 'healthy';
}

function buildHotspotResult(opts: BuildHotspotResultOptions): HotspotResult {
  const { filePath, churnMap, commitCountMap, complexityMap, maxChurn, maxComplexity } = opts;
  const churn = churnMap.get(filePath) ?? { additions: 0, deletions: 0 };
  const totalChurn = churn.additions + churn.deletions;
  const normalizedChurn = totalChurn / maxChurn;
  const normalizedComplexity = (complexityMap.get(filePath) ?? 0) / maxComplexity;
  const score = normalizedChurn * normalizedComplexity;
  const classification = classifyHotspot(score);

  return {
    filePath,
    score: parseFloat(score.toFixed(4)),
    churn: totalChurn,
    commitCount: commitCountMap.get(filePath) ?? 0,
    complexity: complexityMap.get(filePath) ?? 0,
    classification,
  };
}
