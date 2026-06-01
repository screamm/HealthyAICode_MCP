/**
 * Unit tests for delongTest() — DeLong's test for two correlated ROC AUCs.
 *
 * The reference values below were produced by running the canonical
 * yandexdataschool/roc_comparison implementation (the fast Sun & Xu 2014
 * algorithm, which pROC and scikit-based comparisons agree with) in Python
 * with numpy 2.2.6 + scipy 1.15.3 on the exact same fixed datasets used here.
 *
 * Reference (CASE1, n=20, 10 positives / 10 negatives):
 *   aucA = 0.9700000000, aucB = 0.7400000000
 *   DeLong cov = [[0.0009111111, 0.0017666667], [0.0017666667, 0.0125888889]]
 *   z = 2.3038429434, p = 0.0212314615
 *
 * Reference (CASE3, n=12, tie-heavy):
 *   aucA = 0.9166666667, aucB = 0.7500000000
 *   z = 1.3912166873, p = 0.1641597285
 */

import { describe, it, expect } from 'vitest';
import { delongTest } from '../../src/validation/delong';

describe('delongTest — reference match against yandexdataschool/roc_comparison', () => {
  // CASE1: moderate-vs-weak classifier, no ties between the structural components.
  const labels1: Array<0 | 1> = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const scoreA1 = [
    0.1, 0.2, 0.15, 0.35, 0.25, 0.4, 0.3, 0.45, 0.5, 0.22,
    0.55, 0.6, 0.4, 0.7, 0.65, 0.5, 0.8, 0.75, 0.6, 0.9,
  ];
  const scoreB1 = [
    0.3, 0.25, 0.4, 0.5, 0.35, 0.45, 0.55, 0.3, 0.6, 0.5,
    0.45, 0.5, 0.35, 0.55, 0.6, 0.4, 0.65, 0.5, 0.55, 0.7,
  ];

  it('matches the reference AUCs, z, and p-value to ~3 decimals (CASE1)', () => {
    const r = delongTest(scoreA1, scoreB1, labels1);

    // AUCs are exact rationals — match tightly.
    expect(r.aucA).toBeCloseTo(0.97, 6);
    expect(r.aucB).toBeCloseTo(0.74, 6);
    expect(r.aucDiff).toBeCloseTo(0.23, 6);

    // z and p come through the normal-CDF approximation (~1.5e-7 error) — 3 decimals.
    expect(r.z).toBeCloseTo(2.3038429434, 3);
    expect(r.pValue).toBeCloseTo(0.0212314615, 3);
  });

  it('produces a 95% CI for the difference consistent with z (CASE1)', () => {
    const r = delongTest(scoreA1, scoreB1, labels1);
    // SE = aucDiff / z; CI = diff ± 1.95996 * SE.
    const se = r.aucDiff / r.z;
    const lo = r.aucDiff - 1.959963984540054 * se;
    const hi = r.aucDiff + 1.959963984540054 * se;
    expect(r.ci95[0]).toBeCloseTo(lo, 9);
    expect(r.ci95[1]).toBeCloseTo(hi, 9);
    // Difference is significant at 0.05 → CI excludes 0.
    expect(r.ci95[0]).toBeGreaterThan(0);
  });

  // CASE3: tie-heavy data — validates midrank handling against the reference.
  const labels3: Array<0 | 1> = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  const scoreA3 = [2, 2, 3, 3, 4, 1, 3, 4, 4, 5, 5, 5];
  const scoreB3 = [3, 2, 2, 4, 3, 3, 2, 4, 3, 4, 5, 4];

  it('matches the reference with tied scores (CASE3 midrank validation)', () => {
    const r = delongTest(scoreA3, scoreB3, labels3);
    expect(r.aucA).toBeCloseTo(0.9166666667, 6);
    expect(r.aucB).toBeCloseTo(0.75, 6);
    expect(r.z).toBeCloseTo(1.3912166873, 3);
    expect(r.pValue).toBeCloseTo(0.1641597285, 3);
  });
});

describe('delongTest — edge cases', () => {
  it('returns z=0, p=1 for two identical models (zero variance of difference)', () => {
    const labels: Array<0 | 1> = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = delongTest(scores, scores, labels);
    expect(r.aucA).toBeCloseTo(1, 9);
    expect(r.aucB).toBeCloseTo(1, 9);
    expect(r.aucDiff).toBe(0);
    expect(r.z).toBe(0);
    expect(r.pValue).toBe(1);
    expect(r.ci95).toEqual([0, 0]);
  });

  it('is symmetric: swapping A and B negates the difference and z, keeps p', () => {
    const labels: Array<0 | 1> = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const a = [2, 2, 3, 3, 4, 1, 3, 4, 4, 5, 5, 5];
    const b = [3, 2, 2, 4, 3, 3, 2, 4, 3, 4, 5, 4];
    const ab = delongTest(a, b, labels);
    const ba = delongTest(b, a, labels);
    expect(ba.aucDiff).toBeCloseTo(-ab.aucDiff, 9);
    expect(ba.z).toBeCloseTo(-ab.z, 6);
    expect(ba.pValue).toBeCloseTo(ab.pValue, 9);
  });

  it('throws on mismatched array lengths', () => {
    expect(() => delongTest([1, 2, 3], [1, 2], [0, 1, 1])).toThrow(/same length/);
  });

  it('throws on empty input', () => {
    expect(() => delongTest([], [], [])).toThrow(/non-empty/);
  });

  it('throws when there are no positive or no negative samples', () => {
    expect(() => delongTest([1, 2, 3], [1, 2, 3], [0, 0, 0])).toThrow(/at least one positive/);
    expect(() => delongTest([1, 2, 3], [1, 2, 3], [1, 1, 1])).toThrow(/at least one positive/);
  });

  it('throws on a label that is not 0 or 1', () => {
    expect(() => delongTest([1, 2, 3], [1, 2, 3], [0, 1, 2 as unknown as 0 | 1])).toThrow(/0 or 1/);
  });

  it('gives a high p-value (no significant difference) for two genuinely similar models', () => {
    const labels: Array<0 | 1> = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
    const a = [0.2, 0.3, 0.1, 0.4, 0.35, 0.25, 0.15, 0.3, 0.6, 0.7, 0.55, 0.8, 0.65, 0.5, 0.75, 0.9];
    const b = [0.22, 0.28, 0.12, 0.42, 0.33, 0.27, 0.16, 0.31, 0.58, 0.72, 0.54, 0.79, 0.66, 0.52, 0.74, 0.88];
    const r = delongTest(a, b, labels);
    expect(r.pValue).toBeGreaterThan(0.05);
  });
});
