import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const DOA_W_FA = 3.293, DOA_W_DL = 0.998, DOA_W_AC = 0.321;
const SINGLE_OWNERSHIP_THRESHOLD = 0.80;

/** Result of knowledge-loss analysis for a single file. */
export interface KnowledgeResult {
  filePath: string; busFactorEstimate: number; primaryAuthor: string; primaryOwnershipRatio: number; smell: Smell | null;
}

/** Analyses DOA-based knowledge ownership for a file in a git repository. */
export async function analyzeKnowledgeLoss(repoPath: string, filePath: string): Promise<KnowledgeResult> {
  const git = simpleGit(repoPath);
  const empty = { filePath, busFactorEstimate: -1, primaryAuthor: 'unknown', primaryOwnershipRatio: 0, smell: null };
  let raw: string;
  try { raw = await git.raw(['log', '--format=%ae|%H', '--follow', '--', filePath]); }
  catch { return empty; }
  const commits = parseCommits(raw);
  if (commits.length === 0) return empty;
  const doaScores = computeDoaScores(commits);
  const total = [...doaScores.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return empty;
  const [primaryAuthor, ratio, busFactorEstimate] = computeOwnership(doaScores, total);
  const smell = ratio < SINGLE_OWNERSHIP_THRESHOLD ? null : { type: 'KnowledgeLoss' as const, severity: 'high' as const, line: 1, description: `Bus Factor ≈ ${busFactorEstimate}. "${primaryAuthor}" owns ${(ratio * 100).toFixed(0)}% of the knowledge in this file (DOA analysis). If this developer leaves, the file becomes a black box.`, suggestion: 'Schedule pair-programming or knowledge transfer sessions. Document design decisions. Reduce single-author hotspots.' };
  return { filePath, busFactorEstimate, primaryAuthor, primaryOwnershipRatio: ratio, smell };
}

function parseCommits(output: string): Array<{ author: string; hash: string }> {
  return output.split('\n').filter(Boolean).map(l => { const [author, hash] = l.trim().split('|'); return { author, hash }; });
}

function computeDoaScores(commits: Array<{ author: string; hash: string }>): Map<string, number> {
  const firstAuthor = commits[commits.length - 1].author;
  const deliveries = new Map<string, number>();
  for (const { author } of commits) deliveries.set(author, (deliveries.get(author) ?? 0) + 1);
  const scores = new Map<string, number>();
  for (const [dev, dl] of deliveries) {
    const fa = dev === firstAuthor ? 1 : 0;
    const li = commits.findIndex(c => c.author === dev);
    const ac = li > 0 ? new Set(commits.slice(0, li).map(c => c.author)).size - 1 : 0;
    scores.set(dev, Math.max(0, fa * DOA_W_FA + dl * DOA_W_DL - ac * DOA_W_AC));
  }
  return scores;
}

function computeOwnership(scores: Map<string, number>, total: number): [string, number, number] {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const ratio = sorted[0][1] / total;
  let busF = 1, cum = 0;
  for (const [, sc] of sorted) { cum += sc / total; if (cum >= 0.5) break; busF++; }
  return [sorted[0][0], ratio, busF];
}
