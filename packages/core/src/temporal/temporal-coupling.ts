import { simpleGit } from 'simple-git';
const COUPLING_THRESHOLD = 0.3, MIN_CO_CHANGES = 3;
const HIGH_STRENGTH_THRESHOLD = 0.7, MEDIUM_STRENGTH_THRESHOLD = 0.5;
/** Describes a pair of files that tend to change together. */
export interface CoupledPair {
  fileA: string; fileB: string; coChangeCount: number; couplingStrength: number; severity: 'low' | 'medium' | 'high';
}
/** Identifies files that frequently change together within git history, indicating hidden coupling. */
export async function analyzeTemporalCoupling(repoPath: string, filePaths: string[], windowMonths = 12): Promise<CoupledPair[]> {
  if (filePaths.length < 2) return [];
  const git = simpleGit(repoPath);
  let log: string;
  try { log = await git.raw(['log', `--since=${windowMonths} months ago`, '--name-only', '--format=%H']); }
  catch { return []; }
  const { tc, cc } = buildChangeMaps(parseCommitFiles(log, new Set(filePaths)));
  return buildPairs(cc, tc);
}
function buildChangeMaps(commits: string[][]): { tc: Map<string, number>; cc: Map<string, number> } {
  const tc = new Map<string, number>(), cc = new Map<string, number>();
  commits.forEach(fs => {
    fs.forEach(f => tc.set(f, (tc.get(f) ?? 0) + 1));
    const s = [...fs].sort();
    s.forEach((a, i) => s.slice(i + 1).forEach(b => { const k = `${a}||${b}`; cc.set(k, (cc.get(k) ?? 0) + 1); }));
  });
  return { tc, cc };
}
function buildPairs(cc: Map<string, number>, tc: Map<string, number>): CoupledPair[] {
  const result: CoupledPair[] = [];
  for (const [key, count] of cc) {
    if (count < MIN_CO_CHANGES) continue;
    const [a, b] = key.split('||');
    if (sameModule(a, b)) continue;
    const str = count / Math.min(tc.get(a) ?? 1, tc.get(b) ?? 1);
    if (str < COUPLING_THRESHOLD) continue;
    result.push({ fileA: a, fileB: b, coChangeCount: count, couplingStrength: parseFloat(str.toFixed(2)), severity: classify(str) });
  }
  return result.sort((a, b) => b.couplingStrength - a.couplingStrength);
}
function classify(s: number): CoupledPair['severity'] {
  if (s > HIGH_STRENGTH_THRESHOLD) return 'high';
  return s > MEDIUM_STRENGTH_THRESHOLD ? 'medium' : 'low';
}
function parseCommitFiles(log: string, tracked: Set<string>): string[][] {
  const result: string[][] = []; let cur: string[] = [];
  for (const line of log.split('\n')) {
    const t = line.trim();
    if (/^[0-9a-f]{40}$/.test(t)) { if (cur.length > 0) result.push(cur); cur = []; }
    else if (tracked.has(t)) cur.push(t);
  }
  if (cur.length > 0) result.push(cur);
  return result.filter(g => g.length >= 2);
}
function sameModule(a: string, b: string): boolean {
  return a.split('/').slice(0, -1).join('/') === b.split('/').slice(0, -1).join('/');
}
