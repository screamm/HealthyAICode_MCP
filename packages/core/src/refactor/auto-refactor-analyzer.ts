import { analyzeCode } from '../index';
import type { Smell, SmellType, Language, FunctionResult } from '../types';
import { getRefactoringTemplate, type RefactoringStrategy } from './smell-instructions';
import { SMELL_WEIGHTS } from '../scoring/weights';
import { buildFollowUpInstruction } from './follow-up-instruction';
import { pickWorst, pickByType, findFunction } from './smell-picker';

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
  /**
   * How widely the refactoring must reach to fully resolve the smell.
   * 'function' — edit only within the target function (most smells).
   * 'class'    — changes span multiple methods / the whole class (GodClass, FeatureEnvy).
   * 'file'     — changes affect many or all exports in the file (LowDocCoverage, DocumentationDebt).
   * Use this to scope your edits precisely — do not touch code outside this boundary.
   * Research: 27.6 % of LLM refactoring errors occur when scope is ambiguous (arXiv 2510.26480).
   */
  changeScope: 'function' | 'class' | 'file';
  /**
   * True when currentHealthScore ≥ 9.0 — code is entering the stabilisation phase.
   * Switch to minimal-diff mode: fix one smell per pass, avoid structural changes.
   * Research: arXiv 2602.21833 found LLMs over-optimise past the 9.0 mark, trading
   * readability gains for regressions. Explicit "near-target" signalling prevents this.
   */
  nearTarget: boolean;
  /**
   * True when nearTarget AND focusLines is present (large function near target score).
   * When true, focusLines contains all necessary context — reading currentCode is wasteful.
   * Saves 50–200 input tokens per iteration for large functions in the final refactoring passes.
   * Research: SWE-Pruner (arXiv 2601.16746) shows aggressive context pruning improves
   * coding-agent accuracy; irrelevant padding degrades model performance (67.6 pt MMLU drop
   * at 30K padding tokens).
   */
  skipCurrentCode: boolean;
  /**
   * Adaptive hard-stop budget: easy → 3, medium → 4, hard → 5.
   * Research (arXiv 2604.10508): most gains concentrate in the first 2 rounds;
   * benefits diminish sharply after 2–3 iterations (FeedbackEval arXiv 2504.06939).
   * Reducing the budget for easy smells avoids wasted iterations and tool calls.
   */
  iterationBudget: number;
  /**
   * 'diff' — output only the refactored lines from focusLines (when skipCurrentCode: true).
   * Write only the changed lines, not the full function — preserves untouched lines
   * and saves output tokens. Apply using search-replace on the focusLines excerpt.
   * 'full' — output the complete refactored block (structural changes, class extraction, etc.).
   * Research: PAFT (arXiv 2604.03113) shows minimal-edit patches reduce regression risk.
   */
  outputMode: 'diff' | 'full';
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
   * Research: EM-Assist (arXiv 2401.15298) 53.4 % recall; SmellBench (arXiv 2605.07001) 47.7 %
   * best-case resolution; SATD repayment only 10 % EM (arXiv 2501.09888).
   * Thinking effort scales with difficulty: easy→low, medium→medium, hard→xhigh (Opus 4.7), hard+score<5→max.
   */
  successLikelihood: 'easy' | 'medium' | 'hard';
}



// Scope smell sets — module-level so helpers and the main function can share them.
// File-scoped smells require touching all exports; class-scoped smells span multiple methods;
// most smells are contained to a single function.
const FILE_SCOPE_SMELLS = new Set<SmellType>(['LowDocCoverage', 'DocumentationDebt']);
const CLASS_SCOPE_SMELLS = new Set<SmellType>(['GodClass', 'FeatureEnvy', 'DataClumps']);

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

  const candidate = targetSmell
    ? pickByType(result.smells, targetSmell)
    : pickWorst(result.smells);
  if (!candidate) return null;

  const fn = findFunction(result.functions, candidate);
  if (!fn) return null;

  return buildAutoRefactorResult({ code, filePath, result, candidate, fn });
}

interface RefactorContext {
  lines: string[];
  startLine: number;
  endLine: number;
  currentCode: string;
  functionLineCount: number;
  focusLines: string | undefined;
  successLikelihood: 'easy' | 'medium' | 'hard';
  nearTarget: boolean;
  skipCurrentCode: boolean;
  changeScope: 'function' | 'class' | 'file';
  iterationBudget: number;
  outputMode: 'diff' | 'full';
}

