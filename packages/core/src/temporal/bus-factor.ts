import { simpleGit } from 'simple-git';
import type { BusFactorResult, Smell } from '../types';

const RISK_ENTROPY_THRESHOLD = 0.30;

/**
 * Computes Shannon entropy normalized to [0, 1] for a distribution of commit counts.
 * Returns 0 when there is one or zero contributors (all knowledge concentrated in one person).
 * Returns 1.0 when all contributors have equal share.
 *
 * Exported for unit-testability without git I/O.
 */
export function computeNormalizedEntropy(commitCounts: Map<string, number>): number {
  if (commitCounts.size <= 1) return 0;

  const total = [...commitCounts.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of commitCounts.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(commitCounts.size);
  if (maxEntropy === 0) return 0;

  return Math.min(1, entropy / maxEntropy);
}

/**
 * Computes the bus factor estimate: the minimum number of contributors whose cumulative
 * commit share exceeds 50 %. Sorted descending (most active first).
 *
 * Exported for unit-testability.
 */
export function computeBusFactorEstimate(sortedShares: number[]): number {
  let cumulative = 0;
  for (let i = 0; i < sortedShares.length; i++) {
    cumulative += sortedShares[i];
    if (cumulative > 0.5) return i + 1;
  }
  return sortedShares.length === 0 ? 0 : sortedShares.length;
}

function buildBusFactorSmell(
  filePath: string,
  busFactorEstimate: number,
  normalizedEntropy: number,
  isAtRisk: boolean,
  dominantEmail: string,
  dominantShare: number,
): Smell | null {
  if (!isAtRisk) return null;

  const severity = busFactorEstimate === 1 ? 'high' : 'medium';
  return {
    type: 'KnowledgeLoss',
    severity,
    line: 1,
    description:
      busFactorEstimate === 1
        ? `Bus Factor = 1. "${dominantEmail}" authored ${(dominantShare * 100).toFixed(0)}% of commits. ` +
          `Shannon entropy = ${normalizedEntropy.toFixed(2)} (low = concentrated knowledge). ` +
          `If this developer leaves, critical knowledge is lost.`
        : `Bus Factor = ${busFactorEstimate}. Knowledge entropy = ${normalizedEntropy.toFixed(2)} — ` +
          `concentrated among ${busFactorEstimate} contributors. Risk of knowledge loss.`,
    suggestion:
      'Schedule pair-programming or knowledge-transfer sessions. ' +
      'Document design decisions and domain logic. ' +
      'Distribute ownership through code reviews and feature rotation.',
  };
}

/**
 * Analyses Shannon entropy-based bus factor for a single file in a git repository.
 *
 * Uses `git log --format=%ae --follow` to gather per-author commit counts, then
 * computes normalized entropy and bus factor estimate.
 */
export async function analyzeBusFactor(
  repoPath: string,
  filePath: string,
): Promise<BusFactorResult> {
  const empty: BusFactorResult = {
    filePath,
    uniqueContributors: 0,
    normalizedEntropy: 0,
    busFactorEstimate: 0,
    isAtRisk: false,
    contributors: [],
    smell: null,
  };

  let raw: string;
  try {
    const git = simpleGit(repoPath);
    raw = await git.raw(['log', '--format=%ae', '--follow', '--', filePath]);
  } catch {
    return empty;
  }

  const emails = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (emails.length === 0) return empty;

  const commitCounts = new Map<string, number>();
  for (const email of emails) {
    commitCounts.set(email, (commitCounts.get(email) ?? 0) + 1);
  }

  const total = emails.length;
  const sortedEntries = [...commitCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sortedShares = sortedEntries.map(([, count]) => count / total);

  const normalizedEntropy = computeNormalizedEntropy(commitCounts);
  const busFactorEstimate = computeBusFactorEstimate(sortedShares);
  const isAtRisk = normalizedEntropy < RISK_ENTROPY_THRESHOLD || busFactorEstimate === 1;

  const contributors = sortedEntries.map(([email, count]) => ({
    email,
    commitShare: parseFloat((count / total).toFixed(3)),
  }));

  const [dominantEmail, dominantCount] = sortedEntries[0];
  const dominantShare = dominantCount / total;

  const smell = buildBusFactorSmell(
    filePath,
    busFactorEstimate,
    normalizedEntropy,
    isAtRisk,
    dominantEmail,
    dominantShare,
  );

  return {
    filePath,
    uniqueContributors: commitCounts.size,
    normalizedEntropy: parseFloat(normalizedEntropy.toFixed(4)),
    busFactorEstimate,
    isAtRisk,
    contributors,
    smell,
  };
}
