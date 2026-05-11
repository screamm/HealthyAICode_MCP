import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const HIGH_CHURN = 80;
const MEDIUM_CHURN = 40;
const LOW_CHURN = 25;
const DECIMAL_RADIX = 10;

/** Churn measurement result with metrics and an optional code quality finding. */
export interface ChurnResult {
  filePath: string;
  linesAdded: number;
  linesDeleted: number;
  churnRate: number;
  smell: Smell | null;
}

/**
 * Measures code churn (lines added + deleted) relative to file size.
 * High churn correlates with 2× defect density (Nagappan & Ball, MSR 2005).
 */
export async function analyzeCodeChurn(
  repoPath: string,
  filePath: string,
  linesOfCode: number,
  windowMonths = 12,
): Promise<ChurnResult> {
  const git = simpleGit(repoPath);
  let linesAdded = 0;
  let linesDeleted = 0;
  try {
    const log = await git.raw([
      'log', `--since="${windowMonths} months ago"`, '--numstat', '--format=', '--', filePath,
    ]);
    for (const line of log.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        linesAdded += parseInt(parts[0], DECIMAL_RADIX);
        linesDeleted += parseInt(parts[1], DECIMAL_RADIX);
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
  _filePath: string,
  added: number,
  deleted: number,
  rate: number,
): Smell | null {
  if (rate <= LOW_CHURN) return null;
  let severity: Smell['severity'] = 'low';
  if (rate > HIGH_CHURN) severity = 'high';
  else if (rate > MEDIUM_CHURN) severity = 'medium';
  return {
    type: 'CodeChurn',
    severity,
    line: 1,
    description: `Code churn is ${rate.toFixed(0)}% (${added} lines added, ${deleted} deleted in last 12 months). Research shows churn > 25% correlates with 2× defect density (Nagappan & Ball).`,
    suggestion: 'Stabilize the design of this file. Consider architectural decomposition to reduce how often it changes.',
  };
}