/** Computes all context values needed to build the AutoRefactorResult. */
function computeRefactorContext({ code, result, candidate, fn }: BuildResultOptions): RefactorContext {
  const lines = code.split('\n');
  const startLine = fn.line;
  const endLine = Math.min(fn.line + fn.length - 1, lines.length);
  const currentCode = lines.slice(startLine - 1, endLine).join('\n');
  const functionLineCount = endLine - startLine + 1;

  const isClassLevelSmell = CLASS_SCOPE_SMELLS.has(candidate.type as SmellType)
    || FILE_SCOPE_SMELLS.has(candidate.type as SmellType);
  const focusLines = buildFocusLines(lines, candidate, {
    score: result.score, startLine, endLine, functionLineCount, isClassLevelSmell,
  });
  const successLikelihood = chooseSuccessLikelihood(candidate);
  const nearTarget = result.score >= 9.0;
  const skipCurrentCode = nearTarget && focusLines !== undefined;
  return {
    lines, startLine, endLine, currentCode, functionLineCount, focusLines,
    successLikelihood, nearTarget, skipCurrentCode,
    changeScope: computeChangeScope(candidate),
    iterationBudget: computeIterationBudget(successLikelihood),
    outputMode: skipCurrentCode ? 'diff' : 'full',
  };
}

interface ComputedParts {
  ctx: RefactorContext;
  template: ReturnType<typeof getRefactoringTemplate>;
  instructions: string[];
  scorePrediction: ScorePrediction;
  uniqueRemaining: string[];
  colocatedSmells: string[];
  followUpInstruction: string;
}

/** Computes all intermediate parts needed for the final result. */
function computeAllParts(opts: BuildResultOptions): ComputedParts {
  const { code, result, candidate, fn } = opts;
  const ctx = computeRefactorContext(opts);
  const template = getRefactoringTemplate(candidate, fn, code);
  const instructions = buildInstructions(template, candidate, fn, code);
  const colocatedSmells = computeColocatedSmells(result.smells, candidate);
  appendColocatedBonus(instructions, colocatedSmells, fn.name);
  const scorePrediction = computeScorePrediction(result.score, template, colocatedSmells);
  const uniqueRemaining = computeRemainingSmells(result.smells, candidate);
  const effortParam = computeEffortParam(ctx.nearTarget, ctx.successLikelihood, result.score);
  const followUpInstruction = buildFollowUpInstruction({
    nearTarget: ctx.nearTarget,
    strategyLabel: template.strategy.replace(/_/g, ' ').toUpperCase(),
    modelNote: `claude-opus-4-7 with thinking effort: ${effortParam}`,
    successLikelihood: ctx.successLikelihood,
    skipCurrentCode: ctx.skipCurrentCode,
    focusLines: ctx.focusLines,
    changeScope: ctx.changeScope,
    iterationBudget: ctx.iterationBudget,
    outputMode: ctx.outputMode,
  });
  return { ctx, template, instructions, scorePrediction, uniqueRemaining, colocatedSmells, followUpInstruction };
}

interface BuildResultOptions {
  code: string;
  filePath: string;
  result: ReturnType<typeof analyzeCode>;
  candidate: Smell;
  fn: FunctionResult;
}

/** Builds the complete AutoRefactorResult from the pre-selected candidate and function. */
function buildAutoRefactorResult(opts: BuildResultOptions): AutoRefactorResult {
  const { code, filePath, result, candidate, fn } = opts;
  const p = computeAllParts(opts);
  return {
    // Reasoning-first: instructions and context before the code block.
    followUpInstruction: p.followUpInstruction,
    smell: candidate,
    refactoringStrategy: p.template.strategy,
    refactoringInstructions: p.instructions,
    exampleSkeleton: p.template.skeletonHint,
    predictedHealthScore: p.scorePrediction.predictedHealthScore,
    predictedScoreDelta: p.scorePrediction.predictedScoreDelta,
    stagnating: p.scorePrediction.stagnating,
    nearTarget: p.ctx.nearTarget,
    skipCurrentCode: p.ctx.skipCurrentCode,
    outputMode: p.ctx.outputMode,
    iterationBudget: p.ctx.iterationBudget,
    changeScope: p.ctx.changeScope,
    remainingSmellTypes: p.uniqueRemaining,
    colocatedSmells: p.colocatedSmells,
    successLikelihood: p.ctx.successLikelihood,
    // Code context last — read after understanding what to do.
    filePath,
    targetFunction: fn.name,
    currentHealthScore: result.score,
    startLine: p.ctx.startLine,
    endLine: p.ctx.endLine,
    functionLineCount: p.ctx.functionLineCount,
    currentCode: p.ctx.currentCode,
    focusLines: p.ctx.focusLines,
  };
}

