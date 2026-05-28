// packages/core/src/temporal/method-coupling-helpers.ts
import { simpleGit } from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';
import type { Language } from '../types';

/** The name and source location of a function or method within a file. */
export interface MethodRange {
  name: string;
  line: number;     // 1-based start line
  length: number;   // number of lines
}

/** Identifies a specific file at a specific commit. */
interface CommitFileRef {
  repoPath: string;
  filePath: string;
  commitSha: string;
}

/** Content and its resolved language for analysis. */
interface AnalysisTarget {
  content: string;
  language: Language;
  normalizedPath: string;
}

// Blocker 5: Simple LRU-style cache bounded to MAX_CACHE_SIZE entries.
// When the limit is reached the oldest inserted entry (first key) is evicted.
const MAX_CACHE_SIZE = 500;
const rangesCache = new Map<string, MethodRange[]>();

function setCacheBounded(key: string, value: MethodRange[]): void {
  if (rangesCache.size >= MAX_CACHE_SIZE) {
    // Delete the first (oldest) entry to keep the map bounded
    const firstKey = rangesCache.keys().next().value;
    if (firstKey !== undefined) rangesCache.delete(firstKey);
  }
  rangesCache.set(key, value);
}

/** Returns file content at a specific commit, or null if the git command fails. */
async function fetchFileAtCommit(ref: CommitFileRef): Promise<string | null> {
  const { repoPath, filePath, commitSha } = ref;
  const git = simpleGit(repoPath);
  try {
    return await git.show([`${commitSha}:${filePath}`]);
  } catch {
    return null;
  }
}

/**
 * Detects the analysis language for a file, normalising TSX/JSX to TS/JS.
 * Returns null for unsupported languages.
 *
 * Blocker 4: normalising .tsx/.jsx → .ts/.js lets the TypeScript/JavaScript
 * analyzer extract function ranges correctly from historical commits.
 */
function resolveAnalysisLanguage(filePath: string): Language | null {
  const normalizedPath = filePath.replace(/\.tsx$/, '.ts').replace(/\.jsx$/, '.js');
  const language = detectLanguage(normalizedPath);
  if (language === 'unsupported') return null;
  return language as Language;
}

/**
 * Extracts method ranges from file content using the appropriate language analyzer.
 * Returns an empty array if the analyzer throws (e.g. legacy syntax in old commits).
 * C3: wraps analyzeByLanguage in try/catch to handle pre-release syntax gracefully.
 */
function extractMethodRanges(target: AnalysisTarget): MethodRange[] {
  const { content, language, normalizedPath } = target;
  try {
    const result = analyzeByLanguage(content, language, normalizedPath);
    return result.functions.map(f => ({ name: f.name, line: f.line, length: f.length }));
  } catch {
    return [];
  }
}

/**
 * Returns the method/function line ranges of `filePath` as they were at `commitSha`.
 *
 * Uses `git.raw()` convention consistent with all other temporal helpers in this directory
 * (see hotspot-helpers.ts:33 as reference, C1-fix from sprint review).
 */
export async function getMethodRangesAtCommit(ref: CommitFileRef): Promise<MethodRange[]> {
  const { repoPath, filePath, commitSha } = ref;
  const cacheKey = `${repoPath}::${filePath}::${commitSha}`;
  const cached = rangesCache.get(cacheKey);
  if (cached) return cached;

  const content = await fetchFileAtCommit({ repoPath, filePath, commitSha });
  if (content === null) {
    setCacheBounded(cacheKey, []);
    return [];
  }

  const normalizedPath = filePath.replace(/\.tsx$/, '.ts').replace(/\.jsx$/, '.js');
  const language = resolveAnalysisLanguage(filePath);
  if (language === null) {
    setCacheBounded(cacheKey, []);
    return [];
  }

  const ranges = extractMethodRanges({ content, language, normalizedPath });
  setCacheBounded(cacheKey, ranges);
  return ranges;
}

/**
 * Returns [start, end] inclusive line ranges that were changed in `filePath` at `commitSha`.
 * Parses `@@ -old +new @@` diff hunk headers from `git show --unified=0`.
 */
export async function getChangedLineRanges(ref: CommitFileRef): Promise<Array<[number, number]>> {
  const { repoPath, filePath, commitSha } = ref;
  const git = simpleGit(repoPath);
  let diff: string;
  try {
    diff = await git.show([commitSha, '--unified=0', '--format=', '--', filePath]);
  } catch {
    return [];
  }

  const ranges: Array<[number, number]> = [];
  // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
  const hunkPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  while ((match = hunkPattern.exec(diff)) !== null) {
    const newStart = parseInt(match[1], 10);
    const newCount = match[2] ? parseInt(match[2], 10) : 1;
    if (newCount === 0) continue;
    ranges.push([newStart, newStart + newCount - 1]);
  }
  return ranges;
}

/**
 * Pure function. Given (a) changed line ranges for a commit and (b) method ranges
 * at the same commit: returns the methods (name + start line) that contain at least
 * one changed line.
 *
 * Blocker 3: returning `{ name, line }` instead of just `name` lets callers build
 * qualified keys ("name@line") that disambiguate overloaded or same-named methods
 * within the same file (e.g. multiple `render`, `validate`, `toString` functions).
 */
export function intersectChangedMethods(
  changedRanges: Array<[number, number]>,
  methodRanges: MethodRange[],
): Array<{ name: string; line: number }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; line: number }> = [];
  for (const m of methodRanges) {
    if (isMethodTouched(m, changedRanges)) {
      recordIfUnseen(m, seen, result);
    }
  }
  return result;
}

/** Returns true if any changed range overlaps with the given method's line span. */
function isMethodTouched(method: MethodRange, changedRanges: Array<[number, number]>): boolean {
  const methodEnd = method.line + method.length - 1;
  return changedRanges.some(([start, end]) => end >= method.line && start <= methodEnd);
}

/** Adds a method to the result if it has not been recorded yet (dedup by qualified key). */
function recordIfUnseen(
  method: MethodRange,
  seen: Set<string>,
  result: Array<{ name: string; line: number }>,
): void {
  const qualifiedKey = `${method.name}@${method.line}`;
  if (seen.has(qualifiedKey)) return;
  seen.add(qualifiedKey);
  result.push({ name: method.name, line: method.line });
}

/**
 * Test-only: clear the per-commit ranges cache.
 * Call via beforeEach(__clearMethodRangesCache) to prevent state-leakage between tests.
 */
export function __clearMethodRangesCache(): void {
  rangesCache.clear();
}
