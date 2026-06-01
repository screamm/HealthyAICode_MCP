/**
 * DeLong's test for comparing two correlated ROC AUCs.
 *
 * Both models are evaluated on the SAME set of samples (paired / correlated design),
 * so the test accounts for the covariance between the two AUC estimates rather than
 * treating them as independent.
 *
 * Implementation follows the fast O(n log n) algorithm of:
 *   X. Sun and W. Xu, "Fast Implementation of DeLong's Algorithm for Comparing the
 *   Areas Under Correlated Receiver Operating Characteristic Curves",
 *   IEEE Signal Processing Letters 21(11):1389-1393, 2014.
 *
 * Ported from the canonical reference implementation
 * (yandexdataschool/roc_comparison, MIT) which is what pROC (R) and common
 * scikit-based comparisons agree with. Verified numerically against that
 * reference — see packages/core/tests/validation/delong.test.ts.
 *
 * SCORE CONVENTION (standard ROC): a HIGHER score means MORE likely to be the
 * positive class (label === 1). AUC = P(score_positive > score_negative), with
 * ties counting as 0.5. This matches scikit-learn's `roc_auc_score` and pROC's
 * default `direction = "<"`. If your scores are inverted (lower = positive, e.g.
 * a health score where lower = buggy), negate them before calling delongTest.
 *
 * No external dependencies — only standard arithmetic.
 */

/** Two-tailed p-value for a difference of exactly zero (degenerate / identical models). */
const P_VALUE_NO_DIFFERENCE = 1;

/** z-statistic when the AUC difference is zero (no evidence of a difference). */
const Z_NO_DIFFERENCE = 0;

/** Half the standard normal mass, used to center the CDF approximation. */
const NORMAL_CDF_MIDPOINT = 0.5;

/** Critical z value for a two-sided 95% confidence interval (1.959963985...). */
const Z_95 = 1.959963984540054;

/** Result of a DeLong test comparing model A against model B. */
export interface DelongTestResult {
  /** AUC of model A (P(scoreA_pos > scoreA_neg)). */
  aucA: number;
  /** AUC of model B (P(scoreB_pos > scoreB_neg)). */
  aucB: number;
  /** aucA - aucB. */
  aucDiff: number;
  /** Standardized test statistic: aucDiff / SE(aucDiff). 0 when the difference is exactly zero. */
  z: number;
  /** Two-tailed p-value for H0: aucA === aucB. */
  pValue: number;
  /** 95% confidence interval for aucDiff, as [lo, hi]. */
  ci95: [number, number];
}

/**
 * Computes midranks of a 1D array (the T2 vector in Sun & Xu).
 * Ties receive the average of the ranks they span; ranks are 1-based.
 */
function computeMidrank(x: number[]): number[] {
  const n = x.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);

  const t = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    // advance over the run of equal values
    while (j < n && x[order[j]] === x[order[i]]) j++;
    const midrank = 0.5 * (i + j - 1);
    for (let k = i; k < j; k++) {
      t[k] = midrank;
    }
    i = j;
  }

  // Scatter back to original positions and shift to 1-based ranks.
  const result = new Array<number>(n);
  for (let r = 0; r < n; r++) {
    result[order[r]] = t[r] + 1;
  }
  return result;
}

/** Sample mean of an array. */
function mean(v: number[]): number {
  let s = 0;
  for (const x of v) s += x;
  return s / v.length;
}

/**
 * Sample covariance between two equal-length vectors (divides by n - 1,
 * matching numpy.cov). Returns 0 when n < 2.
 */
function sampleCovariance(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
  }
  return s / (n - 1);
}

/**
 * Error function via Abramowitz & Stegun 7.1.26 (max abs error 1.5e-7).
 * erf(x) = 1 - (a1 t + ... + a5 t^5) e^{-x^2}, t = 1/(1 + p|x|).
 */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Standard normal CDF Φ(x) = ½(1 + erf(x/√2)).
 * Built on the erf approximation above (overall max error ~1.5e-7), which is
 * accurate in the tails — unlike applying the erf polynomial directly with
 * e^{-x²/2}, which understates two-sided p-values for |z| ≳ 2.
 */
function normalCdf(x: number): number {
  return NORMAL_CDF_MIDPOINT * (1 + erf(x / Math.SQRT2));
}

/** Core fast-DeLong computation for two classifiers over the SAME, label-sorted samples. */
interface FastDelong {
  aucA: number;
  aucB: number;
  /** 2x2 DeLong covariance of [aucA, aucB], flattened as [s00, s01, s10, s11]. */
  cov: [number, number, number, number];
}

