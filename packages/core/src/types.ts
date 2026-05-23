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
  // Tier B — text-based metric extraction (Sprint 25)
  | 'bash'
  | 'lua'
  | 'elixir'
  | 'haskell'
  | 'r'
  | 'clojure'
  // Tier C — structural complexity only (Sprint 25)
  | 'yaml'
  | 'json'
  | 'dockerfile'
  | 'hcl'
  | 'makefile'
  | 'sql'
  | 'html'
  | 'css'
  | 'markdown'
  | 'toml'
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
  | 'MethodTemporalCoupling'
  | 'DocumentationDebt'
  | 'IntentClarity'
  | 'ArchitectureDebt';

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


// -- Sprint 22: Architecture Debt types ----------------------------------------

/** Profile of a single module's architectural debt metrics. */
export interface ModuleDebtProfile {
  filePath: string;
  fanIn: number;           // number of files importing this module
  fanOut: number;          // number of files this module imports
  instability: number;     // fanOut / (fanIn + fanOut), [0..1]
  propagationCost: number; // fraction of codebase transitively dependent on this module, [0..1]
  inCycle: boolean;        // participates in an SCC with size > 1
  changeFrequency: number; // commits in the last 12 months
  costOfChange: number;    // composite score [0..1]
  costOfChangeSeverity: 'high' | 'medium' | 'low';
}

/** A group of files forming a dependency cycle (SCC with size > 1). */
export interface DependencyCycle {
  members: string[]; // file paths in the cycle
  size: number;
  severity: 'high' | 'medium'; // high if > 5 nodes
}

/** Full result of an architecture debt analysis for a project directory. */
export interface ArchitectureDebtResult {
  directory: string;
  depth: 'file' | 'module';
  totalModules: number;
  modules: ModuleDebtProfile[];          // sorted by costOfChange descending
  cycles: DependencyCycle[];             // sorted by size descending
  topCostlyModules: ModuleDebtProfile[]; // top-10
  summary: {
    avgFanIn: number;
    avgFanOut: number;
    avgPropagationCost: number;
    avgCostOfChange: number;
    cycleCount: number;
    modulesInCycles: number;
    highSeverityModules: number;
  };
}

// -- Sprint 27: Behavioural Analytics types ------------------------------------

/** A file identified as a hotspot: high complexity combined with high churn rate. */
export interface HotspotResult {
  filePath: string;
  score: number;            // [0, 1] -- normalized hotspot score
  churn: number;            // total additions + deletions in the period
  commitCount: number;      // number of commits touching the file
  complexity: number;       // sum cyclomatic complexity at HEAD
  classification: 'critical' | 'warning' | 'healthy';
}

/** A pair of files that frequently change together within a rolling time window. */
export interface FileCouplingPair {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  combinedTouches: number;
  couplingStrength: number;          // [0..1]
  temporalStability: 'tightening' | 'stable' | 'loosening';
  severity: 'low' | 'medium' | 'high';
  windowDays: number;
}

/** Result of file-level change coupling analysis over a rolling window. */
export interface FileCouplingResult {
  repoPath: string;
  windowDays: number;
  threshold: number;
  commitsAnalyzed: number;
  pairs: FileCouplingPair[];
}

/** A single weighted dimension in the Architectural Decay Index. */
export interface DecayDimension {
  score: number;    // 0-10
  weight: number;   // coefficient in ADI formula
  label: string;    // human-readable name
  evidence: string; // explanatory text
}

/** Architectural Decay Index result for a module or file. */
export interface ArchitecturalDecayResult {
  module: string;   // directory or file path
  adi: number;      // Architectural Decay Index, 0-10
  classification: 'healthy' | 'warning' | 'high_risk' | 'critical';
  dimensions: {
    complexityTrend: DecayDimension;
    churnRate: DecayDimension;
    couplingDensity: DecayDimension;
    docCoverage: DecayDimension;
    testProximity: DecayDimension;
  };
}

// -- Sprint 23: Organisational metrics ----------------------------------------

/** Shannon entropy-based bus factor for a single file. */
export interface BusFactorResult {
  filePath: string;
  /** Number of unique contributors with at least one commit. */
  uniqueContributors: number;
  /** Shannon entropy normalised against log2(uniqueContributors). 0 = one person owns all, 1 = evenly spread. */
  normalizedEntropy: number;
  /** Bus factor estimate: minimum number of people whose departure causes >50% knowledge loss. */
  busFactorEstimate: number;
  /** True when normalizedEntropy < 0.3 (high concentration) or busFactorEstimate = 1. */
  isAtRisk: boolean;
  /** Contributors with commit share, sorted descending. */
  contributors: Array<{ email: string; commitShare: number }>;
  smell: Smell | null;
}

