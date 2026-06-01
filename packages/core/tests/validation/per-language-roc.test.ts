/**
 * Unit tests for computePerLanguageRocThresholds() — per-language ROC thresholds.
 *
 * Sprint 55 acceptance criteria:
 *   Test 1: synthetic Python dataset with clear separation → rocOptimalThreshold in
 *            correct interval, youdenJ > 0.7.
 *   Test 2: dataset with only one language → exactly one result in output array.
 *   Test 3: language with < 5 buggy files → excluded from output.
 */

import { describe, it, expect } from 'vitest';
import { computePerLanguageRocThresholds } from '../../src/validation/per-language-roc';
import type { RocThresholdResult } from '../../src/validation/per-language-roc';
import type { BugRecord } from '../../src/validation/dataset-runner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBugRecord(language: string, hasBug: boolean): BugRecord {
  return {
    filePath: `${language}_${Math.random().toString(36).slice(2)}.ts`,
    language: language as BugRecord['language'],
    code: 'export function f() { return 1; }',
    hasBug,
  };
}

function makeFileResult(healthScore: number, hasBug: boolean, index = 0) {
  return {
    filePath: `file_${index}.ts`,
    healthScore,
    hasBug,
    bugCount: hasBug ? 1 : 0,
  };
}

// ── Test 1: clear separation — synthetic Python dataset ───────────────────────

