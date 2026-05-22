// packages/core/src/temporal/decay-index.ts
import type { ArchitecturalDecayResult, DecayDimension } from '../types';
import { analyzeComplexityTrend } from './complexity-trend';
import { analyzeFileCoupling } from './file-coupling';

const WEIGHTS = {
  complexityTrend: 0.35,
  churnRate:       0.25,
  couplingDensity: 0.20,
  docCoverage:     0.10,
  testProximity:   0.10,
} as const;

/** Threshold for "high churn": raw (additions + deletions) / lookbackDays */
const HIGH_CHURN_THRESHOLD = 50;

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function classifyAdi(adi: number): ArchitecturalDecayResult['classification'] {
  if (adi < 3) return 'healthy';
  if (adi < 6) return 'warning';
  if (adi < 8) return 'high_risk';
  return 'critical';
}

function complexityTrendDimension(slope: number): DecayDimension {
  // slope: complexity units per commit-index — scale to 0–10
  // A slope of +1.0 per commit-index (very steep) → score 10
  const rawScore = clamp(slope * 10, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.complexityTrend,
    label: 'Complexity Trend',
    evidence: slope > 0.1
      ? `Rising complexity (slope=${slope.toFixed(3)}): technical debt is increasing`
      : slope < -0.1
      ? `Declining complexity (slope=${slope.toFixed(3)}): code is improving`
      : `Stable complexity (slope=${slope.toFixed(3)})`,
  };
}

function churnRateDimension(churnPerDay: number): DecayDimension {
  const rawScore = clamp((churnPerDay / HIGH_CHURN_THRESHOLD) * 10, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.churnRate,
    label: 'Churn Rate',
    evidence: `${churnPerDay.toFixed(1)} changes/day (threshold: ${HIGH_CHURN_THRESHOLD})`,
  };
}

function couplingDensityDimension(strongCouplingCount: number): DecayDimension {
  // Each strongly coupled file pair (>0.5) contributes 2 points, max 10
  const rawScore = clamp(strongCouplingCount * 2, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.couplingDensity,
    label: 'Coupling Density',
    evidence: `${strongCouplingCount} strongly coupled file pairs (strength >0.5)`,
  };
}

function docCoverageDimension(lowDocScore: number): DecayDimension {
  // lowDocScore 0–10 (0=good documentation, 10=no documentation)
  const score = clamp(lowDocScore, 0, 10);
  return {
    score,
    weight: WEIGHTS.docCoverage,
    label: 'Documentation Coverage',
    evidence: score > 7
      ? 'Documentation coverage critically low'
      : score > 4
      ? 'Documentation coverage below recommended level'
      : 'Documentation coverage acceptable',
  };
}

function testProximityDimension(testProximityScore: number): DecayDimension {
  // testProximityScore 0–10 (10=good test coverage, 0=no tests)
  // Inverted: high testProximityScore → low ADI contribution
  const inverted = clamp(10 - testProximityScore, 0, 10);
  return {
    score: inverted,
    weight: WEIGHTS.testProximity,
    label: 'Test Proximity',
    evidence: testProximityScore > 7
      ? 'Tests found near production code'
      : testProximityScore > 3
      ? 'Limited test coverage'
      : 'No tests identified near the module',
  };
}

export interface ComputeDecayOptions {
  lookbackDays?: number;
  /** Pre-computed values to avoid redundant git calls when already calculated */
  churnPerDay?: number;
  complexitySlope?: number;
  strongCouplings?: number;
  /** 0–10, 0=good documentation */
  docScore?: number;
  /** 0–10, 10=good test coverage */
  testScore?: number;
}

/**
 * Computes the Architectural Decay Index (ADI) for a module.
 * ADI ∈ [0, 10] where 0 = healthy and 10 = critical decay.
 *
 * Pre-computed dimension values can be injected via options to avoid redundant git calls.
 * When not provided, complexity slope and coupling density are computed from git history.
 */
export async function computeArchitecturalDecayIndex(
  repoPath: string,
  modulePath: string,
  options: ComputeDecayOptions = {},
): Promise<ArchitecturalDecayResult> {
  const lookbackDays = options.lookbackDays ?? 90;

  let complexitySlope = options.complexitySlope ?? 0;
  let churnPerDay = options.churnPerDay ?? 0;
  let strongCouplings = options.strongCouplings ?? 0;
  const docScore = options.docScore ?? 5;    // neutral default
  const testScore = options.testScore ?? 5;  // neutral default

  // Compute complexity slope if not injected
  if (options.complexitySlope === undefined) {
    try {
      const trend = await analyzeComplexityTrend(repoPath, modulePath, { maxCommits: 100 });
      // Negative slopes don't contribute to decay — only upward trends matter
      complexitySlope = Math.max(0, trend.slope);
    } catch {
      complexitySlope = 0;
    }
  }

  // Compute strong coupling count if not injected
  if (options.strongCouplings === undefined) {
    try {
      const coupling = await analyzeFileCoupling(repoPath, { windowDays: lookbackDays, threshold: 0.5 });
      strongCouplings = coupling.pairs.filter(p =>
        p.fileA === modulePath || p.fileB === modulePath,
      ).length;
    } catch {
      strongCouplings = 0;
    }
  }

  const dimensions: ArchitecturalDecayResult['dimensions'] = {
    complexityTrend: complexityTrendDimension(complexitySlope),
    churnRate:       churnRateDimension(churnPerDay),
    couplingDensity: couplingDensityDimension(strongCouplings),
    docCoverage:     docCoverageDimension(docScore),
    testProximity:   testProximityDimension(testScore),
  };

  const adi = Object.values(dimensions).reduce(
    (sum, dim) => sum + dim.score * dim.weight,
    0,
  );

  return {
    module: modulePath,
    adi: parseFloat(adi.toFixed(2)),
    classification: classifyAdi(adi),
    dimensions,
  };
}
