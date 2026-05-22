import { simpleGit } from 'simple-git';
import type { KnowledgeLossIndexResult, Smell } from '../types';

const INACTIVITY_MONTHS = 6;
const MAX_BLAME_LINES = 5000;
const ORPHANED_THRESHOLD = 0.40;
const MEDIUM_THRESHOLD = 0.20;

/**
 * Parses `git blame --line-porcelain` output and returns a map of email → line count.
 *
 * Exported for unit-testability.
 *
 * The line-porcelain format emits metadata lines for each blamed hunk; the
 * `author-mail` field looks like:  author-mail <alice@example.com>
 * We strip the angle brackets to get the raw email.
 */
export function parseBlameOutput(output: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('author-mail ')) continue;
    // Format: author-mail <email@example.com>  or  author-mail email@example.com
    const raw = trimmed.slice('author-mail '.length).trim();
    const email = raw.replace(/^<|>$/g, '');
    if (email) {
      result.set(email, (result.get(email) ?? 0) + 1);
    }
  }
  return result;
}

function buildKliSmell(
  filePath: string,
  ratio: number,
  inactiveLines: number,
  totalLines: number,
): Smell | null {
  if (ratio < MEDIUM_THRESHOLD) return null;

  const severity: Smell['severity'] = ratio >= ORPHANED_THRESHOLD ? 'high' : 'medium';
  return {
    type: 'KnowledgeLoss',
    severity,
    line: 1,
    description:
      `${(ratio * 100).toFixed(0)}% of this file's lines (${inactiveLines}/${totalLines}) ` +
      `were authored by contributors who have been inactive for ${INACTIVITY_MONTHS}+ months. ` +
      `This code is effectively orphaned — no one currently active fully understands it.`,
    suggestion:
      'Schedule a knowledge-recovery session: read-through, inline comments, and test coverage. ' +
      'Assign an active developer as the new knowledge owner.',
  };
}

/**
 * Computes the Knowledge Loss Index for a single file via git blame.
 *
 * KLI = (lines authored by inactive contributors) / (total blame lines)
 *
 * "Inactive" means no commit in the repository in the last INACTIVITY_MONTHS months.
 * Blame is capped at MAX_BLAME_LINES to limit runtime on large files.
 */
export async function analyzeKnowledgeLossIndex(
  repoPath: string,
  filePath: string,
): Promise<KnowledgeLossIndexResult> {
  const empty: KnowledgeLossIndexResult = {
    filePath,
    knowledgeLossRatio: 0,
    totalLines: 0,
    inactiveLines: 0,
    isOrphaned: false,
    smell: null,
  };

  try {
    const git = simpleGit(repoPath);

    // Step 1: get per-line author attribution via blame
    let blameRaw: string;
    try {
      blameRaw = await git.raw(['blame', '--line-porcelain', '--', filePath]);
    } catch {
      return empty;
    }

    const linesByEmail = parseBlameOutput(blameRaw);
    const totalLines = Math.min([...linesByEmail.values()].reduce((s, v) => s + v, 0), MAX_BLAME_LINES);
    if (totalLines === 0) return empty;

    // Step 2: get the set of active contributors (any commit in the last INACTIVITY_MONTHS months)
    let activeRaw: string;
    try {
      activeRaw = await git.raw([
        'log',
        `--since=${INACTIVITY_MONTHS} months ago`,
        '--format=%ae',
      ]);
    } catch {
      activeRaw = '';
    }
    const activeEmails = new Set(
      activeRaw.split('\n').map(l => l.trim()).filter(Boolean),
    );

    // Step 3: count lines by inactive authors
    let inactiveLines = 0;
    for (const [email, count] of linesByEmail) {
      if (!activeEmails.has(email)) {
        inactiveLines += count;
      }
    }
    // Cap to MAX_BLAME_LINES proportionally if needed
    const effectiveInactive = Math.min(inactiveLines, MAX_BLAME_LINES);
    const effectiveTotal = totalLines;

    const knowledgeLossRatio = effectiveTotal === 0 ? 0 : effectiveInactive / effectiveTotal;
    const isOrphaned = knowledgeLossRatio > ORPHANED_THRESHOLD;
    const smell = buildKliSmell(filePath, knowledgeLossRatio, effectiveInactive, effectiveTotal);

    return {
      filePath,
      knowledgeLossRatio: parseFloat(knowledgeLossRatio.toFixed(4)),
      totalLines: effectiveTotal,
      inactiveLines: effectiveInactive,
      isOrphaned,
      smell,
    };
  } catch {
    return empty;
  }
}
