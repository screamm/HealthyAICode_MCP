// packages/core/src/temporal/file-coupling.ts
import simpleGit from 'simple-git';
import type { FileCouplingPair, FileCouplingResult } from '../types';

export interface FileCouplingOptions {
  windowDays?: number;     // default 90
  since?: string;          // ISO date string, e.g. "2025-01-01" — overrides windowDays if set
  until?: string;          // ISO date string
  threshold?: number;      // default 0.3
  maxCommits?: number;     // default 500
  packageRoot?: string;    // monorepo support: restrict to sub-path
}

const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_THRESHOLD = 0.3;
const DEFAULT_MAX_COMMITS = 500;
const HIGH_STRENGTH = 0.6;
const MEDIUM_STRENGTH = 0.4;

interface CommitEntry {
  sha: string;
  files: string[];
  date: string;
}

/**
 * Analyzes file-level change coupling using a rolling time window.
 * Returns pairs of files that frequently change together, with temporal stability analysis.
 */
export async function analyzeFileCoupling(
  repoPath: string,
  options: FileCouplingOptions = {},
): Promise<FileCouplingResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const git = simpleGit(repoPath);

  // Compute since/until dates
  const sinceDate = options.since
    ? options.since
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - windowDays);
        return d.toISOString().split('T')[0];
      })();
  const untilDate = options.until ?? undefined;

  const rawArgs = [
    'log',
    '--since', sinceDate,
    '--no-merges',
    `-${maxCommits}`,
    '--format=%H %ci',
    '--name-only',
  ];
  if (untilDate) {
    rawArgs.splice(3, 0, '--until', untilDate);
  }
  if (options.packageRoot) {
    rawArgs.push('--', options.packageRoot);
  }

  let rawLog: string;
  try {
    rawLog = await git.raw(rawArgs);
  } catch {
    return { repoPath, windowDays, threshold, commitsAnalyzed: 0, pairs: [] };
  }

  // Parse commit blocks: SHA+date line followed by file lines, blank line = new commit
  const commits = parseCommitLog(rawLog, options.packageRoot);

  if (commits.length === 0) {
    return { repoPath, windowDays, threshold, commitsAnalyzed: 0, pairs: [] };
  }

  // Build co-change matrix
  const touchCount = new Map<string, number>();
  const coChangeCount = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files.filter(f => f.length > 0);
    for (const f of files) {
      touchCount.set(f, (touchCount.get(f) ?? 0) + 1);
    }
    const sorted = [...new Set(files)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}||${sorted[j]}`;
        coChangeCount.set(key, (coChangeCount.get(key) ?? 0) + 1);
      }
    }
  }

  // Temporal stability: partition commits into three equal thirds
  const third = Math.floor(commits.length / 3);
  const earlyCommits = commits.slice(0, third);
  const lateCommits = commits.slice(commits.length - third);

  const earlyStrengths = computeStrengthFromCommits(earlyCommits);
  const lateStrengths = computeStrengthFromCommits(lateCommits);

  const pairs = buildFilePairs(coChangeCount, touchCount, threshold, earlyStrengths, lateStrengths, windowDays);

  return {
    repoPath,
    windowDays,
    threshold,
    commitsAnalyzed: commits.length,
    pairs: pairs.sort((a, b) => b.couplingStrength - a.couplingStrength),
  };
}

function parseCommitLog(rawLog: string, packageRoot?: string): CommitEntry[] {
  const commits: CommitEntry[] = [];
  let currentSha = '';
  let currentDate = '';
  let currentFiles: string[] = [];

  for (const line of rawLog.split('\n')) {
    const trimmed = line.trim();
    // SHA line: 40-hex chars followed by a date string
    const shaMatch = trimmed.match(/^([0-9a-f]{40})\s+(.+)$/i);
    if (shaMatch) {
      if (currentSha && currentFiles.length > 0) {
        commits.push({ sha: currentSha, files: currentFiles, date: currentDate });
      }
      currentSha = shaMatch[1];
      currentDate = shaMatch[2];
      currentFiles = [];
    } else if (trimmed && currentSha) {
      if (!packageRoot || trimmed.startsWith(packageRoot)) {
        currentFiles.push(trimmed);
      }
    }
  }
  if (currentSha && currentFiles.length > 0) {
    commits.push({ sha: currentSha, files: currentFiles, date: currentDate });
  }
  return commits;
}

function computeStrengthFromCommits(commits: CommitEntry[]): Map<string, number> {
  const touches = new Map<string, number>();
  const coChanges = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files.filter(f => f.length > 0);
    for (const f of files) {
      touches.set(f, (touches.get(f) ?? 0) + 1);
    }
    const sorted = [...new Set(files)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}||${sorted[j]}`;
        coChanges.set(key, (coChanges.get(key) ?? 0) + 1);
      }
    }
  }

  const strengths = new Map<string, number>();
  for (const [key, count] of coChanges) {
    const [a, b] = key.split('||');
    const combined = Math.max(touches.get(a) ?? 1, touches.get(b) ?? 1);
    strengths.set(key, count / combined);
  }
  return strengths;
}

function buildFilePairs(
  coChangeCount: Map<string, number>,
  touchCount: Map<string, number>,
  threshold: number,
  earlyStrengths: Map<string, number>,
  lateStrengths: Map<string, number>,
  windowDays: number,
): FileCouplingPair[] {
  const pairs: FileCouplingPair[] = [];
  for (const [key, count] of coChangeCount) {
    const [fileA, fileB] = key.split('||');
    const combined = Math.max(touchCount.get(fileA) ?? 1, touchCount.get(fileB) ?? 1);
    const strength = count / combined;
    if (strength < threshold) continue;

    const earlyS = earlyStrengths.get(key) ?? 0;
    const lateS = lateStrengths.get(key) ?? 0;
    const temporalStability: FileCouplingPair['temporalStability'] =
      lateS > earlyS + 0.1 ? 'tightening'
      : lateS < earlyS - 0.1 ? 'loosening'
      : 'stable';

    pairs.push({
      fileA,
      fileB,
      coChangeCount: count,
      combinedTouches: combined,
      couplingStrength: parseFloat(strength.toFixed(2)),
      temporalStability,
      severity: strength >= HIGH_STRENGTH ? 'high' : strength >= MEDIUM_STRENGTH ? 'medium' : 'low',
      windowDays,
    });
  }
  return pairs;
}
