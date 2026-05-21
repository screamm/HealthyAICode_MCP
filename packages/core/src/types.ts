/** Supported source code languages for analysis. */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'rust'
  | 'go'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'unsupported';

/** Health category derived from the numeric score: green ≥9.0, yellow ≥6.0, red <6.0. */
export type HealthCategory = 'green' | 'yellow' | 'red';

/** Union of all detectable code finding type identifiers. */
export type SmellType =
  | 'ComplexMethod'
  | 'DeepNesting'
  | 'BumpyRoad'
  | 'LargeMethod'
  | 'ComplexConditional'
  | 'LongParameterList'
  | 'LargeFile'
  | 'CognitiveComplexity'
  | 'TypeSafetyEscape'
  | 'MagicNumber'
  | 'LowDocCoverage'
  | 'BrainMethod'
  | 'TestProximity'
  | 'MessageChain'
  | 'DataClumps'
  | 'SATD'
  | 'GodClass'
  | 'FeatureEnvy'
  | 'LowMaintainability'
  | 'CodeChurn'
  | 'DeveloperCongestion'
  | 'KnowledgeLoss'
  | 'PrimitiveObsession'
  | 'MethodTemporalCoupling';

/** A single detected code finding with location, severity, and remediation guidance. */
export interface Smell {
  type: SmellType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  functionName?: string;
  line: number;
  description: string;
  suggestion: string;
  /**
   * Optional line ranges for sub-sections of the finding.
   * Used by BumpyRoad to expose each sequential chunk so AI assistants can extract them precisely.
   * Each entry is 1-indexed and inclusive.
   */
  chunkRanges?: Array<{ startLine: number; endLine: number }>;
  /** The raw metric value that triggered this smell (used for threshold calibration sweeps) */
  metricValue?: number;
}

/** Aggregated code metrics for a file or function. */
export interface MetricBreakdown {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  avgParameterCount: number;
  maxParameterCount: number;
  totalLines: number;
  /**
   * Always 0 — per-file duplication scoring is not yet implemented.
   * Cross-file analysis lives in packages/core/src/project/duplication.ts
   * but is not wired into per-file MetricBreakdown.
   */
  duplicationScore: number;
  maintainabilityIndex?: number;
}

/** Analysis result for a single function within a file. */
export interface FunctionResult {
  name: string;
  line: number;
  length: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  parameterCount: number;
  smells: Smell[];
}

/** Full health analysis result for a single source file. */
export interface HealthResult {
  filePath: string;
  language: Language;
  score: number;
  category: HealthCategory;
  smells: Smell[];
  metrics: MetricBreakdown;
  functions: FunctionResult[];
}

/** Aggregated result of analyzing a git diff across multiple files. */
export interface ChangesetResult {
  filesAnalyzed: number;
  regressions: FileRegression[];
  improvements: FileImprovement[];
  newUnhealthyFiles: HealthResult[];
  overallSafe: boolean;
}

/** Describes a file whose health score declined in the current changeset. */
export interface FileRegression {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  newSmells: Smell[];
}

/** A pair of methods within the same file that frequently change together (X-Ray-light). */
export interface MethodCouplingPair {
  methodA: string;
  methodB: string;
  coChangeCount: number;
  /** max(touches(A), touches(B)) — commits where at least one of them changed */
  combinedTouches: number;
  /** coChangeCount / combinedTouches, in [0..1] */
  couplingStrength: number;
  severity: 'low' | 'medium' | 'high';
}

/** Result of analyzing method-level temporal coupling for a single file. */
export interface MethodCouplingResult {
  filePath: string;
  commitsAnalyzed: number;
  threshold: number;
  /** Pairs sorted by couplingStrength descending; only pairs above threshold included. */
  pairs: MethodCouplingPair[];
}

/** Describes a file whose health score improved in the current changeset. */
export interface FileImprovement {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  fixedSmells: Smell[];
}

/** Discriminator for the next recommended action after a health review. */
export type NextActionType = 'refactor' | 'commit_safe' | 'review_pr' | 'none';

/** The AI assistant's recommended next step after reviewing code health. */
export interface NextAction {
  action: NextActionType;
  instruction: string;
  priority: Smell | null;
  toolToCallAfter: string | null;
}

/** Standard MCP tool response payload returned to the AI assistant. */
export interface ToolResponse {
  score: number;
  category: HealthCategory;
  loopComplete: boolean;
  issues: Smell[];
  summary: string;
  nextAction: NextAction;
}
