// packages/core/src/security/iso5055-formatter.ts
// ISO/IEC 5055:2021 mapping for the 28 biomarkers.
// Dimensions: Security, Reliability, Performance Efficiency, Maintainability.
// Sprint 59.

import type { HealthResult, SmellType } from '../types';
import { SMELL_WEIGHTS } from '../scoring/weights';

/** A single ISO 5055 dimension with its name, score and contributing smell types. */
export interface Iso5055Dimension {
  name: string;
  score: number;
  smells: string[];
}

/** Full ISO/IEC 5055 report mapping biomarkers to the four quality dimensions. */
export interface Iso5055Report {
  security: Iso5055Dimension;
  reliability: Iso5055Dimension;
  performanceEfficiency: Iso5055Dimension;
  maintainability: Iso5055Dimension;
  overallScore: number;
}

// ── Dimension mappings ────────────────────────────────────────────────────────

const SECURITY_SMELLS: ReadonlyArray<SmellType> = [
  'SqlInjectionRisk',
  'XssRisk',
  'CommandInjectionRisk',
  'HardcodedCredential',
  'HardcodedApiKey',
  'UnsafeDeserialization',
  'PathTraversalRisk',
  'DependencyVulnerability',
  // Sprint 58 security additions
  'SsrfRisk',
  'CryptographicMisuseRisk',
  'HallucinatedPackageImport',
];

const RELIABILITY_SMELLS: ReadonlyArray<SmellType> = [
  'ComplexMethod',
  'BrainMethod',
  'BumpyRoad',
  'DeepNesting',
  'ComplexConditional',
  'LargeMethod',
  'GodClass',
  'FeatureEnvy',
  'DataClumps',
  'MethodTemporalCoupling',
  'KnowledgeLoss',
  // Sprint 58 reliability additions
  'ExceptionHandlingAntiPattern',
  'AsyncAntiPattern',
  'DuplicateCode',
];

const PERFORMANCE_EFFICIENCY_SMELLS: ReadonlyArray<SmellType> = [
  'LargeFile',
  'CodeChurn',
  'DeveloperCongestion',
  'CognitiveComplexity',
  'MagicNumber',
  // Sprint 56
  'SplitResidue',
  'FragmentedCode',
  'ComplexityMassConcentration',
];

const MAINTAINABILITY_SMELLS: ReadonlyArray<SmellType> = [
  'LowDocCoverage',
  'SATD',
  'LongParameterList',
  'LowMaintainability',
  'TypeSafetyEscape',
  'MessageChain',
  'PrimitiveObsession',
  'ArchitectureDebt',
  'DocumentationDebt',
  'IntentClarity',
  // AI-specific
  'AbstractionLeakage',
  'HardcodedAssumption',
  'MissingEdgeCase',
  'StyleInconsistency',
  'AiAttributedSATD',
  'LlmUnboundedCall',
  'LlmUnpinnedModel',
  'LlmNoSystemMessage',
  'LlmNoStructuredOutput',
  'LlmUnsetTemperature',
];

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORE_FLOOR = 1.0;
const SCORE_CEILING = 10.0;

/**
 * Compute a dimension score using the same formula as the main scorer:
 *   score = 10 - Σ(weight × √count)
 * capped at [1.0, 10.0].
 */
function computeDimensionScore(
  smells: Array<{ type: SmellType }>,
  dimensionSmells: ReadonlyArray<SmellType>,
): number {
  // Count occurrences per type within this dimension
  const counts = new Map<SmellType, number>();
  for (const smell of smells) {
    if ((dimensionSmells as string[]).includes(smell.type)) {
      counts.set(smell.type, (counts.get(smell.type) ?? 0) + 1);
    }
  }

  let penalty = 0;
  for (const [type, count] of counts) {
    const weight = SMELL_WEIGHTS[type] ?? 0.5;
    penalty += weight * Math.sqrt(count);
  }

  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEILING, SCORE_CEILING - penalty));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map a HealthResult to an ISO/IEC 5055-aligned report with four quality dimensions.
 *
 * Dimension scores use the same formula as the main health score, but subsetting
 * only the smells relevant to each dimension. An empty HealthResult (no smells)
 * returns all scores at 10.
 *
 * @param result  A HealthResult as returned by analyzeCode / analyzeFile.
 * @returns  An Iso5055Report with four dimensions and an overall score.
 */
export function formatAsIso5055(result: HealthResult): Iso5055Report {
  const smells = result.smells;

  const securityScore = computeDimensionScore(smells, SECURITY_SMELLS);
  const reliabilityScore = computeDimensionScore(smells, RELIABILITY_SMELLS);
  const performanceScore = computeDimensionScore(smells, PERFORMANCE_EFFICIENCY_SMELLS);
  const maintainabilityScore = computeDimensionScore(smells, MAINTAINABILITY_SMELLS);

  // Overall score mirrors the HealthResult score (already computed by the scorer)
  const overallScore = result.score;

  return {
    security: {
      name: 'Security',
      score: securityScore,
      smells: smells
        .filter((s) => (SECURITY_SMELLS as string[]).includes(s.type))
        .map((s) => s.type),
    },
    reliability: {
      name: 'Reliability',
      score: reliabilityScore,
      smells: smells
        .filter((s) => (RELIABILITY_SMELLS as string[]).includes(s.type))
        .map((s) => s.type),
    },
    performanceEfficiency: {
      name: 'Performance Efficiency',
      score: performanceScore,
      smells: smells
        .filter((s) => (PERFORMANCE_EFFICIENCY_SMELLS as string[]).includes(s.type))
        .map((s) => s.type),
    },
    maintainability: {
      name: 'Maintainability',
      score: maintainabilityScore,
      smells: smells
        .filter((s) => (MAINTAINABILITY_SMELLS as string[]).includes(s.type))
        .map((s) => s.type),
    },
    overallScore,
  };
}
