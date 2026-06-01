import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import { detectBrainMethods } from './temporal/brain-method';
import { detectSlopsquattingOffline } from './analyzers/slopsquatting';
import { analyzeMethodCoupling, methodCouplingToSmells } from './temporal/method-coupling';
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
/** Debt goals tracking system for technical debt supervision (Sprint 34). */
export {
  loadGoals,
  saveGoals,
  getGoal,
  setGoal,
  removeGoal,
  listGoals,
  updateGoalStatus,
} from './debt-goals';
/** Types for the debt goals tracking system (Sprint 34). */
export type {
  GoalType,
  GoalStatus,
  DebtGoal,
  DebtGoalsStore,
} from './debt-goals';

/** Static security analysis: secret detection, injection risks, SARIF output (Sprint 28). */
export {
  auditSecurity,
  detectSecrets,
  detectInjectionRisks,
  aggregateFindings,
  formatAsSarif,
  estimateScanCost,
  assessFinding,
  buildAssessmentPrompt,
  parseAssessmentResponse,
  shannonEntropy,
  SECRET_KEYWORDS,
  HIGH_ENTROPY_THRESHOLD,
  MIN_SECRET_LENGTH,
  detectDisagreement,
} from './security/index';
export type {
  SecurityFindingType,
  StaticFinding,
  LlmAssessment,
  AggregatedFinding,
  SecurityAuditResult,
  SarifReport,
  SarifRun,
  SarifResult,
  SarifLocation,
  Severity,
  Exploitability,
  ScanDepth,
  SecurityAuditFileResult,
  AuditFileInput,
  InjectionFinding,
  CostEstimate,
} from './security/index';

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

/** Sprint 32: Automated smell analysis — returns structured improvement instructions for the worst smell. */
export { analyzeForAutoRefactor } from './refactor/auto-refactor-analyzer';
export type { AutoRefactorResult, RefactoringStrategy } from './refactor/index';
/** Sprint 33: Automated code transformer — mechanically applies smell fixes based on analysis. */
export { applyAutoRefactor } from './refactor/auto-refactor-applier';
export type { ApplyResult } from './refactor/auto-refactor-applier';
/** Sprint 34: JSDoc generator — adds JSDoc to exported functions missing documentation. */
export { generateMissingJsDoc } from './refactor/jsdoc-generator';
export type { JsDocResult } from './refactor/jsdoc-generator';
/** Sprint 34: Iterative improvement loop — applies smell fixes and JSDoc until the health target is reached. */
export { runRefactoringLoop } from './refactor/refactoring-loop';
export type { RefactoringStep, RefactoringLoopResult } from './refactor/refactoring-loop';
/** Detects the source language from a file path extension (Sprint 32: exposed for MCP tool use). */
export { detectLanguage } from './language-detect';

/** Sprint 57: Slopsquatting / supply-chain biomarker — typosquat + LLM-hallucination-corpus detection. */
export {
  detectSlopsquatting,
  detectSlopsquattingOffline,
  resetSlopsquattingCaches,
} from './analyzers/slopsquatting';
export type { SlopsquattingOptions, PackageMeta } from './analyzers/slopsquatting';

/** Sprint 51–60 Phase 2a: additive detector orchestrator wired into analyzeByLanguage(). */
export { runAdditiveDetectors } from './analyzers/additive-detectors';
/** Sprint 57: SpecDetect4AI LLM-integration smells (UMM/NMVP/NSM/NSO/TNES). */
export { analyzeLlmIntegration } from './analyzers/llm-integration';
export type { LlmLanguage } from './analyzers/llm-integration';
/** Sprint 57: HallucinatedPackageImport detection against cached registry snapshots. */
export { detectHallucinatedImports, resetSnapshotCaches } from './analyzers/hallucinated-import';
/** Sprint 57: ComplexityMassConcentration (Structural Erosion Index). */
export { detectComplexityMassConcentration } from './analyzers/complexity-mass';
/** Sprint 57: AiAttributedSATD (GenAI-induced self-admitted technical debt). */
export { detectAiAttributedSATD, detectAiAttributedSATDFromText } from './smells/ai-attributed-satd';
/** Sprint 58: OWASP 2025 security sinks (UnsafeDeserialization / SsrfRisk / CryptographicMisuseRisk). */
export { detectSecuritySinks } from './analyzers/security-sink-detector';
/** Sprint 58: ExceptionHandlingAntiPattern detection (EmptyCatch / CatchGeneric / DestructiveWrapping / UnreachableHandler). */
export { detectExceptionAntiPatterns } from './analyzers/exception-antipatterns';
/** Sprint 58: AsyncAntiPattern detection — DrAsync P1/P3/P7/P8 (TS/JS). */
export { detectAsyncAntiPatterns } from './analyzers/async-antipatterns';
/** Sprint 58: in-file DuplicateCode detection (type 1/2 clones). */
export { detectDuplicateCode } from './analyzers/duplicate-code';
export type { CloneGroup } from './analyzers/duplicate-code';

