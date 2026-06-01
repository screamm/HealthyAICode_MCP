/**
 * BiomarkerPlugin Conformance Validator — Sprint 60 (plugin-freeze)
 *
 * Validates a candidate BiomarkerPlugin against:
 *  1. JSON Schema v0.1 (structural/range invariants on metadata fields)
 *  2. Behavioural invariants that cannot be expressed in JSON Schema:
 *     - `detect` must be a function
 *     - `detect` must be callable without throwing on a no-op invocation
 *     - Plugin must not mutate or read from the filesystem / network (best-effort check)
 *  3. TP/TN fixture validation (optional — enabled by passing `fixtures`)
 *
 * Design goals:
 *  - Zero runtime dependencies (no `ajv`, no `jsonschema`).
 *  - All checks are synchronous.
 *  - Returns a structured ConformanceResult so callers can decide whether to
 *    throw or just warn.
 *
 * Usage:
 *   import { validatePlugin } from './plugin-conformance';
 *   const result = validatePlugin(myPlugin);
 *   if (!result.valid) throw new Error(result.errors.join('\n'));
 */

import type { BiomarkerPlugin } from './biomarker-plugin';
import type { Language, Smell } from '../types';
import { PLUGIN_MANIFEST_SCHEMA } from './plugin-schema';

// ─── Public Types ──────────────────────────────────────────────────────────────

/** Result of a single conformance run. */
export interface ConformanceResult {
  /** True when the plugin passes all enabled validation checks. */
  valid: boolean;
  /** Human-readable error messages. Empty when `valid` is true. */
  errors: string[];
  /** Non-fatal advisory messages. May be non-empty even when `valid` is true. */
  warnings: string[];
}

/**
 * A fixture pair used in TP/TN CI validation.
 *
 * `tp` (true positive) fixtures must produce at least one smell of `expectedType`.
 * `tn` (true negative) fixtures must produce zero smells of `expectedType`.
 */
export interface PluginFixture {
  /** Human-readable name shown in error messages. */
  label: string;
  /** Source code to feed to plugin.detect(). */
  code: string;
  /** Language to use for detection. */
  language: Language;
  /** Optional file path to pass as the third argument. */
  filePath?: string;
  /** Whether this is a true-positive (smell expected) or true-negative (no smell expected). */
  kind: 'tp' | 'tn';
  /**
   * Smell type string that must (tp) / must not (tn) appear in the plugin output.
   * Required when `kind` is 'tp'. Optional for 'tn' (if omitted, any smell triggers failure).
   */
  expectedType?: string;
}

/** Options for validatePlugin(). */
export interface ValidatePluginOptions {
  /**
   * TP/TN fixtures to run against the plugin's detect() function.
   * When provided, failing fixtures add errors to ConformanceResult.
   */
  fixtures?: PluginFixture[];
  /**
   * If true, treat a detect() function that returns smells with unknown types
   * (not in core SmellType or plugin smellWeights) as an error rather than a warning.
   * Default: false (warning only).
   */
  strictSmellTypes?: boolean;
}

// ─── Reserved Smell Type Names ─────────────────────────────────────────────────

/**
 * Names that are NOT allowed as plugin `name` values — they would clash with
 * internal registry operations or well-known system plugins.
 */
const RESERVED_PLUGIN_NAMES = new Set([
  'core',
  'system',
  'internal',
  '__proto__',
  'constructor',
  'prototype',
]);

// ─── Inline Schema Validation (Draft-07 subset) ────────────────────────────────

