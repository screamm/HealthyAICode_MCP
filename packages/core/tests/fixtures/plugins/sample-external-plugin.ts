/**
 * Sample External Plugin: TodoDensitySmell — Sprint 60 (plugin-freeze)
 *
 * Demonstrates how a third-party plugin author registers a BiomarkerPlugin v0.1.
 *
 * This plugin detects files with a high density of TODO/FIXME/HACK/HACK comments
 * relative to their line count (density > 3 per 100 lines triggers the smell).
 *
 * It uses a CUSTOM smell type ("TodoDensity") declared in smellWeights, so
 * the scoring engine uses the plugin-declared weight of 0.6 (not a core weight).
 *
 * ─────────────────────────────────────────────────────────────────
 * HOW TO USE THIS AS AN EXTERNAL PLUGIN:
 *
 *   // In your project's setup / entry point:
 *   import { registerPlugin } from '@healthy-ai-code/core/plugins/biomarker-plugin';
 *   import { todoDensityPlugin } from './sample-external-plugin';
 *
 *   registerPlugin(todoDensityPlugin);
 *
 *   // That's it — the plugin now participates in every analyzeCode() call.
 * ─────────────────────────────────────────────────────────────────
 *
 * FIXTURES (used by conformance tests):
 *  - TP: file with >3 TODOs per 100 lines → emits TodoDensity smell
 *  - TN: file with 0 TODOs → no smell
 *
 * NOTE: This file lives under tests/fixtures/ and uses RELATIVE imports
 * (not @healthy-ai-code/core) to satisfy the HARD RULE that new files use
 * relative paths until integrated by the Foundation phase.
 */

import type { BiomarkerPlugin } from '../../../src/plugins/biomarker-plugin';
import type { Language, Smell } from '../../../src/types';

// ─── Custom smell type name ────────────────────────────────────────────────────

/**
 * Custom smell type emitted by this plugin.
 * This string is NOT in the core SmellType union — it is declared and owned by this plugin.
 * The type assertion bypasses the TypeScript union check, which is intentional for external plugins
 * that extend beyond core types. Core SmellType names remain inviolate.
 */
const TODO_DENSITY_SMELL_TYPE = 'TodoDensity' as Smell['type'];

/** Threshold: TODO-family comments per 100 lines that triggers the smell. */
const TODO_DENSITY_THRESHOLD = 3;

/** Regex matching TODO / FIXME / HACK / XXX annotations (case-insensitive). */
const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/gi;

// ─── Detection Logic ───────────────────────────────────────────────────────────

/**
 * Counts TODO/FIXME/HACK/XXX occurrences in source code and emits a
 * TodoDensity smell if the density exceeds the threshold.
 */
function detectTodoDensity(code: string, language: Language, filePath?: string): Smell[] {
  // Count source lines (trim to avoid counting trailing newlines)
  const lines = code.split('\n');
  const lineCount = lines.length;

  // Skip very short files — density is unreliable below 10 lines
  if (lineCount < 10) {
    return [];
  }

  // Count TODO-family matches
  const matches = code.match(TODO_PATTERN);
  const todoCount = matches ? matches.length : 0;

  if (todoCount === 0) {
    return [];
  }

  const density = (todoCount / lineCount) * 100;

  if (density <= TODO_DENSITY_THRESHOLD) {
    return [];
  }

  // Find the line of the first TODO occurrence for smell location
  let firstTodoLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (TODO_PATTERN.test(lines[i]!)) {
      firstTodoLine = i + 1; // 1-indexed
      break;
    }
    TODO_PATTERN.lastIndex = 0; // reset global regex state
  }
  TODO_PATTERN.lastIndex = 0;

  return [
    {
      type: TODO_DENSITY_SMELL_TYPE,
      severity: density > 8 ? 'high' : density > 5 ? 'medium' : 'low',
      line: firstTodoLine,
      description:
        `TodoDensity: ${todoCount} TODO/FIXME/HACK annotations in ${lineCount} lines ` +
        `(${density.toFixed(1)} per 100 lines, threshold: ${TODO_DENSITY_THRESHOLD}).` +
        (filePath ? ` File: ${filePath}` : ''),
      suggestion:
        'Resolve or track these annotations in your issue tracker. ' +
        'High TODO density correlates with unfinished work and technical debt accumulation.',
      metricValue: parseFloat(density.toFixed(2)),
    },
  ];
}

// ─── Plugin Export ─────────────────────────────────────────────────────────────

/**
 * The todoDensityPlugin: a complete, conformance-valid BiomarkerPlugin v0.1.
 *
 * To register: `registerPlugin(todoDensityPlugin);`
 */
export const todoDensityPlugin: BiomarkerPlugin = {
  name: 'todo-density',
  version: '0.1.0',
  metadata: {
    // Applies to all languages — TODO comments appear across all code
    supportedLanguages: 'all',
    // Custom weight: 0.6 (comparable to SATD weight in core).
    // Only used for scoring because 'TodoDensity' is NOT a core SmellType.
    smellWeights: {
      TodoDensity: 0.6,
    },
    description:
      'Detects files with a high density of TODO/FIXME/HACK/XXX annotations ' +
      '(>3 per 100 lines). High TODO density correlates with accumulated technical debt.',
    author: 'External Plugin Author',
    license: 'MIT',
  },
  detect: detectTodoDensity,
};

// ─── Fixtures (exported for conformance test suite) ────────────────────────────

/** True-positive fixture: code with high TODO density (>3 per 100 lines). */
export const TP_CODE_HIGH_TODO_DENSITY = `
// This module manages the payment processing pipeline.
// TODO: Add retry logic for failed transactions
// TODO: Implement idempotency keys
// TODO: Add proper error types
// TODO: Handle network timeouts gracefully
// FIXME: Race condition in concurrent payment processing
// HACK: Temporary workaround for currency rounding
// XXX: Remove this after the Q3 refactoring

function processPayment(amount: number, currency: string): Promise<void> {
  // TODO: Validate currency against supported list
  return Promise.resolve();
}

function refundPayment(transactionId: string): Promise<void> {
  // FIXME: This doesn't handle partial refunds
  return Promise.resolve();
}

function calculateFees(amount: number): number {
  return amount * 0.029; // TODO: Make fee configurable
}
`.trim();

/** True-negative fixture: clean code with zero TODO annotations. */
export const TN_CODE_NO_TODOS = `
/**
 * Pure utility: formats a currency amount as a locale string.
 * @param amount - The numeric amount to format.
 * @param currency - ISO 4217 currency code (e.g. "USD", "EUR").
 * @returns Formatted string, e.g. "$1,234.56".
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Validates that an amount is a positive finite number.
 * @param amount - Value to check.
 * @returns true when valid.
 */
export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}
`.trim();
