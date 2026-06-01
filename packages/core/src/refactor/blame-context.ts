/**
 * Sprint 54 — Git-blame context for BrainMethod / GodClass / KnowledgeLoss.
 *
 * HAFixAgent (arXiv 2511.01047, Nov 2025) injected blame heuristics (introducing-commit
 * diff + co-changed functions) into a repair loop and gained +38.6% fix-rate on BugsInPy
 * for single-file multi-hunk bugs. This module extracts that context for a given
 * function so the refactoring loop can surface original intent in `followUpInstruction`.
 *
 * Reuses the existing git infrastructure: `simpleGit` (as used across temporal/*) and
 * `getMethodRangesAtCommit()` from temporal/method-coupling-helpers (unmodified). On any
 * git failure (offline, shallow clone, file not yet committed) it returns `null` silently —
 * blame context is opt-in and additive, never loop-breaking.
 */

import { simpleGit } from 'simple-git';
import { getMethodRangesAtCommit } from '../temporal/method-coupling-helpers';

/** Git-derived provenance for a single function, used to inform a refactoring step. */
export interface BlameContext {
  /** SHA of the commit that introduced (or first added) the function. */
  introducingCommitHash: string;
  /** Subject line of the introducing commit. */
  introducingCommitMessage: string;
  /** Trimmed diff excerpt (<= ~800 chars) around the function from the introducing commit. */
  introducingDiff: string;
  /** Other files changed in the same introducing commit (max 5). */
  coChangedFunctions: string[];
  /** Author email of the introducing commit. */
  authorEmail: string;
  /** Approximate age of the introducing commit, in months. */
  ageMonths: number;
}

/** Caps git log scans to avoid pathological latency on very large repositories. */
const MAX_LOG_COMMITS = 500;
/** Max characters of diff excerpt to keep around a function. */
const MAX_DIFF_CHARS = 800;
/** Max co-changed files to report. */
const MAX_CO_CHANGED = 5;

/** A commit touching the target file, with the metadata needed to rank/inspect it. */
interface FileCommit {
  hash: string;
  authorEmail: string;
  subject: string;
  unixTime: number;
}

/** Parses the porcelain `%H%x09%ae%x09%at%x09%s` log lines into FileCommit records (newest first). */
function parseFileCommits(raw: string): FileCommit[] {
  const commits: FileCommit[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const parts = trimmed.split('\t');
    if (parts.length < 4) continue;
    const [hash, authorEmail, at, ...subjectParts] = parts;
    const unixTime = parseInt(at, 10);
    if (!hash || Number.isNaN(unixTime)) continue;
    commits.push({ hash, authorEmail, subject: subjectParts.join('\t'), unixTime });
  }
  return commits;
}

/** Returns commits that touched `filePath`, newest first (capped to MAX_LOG_COMMITS). */
async function listFileCommits(repoPath: string, filePath: string): Promise<FileCommit[]> {
  const git = simpleGit(repoPath);
  try {
    const raw = await git.raw([
      'log',
      `--max-count=${MAX_LOG_COMMITS}`,
      '--follow',
      '--format=%H%x09%ae%x09%at%x09%s',
      '--',
      filePath,
    ]);
    return parseFileCommits(raw);
  } catch {
    return [];
  }
}

/**
 * Finds the commit where `fnName` was introduced by walking history oldest→newest and
 * returning the first commit whose snapshot of the file contains a method named `fnName`.
 * Falls back to the genesis (oldest) commit when no per-function match is found.
 */
async function findIntroducingCommit(
  repoPath: string,
  filePath: string,
  fnName: string,
  commits: FileCommit[],
): Promise<FileCommit | null> {
  if (commits.length === 0) return null;
  // commits is newest-first; walk oldest-first to find the EARLIEST commit containing fnName.
  const oldestFirst = [...commits].reverse();
  for (const commit of oldestFirst) {
    const ranges = await getMethodRangesAtCommit({
      repoPath,
      filePath,
      commitSha: commit.hash,
    });
    if (ranges.some(r => r.name === fnName)) {
      return commit;
    }
  }
  // No commit snapshot named the function (e.g. Tier C file or renamed function):
  // fall back to the file's genesis commit so callers still get provenance.
  return oldestFirst[0];
}

/** Extracts a diff excerpt for `filePath` from `sha`, trimmed to MAX_DIFF_CHARS. */
async function fetchDiffExcerpt(repoPath: string, sha: string, filePath: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const diff = await git.raw(['show', '--unified=5', '--format=', sha, '--', filePath]);
    return diff.slice(0, MAX_DIFF_CHARS).trim();
  } catch {
    return '';
  }
}

/** Returns the list of files changed in `sha` (max MAX_CO_CHANGED), excluding the target file. */
async function fetchCoChangedFiles(repoPath: string, sha: string, filePath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  try {
    const raw = await git.raw(['show', '--stat', '--format=', '--name-only', sha]);
    const files = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && line !== filePath);
    // Dedupe while preserving order, then cap.
    return [...new Set(files)].slice(0, MAX_CO_CHANGED);
  } catch {
    return [];
  }
}

/** Converts a unix timestamp (seconds) to whole months elapsed until now. */
function ageInMonths(unixTime: number): number {
  const millisElapsed = Date.now() - unixTime * 1000;
  const millisPerMonth = 1000 * 60 * 60 * 24 * 30;
  return Math.max(0, Math.round(millisElapsed / millisPerMonth));
}

/**
 * Fetches blame context for `fnName` in `filePath` within `repoPath`.
 *
 * Algorithm:
 *  1. `git log --follow --format=...` to list commits touching the file (capped at 500).
 *  2. Walk oldest→newest, using `getMethodRangesAtCommit()` to find the commit that first
 *     contains a method named `fnName` (the introducing commit); fall back to the genesis commit.
 *  3. `git show --unified=5` for the introducing-commit diff, trimmed to ~800 chars.
 *  4. `git show --name-only` for co-changed files (max 5).
 *
 * Returns `null` (no throw) on any git error or when the repo has no history for the file.
 */
export async function fetchBlameContext(
  filePath: string,
  repoPath: string,
  fnName: string,
): Promise<BlameContext | null> {
  try {
    const commits = await listFileCommits(repoPath, filePath);
    if (commits.length === 0) return null;

    const introducing = await findIntroducingCommit(repoPath, filePath, fnName, commits);
    if (introducing === null) return null;

    const [introducingDiff, coChangedFunctions] = await Promise.all([
      fetchDiffExcerpt(repoPath, introducing.hash, filePath),
      fetchCoChangedFiles(repoPath, introducing.hash, filePath),
    ]);

    if (introducingDiff === '') return null;

    return {
      introducingCommitHash: introducing.hash,
      introducingCommitMessage: introducing.subject,
      introducingDiff,
      coChangedFunctions,
      authorEmail: introducing.authorEmail,
      ageMonths: ageInMonths(introducing.unixTime),
    };
  } catch {
    return null;
  }
}
