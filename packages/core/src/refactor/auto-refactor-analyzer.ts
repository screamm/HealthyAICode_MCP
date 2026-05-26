import { analyzeCode } from '../index';
import type { Smell, SmellType, Language, FunctionResult } from '../types';
import { getRefactoringTemplate, type RefactoringStrategy } from './smell-instructions';

export interface AutoRefactorResult {
  filePath: string;
  targetFunction: string;
  smell: Smell;
  currentHealthScore: number;
  startLine: number;
  endLine: number;
  currentCode: string;
  refactoringStrategy: RefactoringStrategy;
  refactoringInstructions: string[];
  exampleSkeleton: string;
  predictedHealthScore: number;
  predictedScoreDelta: string;
  followUpInstruction: string;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Analyzes a code string and returns structured refactoring instructions for the worst smell found.
 * Returns null when no actionable smells are detected (the file is healthy).
 *
 * @param code      Full source code to analyze.
 * @param language  Source language.
 * @param filePath  Used as metadata in the result (defaults to '<inline>').
 * @param targetSmell  Optional SmellType to filter on; if omitted the highest-severity smell is used.
 */
export function analyzeForAutoRefactor(
  code: string,
  language: Language,
  filePath = '<inline>',
  targetSmell?: SmellType
): AutoRefactorResult | null {
  const result = analyzeCode(code, language, filePath);

  if (result.smells.length === 0) return null;

  // Pick the target smell — either the requested type or the highest-severity one.
  const candidate = targetSmell
    ? pickByType(result.smells, targetSmell)
    : pickWorst(result.smells);

  if (!candidate) return null;

  // Find the function this smell belongs to (match by functionName or nearest line).
  const fn = findFunction(result.functions, candidate);

  if (!fn) return null;

  // Extract the code block for the function.
  const lines = code.split('\n');
  const startLine = fn.line;
  const endLine = Math.min(fn.line + fn.length - 1, lines.length);
  const currentCode = lines.slice(startLine - 1, endLine).join('\n');

  const template = getRefactoringTemplate(candidate, fn, code);
  const instructions = template.instructions(candidate, code, fn);

  const rawPredicted = result.score + template.expectedScoreImprovement;
  const predictedHealthScore = Math.min(10.0, parseFloat(rawPredicted.toFixed(1)));
  const delta = predictedHealthScore - result.score;
  const predictedScoreDelta = `+${delta.toFixed(1)}`;

  return {
    filePath,
    targetFunction: fn.name,
    smell: candidate,
    currentHealthScore: result.score,
    startLine,
    endLine,
    currentCode,
    refactoringStrategy: template.strategy,
    refactoringInstructions: instructions,
    exampleSkeleton: template.skeletonHint,
    predictedHealthScore,
    predictedScoreDelta,
    followUpInstruction:
      'Apply these refactoring instructions using model claude-opus-4-7 (claude-opus-4-7-20250219) for the highest fix rate on structured refactoring tasks. ' +
      'Then run code_health_review on the file to verify the improvement. ' +
      'IMPORTANT: Run at least 3 iterations of this refactoring loop — each pass resolves one smell and files typically need 3–5 passes to reach AI-ready status. ' +
      'Continue until code_health_review returns loopComplete: true (score ≥ 9.5). ' +
      'Do not stop after a single refactoring — call code_health_auto_refactor again to get the next smell.',
  };
}

// ─── Private helpers ───────────────────────────────────────────────────────────

/** Returns the highest-severity smell (critical > high > medium > low). */
function pickWorst(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  return [...smells].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4)
  )[0];
}

/** Returns the first smell matching the requested type, or the worst smell if none match. */
function pickByType(smells: Smell[], type: SmellType): Smell | null {
  const matching = smells.filter(s => s.type === type);
  if (matching.length === 0) return null;
  return pickWorst(matching);
}

/** Finds the FunctionResult associated with a smell, matching by functionName or closest line. */
function findFunction(functions: FunctionResult[], smell: Smell): FunctionResult | null {
  if (functions.length === 0) return null;

  // Prefer an exact name match.
  if (smell.functionName) {
    const exact = functions.find(f => f.name === smell.functionName);
    if (exact) return exact;
  }

  // Fall back to the function whose range contains the smell's line.
  const containing = functions.filter(f => {
    const end = f.line + f.length - 1;
    return smell.line >= f.line && smell.line <= end;
  });
  if (containing.length > 0) {
    // Pick the narrowest (innermost) matching function.
    return containing.sort((a, b) => a.length - b.length)[0];
  }

  // Last resort: function with the closest start line.
  return [...functions].sort((a, b) => Math.abs(a.line - smell.line) - Math.abs(b.line - smell.line))[0];
}
