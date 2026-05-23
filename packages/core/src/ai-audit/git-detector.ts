// packages/core/src/ai-audit/git-detector.ts
import simpleGit from 'simple-git';
import type { GitSignal } from './types';

/**
 * Analyzes git history for a file to detect AI-paste-in patterns:
 * large initial commit with little subsequent history.
 *
 * Returns undefined if the path is not a git repo or the file has no history.
 */
export async function analyzeGitSignal(
  repoPath: string,
  filePath: string,
): Promise<GitSignal | undefined> {
  const git = simpleGit(repoPath);

  let log;
  try {
    log = await git.log({ file: filePath });
  } catch {
    return undefined;
  }

  if (!log || log.all.length === 0) return undefined;

  const totalCommits = log.all.length;
  const initialSha = log.all[log.all.length - 1].hash;

  let initialLinesAdded = 0;
  try {
    const stat = await git.show([initialSha, '--stat', '--format=', '--', filePath]);
    const match = /(\d+) insertion/.exec(stat);
    if (match) initialLinesAdded = parseInt(match[1], 10);
  } catch {
    initialLinesAdded = 0;
  }

  const score = calculateGitScore(initialLinesAdded, totalCommits);

  return {
    first_commit_lines_added: initialLinesAdded,
    total_commits_touching_file: totalCommits,
    max_single_commit_change_pct: 0, // simplified for v1
    score,
  };
}

function calculateGitScore(initialLines: number, totalCommits: number): number {
  let score = 0;
  if (initialLines > 50 && totalCommits <= 2) {
    score += 0.70;
  } else if (initialLines > 30 && totalCommits <= 3) {
    score += 0.40;
  } else if (initialLines > 20 && totalCommits <= 4) {
    score += 0.20;
  }
  return Math.min(score, 1.0);
}