// ─── Private helpers ───────────────────────────────────────────────────────────

/**
 * Computes the adaptive thinking effort parameter for Claude Opus 4.x.
 * nearTarget          → "low"   (surgical 1-line change, no deep planning needed).
 * hard + score < 5   → "max"   (architectural debt — GodClass/BrainMethod on near-untestable code).
 * hard               → "xhigh" (Opus 4.7: sustained multi-step structural refactoring; falls back to "high" on earlier models).
 * else               → "medium" (default was silently lowered in March 2026; be explicit).
 * Research: xhigh outperforms high on multi-file refactoring tasks by ~18 % (Opus 4.7 release notes).
 */
function computeEffortParam(
  nearTarget: boolean,
  successLikelihood: 'easy' | 'medium' | 'hard',
  score: number
): string {
  if (nearTarget) return '"low"';
  if (successLikelihood === 'hard' && score < 5) return '"max"';
  if (successLikelihood === 'hard') return '"xhigh"';
  return '"medium"';
}

interface FocusLinesContext {
  score: number;
  startLine: number;
  endLine: number;
  functionLineCount: number;
  isClassLevelSmell: boolean;
}

/**
 * Builds the focusLines excerpt — a windowed slice around the smell location.
 * Research (CigaR 2024): targeted context narrowing reduces token cost by up to 73 %.
 * Near target (score ≥ 9.0): skipCurrentCode will be set, so focusLines MUST cover enough
 * context for the surgical fix without reading currentCode.
 * Research: "containing method body is the right unit" — ±20 lines is sufficient for targeted fixes.
 * GodClass targets the entire class body — a windowed excerpt is useless and misleading.
 */
function buildFocusLines(
  lines: string[],
  candidate: Smell,
  ctx: FocusLinesContext
): string | undefined {
  const FOCUS_WINDOW = ctx.score >= 9.0 ? 20 : 8;
  const LARGE_FN_THRESHOLD = 40;
  // GodClass requires cross-class reasoning; method-level focusLines doesn't apply
  // (arXiv 2503.20934: Move Method + IDE semantics needed; GodClass not reliably automated).
  if (ctx.isClassLevelSmell || ctx.functionLineCount <= LARGE_FN_THRESHOLD) return undefined;

  const smellIdx = candidate.line - 1; // 0-based
  const focusStart = Math.max(ctx.startLine - 1, smellIdx - FOCUS_WINDOW);
  const focusEnd   = Math.min(ctx.endLine   - 1, smellIdx + FOCUS_WINDOW);
  return lines.slice(focusStart, focusEnd + 1).join('\n');
}

/**
 * Estimates fix difficulty based on empirical research (EM-Assist 2024, arXiv 2501.09888).
 * easy   — >80 % LLM success rate
 * medium — 50–80 %
 * hard   — <50 %
 */
function chooseSuccessLikelihood(candidate: Smell): 'easy' | 'medium' | 'hard' {
  const EASY_SMELLS = new Set<SmellType>([
    'MagicNumber', 'LowDocCoverage', 'MessageChain', 'LongParameterList',
    'ComplexConditional', 'DocumentationDebt', 'DataClumps', 'PrimitiveObsession',
  ]);
  const HARD_SMELLS = new Set<SmellType>(['GodClass', 'FeatureEnvy', 'SATD', 'BrainMethod']);
  if (HARD_SMELLS.has(candidate.type as SmellType)) return 'hard';
  if (EASY_SMELLS.has(candidate.type as SmellType)) return 'easy';
  return 'medium';
}

/** Determines how broadly the refactoring must reach based on the smell type. */
function computeChangeScope(candidate: Smell): 'function' | 'class' | 'file' {
  if (FILE_SCOPE_SMELLS.has(candidate.type as SmellType)) return 'file';
  if (CLASS_SCOPE_SMELLS.has(candidate.type as SmellType)) return 'class';
  return 'function';
}

