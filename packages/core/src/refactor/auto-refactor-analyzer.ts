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
  /**
   * True when predicted improvement is < 0.3 pts even after batching co-located smells.
   * When stagnating, consider accepting the current score or switching to a different file.
   */
  stagnating: boolean;
  /** Top remaining smell types after this fix (helpful for planning multi-pass). */
  remainingSmellTypes: string[];
  /**
   * Other smells on the same function as the target smell.
   * Fix these in the same pass to reduce total iteration count.
   */
  colocatedSmells: string[];
  /** Metadata and code context. */
  filePath: string;
  targetFunction: string;
  currentHealthScore: number;
  startLine: number;
  endLine: number;
  /** Number of lines in the target function — helps gauge refactoring scope. */
  functionLineCount: number;
  currentCode: string;
  /**
   * Lines immediately surrounding the smell location (± 8 lines, capped at function bounds).
   * Only present when the function exceeds 40 lines — use as a fast-focus starting point;
   * currentCode has the full picture.
   * Research basis: CigaR (2024) achieves 73% token reduction via targeted context narrowing.
   */
  focusLines?: string;
  /**
   * Estimated fix difficulty based on empirical research.
   * 'easy'   — >80 % LLM success rate (MagicNumber, MessageChain, LowDocCoverage, …)
   * 'medium' — 50–80 % (ComplexMethod, DeepNesting, LargeMethod, …)
   * 'hard'   — <50 % (GodClass, FeatureEnvy, BrainMethod, SATD)
   * If the current smell is 'hard' and stagnating, prefer switching to an easier co-located smell.
   * Research: EM-Assist (arXiv 2401.15298) 53.4 % recall; SATD repayment only 10 % EM (arXiv 2501.09888).
   */
  successLikelihood: 'easy' | 'medium' | 'hard';
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Smell types that are derived or temporal metrics and are never selected as the primary
 * auto-refactor target. Targeting them directly wastes an iteration without moving the score:
 *
 * - LowMaintainability: derived from CC + SLOC; fix ComplexMethod/LargeMethod instead.
 *   Rationale: MI = 171 − 5.2·ln(HV) − 0.23·CC − 10.2·ln(SLOC).
 *
 * - Temporal smells (CodeChurn, DeveloperCongestion, KnowledgeLoss, MethodTemporalCoupling):
 *   reflect git history, not source code content. Code-level refactoring cannot fix them —
 *   they require process/team changes and will resolve naturally over time.
 */
