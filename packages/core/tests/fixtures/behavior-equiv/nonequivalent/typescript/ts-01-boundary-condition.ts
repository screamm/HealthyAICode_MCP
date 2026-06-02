// pair: ts-01-boundary-condition
// expected: divergent
// bugClass: boundary-condition
// description: inRange: inclusive upper bound <= becomes exclusive <; exact upper value excluded.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(x: number, lo: number, hi: number): boolean {
  // Correct: both bounds inclusive
  return x >= lo && x <= hi;
}

export function after(x: number, lo: number, hi: number): boolean {
  // BUG: upper bound now exclusive — hi itself is excluded
  return x >= lo && x < hi;
}

// Divergence witness: before(10, 0, 10) === true, after(10, 0, 10) === false
