import type { HealthResult, Smell } from '@healthy-ai-code/core';
import type { NextAction } from '../types';

export function buildNextAction(result: HealthResult, loopComplete: boolean): NextAction {
  if (loopComplete) {
    return {
      action: 'commit_safe',
      instruction: `Koden är AI-redo (${result.score}/10.0). Inga problem identifierade. Kör pre_commit_code_health_safeguard innan commit.`,
      priority: null,
      toolToCallAfter: null,
    };
  }

  const prioritySmell = getPrioritySmell(result.smells);
  return {
    action: 'refactor',
    instruction: prioritySmell
      ? `${prioritySmell.suggestion} Kör sedan code_health_review igen för att mäta förbättringen.`
      : `Förbättra kodens hälsa från ${result.score}/10.0. Kör code_health_review igen efter ändringar.`,
    priority: prioritySmell,
    toolToCallAfter: 'code_health_review',
  };
}

function getPrioritySmell(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return [...smells].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))[0];
}

export function formatReviewSummary(filePath: string, result: HealthResult): string {
  const lines: string[] = [
    `Fil: ${filePath}`,
    `Hälsopoäng: ${result.score}/10.0  (${categoryLabel(result.category)})`,
    '',
  ];

  if (result.smells.length === 0) {
    lines.push('Inga problem identifierade. Koden är AI-redo.');
    return lines.join('\n');
  }

  lines.push('Identifierade problem:');
  for (const smell of result.smells) {
    lines.push(`  ${severityLabel(smell.severity)} ${smell.type}: ${smell.description}`);
    lines.push(`             → ${smell.suggestion}`);
  }
  return lines.join('\n');
}

function categoryLabel(category: HealthResult['category']): string {
  if (category === 'red') return 'Röd — Allvarlig teknisk skuld';
  if (category === 'yellow') return 'Gul — Teknisk skuld';
  return 'Grön — Hälsosam';
}

function severityLabel(severity: Smell['severity']): string {
  if (severity === 'critical') return '[KRITISK]';
  if (severity === 'high') return '[HÖG]    ';
  return '[MEDIUM] ';
}
