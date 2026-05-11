import { simpleGit } from 'simple-git';
import type { Smell } from '../types';

const HIGH_AUTHORS = 10;
const MEDIUM_AUTHORS = 5;
const LOW_AUTHORS = 3;

export interface CongestionResult {
  filePath: string;
  authorCount: number;
  authors: string[];
  smell: Smell | null;
}

export async function analyzeDeveloperCongestion(
  repoPath: string,
  filePath: string,
  windowMonths = 12,
): Promise<CongestionResult> {
  const git = simpleGit(repoPath);
  let authors: string[] = [];

  try {
    const output = await git.raw([
      'log', `--since=${windowMonths} months ago`, '--format=%ae', '--', filePath,
    ]);
    authors = [...new Set(output.split('\n').map(l => l.trim()).filter(Boolean))];
  } catch {
    return { filePath, authorCount: 0, authors: [], smell: null };
  }

  const authorCount = authors.length;
  const smell = buildCongestionSmell(filePath, authorCount, authors);
  return { filePath, authorCount, authors, smell };
}

function buildCongestionSmell(
  filePath: string,
  authorCount: number,
  authors: string[],
): Smell | null {
  if (authorCount < LOW_AUTHORS) return null;
  const severity = authorCount >= HIGH_AUTHORS ? 'high' : authorCount >= MEDIUM_AUTHORS ? 'medium' : 'low';
  // @ts-ignore — SmellType does not yet include 'DeveloperCongestion'
  return {
    type: 'DeveloperCongestion',
    severity,
    line: 1,
    description: `${authorCount} distinct developers have modified this file in the last 12 months — a coordination bottleneck. Research shows author count is one of the strongest predictors of post-release defects (Microsoft Vista study).`,
    suggestion: 'Assign clear ownership. Consider splitting the file by team responsibility boundary. Apply the Inverse Conway Maneuver.',
  };
}
