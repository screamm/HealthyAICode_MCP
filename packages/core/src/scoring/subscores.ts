import type { Smell, SmellType, DimensionSubscores } from '../types';
import { SMELL_WEIGHTS } from './weights';

/** The four exposed dimensions (Sprint 56). `overall` mirrors the aggregated score. */
type Dimension = 'security' | 'complexity' | 'maintainability' | 'duplication';

/**
 * Static categorisation of each scored SmellType into one of the four dimensions.
 * Intentionally a `Partial<Record>` (not exhaustive) so future SmellType additions
 * default to the catch-all bucket rather than breaking the typecheck.
 */
const DIMENSION_MAP: Partial<Record<SmellType, Dimension>> = {
  // security
  SqlInjectionRisk: 'security',
  XssRisk: 'security',
  CommandInjectionRisk: 'security',
  HardcodedCredential: 'security',
  HardcodedApiKey: 'security',
  UnsafeDeserialization: 'security',
  PathTraversalRisk: 'security',
  DependencyVulnerability: 'security',
  SsrfRisk: 'security',
  CryptographicMisuseRisk: 'security',
  HallucinatedPackageImport: 'security',
  // complexity
  ComplexMethod: 'complexity',
  DeepNesting: 'complexity',
  BumpyRoad: 'complexity',
  BrainMethod: 'complexity',
  CognitiveComplexity: 'complexity',
  ComplexConditional: 'complexity',
  SplitResidue: 'complexity',
  FragmentedCode: 'complexity',
  ComplexityMassConcentration: 'complexity',
  // maintainability
  GodClass: 'maintainability',
  FeatureEnvy: 'maintainability',
  DataClumps: 'maintainability',
  LowMaintainability: 'maintainability',
  LargeFile: 'maintainability',
  LargeMethod: 'maintainability',
  LongParameterList: 'maintainability',
  MessageChain: 'maintainability',
  PrimitiveObsession: 'maintainability',
  SATD: 'maintainability',
  DocumentationDebt: 'maintainability',
  IntentClarity: 'maintainability',
  KnowledgeLoss: 'maintainability',
  ArchitectureDebt: 'maintainability',
  CodeChurn: 'maintainability',
  MethodTemporalCoupling: 'maintainability',
  AiAttributedSATD: 'maintainability',
  ExceptionHandlingAntiPattern: 'maintainability',
  AsyncAntiPattern: 'maintainability',
  // duplication
  StyleInconsistency: 'duplication',
  DuplicateCode: 'duplication',
};

/** ComplexMethod threshold-gating constants (Sprint 56). */
const COMPLEX_METHOD_THRESHOLD_LOW = 15;
const COMPLEX_METHOD_THRESHOLD_HIGH = 25;
const COMPLEX_METHOD_WEIGHT_LOW = 1.0;
const COMPLEX_METHOD_WEIGHT_HIGH = 1.5;

const SCORE_FLOOR = 1.0;
const SCORE_CEILING = 10.0;

/**
 * Resolves the effective per-occurrence weight for a smell.
 * ComplexMethod is threshold-gated by its cyclomatic complexity (`metricValue`):
 *   CC in [15, 24] → 1.0, CC ≥ 25 → 1.5. Missing/low metricValue falls back to 1.5 (conservative).
 * All other types use the static {@link SMELL_WEIGHTS} table.
 */
function effectiveWeight(smell: Smell): number {
  if (smell.type === 'ComplexMethod') {
    const cc = smell.metricValue;
    if (cc === undefined) return COMPLEX_METHOD_WEIGHT_HIGH;
    if (cc >= COMPLEX_METHOD_THRESHOLD_HIGH) return COMPLEX_METHOD_WEIGHT_HIGH;
    if (cc >= COMPLEX_METHOD_THRESHOLD_LOW) return COMPLEX_METHOD_WEIGHT_LOW;
    // CC below the low threshold: defensive fallback (such a smell should not normally exist).
    return COMPLEX_METHOD_WEIGHT_HIGH;
  }
  return SMELL_WEIGHTS[smell.type] ?? 0;
}

/** Clamps a raw dimension score into the valid [1.0, 10.0] band. */
function clamp(score: number): number {
  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEILING, parseFloat(score.toFixed(1))));
}

/**
 * Computes per-dimension subscores (Sprint 56).
 *
 * Each dimension score is `10.0 − Σ(weight × √count)` for the smells categorised into that
 * dimension, using the same progressive-sqrt model as the overall score, then clamped to
 * [1.0, 10.0]. ComplexMethod weight is threshold-gated by CC (see {@link effectiveWeight}).
 * Does NOT change the scoring formula — it re-buckets already-weighted findings.
 *
 * @param smells the file's smells
 * @param baseScore the aggregated overall score (echoed into `overall`)
 */
export function computeSubscores(
  smells: Smell[],
  baseScore: number,
): DimensionSubscores {
  // Accumulate Σ(weight) per (dimension, type) so the sqrt is applied per type, per dimension.
  const sumByDimType = new Map<Dimension, Map<SmellType, { weight: number; count: number }>>();

  for (const smell of smells) {
    const dimension = DIMENSION_MAP[smell.type];
    if (dimension === undefined) continue; // unscored/unknown type → no dimension contribution

    let byType = sumByDimType.get(dimension);
    if (byType === undefined) {
      byType = new Map();
      sumByDimType.set(dimension, byType);
    }

    const existing = byType.get(smell.type);
    const weight = effectiveWeight(smell);
    if (existing === undefined) {
      // Seed with this occurrence's weight; ComplexMethod weight may vary per smell so we
      // average the weights for that type across occurrences to keep the model stable.
      byType.set(smell.type, { weight, count: 1 });
    } else {
      existing.count += 1;
      existing.weight += weight;
    }
  }

  const dimensionScore = (dimension: Dimension): number => {
    const byType = sumByDimType.get(dimension);
    if (byType === undefined) return SCORE_CEILING;
    let penalty = 0;
    for (const { weight, count } of byType.values()) {
      const avgWeight = weight / count;
      penalty += avgWeight * Math.sqrt(count);
    }
    return clamp(SCORE_CEILING - penalty);
  };

  return {
    security: dimensionScore('security'),
    complexity: dimensionScore('complexity'),
    maintainability: dimensionScore('maintainability'),
    duplication: dimensionScore('duplication'),
    overall: clamp(baseScore),
  };
}
