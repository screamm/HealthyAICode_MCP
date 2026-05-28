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
const SLOPE_RISING_THRESHOLD = 0.1;
const SLOPE_DECLINING_THRESHOLD = -0.1;
const ADI_WARNING_THRESHOLD = 3;
const ADI_HIGH_RISK_THRESHOLD = 6;
const ADI_CRITICAL_THRESHOLD = 8;
const DOC_COVERAGE_CRITICAL_THRESHOLD = 7;
const DOC_COVERAGE_LOW_THRESHOLD = 4;
const TEST_COVERAGE_GOOD_THRESHOLD = 7;
const TEST_COVERAGE_LIMITED_THRESHOLD = 3;
const COUPLING_POINTS_PER_PAIR = 2;
const DEFAULT_NEUTRAL_SCORE = 5;
const DEFAULT_LOOKBACK_DAYS = 90;
const COMPLEXITY_SLOPE_SCALE = 10;
const SLOPE_DECIMAL_PLACES = 3;

interface NumericRange {
  min: number;
  max: number;
}

function clamp(x: number, range: NumericRange): number {
  return Math.max(range.min, Math.min(range.max, x));
}

const SCORE_RANGE: NumericRange = { min: 0, max: COMPLEXITY_SLOPE_SCALE };

function classifyAdi(adi: number): ArchitecturalDecayResult['classification'] {
  if (adi < ADI_WARNING_THRESHOLD) return 'healthy';
  if (adi < ADI_HIGH_RISK_THRESHOLD) return 'warning';
  if (adi < ADI_CRITICAL_THRESHOLD) return 'high_risk';
  return 'critical';
}

function describeComplexitySlope(slope: number): string {
  const s = slope.toFixed(SLOPE_DECIMAL_PLACES);
  if (slope > SLOPE_RISING_THRESHOLD) return `Rising complexity (slope=${s}): technical debt is increasing`;
  if (slope < SLOPE_DECLINING_THRESHOLD) return `Declining complexity (slope=${s}): code is improving`;
  return `Stable complexity (slope=${s})`;
}

function complexityTrendDimension(slope: number): DecayDimension {
  // slope: complexity units per commit-index — scale to 0–10
  // A slope of +1.0 per commit-index (very steep) → score 10
  const rawScore = clamp(slope * COMPLEXITY_SLOPE_SCALE, SCORE_RANGE);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.complexityTrend,
    label: 'Complexity Trend',
    evidence: describeComplexitySlope(slope),
  };
}

function churnRateDimension(churnPerDay: number): DecayDimension {
  const rawScore = clamp((churnPerDay / HIGH_CHURN_THRESHOLD) * COMPLEXITY_SLOPE_SCALE, SCORE_RANGE);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.churnRate,
    label: 'Churn Rate',
    evidence: `${churnPerDay.toFixed(1)} changes/day (threshold: ${HIGH_CHURN_THRESHOLD})`,
  };
}

function couplingDensityDimension(strongCouplingCount: number): DecayDimension {
  // Each strongly coupled file pair (>0.5) contributes 2 points, max 10
  const rawScore = clamp(strongCouplingCount * COUPLING_POINTS_PER_PAIR, SCORE_RANGE);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.couplingDensity,
    label: 'Coupling Density',
    evidence: `${strongCouplingCount} strongly coupled file pairs (strength >0.5)`,
  };
}

function describeDocCoverage(score: number): string {
  if (score > DOC_COVERAGE_CRITICAL_THRESHOLD) return 'Documentation coverage critically low';
  if (score > DOC_COVERAGE_LOW_THRESHOLD) return 'Documentation coverage below recommended level';
  return 'Documentation coverage acceptable';
}

function docCoverageDimension(lowDocScore: number): DecayDimension {
  // lowDocScore 0–10 (0=good documentation, 10=no documentation)
  const score = clamp(lowDocScore, SCORE_RANGE);
  return {
    score,
    weight: WEIGHTS.docCoverage,
    label: 'Documentation Coverage',
    evidence: describeDocCoverage(score),
  };
}

function describeTestProximity(testProximityScore: number): string {
  if (testProximityScore > TEST_COVERAGE_GOOD_THRESHOLD) return 'Tests found near production code';
  if (testProximityScore > TEST_COVERAGE_LIMITED_THRESHOLD) return 'Limited test coverage';
  return 'No tests identified near the module';
}

function testProximityDimension(testProximityScore: number): DecayDimension {
  // testProximityScore 0–10 (10=good test coverage, 0=no tests)
  // Inverted: high testProximityScore → low ADI contribution
  const inverted = clamp(COMPLEXITY_SLOPE_SCALE - testProximityScore, SCORE_RANGE);
  return {
    score: inverted,
    weight: WEIGHTS.testProximity,
    label: 'Test Proximity',
    evidence: describeTestProximity(testProximityScore),
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
interface ModuleContext {
  repoPath: string;
  modulePath: string;
}

export async function computeArchitecturalDecayIndex(
  repoPath: string,
  modulePath: string,
  options: ComputeDecayOptions = {},
): Promise<ArchitecturalDecayResult> {
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const churnPerDay = options.churnPerDay ?? 0;
  const docScore = options.docScore ?? DEFAULT_NEUTRAL_SCORE;    // neutral default
  const testScore = options.testScore ?? DEFAULT_NEUTRAL_SCORE;  // neutral default
  const ctx: ModuleContext = { repoPath, modulePath };

  const complexitySlope = await resolveComplexitySlope(ctx, options);
  const strongCouplings = await resolveStrongCouplings(ctx, lookbackDays, options);

  const dimensions = buildDimensions({ complexitySlope, churnPerDay, strongCouplings, docScore, testScore });
  return buildDecayResult(modulePath, dimensions);
}

async function resolveComplexitySlope(
  ctx: ModuleContext,
  options: ComputeDecayOptions,
): Promise<number> {
  if (options.complexitySlope !== undefined) return options.complexitySlope;
  try {
    const trend = await analyzeComplexityTrend(ctx.repoPath, ctx.modulePath, { maxCommits: 100 });
    // Negative slopes don't contribute to decay — only upward trends matter
    return Math.max(0, trend.slope);
  } catch {
    return 0;
  }
}

async function resolveStrongCouplings(
  ctx: ModuleContext,
  lookbackDays: number,
  options: ComputeDecayOptions,
): Promise<number> {
  if (options.strongCouplings !== undefined) return options.strongCouplings;
  try {
    const coupling = await analyzeFileCoupling(ctx.repoPath, { windowDays: lookbackDays, threshold: 0.5 });
    return coupling.pairs.filter(p => p.fileA === ctx.modulePath || p.fileB === ctx.modulePath).length;
  } catch {
    return 0;
  }
}

interface DecayInputs {
  complexitySlope: number;
  churnPerDay: number;
  strongCouplings: number;
  docScore: number;
  testScore: number;
}

function buildDimensions(inputs: DecayInputs): ArchitecturalDecayResult['dimensions'] {
  const { complexitySlope, churnPerDay, strongCouplings, docScore, testScore } = inputs;
  return {
    complexityTrend: complexityTrendDimension(complexitySlope),
    churnRate:       churnRateDimension(churnPerDay),
    couplingDensity: couplingDensityDimension(strongCouplings),
    docCoverage:     docCoverageDimension(docScore),
    testProximity:   testProximityDimension(testScore),
  };
}

function buildDecayResult(
  modulePath: string,
  dimensions: ArchitecturalDecayResult['dimensions'],
): ArchitecturalDecayResult {
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
