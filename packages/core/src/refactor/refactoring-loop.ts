import { analyzeCode } from '../index';
import { applyAutoRefactor } from './auto-refactor-applier';
import { analyzeForAutoRefactor, countCommentLines } from './auto-refactor-analyzer';
import { generateMissingJsDoc } from './jsdoc-generator';
import { buildPreActPlan, type PreActPlan } from './pre-act-planner';
import type { Language, SmellType } from '../types';

/** Records the outcome of one improvement iteration in {@link runRefactoringLoop}. */
export interface RefactoringStep {
  strategy: string;
  targetFunction: string;
  smell: string;
  scoreBefore: number;
  scoreAfter: number;
  changes: string[];
}

/** Aggregated result returned by {@link runRefactoringLoop} after all iterations complete. */
export interface RefactoringLoopResult {
  finalCode: string;
  originalScore: number;
  finalScore: number;
  steps: RefactoringStep[];
  loopComplete: boolean;
}

/** Options for {@link runRefactoringLoop}. */
export interface RefactoringLoopOptions {
  code: string;
  language: Language;
  filePath: string;
  aiReadyThreshold?: number;
  maxIterations?: number;
}

/** State threaded through each iteration of the refactoring loop. */
interface LoopState {
  currentCode: string;
  language: Language;
  filePath: string;
  aiReadyThreshold: number;
  steps: RefactoringStep[];
  /** Sprint 54 — whole-file Pre-Act plan, computed once before the loop starts. */
  preActPlan: PreActPlan;
  /** Sprint 54 — current 0-based iteration; drives plan-ordered smell selection. */
  iteration: number;
}

/**
 * Sprint 54 — comment-count invariant tolerance: a step whose comment-line count drops below
 * 90 % of the pre-step count is rejected as comment-stripping (a Goodhart trap, arXiv 2602.21833).
 */
const COMMENT_COUNT_FLOOR_RATIO = 0.9;

/**
 * Sprint 54 — minimum number of non-identifier ("structural") token changes a step must make
 * to count as real progress. Fewer than this with identifier swaps present ⇒ rename-only.
 */
const RENAME_ONLY_STRUCTURAL_THRESHOLD = 3;

/**
 * Runs the full improvement loop on a code string:
 *   1. Analyze code for smells
 *   2. If score >= aiReadyThreshold (9.5), return complete
 *   3. Otherwise, get an improvement plan and apply it
 *   4. Re-analyze
 *   5. If JSDoc coverage is low, generate JSDoc
 *   6. Loop until score >= 9.5 or no more improvements possible
 */
export function runRefactoringLoop(
  code: string,
  language: Language,
  filePath: string,
  aiReadyThreshold = 9.5,
  maxIterations = 20
): RefactoringLoopResult {
  // Pre-Act (Sprint 54): plan the whole file ONCE before iterating so steps run in
  // descending marginal-delta order rather than greedily re-picking each iteration.
  const preActPlan = buildPreActPlan(code, language, filePath);
  const state: LoopState = {
    currentCode: code, language, filePath, aiReadyThreshold, steps: [], preActPlan, iteration: 0,
  };
  const originalScore = analyzeCode(code, language, filePath).score;
  return executeLoop(state, originalScore, maxIterations);
}

/** Runs the main iteration loop and returns the final result. */
function executeLoop(state: LoopState, originalScore: number, maxIterations: number): RefactoringLoopResult {
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    state.iteration = iteration;
    const health = analyzeCode(state.currentCode, state.language, state.filePath);
    // Stopping rule (Sprint 54): stop on target reached. The per-iteration Δ < 0.1 noise-floor
    // check is enforced inside applyRefactorStep (a sub-threshold step is non-progress).
    if (health.score >= state.aiReadyThreshold) {
      return buildResult({ state, originalScore, finalScore: health.score, loopComplete: true });
    }
    const improved = applyRefactorStep(state, health.score) || applyJsDocStep(state, health.score);
    if (!improved) break;
  }
  const finalHealth = analyzeCode(state.currentCode, state.language, state.filePath);
  return buildResult({ state, originalScore, finalScore: finalHealth.score, loopComplete: finalHealth.score >= state.aiReadyThreshold });
}

/** Convergence noise floor: a step recovering less than this is treated as non-progress. */
const CONVERGENCE_NOISE_FLOOR = 0.1;

/**
 * Picks the smell type to target this iteration, following the Pre-Act plan order
 * (steps are pre-sorted by descending marginal delta); falls back to greedy `pickWorst`
 * (undefined target) once the plan is exhausted.
 */
function planTargetForIteration(state: LoopState): SmellType | undefined {
  return state.preActPlan.steps[state.iteration]?.smellType;
}

