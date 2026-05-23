// packages/core/src/ai-audit/statistics.ts
import type { BenchmarkEntry } from './types';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function topN<T>(items: T[], n: number): Array<{ item: T; count: number }> {
  const freq = new Map<T, number>();
  for (const item of items) freq.set(item, (freq.get(item) ?? 0) + 1);
  return [...freq.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([item, count]) => ({ item, count }));
}

export function isOutlier(value: number, baseline: number, sigma: number, threshold: number): boolean {
  return value < baseline - threshold * sigma;
}

export interface Baseline {
  mean: number;
  sigma: number;
}

export function computeBaseline(values: number[]): Baseline {
  return { mean: mean(values), sigma: stddev(values) };
}

export function flagOutliers(
  entries: BenchmarkEntry[],
  baseline: Baseline,
  sigmaThreshold: number,
): BenchmarkEntry[] {
  return entries.filter(e =>
    isOutlier(e.health_score_ai, baseline.mean, baseline.sigma, sigmaThreshold),
  );
}
