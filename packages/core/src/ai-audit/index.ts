// packages/core/src/ai-audit/index.ts

export type {
  AiSpecificSmellType,
  AiDetectionResult,
  AiSignal,
  GitSignal,
  AiSpecificSmell,
  AiAuditResult,
  BenchmarkEntry,
  BenchmarkHistory,
  ModelStats,
} from './types';

export {
  detectAiHeuristics,
  commentStyleScore,
  namingPatternScore,
  boilerplateScore,
  structureScore,
} from './heuristic-detector';
export type { AiHeuristicResult } from './heuristic-detector';

export { analyzeGitSignal } from './git-detector';

export {
  detectAbstractionLeakage,
  detectHardcodedAssumptions,
  detectMissingEdgeCases,
  detectStyleInconsistency,
} from './enhanced-checks';

export { compareToBaseline, aggregateModelStats } from './benchmarker';

export {
  loadHistory,
  appendEntry,
  getModelStats,
  DEFAULT_HISTORY_PATH,
} from './benchmark-store';

export {
  mean,
  stddev,
  topN,
  isOutlier,
  computeBaseline,
  flagOutliers,
} from './statistics';

export type { Baseline } from './statistics';

export { GITHUB_ACTIONS_WORKFLOW_TEMPLATE } from './ci-workflow-template';
