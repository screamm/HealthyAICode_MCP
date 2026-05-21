// packages/core/src/temporal/method-coupling.ts
import { simpleGit } from 'simple-git';
import {
  getMethodRangesAtCommit,
  getChangedLineRanges,
  intersectChangedMethods,
} from './method-coupling-helpers';
import type { MethodCouplingPair, MethodCouplingResult, Smell } from '../types';

export interface MethodCouplingOptions {
  /**
   * Minimum coupling strength to report a pair. Default 0.5 (50%).
   */
  threshold?: number;
  /**
   * Limits how many commits are walked per file.
   * Default 200.
   *
   * Note: all other temporal modules in this directory use `windowMonths = 12` as their
   * time-window convention. Method coupling uses a commit-cap instead because:
   * 1. Analytical determinism per file — the number of commits is fixed and reproducible
   *    regardless of when the analysis is run, unlike a time window that shifts daily.
   * 2. 200 commits ≈ 6-12 months of history on a normally-active repository, which
   *    matches the spirit of the 12-month window used elsewhere.
   */
  maxCommits?: number;
}

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_MAX_COMMITS = 200;
const HIGH_STRENGTH = 0.7;
const MEDIUM_STRENGTH = 0.55;

/**
 * Analyzes method-level temporal coupling for a single file by walking its git history.
 *
 * For each commit that touched the file:
 *   1. Parse diff-hunks to get changed line ranges.
 *   2. Parse the file at that commit to get function/method ranges.
 *   3. Intersect to determine which methods were changed.
 *   4. Accumulate touch-counts per method and co-change counts per method-pair.
 *
 * Returns pairs sorted by coupling strength descending, filtered to >= threshold.
 *
 * Uses git.raw() throughout, consistent with the project-wide convention established in
 * hotspot-helpers.ts (C1).
 */
export async function analyzeMethodCoupling(
  repoPath: string,
  filePath: string,
  options: MethodCouplingOptions = {},
): Promise<MethodCouplingResult> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const git = simpleGit(repoPath);

  // C1: use git.raw() convention — consistent with hotspot-helpers.ts:33 and the rest
  // of the temporal module family.
  let shas: string[];
  try {
    const output = await git.raw([
      'log', '--follow',
      `--max-count=${maxCommits}`,
      '--format=%H',
      '--',
      filePath,
    ]);
    shas = output.trim().split('\n').filter(Boolean);
  } catch {
    return { filePath, commitsAnalyzed: 0, threshold, pairs: [] };
  }

  if (shas.length === 0) {
    return { filePath, commitsAnalyzed: 0, threshold, pairs: [] };
  }

  const touchCount = new Map<string, number>();
  const coChangeCount = new Map<string, number>();

  for (const sha of shas) {
    // Parallelise the two I/O operations per commit for ~2× speedup on SSD
    const [ranges, changed] = await Promise.all([
      getMethodRangesAtCommit(repoPath, filePath, sha),
      getChangedLineRanges(repoPath, filePath, sha),
    ]);

    // Short-circuit: skip commits where the analyzer found no methods or no diff hunks
    if (ranges.length === 0 || changed.length === 0) continue;

    const changedMethods = intersectChangedMethods(changed, ranges);
    for (const m of changedMethods) {
      touchCount.set(m, (touchCount.get(m) ?? 0) + 1);
    }

    const sorted = [...changedMethods].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}||${sorted[j]}`;
        coChangeCount.set(key, (coChangeCount.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    filePath,
    commitsAnalyzed: shas.length,
    threshold,
    pairs: buildPairs(coChangeCount, touchCount, threshold),
  };
}

function buildPairs(
  coChangeCount: Map<string, number>,
  touchCount: Map<string, number>,
  threshold: number,
): MethodCouplingPair[] {
  const pairs: MethodCouplingPair[] = [];
  for (const [key, count] of coChangeCount) {
    const [a, b] = key.split('||');
    // Use the maximum touch count as the denominator — this measures coupling relative to
    // the method that was touched more often, giving a conservative strength estimate.
    const combined = Math.max(touchCount.get(a) ?? 1, touchCount.get(b) ?? 1);
    const strength = count / combined;
    if (strength < threshold) continue;
    pairs.push({
      methodA: a,
      methodB: b,
      coChangeCount: count,
      combinedTouches: combined,
      couplingStrength: parseFloat(strength.toFixed(2)),
      severity: classify(strength),
    });
  }
  return pairs.sort((x, y) => y.couplingStrength - x.couplingStrength);
}

function classify(strength: number): MethodCouplingPair['severity'] {
  if (strength >= HIGH_STRENGTH) return 'high';
  if (strength >= MEDIUM_STRENGTH) return 'medium';
  return 'low';
}

/**
 * Converts coupling pairs into Smell objects suitable for the unified findings stream.
 * Severity is deliberately conservative (advisory-only) until false-positive rates are
 * validated in a dedicated sprint.
 */
export function methodCouplingToSmells(result: MethodCouplingResult): Smell[] {
  return result.pairs.map(p => ({
    type: 'MethodTemporalCoupling' as const,
    severity: p.severity === 'high' ? 'medium' : 'low' as Smell['severity'],
    line: 1,  // file-level finding; UI may resolve to the line of the highest-DOA method
    description: `'${p.methodA}' och '${p.methodB}' samändras i ${(p.couplingStrength * 100).toFixed(0)}% av ändringarna (${p.coChangeCount} av ${p.combinedTouches} commits).`,
    suggestion: `Dolt samband mellan metoderna. Överväg att (1) extrahera deras gemensamma logik till en hjälpfunktion, (2) flytta dem till samma klass/modul, eller (3) verifiera att de bör vara explicit beroende av varandra via en typ.`,
  }));
}
