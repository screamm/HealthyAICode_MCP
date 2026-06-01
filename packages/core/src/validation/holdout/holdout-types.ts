/**
 * Type definitions for the Sprint 55 holdout validation corpus.
 *
 * A "holdout" dataset is a curated set of source files with human-assigned
 * maintainability ratings and synthetic LLM-break-rate estimates used to
 * empirically validate the AI_READY_THRESHOLD (9.5) across Python, TypeScript,
 * and Go.
 */

import type { Language, SmellType } from '../../types';

/**
 * A single labelled source-file entry in the holdout corpus.
 *
 * `maintainabilityRating` is a human-assigned score in [1, 5]:
 *   1 = unreadable / unmaintainable
 *   2 = hard to maintain
 *   3 = acceptable
 *   4 = well-maintained
 *   5 = exemplary
 *
 * `llmBreakRate` is the fraction of N=5 simulated refactoring iterations
 * where the health score drops after an LLM edit (i.e. the LLM "broke" the
 * file).  In fixture data this is a synthetic value that reflects the
 * expected difficulty based on the smell profile; real measurements require
 * an actual LLM-agent loop.
 */
export interface HoldoutRecord {
  /** Absolute or repo-relative file path (used as metadata). */
  filePath: string;
  /** Detected language of the source file. */
  language: Language;
  /** Full source code of the file. */
  code: string;
  /** Health score as returned by `analyzeCode()` (1.0–10.0). */
  healthScore: number;
  /**
   * Human maintainability rating in [1, 5].
   * Use -1 as a sentinel value when no rating is available.
   */
  maintainabilityRating: number;
  /**
   * Fraction of LLM refactoring attempts that reduced the health score
   * (0.0 = never broke, 1.0 = always broke).  Synthetic in fixture data.
   */
  llmBreakRate: number;
  /** All smell types detected in the file at analysis time. */
  smellTypes: SmellType[];
  /** Optional free-text notes from the human rater. */
  raterNotes?: string;
}

/**
 * The complete holdout corpus, as produced by `buildHoldoutDataset()`.
 *
 * `scoreHistogram` groups files into fixed score bands to make distribution
 * skewness immediately visible.  Keys are:
 *   '8.0-8.4', '8.5-8.9', '9.0-9.4', '9.5-9.9', '10.0'
 */
export interface HoldoutDataset {
  /** ISO-8601 timestamp of corpus creation. */
  createdAt: string;
  /** Total number of records in the corpus. */
  totalFiles: number;
  /** All labelled file records. */
  records: HoldoutRecord[];
  /**
   * Distribution of files across score bands.
   * Values are file counts; missing bands have implicit count 0.
   */
  scoreHistogram: Record<string, number>;
}

/**
 * Per-file result from a simulated LLM-break-rate measurement.
 *
 * In production usage this is produced by running `analyzeCode()` →
 * LLM-edit → `analyzeCode()` N=5 times and counting the fraction of
 * iterations where the final score is lower than the starting score.
 * In tests and fixture data the value is assigned synthetically.
 */
export interface LlmBreakRateResult {
  /** File path corresponding to the `HoldoutRecord`. */
  filePath: string;
  /**
   * Fraction of iterations where the LLM edit reduced the health score.
   * In [0.0, 1.0].
   */
  breakRate: number;
  /** Number of iterations that were measured. */
  iterations: number;
}

/**
 * The raw label format expected in the JSON label file consumed by
 * `MaintainabilityRater`.
 */
export interface RawLabel {
  filePath: string;
  maintainabilityRating: number;
  llmBreakRate: number;
  raterNotes?: string;
}
