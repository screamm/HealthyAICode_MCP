import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const HIGH_CHURN = 80, MEDIUM_CHURN = 40, LOW_CHURN = 25, DECIMAL_RADIX = 10;

/** Churn measurement result with metrics and an optional code quality finding. */
export interface ChurnResult { filePath: string; linesAdded: number; linesDeleted: number; churnRate: number; smell: Smell | null; }

/** Options for analyzeCodeChurn — groups primitives to prevent PrimitiveObsession. */
export interface ChurnOptions { repoPath: string; filePath: string; linesOfCode: number; windowMonths?: number; }

interface ChurnMetrics { added: number; deleted: number; rate: number; }

/** Measures code churn (lines added + deleted) relative to file size. High churn correlates with 2× defect density (Nagappan & Ball, MSR 2005). */
export async function analyzeCodeChurn(opts: ChurnOptions): Promise<ChurnResult> {
  const { repoPath, filePath, linesOfCode, windowMonths = 12 } = opts;
  const git = simpleGit(repoPath);
  let linesAdded = 0, linesDeleted = 0;
  try {
    const log = await git.raw(['log', `--since="${windowMonths} months ago"`, '--numstat', '--format=', '--', filePath]);
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
  const churnRate = ((linesAdded + linesDeleted) / Math.max(linesOfCode, 1)) * 100;
  return { filePath, linesAdded, linesDeleted, churnRate, smell: buildChurnSmell({ added: linesAdded, deleted: linesDeleted, rate: churnRate }) };
}

function buildChurnSmell(metrics: ChurnMetrics): Smell | null {
  const { added, deleted, rate } = metrics;
  if (rate <= LOW_CHURN) return null;
  let severity: Smell['severity'];
  if (rate > HIGH_CHURN) severity = 'high';
  else if (rate > MEDIUM_CHURN) severity = 'medium';
  else severity = 'low';
  return {
    type: 'CodeChurn', severity, line: 1,
    description: `Code churn is ${rate.toFixed(0)}% (${added} lines added, ${deleted} deleted in last 12 months). Research shows churn > 25% correlates with 2× defect density (Nagappan & Ball).`,
    suggestion: 'Stabilize the design of this file. Consider architectural decomposition to reduce how often it changes.',
  };
}
