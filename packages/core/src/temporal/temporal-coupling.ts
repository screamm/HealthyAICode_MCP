import { simpleGit } from 'simple-git';

const COUPLING_THRESHOLD = 0.3;
const MIN_CO_CHANGES = 3;

export interface CoupledPair {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  couplingStrength: number;
  severity: 'low' | 'medium' | 'high';
}

export async function analyzeTemporalCoupling(
  repoPath: string,
  filePaths: string[],
  windowMonths = 12,
): Promise<CoupledPair[]> {
  if (filePaths.length < 2) return [];
  const git = simpleGit(repoPath);
  const since = `${windowMonths} months ago`;

  let log: string;
  try {
    log = await git.raw(['log', `--since=${since}`, '--name-only', '--format=%H']);
  } catch {
    return [];
  }

  const commitFiles = parseCommitFiles(log, new Set(filePaths));
  const touchCount = new Map<string, number>();
  const coChangeCount = new Map<string, number>();

  for (const files of commitFiles) {
    for (const f of files) touchCount.set(f, (touchCount.get(f) ?? 0) + 1);
    const sorted = [...files].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}||${sorted[j]}`;
        coChangeCount.set(key, (coChangeCount.get(key) ?? 0) + 1);
      }
    }
  }

  const result: CoupledPair[] = [];
  for (const [key, count] of coChangeCount) {
    if (count < MIN_CO_CHANGES) continue;
    const [a, b] = key.split('||');
    if (sameModule(a, b)) continue;
    const strength = count / Math.min(touchCount.get(a) ?? 1, touchCount.get(b) ?? 1);
    if (strength < COUPLING_THRESHOLD) continue;
    result.push({
      fileA: a,
      fileB: b,
      coChangeCount: count,
      couplingStrength: parseFloat(strength.toFixed(2)),
      severity: strength > 0.7 ? 'high' : strength > 0.5 ? 'medium' : 'low',
    });
  }
  return result.sort((a, b) => b.couplingStrength - a.couplingStrength);
}

function parseCommitFiles(log: string, tracked: Set<string>): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (/^[0-9a-f]{40}$/.test(trimmed)) {
      if (current.length > 0) result.push(current);
      current = [];
    } else if (tracked.has(trimmed)) {
      current.push(trimmed);
    }
  }
  if (current.length > 0) result.push(current);
  return result.filter(g => g.length >= 2);
}

function sameModule(a: string, b: string): boolean {
  const dirA = a.split('/').slice(0, -1).join('/');
  const dirB = b.split('/').slice(0, -1).join('/');
  return dirA === dirB;
}
