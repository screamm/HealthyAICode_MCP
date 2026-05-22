import { simpleGit } from 'simple-git';
import type { SprintCongestionResult, Smell } from '../types';

const SPRINT_DAYS = 14;
const CONGESTION_HIGH_THRESHOLD = 5;
const CONGESTION_MEDIUM_THRESHOLD = 3;

function buildSprintCongestionSmell(
  filePath: string,
  count: number,
  emails: string[],
): Smell | null {
  if (count < CONGESTION_MEDIUM_THRESHOLD) return null;

  const severity: Smell['severity'] = count >= CONGESTION_HIGH_THRESHOLD ? 'high' : 'medium';
  const preview = emails.slice(0, 3).join(', ') + (emails.length > 3 ? '...' : '');

  return {
    type: 'DeveloperCongestion',
    severity,
    line: 1,
    description:
      `${count} active contributors have modified this file in the last ${SPRINT_DAYS} days ` +
      `(${preview}). High risk of merge conflicts in the current sprint.`,
    suggestion:
      'Coordinate with the team on ownership of this file. ' +
      'Consider splitting the file by responsibility boundary, or establish a clear merge strategy.',
  };
}

/**
 * Analyses developer congestion over a 14-day sprint window.
 *
 * Unlike the 12-month `analyzeDeveloperCongestion`, this focuses on in-flight
 * sprint risk: are 3 or more people actively editing the same file right now?
 *
 * Returns gracefully on git failures (no git repo, file not tracked, etc.).
 */
export async function analyzeSprintCongestion(
  repoPath: string,
  filePath: string,
): Promise<SprintCongestionResult> {
  const empty: SprintCongestionResult = {
    filePath,
    activeContributors: 0,
    activeEmails: [],
    isCongestedSprint: false,
    smell: null,
  };

  try {
    const git = simpleGit(repoPath);
    const since = `${SPRINT_DAYS} days ago`;
    const output = await git.raw(['log', `--since=${since}`, '--format=%ae', '--', filePath]);
    const emails = [...new Set(output.split('\n').map(l => l.trim()).filter(Boolean))];
    const activeContributors = emails.length;
    const isCongestedSprint = activeContributors >= CONGESTION_MEDIUM_THRESHOLD;
    const smell = buildSprintCongestionSmell(filePath, activeContributors, emails);
    return { filePath, activeContributors, activeEmails: emails, isCongestedSprint, smell };
  } catch {
    return empty;
  }
}
