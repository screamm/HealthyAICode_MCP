// Fixture: three smells of different severity levels for GitLab formatter tests.
// Sprint 59.

import type { Smell } from '../../../src/types';

/** Three smells of different severities to exercise the GitLab formatter. */
export const GITLAB_FORMAT_SMELLS: Smell[] = [
  {
    type: 'SqlInjectionRisk',
    severity: 'critical',
    line: 42,
    description: 'SQL injection risk: user-controlled input interpolated into a SQL query',
    suggestion: 'Use parameterised queries or a prepared statement',
  },
  {
    type: 'ComplexMethod',
    severity: 'high',
    functionName: 'processOrder',
    line: 115,
    description: 'ComplexMethod — cyclomatic complexity 18 exceeds threshold of 15',
    suggestion: 'Extract sub-routines to reduce cyclomatic complexity below 15',
    metricValue: 18,
  },
  {
    type: 'LowDocCoverage',
    severity: 'low',
    line: 1,
    description: 'LowDocCoverage — only 20% of exported functions have JSDoc comments',
    suggestion: 'Add JSDoc comments to public API functions',
    metricValue: 0.2,
  },
];

export const GITLAB_FORMAT_FILE_PATH = 'src/order-service.ts';
