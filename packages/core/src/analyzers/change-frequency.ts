/**
 * change-frequency.ts
 * Returns the number of commits touching a file in the last N months.
 * Uses simple-git to query git log. Never throws — returns 0 on any error.
 */

import { simpleGit } from 'simple-git';

/**
 * Counts how many commits have touched filePath in the last windowMonths months.
 * Returns 0 if the git repository is not found or git is unavailable.
 */
export async function getChangeFrequency(
  repoPath: string,
  filePath: string,
  windowMonths = 12,
): Promise<number> {
  try {
    const output = await simpleGit(repoPath).raw([
      'log',
      `--since=${windowMonths} months ago`,
      '--format=%H',
      '--follow',
      '--',
      filePath,
    ]);
    return output.split('\n').filter(l => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}
