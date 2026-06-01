/**
 * Unit tests for computeECE() — Expected Calibration Error.
 *
 * Sprint 55 acceptance criteria:
 *   Test 1: perfect calibration — all files in band 9.5–10.0 are clean → ECE near 0.
 *   Test 2: systematic overestimation — all files in band 9.0–9.5 are buggy → ECE > 0.4.
 *   Test 3: empty input → { ece: 0, bins: [] } without exception.
 *   Test 4: numBins = 5 → 5 bins with width 1.8.
 */

import { describe, it, expect } from 'vitest';
import { computeECE } from '../../src/validation/ece';
import type { EceResult } from '../../src/validation/ece';

// Helper to build minimal fileResults entries
function makeResult(
  healthScore: number,
  hasBug: boolean,
  filePath = `file_${healthScore}.ts`,
) {
  return { filePath, healthScore, hasBug, bugCount: hasBug ? 1 : 0 };
}

// ── Test 1: perfect calibration ───────────────────────────────────────────────

describe('computeECE — perfect calibration', () => {
  it('returns ECE near 0 when all files at score 10 are clean', () => {
    // All files at score 10 → predictedCleanFraction = 1.0, actual = 1.0
    const fileResults = Array.from({ length: 20 }, (_, i) =>
      makeResult(10.0, false, `clean_${i}.ts`),
    );
    const result: EceResult = computeECE(fileResults);
    expect(result.ece).toBeLessThan(0.05);
    // ECE should be exactly 0 in the perfect case
    expect(result.ece).toBeCloseTo(0, 5);
  });

  it('returns ECE near 0 for a near-perfect classifier in the 9.5–10 band', () => {
    // 10 files with score 9.6 (predictedClean ≈ 0.96), all clean (actual = 1.0)
    // |1.0 − 0.96| = 0.04 → ECE = 0.04
    const fileResults = Array.from({ length: 10 }, (_, i) =>
      makeResult(9.6, false, `near_perfect_${i}.ts`),
    );
    const result = computeECE(fileResults);
    expect(result.ece).toBeLessThan(0.1);
  });
});

// ── Test 2: systematic overestimation ────────────────────────────────────────

describe('computeECE — systematic overestimation', () => {
  it('returns ECE > 0.4 when all files at score 9.0 are buggy', () => {
    // All files score 9.0 → predictedClean = 0.9, actual clean fraction = 0 (all buggy)
    // calibrationError = |0 − 0.9| = 0.9; weight = 1.0 → ECE = 0.9
    const fileResults = Array.from({ length: 10 }, (_, i) =>
      makeResult(9.0, true, `buggy_${i}.ts`),
    );
    const result = computeECE(fileResults);
    expect(result.ece).toBeGreaterThan(0.4);
  });

  it('returns ECE > 0.4 for a mix of buggy files at high scores', () => {
    // Files scoring 9.5 but ALL buggy: predictedClean ≈ 0.95, actual = 0.0
    const fileResults = Array.from({ length: 15 }, (_, i) =>
      makeResult(9.5, true, `misclassified_${i}.ts`),
    );
    const result = computeECE(fileResults);
    expect(result.ece).toBeGreaterThan(0.4);
  });
});

// ── Test 3: empty input ───────────────────────────────────────────────────────

describe('computeECE — empty input', () => {
  it('returns { ece: 0, bins: [] } for empty fileResults without throwing', () => {
    const result = computeECE([]);
    expect(result).toEqual({ ece: 0, bins: [] });
  });

  it('does not throw for empty input with explicit numBins', () => {
    expect(() => computeECE([], 5)).not.toThrow();
    expect(computeECE([], 5)).toEqual({ ece: 0, bins: [] });
  });
});

// ── Test 4: numBins = 5 ───────────────────────────────────────────────────────

describe('computeECE — numBins parameter', () => {
  it('returns exactly 5 bins when numBins = 5', () => {
    const fileResults = [
      makeResult(2.0, true),
      makeResult(4.0, true),
      makeResult(6.0, false),
      makeResult(8.0, false),
      makeResult(10.0, false),
    ];
    const result = computeECE(fileResults, 5);
    expect(result.bins).toHaveLength(5);
  });

  it('each bin has width approximately 1.8 when numBins = 5', () => {
    const fileResults = [makeResult(5.0, false)];
    const result = computeECE(fileResults, 5);
    // Score range [1.0, 10.0] width = 9.0; 9.0 / 5 = 1.8
    const firstBin = result.bins[0];
    expect(firstBin.bandHigh - firstBin.bandLow).toBeCloseTo(1.8, 3);
  });

  it('returns 10 bins by default', () => {
    const fileResults = [makeResult(5.0, false)];
    const result = computeECE(fileResults);
    expect(result.bins).toHaveLength(10);
  });
});

// ── Additional correctness checks ─────────────────────────────────────────────

describe('computeECE — bin contents', () => {
  it('assigns a score-10 file to the last bin', () => {
    const result = computeECE([makeResult(10.0, false)]);
    const lastBin = result.bins[result.bins.length - 1];
    expect(lastBin.count).toBe(1);
  });

  it('assigns a score-1 file to the first bin', () => {
    const result = computeECE([makeResult(1.0, true)]);
    const firstBin = result.bins[0];
    expect(firstBin.count).toBe(1);
    expect(firstBin.actualCleanFraction).toBe(0);
  });

  it('ECE is in [0, 1]', () => {
    const fileResults = [
      makeResult(3.0, true),
      makeResult(6.0, false),
      makeResult(8.0, true),
      makeResult(9.5, false),
    ];
    const result = computeECE(fileResults);
    expect(result.ece).toBeGreaterThanOrEqual(0);
    expect(result.ece).toBeLessThanOrEqual(1);
  });
});
