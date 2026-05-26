// packages/core/src/temporal/method-coupling-helpers.ts
import { simpleGit } from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';

export interface MethodRange {
  name: string;
  line: number;     // 1-based start line
  length: number;   // number of lines
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

/**
 * Returns the method/function line ranges of `filePath` as they were at `commitSha`.
 *
 * Uses `git.raw()` convention consistent with all other temporal helpers in this directory
 * (see hotspot-helpers.ts:33 as reference, C1-fix from sprint review).
 *
 * Blocker 4: TSX/JSX files are normalised to .ts/.js for language detection so that the
 * TypeScript/JavaScript analyzer (which uses plain TS/JS grammar) can extract function
 * ranges correctly from historical commits instead of yielding sparse results.
 */
export async function getMethodRangesAtCommit(
  repoPath: string,
  filePath: string,
  commitSha: string,
): Promise<MethodRange[]> {
  const cacheKey = `${repoPath}::${filePath}::${commitSha}`;
  const cached = rangesCache.get(cacheKey);
  if (cached) return cached;

  const git = simpleGit(repoPath);
  let content: string;
  try {
    content = await git.show([`${commitSha}:${filePath}`]);
  } catch {
    setCacheBounded(cacheKey, []);
    return [];
  }

  // Blocker 4: normalise .tsx/.jsx → .ts/.js so detectLanguage returns typescript/javascript,
  // enabling the analyzer to extract function ranges reliably from historical commits.
  const normalizedPath = filePath.replace(/\.tsx$/, '.ts').replace(/\.jsx$/, '.js');
  const language = detectLanguage(normalizedPath);
  if (language === 'unsupported') {
    setCacheBounded(cacheKey, []);
    return [];
  }

  // C3: wrap analyzeByLanguage in try/catch to gracefully handle old syntax versions
  // (e.g. pre-release TypeScript syntax that today's parser rejects)
  let functions: Array<{ name: string; line: number; length: number }>;
  try {
    const result = analyzeByLanguage(content, language, normalizedPath);
    functions = result.functions;
  } catch {
    setCacheBounded(cacheKey, []);
    return [];
  }

  const ranges = functions.map(f => ({
    name: f.name,
    line: f.line,
    length: f.length,
  }));
  setCacheBounded(cacheKey, ranges);
  return ranges;
}

/**
 * Returns [start, end] inclusive line ranges that were changed in `filePath` at `commitSha`.
 * Parses `@@ -old +new @@` diff hunk headers from `git show --unified=0`.
 */
export async function getChangedLineRanges(
  repoPath: string,
  filePath: string,
  commitSha: string,
): Promise<Array<[number, number]>> {
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
    const methodEnd = m.line + m.length - 1;
    for (const [start, end] of changedRanges) {
      if (end >= m.line && start <= methodEnd) {
        const qualifiedKey = `${m.name}@${m.line}`;
        if (!seen.has(qualifiedKey)) {
          seen.add(qualifiedKey);
          result.push({ name: m.name, line: m.line });
        }
        break;
      }
    }
  }
  return result;
}

/**
 * Test-only: clear the per-commit ranges cache.
 * Call via beforeEach(__clearMethodRangesCache) to prevent state-leakage between tests.
 */
export function __clearMethodRangesCache(): void {
  rangesCache.clear();
}
