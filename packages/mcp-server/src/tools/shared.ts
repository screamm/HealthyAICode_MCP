import type { HealthResult, Smell } from '@healthy-ai-code/core';
import { SMELL_WEIGHTS } from '@healthy-ai-code/core';
import type { NextAction } from '../types';

/**
 * A smell is "scored" when it has a non-zero weight in the health formula. Weight-0 smells
 * (TidyOpportunity) are informational advisories: they never lower the score, are never the
 * refactor-loop target, and are listed separately from real issues in the review summary.
 */
function isScored(smell: Smell): boolean {
  return (SMELL_WEIGHTS[smell.type] ?? 0) > 0;
}

/** Builds the next recommended action for the AI based on the current health result. */
export function buildNextAction(result: HealthResult, loopComplete: boolean): NextAction {
  if (loopComplete) {
    return {
      action: 'commit_safe',
      instruction: `Code is AI-ready (${result.score}/10.0). No issues found. Run pre_commit_code_health_safeguard before committing — it is mandatory per AGENTS.md §3.2.`,
      priority: null,
      toolToCallAfter: null,
    };
  }

  const prioritySmell = getPrioritySmell(result.smells);
  return {
    action: 'refactor',
    instruction: prioritySmell
      ? `${prioritySmell.suggestion} This is one (1) refactoring step — do not make more changes in the same commit. Run code_health_review immediately afterwards to verify the score went up and no new smells were introduced (AGENTS.md §4).`
      : `Improve the code health from ${result.score}/10.0 toward the target of 10.0. Refactor in 3–5 steps — one smell per step, run code_health_review after each. Do not stop the loop until loopComplete: true.`,
    priority: prioritySmell,
    toolToCallAfter: 'code_health_review',
  };
}

function getPrioritySmell(smells: Smell[]): Smell | null {
  // Only scored smells are refactor targets; a weight-0 advisory is never the next action.
  const scored = smells.filter(isScored);
  if (scored.length === 0) return null;
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return [...scored].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))[0];
}

/** Formats a human-readable review summary for the given file and health result. */
export function formatReviewSummary(filePath: string, result: HealthResult): string {
  const lines: string[] = [
    `File: ${filePath}`,
    `Health score: ${result.score}/10.0  (${categoryLabel(result.category)})`,
    '',
  ];

  const scored = result.smells.filter(isScored);
  const advisories = result.smells.filter((s) => !isScored(s));

  if (scored.length === 0) {
    lines.push('No issues found. Code is AI-ready.');
  } else {
    lines.push('Issues found:');
    for (const smell of scored) {
      lines.push(`  ${severityLabel(smell.severity)} ${smell.type}: ${smell.description}`);
      lines.push(`             → ${smell.suggestion}`);
    }
  }

  if (advisories.length > 0) {
    lines.push('');
    lines.push('Advisory (informational — does not affect the score or AI-readiness):');
    for (const smell of advisories) {
      lines.push(`  [ADVISORY] ${smell.type}: ${smell.description}`);
      lines.push(`             → ${smell.suggestion}`);
    }
  }
  return lines.join('\n');
}

function categoryLabel(category: HealthResult['category']): string {
  if (category === 'red') return 'Red — Severe technical debt';
  if (category === 'yellow') return 'Yellow — Technical debt';
  return 'Green — Healthy';
}

function severityLabel(severity: Smell['severity']): string {
  if (severity === 'critical') return '[CRITICAL]';
  if (severity === 'high') return '[HIGH]    ';
  return '[MEDIUM]  ';
}
