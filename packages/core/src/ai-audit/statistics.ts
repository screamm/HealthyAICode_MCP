// packages/core/src/ai-audit/statistics.ts
import type { BenchmarkEntry } from './types';

/** Arithmetic mean of a numeric array. Returns 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Population standard deviation of a numeric array.
 * Returns 0 when fewer than two values are supplied (no spread to measure).
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Return the `n` most frequent items, descending by occurrence count.
 * Each result pairs the original item with how many times it appeared.
 */
export function topN<T>(items: T[], n: number): Array<{ item: T; count: number }> {
  const freq = new Map<T, number>();
  for (const item of items) freq.set(item, (freq.get(item) ?? 0) + 1);
  return [...freq.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([item, count]) => ({ item, count }));
}

/**
 * True when `value` lies more than `threshold` standard deviations below `baseline`
 * (a one-sided lower-tail outlier check used for regression detection).
 */
export function isOutlier(value: number, baseline: number, sigma: number, threshold: number): boolean {
  return value < baseline - threshold * sigma;
}

/** Summary statistics (mean and standard deviation) describing a value distribution. */
export interface Baseline {
  mean: number;
  sigma: number;
}

/** Build a {@link Baseline} (mean + standard deviation) from a set of values. */
export function computeBaseline(values: number[]): Baseline {
  return { mean: mean(values), sigma: stddev(values) };
}

/** Return the entries whose AI health score is a lower-tail outlier against `baseline`. */
export function flagOutliers(
  entries: BenchmarkEntry[],
  baseline: Baseline,
  sigmaThreshold: number,
): BenchmarkEntry[] {
  return entries.filter(e =>
    isOutlier(e.health_score_ai, baseline.mean, baseline.sigma, sigmaThreshold),
  );
}
