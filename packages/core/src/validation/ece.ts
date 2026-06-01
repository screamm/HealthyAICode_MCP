/**
 * Expected Calibration Error (ECE) for the health-score calibration pipeline.
 *
 * ECE measures whether a predicted score-band actually matches the observed
 * fraction of defect-free files in that band.  It answers: "When we predict
 * that a file is in the 9.0–9.5 range, is the fraction of truly bug-free
 * files in that band consistent with the score?"
 *
 * Formula (equal-width bins over [1.0, 10.0]):
 *
 *   ECE = Σ_b (|n_b| / N) × |cleanFraction_b − predictedCleanFraction_b|
 *
 * where:
 *   n_b                    = number of files in bin b
 *   N                      = total files across all non-empty bins
 *   cleanFraction_b        = actual fraction of clean (hasBug = false) files in b
 *   predictedCleanFraction = normalised score → score / 10  (proxy for "p(clean)")
 *
 * Design choices (see sprint doc §"Tekniska beslut"):
 *   - Equal-width bins (not equal-frequency) for interpretability.
 *   - Empty bins are excluded from the weighted sum (they contribute nothing).
 *   - Standard `numBins = 10` yields 0.9-unit bands over the [1.0, 10.0] range.
 */

import type { ValidationReport } from './dataset-runner';

/** A single bin in the ECE calculation. */
export interface EceBin {
  /** Inclusive lower bound of the score band. */
  bandLow: number;
  /** Exclusive upper bound (except for the last bin which is inclusive). */
  bandHigh: number;
  /** Number of files in this bin. */
  count: number;
  /** Actual fraction of files in this bin with `hasBug = false`. */
  actualCleanFraction: number;
  /**
   * Predicted clean fraction derived from the mean score of files in this
   * bin: `meanScore / 10`.  Ranges in [0, 1].
   */
  predictedCleanFraction: number;
  /** |actualCleanFraction − predictedCleanFraction| (0 = perfect calibration). */
  calibrationError: number;
}

/** Full output of `computeECE()`. */
export interface EceResult {
  /** Overall Expected Calibration Error in [0, 1]. Lower is better. */
  ece: number;
  /**
   * Per-bin breakdown.  Empty bins are still included here for inspection
   * but contribute 0 to the overall ECE because their weight is 0.
   */
  bins: EceBin[];
}

/** Score range lower bound for binning. */
const SCORE_MIN = 1.0;
/** Score range upper bound for binning. */
const SCORE_MAX = 10.0;

/**
 * Computes the Expected Calibration Error (ECE) for a set of validation
 * file results.
 *
 * @param fileResults  Per-file results from `ValidationReport.fileResults`.
 * @param numBins      Number of equal-width bins over [1.0, 10.0].
 *                     Defaults to 10 (0.9-unit bands).
 * @returns            An `EceResult` with the overall ECE and a per-bin
 *                     breakdown.  Returns `{ ece: 0, bins: [] }` for empty
 *                     input without throwing.
 */
export function computeECE(
  fileResults: ValidationReport['fileResults'],
  numBins: number = 10,
): EceResult {
  // ── Guard: empty input ────────────────────────────────────────────────────
  if (fileResults.length === 0) {
    return { ece: 0, bins: [] };
  }

  const safeBins = Math.max(1, numBins);
  const binWidth = (SCORE_MAX - SCORE_MIN) / safeBins;

  // ── Initialise bin accumulators ───────────────────────────────────────────
  interface BinAccum {
    totalCount: number;
    cleanCount: number;
    scoreSum: number;
  }

  const accumulators: BinAccum[] = Array.from({ length: safeBins }, () => ({
    totalCount: 0,
    cleanCount: 0,
    scoreSum: 0,
  }));

  // ── Assign each file result to a bin ─────────────────────────────────────
  for (const fr of fileResults) {
    const clampedScore = Math.min(Math.max(fr.healthScore, SCORE_MIN), SCORE_MAX);
    // For the last bin, scores equal to SCORE_MAX fall in the final bin
    let binIdx = Math.floor((clampedScore - SCORE_MIN) / binWidth);
    if (binIdx >= safeBins) binIdx = safeBins - 1;

    accumulators[binIdx].totalCount += 1;
    accumulators[binIdx].scoreSum += clampedScore;
    if (!fr.hasBug) {
      accumulators[binIdx].cleanCount += 1;
    }
  }

  const totalFiles = fileResults.length;

  // ── Build per-bin results ─────────────────────────────────────────────────
  const bins: EceBin[] = accumulators.map((acc, idx) => {
    const bandLow = SCORE_MIN + idx * binWidth;
    const bandHigh = bandLow + binWidth;

    if (acc.totalCount === 0) {
      return {
        bandLow: parseFloat(bandLow.toFixed(4)),
        bandHigh: parseFloat(bandHigh.toFixed(4)),
        count: 0,
        actualCleanFraction: 0,
        predictedCleanFraction: 0,
        calibrationError: 0,
      };
    }

    const actualCleanFraction = acc.cleanCount / acc.totalCount;
    const meanScore = acc.scoreSum / acc.totalCount;
    const predictedCleanFraction = meanScore / SCORE_MAX;
    const calibrationError = Math.abs(actualCleanFraction - predictedCleanFraction);

    return {
      bandLow: parseFloat(bandLow.toFixed(4)),
      bandHigh: parseFloat(bandHigh.toFixed(4)),
      count: acc.totalCount,
      actualCleanFraction,
      predictedCleanFraction,
      calibrationError,
    };
  });

  // ── Compute weighted ECE (skip empty bins) ────────────────────────────────
  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    const weight = bin.count / totalFiles;
    ece += weight * bin.calibrationError;
  }

  return { ece, bins };
}