/**
 * @param posA scores from model A for the positive (label 1) examples
 * @param negA scores from model A for the negative (label 0) examples
 * @param posB scores from model B for the positive examples (same example order as posA)
 * @param negB scores from model B for the negative examples (same example order as negA)
 */
function fastDelong(posA: number[], negA: number[], posB: number[], negB: number[]): FastDelong {
  const m = posA.length; // positives
  const n = negA.length; // negatives

  const tx = [computeMidrank(posA), computeMidrank(posB)]; // midranks within positives
  const ty = [computeMidrank(negA), computeMidrank(negB)]; // midranks within negatives
  const tz = [computeMidrank([...posA, ...negA]), computeMidrank([...posB, ...negB])]; // combined

  const aucs = [0, 0];
  const v01: number[][] = [[], []]; // structural component over positives, length m
  const v10: number[][] = [[], []]; // structural component over negatives, length n

  for (let r = 0; r < 2; r++) {
    let posMidrankSum = 0;
    for (let i = 0; i < m; i++) posMidrankSum += tz[r][i];
    aucs[r] = posMidrankSum / m / n - (m + 1) / 2 / n;

    for (let i = 0; i < m; i++) {
      v01[r][i] = (tz[r][i] - tx[r][i]) / n;
    }
    for (let j = 0; j < n; j++) {
      v10[r][j] = 1 - (tz[r][m + j] - ty[r][j]) / m;
    }
  }

  // sx = cov(v01) over the two rows; sy = cov(v10). delongcov = sx/m + sy/n.
  const sx00 = sampleCovariance(v01[0], v01[0]);
  const sx01 = sampleCovariance(v01[0], v01[1]);
  const sx11 = sampleCovariance(v01[1], v01[1]);
  const sy00 = sampleCovariance(v10[0], v10[0]);
  const sy01 = sampleCovariance(v10[0], v10[1]);
  const sy11 = sampleCovariance(v10[1], v10[1]);

  const s00 = sx00 / m + sy00 / n;
  const s01 = sx01 / m + sy01 / n;
  const s11 = sx11 / m + sy11 / n;

  return { aucA: aucs[0], aucB: aucs[1], cov: [s00, s01, s01, s11] };
}

/**
 * DeLong's test for two correlated ROC AUCs computed on the same samples.
 *
 * @param scoresA  model A scores (higher = more likely positive)
 * @param scoresB  model B scores (higher = more likely positive)
 * @param labels   ground-truth class labels, each 0 (negative) or 1 (positive)
 * @returns aucA, aucB, aucDiff, z, two-tailed pValue, and 95% CI for the difference
 * @throws if the three arrays differ in length, are empty, contain a label other
 *         than 0/1, or do not contain at least one positive and one negative.
 */
export function delongTest(
  scoresA: number[],
  scoresB: number[],
  labels: Array<0 | 1>,
): DelongTestResult {
  const N = labels.length;
  if (scoresA.length !== N || scoresB.length !== N) {
    throw new Error('delongTest: scoresA, scoresB, and labels must have the same length');
  }
  if (N === 0) {
    throw new Error('delongTest: inputs must be non-empty');
  }

  const posA: number[] = [];
  const negA: number[] = [];
  const posB: number[] = [];
  const negB: number[] = [];
  for (let i = 0; i < N; i++) {
    const label = labels[i];
    if (label === 1) {
      posA.push(scoresA[i]);
      posB.push(scoresB[i]);
    } else if (label === 0) {
      negA.push(scoresA[i]);
      negB.push(scoresB[i]);
    } else {
      throw new Error(`delongTest: labels must be 0 or 1, got ${label as number}`);
    }
  }

  if (posA.length === 0 || negA.length === 0) {
    throw new Error('delongTest: need at least one positive (label 1) and one negative (label 0) sample');
  }

  const { aucA, aucB, cov } = fastDelong(posA, negA, posB, negB);
  const aucDiff = aucA - aucB;

  // Var(aucA - aucB) = l S lᵀ with l = [1, -1] = s00 - 2 s01 + s11.
  const varDiff = cov[0] - 2 * cov[1] + cov[3];
  const se = varDiff > 0 ? Math.sqrt(varDiff) : 0;

  let z: number;
  let pValue: number;
  if (aucDiff === 0 || se === 0) {
    // No difference (identical AUCs) or zero variance (e.g. identical scores):
    // there is no evidence against H0.
    z = Z_NO_DIFFERENCE;
    pValue = P_VALUE_NO_DIFFERENCE;
  } else {
    z = aucDiff / se;
    pValue = 2 * (1 - normalCdf(Math.abs(z)));
  }

  const margin = Z_95 * se;
  const ci95: [number, number] = [aucDiff - margin, aucDiff + margin];

  return { aucA, aucB, aucDiff, z, pValue, ci95 };
}
