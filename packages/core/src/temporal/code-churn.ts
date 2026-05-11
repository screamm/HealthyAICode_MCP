import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const HIGH_CHURN = 80;
const MEDIUM_CHURN = 40;
const LOW_CHURN = 25;

export interface ChurnResult {
  filePath: string;
  linesAdded: number;
  linesDeleted: number;
  churnRate: number;
  smell: Smell | null;
}

export async function analyzeCodeChurn(
  repoPath: string,
  filePath: string,
  linesOfCode: number,
  windowMonths = 12,
): Promise<ChurnResult> {
  const git = simpleGit(repoPath);
  const since = `${windowMonths} months ago`;
  let linesAdded = 0;
  let linesDeleted = 0;

  try {
    const log = await git.raw([
      'log', `--since="${since}"`, '--numstat', '--format=', '--', filePath,
    ]);
    for (const line of log.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        linesAdded += parseInt(parts[0], 10);
        linesDeleted += parseInt(parts[1], 10);
      }
    }
  } catch {
    return { filePath, linesAdded: 0, linesDeleted: 0, churnRate: 0, smell: null };
  }

  const effectiveLOC = Math.max(linesOfCode, 1);
  const churnRate = ((linesAdded + linesDeleted) / effectiveLOC) * 100;
  const smell = buildChurnSmell(filePath, linesAdded, linesDeleted, churnRate);
  return { filePath, linesAdded, linesDeleted, churnRate, smell };
}

function buildChurnSmell(
  filePath: string,
  added: number,
  deleted: number,
  rate: number,
): Smell | null {
  if (rate <= LOW_CHURN) return null;
  const severity = rate > HIGH_CHURN ? 'high' : rate > MEDIUM_CHURN ? 'medium' : 'low';
  // @ts-ignore — SmellType does not yet include 'CodeChurn'
  return {
    type: 'CodeChurn',
    severity,
    line: 1,
    description: `Code churn is ${rate.toFixed(0)}% (${added} lines added, ${deleted} deleted in last 12 months). Research shows churn > 25% correlates with 2× defect density (Nagappan & Ball).`,
    suggestion: 'Stabilize the design of this file. Consider architectural decomposition to reduce how often it changes.',
  };
}
