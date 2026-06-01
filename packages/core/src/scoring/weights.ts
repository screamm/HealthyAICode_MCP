import type { SmellType } from '../types';

/** Base weight per occurrence for each finding type; used as `weight × sqrt(count)` in scoring. */
export const SMELL_WEIGHTS: Record<SmellType, number> = {
  ComplexMethod: 1.5,
  DeepNesting: 1.2,
  BumpyRoad: 0.8,
  LargeMethod: 0.6,
  ComplexConditional: 0.5,
  LongParameterList: 0.4,
  LargeFile: 0.3,
  CognitiveComplexity: 0.8,
  TypeSafetyEscape: 0.7,
  MagicNumber: 0.4,
  LowDocCoverage: 0.3,
  BrainMethod: 1.2,
  TestProximity: 0.5,
  MessageChain: 0.5,
  DataClumps: 0.5,
  SATD: 0.6, // arXiv 2601.06266: LLM-generated code accumulates MORE SATD than human-written code — weight reflects elevated risk in AI-assisted codebases
  GodClass: 1.5,
  FeatureEnvy: 0.7,
  LowMaintainability: 0.3, // Reduced from 0.4 — single instance now scores 9.7 instead of 9.6, removing the derived-smell ceiling
  CodeChurn: 0.6,
  DeveloperCongestion: 0.7,
  KnowledgeLoss: 1.0,
  PrimitiveObsession: 0.5,
  MethodTemporalCoupling: 0.3, // Advisory weight — empirically defensible per literature (D'Ambros 2009, Kirbas 2017, arXiv 2504.18511). See docs/calibration/method-coupling-validation.md
  // Sprint 23: organisational metrics; advisory weights
  // arXiv 2603.22106 (Triple Debt Model, Mar 2026): in AI-assisted development, "cognitive debt"
  // (erosion of shared understanding) and "intent debt" (missing rationale for decisions) may
  // surpass technical debt in importance. DocumentationDebt and IntentClarity are our proxies
  // for intent debt — weights reflect their growing significance in AI-heavy codebases.
  DocumentationDebt: 0.5,
  IntentClarity: 0.4,
  // Sprint 22: architecture debt; advisory weight
  ArchitectureDebt: 0.6,
  // Sprint 28: security smells; advisory weights
  SqlInjectionRisk: 1.5,
  XssRisk: 1.5,
  CommandInjectionRisk: 1.5,
  HardcodedCredential: 2.0,
  HardcodedApiKey: 2.0,
  UnsafeDeserialization: 1.2,
  PathTraversalRisk: 1.2,
  DependencyVulnerability: 1.0,
  // Sprint 29: AI-specific smells; advisory weights
  AbstractionLeakage: 0.6,
  HardcodedAssumption: 0.5,
  MissingEdgeCase: 0.5,
  StyleInconsistency: 0.3,
  // Sprint 57: AI-native supply-chain biomarkers.
  // SlopsquattingRisk / HallucinatedPackageImport at 1.5 — parity with SqlInjectionRisk
  // (supply-chain attack surface; arXiv:2406.10279). LLM-integration smells adapted from
  // SpecDetect4AI (arXiv:2512.18020). ComplexityMassConcentration 1.2 — structural
  // consolidation smell at BrainMethod/DeepNesting level (SlopCodeBench arXiv:2603.24755).
  SlopsquattingRisk: 1.5,
  HallucinatedPackageImport: 1.5,
  AiAttributedSATD: 0.8,
  ComplexityMassConcentration: 1.2,
  LlmUnboundedCall: 1.0,
  LlmUnpinnedModel: 1.0,
  LlmNoSystemMessage: 1.0,
  LlmNoStructuredOutput: 1.0,
  LlmUnsetTemperature: 0.8,
  // Sprint 58: OWASP 2025 security biomarkers. SsrfRisk 1.3 (heuristic without full taint
  // analysis → conservative). CryptographicMisuseRisk 1.0 (known MD5-as-cache-key false
  // positives). ExceptionHandlingAntiPattern 0.8 / AsyncAntiPattern 0.7 (reliability, not
  // direct security). DuplicateCode 1.0 (clone-frequency 8.3%→12.3% in AI-assisted code).
  SsrfRisk: 1.3,
  CryptographicMisuseRisk: 1.0,
  ExceptionHandlingAntiPattern: 0.8,
  AsyncAntiPattern: 0.7,
  DuplicateCode: 1.0,
  // Sprint 56: anti-gaming structural smells (penalise mechanical code-splitting).
  SplitResidue: 0.5,
  FragmentedCode: 0.3,
};

/** Minimum score at which a file is considered safe for AI-assisted modification. */
export const AI_READY_THRESHOLD = 9.5;
/** Minimum score for the green (healthy) category. */
export const HEALTHY_THRESHOLD = 9.0;
/** Minimum score for the yellow (problematic) category; below this is red. */
export const PROBLEMATIC_THRESHOLD = 6.0;