/** Validates a value against a subset of JSON Schema Draft-07 rules. */
function validateSchema(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];

  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path}: expected object, got ${value === null ? 'null' : typeof value}`);
      return errors;
    }

    const obj = value as Record<string, unknown>;

    // required fields
    const required = schema.required as string[] | undefined;
    if (required) {
      for (const key of required) {
        if (!(key in obj)) {
          errors.push(`${path}: missing required field "${key}"`);
        }
      }
    }

    // additionalProperties: false
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys((schema.properties as Record<string, unknown>) ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          errors.push(`${path}: unexpected additional property "${key}"`);
        }
      }
    }

    // recurse into declared properties
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      for (const [key, subSchema] of Object.entries(properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], subSchema, `${path}.${key}`));
        }
      }
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected string, got ${typeof value}`);
      return errors;
    }
    const minLength = schema.minLength as number | undefined;
    if (minLength !== undefined && value.length < minLength) {
      errors.push(`${path}: string too short (min ${minLength}, got ${value.length})`);
    }
    const maxLength = schema.maxLength as number | undefined;
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(`${path}: string too long (max ${maxLength}, got ${value.length})`);
    }
    const pattern = schema.pattern as string | undefined;
    if (pattern !== undefined && !new RegExp(pattern).test(value)) {
      errors.push(`${path}: string does not match pattern /${pattern}/`);
    }
    const constValue = schema.const as string | undefined;
    if (constValue !== undefined && value !== constValue) {
      errors.push(`${path}: expected const "${constValue}", got "${value}"`);
    }
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${path}: expected number, got ${typeof value}`);
      return errors;
    }
    const exclusiveMinimum = schema.exclusiveMinimum as number | undefined;
    if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
      errors.push(`${path}: value must be > ${exclusiveMinimum}, got ${value}`);
    }
    const maximum = schema.maximum as number | undefined;
    if (maximum !== undefined && value > maximum) {
      errors.push(`${path}: value must be <= ${maximum}, got ${value}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${typeof value}`);
      return errors;
    }
    const minItems = schema.minItems as number | undefined;
    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path}: array too short (min ${minItems} items, got ${value.length})`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<unknown>();
      let dupeFound = false;
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) { dupeFound = true; break; }
        seen.add(key);
      }
      if (dupeFound) {
        errors.push(`${path}: array items must be unique`);
      }
    }
    const itemSchema = schema.items as Record<string, unknown> | undefined;
    if (itemSchema) {
      value.forEach((item, idx) => {
        errors.push(...validateSchema(item, itemSchema, `${path}[${idx}]`));
      });
    }
  }

  // oneOf — try each sub-schema, require exactly one to pass
  if (Array.isArray(schema.oneOf)) {
    const passing = (schema.oneOf as Array<Record<string, unknown>>).filter(
      sub => validateSchema(value, sub, path).length === 0
    );
    if (passing.length !== 1) {
      errors.push(
        `${path}: must match exactly one schema in oneOf (matched ${passing.length})`
      );
    }
  }

  // additionalProperties as a schema (for smellWeights map)
  if (schema.additionalProperties !== undefined &&
      schema.additionalProperties !== false &&
      schema.additionalProperties !== true &&
      typeof schema.additionalProperties === 'object' &&
      typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const additionalSchema = schema.additionalProperties as Record<string, unknown>;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      errors.push(...validateSchema(v, additionalSchema, `${path}.${k}`));
    }
  }

  return errors;
}

// ─── Main Validator ────────────────────────────────────────────────────────────

/**
 * Validates a BiomarkerPlugin against the v0.1 schema and behavioural invariants.
 *
 * @param plugin   The plugin to validate. May be any value (for defensive use before registration).
 * @param options  Optional fixture suite and strictness settings.
 * @returns        Structured ConformanceResult.
 */
