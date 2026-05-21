// packages/core/src/temporal/method-coupling-helpers.ts
import { simpleGit } from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../language-detect';

export interface MethodRange {
  name: string;
  line: number;     // 1-based start line
  length: number;   // number of lines
}

const rangesCache = new Map<string, MethodRange[]>();

/**
 * Returns the method/function line ranges of `filePath` as they were at `commitSha`.
 *
 * Uses `git.raw()` convention consistent with all other temporal helpers in this directory
 * (see hotspot-helpers.ts:33 as reference, C1-fix from sprint review).
 *
 * NOTE: JSX/TSX files may yield sparse function results at historical commits because
 * TypeScript analyzer uses plain TS grammar, not TSX grammar. This is acceptable — the
 * co-change count will be lower but the coupling strength denominator (total touches)
 * compensates correctly.
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
    rangesCache.set(cacheKey, []);
    return [];
  }

  const language = detectLanguage(filePath);
  if (language === 'unsupported') {
    rangesCache.set(cacheKey, []);
    return [];
  }

  // C3: wrap analyzeByLanguage in try/catch to gracefully handle old syntax versions
  // (e.g. pre-release TypeScript syntax that today's parser rejects)
  let functions: Array<{ name: string; line: number; length: number }>;
  try {
    const result = analyzeByLanguage(content, language, filePath);
    functions = result.functions;
  } catch {
    rangesCache.set(cacheKey, []);
    return [];
  }

  const ranges = functions.map(f => ({
    name: f.name,
    line: f.line,
    length: f.length,
  }));
  rangesCache.set(cacheKey, ranges);
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
 * at the same commit: returns names of methods that contain at least one changed line.
 */
export function intersectChangedMethods(
  changedRanges: Array<[number, number]>,
  methodRanges: MethodRange[],
): string[] {
  const hit = new Set<string>();
  for (const m of methodRanges) {
    const methodEnd = m.line + m.length - 1;
    for (const [start, end] of changedRanges) {
      if (end >= m.line && start <= methodEnd) {
        hit.add(m.name);
        break;
      }
    }
  }
  return [...hit];
}

/**
 * Test-only: clear the per-commit ranges cache.
 * Call via beforeEach(__clearMethodRangesCache) to prevent state-leakage between tests.
 */
export function __clearMethodRangesCache(): void {
  rangesCache.clear();
}
