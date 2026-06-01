// packages/core/src/security/gitlab-formatter.ts
// GitLab Code Quality JSON formatter (Code Climate-derived format).
// Sprint 59.

import { createHash } from 'node:crypto';
import type { Smell } from '../types';

/** Severity levels accepted by the GitLab Code Quality JSON format. */
export type GitLabSeverity = 'info' | 'minor' | 'major' | 'critical' | 'blocker';

/** A single entry in the GitLab Code Quality JSON report. */
export interface GitLabCodeQualityEntry {
  description: string;
  check_name: string;
  fingerprint: string;
  severity: GitLabSeverity;
  location: {
    path: string;
    lines: {
      begin: number;
    };
  };
}

/** Map from Smell.severity to GitLab severity levels. */
const SEVERITY_MAP: Record<'critical' | 'high' | 'medium' | 'low', GitLabSeverity> = {
  critical: 'critical',
  high: 'major',
  medium: 'minor',
  low: 'info',
};

/**
 * Produce a GitLab Code Quality JSON array from a list of smells.
 *
 * - `fingerprint` is MD5 of `filePath + smellType + startLine` (deterministic across runs).
 * - `location.path` strips any leading `./` prefix for GitLab compatibility.
 *
 * @param smells  Array of Smell objects from the health analysis.
 * @param filePath  Path to the file being analysed (used in fingerprint and location.path).
 * @returns  Array of GitLabCodeQualityEntry objects (empty if no smells).
 */
export function formatAsGitlabJson(
  smells: Smell[],
  filePath: string,
): GitLabCodeQualityEntry[] {
  const normalizedPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;

  return smells.map((smell) => {
    const fingerprint = createHash('md5')
      .update(filePath + smell.type + String(smell.line))
      .digest('hex');

    return {
      description: smell.description,
      check_name: smell.type,
      fingerprint,
      severity: SEVERITY_MAP[smell.severity],
      location: {
        path: normalizedPath,
        lines: {
          begin: smell.line,
        },
      },
    };
  });
}