const DERIVED_SMELL_TYPES = new Set<SmellType>([
  'LowMaintainability',
  'CodeChurn',
  'DeveloperCongestion',
  'KnowledgeLoss',
  'MethodTemporalCoupling',
]);

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
  const functionLineCount = endLine - startLine + 1;

  // For large functions, compute a focused excerpt around the smell's line.
  // Research (CigaR 2024): targeted context narrowing reduces token cost by up to 73 %.
  const FOCUS_WINDOW = 8;
  const LARGE_FN_THRESHOLD = 40;
  const focusLines = functionLineCount > LARGE_FN_THRESHOLD
    ? (() => {
        const smellIdx = candidate.line - 1; // 0-based
        const focusStart = Math.max(startLine - 1, smellIdx - FOCUS_WINDOW);
        const focusEnd   = Math.min(endLine   - 1, smellIdx + FOCUS_WINDOW);
        return lines.slice(focusStart, focusEnd + 1).join('\n');
      })()
    : undefined;

  // Estimate fix difficulty based on empirical research (EM-Assist 2024, arXiv 2501.09888).
  const EASY_SMELLS = new Set<SmellType>([
    'MagicNumber', 'LowDocCoverage', 'MessageChain', 'LongParameterList',
    'ComplexConditional', 'DocumentationDebt', 'DataClumps', 'PrimitiveObsession',
  ]);
  const HARD_SMELLS = new Set<SmellType>(['GodClass', 'FeatureEnvy', 'SATD', 'BrainMethod']);
  const successLikelihood: 'easy' | 'medium' | 'hard' =
    HARD_SMELLS.has(candidate.type as SmellType) ? 'hard'
    : EASY_SMELLS.has(candidate.type as SmellType) ? 'easy'
    : 'medium';

  const template = getRefactoringTemplate(candidate, fn, code);
  const instructions = template.instructions(candidate, code, fn);

  // Prepend explicit refactoring-type header.
  // Research (EM-Assist 2024): explicit type specification raises LLM success rate from 15.6 % to 86.7 %.
  const strategyLabel = template.strategy.replace(/_/g, ' ').toUpperCase();
  instructions.unshift(
    `[REFACTORING: ${strategyLabel} — ${candidate.type} in '${fn.name}' — ${candidate.description.slice(0, 100)}]`
  );

  // Compute co-located smells: other smells on the same function, sorted by weight.
  // Fixing them in the same pass reduces total iterations needed.
  const colocatedSmells = candidate.functionName
    ? [...new Set(
        result.smells
          .filter(s => s !== candidate && s.functionName === candidate.functionName)
          .sort((a, b) => (SMELL_WEIGHTS[b.type as SmellType] ?? 0) - (SMELL_WEIGHTS[a.type as SmellType] ?? 0))
          .slice(0, 3)
          .map(s => s.type)
      )]
    : [];

  // Boost predicted score for co-located smells being fixed in the same pass.
  // Each co-located smell with a single occurrence contributes weight × √1 = weight to the score
  // deduction. Recovering that with 85 % confidence (not all may be fully eliminated).
  const colocatedScoreBoost = colocatedSmells.reduce(
    (sum, type) => sum + (SMELL_WEIGHTS[type as SmellType] ?? 0) * 0.85,
    0
  );

  const rawPredicted = result.score + template.expectedScoreImprovement + colocatedScoreBoost;
  const predictedHealthScore = Math.min(10.0, parseFloat(rawPredicted.toFixed(1)));
  const delta = predictedHealthScore - result.score;
  const predictedScoreDelta = `+${delta.toFixed(1)}`;

  // Stagnation: when predicted gain is tiny, the loop should consider stopping.
  const stagnating = delta < 0.3;

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

  // Append a bonus step when there are co-located smells fixable in this same pass.
  if (colocatedSmells.length > 0) {
    instructions.push(
      `BONUS — same function, one pass: also fix ${colocatedSmells.join(', ')} in '${fn.name}'. ` +
      `Batching co-located smells cuts total iterations needed.`
    );
  }

  return {
    // Reasoning-first: instructions and context before the code block.
    followUpInstruction:
      'Apply the refactoringInstructions using model claude-opus-4-7. ' +
      'Structural changes only — do not rename variables or functions unless the refactoring requires it. ' +
      'Then run code_health_review. ' +
      'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
      'Typically 2–4 iterations total. Stop immediately if stagnating: true — accept the current score or switch to a different file. ' +
      'Target: ≥ 9.5 (research shows AI-induced defect risk increases 60 % below this threshold).',
    smell: candidate,
    refactoringStrategy: template.strategy,
    refactoringInstructions: instructions,
    exampleSkeleton: template.skeletonHint,
    predictedHealthScore,
    predictedScoreDelta,
    stagnating,
    remainingSmellTypes: uniqueRemaining,
    colocatedSmells,
    successLikelihood,
    // Code context last — read after understanding what to do.
    filePath,
    targetFunction: fn.name,
    currentHealthScore: result.score,
    startLine,
    endLine,
    functionLineCount,
    currentCode,
    focusLines,
  };
}

// ─── Private helpers ───────────────────────────────────────────────────────────

/**
 * Returns the highest-priority smell: severity first (critical > high > medium > low),
 * then by score weight (higher weight = more score impact = fix first).
 * Derived metrics (LowMaintainability) are deprioritised — they resolve automatically
 * once their root-cause smells are addressed.
 */
function pickWorst(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  const sort = (arr: Smell[]) =>
    [...arr].sort((a, b) => {
      const severityDiff = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
      if (severityDiff !== 0) return severityDiff;
      // Break ties by scoring weight so ComplexMethod (1.5) beats LowDocCoverage (0.3).
      const wa = SMELL_WEIGHTS[a.type as SmellType] ?? 0;
      const wb = SMELL_WEIGHTS[b.type as SmellType] ?? 0;
      return wb - wa;
    });
  // Prefer actionable smells over derived metrics; fall back if only derived smells exist.
  const actionable = smells.filter(s => !DERIVED_SMELL_TYPES.has(s.type as SmellType));
  return sort(actionable.length > 0 ? actionable : smells)[0];
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