describe('computePerLanguageRocThresholds — clear separation', () => {
  it('returns rocOptimalThreshold between buggy and clean score clusters, youdenJ > 0.7', () => {
    // Buggy files: score < 7.0; clean files: score > 8.5 → clear separation
    const records: BugRecord[] = [
      // 8 buggy Python files (low scores)
      ...Array.from({ length: 8 }, () => makeBugRecord('python', true)),
      // 8 clean Python files (high scores)
      ...Array.from({ length: 8 }, () => makeBugRecord('python', false)),
    ];

    const fileResults = [
      // Buggy files score 5.0–6.5
      ...Array.from({ length: 8 }, (_, i) => makeFileResult(5.0 + i * 0.2, true, i)),
      // Clean files score 9.0–9.7
      ...Array.from({ length: 8 }, (_, i) => makeFileResult(9.0 + i * 0.1, false, i + 8)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);

    expect(results).toHaveLength(1);
    const pythonResult: RocThresholdResult = results[0];

    expect(pythonResult.language).toBe('python');
    // Threshold should be somewhere between the top buggy score (6.4) and
    // the lowest clean score (9.0); accept the full interval [5.0, 9.0).
    expect(pythonResult.rocOptimalThreshold).toBeGreaterThanOrEqual(5.0);
    expect(pythonResult.rocOptimalThreshold).toBeLessThan(9.0);
    expect(pythonResult.youdenJ).toBeGreaterThan(0.7);
    expect(pythonResult.sampleSize).toBe(16);
    expect(pythonResult.buggyCount).toBe(8);
  });

  it('returns youdenJ = 1.0 for a perfectly separable dataset', () => {
    const records: BugRecord[] = [
      ...Array.from({ length: 6 }, () => makeBugRecord('go', true)),
      ...Array.from({ length: 6 }, () => makeBugRecord('go', false)),
    ];
    const fileResults = [
      // Buggy: all score 3.0
      ...Array.from({ length: 6 }, (_, i) => makeFileResult(3.0, true, i)),
      // Clean: all score 9.0
      ...Array.from({ length: 6 }, (_, i) => makeFileResult(9.0, false, i + 6)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    expect(results).toHaveLength(1);
    expect(results[0].youdenJ).toBeCloseTo(1.0, 5);
  });
});

// ── Test 2: single language ───────────────────────────────────────────────────

describe('computePerLanguageRocThresholds — single language', () => {
  it('returns exactly one result when the dataset contains only TypeScript', () => {
    const records: BugRecord[] = [
      ...Array.from({ length: 7 }, () => makeBugRecord('typescript', true)),
      ...Array.from({ length: 7 }, () => makeBugRecord('typescript', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 7 }, (_, i) => makeFileResult(4.0 + i * 0.3, true, i)),
      ...Array.from({ length: 7 }, (_, i) => makeFileResult(8.5 + i * 0.1, false, i + 7)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('typescript');
  });

  it('includes sampleSize, buggyCount, and alvesPercentile90 in the result', () => {
    const records: BugRecord[] = [
      ...Array.from({ length: 5 }, () => makeBugRecord('typescript', true)),
      ...Array.from({ length: 5 }, () => makeBugRecord('typescript', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 5 }, (_, i) => makeFileResult(4.0, true, i)),
      ...Array.from({ length: 5 }, (_, i) => makeFileResult(9.0, false, i + 5)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    const r = results[0];
    expect(typeof r.sampleSize).toBe('number');
    expect(typeof r.buggyCount).toBe('number');
    expect(typeof r.alvesPercentile90).toBe('number');
    expect(typeof r.thresholdDelta).toBe('number');
  });
});

// ── Test 3: insufficient buggy files → excluded ────────────────────────────────

describe('computePerLanguageRocThresholds — insufficient data excluded', () => {
  it('excludes a language with fewer than 5 buggy files', () => {
    // Python: 3 buggy, 10 clean → below MIN_BUGGY=5, should be excluded
    const records: BugRecord[] = [
      ...Array.from({ length: 3 }, () => makeBugRecord('python', true)),
      ...Array.from({ length: 10 }, () => makeBugRecord('python', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 3 }, (_, i) => makeFileResult(4.0, true, i)),
      ...Array.from({ length: 10 }, (_, i) => makeFileResult(9.0, false, i + 3)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    expect(results).toHaveLength(0);
  });

  it('excludes a language with fewer than 5 clean files', () => {
    // Go: 10 buggy, 3 clean → below MIN_CLEAN=5, should be excluded
    const records: BugRecord[] = [
      ...Array.from({ length: 10 }, () => makeBugRecord('go', true)),
      ...Array.from({ length: 3 }, () => makeBugRecord('go', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 10 }, (_, i) => makeFileResult(4.0, true, i)),
      ...Array.from({ length: 3 }, (_, i) => makeFileResult(9.0, false, i + 10)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    expect(results).toHaveLength(0);
  });

  it('returns only the languages that have sufficient data when mixed', () => {
    // TypeScript: 7+7 → included; Go: 2+7 → excluded
    const records: BugRecord[] = [
      ...Array.from({ length: 7 }, () => makeBugRecord('typescript', true)),
      ...Array.from({ length: 7 }, () => makeBugRecord('typescript', false)),
      ...Array.from({ length: 2 }, () => makeBugRecord('go', true)),
      ...Array.from({ length: 7 }, () => makeBugRecord('go', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 7 }, (_, i) => makeFileResult(4.0, true, i)),
      ...Array.from({ length: 7 }, (_, i) => makeFileResult(9.0, false, i + 7)),
      ...Array.from({ length: 2 }, (_, i) => makeFileResult(4.0, true, i + 14)),
      ...Array.from({ length: 7 }, (_, i) => makeFileResult(9.0, false, i + 16)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('typescript');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('computePerLanguageRocThresholds — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(computePerLanguageRocThresholds([], [])).toEqual([]);
  });

  it('thresholdDelta equals rocOptimal minus alvesP90', () => {
    const records: BugRecord[] = [
      ...Array.from({ length: 6 }, () => makeBugRecord('python', true)),
      ...Array.from({ length: 6 }, () => makeBugRecord('python', false)),
    ];
    const fileResults = [
      ...Array.from({ length: 6 }, (_, i) => makeFileResult(3.0 + i * 0.5, true, i)),
      ...Array.from({ length: 6 }, (_, i) => makeFileResult(8.0 + i * 0.3, false, i + 6)),
    ];

    const results = computePerLanguageRocThresholds(records, fileResults);
    if (results.length > 0) {
      const r = results[0];
      expect(r.thresholdDelta).toBeCloseTo(r.rocOptimalThreshold - r.alvesPercentile90, 5);
    }
  });
});
