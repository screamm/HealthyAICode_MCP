import type { HealthResult, Smell } from '@healthy-ai-code/core';
import type { NextAction } from '../types';

/** Builds the next recommended action for the AI based on the current health result. */
export function buildNextAction(result: HealthResult, loopComplete: boolean): NextAction {
  if (loopComplete) {
    return {
      action: 'commit_safe',
      instruction: `Koden är AI-redo (${result.score}/10.0). Inga problem identifierade. Kör pre_commit_code_health_safeguard innan commit — den är obligatorisk enligt AGENTS.md §3.2.`,
      priority: null,
      toolToCallAfter: null,
    };
  }

  const prioritySmell = getPrioritySmell(result.smells);
  return {
    action: 'refactor',
    instruction: prioritySmell
      ? `${prioritySmell.suggestion} Detta är ett (1) refaktoreringssteg — gör inte fler ändringar i samma commit. Kör code_health_review direkt efteråt för att verifiera att score gått upp och inga nya smells introducerats (AGENTS.md §4).`
      : `Förbättra kodens hälsa från ${result.score}/10.0 mot mål 10.0. Refaktorera i 3–5 steg — en smell per steg, kör code_health_review efter varje. Avbryt inte loopen förrän loopComplete: true.`,
    priority: prioritySmell,
    toolToCallAfter: 'code_health_review',
  };
}

function getPrioritySmell(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return [...smells].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))[0];
}

/** Formats a human-readable review summary for the given file and health result. */
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
