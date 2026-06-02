import type { FunctionResult, Smell } from '../types';

/**
 * ComplexityMassConcentration — Structural Erosion Index (Sprint 57)
 *
 * Implements the SlopCodeBench erosion formula (arXiv 2603.24755):
 *   mass(f) = CC(f) × √SLOC(f)
 *   erosion  = Σ mass(f | CC(f) > 10) / Σ mass(all f)
 *
 * Fires when erosion > 0.60 and functions.length >= 3.
 * Agent-generated code averages erosion 0.68 vs human code 0.34.
 */

const CC_THRESHOLD = 10;
const EROSION_THRESHOLD = 0.60;
const MIN_FUNCTIONS = 3;

function mass(f: FunctionResult): number {
  return f.cyclomaticComplexity * Math.sqrt(f.length > 0 ? f.length : 1);
}

/**
 * Detects ComplexityMassConcentration (Structural Erosion Index).
 *
 * @param functions - Array of per-function results from a Tier A analyzer.
 * @returns A single Smell if erosion > 0.60 and there are >= 3 functions, otherwise null.
 */
export function detectComplexityMassConcentration(functions: FunctionResult[]): Smell | null {
  if (functions.length < MIN_FUNCTIONS) return null;

  const highCC = functions.filter(f => f.cyclomaticComplexity > CC_THRESHOLD);
  const totalMass = functions.reduce((s, f) => s + mass(f), 0);
  const highMass = highCC.reduce((s, f) => s + mass(f), 0);
  const erosion = totalMass > 0 ? highMass / totalMass : 0;

  if (erosion <= EROSION_THRESHOLD) return null;

  const severity = erosion > 0.80 ? 'critical' : 'high';
  const erosionPct = (erosion * 100).toFixed(1);
  const overThreshold = (erosion * 100 - 60).toFixed(1);

  return {
    type: 'ComplexityMassConcentration',
    severity,
    line: 1,
    metricValue: erosion,
    description: `Erosion index ${erosionPct} % — ${overThreshold} percentage points over the threshold (60 %). Agent code typically shows 0.68 versus human code 0.34.`,
    suggestion:
      'Extract complex functions (CC > 10) into separate modules until they no longer dominate the complexity mass.',
  };
}
