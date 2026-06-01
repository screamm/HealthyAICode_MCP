/**
 * Per-language ROC-curve threshold derivation (Sprint 55).
 *
 * Derives an empirically optimal health-score threshold per language using
 * the Youden J criterion:
 *
 *   J(T) = TPR(T) − FPR(T)
 *   T* = argmax_T J(T)
 *
 * where:
 *   TPR(T) = true positive rate  = TP / (TP + FN)  [buggy files below threshold]
 *   FPR(T) = false positive rate = FP / (FP + TN)  [clean files below threshold]
 *
 * The sweep iterates over all unique score values (as candidate thresholds)
 * in descending order.  At threshold T, a file is predicted "buggy" when its
 * score ≤ T.
 *
 * Also computes the Alves 90th-percentile threshold for the same data so the
 * two methods can be directly compared.
 *
 * Design references:
 *   - Alves et al. ICSM 2010 (percentile-based thresholds)
 *   - Youden (1950) — J statistic for ROC operating-point selection
 *   - arXiv 2602.06831v1 — ROC vs percentile thresholds for firmware metrics
 */

import type { BugRecord, ValidationReport } from './dataset-runner';

/** Threshold derivation result for a single language. */
export interface RocThresholdResult {
  /** Language identifier (e.g. 'python', 'typescript', 'go'). */
  language: string;
  /**
   * ROC-optimal threshold T* derived via Youden J maximisation.
   * Files with score ≤ T* are predicted "buggy".
   */
  rocOptimalThreshold: number;
  /**
   * Youden J statistic at T*: TPR − FPR in [−1, 1].
   * Values close to 1 indicate excellent separation.
   */
  youdenJ: number;
  /**
   * Alves 90th-percentile threshold for comparison.
   * Computed as percentile(scores, 0.90) over all files in the language.
   */
  alvesPercentile90: number;
  /**
   * rocOptimalThreshold − alvesPercentile90.
   * Positive → ROC threshold is more conservative than Alves P90.
   * Negative → ROC threshold is more lenient.
   */
  thresholdDelta: number;
  /** Total number of files in this language sub-set. */
  sampleSize: number;
  /** Number of files labelled as buggy (hasBug = true). */
  buggyCount: number;
}

/** Minimum number of buggy and clean files required per language. */
const MIN_BUGGY = 5;
const MIN_CLEAN = 5;

/** Computes the p-th percentile of an array (linear interpolation). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Finds the ROC-optimal threshold for a set of (score, isBuggy) pairs using
 * Youden J maximisation.
 *
 * @param scores   Health scores (one per file).
 * @param labels   Corresponding bug labels (true = buggy).
 * @returns  `{ threshold, youdenJ }` at the operating point that maximises J.
 */
function rocOptimalThreshold(
  scores: number[],
  labels: boolean[],
): { threshold: number; youdenJ: number } {
  const n = scores.length;
  const buggyTotal = labels.filter(Boolean).length;
  const cleanTotal = n - buggyTotal;

  if (buggyTotal === 0 || cleanTotal === 0) {
    return { threshold: 0, youdenJ: 0 };
  }

  // Collect candidate thresholds: all unique score values
  const candidates = [...new Set(scores)].sort((a, b) => b - a); // descending

  let bestJ = -Infinity;
  let bestT = candidates[0];

  for (const T of candidates) {
    // At threshold T: predict "buggy" when score <= T
    let tp = 0; // buggy predicted as buggy (score <= T)
    let fp = 0; // clean predicted as buggy (score <= T)
    for (let i = 0; i < n; i++) {
      if (scores[i] <= T) {
        if (labels[i]) tp++;
        else fp++;
      }
    }
    const tpr = tp / buggyTotal;
    const fpr = fp / cleanTotal;
    const J = tpr - fpr;

    if (J > bestJ) {
      bestJ = J;
      bestT = T;
    }
  }

  return { threshold: bestT, youdenJ: bestJ };
}

/**
 * Computes per-language ROC-optimal thresholds using Youden J maximisation.
 *
 * Languages with fewer than `MIN_BUGGY` buggy files OR fewer than `MIN_CLEAN`
 * clean files are excluded from the results (insufficient data for ROC
 * analysis).
 *
 * @param records      The original BugRecord array (used to extract language).
 * @param fileResults  Per-file analysis results from `ValidationReport`.
 * @returns            One `RocThresholdResult` per language with sufficient data.
 */
export function computePerLanguageRocThresholds(
  records: BugRecord[],
  fileResults: ValidationReport['fileResults'],
): RocThresholdResult[] {
  if (records.length === 0 || fileResults.length === 0) return [];

  // ── Group by language ─────────────────────────────────────────────────────
  const langGroups = new Map<
    string,
    { scores: number[]; labels: boolean[] }
  >();

  for (let i = 0; i < records.length && i < fileResults.length; i++) {
    const lang = records[i].language;
    if (!langGroups.has(lang)) {
      langGroups.set(lang, { scores: [], labels: [] });
    }
    const group = langGroups.get(lang)!;
    group.scores.push(fileResults[i].healthScore);
    group.labels.push(records[i].hasBug);
  }

  // ── Derive threshold per language ─────────────────────────────────────────
  const results: RocThresholdResult[] = [];

  for (const [language, { scores, labels }] of langGroups) {
    const buggyCount = labels.filter(Boolean).length;
    const cleanCount = labels.filter((l) => !l).length;

    if (buggyCount < MIN_BUGGY || cleanCount < MIN_CLEAN) {
      // Not enough data — skip this language
      continue;
    }

    const { threshold: rocOptimal, youdenJ } = rocOptimalThreshold(scores, labels);

    // Alves P90: 90th percentile of all scores in this language sub-set
    const sortedScores = [...scores].sort((a, b) => a - b);
    const alves90 = percentile(sortedScores, 0.9);

    results.push({
      language,
      rocOptimalThreshold: rocOptimal,
      youdenJ,
      alvesPercentile90: alves90,
      thresholdDelta: rocOptimal - alves90,
      sampleSize: scores.length,
      buggyCount,
    });
  }

  return results;
}
