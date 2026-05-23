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
