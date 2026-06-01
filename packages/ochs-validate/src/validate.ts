/**
 * ochs-validate — standalone OCHS v0.1 score object validator.
 *
 * Two things are checked:
 *   1. Structural validity against the OCHS JSON schema (required fields,
 *      types, score range, valid smell-type names).
 *   2. Formula consistency: the reported `score` must equal
 *      max(1.0, 10 − Σ(weight_i × sqrt(count_i))) within the allowed tolerance.
 *
 * This module has NO runtime dependency on @healthy-ai-code/core; it embeds
 * the canonical weights from the OCHS v0.1 specification directly.
 */

import {
  OCHS_WEIGHTS,
  OCHS_FLOOR,
  ALL_SMELL_TYPES,
  AI_READY_THRESHOLD,
  AI_READY_THRESHOLD_WITH_AI_SATD,
  HEALTHY_THRESHOLD,
  PROBLEMATIC_THRESHOLD,
} from './weights';

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

/** A single biomarker / code-smell finding as it appears in an OCHS object. */
export interface SmellFinding {
  type: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  message?: string;
  line?: number;
  endLine?: number;
  functionName?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Shape of an OCHS score object submitted for validation. */
export interface OchsObject {
  ochsVersion: string;
  score: number;
  smells: SmellFinding[];
  filePath?: string;
  language?: string;
  loopComplete?: boolean;
  category?: string;
  metrics?: Record<string, unknown>;
  subscores?: Record<string, number>;
  [key: string]: unknown;
}

/** Result returned by {@link validateOchs}. */
export interface ValidationResult {
  /** True when the object passes both structural and formula checks. */
  valid: boolean;
  /** Human-readable error messages. Empty array when valid. */
  errors: string[];
  /** The score re-derived from the smell vector (undefined if smells could not be parsed). */
  derivedScore?: number;
  /** Category derived from the re-computed score. */
  derivedCategory?: 'green' | 'yellow' | 'red';
  /** Whether the derived score meets the AI-ready threshold (may differ from loopComplete in the object). */
  derivedLoopComplete?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Score formula (mirrors packages/core/src/scoring/calculator.ts)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Counts how many findings of each smell type are present, then applies
 * the OCHS formula: score = max(FLOOR, 10 − Σ(weight × √count)).
 *
 * Uses IEEE 754 double-precision arithmetic (JavaScript default).
 */
export function deriveScore(smells: SmellFinding[]): number {
  // Aggregate count per smell type
  const counts = new Map<string, number>();
  for (const s of smells) {
    if (typeof s.type === 'string') {
      counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    }
  }

  // Apply formula
  let penalty = 0;
  for (const [type, count] of counts) {
    const weight = OCHS_WEIGHTS[type];
    if (weight !== undefined && count > 0) {
      penalty += weight * Math.sqrt(count);
    }
    // Unknown smell types contribute 0 penalty (they are extensions or errors;
    // structural validation will flag unknown types separately).
  }

  return Math.max(OCHS_FLOOR, 10 - penalty);
}

/** Maps a numeric OCHS score to its category string. */
export function scoreToCategory(score: number): 'green' | 'yellow' | 'red' {
  if (score >= HEALTHY_THRESHOLD) return 'green';
  if (score >= PROBLEMATIC_THRESHOLD) return 'yellow';
  return 'red';
}

/** Determines the effective loopComplete flag from score and smell types. */
export function deriveLoopComplete(score: number, smells: SmellFinding[]): boolean {
  const hasAiSatd = smells.some((s) => s.type === 'AiAttributedSATD');
  const threshold = hasAiSatd ? AI_READY_THRESHOLD_WITH_AI_SATD : AI_READY_THRESHOLD;
  return score >= threshold;
}

// ──────────────────────────────────────────────────────────────────────────────
// Structural validation (minimal JSON Schema subset — no external libs needed)
// ──────────────────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateStructure(obj: unknown, errors: string[]): obj is OchsObject {
  if (!isObject(obj)) {
    errors.push('Input must be a JSON object.');
    return false;
  }

  // Required: ochsVersion
  if (typeof obj['ochsVersion'] !== 'string' || obj['ochsVersion'].trim() === '') {
    errors.push('Missing or invalid required field "ochsVersion" (must be a non-empty string).');
  } else {
    // Validate semver-like pattern: major.minor[.patch]
    if (!/^\d+\.\d+(\.\d+)?$/.test(obj['ochsVersion'] as string)) {
      errors.push(
        `"ochsVersion" value "${obj['ochsVersion']}" does not match the expected pattern "major.minor[.patch]".`
      );
    }
  }

  // Required: score
  if (typeof obj['score'] !== 'number') {
    errors.push('Missing or invalid required field "score" (must be a number).');
  } else {
    const score = obj['score'] as number;
    if (!Number.isFinite(score)) {
      errors.push('"score" must be a finite number.');
    } else if (score < 1.0 || score > 10.0) {
      errors.push(`"score" value ${score} is out of the valid OCHS range [1.0, 10.0].`);
    }
  }

