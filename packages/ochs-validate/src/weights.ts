/**
 * OCHS v0.1 biomarker weights — canonical source is the OCHS specification:
 * https://github.com/screamm/Healthy-AI-Code-MCP/blob/master/docs/ochs/OCHS-v0.1.md
 *
 * These values are intentionally duplicated from @healthy-ai-code/core so that this
 * package has NO runtime dependency on the core analysis engine. A conformant
 * validator must embed the published weights, not import them.
 */

/** All 55 OCHS v0.1 biomarker identifiers with their scoring weights. */
export const OCHS_WEIGHTS: Record<string, number> = {
  // Category A — Complexity Smells
  BrainMethod: 1.2,
  BumpyRoad: 0.8,
  CognitiveComplexity: 0.8,
  ComplexMethod: 1.5,
  DeepNesting: 1.2,
  LargeMethod: 0.6,

  // Category B — Design Smells
  ComplexConditional: 0.5,
  DataClumps: 0.5,
  FeatureEnvy: 0.7,
  FragmentedCode: 0.3,
  GodClass: 1.5,
  LongParameterList: 0.4,
  MessageChain: 0.5,
  PrimitiveObsession: 0.5,
  SplitResidue: 0.5,
  TypeSafetyEscape: 0.7,

  // Category C — Maintainability & Documentation
  DocumentationDebt: 0.5,
  IntentClarity: 0.4,
  LargeFile: 0.3,
  LowDocCoverage: 0.3,
  LowMaintainability: 0.3,
  MagicNumber: 0.4,
  TestProximity: 0.5,

  // Category D — Organisational & Temporal
  ArchitectureDebt: 0.6,
  CodeChurn: 0.6,
  DeveloperCongestion: 0.7,
  KnowledgeLoss: 1.0,
  MethodTemporalCoupling: 0.3,
  SATD: 0.6,
  StyleInconsistency: 0.3,

  // Category E — Security Smells
  CommandInjectionRisk: 1.5,
  CryptographicMisuseRisk: 1.0,
  DependencyVulnerability: 1.0,
  HardcodedApiKey: 2.0,
  HardcodedCredential: 2.0,
  PathTraversalRisk: 1.2,
  SlopsquattingRisk: 1.5,
  SqlInjectionRisk: 1.5,
  SsrfRisk: 1.3,
  UnsafeDeserialization: 1.2,
  XssRisk: 1.5,

  // Category F — AI-Native Smells
  AbstractionLeakage: 0.6,
  AiAttributedSATD: 0.8,
  AsyncAntiPattern: 0.7,
  ComplexityMassConcentration: 1.2,
  DuplicateCode: 1.0,
  ExceptionHandlingAntiPattern: 0.8,
  HallucinatedPackageImport: 1.5,
  HardcodedAssumption: 0.5,
  LlmNoStructuredOutput: 1.0,
  LlmNoSystemMessage: 1.0,
  LlmUnboundedCall: 1.0,
  LlmUnpinnedModel: 1.0,
  LlmUnsetTemperature: 0.8,
  MissingEdgeCase: 0.5,
};

/** OCHS v0.1 scoring constants. */
export const OCHS_FLOOR = 1.0;
export const AI_READY_THRESHOLD = 9.5;
export const AI_READY_THRESHOLD_WITH_AI_SATD = 9.7;
export const HEALTHY_THRESHOLD = 9.0;
export const PROBLEMATIC_THRESHOLD = 6.0;

/** All 55 canonical biomarker identifiers for OCHS v0.1. */
export const ALL_SMELL_TYPES = new Set(Object.keys(OCHS_WEIGHTS));
