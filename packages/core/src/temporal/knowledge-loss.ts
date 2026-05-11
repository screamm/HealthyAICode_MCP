import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const DOA_W_FA = 3.293;
const DOA_W_DL = 0.998;
const DOA_W_AC = 0.321;
const SINGLE_OWNERSHIP_THRESHOLD = 0.80;

export interface KnowledgeResult {
  filePath: string;
  busFactorEstimate: number;
  primaryAuthor: string;
  primaryOwnershipRatio: number;
  smell: Smell | null;
}

export async function analyzeKnowledgeLoss(
  repoPath: string,
  filePath: string,
): Promise<KnowledgeResult> {
  const git = simpleGit(repoPath);
  let commits: Array<{ author: string; hash: string }> = [];

  try {
    const output = await git.raw(['log', '--format=%ae|%H', '--follow', '--', filePath]);
    commits = output.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => { const [author, hash] = l.split('|'); return { author, hash }; });
  } catch {
    return { filePath, busFactorEstimate: -1, primaryAuthor: 'unknown', primaryOwnershipRatio: 0, smell: null };
  }

  if (commits.length === 0) {
    return { filePath, busFactorEstimate: -1, primaryAuthor: 'unknown', primaryOwnershipRatio: 0, smell: null };
  }

  const firstAuthor = commits[commits.length - 1].author;
  const devDeliveries = new Map<string, number>();
  for (const { author } of commits) devDeliveries.set(author, (devDeliveries.get(author) ?? 0) + 1);

  const doaScores = new Map<string, number>();
  for (const [dev, dl] of devDeliveries) {
    const fa = dev === firstAuthor ? 1 : 0;
    const lastDevIndex = commits.findIndex(c => c.author === dev);
    const ac = lastDevIndex > 0 ? new Set(commits.slice(0, lastDevIndex).map(c => c.author)).size - 1 : 0;
    const doa = fa * DOA_W_FA + dl * DOA_W_DL - ac * DOA_W_AC;
    doaScores.set(dev, Math.max(0, doa));
  }

  const total = [...doaScores.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return { filePath, busFactorEstimate: -1, primaryAuthor: 'unknown', primaryOwnershipRatio: 0, smell: null };

  const sorted = [...doaScores.entries()].sort((a, b) => b[1] - a[1]);
  const [primaryAuthor, primaryScore] = sorted[0];
  const ratio = primaryScore / total;

  let busFactorEstimate = 1;
  let cumulative = 0;
  for (const [, score] of sorted) {
    cumulative += score / total;
    if (cumulative >= 0.5) break;
    busFactorEstimate++;
  }

  // @ts-ignore — SmellType does not yet include 'KnowledgeLoss'
  const smell: Smell | null = ratio >= SINGLE_OWNERSHIP_THRESHOLD
    ? {
        type: 'KnowledgeLoss',
        severity: 'high' as const,
        line: 1,
        description: `Bus Factor ≈ ${busFactorEstimate}. "${primaryAuthor}" owns ${(ratio * 100).toFixed(0)}% of the knowledge in this file (DOA analysis). If this developer leaves, the file becomes a black box.`,
        suggestion: 'Schedule pair-programming or knowledge transfer sessions. Document design decisions. Reduce single-author hotspots.',
      }
    : null;

  return { filePath, busFactorEstimate, primaryAuthor, primaryOwnershipRatio: ratio, smell };
}
