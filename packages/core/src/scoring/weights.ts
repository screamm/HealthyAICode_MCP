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
  SATD: 0.6,
  GodClass: 1.5,
  FeatureEnvy: 0.7,
  LowMaintainability: 0.4,
  CodeChurn: 0.6,
  DeveloperCongestion: 0.7,
  KnowledgeLoss: 1.0,
  PrimitiveObsession: 0.5,
  MethodTemporalCoupling: 0.3, // Advisory weight — empirically defensible per literature (D'Ambros 2009, Kirbas 2017, arXiv 2504.18511). See docs/calibration/method-coupling-validation.md
  // Sprint 23: organisational metrics; advisory weights
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
};

/** Minimum score at which a file is considered safe for AI-assisted modification. */
export const AI_READY_THRESHOLD = 9.5;
/** Minimum score for the green (healthy) category. */
export const HEALTHY_THRESHOLD = 9.0;
/** Minimum score for the yellow (problematic) category; below this is red. */
export const PROBLEMATIC_THRESHOLD = 6.0;
