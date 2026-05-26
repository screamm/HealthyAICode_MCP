/**
 * Pure statistical correlation utilities.
 * No external dependencies — only standard arithmetic.
 */

/** Computes the Pearson correlation coefficient between two numeric arrays.
 *  Returns 0 when either array has zero variance. */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let xVar = 0;
  let yVar = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean;
    const dy = y[i] - yMean;
    num += dx * dy;
    xVar += dx * dx;
    yVar += dy * dy;
  }

  const denom = Math.sqrt(xVar * yVar);
  return denom === 0 ? 0 : num / denom;
}

/** Assigns dense ranks (ties share the mean rank). */
function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(arr.length);
  let pos = 0;
  while (pos < indexed.length) {
    let end = pos;
    while (end < indexed.length && indexed[end].v === indexed[pos].v) end++;
    const meanRank = (pos + end - 1) / 2 + 1; // 1-indexed mean rank
    for (let k = pos; k < end; k++) {
      ranks[indexed[k].i] = meanRank;
    }
    pos = end;
  }
  return ranks;
}

/** Computes Spearman's rank correlation coefficient.
 *  Internally ranks both arrays and applies Pearson on the ranks. */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length === 0 || x.length !== y.length) return 0;
  return pearsonCorrelation(rankArray(x), rankArray(y));
}

/**
 * Computes the Area Under the ROC Curve (AUROC) using the Wilcoxon-Mann-Whitney statistic.
 *
 * Convention: lower score = worse health = more bugs.
 * A perfect classifier assigns lower health scores to buggy files.
 *
 * AUROC = P(score_buggy < score_clean)
 *
 * Returns 0.5 for degenerate inputs (no buggy or no clean files).
 */
export function computeAUROC(scores: number[], labels: boolean[]): number {
  if (scores.length === 0 || scores.length !== labels.length) return 0.5;

  const buggy = scores.filter((_, i) => labels[i]);
  const clean = scores.filter((_, i) => !labels[i]);

  if (buggy.length === 0 || clean.length === 0) return 0.5;

  let concordant = 0;
  let tied = 0;
  const total = buggy.length * clean.length;

  for (const b of buggy) {
    for (const c of clean) {
      if (b < c) concordant++;
      else if (b === c) tied++;
    }
  }

  // Ties contribute 0.5 each
  return (concordant + 0.5 * tied) / total;
}

/** Standard normal CDF using Abramowitz & Stegun 7.1.26 approximation (max error 1.5e-7). */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);
  return 0.5 * (1 + sign * y);
}

/**
 * Bootstrapped AUROC confidence interval.
 * Resamples `scores`/`labels` with replacement `iterations` times,
 * computes AUROC on each resample, and returns percentile-based CI.
 */
export function bootstrapAUROC(
  scores: number[],
  labels: boolean[],
  iterations: number = 1000,
  confidenceLevel: number = 0.95,
): { lower: number; upper: number; mean: number; ciWidth: number } {
  if (scores.length === 0 || labels.length === 0) {
    return { lower: 0.5, upper: 0.5, mean: 0.5, ciWidth: 0 };
  }

  const n = scores.length;
  const bootstrapped: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const resampledScores: number[] = [];
    const resampledLabels: boolean[] = [];
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      resampledScores.push(scores[idx]);
      resampledLabels.push(labels[idx]);
    }
    bootstrapped.push(computeAUROC(resampledScores, resampledLabels));
  }

  const mean = bootstrapped.reduce((s, v) => s + v, 0) / iterations;

  const allEqual = bootstrapped.every((v) => v === bootstrapped[0]);
  if (allEqual) {
    return { lower: mean, upper: mean, mean, ciWidth: 0 };
  }

  const sorted = [...bootstrapped].sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  const lowerIndex = Math.floor(iterations * (alpha / 2));
  const upperIndex = Math.ceil(iterations * (1 - alpha / 2)) - 1;

  return {
    lower: sorted[lowerIndex],
    upper: sorted[upperIndex],
    mean,
    ciWidth: sorted[upperIndex] - sorted[lowerIndex],
  };
}

/**
 * Mann-Whitney U test (Wilcoxon rank-sum test).
 * Returns the U statistic and a two-tailed p-value via normal approximation
 * with continuity correction and tie adjustment.
 */
export function mannWhitneyU(
  scores: number[],
  labels: boolean[],
): { uStatistic: number; pValue: number } {
  const n = scores.length;
  const buggyIndices: number[] = [];
  const cleanIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (labels[i]) buggyIndices.push(i);
    else cleanIndices.push(i);
  }

  const n1 = buggyIndices.length;
  const n2 = cleanIndices.length;

  if (n1 === 0 || n2 === 0) return { uStatistic: 0, pValue: 1 };

  const indexed = scores.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let pos = 0;
  let tieSum = 0;
  while (pos < indexed.length) {
    let end = pos;
    while (end < indexed.length && indexed[end].v === indexed[pos].v) end++;
    const tieLen = end - pos;
    const meanRank = (pos + end - 1) / 2 + 1;
    for (let k = pos; k < end; k++) {
      ranks[indexed[k].i] = meanRank;
    }
    if (tieLen > 1) {
      tieSum += tieLen * tieLen * tieLen - tieLen;
    }
    pos = end;
  }

  let R1 = 0;
  for (const i of buggyIndices) {
    R1 += ranks[i];
  }

  const U = R1 - (n1 * (n1 + 1)) / 2;
  const meanU = (n1 * n2) / 2;
  const total = n1 + n2;
  let variance = (n1 * n2 * (total + 1)) / 12;
  if (tieSum > 0) {
    variance = (n1 * n2 / 12) * ((total + 1) - tieSum / (total * (total - 1)));
  }
  const sigma = Math.sqrt(variance);

  const z = U < meanU ? (U + 0.5 - meanU) / sigma : (U - 0.5 - meanU) / sigma;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  return { uStatistic: U, pValue };
}
