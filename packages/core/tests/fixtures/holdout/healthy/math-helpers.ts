/**
 * Mathematical helpers — pure functions, no side effects.
 */

/** Clamps value to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Returns base raised to the power of exponent using iterative multiplication. */
export function power(base: number, exponent: number): number {
  if (exponent === 0) return 1;
  let result = 1;
  const abs = Math.abs(exponent);
  for (let i = 0; i < abs; i++) {
    result *= base;
  }
  return exponent < 0 ? 1 / result : result;
}

/** Returns true when n is a prime number. */
export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/** Computes the greatest common divisor of two non-negative integers. */
export function gcd(a: number, b: number): number {
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

/** Rounds n to the given number of decimal places. */
export function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
