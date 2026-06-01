/**
 * MaintainabilityRater — loads and validates human-assigned maintainability
 * ratings from a JSON label file used by the Sprint 55 holdout corpus.
 *
 * The label file schema is:
 *   Array<{ filePath: string; maintainabilityRating: number; llmBreakRate: number; raterNotes?: string }>
 *
 * Validation rules:
 *   - `maintainabilityRating` MUST be an integer in [1, 5]
 *   - `llmBreakRate` MUST be a number in [0.0, 1.0]
 *
 * Violations throw `RatingValidationError` with a descriptive message that
 * includes the offending file path.
 */

import type { RawLabel } from './holdout-types';

/** Thrown when a label entry fails validation checks. */
export class RatingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RatingValidationError';
  }
}

const MIN_RATING = 1;
const MAX_RATING = 5;
const MIN_BREAK_RATE = 0.0;
const MAX_BREAK_RATE = 1.0;

/** Validates a single raw label entry and throws on invalid values. */
function validateLabel(label: RawLabel): void {
  if (
    typeof label.maintainabilityRating !== 'number' ||
    !Number.isInteger(label.maintainabilityRating) ||
    label.maintainabilityRating < MIN_RATING ||
    label.maintainabilityRating > MAX_RATING
  ) {
    throw new RatingValidationError(
      `Invalid maintainabilityRating ${JSON.stringify(label.maintainabilityRating)} for file "${label.filePath}". ` +
        `Expected an integer in [${MIN_RATING}, ${MAX_RATING}].`,
    );
  }

  if (
    typeof label.llmBreakRate !== 'number' ||
    isNaN(label.llmBreakRate) ||
    label.llmBreakRate < MIN_BREAK_RATE ||
    label.llmBreakRate > MAX_BREAK_RATE
  ) {
    throw new RatingValidationError(
      `Invalid llmBreakRate ${JSON.stringify(label.llmBreakRate)} for file "${label.filePath}". ` +
        `Expected a number in [${MIN_BREAK_RATE}, ${MAX_BREAK_RATE}].`,
    );
  }
}

/**
 * Loads and validates maintainability labels from a JSON array.
 *
 * Throws `RatingValidationError` for any entry that fails validation.
 * Throws `SyntaxError` (via `JSON.parse`) if the input is malformed JSON.
 * The caller is responsible for reading the raw JSON string from disk.
 */
export class MaintainabilityRater {
  private readonly labelMap: Map<string, RawLabel>;

  /**
   * @param rawJson  The raw JSON string of the label file.
   * @throws {SyntaxError} When `rawJson` is not valid JSON.
   * @throws {RatingValidationError} When any label entry has invalid field values.
   */
  constructor(rawJson: string) {
    const parsed: unknown = JSON.parse(rawJson);

    if (!Array.isArray(parsed)) {
      throw new RatingValidationError(
        `Label file must be a JSON array; got ${typeof parsed}.`,
      );
    }

    this.labelMap = new Map();

    for (const entry of parsed) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).filePath !== 'string'
      ) {
        throw new RatingValidationError(
          `Each label entry must be an object with a "filePath" string field. Got: ${JSON.stringify(entry)}`,
        );
      }

      const label = entry as RawLabel;
      validateLabel(label);
      this.labelMap.set(label.filePath, label);
    }
  }

  /**
   * Returns the validated label for the given file path, or `undefined` if
   * the path is not found in the label file.
   *
   * Paths are compared exactly as stored (no normalisation is applied).
   * When the exact path is not found, the method also tries the base-name
   * (last path segment) to accommodate absolute vs. relative path mismatches
   * commonly encountered when reading files from fixtures.
   */
  getLabel(filePath: string): RawLabel | undefined {
    if (this.labelMap.has(filePath)) {
      return this.labelMap.get(filePath);
    }

    // Fallback: try to match on the base-name portion only
    const base = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
    for (const [key, value] of this.labelMap) {
      const keyBase = key.replace(/\\/g, '/').split('/').pop() ?? '';
      if (keyBase === base) {
        return value;
      }
    }

    return undefined;
  }

  /** Returns the total number of labelled entries loaded. */
  get size(): number {
    return this.labelMap.size;
  }

  /** Returns all file paths present in the label file. */
  get filePaths(): string[] {
    return Array.from(this.labelMap.keys());
  }
}
