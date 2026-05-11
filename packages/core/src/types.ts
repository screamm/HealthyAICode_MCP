export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'unsupported';

export type HealthCategory = 'green' | 'yellow' | 'red';

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
  | 'KnowledgeLoss';

export interface Smell {
  type: SmellType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  functionName?: string;
  line: number;
  description: string;
  suggestion: string;
}

export interface MetricBreakdown {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  avgParameterCount: number;
  maxParameterCount: number;
  totalLines: number;
  duplicationScore: number;
  maintainabilityIndex?: number;
}

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

export interface HealthResult {
  filePath: string;
  language: Language;
  score: number;
  category: HealthCategory;
  smells: Smell[];
  metrics: MetricBreakdown;
  functions: FunctionResult[];
}

export interface ChangesetResult {
  filesAnalyzed: number;
  regressions: FileRegression[];
  improvements: FileImprovement[];
  newUnhealthyFiles: HealthResult[];
  overallSafe: boolean;
}

export interface FileRegression {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  newSmells: Smell[];
}

export interface FileImprovement {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  fixedSmells: Smell[];
}

export type NextActionType = 'refactor' | 'commit_safe' | 'review_pr' | 'none';

export interface NextAction {
  action: NextActionType;
  instruction: string;
  priority: Smell | null;
  toolToCallAfter: string | null;
}

export interface ToolResponse {
  score: number;
  category: HealthCategory;
  loopComplete: boolean;
  issues: Smell[];
  summary: string;
  nextAction: NextAction;
}