  // Required: smells
  if (!Array.isArray(obj['smells'])) {
    errors.push('Missing or invalid required field "smells" (must be an array).');
  } else {
    const smells = obj['smells'] as unknown[];
    smells.forEach((s, i) => {
      if (!isObject(s)) {
        errors.push(`smells[${i}] must be an object.`);
        return;
      }
      if (typeof s['type'] !== 'string') {
        errors.push(`smells[${i}].type must be a string.`);
        return;
      }
      const smellType = s['type'] as string;
      if (!ALL_SMELL_TYPES.has(smellType)) {
        errors.push(
          `smells[${i}].type "${smellType}" is not a recognised OCHS v0.1 biomarker. ` +
            'Extension biomarkers are allowed but must not affect the OCHS v0.1 score computation. ' +
            'If this is an extension, the formula check may produce a mismatch.'
        );
      }
      // Validate severity if present
      if (s['severity'] !== undefined) {
        if (!['critical', 'high', 'medium', 'low'].includes(s['severity'] as string)) {
          errors.push(
            `smells[${i}].severity "${s['severity']}" is invalid. ` +
              'Must be one of: critical, high, medium, low.'
          );
        }
      }
      // Validate line numbers if present
      if (s['line'] !== undefined && (typeof s['line'] !== 'number' || s['line'] < 1)) {
        errors.push(`smells[${i}].line must be a positive integer.`);
      }
    });
  }

  // Optional: category enum check
  if (obj['category'] !== undefined) {
    if (!['green', 'yellow', 'red'].includes(obj['category'] as string)) {
      errors.push(
        `"category" value "${obj['category']}" is invalid. Must be one of: green, yellow, red.`
      );
    }
  }

  // Optional: loopComplete type check
  if (obj['loopComplete'] !== undefined && typeof obj['loopComplete'] !== 'boolean') {
    errors.push('"loopComplete" must be a boolean when present.');
  }

  return errors.length === 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Formula consistency check
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Default tolerance for floating-point score comparison.
 * IEEE 754 double arithmetic should make derivedScore == reportedScore for
 * any reasonable smell vector; we allow a small epsilon to guard against
 * serialisation rounding (e.g., a reporter that rounds to 1 decimal place).
 */
const DEFAULT_SCORE_TOLERANCE = 0.05;

function checkFormula(
  obj: OchsObject,
  errors: string[],
  tolerance: number
): { derivedScore: number; derivedCategory: 'green' | 'yellow' | 'red'; derivedLoopComplete: boolean } {
  const smells = obj.smells as SmellFinding[];
  const derivedScore = deriveScore(smells);
  const derivedCategory = scoreToCategory(derivedScore);
  const derivedLoopComplete = deriveLoopComplete(derivedScore, smells);

  const reportedScore = obj.score;
  const delta = Math.abs(derivedScore - reportedScore);
  if (delta > tolerance) {
    errors.push(
      `Formula mismatch: reported score ${reportedScore.toFixed(4)} but ` +
        `re-derived score from smell vector is ${derivedScore.toFixed(4)} ` +
        `(delta ${delta.toFixed(4)}, tolerance ${tolerance}). ` +
        'The score must equal max(1.0, 10 − Σ(weight × √count)) as specified in OCHS v0.1 §1.'
    );
  }

  return { derivedScore, derivedCategory, derivedLoopComplete };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main public API
// ──────────────────────────────────────────────────────────────────────────────

/** Options for {@link validateOchs}. */
export interface ValidateOptions {
  /**
   * Maximum allowed difference between the reported score and the score
   * re-derived from the smell vector. Defaults to 0.05.
   */
  scoreTolerance?: number;
  /**
   * When true, unknown smell types in the smells array are treated as errors
   * (default: false — unknown types produce a warning but not a hard failure,
   * since OCHS v0.1 allows extension biomarkers).
   */
  strictSmellTypes?: boolean;
}

/**
 * Validates an OCHS score object.
 *
 * @param input - Parsed JSON value to validate (pass the result of JSON.parse).
 * @param options - Optional validation settings.
 * @returns A {@link ValidationResult} describing validity and any errors.
 */
export function validateOchs(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const { scoreTolerance = DEFAULT_SCORE_TOLERANCE, strictSmellTypes = false } = options;

  const errors: string[] = [];

  // Step 1: structural validation
  const structurallyValid = validateStructure(input, errors);

  // Separate "extension smell" warnings from hard errors when not in strict mode
  if (!strictSmellTypes) {
    // Remove the extension-smell messages from errors and re-add them only as
    // informational noise (they don't block validity in lenient mode).
    // We already added them as errors above — filter them out.
    const isExtensionWarning = (msg: string) =>
      msg.includes('is not a recognised OCHS v0.1 biomarker');
    const extensionWarnings = errors.filter(isExtensionWarning);
    extensionWarnings.forEach((w) => {
      const idx = errors.indexOf(w);
      if (idx !== -1) errors.splice(idx, 1);
    });
    // Re-add as prefixed warnings so they still appear in the output
    for (const w of extensionWarnings) {
      errors.push('[warning] ' + w);
    }
  }

  // Only run formula check if the structure is usable
  const hardErrors = errors.filter((e) => !e.startsWith('[warning]'));
  let derivedScore: number | undefined;
  let derivedCategory: 'green' | 'yellow' | 'red' | undefined;
  let derivedLoopComplete: boolean | undefined;

  if (structurallyValid || (hardErrors.length === 0 && Array.isArray((input as OchsObject).smells))) {
    const formulaResult = checkFormula(input as OchsObject, errors, scoreTolerance);
    derivedScore = formulaResult.derivedScore;
    derivedCategory = formulaResult.derivedCategory;
    derivedLoopComplete = formulaResult.derivedLoopComplete;
  }

  const finalHardErrors = errors.filter((e) => !e.startsWith('[warning]'));
  return {
    valid: finalHardErrors.length === 0,
    errors,
    derivedScore,
    derivedCategory,
    derivedLoopComplete,
  };
}

/**
 * Convenience helper: validates a raw JSON string.
 * Returns a ValidationResult with a parse error if the string is not valid JSON.
 */
export function validateOchsJson(json: string, options: ValidateOptions = {}): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      valid: false,
      errors: [`JSON parse error: ${(e as Error).message}`],
    };
  }
  return validateOchs(parsed, options);
}
