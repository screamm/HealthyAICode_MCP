/**
 * Integration test for the Sprint 55 holdout validation pipeline.
 *
 * Tests:
 *   1. `buildHoldoutDataset()` runs against the fixture directory and
 *      returns ≥ 40 records (Sprint 55 requirement: real labeled corpus).
 *   2. Converting HoldoutRecord[] to BugRecord[] and running `runValidation()`
 *      produces a ValidationReport where `ece` and `perLanguageRocThresholds`
 *      are defined.
 *
 * The fixture directory now contains 145+ real OSS files (psf/requests,
 * golang/tools, sindresorhus/execa), so each `buildHoldoutDataset` call
 * can take up to 15 seconds on a cold run.  A shared `beforeAll` is used
 * to avoid re-running the analysis for each `it` block.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { buildHoldoutDataset } from '../../src/validation/holdout/holdout-builder';
import { runValidation } from '../../src/validation/dataset-runner';
import { computeECE } from '../../src/validation/ece';
import { computePerLanguageRocThresholds } from '../../src/validation/per-language-roc';
import type { HoldoutDataset } from '../../src/validation/holdout/holdout-types';
import type { BugRecord } from '../../src/validation/dataset-runner';

/** Resolve the fixture directory relative to this test file's location. */
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/holdout');
const LABEL_FILE = path.join(FIXTURE_DIR, 'corpus-labels.json');

/** Shared dataset built once for all tests in this file. */
let sharedDataset: HoldoutDataset;
let sharedBugRecords: BugRecord[];

// Build dataset once — avoids repeated 7-15s calls per `it` block.
// Timeout: 60s to accommodate the 145-file fixture corpus.
beforeAll(async () => {
  sharedDataset = await buildHoldoutDataset(FIXTURE_DIR, LABEL_FILE);
  sharedBugRecords = sharedDataset.records.map((r) => ({
    filePath: r.filePath,
    language: r.language,
    code: r.code,
    hasBug: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3,
    bugCount: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3 ? 1 : 0,
  }));
}, 60_000);

// ── Test 1: buildHoldoutDataset returns ≥ 40 records ─────────────────────────

describe('buildHoldoutDataset — fixture integration', () => {
  it('returns at least 40 records from the holdout fixture directory (Sprint 55 requirement)', () => {
    expect(sharedDataset.records.length).toBeGreaterThanOrEqual(40);
    expect(sharedDataset.totalFiles).toBe(sharedDataset.records.length);
    expect(typeof sharedDataset.createdAt).toBe('string');
    expect(sharedDataset.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('scoreHistogram has the expected band keys', () => {
    const bands = ['8.0-8.4', '8.5-8.9', '9.0-9.4', '9.5-9.9', '10.0'];
    for (const band of bands) {
      expect(sharedDataset.scoreHistogram).toHaveProperty(band);
      expect(typeof sharedDataset.scoreHistogram[band]).toBe('number');
    }
  });

  it('all records have valid healthScore in [1.0, 10.0]', () => {
    for (const record of sharedDataset.records) {
      expect(record.healthScore).toBeGreaterThanOrEqual(1.0);
      expect(record.healthScore).toBeLessThanOrEqual(10.0);
    }
  });

  it('covers at least two languages', () => {
    const languages = new Set(sharedDataset.records.map((r) => r.language));
    expect(languages.size).toBeGreaterThanOrEqual(2);
  });
});

// ── Test 2: runValidation with ECE and per-language ROC ───────────────────────

describe('runValidation with holdout corpus — ECE and ROC thresholds', () => {
  it('produces a ValidationReport with ece defined when records ≥ 10', () => {
    const report = runValidation(sharedBugRecords);

    if (report.fileResults.length >= 10) {
      const eceResult = computeECE(report.fileResults);
      expect(typeof eceResult.ece).toBe('number');
      expect(eceResult.ece).toBeGreaterThanOrEqual(0);
      expect(eceResult.ece).toBeLessThanOrEqual(1);
      expect(Array.isArray(eceResult.bins)).toBe(true);
    }

    expect(report.totalFiles).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.fileResults)).toBe(true);
  });

  it('produces perLanguageRocThresholds for languages with sufficient coverage', () => {
    const report = runValidation(sharedBugRecords);
    const rocResults = computePerLanguageRocThresholds(sharedBugRecords, report.fileResults);

    // rocResults may be empty if no language has MIN_BUGGY=5 files with hasBug=true,
    // but the call must not throw and must return an array.
    expect(Array.isArray(rocResults)).toBe(true);

    for (const r of rocResults) {
      expect(typeof r.language).toBe('string');
      expect(typeof r.rocOptimalThreshold).toBe('number');
      expect(typeof r.youdenJ).toBe('number');
      expect(r.youdenJ).toBeGreaterThanOrEqual(-1);
      expect(r.youdenJ).toBeLessThanOrEqual(1);
      expect(typeof r.alvesPercentile90).toBe('number');
      expect(typeof r.thresholdDelta).toBe('number');
      expect(typeof r.sampleSize).toBe('number');
      expect(typeof r.buggyCount).toBe('number');
    }
  });

  it('ValidationReport contains the basic required fields', () => {
    const report = runValidation(sharedBugRecords);

    expect(typeof report.totalFiles).toBe('number');
    expect(typeof report.pearsonR).toBe('number');
    expect(typeof report.spearmanRho).toBe('number');
    expect(typeof report.auroc).toBe('number');
    expect(report.auroc).toBeGreaterThanOrEqual(0);
    expect(report.auroc).toBeLessThanOrEqual(1);
    expect(typeof report.interpretation).toBe('string');
    expect(Array.isArray(report.fileResults)).toBe(true);
  });
});

// ── Test 3: MaintainabilityRater errors ───────────────────────────────────────

describe('buildHoldoutDataset — error handling', () => {
  it('throws when labelFile does not exist', async () => {
    await expect(
      buildHoldoutDataset(FIXTURE_DIR, '/nonexistent/path/labels.json'),
    ).rejects.toThrow();
  }, 10_000);

  it('returns empty dataset when sourceDir does not exist', async () => {
    // We need a valid label file but a missing source dir
    const dataset = await buildHoldoutDataset('/nonexistent/source/dir', LABEL_FILE);
    expect(dataset.totalFiles).toBe(0);
    expect(dataset.records).toHaveLength(0);
  }, 10_000);
});