/** Attempts a smell-based improvement step; returns true if code changed AND made real progress. */
function applyRefactorStep(state: LoopState, scoreBefore: number): boolean {
  const targetSmell = planTargetForIteration(state);
  const plan = analyzeForAutoRefactor(state.currentCode, state.language, state.filePath, { targetSmell })
    // Plan step's smell may no longer exist after earlier edits — fall back to greedy worst.
    ?? analyzeForAutoRefactor(state.currentCode, state.language, state.filePath);
  if (!plan) return false;
  const result = applyAutoRefactor(state.currentCode, plan, state.language);
  // A deferred (manual/LLM) or rejected (failed re-parse) transform makes no change.
  if (result.requiresManualIntervention) return false;
  if (result.transformedCode === state.currentCode) return false;

  // Invariant guards (Sprint 54): reject comment-stripping, rename-only churn, and
  // sub-noise-floor steps — all count as non-progress and leave currentCode unchanged.
  if (!commentCountPreserved(state.currentCode, result.transformedCode)) return false;
  if (isRenameOnly(state.currentCode, result.transformedCode)) return false;

  const afterHealth = analyzeCode(result.transformedCode, state.language, state.filePath);
  if (afterHealth.score - scoreBefore < CONVERGENCE_NOISE_FLOOR) return false;

  state.steps.push({
    strategy: result.strategy,
    targetFunction: plan.targetFunction,
    smell: plan.smell.type,
    scoreBefore,
    scoreAfter: afterHealth.score,
    changes: result.changes,
  });
  state.currentCode = result.transformedCode;
  return true;
}

/**
 * Comment-count NON-DECREASING invariant (Sprint 54): returns false when the transformed code
 * has fewer than 90 % of the comment lines of the original — i.e. comments were stripped to
 * game the score (arXiv 2602.21833). A 10 % tolerance allows legitimate comment cleanup.
 */
function commentCountPreserved(before: string, after: string): boolean {
  const beforeCount = countCommentLines(before);
  if (beforeCount === 0) return true;
  const afterCount = countCommentLines(after);
  return afterCount >= beforeCount * COMMENT_COUNT_FLOOR_RATIO;
}

/** Matches a bare identifier token (no operators/brackets/literals). */
const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Splits source into significant tokens (whitespace and punctuation as delimiters, kept out). */
function tokenize(code: string): string[] {
  return code.split(/[^a-zA-Z0-9_$]+/).filter(t => t.length > 0);
}

/**
 * Rename-only guard (Sprint 54): returns true when the only differences between two code
 * versions are identifier substitutions (e.g. `processData` → `handleData`) with fewer than
 * RENAME_ONLY_STRUCTURAL_THRESHOLD structural (non-identifier) token changes. Such "fixes"
 * oscillate without improving structure (arXiv 2512.10350) and are counted as non-progress.
 */
export function isRenameOnly(codeBefore: string, codeAfter: string): boolean {
  if (codeBefore === codeAfter) return false;

  const beforeTokens = tokenize(codeBefore);
  const afterTokens = tokenize(codeAfter);

  // Compare token streams positionally; count identifier swaps vs. structural changes.
  let identifierSwaps = 0;
  let structuralChanges = Math.abs(beforeTokens.length - afterTokens.length);
  const len = Math.min(beforeTokens.length, afterTokens.length);
  for (let i = 0; i < len; i++) {
    if (beforeTokens[i] === afterTokens[i]) continue;
    const bothIdentifiers = IDENTIFIER_RE.test(beforeTokens[i]) && IDENTIFIER_RE.test(afterTokens[i]);
    if (bothIdentifiers) {
      identifierSwaps++;
    } else {
      structuralChanges++;
    }
  }
  return identifierSwaps > 0 && structuralChanges < RENAME_ONLY_STRUCTURAL_THRESHOLD;
}

/** Attempts a JSDoc generation step; returns true if code changed. */
function applyJsDocStep(state: LoopState, scoreBefore: number): boolean {
  const health = analyzeCode(state.currentCode, state.language, state.filePath);
  const jsDocResult = generateMissingJsDoc(state.currentCode, health);
  if (jsDocResult.code === state.currentCode) return false;
  const afterHealth = analyzeCode(jsDocResult.code, state.language, state.filePath);
  state.steps.push({
    strategy: 'jsdoc_generation',
    targetFunction: '',
    smell: 'LowDocCoverage',
    scoreBefore,
    scoreAfter: afterHealth.score,
    changes: jsDocResult.changes,
  });
  state.currentCode = jsDocResult.code;
  return true;
}

interface LoopOutcome {
  state: LoopState;
  originalScore: number;
  finalScore: number;
  loopComplete: boolean;
}

/** Assembles the final result object. */
function buildResult({ state, originalScore, finalScore, loopComplete }: LoopOutcome): RefactoringLoopResult {
  return {
    finalCode: state.currentCode,
    originalScore,
    finalScore,
    steps: state.steps,
    loopComplete,
  };
}
