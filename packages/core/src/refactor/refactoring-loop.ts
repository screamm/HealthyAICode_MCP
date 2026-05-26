import { analyzeCode } from '../index';
import { applyAutoRefactor, type ApplyResult } from './auto-refactor-applier';
import { analyzeForAutoRefactor, type AutoRefactorResult } from './auto-refactor-analyzer';
import { generateMissingJsDoc, type JsDocResult } from './jsdoc-generator';
import type { Language } from '../types';

export interface RefactoringStep {
  strategy: string;
  targetFunction: string;
  smell: string;
  scoreBefore: number;
  scoreAfter: number;
  changes: string[];
}

export interface RefactoringLoopResult {
  finalCode: string;
  originalScore: number;
  finalScore: number;
  steps: RefactoringStep[];
  loopComplete: boolean;
}

/**
 * Runs the full refactoring loop on a code string:
 *   1. Analyze code for smells
 *   2. If score >= aiReadyThreshold (9.5), return complete
 *   3. Otherwise, get auto-refactor plan and apply it
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
  let currentCode = code;
  let health = analyzeCode(currentCode, language, filePath);
  const originalScore = health.score;
  const steps: RefactoringStep[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    health = analyzeCode(currentCode, language, filePath);

    if (health.score >= aiReadyThreshold) {
      return {
        finalCode: currentCode,
        originalScore,
        finalScore: health.score,
        steps,
        loopComplete: true,
      };
    }

    const plan = analyzeForAutoRefactor(currentCode, language, filePath);
    if (plan) {
      const result = applyAutoRefactor(currentCode, plan);
      if (result.transformedCode !== currentCode) {
        const afterHealth = analyzeCode(result.transformedCode, language, filePath);
        steps.push({
          strategy: result.strategy,
          targetFunction: plan.targetFunction,
          smell: plan.smell.type,
          scoreBefore: health.score,
          scoreAfter: afterHealth.score,
          changes: result.changes,
        });
        currentCode = result.transformedCode;
        continue;
      }
    }

    const jsDocResult = generateMissingJsDoc(currentCode, health);
    if (jsDocResult.code !== currentCode) {
      const afterHealth = analyzeCode(jsDocResult.code, language, filePath);
      steps.push({
        strategy: 'jsdoc_generation',
        targetFunction: '',
        smell: 'LowDocCoverage',
        scoreBefore: health.score,
        scoreAfter: afterHealth.score,
        changes: jsDocResult.changes,
      });
      currentCode = jsDocResult.code;
      continue;
    }

    break;
  }

  health = analyzeCode(currentCode, language, filePath);
  return {
    finalCode: currentCode,
    originalScore,
    finalScore: health.score,
    steps,
    loopComplete: health.score >= aiReadyThreshold,
  };
}
