/**
 * holdout-builder.ts — Sprint 55
 *
 * Builds a `HoldoutDataset` from a directory of source files by:
 *   1. Collecting .ts / .py / .go files recursively.
 *   2. Running `analyzeCode()` on each file.
 *   3. Filtering to the score range 8.0–10.0.
 *   4. Merging in human maintainability labels from a JSON label file.
 *   5. Computing a score-band histogram for distribution inspection.
 *
 * Files that cannot be read or are in unsupported languages are silently
 * skipped, consistent with the rest of the validation pipeline.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Dirent } from 'fs';
import { analyzeCode } from '../../index';
import { detectLanguage } from '../../language-detect';
import type { SmellType } from '../../types';
import type { HoldoutDataset, HoldoutRecord } from './holdout-types';
import { MaintainabilityRater } from './maintainability-rater';

/** Default minimum score for a file to be included in the holdout corpus. */
const DEFAULT_MIN_SCORE = 8.0;

/** Extensions collected for holdout analysis. */
const HOLDOUT_EXTENSIONS = new Set(['.ts', '.py', '.go']);

/** Score band keys in display order. */
const SCORE_BANDS = ['8.0-8.4', '8.5-8.9', '9.0-9.4', '9.5-9.9', '10.0'] as const;

/** Assigns a file to one of the fixed score-band keys. */
function scoreBand(score: number): string {
  if (score >= 10.0) return '10.0';
  if (score >= 9.5) return '9.5-9.9';
  if (score >= 9.0) return '9.0-9.4';
  if (score >= 8.5) return '8.5-8.9';
  return '8.0-8.4';
}

/** Returns true when the directory should be traversed. */
function isTraversable(name: string): boolean {
  return !name.startsWith('.') && name !== 'node_modules';
}

/** Recursively collects holdout source files (.ts, .py, .go). */
async function collectHoldoutFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: 'utf-8' }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && isTraversable(entry.name)) {
        await walk(full);
      } else if (
        entry.isFile() &&
        HOLDOUT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

/** Builds an empty dataset (used when the source dir doesn't exist). */
function buildEmptyDataset(): HoldoutDataset {
  const histogram: Record<string, number> = {};
  for (const band of SCORE_BANDS) {
    histogram[band] = 0;
  }
  return {
    createdAt: new Date().toISOString(),
    totalFiles: 0,
    records: [],
    scoreHistogram: histogram,
  };
}

/**
 * Options for `buildHoldoutDataset`.
 */
export interface BuildHoldoutDatasetOptions {
  /**
   * Minimum health score for a file to be included in the corpus.
   * Defaults to 8.0 (the sprint-55 decision zone).
   * Pass 0 to include all files regardless of score (needed for full-range
   * ECE/ROC validation against the complete defective/clean spectrum).
   */
  minScore?: number;
}

/**
 * Builds a `HoldoutDataset` from `sourceDir` and a label JSON file.
 *
 * @param sourceDir   Directory to scan recursively for .ts/.py/.go files.
 * @param labelFile   Path to a JSON label file in the format understood by
 *                    `MaintainabilityRater`.  The file must exist; a missing
 *                    or malformed label file causes this function to throw.
 * @param options     Optional configuration (see `BuildHoldoutDatasetOptions`).
 * @returns           A populated `HoldoutDataset`.  Files with score below
 *                    `options.minScore` (default 8.0) are excluded; unlabelled
 *                    files receive a `maintainabilityRating` of -1 (sentinel).
 *
 * @throws {Error}              When `labelFile` does not exist.
 * @throws {SyntaxError}        When `labelFile` contains invalid JSON.
 * @throws {RatingValidationError} When any label entry has invalid field values.
 */
export async function buildHoldoutDataset(
  sourceDir: string,
  labelFile: string,
  options: BuildHoldoutDatasetOptions = {},
): Promise<HoldoutDataset> {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  // ── 1. Read label file (must exist) ──────────────────────────────────────
  let rawJson: string;
  try {
    rawJson = await fs.readFile(labelFile, 'utf-8');
  } catch (err) {
    throw new Error(
      `Label file not found or unreadable: "${labelFile}". ` +
        `Original error: ${(err as Error).message}`,
    );
  }

  const rater = new MaintainabilityRater(rawJson);

  // ── 2. Collect source files ───────────────────────────────────────────────
  let filePaths: string[];
  try {
    filePaths = await collectHoldoutFiles(sourceDir);
  } catch {
    // sourceDir doesn't exist or can't be read → return empty dataset
    return buildEmptyDataset();
  }

  if (filePaths.length === 0) {
    return buildEmptyDataset();
  }

  // ── 3. Analyse each file and filter by score ──────────────────────────────
  const records: HoldoutRecord[] = [];

  for (const filePath of filePaths) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const language = detectLanguage(filePath);
      if (language === 'unsupported') continue;

      const result = analyzeCode(code, language, filePath);

      if (result.score < minScore) continue;

      // ── 4. Merge labels ────────────────────────────────────────────────────
      const label = rater.getLabel(filePath);

      records.push({
        filePath,
        language,
        code,
        healthScore: result.score,
        maintainabilityRating: label?.maintainabilityRating ?? -1,
        llmBreakRate: label?.llmBreakRate ?? 0,
        smellTypes: result.smells.map((s) => s.type) as SmellType[],
        raterNotes: label?.raterNotes,
      });
    } catch {
      // Skip unreadable files without failing the whole build
    }
  }

  // ── 5. Build score-band histogram ────────────────────────────────────────
  const histogram: Record<string, number> = {};
  for (const band of SCORE_BANDS) {
    histogram[band] = 0;
  }
  for (const record of records) {
    const band = scoreBand(record.healthScore);
    histogram[band] = (histogram[band] ?? 0) + 1;
  }

  return {
    createdAt: new Date().toISOString(),
    totalFiles: records.length,
    records,
    scoreHistogram: histogram,
  };
}
