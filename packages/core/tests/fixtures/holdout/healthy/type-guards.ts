/**
 * Runtime type-guard helpers — narrow unknown values safely.
 */

/** Returns true when value is a non-null object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns true when value is a string. */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Returns true when value is a finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Returns true when value is a boolean. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Returns true when value is an array. */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Asserts that a value is never reached.
 * Useful for exhaustive switch statements.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
