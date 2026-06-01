/**
 * Array utility helpers — typed, functional, single-responsibility.
 */

/** Returns the first element of an array, or undefined for empty arrays. */
export function first<T>(items: T[]): T | undefined {
  return items[0];
}

/** Returns the last element of an array, or undefined for empty arrays. */
export function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

/** Removes duplicate values from an array while preserving insertion order. */
export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Splits an array into chunks of the given size. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** Returns the sum of all numbers in the array. */
export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Returns the arithmetic mean of the array, or 0 for empty arrays. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}
