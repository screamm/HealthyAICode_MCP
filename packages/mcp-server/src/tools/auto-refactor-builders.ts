import type { Smell, HealthResult } from '@healthy-ai-code/core';

const CONTEXT_LINES_BEFORE = 3, CONTEXT_LINES_AFTER = 10;
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** State for a file that is already AI-ready and needs no refactoring. */
export interface ReadyFileState { filePath: string; score: number; category: HealthResult['category']; }

/** Builds the MCP response for a file that needs no refactoring. */
export function buildReadyResponse(state: ReadyFileState) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ filePath: state.filePath, score: state.score, category: state.category, refactoringNeeded: false, message: 'Filen är redan AI-redo (score >= 9.5). Ingen refaktorering krävs.' }, null, 2) }] };
}

/** Extracts a window of source lines around the target line for context. */
export function extractCodeContext(fileContent: string, targetLine: number) {
  const lines = fileContent.split('\n');
  const start = Math.max(0, targetLine - CONTEXT_LINES_BEFORE);
  const end = Math.min(lines.length - 1, targetLine + CONTEXT_LINES_AFTER);
  return { startLine: start + 1, endLine: end + 1, content: lines.slice(start, end + 1).join('\n') };
}

/** Builds the MCP response containing refactoring instructions and full code context. */
export function buildRefactorResponse(filePath: string, result: HealthResult, target: Smell | null, source: { fileContent: string; codeContext: { startLine: number; endLine: number; content: string } }) {
  const { fileContent, codeContext } = source;
  return { content: [{ type: 'text' as const, text: JSON.stringify({ filePath, score: result.score, category: result.category, refactoringNeeded: true, allSmells: result.smells, primaryTarget: target, refactoringInstructions: buildInstructions(target, result.score), codeContext, fullFileContent: fileContent, nextStep: 'Genomför refaktoreringen ovan och kör sedan code_health_review för att mäta förbättringen.' }, null, 2) }] };
}

/** Returns the highest-severity finding from the list, or null if empty. */
export function getTopTarget(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  return [...smells].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4))[0];
}

/** Formats step-by-step refactoring instructions for the primary target finding. */
export function buildInstructions(target: Smell | null, currentScore: number): string {
  if (!target) return 'Inga specifika problem identifierade. Förbättra den generella kodstrukturen.';
  return [`PRIMÄRT MÅL: ${target.type} (${target.severity}) på rad ${target.line}`, `Problem: ${target.description}`, `Åtgärd: ${target.suggestion}`, '', `Nuvarande score: ${currentScore}/10.0`, 'Genomför ENBART denna ändring, undvik att ändra annan logik.', 'Kör code_health_review efter ändringen för att verifiera förbättringen.'].join('\n');
}
