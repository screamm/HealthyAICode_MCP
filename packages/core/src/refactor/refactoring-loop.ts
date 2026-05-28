import { analyzeCode } from '../index';
import { applyAutoRefactor, type ApplyResult } from './auto-refactor-applier';
import { analyzeForAutoRefactor, type AutoRefactorResult } from './auto-refactor-analyzer';
import { generateMissingJsDoc, type JsDocResult } from './jsdoc-generator';
import type { Language } from '../types';

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
}

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
  const state: LoopState = { currentCode: code, language, filePath, aiReadyThreshold, steps: [] };
  const originalScore = analyzeCode(code, language, filePath).score;
  return executeLoop(state, originalScore, maxIterations);
}

/** Runs the main iteration loop and returns the final result. */
function executeLoop(state: LoopState, originalScore: number, maxIterations: number): RefactoringLoopResult {
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const health = analyzeCode(state.currentCode, state.language, state.filePath);
    if (health.score >= state.aiReadyThreshold) {
      return buildResult({ state, originalScore, finalScore: health.score, loopComplete: true });
    }
    const improved = applyRefactorStep(state, health.score) || applyJsDocStep(state, health.score);
    if (!improved) break;
  }
  const finalHealth = analyzeCode(state.currentCode, state.language, state.filePath);
  return buildResult({ state, originalScore, finalScore: finalHealth.score, loopComplete: finalHealth.score >= state.aiReadyThreshold });
}

/** Attempts a smell-based improvement step; returns true if code changed. */
function applyRefactorStep(state: LoopState, scoreBefore: number): boolean {
  const plan = analyzeForAutoRefactor(state.currentCode, state.language, state.filePath);
  if (!plan) return false;
  const result = applyAutoRefactor(state.currentCode, plan);
  if (result.transformedCode === state.currentCode) return false;
  const afterHealth = analyzeCode(result.transformedCode, state.language, state.filePath);
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
