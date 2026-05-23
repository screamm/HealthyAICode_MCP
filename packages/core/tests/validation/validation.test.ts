import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, spearmanCorrelation, computeAUROC } from '../../src/validation/correlation';
import { createSyntheticBenchmark } from '../../src/validation/defects4j-loader';
import { runValidation } from '../../src/validation/dataset-runner';

// ── pearsonCorrelation ────────────────────────────────────────────────────────

describe('pearsonCorrelation', () => {
  it('returns ~1.0 for perfectly correlated arrays', () => {
    const r = pearsonCorrelation([1, 2, 3], [1, 2, 3]);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('returns ~-1.0 for perfectly anti-correlated arrays', () => {
    const r = pearsonCorrelation([1, 2, 3], [3, 2, 1]);
    expect(r).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it('returns 0 when one array has zero variance (constant)', () => {
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('returns 0 for mismatched length arrays', () => {
    expect(pearsonCorrelation([1, 2], [1, 2, 3])).toBe(0);
  });
});

// ── spearmanCorrelation ───────────────────────────────────────────────────────

describe('spearmanCorrelation', () => {
  it('returns ~1.0 for monotonically increasing pair', () => {
    const rho = spearmanCorrelation([10, 20, 30], [1, 2, 3]);
    expect(rho).toBeCloseTo(1.0, 5);
  });

  it('returns ~-1.0 for monotonically decreasing pair', () => {
    const rho = spearmanCorrelation([1, 2, 3], [30, 20, 10]);
    expect(rho).toBeCloseTo(-1.0, 5);
  });

  it('handles tied ranks correctly (no exception thrown)', () => {
    const rho = spearmanCorrelation([1, 1, 2, 3], [1, 2, 3, 4]);
    expect(typeof rho).toBe('number');
    expect(isNaN(rho)).toBe(false);
  });
});

// ── computeAUROC ──────────────────────────────────────────────────────────────

describe('computeAUROC', () => {
  it('returns 1.0 for a perfect classifier (buggy always lower score)', () => {
    // scores 1,2 are buggy; 8,9 are clean — perfect separation
    const scores = [1, 2, 8, 9];
    const labels = [true, true, false, false];
    expect(computeAUROC(scores, labels)).toBeCloseTo(1.0, 5);
  });

  it('returns ~0.0 for an inverted classifier (buggy always higher score)', () => {
    // buggy files have HIGH health scores → worst possible predictor
    const scores = [9, 8, 2, 1];
    const labels = [true, true, false, false];
    expect(computeAUROC(scores, labels)).toBeCloseTo(0.0, 5);
  });

  it('returns 0.5 when there are no buggy files', () => {
    const scores = [5, 7, 9];
    const labels = [false, false, false];
    expect(computeAUROC(scores, labels)).toBe(0.5);
  });

  it('returns 0.5 when there are no clean files', () => {
    const scores = [3, 5, 7];
    const labels = [true, true, true];
    expect(computeAUROC(scores, labels)).toBe(0.5);
  });

  it('returns 0.5 for empty inputs', () => {
    expect(computeAUROC([], [])).toBe(0.5);
  });

  it('returns 0.5 for a random-level classifier (all tied)', () => {
    const scores = [5, 5, 5, 5];
    const labels = [true, false, true, false];
    // All scores tied → 0.5
    expect(computeAUROC(scores, labels)).toBeCloseTo(0.5, 5);
  });
});

// ── createSyntheticBenchmark ──────────────────────────────────────────────────

describe('createSyntheticBenchmark', () => {
  it('returns an array of 10 records (5 buggy + 5 clean)', () => {
    const records = createSyntheticBenchmark();
    expect(records).toHaveLength(10);
  });

  it('contains at least one hasBug:true record', () => {
    const records = createSyntheticBenchmark();
    expect(records.some(r => r.hasBug)).toBe(true);
  });

  it('contains at least one hasBug:false record', () => {
    const records = createSyntheticBenchmark();
    expect(records.some(r => !r.hasBug)).toBe(true);
  });

  it('all records have non-empty code', () => {
    const records = createSyntheticBenchmark();
    for (const r of records) {
      expect(r.code.trim().length).toBeGreaterThan(0);
    }
  });

  it('all records have language typescript', () => {
    const records = createSyntheticBenchmark();
    for (const r of records) {
      expect(r.language).toBe('typescript');
    }
  });
});

// ── runValidation ─────────────────────────────────────────────────────────────

describe('runValidation', () => {
  it('handles empty records array without throwing', () => {
    const report = runValidation([]);
    expect(report.totalFiles).toBe(0);
    expect(report.buggyFiles).toBe(0);
    expect(report.cleanFiles).toBe(0);
    expect(report.auroc).toBe(0.5);
    expect(report.fileResults).toHaveLength(0);
  });

  it('returns a report with correct totals for synthetic benchmark', () => {
    const records = createSyntheticBenchmark();
    const report = runValidation(records);
    expect(report.totalFiles).toBe(10);
    expect(report.buggyFiles).toBe(5);
    expect(report.cleanFiles).toBe(5);
  });

  it('AUROC > 0.5 on synthetic benchmark (smells detect buggy better than chance)', () => {
    const records = createSyntheticBenchmark();
    const report = runValidation(records);
    // The scorer should give lower health scores to the deeply-nested / complex buggy files
    expect(report.auroc).toBeGreaterThan(0.5);
  });

  it('healthSeparation is positive (clean files score higher than buggy)', () => {
    const records = createSyntheticBenchmark();
    const report = runValidation(records);
    expect(report.meanHealthClean).toBeGreaterThan(report.meanHealthBuggy);
    expect(report.healthSeparation).toBeGreaterThan(0);
  });

  it('interpretation is a non-empty string', () => {
    const records = createSyntheticBenchmark();
    const report = runValidation(records);
    expect(typeof report.interpretation).toBe('string');
    expect(report.interpretation.length).toBeGreaterThan(0);
  });

  it('fileResults contains all 10 entries with required fields', () => {
    const records = createSyntheticBenchmark();
    const report = runValidation(records);
    expect(report.fileResults).toHaveLength(10);
    for (const fr of report.fileResults) {
      expect(typeof fr.filePath).toBe('string');
      expect(typeof fr.healthScore).toBe('number');
      expect(fr.healthScore).toBeGreaterThanOrEqual(0);
      expect(fr.healthScore).toBeLessThanOrEqual(10);
      expect(typeof fr.hasBug).toBe('boolean');
      expect(typeof fr.bugCount).toBe('number');
    }
  });

  it('handles a single buggy record without throwing', () => {
    const report = runValidation([
      {
        filePath: 'single.ts',
        language: 'typescript',
        code: 'export function f() { return 1; }',
        hasBug: true,
      },
    ]);
    expect(report.totalFiles).toBe(1);
    expect(report.buggyFiles).toBe(1);
    expect(report.cleanFiles).toBe(0);
    expect(report.auroc).toBe(0.5); // no clean files → degenerate
  });
});
