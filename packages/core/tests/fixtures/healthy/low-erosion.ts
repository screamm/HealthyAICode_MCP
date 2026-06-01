/**
 * Healthy fixture — low ComplexityMassConcentration (Structural Erosion Index)
 *
 * All functions have CC ≤ 8, so no function qualifies as a "high CC" mass contributor.
 * erosion = 0 → null (no smell).
 */

export function addNumbers(a: number, b: number): number {
  return a + b;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function categorise(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function formatList(items: string[]): string {
  if (items.length === 0) return '(empty)';
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(', ');
  return `${rest} and ${last}`;
}
