import type { Smell, HealthResult } from '@healthy-ai-code/core';

const CONTEXT_LINES_BEFORE = 3, CONTEXT_LINES_AFTER = 10;
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** State for a file that is already AI-ready and needs no refactoring. */
export interface ReadyFileState { filePath: string; score: number; category: HealthResult['category']; }

/** Builds the MCP response for a file that needs no refactoring. */
export function buildReadyResponse(state: ReadyFileState) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ filePath: state.filePath, score: state.score, category: state.category, refactoringNeeded: false, message: 'File is already AI-ready (score >= 9.5). No refactoring required.' }, null, 2) }] };
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
  return { content: [{ type: 'text' as const, text: JSON.stringify({ filePath, score: result.score, category: result.category, refactoringNeeded: true, allSmells: result.smells, primaryTarget: target, refactoringInstructions: buildInstructions(target, result.score), codeContext, fullFileContent: fileContent, nextStep: 'Apply the refactoring above, then run code_health_review to measure the improvement.' }, null, 2) }] };
}

/** Returns the highest-severity finding from the list, or null if empty. */
export function getTopTarget(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  return [...smells].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4))[0];
}

/** Builds specific BumpyRoad extraction instructions using chunkRanges from the smell. */
function buildBumpyRoadInstructions(target: Smell): string {
  const ranges = target.chunkRanges ?? [];
  if (ranges.length === 0) return target.suggestion;

  const fnName = target.functionName ?? 'this function';
  const chunkLines = ranges
    .map((r, i) => `  Chunk ${i + 1}: lines ${r.startLine}–${r.endLine} → extract to a helper function (suggested name: handleChunk${i + 1}Of${fnName.charAt(0).toUpperCase() + fnName.slice(1)})`)
    .join('\n');

  return [
    `'${fnName}' contains ${ranges.length} sequential control-flow chunks that should be extracted:`,
    chunkLines,
    '',
    'After extraction, the original function should read as a short sequence of named calls — the function\'s story becomes clear and each chunk is testable in isolation.',
    'Preserve order and side effects; do not change logic within each chunk.',
  ].join('\n');
}

/** Formats step-by-step refactoring instructions for the primary target finding. */
export function buildInstructions(target: Smell | null, currentScore: number): string {
  if (!target) return 'No specific issues found. Improve the general code structure.';

  const targetSuggestion = target.type === 'BumpyRoad' && target.chunkRanges
    ? buildBumpyRoadInstructions(target)
    : target.suggestion;

  return [
    `PRIMARY TARGET: ${target.type} (${target.severity}) on line ${target.line}`,
    `Problem: ${target.description}`,
    `Action: ${targetSuggestion}`,
    '',
    `Current score: ${currentScore}/10.0`,
    'Apply ONLY this change; avoid touching other logic.',
    'Run code_health_review after the change to verify the improvement.',
  ].join('\n');
}
