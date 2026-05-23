import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import { detectBrainMethods } from './temporal/brain-method';
import type { HealthResult, Language } from './types';
import { buildEmptyResult, buildUnparseableResult, buildUnsupportedResult, appendLargeFileSmellIfNeeded, type FileContext } from './core-helpers';

/** Re-exports all public types for use by consumers of this package. */
export * from './types';
/** Analyzes code health changes in a git diff. */
export { analyzeChangeset } from './diff';
/** Measures code churn rate relative to file size. */
export { analyzeCodeChurn } from './temporal/code-churn';
/** Detects files that change together frequently. */
export { analyzeTemporalCoupling } from './temporal/temporal-coupling';
/** Detects files modified by too many developers. */
export { analyzeDeveloperCongestion } from './temporal/developer-congestion';
/** Identifies files with single-owner knowledge risk. */
export { analyzeKnowledgeLoss } from './temporal/knowledge-loss';
/** Analyzes overall project code health. */
export { analyzeProject } from './project';
/** Analyzes method-level temporal coupling (X-Ray-light) for a single file. */
export { analyzeMethodCoupling, methodCouplingToSmells } from './temporal/method-coupling';
/** Sprint 22: Architecture debt analysis � FAN-IN/OUT, propagation cost, dependency cycles. */
export { analyzeArchitectureDebt, computeFanInFanOut, computePropagationCost } from './analyzers/architecture-debt';
/** Sprint 23: Shannon entropy-based bus factor analysis per file. */
export { analyzeBusFactor, computeNormalizedEntropy, computeBusFactorEstimate } from './temporal/bus-factor';
/** Sprint 23: 14-day sprint-window developer congestion analysis. */
export { analyzeSprintCongestion } from './temporal/sprint-congestion';
/** Sprint 23: Knowledge Loss Index via git blame (inactive contributor ratio). */
export { analyzeKnowledgeLossIndex, parseBlameOutput } from './temporal/knowledge-loss-index';
/** Sprint 23: Documentation Debt Index (complexity * (1 - docCoverage)). */
export { analyzeDocDebt, computeDocCoverage } from './analyzers/doc-debt';
/** Sprint 23: Intent Clarity Score (doc + type annotations + name quality). */
export { analyzeIntentClarity, computeTypeAnnotationRatio, computeNameQualityScore } from './analyzers/intent-clarity';
/** Identifies hotspots: files with high complexity × high churn rate (Sprint 27). */
export { analyzeHotspots } from './temporal/behavioral-analytics';
/** Analyzes file-level change coupling with rolling time windows (Sprint 27). */
export { analyzeFileCoupling } from './temporal/file-coupling';
/** Analyzes complexity trends over git history via linear regression sampling (Sprint 27). */
export { analyzeComplexityTrend, linearRegressionSlope, sampleComplexityPoints } from './temporal/complexity-trend';
/** Computes the Architectural Decay Index (ADI 0-10) combining 5 weighted dimensions (Sprint 27). */
export { computeArchitecturalDecayIndex } from './temporal/decay-index';
/** Reads project source files recursively from disk (Sprint 22). */
export { readProjectFiles } from './analyzers/project-file-reader';
/** Builds a directed dependency graph from source file import statements (Sprint 22). */
export { buildDependencyGraph, extractImports } from './analyzers/dependency-graph';
/** Iterative Tarjan's SCC algorithm for dependency cycle detection (Sprint 22). */
export { findStronglyConnectedComponents } from './analyzers/scc';
/** Returns commit count per file from git history (Sprint 22). */
export { getChangeFrequency } from './analyzers/change-frequency';
/** Global runtime configuration (opt-in flags such as useCalibratedThresholds). */
export { setConfig, getConfig } from './config';
/** Calibration infrastructure: load Defects4J-calibrated thresholds from calibration/*.json. */
export { loadCalibration, getThresholds, getWeights, DEFAULT_THRESHOLDS } from './scoring/calibration-loader';
/** AI code detection, AI-specific smell detection, and model benchmarking (Sprint 29). */
export {
  detectAiHeuristics,
  commentStyleScore,
  namingPatternScore,
  boilerplateScore,
  structureScore,
  analyzeGitSignal,
  detectAbstractionLeakage,
  detectHardcodedAssumptions,
  detectMissingEdgeCases,
  detectStyleInconsistency,
  compareToBaseline,
  aggregateModelStats,
  loadHistory,
  appendEntry,
  getModelStats,
  DEFAULT_HISTORY_PATH,
  mean,
  stddev,
  topN,
  isOutlier,
  computeBaseline,
  flagOutliers,
  GITHUB_ACTIONS_WORKFLOW_TEMPLATE,
} from './ai-audit/index';
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
  AiHeuristicResult,
  Baseline,
} from './ai-audit/index';

/** AI-Readiness Score (Sprint 24): composite metric for how well a codebase suits AI-assisted development. */
export { analyzeNamingClarity } from './ai-readiness/naming-clarity';
export type { NamingClarityResult } from './ai-readiness/naming-clarity';
export { analyzeTypeCoverage } from './ai-readiness/type-coverage';
export type { TypeCoverageResult } from './ai-readiness/type-coverage';
export { analyzeContextWindowFit } from './ai-readiness/context-window-fit';
export type { ContextWindowFitInput, ContextWindowFitResult } from './ai-readiness/context-window-fit';
export { analyzeAIReadiness } from './ai-readiness/ai-readiness-analyzer';
export type { AIReadinessResult, AIReadinessFile, AIBlocker } from './ai-readiness/ai-readiness-analyzer';

/** Reads a file from disk, detects language, and returns a HealthResult. Throws if the file cannot be read. */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/** Analyzes a code string directly. filePath is used only as metadata in the result (defaults to '<inline>'). */
export function analyzeCode(code: string, language: Language, filePath = '<inline>'): HealthResult {
  if (language === 'unsupported') return buildUnsupportedResult(code, filePath);
  if (code.trim() === '') return buildEmptyResult({ filePath, language });
  const totalLines = code.split('\n').length;
  const parsed = tryAnalyze(code, { language, filePath });
  if (parsed === null) return buildUnparseableResult({ filePath, language }, totalLines);
  const smells = [...parsed.smells, ...detectSmells(parsed.functions, parsed.metrics, language), ...detectBrainMethods(parsed.functions, parsed.metrics.cyclomaticComplexity)];
  appendLargeFileSmellIfNeeded(smells, totalLines);
  const score = calculateScore(smells, language);
  return { filePath, language, score, category: categorize(score), smells, metrics: parsed.metrics, functions: parsed.functions };
}

/** Attempts to parse and analyze the code, returning null if the analyzer throws. */
function tryAnalyze(code: string, ctx: FileContext): ReturnType<typeof analyzeByLanguage> | null {
  try { return analyzeByLanguage(code, ctx.language, ctx.filePath); } catch { return null; }
}
