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

interface ResolvedOptions {
  windowDays: number;
  threshold: number;
  maxCommits: number;
  sinceDate: string;
  untilDate: string | undefined;
}

interface CoChangeMatrix {
  touchCount: Map<string, number>;
  coChangeCount: Map<string, number>;
}

/**
 * Analyzes file-level change coupling using a rolling time window.
 * Returns pairs of files that frequently change together, with temporal stability analysis.
 */
export async function analyzeFileCoupling(
  repoPath: string,
  options: FileCouplingOptions = {},
): Promise<FileCouplingResult> {
  const resolved = resolveOptions(options);
  const git = simpleGit(repoPath);

  const rawLog = await fetchGitLog(git, resolved, options.packageRoot);
  if (rawLog === null) {
    return emptyResult(repoPath, resolved);
  }

  const commits = parseCommitLog(rawLog, options.packageRoot);
  if (commits.length === 0) {
    return emptyResult(repoPath, resolved);
  }

  const matrix = buildCoChangeMatrix(commits);
  const temporalStrengths = computeTemporalStrengths(commits);
  const pairs = buildFilePairs(matrix, resolved.threshold, temporalStrengths, resolved.windowDays);

  return {
    repoPath,
    windowDays: resolved.windowDays,
    threshold: resolved.threshold,
    commitsAnalyzed: commits.length,
    pairs: pairs.sort((a, b) => b.couplingStrength - a.couplingStrength),
  };
}

function resolveOptions(options: FileCouplingOptions): ResolvedOptions {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const sinceDate = options.since ?? computeSinceDate(windowDays);
  return {
    windowDays,
    threshold: options.threshold ?? DEFAULT_THRESHOLD,
    maxCommits: options.maxCommits ?? DEFAULT_MAX_COMMITS,
    sinceDate,
    untilDate: options.until ?? undefined,
  };
}

function computeSinceDate(windowDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - windowDays);
  return d.toISOString().split('T')[0];
}

function emptyResult(repoPath: string, opts: ResolvedOptions): FileCouplingResult {
  return { repoPath, windowDays: opts.windowDays, threshold: opts.threshold, commitsAnalyzed: 0, pairs: [] };
}

async function fetchGitLog(
  git: ReturnType<typeof simpleGit>,
  opts: ResolvedOptions,
  packageRoot?: string,
): Promise<string | null> {
  const rawArgs = buildGitArgs(opts, packageRoot);
  try {
    return await git.raw(rawArgs);
  } catch {
    return null;
  }
}

function buildGitArgs(opts: ResolvedOptions, packageRoot?: string): string[] {
  const args = [
    'log',
    '--since', opts.sinceDate,
    '--no-merges',
    `-${opts.maxCommits}`,
    '--format=%H %ci',
    '--name-only',
  ];
  if (opts.untilDate) {
    args.splice(3, 0, '--until', opts.untilDate);
  }
  if (packageRoot) {
    args.push('--', packageRoot);
  }
  return args;
}

function buildCoChangeMatrix(commits: CommitEntry[]): CoChangeMatrix {
  const touchCount = new Map<string, number>();
  const coChangeCount = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files.filter(f => f.length > 0);
    accumulateTouches(files, touchCount);
    accumulateCoChanges(files, coChangeCount);
  }

  return { touchCount, coChangeCount };
}

function accumulateTouches(files: string[], touchCount: Map<string, number>): void {
  for (const f of files) {
    touchCount.set(f, (touchCount.get(f) ?? 0) + 1);
  }
}

function accumulateCoChanges(files: string[], coChangeCount: Map<string, number>): void {
  const sorted = [...new Set(files)].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const key = `${sorted[i]}||${sorted[j]}`;
      coChangeCount.set(key, (coChangeCount.get(key) ?? 0) + 1);
    }
  }
}

interface TemporalStrengths {
  earlyStrengths: Map<string, number>;
  lateStrengths: Map<string, number>;
}

function computeTemporalStrengths(commits: CommitEntry[]): TemporalStrengths {
  // Partition commits into three equal thirds
  const third = Math.floor(commits.length / 3);
  const earlyCommits = commits.slice(0, third);
  const lateCommits = commits.slice(commits.length - third);

  return {
    earlyStrengths: computeStrengthFromCommits(earlyCommits),
    lateStrengths: computeStrengthFromCommits(lateCommits),
  };
}