/** Developer Congestion over a 14-day sprint window. */
export interface SprintCongestionResult {
  filePath: string;
  /** Number of active contributors (at least one commit in the last 14 days). */
  activeContributors: number;
  /** Email addresses of active contributors. */
  activeEmails: string[];
  /** True when activeContributors >= 3 (conflict risk). */
  isCongestedSprint: boolean;
  smell: Smell | null;
}

/** Knowledge Loss Index -- fraction of code authored by now-inactive contributors. */
export interface KnowledgeLossIndexResult {
  filePath: string;
  /** Fraction of lines (via git blame) authored by inactive contributors (no commit in 6 months). */
  knowledgeLossRatio: number;
  /** Total number of lines analysed via blame. */
  totalLines: number;
  /** Lines authored by inactive contributors. */
  inactiveLines: number;
  /** True when knowledgeLossRatio > 0.4 (>40% of code is orphaned). */
  isOrphaned: boolean;
  smell: Smell | null;
}

/** Documentation Debt Index -- correlation between cognitive complexity and lack of documentation. */
export interface DocDebtResult {
  filePath: string;
  /** Cognitive complexity normalised to [0, 1] (divided by max-threshold). */
  normalizedComplexity: number;
  /** Documentation coverage in [0, 1] (fraction of functions with docstring/JSDoc). */
  docCoverage: number;
  /** DDI = normalizedComplexity * (1 - docCoverage). High DDI = complex + undocumented. */
  docDebtIndex: number;
  /** Severity: high >= 0.60, medium >= 0.30, low > 0. */
  severity: 'high' | 'medium' | 'low' | 'none';
  smell: Smell | null;
}

/** Intent Clarity Score -- how clear the code intent is. */
export interface IntentClarityResult {
  filePath: string;
  /** Fraction of functions with a docstring or JSDoc comment. */
  docRatio: number;
  /** Fraction of typed parameters and return types (for TypeScript/Python). */
  typeAnnotationRatio: number;
  /** Name-quality index: 0 = no short/generic names, 1 = all names are descriptive. */
  nameQualityScore: number;
  /** Composite Intent Clarity Score in [0, 1]. */
  intentClarityScore: number;
  /** Functions with problematic names (shorter than 3 chars or generic like tmp/data/x). */
  poorlyNamedFunctions: string[];
  smell: Smell | null;
}

// ─── Behavioral Analytics Types (Sprint 27) ───────────────────────────────────

/** A file identified as a hotspot: high complexity combined with high churn rate. */
export interface HotspotResult {
  filePath: string;
  /** Normalized hotspot score in [0, 1]. */
  score: number;
  /** Total additions + deletions in the period. */
  churn: number;
  /** Number of commits touching the file. */
  commitCount: number;
  /** Sum cyclomatic complexity at HEAD. */
  complexity: number;
  classification: 'critical' | 'warning' | 'healthy';
}

/** A pair of files that frequently change together within a rolling time window. */
export interface FileCouplingPair {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  combinedTouches: number;
  /** Coupling strength in [0..1]. */
  couplingStrength: number;
  temporalStability: 'tightening' | 'stable' | 'loosening';
  severity: 'low' | 'medium' | 'high';
  windowDays: number;
}

/** Result of file-level change coupling analysis over a rolling window. */
export interface FileCouplingResult {
  repoPath: string;
  windowDays: number;
  threshold: number;
  commitsAnalyzed: number;
  pairs: FileCouplingPair[];
}

/** A single weighted dimension in the Architectural Decay Index. */
export interface DecayDimension {
  /** Dimension score in [0, 10]. */
  score: number;
  /** Coefficient in the ADI formula. */
  weight: number;
  /** Human-readable name. */
  label: string;
  /** Explanatory text for the dimension score. */
  evidence: string;
}

/** Architectural Decay Index result for a module or file. */
export interface ArchitecturalDecayResult {
  /** Directory or file path. */
  module: string;
  /** Architectural Decay Index in [0, 10] where 0 = healthy, 10 = critical. */
  adi: number;
  classification: 'healthy' | 'warning' | 'high_risk' | 'critical';
  dimensions: {
    complexityTrend: DecayDimension;
    churnRate: DecayDimension;
    couplingDensity: DecayDimension;
    docCoverage: DecayDimension;
    testProximity: DecayDimension;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