const ITERATION_BUDGET_EASY = 3;
const ITERATION_BUDGET_MEDIUM = 4;
const ITERATION_BUDGET_HARD = 5;

/** Adaptive iteration budget: easy → 3, medium → 4, hard → 5. */
function computeIterationBudget(successLikelihood: 'easy' | 'medium' | 'hard'): number {
  if (successLikelihood === 'easy') return ITERATION_BUDGET_EASY;
  if (successLikelihood === 'hard') return ITERATION_BUDGET_HARD;
  return ITERATION_BUDGET_MEDIUM;
}

/** Builds the instruction list and prepends the refactoring-type header. */
function buildInstructions(
  template: ReturnType<typeof getRefactoringTemplate>,
  candidate: Smell,
  fn: FunctionResult,
  code: string
): string[] {
  const instructions = template.instructions(candidate, code, fn);
  // Research: explicit strategy naming raises LLM success rate from 15.6 % to 86.7 % (arXiv 2511.21788).
  // CodeTaste (arXiv 2603.04177): "agents perform well when refactorings are specified in detail,
  // but often fail to discover the human refactoring choices when only presented with a focus area."
  const strategyLabel = template.strategy.replace(/_/g, ' ').toUpperCase();
  instructions.unshift(
    `[REFACTORING: ${strategyLabel} — ${candidate.type} in '${fn.name}' — ${candidate.description.slice(0, 150)}]`
  );
  return instructions;
}

/**
 * Computes the list of co-located smells: other smells on the same function, sorted by weight.
 * Fixing them in the same pass reduces total iterations needed.
 */
function computeColocatedSmells(smells: Smell[], candidate: Smell): string[] {
  if (!candidate.functionName) return [];
  const colocated = smells.filter(s => s !== candidate && s.functionName === candidate.functionName);
  const byWeight = colocated.sort((a, b) => (SMELL_WEIGHTS[b.type as SmellType] ?? 0) - (SMELL_WEIGHTS[a.type as SmellType] ?? 0));
  const top3 = byWeight.slice(0, 3).map(s => s.type);
  return [...new Set(top3)];
}

/** Appends the BONUS step to instructions when co-located smells are present. */
function appendColocatedBonus(instructions: string[], colocatedSmells: string[], fnName: string): void {
  if (colocatedSmells.length === 0) return;
  instructions.push(
    `BONUS — same function, one pass: also fix ${colocatedSmells.join(', ')} in '${fnName}'. ` +
    `Batching co-located smells cuts total iterations needed.`
  );
}

interface ScorePrediction {
  predictedHealthScore: number;
  predictedScoreDelta: string;
  stagnating: boolean;
}

/**
 * Computes the predicted health score, delta string, and stagnation flag.
 * Boosts predicted score for co-located smells being fixed in the same pass.
 * Each co-located smell with a single occurrence contributes weight × √1 = weight to the score
 * deduction. Recovering that with 85 % confidence (not all may be fully eliminated).
 */
function computeScorePrediction(
  currentScore: number,
  template: ReturnType<typeof getRefactoringTemplate>,
  colocatedSmells: string[]
): ScorePrediction {
  const colocatedScoreBoost = colocatedSmells.reduce(
    (sum, type) => sum + (SMELL_WEIGHTS[type as SmellType] ?? 0) * 0.85,
    0
  );
  const rawPredicted = currentScore + template.expectedScoreImprovement + colocatedScoreBoost;
  const predictedHealthScore = Math.min(10.0, parseFloat(rawPredicted.toFixed(1)));
  const delta = predictedHealthScore - currentScore;
  return {
    predictedHealthScore,
    predictedScoreDelta: `+${delta.toFixed(1)}`,
    stagnating: delta < 0.3,
  };
}

/** Computes the top remaining smell types (excluding the candidate) for planning. */
function computeRemainingSmells(smells: Smell[], candidate: Smell): string[] {
  const others = smells.filter(s => s !== candidate);
  const byWeight = others.sort((a, b) => (SMELL_WEIGHTS[b.type as SmellType] ?? 0) - (SMELL_WEIGHTS[a.type as SmellType] ?? 0));
  const top5 = byWeight.slice(0, 5).map(s => s.type);
  return [...new Set(top5)];
}
