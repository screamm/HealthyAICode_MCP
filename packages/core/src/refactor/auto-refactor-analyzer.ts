import { analyzeCode } from '../index';
import type { Smell, SmellType, Language, FunctionResult } from '../types';
import { getRefactoringTemplate, type RefactoringStrategy } from './smell-instructions';
import { SMELL_WEIGHTS } from '../scoring/weights';

export interface AutoRefactorResult {
  /** What to do next — read this first before looking at the code. */
  followUpInstruction: string;
  /** The smell being targeted in this pass. */
  smell: Smell;
  refactoringStrategy: RefactoringStrategy;
  refactoringInstructions: string[];
  exampleSkeleton: string;
  predictedHealthScore: number;
  predictedScoreDelta: string;
  /** Top remaining smell types after this fix (helpful for planning multi-pass). */
  remainingSmellTypes: string[];
  /** Metadata and code context. */
  filePath: string;
  targetFunction: string;
  currentHealthScore: number;
  startLine: number;
  endLine: number;
  currentCode: string;
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

  // Pick the target smell — either the requested type or the highest-severity + highest-weight one.
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

  // Compute the top remaining smell types (excluding the one we're fixing) for planning.
  const remainingSmellTypes = result.smells
    .filter(s => s !== candidate)
    .sort((a, b) => {
      const wa = SMELL_WEIGHTS[a.type as SmellType] ?? 0;
      const wb = SMELL_WEIGHTS[b.type as SmellType] ?? 0;
      return wb - wa;
    })
    .slice(0, 5)
    .map(s => s.type);

  // De-duplicate while preserving order.
  const uniqueRemaining = [...new Set(remainingSmellTypes)];

  return {
    // Reasoning-first: instructions and context before the code block.
    followUpInstruction:
      'Apply the refactoringInstructions using model claude-opus-4-7 (claude-opus-4-7-20250219). ' +
      'Then run code_health_review to verify. ' +
      'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
      'Minimum 3 iterations — most files need 3–5 passes.',
    smell: candidate,
    refactoringStrategy: template.strategy,
    refactoringInstructions: instructions,
    exampleSkeleton: template.skeletonHint,
    predictedHealthScore,
    predictedScoreDelta,
    remainingSmellTypes: uniqueRemaining,
    // Code context last — read after understanding what to do.
    filePath,
    targetFunction: fn.name,
    currentHealthScore: result.score,
    startLine,
    endLine,
    currentCode,
  };
}

// ─── Private helpers ───────────────────────────────────────────────────────────

/**
 * Returns the highest-priority smell: severity first (critical > high > medium > low),
 * then by score weight (higher weight = more score impact = fix first).
 */
function pickWorst(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  return [...smells].sort((a, b) => {
    const severityDiff = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
    if (severityDiff !== 0) return severityDiff;
    // Break ties by scoring weight so ComplexMethod (1.5) beats LowDocCoverage (0.3).
    const wa = SMELL_WEIGHTS[a.type as SmellType] ?? 0;
    const wb = SMELL_WEIGHTS[b.type as SmellType] ?? 0;
    return wb - wa;
  })[0];
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