/** Sprint 51–60: deterministic delta-gate contract types (@healthy-ai-code/gate). */
export type {
  GateVerdict,
  GateReasonCode,
  GateDecision,
  GateConfig,
  GateSelfTestResult,
} from './contracts/gate-types';

/** Sprint 51–60: attestation (code_health_attest) contract types — EU AI Act Art. 12 controls evidence. */
export type {
  AttestationRecord,
  AttestationSignature,
  AttestationExportFormat,
} from './contracts/attestation-types';

/** Sprint 60: biomarker plugin API — register/run external biomarker detectors. */
export {
  registerPlugin,
  unregisterPlugin,
  getActivePlugins,
  clearPluginRegistry,
  runPlugins,
  resolvePluginSmellWeight,
} from './plugins/biomarker-plugin';
export type { BiomarkerPlugin, PluginMetadata } from './plugins/biomarker-plugin';
/** Sprint 60: plugin conformance harness and manifest schema. */
export {
  validatePlugin,
  assertPluginConformance,
} from './plugins/plugin-conformance';
export type {
  ConformanceResult,
  PluginFixture,
  ValidatePluginOptions,
} from './plugins/plugin-conformance';
export { PLUGIN_MANIFEST_SCHEMA, minimalValidManifest } from './plugins/plugin-schema';
export type { PluginManifest } from './plugins/plugin-schema';

/** Sprint 56: per-dimension health subscores (security/complexity/maintainability/duplication). DimensionSubscores type is re-exported via `export * from './types'`. */
export { computeSubscores } from './scoring/subscores';

/** Sprint 32: Validation pipeline — Pearson/Spearman/AUROC correlation against defect datasets. */
export {
  runValidation,
  buildRecordsFromDirectory,
  createSyntheticBenchmark,
  loadDefects4JFromJson,
  pearsonCorrelation,
  spearmanCorrelation,
  computeAUROC,
  bootstrapAUROC,
  mannWhitneyU,
  DEFECTS4J_INFO,
  generateExtractionInstructions,
  generateBugsJSInstructions,
} from './validation/index';
export type { BugRecord, ValidationReport, Defects4JEntry, Defects4JInfo } from './validation/index';

/** Reads a file from disk, detects language, and returns a HealthResult. Throws if the file cannot be read. */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/**
 * Blocker 1: enriched file analysis that incorporates git-based MethodTemporalCoupling smells.
 *
 * Runs static analysis (analyzeFile) and git-history analysis (analyzeMethodCoupling) in
 * parallel, then merges the resulting smells and recalculates the score so that
 * MethodTemporalCoupling weight (0.3) is reflected in the final HealthResult.
 *
 * @param filePath  Absolute or repo-relative path to the source file.
 * @param repoPath  Root of the git repository (passed to simpleGit).
 */
export async function analyzeFileWithHistory(filePath: string, repoPath: string): Promise<HealthResult> {
  const [baseResult, couplingResult] = await Promise.all([
    analyzeFile(filePath),
    analyzeMethodCoupling(repoPath, filePath),
  ]);

  const couplingSmells = methodCouplingToSmells(couplingResult);
  if (couplingSmells.length === 0) return baseResult;

  const enrichedSmells = [...baseResult.smells, ...couplingSmells];
  const newScore = calculateScore(enrichedSmells, baseResult.language);
  return {
    ...baseResult,
    smells: enrichedSmells,
    score: newScore,
    category: categorize(newScore),
  };
}

/** Analyzes a code string directly. filePath is used only as metadata in the result (defaults to '<inline>'). */
export function analyzeCode(code: string, language: Language, filePath = '<inline>'): HealthResult {
  if (language === 'unsupported') return buildUnsupportedResult(code, filePath);
  if (code.trim() === '') return buildEmptyResult({ filePath, language });
  const totalLines = code.split('\n').length;
  const parsed = tryAnalyze(code, { language, filePath });
  if (parsed === null) return buildUnparseableResult({ filePath, language }, totalLines);
  const smells = [...parsed.smells, ...detectSmells(parsed.functions, parsed.metrics, language), ...detectBrainMethods(parsed.functions, parsed.metrics.cyclomaticComplexity)];
  // Supply-chain biomarker (Sprint 57): offline-only (zero network) typosquat + LLM-hallucination
  // corpus detection. Self-guards to TS/JS/Python; returns [] for all other languages.
  smells.push(...detectSlopsquattingOffline(code, language, filePath));
  appendLargeFileSmellIfNeeded(smells, totalLines);
  const score = calculateScore(smells, language);
  return { filePath, language, score, category: categorize(score), smells, metrics: parsed.metrics, functions: parsed.functions };
}

/** Attempts to parse and analyze the code, returning null if the analyzer throws. */
function tryAnalyze(code: string, ctx: FileContext): ReturnType<typeof analyzeByLanguage> | null {
  try { return analyzeByLanguage(code, ctx.language, ctx.filePath); } catch { return null; }
}