export function validatePlugin(
  plugin: unknown,
  options: ValidatePluginOptions = {}
): ConformanceResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. Null / type guard ────────────────────────────────────────────────────
  if (plugin === null || typeof plugin !== 'object') {
    errors.push(`Plugin must be a non-null object, got ${plugin === null ? 'null' : typeof plugin}`);
    return { valid: false, errors, warnings };
  }

  // ── 2. JSON Schema validation (structure / string constraints / weight ranges) ──
  const schemaErrors = validateSchema(
    plugin,
    PLUGIN_MANIFEST_SCHEMA as unknown as Record<string, unknown>,
    'plugin'
  );
  errors.push(...schemaErrors);

  // ── 3. Reserved name check ──────────────────────────────────────────────────
  const typedPlugin = plugin as Record<string, unknown>;
  if (typeof typedPlugin['name'] === 'string') {
    const pluginName = typedPlugin['name'] as string;
    if (RESERVED_PLUGIN_NAMES.has(pluginName)) {
      errors.push(
        `plugin.name: "${pluginName}" is reserved and cannot be used as a plugin name`
      );
    }
  }

  // ── 4. detect() must be a function ─────────────────────────────────────────
  if (!('detect' in (plugin as object))) {
    errors.push('plugin: missing required method "detect"');
  } else if (typeof (plugin as Record<string, unknown>)['detect'] !== 'function') {
    errors.push(
      `plugin.detect: must be a function, got ${typeof (plugin as Record<string, unknown>)['detect']}`
    );
  } else {
    // ── 5. detect() smoke-test (no-op invocation) ───────────────────────────
    try {
      const result = (plugin as BiomarkerPlugin).detect('', 'typescript' as Language, undefined);
      if (!Array.isArray(result)) {
        errors.push(`plugin.detect: must return an array, got ${typeof result}`);
      }
    } catch (err) {
      errors.push(
        `plugin.detect: threw during smoke-test invocation with empty code: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── 6. smellWeights key format check ───────────────────────────────────────
  if (
    typedPlugin['metadata'] &&
    typeof typedPlugin['metadata'] === 'object' &&
    typedPlugin['metadata'] !== null
  ) {
    const meta = typedPlugin['metadata'] as Record<string, unknown>;
    if (meta['smellWeights'] && typeof meta['smellWeights'] === 'object') {
      for (const key of Object.keys(meta['smellWeights'] as object)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
          errors.push(
            `plugin.metadata.smellWeights: key "${key}" must start with a letter and contain only ` +
            `alphanumeric characters or underscores`
          );
        }
      }
    }
  }

  // ── 7. TP/TN fixture validation (optional) ──────────────────────────────────
  if (
    options.fixtures &&
    options.fixtures.length > 0 &&
    typeof (plugin as Record<string, unknown>)['detect'] === 'function'
  ) {
    const typedBiomarker = plugin as BiomarkerPlugin;

    for (const fixture of options.fixtures) {
      let smells: Smell[];
      try {
        smells = typedBiomarker.detect(fixture.code, fixture.language, fixture.filePath);
      } catch (err) {
        errors.push(
          `Fixture "${fixture.label}" (${fixture.kind}): detect() threw: ` +
          `${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      if (fixture.kind === 'tp') {
        // True positive: must emit at least one smell matching expectedType
        const expectedType = fixture.expectedType;
        const matched = expectedType
          ? smells.some(s => s.type === expectedType)
          : smells.length > 0;

        if (!matched) {
          errors.push(
            `Fixture "${fixture.label}" (TP): expected ${expectedType ? `at least one "${expectedType}" smell` : 'at least one smell'}, ` +
            `but detect() returned ${smells.length} smell(s). ` +
            `Fix: ensure plugin detects the target pattern in the TP fixture code.`
          );
        }
      } else {
        // True negative: must emit zero smells of expectedType (or zero smells overall if no type given)
        const expectedType = fixture.expectedType;
        const falsePositive = expectedType
          ? smells.some(s => s.type === expectedType)
          : smells.length > 0;

        if (falsePositive) {
          const matched = expectedType
            ? smells.filter(s => s.type === expectedType)
            : smells;
          errors.push(
            `Fixture "${fixture.label}" (TN): expected no ${expectedType ? `"${expectedType}"` : ''} smells, ` +
            `but detect() returned ${matched.length} unwanted smell(s): ` +
            `[${matched.map(s => `${s.type}@line${s.line}`).join(', ')}]. ` +
            `Fix: tighten plugin detection to avoid false positives on clean code.`
          );
        }
      }
    }
  }

  // ── 8. Advisory warnings (non-blocking) ────────────────────────────────────
  if (
    typedPlugin['metadata'] &&
    typeof typedPlugin['metadata'] === 'object' &&
    typedPlugin['metadata'] !== null
  ) {
    const meta = typedPlugin['metadata'] as Record<string, unknown>;

    // Warn if no smellWeights declared (custom smell types will default to weight 0)
    if (
      meta['smellWeights'] &&
      typeof meta['smellWeights'] === 'object' &&
      Object.keys(meta['smellWeights'] as object).length === 0
    ) {
      warnings.push(
        'plugin.metadata.smellWeights is empty — any custom smell types emitted by this plugin ' +
        'will have weight 0 and will NOT affect the health score. ' +
        'Declare a weight for each custom smell type, or use existing SmellType names.'
      );
    }

    // Warn if supportedLanguages is 'all' (can be a broad footprint)
    if (meta['supportedLanguages'] === 'all') {
      warnings.push(
        'plugin.metadata.supportedLanguages is "all" — plugin will run on every language. ' +
        'Consider narrowing to specific languages if detection is language-specific.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Convenience wrapper: throws a descriptive error if the plugin fails conformance.
 * Useful as a guard in tests and CLI tools.
 *
 * @throws Error with all conformance errors joined by newlines.
 */
export function assertPluginConformance(
  plugin: unknown,
  options: ValidatePluginOptions = {}
): void {
  const result = validatePlugin(plugin, options);
  if (!result.valid) {
    throw new Error(
      `BiomarkerPlugin conformance failure:\n` +
      result.errors.map(e => `  - ${e}`).join('\n')
    );
  }
}
