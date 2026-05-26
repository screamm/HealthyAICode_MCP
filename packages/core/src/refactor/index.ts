export { analyzeForAutoRefactor } from './auto-refactor-analyzer';
export type { AutoRefactorResult } from './auto-refactor-analyzer';
export type { RefactoringStrategy } from './smell-instructions';
export { applyAutoRefactor } from './auto-refactor-applier';
export type { ApplyResult } from './auto-refactor-applier';
export { generateMissingJsDoc } from './jsdoc-generator';
export type { JsDocResult } from './jsdoc-generator';
export { runRefactoringLoop } from './refactoring-loop';
export type { RefactoringStep, RefactoringLoopResult } from './refactoring-loop';
