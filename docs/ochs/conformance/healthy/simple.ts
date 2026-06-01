/**
 * Healthy fixture — expected score: 10.0 (no smells)
 * All functions are short, low complexity, minimal nesting.
 */

/** Returns the sum of two numbers. */
export function add(a: number, b: number): number {
  return a + b;
}

/** Returns the difference between two numbers. */
export function subtract(a: number, b: number): number {
  return a - b;
}

/** Returns the product of two numbers. */
export function multiply(a: number, b: number): number {
  return a * b;
}

/** Returns a greeting string for the given name. */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/** Returns true if n is greater than zero. */
export function isPositive(n: number): boolean {
  return n > 0;
}

/** Returns the maximum of two numbers. */
export function max(a: number, b: number): number {
  return a > b ? a : b;
}

/** Converts a string to upper case. */
export function toUpperCase(str: string): string {
  return str.toUpperCase();
}