const SHA_LINE_PATTERN = /^([0-9a-f]{40})\s+(.+)$/i;

function parseCommitLog(rawLog: string, packageRoot?: string): CommitEntry[] {
  const commits: CommitEntry[] = [];
  let currentSha = '';
  let currentDate = '';
  let currentFiles: string[] = [];

  for (const line of rawLog.split('\n')) {
    const trimmed = line.trim();
    const shaMatch = trimmed.match(SHA_LINE_PATTERN);
    if (shaMatch) {
      flushCommit(commits, currentSha, currentFiles, currentDate);
      ({ sha: currentSha, date: currentDate, files: currentFiles } = startNewCommit(shaMatch));
    } else {
      currentFiles = appendFileLine(currentFiles, { trimmed, currentSha, packageRoot });
    }
  }
  flushCommit(commits, currentSha, currentFiles, currentDate);
  return commits;
}

function flushCommit(commits: CommitEntry[], sha: string, files: string[], date: string): void {
  if (sha && files.length > 0) {
    commits.push({ sha, files, date });
  }
}

function startNewCommit(shaMatch: RegExpMatchArray): { sha: string; date: string; files: string[] } {
  return { sha: shaMatch[1], date: shaMatch[2], files: [] };
}

interface AppendFileLineContext {
  trimmed: string;
  currentSha: string;
  packageRoot?: string;
}

function appendFileLine(currentFiles: string[], ctx: AppendFileLineContext): string[] {
  const { trimmed, currentSha, packageRoot } = ctx;
  const isMatchingFile = trimmed && currentSha && (!packageRoot || trimmed.startsWith(packageRoot));
  if (isMatchingFile) {
    return [...currentFiles, trimmed];
  }
  return currentFiles;
}

function computeStrengthFromCommits(commits: CommitEntry[]): Map<string, number> {
  const touches = new Map<string, number>();
  const coChanges = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files.filter(f => f.length > 0);
    accumulateTouches(files, touches);
    accumulateCoChanges(files, coChanges);
  }

  const strengths = new Map<string, number>();
  for (const [key, count] of coChanges) {
    const [a, b] = key.split('||');
    const combined = Math.max(touches.get(a) ?? 1, touches.get(b) ?? 1);
    strengths.set(key, count / combined);
  }
  return strengths;
}

interface BuildPairOptions {
  fileA: string;
  fileB: string;
  count: number;
  combined: number;
  strength: number;
  key: string;
  temporal: TemporalStrengths;
  windowDays: number;
}

function buildFilePairs(
  matrix: CoChangeMatrix,
  threshold: number,
  temporal: TemporalStrengths,
  windowDays: number,
): FileCouplingPair[] {
  const pairs: FileCouplingPair[] = [];
  for (const [key, count] of matrix.coChangeCount) {
    const [fileA, fileB] = key.split('||');
    const combined = Math.max(matrix.touchCount.get(fileA) ?? 1, matrix.touchCount.get(fileB) ?? 1);
    const strength = count / combined;
    if (strength < threshold) continue;

    pairs.push(buildPair({ fileA, fileB, count, combined, strength, key, temporal, windowDays }));
  }
  return pairs;
}

function classifyTemporalStability(
  earlyS: number,
  lateS: number,
): FileCouplingPair['temporalStability'] {
  if (lateS > earlyS + 0.1) return 'tightening';
  if (lateS < earlyS - 0.1) return 'loosening';
  return 'stable';
}

function classifySeverity(strength: number): FileCouplingPair['severity'] {
  if (strength >= HIGH_STRENGTH) return 'high';
  if (strength >= MEDIUM_STRENGTH) return 'medium';
  return 'low';
}

function buildPair(opts: BuildPairOptions): FileCouplingPair {
  const { fileA, fileB, count, combined, strength, key, temporal, windowDays } = opts;
  const earlyS = temporal.earlyStrengths.get(key) ?? 0;
  const lateS = temporal.lateStrengths.get(key) ?? 0;
  const temporalStability = classifyTemporalStability(earlyS, lateS);
  const severity = classifySeverity(strength);

  return {
    fileA,
    fileB,
    coChangeCount: count,
    combinedTouches: combined,
    couplingStrength: parseFloat(strength.toFixed(2)),
    temporalStability,
    severity,
    windowDays,
  };
}
